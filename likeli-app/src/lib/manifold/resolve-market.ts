// lib/manifold/resolve-market.ts
// Market Resolution & Payouts - 100% Manifold Match

import { Contract, ContractMetric, Resolution } from './types';
import { getContract, saveContract, getMetricsForContract, updateUserBalance, updateMetric } from './store';

// ============================================
// RESOLVE MARKET - MAIN FUNCTION
// ============================================

export interface ResolveMarketParams {
    contractId: string;
    resolution: Resolution;
    resolutionProbability?: number;  // For MKT resolution (0-1)
    resolverId: string;
    answerId?: string;  // For multi-choice
}

export interface Payout {
    userId: string;
    amount: number;
}

export interface ResolveMarketResult {
    success: boolean;
    error?: string;
    payouts?: Payout[];
}

/**
 * Resolve a market and calculate payouts
 */
export function resolveMarket(params: ResolveMarketParams): ResolveMarketResult {
    const { contractId, resolution, resolutionProbability, resolverId, answerId } = params;

    // 1. Get contract
    const contract = getContract(contractId);
    if (!contract) {
        return { success: false, error: 'Contract not found' };
    }

    if (contract.resolution) {
        return { success: false, error: 'Already resolved' };
    }

    // 2. Verify resolver is creator
    if (contract.creatorId !== resolverId) {
        return { success: false, error: 'Only creator can resolve' };
    }

    // 3. Get all positions
    const metrics = getMetricsForContract(contractId);
    const positions = metrics.filter(m =>
        m.totalSharesYes > 0 || m.totalSharesNo > 0
    );

    // 4. For multi-choice, handle answer resolution
    if (contract.outcomeType === 'MULTIPLE_CHOICE' && answerId) {
        const answer = contract.answers?.find(a => a.id === answerId);
        if (!answer) {
            return { success: false, error: 'Answer not found' };
        }
        answer.resolution = resolution;
        answer.resolutionTime = Date.now();
    }

    // 5. Calculate payouts
    const payouts = calculatePayouts(positions, resolution, resolutionProbability);

    // 6. Update user balances
    for (const payout of payouts) {
        if (payout.amount > 0) {
            updateUserBalance(payout.userId, payout.amount);
        }
    }

    // 7. Update contract as resolved
    contract.resolution = resolution;
    contract.resolutionProbability = resolutionProbability;
    contract.resolutionTime = Date.now();
    contract.lastUpdatedTime = Date.now();
    saveContract(contract);

    // 8. Update user metrics with payout info
    for (const payout of payouts) {
        const position = positions.find(p => p.userId === payout.userId);
        if (position) {
            const invested = position.invested || 0;
            const profit = payout.amount - invested;
            position.payout = payout.amount;
            position.profit = profit;
            updateMetric(position);
        }
    }

    return {
        success: true,
        payouts
    };
}

/**
 * Calculate payouts based on resolution
 */
function calculatePayouts(
    positions: ContractMetric[],
    resolution: Resolution,
    resolutionProbability?: number
): Payout[] {
    return positions.map(position => {
        const yesShares = position.totalSharesYes || 0;
        const noShares = position.totalSharesNo || 0;

        let payout = 0;

        switch (resolution) {
            case 'YES':
                // YES wins: Each YES share worth $1
                payout = yesShares;
                break;

            case 'NO':
                // NO wins: Each NO share worth $1
                payout = noShares;
                break;

            case 'MKT':
                // Market resolution: Probabilistic payout
                const prob = resolutionProbability ?? 0.5;
                payout = yesShares * prob + noShares * (1 - prob);
                break;

            case 'CANCEL':
                // Cancel: Refund invested amount
                payout = position.invested || 0;
                break;
        }

        return {
            userId: position.userId,
            amount: payout
        };
    }).filter(p => p.amount > 0);
}

/**
 * Check if market can be resolved
 */
export function canResolve(contractId: string, userId: string): boolean {
    const contract = getContract(contractId);
    if (!contract) return false;
    if (contract.resolution) return false;
    if (contract.creatorId !== userId) return false;
    return true;
}
