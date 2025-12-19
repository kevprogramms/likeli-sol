// lib/manifold/calculate-metrics.ts
// EXACT MANIFOLD COPY - Contract metrics calculations for P/L tracking

import { sumBy, sum, orderBy } from 'lodash';
import { floatingEqual } from './util/math';

// ============================================
// TYPES
// ============================================

export interface ContractMetric {
    id?: string;
    contractId: string;
    userId: string;
    answerId?: string | null;

    // Investment tracking
    invested: number;
    loan: number;
    payout: number;
    profit: number;
    profitPercent: number;

    // Shares held
    totalShares: { [outcome: string]: number };
    totalSpent?: { [outcome: string]: number };
    hasShares: boolean;
    hasYesShares: boolean;
    hasNoShares: boolean;
    maxSharesOutcome: string | null;

    // Tracking
    lastBetTime: number;
    lastProb?: number | null;
    totalAmountInvested?: number;
    totalAmountSold?: number;

    // Period changes
    from?: {
        [period: string]: {
            profit: number;
            profitPercent: number;
            invested: number;
            prevValue: number;
            value: number;
        }
    };
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Calculate payout from both YES and NO shares at a given probability.
 * Since YES + NO shares can be redeemed for 1 mana, having both shares
 * means you have guaranteed value from the min(yesShares, noShares) pairs
 * plus the expected value of remaining shares.
 *
 * This simplifies to: yesShares * prob + noShares * (1 - prob)
 */
export const calculatePayoutFromShares = (
    totalShares: { [outcome: string]: number },
    prob: number
) => {
    const yesShares = totalShares['YES'] ?? 0;
    const noShares = totalShares['NO'] ?? 0;
    return yesShares * prob + noShares * (1 - prob);
};

export const computeInvestmentValueCustomProb = (
    bets: Array<{ outcome: string; shares: number }>,
    p: number
) => {
    return sumBy(bets, (bet) => {
        const { outcome, shares } = bet;
        const betP = outcome === 'YES' ? p : 1 - p;
        const value = betP * shares;
        if (isNaN(value)) return 0;
        return value;
    });
};

export const getDefaultMetric = (
    userId: string,
    contractId: string,
    answerId: string | null
): Omit<ContractMetric, 'id'> => ({
    userId,
    contractId,
    answerId,
    loan: 0,
    invested: 0,
    totalShares: { NO: 0, YES: 0 },
    totalSpent: { NO: 0, YES: 0 },
    payout: 0,
    profit: 0,
    profitPercent: 0,
    hasNoShares: false,
    hasShares: false,
    hasYesShares: false,
    maxSharesOutcome: null,
    lastBetTime: 0,
    from: undefined,
    totalAmountInvested: 0,
    totalAmountSold: 0,
    lastProb: null,
});

// Produced from 0 filled limit orders
export const isEmptyMetric = (m: ContractMetric) => {
    return (
        m.profit === 0 &&
        m.invested === 0 &&
        m.loan === 0 &&
        m.payout === 0 &&
        !m.hasShares &&
        sum(Object.values(m.totalSpent ?? {})) === 0
    );
};

// ============================================
// CALCULATE METRICS FROM BETS
// ============================================

export type MarginalBet = {
    userId: string;
    answerId?: string;
    contractId: string;
    amount: number;
    shares: number;
    outcome: string;
    createdTime: number;
    loanAmount?: number;
    isRedemption?: boolean;
    probAfter: number;
};

export const calculateTotalSpentAndShares = (
    bets: MarginalBet[],
    initialTotalSpent: { [key: string]: number } = {},
    initialTotalShares: { [key: string]: number } = {}
) => {
    const totalSpent = { ...initialTotalSpent };
    const totalShares = { ...initialTotalShares };

    for (const bet of bets) {
        const { outcome, amount, shares, isRedemption } = bet;

        if (!isRedemption && amount > 0) {
            // Buying shares
            totalSpent[outcome] = (totalSpent[outcome] ?? 0) + amount;
            totalShares[outcome] = (totalShares[outcome] ?? 0) + shares;
        } else if (amount < 0 || shares < 0) {
            // Selling shares
            totalShares[outcome] = (totalShares[outcome] ?? 0) + shares;
        }
    }

    return { totalSpent, totalShares };
};

export const calculateUserMetricsWithNewBetsOnly = (
    newBets: MarginalBet[],
    um: Omit<ContractMetric, 'id'>
): Omit<ContractMetric, 'id'> => {
    const needsTotalSpentBackfilled = !um.totalSpent;
    const initialTotalSpent: { [key: string]: number } = um.totalSpent ?? {};

    if (needsTotalSpentBackfilled) {
        if (um.hasNoShares && !um.hasYesShares) {
            initialTotalSpent.NO = um.invested;
        } else if (um.hasYesShares && !um.hasNoShares) {
            initialTotalSpent.YES = um.invested;
        } else {
            initialTotalSpent.NO = um.invested / 2;
            initialTotalSpent.YES = um.invested / 2;
        }
    }

    const initialTotalShares = { ...um.totalShares };

    const { totalSpent, totalShares } = calculateTotalSpentAndShares(
        newBets,
        initialTotalSpent,
        initialTotalShares
    );

    const invested = sum(Object.values(totalSpent));
    const loan = sumBy(newBets, (b) => b.loanAmount ?? 0) + um.loan;

    const hasShares = Object.values(totalShares).some(
        (shares) => !floatingEqual(shares, 0)
    );
    const hasYesShares = (totalShares.YES ?? 0) >= 1;
    const hasNoShares = (totalShares.NO ?? 0) >= 1;
    const soldOut = !hasNoShares && !hasYesShares;
    const maxSharesOutcome = soldOut
        ? null
        : (totalShares.NO ?? 0) > (totalShares.YES ?? 0)
            ? 'NO'
            : 'YES';

    const lastBet = orderBy(newBets, (b) => b.createdTime, 'desc')[0];

    // Calculate payout from both YES and NO shares
    const payout = calculatePayoutFromShares(totalShares, lastBet.probAfter);

    const totalAmountSold =
        (um.totalAmountSold ?? 0) +
        sumBy(
            newBets.filter((b) => b.isRedemption || b.amount < 0),
            (b) => -b.amount
        );
    const totalAmountInvested =
        (um.totalAmountInvested ?? 0) +
        sumBy(
            newBets.filter((b) => b.amount > 0 && !b.isRedemption),
            (b) => b.amount
        );
    const profit = payout + totalAmountSold - totalAmountInvested;
    const profitPercent = floatingEqual(totalAmountInvested, 0)
        ? 0
        : (profit / totalAmountInvested) * 100;

    return {
        ...um,
        loan: floatingEqual(loan, 0) ? 0 : loan,
        invested: floatingEqual(invested, 0) ? 0 : invested,
        totalShares,
        hasNoShares,
        hasYesShares,
        hasShares,
        maxSharesOutcome,
        lastBetTime: lastBet.createdTime,
        lastProb: lastBet.probAfter,
        totalSpent,
        payout: floatingEqual(payout, 0) ? 0 : payout,
        totalAmountSold: floatingEqual(totalAmountSold, 0) ? 0 : totalAmountSold,
        totalAmountInvested: floatingEqual(totalAmountInvested, 0)
            ? 0
            : totalAmountInvested,
        profit,
        profitPercent,
    };
};

export const calculateProfitMetricsAtProbOrCancel = <
    T extends Omit<ContractMetric, 'id'> | ContractMetric
>(
    newState: number | 'CANCEL',
    um: T
): T & { previousProfit?: number } => {
    const {
        totalAmountSold = 0,
        totalAmountInvested = 0,
        totalShares,
        invested,
        profit: previousProfit,
    } = um;

    // Calculate payout from both YES and NO shares
    const payout =
        newState === 'CANCEL'
            ? invested
            : calculatePayoutFromShares(totalShares, newState);
    const profit =
        newState === 'CANCEL' ? 0 : payout + totalAmountSold - totalAmountInvested;
    const profitPercent = floatingEqual(totalAmountInvested, 0)
        ? 0
        : (profit / totalAmountInvested) * 100;

    return {
        ...um,
        payout,
        profit,
        profitPercent,
        previousProfit,
    };
};

// ============================================
// SANDBOX-SPECIFIC METRICS
// ============================================

/**
 * Calculate metrics for a sandbox user across all their positions
 */
export interface SandboxMetrics {
    totalInvested: number;
    totalValue: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
    positionCount: number;
    winningPositions: number;
    losingPositions: number;
}

export const calculateSandboxUserMetrics = (
    positions: Array<{
        shares: number;
        avgPrice: number;
        currentPrice: number;
    }>
): SandboxMetrics => {
    let totalInvested = 0;
    let totalValue = 0;
    let winningPositions = 0;
    let losingPositions = 0;

    for (const pos of positions) {
        const costBasis = pos.shares * pos.avgPrice;
        const currentValue = pos.shares * pos.currentPrice;

        totalInvested += costBasis;
        totalValue += currentValue;

        if (currentValue > costBasis) {
            winningPositions++;
        } else if (currentValue < costBasis) {
            losingPositions++;
        }
    }

    const unrealizedPnl = totalValue - totalInvested;
    const unrealizedPnlPercent = totalInvested > 0
        ? (unrealizedPnl / totalInvested) * 100
        : 0;

    return {
        totalInvested,
        totalValue,
        unrealizedPnl,
        unrealizedPnlPercent,
        positionCount: positions.length,
        winningPositions,
        losingPositions,
    };
};

/**
 * Calculate period-based P&L (day/week/month)
 */
export const calculatePeriodPnl = (
    currentValue: number,
    historicalValues: Array<{ timestamp: number; value: number }>
): { day: number; week: number; month: number } => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;

    const findValueAt = (targetTime: number) => {
        const sorted = historicalValues.sort((a, b) => b.timestamp - a.timestamp);
        const closest = sorted.find(h => h.timestamp <= targetTime);
        return closest?.value ?? currentValue;
    };

    const dayAgoValue = findValueAt(now - DAY);
    const weekAgoValue = findValueAt(now - WEEK);
    const monthAgoValue = findValueAt(now - MONTH);

    return {
        day: currentValue - dayAgoValue,
        week: currentValue - weekAgoValue,
        month: currentValue - monthAgoValue,
    };
};
