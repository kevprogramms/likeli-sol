// lib/sandbox.ts
// Sandbox market implementation with graduation phases, multi-choice support,
// and FULL MANIFOLD FEATURES (limit orders on main phase only)

import {
    Pool,
    createPool,
    getProb,
    buyShares,
    sellShares,
    createMultiChoiceAnswers,
    buyAnswerShares,
    sellAnswerShares,
    LIQUIDITY_MULTIPLIER
} from './cpmm';

import {
    MarketPhase,
    OutcomeType,
    Resolution,
    Answer,
    GRADUATION_VOLUME_THRESHOLD,
    GRADUATION_TIMER_MS,
    checkGraduationEligibility,
    checkGraduationComplete,
    generateId,
    generateSlug
} from './graduation';

// ============================================
// MANIFOLD IMPORTS - FULL FEATURE PARITY
// ============================================
import { Answer as ManifoldAnswer, LimitBet, Fill, Maker, Fees, noFees } from './manifold/types';
import { calculateCpmmMultiArbitrageBet } from './manifold/calculate-cpmm-arbitrage';
import { calculateCpmmMultiArbitrageYesBets } from './manifold/multi-cpmm';
import {
    getCpmmProbability,
    computeFills,
    calculateCpmmPurchase,
    calculateCpmmSale,
    addCpmmLiquidity,
    addCpmmLiquidityFixedP,
    getCpmmLiquidity,
    CpmmState
} from './manifold/calculate-cpmm';
import { getTakerFee, getFeesSplit, getFeeTotal } from './manifold/fees';
import { addObjects } from './manifold/util/object';
import { sumBy } from 'lodash';

// ============================================
// TYPES
// ============================================

export type Outcome = "YES" | "NO";

export interface SandboxMarket {
    id: string;
    slug: string;
    question: string;
    category: string;
    resolutionDate: string;
    rules: string;
    creatorId: string;

    // Market type
    outcomeType: OutcomeType;

    // Phase & Graduation
    phase: MarketPhase;
    graduationStartTime?: number;

    // Pool (for BINARY markets)
    pool: Pool;
    p: number; // NEW: p parameter for asymmetric markets

    // Answers (for MULTIPLE_CHOICE markets)
    answers?: Answer[];
    shouldAnswersSumToOne?: boolean;

    // Stats
    volume: number;
    uniqueBettorCount: number;
    totalLiquidity: number;

    // Fee Infrastructure - NEW
    collectedFees: Fees;
    feeBps: number; // Fee in basis points (100 = 1%)
    subsidyPool: number; // NEW: Advanced liquidity

    // Timestamps
    createdTime: number;
    lastBetTime?: number;

    // Resolution
    resolution?: Resolution;
    resolutionProbability?: number;
    resolutionTime?: number;

    // Price history for charts
    priceHistory: Array<{
        timestamp: number;
        yesPrice: number;
        noPrice: number;
        probYes: number;
        probNo: number;
        volume?: number; // NEW: track volume per snapshot
    }>;

    // Limit Orders (MAIN PHASE ONLY) - NEW
    unfilledBets: LimitBet[];
}

export interface SandboxUser {
    id: string;
    cash: number;
    positions: Record<string, number>;
}

// ============================================
// GLOBAL SINGLETON STORE
// ============================================

declare global {
    var _sandboxMarkets: Map<string, SandboxMarket>;
    var _sandboxUsers: Map<string, SandboxUser>;
}

if (!global._sandboxMarkets) {
    global._sandboxMarkets = new Map<string, SandboxMarket>();
}
if (!global._sandboxUsers) {
    global._sandboxUsers = new Map<string, SandboxUser>();
}

export const sandboxMarkets = global._sandboxMarkets;
export const sandboxUsers = global._sandboxUsers;

// ============================================
// LOGGING - Comprehensive State Tracking
// ============================================

const LOG_ENABLED = true;

function log(category: string, message: string, data?: any) {
    if (!LOG_ENABLED) return;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${category}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

// ============================================
// CPMM RE-EXPORTS
// ============================================

export { buyShares, sellShares, getProb, createPool } from './cpmm';

// ============================================
// MARKET CREATION
// ============================================

export function createSandboxMarket(
    question: string,
    category: string,
    resolutionDate: string,
    initialLiquidityUsd: number,
    rules: string = "",
    creatorId: string = "demo-user"
): SandboxMarket {
    const id = `sb_${generateId().slice(0, 8)}`;
    const slug = generateSlug(question);
    const pool = createPool(initialLiquidityUsd, 0.5);
    const now = Date.now();

    const market: SandboxMarket = {
        id,
        slug,
        question,
        category,
        resolutionDate,
        rules,
        creatorId,
        outcomeType: 'BINARY',
        phase: 'sandbox',
        pool,
        p: 0.5, // Default p parameter
        volume: 0,
        uniqueBettorCount: 0,
        totalLiquidity: initialLiquidityUsd * LIQUIDITY_MULTIPLIER,
        collectedFees: noFees, // NEW: Fee tracking
        feeBps: 100, // Default 1% fee (100 basis points)
        subsidyPool: 0, // NEW: Subsidy pool
        createdTime: now,
        priceHistory: [],
        unfilledBets: [], // NEW: Limit orders (empty for sandbox)
    };

    recordSandboxPriceSnapshot(market);
    log('CreateMarket', `Binary market created: ${question}`, { id, phase: market.phase });

    return market;
}

export function createMultiChoiceSandboxMarket(
    question: string,
    category: string,
    resolutionDate: string,
    initialLiquidityUsd: number,
    answerTexts: string[],
    rules: string = "",
    creatorId: string = "demo-user",
    shouldAnswersSumToOne: boolean = true
): SandboxMarket {
    const id = `sb_${generateId().slice(0, 8)}`;
    const slug = generateSlug(question);
    const answers = createMultiChoiceAnswers(initialLiquidityUsd, answerTexts);
    const now = Date.now();

    const totalPool = {
        YES: answers.reduce((sum, a) => sum + a.pool.YES, 0),
        NO: answers.reduce((sum, a) => sum + a.pool.NO, 0),
    };

    const market: SandboxMarket = {
        id,
        slug,
        question,
        category,
        resolutionDate,
        rules,
        creatorId,
        outcomeType: 'MULTIPLE_CHOICE',
        shouldAnswersSumToOne,
        phase: 'sandbox',
        pool: totalPool,
        p: 0.5,
        answers,
        volume: 0,
        uniqueBettorCount: 0,
        totalLiquidity: initialLiquidityUsd * LIQUIDITY_MULTIPLIER,
        collectedFees: noFees,
        feeBps: 100, // Default 1% fee (100 basis points)
        subsidyPool: 0,
        createdTime: now,
        priceHistory: [],
        unfilledBets: [],
    };

    log('CreateMarket', `Multi-choice market created: ${question}`, {
        id,
        numAnswers: answerTexts.length,
        shouldAnswersSumToOne
    });

    return market;
}

// ============================================
// PROBABILITY & PRICE
// ============================================

export function getProbability(market: SandboxMarket) {
    const probYes = getProb(market.pool, market.p);
    const probNo = 1 - probYes;
    return { probYes, probNo, yesPrice: probYes, noPrice: probNo };
}

export function recordSandboxPriceSnapshot(market: SandboxMarket) {
    const { probYes, probNo, yesPrice, noPrice } = getProbability(market);

    market.priceHistory.push({
        timestamp: Date.now(),
        yesPrice,
        noPrice,
        probYes,
        probNo,
        volume: market.volume, // NEW: Track volume
    });

    if (market.priceHistory.length > 500) {
        market.priceHistory = market.priceHistory.slice(-500);
    }
}

// ============================================
// TRADING - BINARY MARKETS (WITH LIMIT ORDERS FOR MAIN)
// ============================================

/**
 * Execute a buy trade on a BINARY market
 * - Sandbox phase: Direct AMM execution
 * - Main phase: Try limit order matching first, then AMM
 */
export function executeSandboxBuy(
    market: SandboxMarket,
    user: SandboxUser,
    outcome: Outcome,
    amountUsd: number,
    limitProb?: number // NEW: Optional limit price (main phase only)
): { shares: number; probAfter: number; fees: Fees; fills: Fill[] } {
    if (user.cash < amountUsd) {
        throw new Error("Insufficient balance");
    }
    if (market.resolution) {
        throw new Error("Market is resolved");
    }

    log('Trade', `Buy ${outcome} for $${amountUsd}`, {
        marketId: market.id,
        phase: market.phase,
        limitProb
    });

    // MAIN PHASE: Use Manifold's full computeFills with limit order matching
    if (market.phase === 'main') {
        return executeBuyWithLimitOrders(market, user, outcome, amountUsd, limitProb);
    }

    // SANDBOX/GRADUATING PHASE: Direct AMM execution (no limit orders)
    const cpmmState: CpmmState = {
        pool: market.pool,
        p: market.p,
        collectedFees: market.collectedFees
    };

    // Calculate with fees
    const { shares, newPool, newP, fees } = calculateCpmmPurchase(
        cpmmState,
        amountUsd,
        outcome,
        false // Apply fees
    );

    // Update market
    market.pool = newPool;
    market.p = newP;
    market.volume += amountUsd;
    market.lastBetTime = Date.now();
    market.collectedFees = addObjects(market.collectedFees, fees);

    // Update user
    user.cash -= amountUsd;
    const posKey = `${market.id}-${outcome}`;
    user.positions[posKey] = (user.positions[posKey] || 0) + shares;

    recordSandboxPriceSnapshot(market);
    updateMarketPhase(market);

    log('Trade', `Buy completed`, {
        shares,
        probAfter: getProb(newPool, newP),
        fees: getFeeTotal(fees)
    });

    return {
        shares,
        probAfter: getProb(newPool, newP),
        fees,
        fills: [{ matchedBetId: null, amount: amountUsd, shares, timestamp: Date.now(), fees }]
    };
}

/**
 * Execute buy with limit order matching (MAIN PHASE ONLY)
 * Uses Manifold's exact computeFills logic
 */
function executeBuyWithLimitOrders(
    market: SandboxMarket,
    user: SandboxUser,
    outcome: Outcome,
    amountUsd: number,
    limitProb?: number
): { shares: number; probAfter: number; fees: Fees; fills: Fill[] } {
    const cpmmState: CpmmState = {
        pool: market.pool,
        p: market.p,
        collectedFees: market.collectedFees
    };

    // Get balances for all users with unfilled orders
    const balanceByUserId: { [userId: string]: number } = {};
    market.unfilledBets.forEach(bet => {
        const orderUser = sandboxUsers.get(bet.userId);
        if (orderUser) {
            balanceByUserId[bet.userId] = orderUser.cash;
        }
    });

    // Use Manifold's exact computeFills
    const { takers, makers, totalFees, cpmmState: newState, ordersToCancel } = computeFills(
        cpmmState,
        outcome,
        amountUsd,
        limitProb,
        market.unfilledBets,
        balanceByUserId
    );

    // Calculate totals
    const totalShares = sumBy(takers, 'shares');
    const totalAmount = sumBy(takers, 'amount');

    // Update market pool (cast from Manifold's pool type)
    market.pool = { YES: newState.pool.YES, NO: newState.pool.NO };
    market.p = newState.p;
    market.volume += totalAmount;
    market.lastBetTime = Date.now();
    market.collectedFees = addObjects(market.collectedFees, totalFees);

    // Update user
    user.cash -= totalAmount;
    const posKey = `${market.id}-${outcome}`;
    user.positions[posKey] = (user.positions[posKey] || 0) + totalShares;

    // Process maker fills (update limit orders)
    for (const maker of makers) {
        const limitBet = market.unfilledBets.find(b => b.id === maker.bet.id);
        if (limitBet) {
            limitBet.amount += maker.amount;
            limitBet.shares += maker.shares;
            limitBet.fills.push({
                matchedBetId: 'taker',
                amount: maker.amount,
                shares: maker.shares,
                timestamp: maker.timestamp,
                fees: noFees
            });

            // Check if fully filled
            if (limitBet.amount >= limitBet.orderAmount) {
                limitBet.isFilled = true;
            }

            // Credit maker
            const makerUser = sandboxUsers.get(limitBet.userId);
            if (makerUser) {
                makerUser.cash += maker.shares; // Maker gets shares worth
            }

            log('OrderFill', `Limit order ${limitBet.id} filled`, {
                makerAmount: maker.amount,
                makerShares: maker.shares
            });
        }
    }

    // Cancel orders with insufficient balance
    for (const orderToCancel of ordersToCancel) {
        const idx = market.unfilledBets.findIndex(b => b.id === orderToCancel.id);
        if (idx !== -1) {
            market.unfilledBets[idx].isCancelled = true;
            log('OrderCancel', `Cancelled order ${orderToCancel.id} (insufficient balance)`);
        }
    }

    // Remove filled/cancelled orders
    market.unfilledBets = market.unfilledBets.filter(b => !b.isFilled && !b.isCancelled);

    recordSandboxPriceSnapshot(market);

    log('Trade', `Buy with limit orders completed`, {
        totalShares,
        totalAmount,
        makersMatched: makers.length,
        newProb: getProb(market.pool, market.p)
    });

    return {
        shares: totalShares,
        probAfter: getProb(market.pool, market.p),
        fees: totalFees,
        fills: takers
    };
}

/**
 * Execute a sell trade on a BINARY market
 */
export function executeSandboxSell(
    market: SandboxMarket,
    user: SandboxUser,
    outcome: Outcome,
    sharesToSell: number
): { payout: number; probAfter: number; fees: Fees } {
    if (market.resolution) {
        throw new Error("Market is resolved");
    }

    const posKey = `${market.id}-${outcome}`;
    const currentShares = user.positions[posKey] || 0;
    const actualShares = Math.min(sharesToSell, currentShares);

    if (actualShares <= 0) {
        throw new Error("Insufficient shares");
    }

    log('Trade', `Sell ${actualShares} ${outcome} shares`, { marketId: market.id });

    const cpmmState: CpmmState = {
        pool: market.pool,
        p: market.p,
        collectedFees: market.collectedFees
    };

    // MAIN PHASE: Use Manifold's calculateCpmmSale with limit order matching
    if (market.phase === 'main') {
        const balanceByUserId: { [userId: string]: number } = {};
        market.unfilledBets.forEach(bet => {
            const orderUser = sandboxUsers.get(bet.userId);
            if (orderUser) balanceByUserId[bet.userId] = orderUser.cash;
        });

        const { saleValue, cpmmState: newState, fees } = calculateCpmmSale(
            cpmmState,
            actualShares,
            outcome,
            market.unfilledBets,
            balanceByUserId
        );

        market.pool = { YES: newState.pool.YES, NO: newState.pool.NO };
        market.p = newState.p;
        market.lastBetTime = Date.now();
        market.collectedFees = addObjects(market.collectedFees, fees);

        user.cash += saleValue;
        user.positions[posKey] -= actualShares;

        recordSandboxPriceSnapshot(market);

        return {
            payout: saleValue,
            probAfter: getProb(market.pool, market.p),
            fees
        };
    }

    // SANDBOX/GRADUATING: Simple sell
    const result = sellShares(market.pool, outcome, actualShares, market.p);

    market.pool = result.newPool;
    market.lastBetTime = Date.now();

    user.cash += result.payout;
    user.positions[posKey] -= actualShares;

    recordSandboxPriceSnapshot(market);

    return {
        payout: result.payout,
        probAfter: result.probAfter,
        fees: noFees
    };
}

// ============================================
// LIMIT ORDERS (MAIN PHASE ONLY)
// ============================================

/**
 * Place a limit order (ONLY WORKS ON MAIN PHASE MARKETS)
 */
export function placeLimitOrder(
    market: SandboxMarket,
    user: SandboxUser,
    outcome: Outcome,
    limitProb: number,
    amount: number,
    expiresIn?: number // milliseconds
): LimitBet {
    if (market.phase !== 'main') {
        throw new Error("Limit orders are only available on main phase markets");
    }
    if (user.cash < amount) {
        throw new Error("Insufficient balance");
    }
    if (limitProb <= 0 || limitProb >= 1) {
        throw new Error("Limit probability must be between 0 and 1");
    }

    const now = Date.now();
    const orderId = `order_${generateId().slice(0, 8)}`;

    const limitBet: LimitBet = {
        id: orderId,
        contractId: market.id,
        userId: user.id,
        outcome,
        limitProb,
        orderAmount: amount,
        amount: 0, // Filled amount
        shares: 0, // Filled shares
        probBefore: getProb(market.pool, market.p),
        probAfter: getProb(market.pool, market.p),
        isFilled: false,
        isCancelled: false,
        isRedemption: false,
        createdTime: now,
        fills: [],
        expiresAt: expiresIn ? now + expiresIn : undefined
    };

    // Reserve funds
    user.cash -= amount;

    // Add to orderbook
    market.unfilledBets.push(limitBet);

    log('LimitOrder', `Placed limit order`, {
        orderId,
        outcome,
        limitProb,
        amount,
        expiresAt: limitBet.expiresAt
    });

    return limitBet;
}

/**
 * Cancel a limit order
 */
export function cancelLimitOrder(
    market: SandboxMarket,
    user: SandboxUser,
    orderId: string
): boolean {
    const orderIdx = market.unfilledBets.findIndex(b => b.id === orderId);
    if (orderIdx === -1) {
        throw new Error("Order not found");
    }

    const order = market.unfilledBets[orderIdx];
    if (order.userId !== user.id) {
        throw new Error("Not your order");
    }

    // Refund unfilled amount
    const unfilledAmount = order.orderAmount - order.amount;
    user.cash += unfilledAmount;

    // Remove from orderbook
    market.unfilledBets.splice(orderIdx, 1);

    log('LimitOrder', `Cancelled order ${orderId}`, { refunded: unfilledAmount });

    return true;
}

/**
 * Get orderbook for a market (MAIN PHASE ONLY)
 */
export function getOrderbook(market: SandboxMarket) {
    if (market.phase !== 'main') {
        return { yesBids: [], yesAsks: [], noBids: [], noAsks: [] };
    }

    const now = Date.now();

    // Filter out expired orders
    const validOrders = market.unfilledBets.filter(
        b => !b.expiresAt || b.expiresAt > now
    );

    return {
        yesBids: validOrders.filter(b => b.outcome === 'YES').sort((a, b) => b.limitProb - a.limitProb),
        yesAsks: validOrders.filter(b => b.outcome === 'NO').sort((a, b) => a.limitProb - b.limitProb),
        noBids: validOrders.filter(b => b.outcome === 'NO').sort((a, b) => b.limitProb - a.limitProb),
        noAsks: validOrders.filter(b => b.outcome === 'YES').sort((a, b) => a.limitProb - b.limitProb),
    };
}

// ============================================
// MULTI-BUY (Buy Multiple Answers at Once)
// ============================================

/**
 * Buy YES on multiple answers in a multi-choice market
 * Uses Manifold's arbitrage logic for sum-to-one markets
 */
export function executeSandboxMultiBuy(
    market: SandboxMarket,
    user: SandboxUser,
    answerIds: string[],
    amounts: number[]
): { shares: number[]; probsAfter: number[] } {
    if (!market.answers) {
        throw new Error("Not a multi-choice market");
    }
    if (answerIds.length !== amounts.length) {
        throw new Error("Answer IDs and amounts must match");
    }

    const totalAmount = amounts.reduce((a, b) => a + b, 0);
    if (user.cash < totalAmount) {
        throw new Error("Insufficient balance");
    }

    log('MultiBuy', `Buying ${answerIds.length} answers for $${totalAmount}`, { answerIds, amounts });

    const shares: number[] = [];
    const probsAfter: number[] = [];

    // For INDEPENDENT markets (shouldAnswersSumToOne = false):
    // Use simple CPMM per answer - NO arbitrage, NO rebalancing
    if (market.shouldAnswersSumToOne === false) {
        log('MultiBuy', 'Using independent market logic (no arbitrage)');

        for (let i = 0; i < answerIds.length; i++) {
            const result = executeSandboxAnswerBuy(market, user, answerIds[i], amounts[i]);
            shares.push(result.shares);
            probsAfter.push(result.probAfter);
        }

        return { shares, probsAfter };
    }

    // For SUM-TO-ONE markets (NegRisk/dependent):
    // Use Manifold's arbitrage logic to maintain sum(P) = 1
    log('MultiBuy', 'Using sum-to-one arbitrage logic');


    // Process each answer one at a time using the single-answer arbitrage function
    for (let i = 0; i < answerIds.length; i++) {
        const answerId = answerIds[i];
        const amount = amounts[i];

        // Convert to Manifold format with current state
        const manifoldAnswers: ManifoldAnswer[] = market.answers.map(a => ({
            id: a.id,
            contractId: market.id,
            poolYes: a.pool.YES,
            poolNo: a.pool.NO,
            prob: a.prob,
            p: 0.5,
            text: a.text,
            index: a.index,
            volume: a.volume,
            totalLiquidity: 0,
            subsidyPool: 0,
            createdTime: market.createdTime
        }));

        const answerToBuy = manifoldAnswers.find(a => a.id === answerId);
        if (!answerToBuy) continue;

        // Use Manifold's single-answer arbitrage function
        const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageYesBets(
            manifoldAnswers,
            answerToBuy,
            amount,
            undefined,
            [], // No limit orders for multi-buy
            {}
        );

        // Apply main bet result
        const answerIdx = market.answers.findIndex(a => a.id === answerId);
        if (answerIdx !== -1) {
            market.answers[answerIdx].pool = {
                YES: newBetResult.cpmmState.pool.YES,
                NO: newBetResult.cpmmState.pool.NO
            };
            market.answers[answerIdx].prob = getCpmmProbability(
                { YES: newBetResult.cpmmState.pool.YES, NO: newBetResult.cpmmState.pool.NO },
                0.5
            );

            const totalShares = newBetResult.takers.reduce((sum, t) => sum + t.shares, 0);
            shares.push(totalShares);
            probsAfter.push(market.answers[answerIdx].prob);

            // Update user position
            const posKey = `${market.id}-${answerId}`;
            user.positions[posKey] = (user.positions[posKey] || 0) + totalShares;
        }

        // Apply arbitrage bets on other answers
        for (const result of otherBetResults) {
            const sideIdx = market.answers.findIndex(a => a.id === result.answer.id);
            if (sideIdx !== -1) {
                market.answers[sideIdx].pool = {
                    YES: result.cpmmState.pool.YES,
                    NO: result.cpmmState.pool.NO
                };
                market.answers[sideIdx].prob = getCpmmProbability(
                    { YES: result.cpmmState.pool.YES, NO: result.cpmmState.pool.NO },
                    0.5
                );
            }
        }
    }

    // Update market stats
    user.cash -= totalAmount;
    market.volume += totalAmount;
    market.lastBetTime = Date.now();

    // Verify sum-to-one
    if (market.shouldAnswersSumToOne) {
        const probSum = market.answers.reduce((sum, a) => sum + a.prob, 0);
        log('MultiBuy', `Multi-buy complete. Prob sum: ${probSum.toFixed(4)}`, { shares, probsAfter });
    }

    updateMarketPhase(market);

    return { shares, probsAfter };
}

// ============================================
// MULTI-CHOICE MARKETS (Single Answer)
// ============================================

export function executeSandboxMultiArbitrageBuy(
    market: SandboxMarket,
    user: SandboxUser,
    answerId: string,
    amountUsd: number
): { shares: number; probAfter: number } {
    if (!market.answers) throw new Error("Not a multi-choice market");
    if (user.cash < amountUsd) throw new Error("Insufficient balance");
    if (market.resolution) throw new Error("Market is resolved");

    const manifoldAnswers: ManifoldAnswer[] = market.answers.map(a => ({
        id: a.id,
        contractId: market.id,
        poolYes: a.pool.YES,
        poolNo: a.pool.NO,
        prob: a.prob,
        p: 0.5,
        text: a.text,
        index: a.index,
        volume: a.volume,
        totalLiquidity: 0,
        subsidyPool: 0,
        createdTime: market.createdTime
    }));

    const targetAnswer = manifoldAnswers.find(a => a.id === answerId);
    if (!targetAnswer) throw new Error("Answer not found");

    const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageBet(
        manifoldAnswers,
        targetAnswer,
        'YES',
        amountUsd,
        undefined,
        [],
        {},
        market.collectedFees
    );

    // Apply main bet
    const targetIdx = market.answers.findIndex(a => a.id === answerId);
    market.answers[targetIdx].pool = {
        YES: newBetResult.cpmmState.pool.YES,
        NO: newBetResult.cpmmState.pool.NO
    };
    market.answers[targetIdx].prob = getProb(market.answers[targetIdx].pool, 0.5);

    const yesShares = newBetResult.takers.reduce((sum, t) => sum + t.shares, 0);
    const posKeyYes = `${market.id}-${answerId}`;
    user.positions[posKeyYes] = (user.positions[posKeyYes] || 0) + yesShares;

    // Apply arbitrage bets
    for (const res of otherBetResults) {
        const sideIdx = market.answers.findIndex(a => a.id === res.answer.id);
        if (sideIdx !== -1) {
            market.answers[sideIdx].pool = {
                YES: res.cpmmState.pool.YES,
                NO: res.cpmmState.pool.NO
            };
            market.answers[sideIdx].prob = getProb(market.answers[sideIdx].pool, 0.5);
        }
    }

    user.cash -= amountUsd;
    market.volume += amountUsd;
    market.lastBetTime = Date.now();

    updateMarketPhase(market);

    return {
        shares: yesShares,
        probAfter: market.answers[targetIdx].prob
    };
}

/**
 * Buy YES shares on a single answer in an INDEPENDENT multi-choice market
 * Uses simple CPMM - NO arbitrage, NO rebalancing of sibling answers
 * For markets where shouldAnswersSumToOne = false
 */
export function executeSandboxAnswerBuy(
    market: SandboxMarket,
    user: SandboxUser,
    answerId: string,
    amountUsd: number
): { shares: number; probAfter: number; fees: Fees } {
    if (!market.answers) throw new Error("Not a multi-choice market");
    if (user.cash < amountUsd) throw new Error("Insufficient balance");
    if (market.resolution) throw new Error("Market is resolved");

    const answerIndex = market.answers.findIndex(a => a.id === answerId);
    if (answerIndex === -1) throw new Error("Answer not found");

    // Calculate fees based on market's feeBps
    const feeAmount = (amountUsd * market.feeBps) / 10000;
    const amountAfterFees = amountUsd - feeAmount;
    const fees: Fees = {
        creatorFee: feeAmount * 0.4,  // 40% to creator
        platformFee: feeAmount * 0.5, // 50% to platform
        liquidityFee: feeAmount * 0.1 // 10% to liquidity
    };

    log('IndependentBuy', `Buying answer ${answerId} for $${amountUsd} (fee: $${feeAmount.toFixed(2)})`, { marketId: market.id });

    // Simple CPMM buy - each answer is independent, NO sibling rebalancing
    const { answer: updatedAnswer, shares } = buyAnswerShares(
        market.answers[answerIndex],
        amountAfterFees // Buy with amount after fees
    );

    // Update only this answer's pool (no arbitrage on other answers)
    market.answers[answerIndex] = updatedAnswer;
    market.volume += amountUsd;
    market.lastBetTime = Date.now();
    market.collectedFees = {
        creatorFee: market.collectedFees.creatorFee + fees.creatorFee,
        platformFee: market.collectedFees.platformFee + fees.platformFee,
        liquidityFee: market.collectedFees.liquidityFee + fees.liquidityFee
    };

    // Update user
    user.cash -= amountUsd;
    const posKey = `${market.id}-${answerId}`;
    user.positions[posKey] = (user.positions[posKey] || 0) + shares;

    updateMarketPhase(market);

    log('IndependentBuy', `Buy completed`, {
        shares,
        probAfter: updatedAnswer.prob,
        fees: getFeeTotal(fees),
        otherAnswersUnchanged: true
    });

    return {
        shares,
        probAfter: updatedAnswer.prob,
        fees
    };
}

export function executeSandboxAnswerSell(
    market: SandboxMarket,
    user: SandboxUser,
    answerId: string,
    sharesToSell: number
): { payout: number; probAfter: number } {
    if (!market.answers) {
        throw new Error("Not a multi-choice market");
    }
    if (market.resolution) {
        throw new Error("Market is resolved");
    }

    const answerIndex = market.answers.findIndex(a => a.id === answerId);
    if (answerIndex === -1) {
        throw new Error("Answer not found");
    }

    const posKey = `${market.id}-${answerId}`;
    const currentShares = user.positions[posKey] || 0;
    const actualShares = Math.min(sharesToSell, currentShares);

    if (actualShares <= 0) {
        throw new Error("Insufficient shares");
    }

    const { answer: updatedAnswer, payout } = sellAnswerShares(
        market.answers[answerIndex],
        actualShares
    );

    market.answers[answerIndex] = updatedAnswer;
    market.lastBetTime = Date.now();

    user.cash += payout;
    user.positions[posKey] -= actualShares;

    return {
        payout,
        probAfter: updatedAnswer.prob
    };
}

// ============================================
// ADVANCED LIQUIDITY
// ============================================

/**
 * Add liquidity to a market (Manifold-style)
 */
export function addMarketLiquidity(
    market: SandboxMarket,
    amount: number
): { liquidity: number; newP: number } {
    log('Liquidity', `Adding $${amount} liquidity`, { marketId: market.id });

    if (market.outcomeType === 'BINARY') {
        const { newPool, liquidity, newP } = addCpmmLiquidity(
            market.pool,
            market.p,
            amount
        );

        market.pool = newPool;
        market.p = newP;
        market.totalLiquidity += liquidity;

        return { liquidity, newP };
    }

    // Multi-choice: add to subsidy pool
    market.subsidyPool += amount;

    return { liquidity: amount, newP: market.p };
}

/**
 * Get current liquidity level
 */
export function getMarketLiquidity(market: SandboxMarket): number {
    return getCpmmLiquidity(market.pool, market.p);
}

// ============================================
// NEGRISK OPERATIONS (Polymarket-style)
// Mirrors Solana contract: split_position, merge_positions, convert_positions
// ============================================

/**
 * Split collateral into YES+NO tokens (mirrors contract split_position)
 * User deposits collateral and receives equal YES + NO shares
 */
export function executeSandboxSplit(
    market: SandboxMarket,
    user: SandboxUser,
    answerId: string,
    amount: number
): { yesShares: number; noShares: number } {
    if (!market.answers) throw new Error("Not a multi-choice market");
    if (amount <= 0) throw new Error("Amount must be positive");
    if (user.cash < amount) throw new Error("Insufficient balance");

    const answer = market.answers.find(a => a.id === answerId);
    if (!answer) throw new Error("Answer not found");

    log('NegRisk', `Splitting $${amount} into YES+NO for answer ${answerId}`);

    // Deposit collateral, receive equal YES+NO shares
    user.cash -= amount;
    const posKeyYes = `${market.id}-${answerId}-YES`;
    const posKeyNo = `${market.id}-${answerId}-NO`;
    user.positions[posKeyYes] = (user.positions[posKeyYes] || 0) + amount;
    user.positions[posKeyNo] = (user.positions[posKeyNo] || 0) + amount;

    return { yesShares: amount, noShares: amount };
}

/**
 * Merge YES+NO tokens back to collateral (mirrors contract merge_positions)
 * User burns equal YES + NO shares and receives collateral
 */
export function executeSandboxMerge(
    market: SandboxMarket,
    user: SandboxUser,
    answerId: string,
    amount: number
): { collateral: number } {
    if (!market.answers) throw new Error("Not a multi-choice market");
    if (amount <= 0) throw new Error("Amount must be positive");

    const answer = market.answers.find(a => a.id === answerId);
    if (!answer) throw new Error("Answer not found");

    const posKeyYes = `${market.id}-${answerId}-YES`;
    const posKeyNo = `${market.id}-${answerId}-NO`;
    const yesShares = user.positions[posKeyYes] || 0;
    const noShares = user.positions[posKeyNo] || 0;

    if (yesShares < amount || noShares < amount) {
        throw new Error("Insufficient YES or NO shares for merge");
    }

    log('NegRisk', `Merging ${amount} YES+NO into collateral for answer ${answerId}`);

    // Burn equal YES+NO, receive collateral
    user.positions[posKeyYes] -= amount;
    user.positions[posKeyNo] -= amount;
    user.cash += amount;

    return { collateral: amount };
}

/**
 * Convert NO positions to YES + cash (mirrors contract convert_positions)
 * Polymarket-style NegRisk conversion for ONE-WINNER markets only
 * 
 * @param indexSet - Bitmask of which answers to convert NO from
 * @param amount - Amount of NO shares to convert from each position in indexSet
 * @returns collateralOut and yesSharesMinted for complementary answers
 */
export function executeSandboxConvert(
    market: SandboxMarket,
    user: SandboxUser,
    indexSet: number,
    amount: number
): { collateralOut: number; yesSharesMinted: number[] } {
    if (!market.answers) throw new Error("Not a multi-choice market");
    if (!market.shouldAnswersSumToOne) {
        throw new Error("Convert only works for one-winner (NegRisk) markets");
    }
    if (indexSet <= 0) throw new Error("Invalid index set");
    if (amount <= 0) throw new Error("Amount must be positive");

    const noCount = popcount(indexSet);
    const yesCount = market.answers.length - noCount;

    if (noCount < 1) throw new Error("No convertible positions in index set");

    log('NegRisk', `Converting NO positions (indexSet: ${indexSet}) → YES + $${(noCount - 1) * amount} collateral`);

    // Verify and burn NO shares for each answer in indexSet
    for (let i = 0; i < market.answers.length; i++) {
        if (indexSet & (1 << i)) {
            const posKeyNo = `${market.id}-${market.answers[i].id}-NO`;
            const currentNo = user.positions[posKeyNo] || 0;
            if (currentNo < amount) {
                throw new Error(`Insufficient NO shares for answer ${market.answers[i].id}`);
            }
            user.positions[posKeyNo] = currentNo - amount;
        }
    }

    // Mint YES shares for complementary answers (not in indexSet)
    const yesSharesMinted: number[] = [];
    for (let i = 0; i < market.answers.length; i++) {
        if (!(indexSet & (1 << i))) {
            const posKeyYes = `${market.id}-${market.answers[i].id}-YES`;
            user.positions[posKeyYes] = (user.positions[posKeyYes] || 0) + amount;
            yesSharesMinted.push(amount);
        } else {
            yesSharesMinted.push(0);
        }
    }

    // Collateral out: (noCount - 1) × amount
    const collateralOut = (noCount - 1) * amount;
    user.cash += collateralOut;

    log('NegRisk', `Convert complete: ${collateralOut} collateral, YES to ${yesCount} answers`);

    return { collateralOut, yesSharesMinted };
}

/** Count set bits in a number (popcount) */
function popcount(n: number): number {
    let count = 0;
    while (n) {
        count += n & 1;
        n >>= 1;
    }
    return count;
}

// ============================================
// GRADUATION PHASE MANAGEMENT
// ============================================

export function updateMarketPhase(market: SandboxMarket): void {
    if (checkGraduationEligibility(market.phase, market.volume)) {
        market.phase = 'graduating';
        market.graduationStartTime = Date.now();
        log('Graduation', `Market ${market.id} started graduation`, { volume: market.volume });
    }

    if (checkGraduationComplete(market.phase, market.graduationStartTime)) {
        market.phase = 'main';
        log('Graduation', `Market ${market.id} graduated to MAIN!`);
    }
}

export function checkAllGraduations(): void {
    sandboxMarkets.forEach((market, id) => {
        if (market.phase === 'graduating') {
            updateMarketPhase(market);
            sandboxMarkets.set(id, market);
        }
    });
}

// ============================================
// MARKET RESOLUTION
// ============================================

export function resolveSandboxMarket(
    market: SandboxMarket,
    resolution: Resolution,
    resolutionProbability?: number
): void {
    market.resolution = resolution;
    market.resolutionProbability = resolutionProbability;
    market.resolutionTime = Date.now();
    market.phase = 'resolved';

    // Cancel all unfilled orders and refund
    for (const order of market.unfilledBets) {
        const user = sandboxUsers.get(order.userId);
        if (user) {
            const unfilledAmount = order.orderAmount - order.amount;
            user.cash += unfilledAmount;
        }
    }
    market.unfilledBets = [];

    log('Resolution', `Market ${market.id} resolved: ${resolution}`);
}

export function resolveSandboxAnswer(
    market: SandboxMarket,
    winningAnswerId: string
): void {
    if (!market.answers) {
        throw new Error("Not a multi-choice market");
    }

    market.answers.forEach(answer => {
        answer.resolution = answer.id === winningAnswerId ? 'YES' : 'NO';
    });

    market.resolution = 'YES';
    market.resolutionTime = Date.now();
    market.phase = 'resolved';
}

// ============================================
// ORDER EXPIRATION CLEANUP
// ============================================

/**
 * Clean up expired orders and refund users
 */
export function cleanupExpiredOrders(): void {
    const now = Date.now();

    sandboxMarkets.forEach((market) => {
        if (market.phase !== 'main') return;

        const expiredOrders = market.unfilledBets.filter(
            b => b.expiresAt && b.expiresAt <= now
        );

        for (const order of expiredOrders) {
            const user = sandboxUsers.get(order.userId);
            if (user) {
                const unfilledAmount = order.orderAmount - order.amount;
                user.cash += unfilledAmount;
                log('OrderExpiry', `Order ${order.id} expired, refunded $${unfilledAmount}`);
            }
        }

        market.unfilledBets = market.unfilledBets.filter(
            b => !b.expiresAt || b.expiresAt > now
        );
    });
}

// ============================================
// POOL CREATION HELPER
// ============================================

export function createSandboxPool(initialLiquidityUsd: number): Pool {
    return createPool(initialLiquidityUsd, 0.5);
}
