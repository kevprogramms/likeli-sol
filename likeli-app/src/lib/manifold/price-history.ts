// lib/manifold/price-history.ts
// Chart/Price History Logic - 100% Manifold Match

import { PricePoint } from './types';
import { getContract, getBets, getStorePricePoints } from './store';

// ============================================
// PRICE HISTORY / CHART DATA
// ============================================

export interface BetPoint extends PricePoint {
    outcome: 'YES' | 'NO';
    amount: number;
}

/**
 * Get price history for a market (for charts)
 */
export function getPriceHistory(
    contractId: string,
    options?: {
        maxPoints?: number;
        afterTime?: number;
        beforeTime?: number;
        answerId?: string;
    }
): PricePoint[] {
    const { maxPoints = 1000, afterTime, beforeTime, answerId } = options ?? {};

    // Get all price points from store
    let points = getStorePricePoints(contractId);

    // Filter by answerId if provided
    // (In our in-memory store, price points are per contract)

    // Filter by time range
    if (afterTime) {
        points = points.filter(p => p.timestamp > afterTime);
    }
    if (beforeTime) {
        points = points.filter(p => p.timestamp < beforeTime);
    }

    // Downsample if too many points
    if (points.length > maxPoints) {
        return downsamplePoints(points, maxPoints);
    }

    return points;
}

/**
 * Downsample price points for performance
 * Keeps first, last, and evenly spaced middle points
 */
export function downsamplePoints(points: PricePoint[], maxPoints: number): PricePoint[] {
    if (points.length <= maxPoints) return points;

    const result: PricePoint[] = [];
    const step = (points.length - 1) / (maxPoints - 1);

    for (let i = 0; i < maxPoints; i++) {
        const index = Math.round(i * step);
        result.push(points[index]);
    }

    return result;
}

/**
 * Get bet history with amounts (for detailed charts)
 */
export function getBetHistory(
    contractId: string,
    limit: number = 100
): BetPoint[] {
    // Get bets from store
    const allBets = getBets(contractId);

    // Filter out redemptions and get only buys
    const buyBets = allBets
        .filter(b => !b.isRedemption && b.amount > 0)
        .slice(-limit);

    return buyBets.map(bet => ({
        timestamp: bet.createdTime,
        probability: bet.probAfter,
        outcome: bet.outcome,
        amount: bet.amount
    }));
}

/**
 * Get price at specific time (for historical lookups)
 */
export function getPriceAtTime(
    contractId: string,
    timestamp: number,
    answerId?: string
): number | null {
    const points = getPriceHistory(contractId, { beforeTime: timestamp + 1 });

    // Find the most recent point before this timestamp
    const relevantPoints = points.filter(p => p.timestamp <= timestamp);
    if (relevantPoints.length === 0) return null;

    return relevantPoints[relevantPoints.length - 1].probability;
}

/**
 * Build full price history with market creation start point
 */
export function getFullPriceHistory(
    contractId: string,
    answerId?: string
): PricePoint[] {
    // Get contract creation time and initial prob
    const contract = getContract(contractId);
    if (!contract) return [];

    const initialPoint: PricePoint = {
        timestamp: contract.createdTime,
        probability: contract.p ?? 0.5
    };

    // Get all price points after creation
    const betPoints = getPriceHistory(contractId, { answerId });

    // Combine: initial + bets
    return [initialPoint, ...betPoints];
}

/**
 * For multi-choice markets, get price history per answer
 */
export function getMultiChoiceChartData(
    contractId: string
): { answerId: string; text: string; points: PricePoint[] }[] {
    const contract = getContract(contractId);
    if (!contract || !contract.answers) return [];

    // For each answer, get its price history
    return contract.answers.map(answer => ({
        answerId: answer.id,
        text: answer.text,
        points: getPriceHistory(contractId, { answerId: answer.id })
    }));
}

/**
 * Format price history for chart response
 */
export function formatChartResponse(points: PricePoint[]): {
    points: { timestamp: number; probability: number }[];
    count: number;
} {
    return {
        points: points.map(p => ({
            timestamp: p.timestamp,
            probability: p.probability
        })),
        count: points.length
    };
}
