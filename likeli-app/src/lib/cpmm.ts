// lib/cpmm.ts
// Constant Product Market Maker (CPMM) - 100% Manifold Implementation
// Core invariant: k = pool.YES * pool.NO remains constant during trades

import { generateId, MINIMUM_ANTE, type Answer } from './graduation';

// ============================================
// CORE TYPES
// ============================================

export interface Pool {
    YES: number;
    NO: number;
    [outcome: string]: number; // Index signature for Manifold compatibility
}

export interface BuyResult {
    shares: number;
    newPool: Pool;
    probBefore: number;
    probAfter: number;
}

export interface SellResult {
    payout: number;
    newPool: Pool;
    probBefore: number;
    probAfter: number;
}

// ============================================
// CONFIGURATION
// ============================================

/** Multiplier for pool depth (higher = less volatile) */
export const LIQUIDITY_MULTIPLIER = 50;

/** Minimum pool quantity to prevent draining */
export const CPMM_MIN_POOL_QTY = 0.01;

/** Trading fee (0 = no fee, 0.02 = 2%) */
export const TRADING_FEE = 0;

// ============================================
// CPMM PROBABILITY CALCULATION
// ============================================

/**
 * Calculate probability from pool state
 * 
 * MANIFOLD FORMULA: prob = YES / (YES + NO)
 * 
 * BUT: Their createInitialPool uses inverted logic:
 *   YES = ante * (1 - initialProb)
 *   NO = ante * initialProb
 * 
 * This means: prob = NO / (YES + NO) for correct behavior
 * (When you buy YES, YES pool shrinks, NO pool grows → prob increases)
 */
/**
 * Calculate probability from pool state
 * 
 * MANIFOLD FORMULA: prob = (p * NO) / ((1 - p) * YES + p * NO)
 */
export function getProb(pool: Pool, p: number = 0.5): number {
    const { YES, NO } = pool;
    if (YES + NO === 0) return p;
    return (p * NO) / ((1 - p) * YES + p * NO);
}

/**
 * Calculate the constant product invariant
 */
export function getK(pool: Pool): number {
    return pool.YES * pool.NO;
}

// ============================================
// POOL CREATION
// ============================================

/**
 * Create initial pool for a new market
 * 
 * CRITICAL: Higher ante = less volatility
 * 
 * @param ante - Amount user pays to create market
 * @param initialProb - Initial probability (default 0.5)
 * @param multiplier - Liquidity multiplier (default LIQUIDITY_MULTIPLIER)
 */
export function createPool(
    ante: number,
    initialProb: number = 0.5,
    multiplier: number = LIQUIDITY_MULTIPLIER
): Pool {
    const baseAmount = ante * multiplier;

    // Manifold's inverted pool logic:
    // Lower YES = higher initial prob
    // Higher NO = higher initial prob
    return {
        YES: baseAmount * (1 - initialProb),
        NO: baseAmount * initialProb
    };
}

// ============================================
// BUYING SHARES (MANIFOLD EXACT)
// ============================================

/**
 * Calculate shares received when buying with a given amount
 * 
 * CORE CPMM BUY FORMULA:
 * - Buying YES: money goes into NO pool, shares come from YES pool
 * - Buying NO: money goes into YES pool, shares come from NO pool
 * - Invariant k = YES * NO is maintained
 */
export function buyShares(
    pool: Pool,
    outcome: 'YES' | 'NO',
    amount: number,
    p: number = 0.5
): BuyResult {
    const { YES: y, NO: n } = pool;
    const k = y * n; // Constant product invariant
    const probBefore = getProb(pool, p);

    if (amount <= 0) {
        return {
            shares: 0,
            newPool: { YES: y, NO: n },
            probBefore,
            probAfter: probBefore,
        };
    }

    let newY: number;
    let newN: number;
    let shares: number;

    if (outcome === 'YES') {
        // Buying YES: money goes into NO pool, shares come from YES pool
        newN = n + amount;
        newY = k / newN;
        shares = y - newY;
    } else {
        // Buying NO: money goes into YES pool, shares come from NO pool
        newY = y + amount;
        newN = k / newY;
        shares = n - newN;
    }

    const newPool = { YES: newY, NO: newN };

    return {
        shares,
        newPool,
        probBefore,
        probAfter: getProb(newPool, p),
    };
}

// ============================================
// SELLING SHARES (MANIFOLD EXACT)
// ============================================

/**
 * Calculate payout when selling shares
 * 
 * CORE CPMM SELL FORMULA:
 * - Selling YES: shares go back to YES pool, money comes from NO pool
 * - Selling NO: shares go back to NO pool, money comes from YES pool
 * - Invariant k = YES * NO is maintained
 */
export function sellShares(
    pool: Pool,
    outcome: 'YES' | 'NO',
    shares: number,
    p: number = 0.5
): SellResult {
    const { YES: y, NO: n } = pool;
    const k = y * n;
    const probBefore = getProb(pool, p);

    if (shares <= 0) {
        return {
            payout: 0,
            newPool: { YES: y, NO: n },
            probBefore,
            probAfter: probBefore,
        };
    }

    let newY: number;
    let newN: number;
    let payout: number;

    if (outcome === 'YES') {
        // Selling YES: shares go back to YES pool, money comes from NO pool
        newY = y + shares;
        newN = k / newY;
        payout = n - newN;
    } else {
        // Selling NO: shares go back to NO pool, money comes from YES pool
        newN = n + shares;
        newY = k / newN;
        payout = y - newY;
    }

    // Ensure payout doesn't exceed available liquidity
    if (payout < 0) payout = 0;

    const newPool = { YES: newY, NO: newN };

    return {
        payout,
        newPool,
        probBefore,
        probAfter: getProb(newPool, p),
    };
}

// ============================================
// AMOUNT/SHARES CONVERSION
// ============================================

/**
 * Calculate how much money needed to buy a specific number of shares
 */
export function getCostForShares(
    pool: Pool,
    outcome: 'YES' | 'NO',
    shares: number
): number {
    const { YES: y, NO: n } = pool;
    const k = y * n;

    if (shares <= 0) return 0;

    if (outcome === 'YES') {
        const newY = y - shares;
        if (newY <= 0) return Infinity;
        const newN = k / newY;
        return newN - n;
    } else {
        const newN = n - shares;
        if (newN <= 0) return Infinity;
        const newY = k / newN;
        return newY - y;
    }
}

/**
 * Calculate how many shares you get for a given amount
 */
export function getSharesForAmount(
    pool: Pool,
    outcome: 'YES' | 'NO',
    amount: number
): number {
    return buyShares(pool, outcome, amount).shares;
}

// ============================================
// LIQUIDITY MANAGEMENT
// ============================================

/**
 * Add liquidity to a pool (increases depth, reduces volatility)
 * Maintains current probability while increasing depth
 */
export function addLiquidity(
    pool: Pool,
    amount: number,
    multiplier: number = LIQUIDITY_MULTIPLIER,
    p: number = 0.5
): Pool {
    const actualAmount = amount * multiplier;
    const prob = getProb(pool, p);

    // Add proportionally to maintain same probability
    const addNo = actualAmount * prob;
    const addYes = actualAmount * (1 - prob);

    return {
        YES: pool.YES + addYes,
        NO: pool.NO + addNo,
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
    const prob = getProb(pool, p);
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
    const { probBefore, probAfter } = buyShares(pool, outcome, amount, p);
    return Math.abs(probAfter - probBefore);
}

// ============================================
// RESOLUTION PAYOUTS
// ============================================

/**
 * Calculate payout for resolution
 * @param shares - Number of shares the user holds
 * @param outcome - Which outcome the user holds (YES or NO)
 * @param resolution - How the market resolved
 */
export function calculateResolutionPayout(
    shares: number,
    outcome: 'YES' | 'NO',
    resolution: 'YES' | 'NO' | 'MKT' | 'CANCEL' | number
): number {
    if (resolution === 'YES') {
        return outcome === 'YES' ? shares : 0;
    } else if (resolution === 'NO') {
        return outcome === 'NO' ? shares : 0;
    } else if (resolution === 'CANCEL') {
        // Cancel returns invested amount (handled separately)
        return 0;
    } else if (resolution === 'MKT' || typeof resolution === 'number') {
        // Probabilistic (MKT) resolution
        const prob = typeof resolution === 'number' ? resolution : 0.5;
        return outcome === 'YES' ? shares * prob : shares * (1 - prob);
    }
    return 0;
}

// ============================================
// MULTI-CHOICE MARKET SUPPORT
// ============================================

/**
 * Create initial pools for a multi-choice market
 * Each answer gets its own independent CPMM pool
 */
export function createMultiChoiceAnswers(
    ante: number,
    answerTexts: string[]
): Answer[] {
    const perAnswerLiquidity = ante / answerTexts.length;

    return answerTexts.map((text, index) => ({
        id: generateId(),
        text,
        pool: createPool(perAnswerLiquidity, 0.5),
        prob: 0.5,
        volume: 0,
        index,
    }));
}

/**
 * Buy shares on a specific answer in a multi-choice market
 */
export function buyAnswerShares(
    answer: Answer,
    amount: number
): { answer: Answer; shares: number } {
    const result = buyShares(answer.pool, 'YES', amount);

    return {
        answer: {
            ...answer,
            pool: result.newPool,
            prob: result.probAfter,
            volume: answer.volume + amount,
        },
        shares: result.shares,
    };
}

/**
 * Sell shares on a specific answer in a multi-choice market
 */
export function sellAnswerShares(
    answer: Answer,
    shares: number
): { answer: Answer; payout: number } {
    const result = sellShares(answer.pool, 'YES', shares);

    return {
        answer: {
            ...answer,
            pool: result.newPool,
            prob: result.probAfter,
        },
        payout: result.payout,
    };
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate that a trade won't drain the pool
 */
export function validateTrade(newPool: Pool): void {
    if (Math.min(newPool.YES, newPool.NO) < CPMM_MIN_POOL_QTY) {
        throw new Error('Trade too large for current liquidity');
    }
}

/**
 * Validate ante amount
 */
export function validateAnte(ante: number): void {
    if (ante < MINIMUM_ANTE) {
        throw new Error(`Minimum ante is $${MINIMUM_ANTE} for market stability`);
    }
}
