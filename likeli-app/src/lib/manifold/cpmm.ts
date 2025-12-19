// lib/manifold/cpmm.ts
// Complete CPMM Calculations - 100% Manifold Match

import { Pool, BuyResult, SellResult, LIQUIDITY_MULTIPLIER, CPMM_MIN_POOL_QTY } from './types';

// ============================================
// CPMM PROBABILITY CALCULATION
// ============================================

/**
 * Calculate probability from pool state
 * CORE FORMULA: prob = NO / (YES + NO)
 * Higher NO relative to YES = higher probability of YES
 */
/**
 * Calculate probability from pool state
 * CORE FORMULA: prob = (p * NO) / ((1 - p) * YES + p * NO)
 * 
 * @param pool The pool state
 * @param p The constant product parameter (default 0.5)
 */
export function getCpmmProbability(pool: Pool, p: number = 0.5): number {
    const { YES, NO } = pool;
    if (YES + NO === 0) return p;

    // Manifold's weighted formula
    return (p * NO) / ((1 - p) * YES + p * NO);
}

/**
 * Calculate the constant product invariant
 */
export function getK(pool: Pool): number {
    return pool.YES * pool.NO;
}

// ============================================
// BUYING SHARES
// ============================================

/**
 * Calculate shares received when buying with a given amount
 * CORE CPMM BUY FORMULA - EXACT MANIFOLD MATCH
 */
export function calculateCpmmPurchase(
    pool: Pool,
    betAmount: number,
    outcome: 'YES' | 'NO',
    p: number = 0.5
): BuyResult {
    const { YES: y, NO: n } = pool;
    const k = y * n; // Constant product invariant

    const probBefore = getCpmmProbability(pool, p);

    let newY: number;
    let newN: number;
    let shares: number;

    if (outcome === 'YES') {
        // Buying YES: money goes into NO pool, shares come from YES pool
        newN = n + betAmount;
        newY = k / newN;
        shares = y - newY;
    } else {
        // Buying NO: money goes into YES pool, shares come from NO pool
        newY = y + betAmount;
        newN = k / newY;
        shares = n - newN;
    }

    const probAfter = getCpmmProbability({ YES: newY, NO: newN }, p);

    return {
        shares,
        newPool: { YES: newY, NO: newN },
        probBefore,
        probAfter
    };
}

/**
 * Calculate how much money needed to buy a specific number of shares
 */
export function calculateCpmmAmountForShares(
    pool: Pool,
    shares: number,
    outcome: 'YES' | 'NO'
): number {
    const { YES: y, NO: n } = pool;
    const k = y * n;

    if (outcome === 'YES') {
        const newY = y - shares;
        const newN = k / newY;
        return newN - n; // Amount to add to NO pool
    } else {
        const newN = n - shares;
        const newY = k / newN;
        return newY - y; // Amount to add to YES pool
    }
}

// ============================================
// SELLING SHARES
// ============================================

/**
 * Calculate payout when selling shares
 * CORE CPMM SELL FORMULA - EXACT MANIFOLD MATCH
 */
export function calculateCpmmSale(
    pool: Pool,
    shares: number,
    outcome: 'YES' | 'NO',
    p: number = 0.5
): SellResult {
    const { YES: y, NO: n } = pool;
    const k = y * n;

    const probBefore = getCpmmProbability(pool, p);

    let newY: number;
    let newN: number;
    let payout: number;

    if (outcome === 'YES') {
        // Selling YES shares: shares go back to YES pool, money comes from NO pool
        newY = y + shares;
        newN = k / newY;
        payout = n - newN;
    } else {
        // Selling NO shares: shares go back to NO pool, money comes from YES pool
        newN = n + shares;
        newY = k / newN;
        payout = y - newY;
    }

    const probAfter = getCpmmProbability({ YES: newY, NO: newN }, p);

    return {
        payout,
        newPool: { YES: newY, NO: newN },
        probBefore,
        probAfter
    };
}

// ============================================
// LIQUIDITY MANAGEMENT
// ============================================

/**
 * Add liquidity to a pool (increases depth, reduces volatility)
 */
export function addLiquidity(
    pool: Pool,
    amount: number,
    p: number = 0.5
): { newPool: Pool; newTotalLiquidity: number } {
    const { YES, NO } = pool;

    // Add liquidity proportionally to maintain the same probability
    const prob = getCpmmProbability(pool, p);
    const addYes = amount * (1 - prob);  // Add to YES inversely
    const addNo = amount * prob;          // Add to NO proportionally

    return {
        newPool: {
            YES: YES + addYes,
            NO: NO + addNo
        },
        newTotalLiquidity: amount
    };
}

/**
 * Create initial pool for a new market
 * CRITICAL: Higher ante = less volatility
 */
export function createInitialPool(
    ante: number,
    initialProb: number = 0.5,
    multiplier: number = LIQUIDITY_MULTIPLIER
): Pool {
    const baseAmount = ante * multiplier;
    return {
        YES: baseAmount * (1 - initialProb),  // Lower YES = higher initial prob
        NO: baseAmount * initialProb           // Higher NO = higher initial prob
    };
}

// ============================================
// ELASTICITY (VOLATILITY MEASURE)
// ============================================

/**
 * Calculate elasticity - how much the price moves per unit bet
 * Lower elasticity = more stable prices
 */
export function calculateElasticity(pool: Pool, p: number = 0.5): number {
    const totalLiquidity = pool.YES + pool.NO;
    const prob = getCpmmProbability(pool, p);
    return (prob * (1 - prob)) / totalLiquidity;
}

/**
 * Estimate price impact of a bet before placing it
 */
export function estimatePriceImpact(
    pool: Pool,
    amount: number,
    outcome: 'YES' | 'NO',
    p: number = 0.5
): number {
    const { probBefore, probAfter } = calculateCpmmPurchase(pool, amount, outcome, p);
    return Math.abs(probAfter - probBefore);
}

/**
 * Validate that a trade won't drain the pool
 */
export function validateTrade(newPool: Pool): boolean {
    return newPool.YES >= CPMM_MIN_POOL_QTY && newPool.NO >= CPMM_MIN_POOL_QTY;
}

// ============================================
// MULTI-CHOICE SUPPORT
// ============================================

/**
 * Create initial pools for each answer in a multi-choice market
 */
export function createMultiChoicePools(
    ante: number,
    numAnswers: number,
    multiplier: number = LIQUIDITY_MULTIPLIER
): Pool[] {
    const perAnswerAnte = ante / numAnswers;
    return Array.from({ length: numAnswers }, () =>
        createInitialPool(perAnswerAnte, 0.5, multiplier)
    );
}

/**
 * Generate a random ID
 */
export function generateId(length: number = 12): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < length; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}

/**
 * Generate URL-friendly slug from question
 */
export function generateSlug(question: string): string {
    return question
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50) + '-' + generateId(6);
}
