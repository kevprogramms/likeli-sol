// lib/manifold/multi-bet.ts
// Multi-Bet Operations (Section 4)
// Place bets on multiple answers simultaneously

import { Bet, Answer, Contract } from './types';
import { calculateCpmmPurchase, getCpmmProbability, generateId } from './cpmm';
import { getContract, saveContract, addBet, getOrCreateMetric, updateMetric, updateUserBalance, getOrCreateUser } from './store';
import { placeArbitrageBet } from './arbitrage';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface PlaceMultiBetParams {
    contractId: string;
    answerIds: string[];    // Answers to bet YES on
    amount: number;         // Total amount to split
    userId: string;
}

export interface PlaceMultiBetResult {
    success: boolean;
    error?: string;
    bets: Bet[];
    totalSpent: number;
    newBalance?: number;
}

export interface MultiSellParams {
    contractId: string;
    answerIds: string[];    // Answers to sell
    userId: string;
}

export interface MultiSellResult {
    success: boolean;
    error?: string;
    bets: Bet[];
    totalPayout: number;
    newBalance?: number;
}

// ============================================
// PLACE MULTI YES BETS (Section 4.1)
// ============================================

/**
 * Place YES bets on multiple answers simultaneously.
 * Splits the amount evenly across all selected answers.
 */
export function placeMultiBet(params: PlaceMultiBetParams): PlaceMultiBetResult {
    const { contractId, answerIds, amount, userId } = params;

    // Validate
    if (amount <= 0) {
        return { success: false, error: 'Amount must be positive', bets: [], totalSpent: 0 };
    }
    if (answerIds.length === 0) {
        return { success: false, error: 'Must select at least one answer', bets: [], totalSpent: 0 };
    }

    const contract = getContract(contractId);
    if (!contract) {
        return { success: false, error: 'Contract not found', bets: [], totalSpent: 0 };
    }

    if (!contract.answers || contract.answers.length < 2) {
        return { success: false, error: 'Not a multi-choice market', bets: [], totalSpent: 0 };
    }

    // Check user balance
    const user = getOrCreateUser(userId);
    if (user.balance < amount) {
        return { success: false, error: 'Insufficient balance', bets: [], totalSpent: 0 };
    }

    // Find selected answers
    const selectedAnswers = contract.answers.filter(a => answerIds.includes(a.id));
    if (selectedAnswers.length !== answerIds.length) {
        return { success: false, error: 'Some answers not found', bets: [], totalSpent: 0 };
    }

    // Split amount evenly
    const amountPerAnswer = amount / selectedAnswers.length;
    const now = Date.now();
    const bets: Bet[] = [];
    let totalSpent = 0;

    // Place YES bet on each selected answer
    for (const answer of selectedAnswers) {
        const pool = { YES: answer.poolYes, NO: answer.poolNo };
        const { shares, newPool, probBefore, probAfter } = calculateCpmmPurchase(pool, amountPerAnswer, 'YES');

        // Update answer pool
        answer.poolYes = newPool.YES;
        answer.poolNo = newPool.NO;
        answer.prob = getCpmmProbability(newPool);
        answer.volume += amountPerAnswer;

        // Create bet record
        const bet: Bet = {
            id: generateId(),
            userId,
            contractId,
            answerId: answer.id,
            amount: amountPerAnswer,
            shares,
            outcome: 'YES',
            probBefore,
            probAfter,
            createdTime: now,
            isRedemption: false,
            isFilled: true,
            isCancelled: false
        };

        addBet(contractId, bet);
        bets.push(bet);
        totalSpent += amountPerAnswer;

        // Update user metrics
        const metric = getOrCreateMetric(userId, contractId, answer.id);
        metric.totalSharesYes += shares;
        metric.hasYesShares = true;
        metric.invested += amountPerAnswer;
        updateMetric(metric);
    }

    // Update user balance
    updateUserBalance(userId, -totalSpent);

    // Update contract stats
    contract.volume += totalSpent;
    contract.lastBetTime = now;
    contract.lastUpdatedTime = now;
    saveContract(contract);

    return {
        success: true,
        bets,
        totalSpent,
        newBalance: user.balance - totalSpent
    };
}

// ============================================
// SELL MULTIPLE POSITIONS (Section 4.2)
// ============================================

/**
 * Sell positions across multiple answers.
 * Sells ALL shares in each selected answer.
 */
export function multiSell(params: MultiSellParams): MultiSellResult {
    const { contractId, answerIds, userId } = params;

    if (answerIds.length === 0) {
        return { success: false, error: 'Must select at least one answer', bets: [], totalPayout: 0 };
    }

    const contract = getContract(contractId);
    if (!contract) {
        return { success: false, error: 'Contract not found', bets: [], totalPayout: 0 };
    }

    if (!contract.answers || contract.answers.length < 2) {
        return { success: false, error: 'Not a multi-choice market', bets: [], totalPayout: 0 };
    }

    if (contract.resolution) {
        return { success: false, error: 'Market already resolved', bets: [], totalPayout: 0 };
    }

    const user = getOrCreateUser(userId);
    const now = Date.now();
    const bets: Bet[] = [];
    let totalPayout = 0;

    // Sell each answer position
    for (const answerId of answerIds) {
        const answer = contract.answers.find(a => a.id === answerId);
        if (!answer) continue;

        const metric = getOrCreateMetric(userId, contractId, answerId);

        // Calculate total shares to sell (YES + NO, whichever is positive)
        const yesShares = metric.totalSharesYes;
        const noShares = metric.totalSharesNo;

        // Sell YES shares if any
        if (yesShares > 0) {
            const pool = { YES: answer.poolYes, NO: answer.poolNo };
            const k = pool.YES * pool.NO;
            const probBefore = getCpmmProbability(pool);

            // SELL formula: shares go back to pool, money comes out
            const newY = pool.YES + yesShares;
            const newN = k / newY;
            const payout = pool.NO - newN;

            answer.poolYes = newY;
            answer.poolNo = newN;
            answer.prob = getCpmmProbability({ YES: newY, NO: newN });

            const probAfter = answer.prob;

            // Create sell bet (negative amounts)
            const bet: Bet = {
                id: generateId(),
                userId,
                contractId,
                answerId,
                amount: -payout,
                shares: -yesShares,
                outcome: 'YES',
                probBefore,
                probAfter,
                createdTime: now,
                isRedemption: false,
                isFilled: true,
                isCancelled: false
            };

            addBet(contractId, bet);
            bets.push(bet);
            totalPayout += payout;

            // Update metric
            metric.totalSharesYes = 0;
            metric.hasYesShares = false;
        }

        // Sell NO shares if any
        if (noShares > 0) {
            const pool = { YES: answer.poolYes, NO: answer.poolNo };
            const k = pool.YES * pool.NO;
            const probBefore = getCpmmProbability(pool);

            const newN = pool.NO + noShares;
            const newY = k / newN;
            const payout = pool.YES - newY;

            answer.poolYes = newY;
            answer.poolNo = newN;
            answer.prob = getCpmmProbability({ YES: newY, NO: newN });

            const probAfter = answer.prob;

            const bet: Bet = {
                id: generateId(),
                userId,
                contractId,
                answerId,
                amount: -payout,
                shares: -noShares,
                outcome: 'NO',
                probBefore,
                probAfter,
                createdTime: now,
                isRedemption: false,
                isFilled: true,
                isCancelled: false
            };

            addBet(contractId, bet);
            bets.push(bet);
            totalPayout += payout;

            metric.totalSharesNo = 0;
            metric.hasNoShares = false;
        }

        updateMetric(metric);
    }

    // Update user balance with payout
    updateUserBalance(userId, totalPayout);

    // Update contract
    contract.volume += totalPayout;
    contract.lastBetTime = now;
    contract.lastUpdatedTime = now;
    saveContract(contract);

    return {
        success: true,
        bets,
        totalPayout,
        newBalance: user.balance + totalPayout
    };
}
