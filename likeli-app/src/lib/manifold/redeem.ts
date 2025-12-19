// lib/manifold/redeem.ts
// Redemption System - Auto-convert YES+NO share pairs to cash
// CRITICAL: Called after every bet to keep positions clean
// 100% Manifold Match (WITHOUT LOANS)

import { Bet, ContractMetric, Contract } from './types';
import { generateId, getCpmmProbability } from './cpmm';
import { getOrCreateMetric, updateMetric, addBet, updateUserBalance } from './store';

// ============================================
// CORE CALCULATION (Section 1.1)
// ============================================

/**
 * Calculate how many shares can be redeemed from a user's position.
 * 
 * Redeemable amount = min(yesShares, noShares)
 * This many pairs can be converted to cash.
 */
export function getBinaryRedeemableAmountFromContractMetric(
    contractMetric: ContractMetric
): { shares: number; netAmount: number } {
    const yesShares = contractMetric.totalSharesYes ?? 0;
    const noShares = contractMetric.totalSharesNo ?? 0;

    // Redeemable shares = minimum of YES and NO (pairs we can redeem)
    const shares = Math.max(Math.min(yesShares, noShares), 0);

    // Each redeemed pair is worth $1
    const netAmount = shares;

    return { shares, netAmount };
}

// Alias for backwards compatibility
export const getBinaryRedeemableAmount = getBinaryRedeemableAmountFromContractMetric;

// ============================================
// CREATE REDEMPTION BETS (Section 1.2)
// ============================================

/**
 * Create the bet records for a redemption.
 * These are "virtual" bets that reduce both YES and NO shares equally.
 * Creates TWO bet records (one YES, one NO) with negative shares.
 */
export function getRedemptionBets(
    contract: Contract | { id: string },
    shares: number,         // Number of pairs being redeemed
    prob: number,           // Current probability
    answerId: string | undefined,
    userId: string
): Bet[] {
    const createdTime = Date.now();

    // YES redemption bet
    const yesBet: Bet = {
        id: generateId(),
        userId,
        contractId: contract.id,
        amount: prob * -shares,           // Negative because redeeming
        shares: -shares,                  // Negative shares = removing position
        outcome: 'YES',
        probBefore: prob,
        probAfter: prob,                  // Probability doesn't change
        createdTime,
        isRedemption: true,               // KEY FLAG
        isFilled: true,
        isCancelled: false,
        answerId,
    };

    // NO redemption bet
    const noBet: Bet = {
        id: generateId(),
        userId,
        contractId: contract.id,
        amount: (1 - prob) * -shares,
        shares: -shares,
        outcome: 'NO',
        probBefore: prob,
        probAfter: prob,
        createdTime,
        isRedemption: true,
        isFilled: true,
        isCancelled: false,
        answerId,
    };

    return [yesBet, noBet];
}

// Alias for backwards compatibility
export const createRedemptionBets = (
    contractId: string,
    shares: number,
    prob: number,
    answerId: string | undefined,
    userId: string
) => getRedemptionBets({ id: contractId }, shares, prob, answerId, userId);

// ============================================
// EXECUTE REDEMPTION (Section 1.3)
// ============================================

export interface RedeemResult {
    redeemed: boolean;
    betsToInsert: Bet[];
    balanceUpdates: { userId: string; amount: number }[];
    shares: number;
    amount: number;
    redemptionBets: Bet[];
}

/**
 * Check if users have redeemable shares and create redemption bets.
 * Called after every bet placement.
 */
export function redeemShares(
    userIds: string[],
    contract: Contract | { id: string },
    newBets: Bet[],
    contractMetrics: ContractMetric[]
): RedeemResult {
    const betsToInsert: Bet[] = [];
    const balanceUpdates: { userId: string; amount: number }[] = [];

    if (!userIds.length) {
        return {
            redeemed: false,
            betsToInsert,
            balanceUpdates,
            shares: 0,
            amount: 0,
            redemptionBets: []
        };
    }

    let totalShares = 0;
    let totalAmount = 0;

    for (const userId of userIds) {
        let totalAmountRedeemed = 0;

        for (const metric of contractMetrics.filter(m => m.userId === userId)) {
            const newUsersBets = newBets.filter(
                b => b.answerId === metric.answerId && b.userId === userId
            );
            if (!newUsersBets.length) continue;

            const { shares, netAmount } = getBinaryRedeemableAmountFromContractMetric(metric);

            if (shares < 0.0001) continue;

            if (!isFinite(netAmount)) {
                console.error('Invalid redemption amount');
                continue;
            }

            totalAmountRedeemed += netAmount;
            totalShares += shares;
            const answerId = metric.answerId ?? undefined;

            const sortedBets = [...newUsersBets].sort((a, b) => b.createdTime - a.createdTime);
            const lastProb = sortedBets[0].probAfter;

            const redemptionBets = getRedemptionBets(
                contract,
                shares,
                lastProb,
                answerId,
                userId
            );
            betsToInsert.push(...redemptionBets);

            metric.totalSharesYes -= shares;
            metric.totalSharesNo -= shares;
            metric.hasYesShares = metric.totalSharesYes > 0;
            metric.hasNoShares = metric.totalSharesNo > 0;
            updateMetric(metric);

            console.log('[Redemption] Redeeming shares:', { shares, netAmount, answerId, userId });
        }

        if (totalAmountRedeemed !== 0) {
            balanceUpdates.push({ userId, amount: totalAmountRedeemed });
            updateUserBalance(userId, totalAmountRedeemed);
            totalAmount += totalAmountRedeemed;
        }
    }

    for (const bet of betsToInsert) {
        addBet(bet.contractId, bet);
    }

    return {
        redeemed: betsToInsert.length > 0,
        betsToInsert,
        balanceUpdates,
        shares: totalShares,
        amount: totalAmount,
        redemptionBets: betsToInsert
    };
}

/**
 * Simpler version for single user after a bet
 */
export function executeRedemption(
    userId: string,
    contractId: string,
    currentProb: number,
    answerId?: string
): RedeemResult {
    const metric = getOrCreateMetric(userId, contractId, answerId);
    const { shares, netAmount } = getBinaryRedeemableAmountFromContractMetric(metric);

    if (shares < 0.01) {
        return {
            redeemed: false,
            betsToInsert: [],
            balanceUpdates: [],
            shares: 0,
            amount: 0,
            redemptionBets: []
        };
    }

    console.log(`[Redemption] User ${userId} redeeming ${shares.toFixed(2)} pairs for $${netAmount.toFixed(2)}`);

    const redemptionBets = getRedemptionBets(
        { id: contractId },
        shares,
        currentProb,
        answerId,
        userId
    );

    for (const bet of redemptionBets) {
        addBet(contractId, bet);
    }

    updateUserBalance(userId, netAmount);

    metric.totalSharesYes -= shares;
    metric.totalSharesNo -= shares;
    metric.hasYesShares = metric.totalSharesYes > 0;
    metric.hasNoShares = metric.totalSharesNo > 0;
    updateMetric(metric);

    return {
        redeemed: true,
        betsToInsert: redemptionBets,
        balanceUpdates: [{ userId, amount: netAmount }],
        shares,
        amount: netAmount,
        redemptionBets
    };
}

/**
 * Check and redeem for multiple users
 */
export function redeemSharesForUsers(
    userIds: string[],
    contractId: string,
    currentProb: number,
    answerId?: string
): RedeemResult[] {
    return userIds.map(userId =>
        executeRedemption(userId, contractId, currentProb, answerId)
    );
}
