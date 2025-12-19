// lib/manifold/store.ts
// In-memory store for sandbox markets (replaces database)
// Uses global to persist across hot reloads in development

import { Pool, Contract, Answer, Bet, ContractMetric, User, Resolution } from './types';
import { generateId } from './cpmm';

// ============================================
// GLOBAL STORES (Persist across hot reloads)
// ============================================

// Declare global types for TypeScript
declare global {
    var manifoldContracts: Map<string, Contract> | undefined;
    var manifoldUsers: Map<string, User> | undefined;
    var manifoldBets: Map<string, Bet[]> | undefined;
    var manifoldMetrics: Map<string, ContractMetric[]> | undefined;
    var manifoldPriceHistory: Map<string, { timestamp: number; probability: number }[]> | undefined;
}

// Use globalThis to persist data across hot reloads in development
export const contracts = globalThis.manifoldContracts ?? new Map<string, Contract>();
globalThis.manifoldContracts = contracts;

export const users = globalThis.manifoldUsers ?? new Map<string, User>();
globalThis.manifoldUsers = users;

export const bets = globalThis.manifoldBets ?? new Map<string, Bet[]>();
globalThis.manifoldBets = bets;

export const metrics = globalThis.manifoldMetrics ?? new Map<string, ContractMetric[]>();
globalThis.manifoldMetrics = metrics;

const priceHistory = globalThis.manifoldPriceHistory ?? new Map<string, { timestamp: number; probability: number }[]>();
globalThis.manifoldPriceHistory = priceHistory;

// ============================================
// USER OPERATIONS
// ============================================

export function getOrCreateUser(userId: string): User {
    let user = users.get(userId);
    if (!user) {
        user = {
            id: userId,
            username: userId,
            name: userId,
            balance: 10000, // Starting balance
            totalDeposits: 0,
            createdTime: Date.now()
        };
        users.set(userId, user);
    }
    return user;
}

export function updateUserBalance(userId: string, delta: number): User {
    const user = getOrCreateUser(userId);
    user.balance += delta;
    return user;
}

export function getUserBalance(userId: string): number {
    return getOrCreateUser(userId).balance;
}

// ============================================
// CONTRACT OPERATIONS
// ============================================

export function saveContract(contract: Contract): void {
    contracts.set(contract.id, contract);
    console.log(`[Store] Saved contract ${contract.id}, total contracts: ${contracts.size}`);
}

export function getContract(contractId: string): Contract | undefined {
    const contract = contracts.get(contractId);
    console.log(`[Store] Getting contract ${contractId}, found: ${!!contract}, total contracts: ${contracts.size}`);
    return contract;
}

export function getAllContracts(): Contract[] {
    console.log(`[Store] Getting all contracts, total: ${contracts.size}`);
    return Array.from(contracts.values());
}

// ============================================
// BET OPERATIONS
// ============================================

export function addBet(contractId: string, bet: Bet): void {
    const contractBets = bets.get(contractId) || [];
    contractBets.push(bet);
    bets.set(contractId, contractBets);
}

export function getBets(contractId: string): Bet[] {
    return bets.get(contractId) || [];
}

// ============================================
// POSITION (METRICS) OPERATIONS  
// ============================================

export function getOrCreateMetric(
    userId: string,
    contractId: string,
    answerId?: string
): ContractMetric {
    const contractMetrics = metrics.get(contractId) || [];

    let metric = contractMetrics.find(m =>
        m.userId === userId &&
        (answerId ? m.answerId === answerId : !m.answerId)
    );

    if (!metric) {
        metric = {
            id: generateId(),
            userId,
            contractId,
            answerId,
            hasYesShares: false,
            hasNoShares: false,
            totalSharesYes: 0,
            totalSharesNo: 0,
            invested: 0,
            payout: 0,
            profit: 0
        };
        contractMetrics.push(metric);
        metrics.set(contractId, contractMetrics);
    }

    return metric;
}

export function updateMetric(metric: ContractMetric): void {
    const contractMetrics = metrics.get(metric.contractId) || [];
    const idx = contractMetrics.findIndex(m => m.id === metric.id);
    if (idx >= 0) {
        contractMetrics[idx] = metric;
    } else {
        contractMetrics.push(metric);
    }
    metrics.set(metric.contractId, contractMetrics);
}

export function getMetricsForContract(contractId: string): ContractMetric[] {
    return metrics.get(contractId) || [];
}

export function getUserMetrics(userId: string): ContractMetric[] {
    const allMetrics: ContractMetric[] = [];
    metrics.forEach(contractMetrics => {
        contractMetrics.forEach(m => {
            if (m.userId === userId && (m.totalSharesYes > 0 || m.totalSharesNo > 0)) {
                allMetrics.push(m);
            }
        });
    });
    return allMetrics;
}

// ============================================
// PRICE HISTORY
// ============================================

export function addPricePoint(contractId: string, probability: number): void {
    const history = priceHistory.get(contractId) || [];
    history.push({ timestamp: Date.now(), probability });
    priceHistory.set(contractId, history);
}

export function getStorePricePoints(contractId: string): { timestamp: number; probability: number }[] {
    return priceHistory.get(contractId) || [];
}

// ============================================
// PER-ANSWER PRICE HISTORY (for multi-choice)
// ============================================

export function addAnswerPricePoint(contractId: string, answerId: string, probability: number): void {
    const key = `${contractId}:${answerId}`;
    const history = priceHistory.get(key) || [];
    history.push({ timestamp: Date.now(), probability });
    priceHistory.set(key, history);
}

export function getAnswerPricePoints(contractId: string, answerId: string): { timestamp: number; probability: number }[] {
    return priceHistory.get(`${contractId}:${answerId}`) || [];
}

