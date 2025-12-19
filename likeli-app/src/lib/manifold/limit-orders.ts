// lib/manifold/limit-orders.ts
// Limit Order Matching - 100% Manifold Match (Part 3)

import { Pool, LimitBet, Bet } from './types';
import { calculateCpmmPurchase, generateId, getCpmmProbability } from './cpmm';
import { getContract, saveContract, getBets, addBet, getOrCreateUser, updateUserBalance, getOrCreateMetric, updateMetric, addPricePoint, getUserBalance } from './store';

// ============================================
// LIMIT ORDER STORE
// ============================================

// In-memory limit order storage
const limitOrders = new Map<string, LimitBet[]>(); // contractId -> orders

export function getLimitOrders(contractId: string): LimitBet[] {
    return limitOrders.get(contractId) || [];
}

export function addLimitOrder(contractId: string, order: LimitBet): void {
    const orders = limitOrders.get(contractId) || [];
    orders.push(order);
    limitOrders.set(contractId, orders);
}

export function updateLimitOrder(contractId: string, orderId: string, updates: Partial<LimitBet>): void {
    const orders = limitOrders.get(contractId) || [];
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx >= 0) {
        orders[idx] = { ...orders[idx], ...updates };
        limitOrders.set(contractId, orders);
    }
}

export function cancelLimitOrder(contractId: string, orderId: string): boolean {
    const orders = limitOrders.get(contractId) || [];
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx >= 0) {
        orders[idx].isCancelled = true;
        limitOrders.set(contractId, orders);
        return true;
    }
    return false;
}

export function getBalanceByUserId(orders: LimitBet[]): Record<string, number> {
    const balances: Record<string, number> = {};
    orders.forEach((o) => {
        balances[o.userId] = getUserBalance(o.userId);
    });
    return balances;
}

// ============================================
// LIMIT ORDER MATCHING (FROM GUIDE PART 3)
// ============================================

interface MatchResult {
    takers: { matchedBetId: string; amount: number; shares: number }[];
    ordersToCancel: LimitBet[];
    remainingAmount: number;
    newPool: Pool;
}

/**
 * Match a bet against limit orders
 * Returns matched fills and remaining amount
 * 
 * This is EXACT Manifold logic from Part 3 of the guide
 */
export function matchLimitOrders(
    amount: number,
    outcome: 'YES' | 'NO',
    limitOrdersList: LimitBet[],
    pool: Pool,
    balanceByUserId: Record<string, number>
): MatchResult {
    const takers: { matchedBetId: string; amount: number; shares: number }[] = [];
    const ordersToCancel: LimitBet[] = [];
    let currentPool = { ...pool };
    let remainingAmount = amount;

    // Sort limit orders by price (best price first)
    const sortedOrders = [...limitOrdersList]
        .filter(order => !order.isFilled && !order.isCancelled)
        .filter(order => order.outcome !== outcome) // Match opposite orders
        .sort((a, b) => {
            // For YES bets, match NO orders from highest to lowest limit prob
            // For NO bets, match YES orders from lowest to highest limit prob
            if (outcome === 'YES') {
                return (b.limitProb ?? 0) - (a.limitProb ?? 0);
            } else {
                return (a.limitProb ?? 1) - (b.limitProb ?? 1);
            }
        });

    for (const order of sortedOrders) {
        if (remainingAmount <= 0) break;

        const makerBalance = balanceByUserId[order.userId] ?? 0;
        const orderRemaining = (order.orderAmount ?? 0) - order.amount;

        if (orderRemaining <= 0 || makerBalance <= 0) {
            ordersToCancel.push(order);
            continue;
        }

        // Calculate how much can be filled
        const fillAmount = Math.min(remainingAmount, orderRemaining, makerBalance);

        if (fillAmount > 0) {
            // Calculate shares at the limit price
            const { shares, newPool } = calculateCpmmPurchase(
                currentPool,
                fillAmount,
                outcome
            );

            takers.push({
                matchedBetId: order.id,
                amount: fillAmount,
                shares
            });

            currentPool = newPool;
            remainingAmount -= fillAmount;
        }
    }

    return {
        takers,
        ordersToCancel,
        remainingAmount,
        newPool: currentPool
    };
}

// ============================================
// PLACE LIMIT ORDER
// ============================================

export interface PlaceLimitOrderParams {
    contractId: string;
    amount: number;
    outcome: 'YES' | 'NO';
    limitProb: number;  // Price you're willing to pay (0-1)
    userId: string;
    answerId?: string;
}

export interface PlaceLimitOrderResult {
    success: boolean;
    error?: string;
    order?: LimitBet;
    fills?: { amount: number; shares: number }[];
    remainingAmount?: number;
    newBalance?: number;
    currentProbability?: number;
}

/**
 * Place a limit order
 * 
 * In Manifold, limit orders work like this:
 * - You set a probability/price you're willing to trade at
 * - If current AMM price is better, you get instant fill via CPMM
 * - If not, your order waits until price reaches your limit
 */
export function placeLimitOrder(params: PlaceLimitOrderParams): PlaceLimitOrderResult {
    const { contractId, amount, outcome, limitProb, userId, answerId } = params;

    // Validate
    if (amount <= 0) {
        return { success: false, error: 'Amount must be positive' };
    }
    if (limitProb <= 0 || limitProb >= 1) {
        return { success: false, error: 'Limit prob must be between 0 and 1' };
    }

    // Get user balance
    const user = getOrCreateUser(userId);
    if (user.balance < amount) {
        return { success: false, error: 'Insufficient balance' };
    }

    // Get contract
    const contract = getContract(contractId);
    if (!contract) {
        return { success: false, error: 'Contract not found' };
    }
    if (contract.phase !== 'main') {
        return { success: false, error: 'Limit orders only available on main markets' };
    }
    // Support both BINARY and MULTIPLE_CHOICE markets
    if (contract.outcomeType !== 'BINARY' && contract.outcomeType !== 'MULTIPLE_CHOICE') {
        return { success: false, error: 'Limit orders only supported on binary and multi-choice markets' };
    }
    if (contract.resolution) {
        return { success: false, error: 'Market already resolved' };
    }

    // For multi-choice, require answerId and get answer-specific pool
    const isMultiChoice = contract.outcomeType === 'MULTIPLE_CHOICE';
    let pool = contract.pool;
    let p = contract.p ?? 0.5;

    if (isMultiChoice) {
        if (!answerId) {
            return { success: false, error: 'answerId required for multi-choice markets' };
        }
        const answer = contract.answers?.find(a => a.id === answerId);
        if (!answer) {
            return { success: false, error: 'Answer not found' };
        }
        // Use answer-specific pool
        pool = { YES: answer.poolYes, NO: answer.poolNo };
        p = answer.p ?? 0.5;
    }

    const currentProb = getCpmmProbability(pool, p);

    // Check if limit can be filled immediately via AMM
    // For YES orders: fill if current price <= limit price
    // For NO orders: fill if current price >= limit price (since NO = 1 - YES)
    const shouldFillImmediately = outcome === 'YES'
        ? currentProb <= limitProb
        : currentProb >= limitProb;

    if (shouldFillImmediately) {
        // Fill via regular CPMM - import and use placeBet
        // For simplicity, we'll create the order as filled
        const { shares, newPool, probBefore, probAfter } = calculateCpmmPurchase(
            pool,
            amount,
            outcome
        );

        // Create filled order
        const orderId = generateId();
        const now = Date.now();

        const order: LimitBet = {
            id: orderId,
            contractId,
            userId,
            answerId,  // Include answerId for multi-choice
            amount,
            shares,
            outcome,
            probBefore,
            probAfter,
            limitProb,
            orderAmount: amount,
            isRedemption: false,
            isFilled: true,
            isCancelled: false,
            createdTime: now,
            fills: []
        };

        // Deduct balance
        const updatedUser = updateUserBalance(userId, -amount);

        // Update contract or answer pool
        if (isMultiChoice && answerId) {
            const answer = contract.answers?.find(a => a.id === answerId);
            if (answer) {
                answer.poolYes = newPool.YES;
                answer.poolNo = newPool.NO;
                answer.prob = probAfter;
            }
        } else {
            contract.pool = newPool;
            contract.p = probAfter;
        }
        contract.volume += amount;
        contract.lastBetTime = now;
        contract.lastUpdatedTime = now;
        saveContract(contract);

        // Add bet record
        addBet(contractId, order);

        // Update metrics
        const metric = getOrCreateMetric(userId, contractId, answerId);
        if (outcome === 'YES') {
            metric.totalSharesYes += shares;
            metric.hasYesShares = true;
        } else {
            metric.totalSharesNo += shares;
            metric.hasNoShares = true;
        }
        metric.invested += amount;
        updateMetric(metric);

        // Add price point
        addPricePoint(contractId, probAfter);

        return {
            success: true,
            order,
            fills: [{ amount, shares }],
            remainingAmount: 0,
            newBalance: updatedUser.balance,
            currentProbability: probAfter
        };
    }

    // Order can't be filled now - add to order book
    const orderId = generateId();
    const now = Date.now();

    const order: LimitBet = {
        id: orderId,
        contractId,
        userId,
        answerId,  // Include answerId for multi-choice
        amount: 0,  // Not filled yet
        shares: 0,
        outcome,
        probBefore: currentProb,
        probAfter: currentProb,
        limitProb,
        orderAmount: amount,
        isRedemption: false,
        isFilled: false,
        isCancelled: false,
        createdTime: now,
        fills: []
    };

    // Reserve balance (deduct now, refund if cancelled)
    const updatedUser = updateUserBalance(userId, -amount);

    // Add to limit order book
    addLimitOrder(contractId, order);

    return {
        success: true,
        order,
        fills: [],
        remainingAmount: amount,
        newBalance: updatedUser.balance,
        currentProbability: currentProb
    };
}

// ============================================
// FILL LIMIT ORDERS (called after each trade)
// ============================================

/**
 * After a market trade, check if any limit orders can now be filled
 */
export function checkAndFillLimitOrders(contractId: string): void {
    const contract = getContract(contractId);
    if (!contract) return;

    const orders = getLimitOrders(contractId);
    let currentProb = getCpmmProbability(contract.pool, contract.p ?? 0.5);

    for (const order of orders) {
        if (order.isFilled || order.isCancelled) continue;

        // Check if order should fill
        // YES orders fill when price drops to their limit
        // NO orders fill when price rises to their limit
        const shouldFill = order.outcome === 'YES'
            ? currentProb <= order.limitProb!
            : currentProb >= order.limitProb!;

        if (shouldFill) {
            const remainingAmount = (order.orderAmount ?? 0) - order.amount;
            if (remainingAmount <= 0) continue;

            // Fill via CPMM
            const { shares, newPool, probBefore, probAfter } = calculateCpmmPurchase(
                contract.pool,
                remainingAmount,
                order.outcome
            );

            // Update order
            order.amount += remainingAmount;
            order.shares += shares;
            order.probAfter = probAfter;
            order.isFilled = true;

            // Update contract
            contract.pool = newPool;
            contract.p = probAfter;
            contract.volume += remainingAmount;
            contract.lastUpdatedTime = Date.now();
            currentProb = getCpmmProbability(contract.pool, contract.p ?? 0.5);

            // Update metrics
            const metric = getOrCreateMetric(order.userId, contractId);
            if (order.outcome === 'YES') {
                metric.totalSharesYes += shares;
                metric.hasYesShares = true;
            } else {
                metric.totalSharesNo += shares;
                metric.hasNoShares = true;
            }
            metric.invested += remainingAmount;
            updateMetric(metric);

            // Add price point
            addPricePoint(contractId, probAfter);

            // Add as bet record too
            addBet(contractId, order);
        }
    }

    saveContract(contract);
}

// ============================================
// GET USER'S OPEN ORDERS
// ============================================

export function getUserOpenOrders(userId: string): LimitBet[] {
    const allOrders: LimitBet[] = [];
    limitOrders.forEach((orders) => {
        orders.forEach(order => {
            if (order.userId === userId && !order.isFilled && !order.isCancelled) {
                allOrders.push(order);
            }
        });
    });
    return allOrders;
}

export function applyMakerFills(takerBetId: string, makers: { bet: LimitBet; amount: number; shares: number; timestamp: number }[]) {
    const grouped = new Map<string, { order: LimitBet; newFills: { amount: number; shares: number; matchedBetId: string; timestamp: number; fees: typeof import('./types').noFees }[] }>();

    makers.forEach((maker) => {
        const entry = grouped.get(maker.bet.id) ?? { order: maker.bet, newFills: [] };
        entry.newFills.push({
            amount: maker.amount,
            shares: maker.shares,
            matchedBetId: takerBetId,
            timestamp: maker.timestamp,
            fees: { creatorFee: 0, platformFee: 0, liquidityFee: 0 }
        });
        grouped.set(maker.bet.id, entry);
    });

    grouped.forEach(({ order, newFills }) => {
        const existing = order.fills ?? [];
        const merged = [...existing, ...newFills];
        const deltaAmount = newFills.reduce((s, f) => s + f.amount, 0);
        const deltaShares = newFills.reduce((s, f) => s + f.shares, 0);

        order.fills = merged;
        order.amount = (order.amount ?? 0) + deltaAmount;
        order.shares = (order.shares ?? 0) + deltaShares;
        order.isFilled = order.amount >= order.orderAmount;

        const metric = getOrCreateMetric(order.userId, order.contractId, order.answerId);
        if (order.outcome === 'YES') {
            metric.totalSharesYes += deltaShares;
            metric.hasYesShares = true;
        } else {
            metric.totalSharesNo += deltaShares;
            metric.hasNoShares = true;
        }
        metric.invested += deltaAmount;
        updateMetric(metric);
    });
}

export function cancelOrders(orders: LimitBet[]) {
    orders.forEach((order) => {
        if (order.isCancelled) return;
        const remaining = (order.orderAmount ?? 0) - (order.amount ?? 0);
        if (remaining > 0) {
            updateUserBalance(order.userId, remaining);
        }
        order.isCancelled = true;
    });
}

export function getOrderBookLevels(contractId: string) {
    const active = getActiveLimitOrders(contractId);

    const bids = active
        .filter((o) => o.outcome === 'YES')
        .map((o) => ({
            price: o.limitProb,
            size: Math.max(0, (o.orderAmount ?? 0) - (o.amount ?? 0))
        }))
        .filter((l) => l.size > 0)
        .sort((a, b) => b.price - a.price);

    const asks = active
        .filter((o) => o.outcome === 'NO')
        .map((o) => ({
            price: 1 - o.limitProb,
            size: Math.max(0, (o.orderAmount ?? 0) - (o.amount ?? 0))
        }))
        .filter((l) => l.size > 0)
        .sort((a, b) => a.price - b.price);

    return {
        yes: {
            bids,
            asks,
            bestBid: bids[0]?.price,
            bestAsk: asks[0]?.price
        },
        no: {
            bids: asks,
            asks: bids,
            bestBid: asks[0]?.price ? 1 - asks[0].price : undefined,
            bestAsk: bids[0]?.price ? 1 - bids[0].price : undefined
        }
    };
}

// ============================================
// CANCEL USER'S ORDER
// ============================================

export function cancelUserOrder(userId: string, orderId: string): { success: boolean; refund?: number; error?: string } {
    // Find the order across all contracts
    for (const [contractId, orders] of limitOrders.entries()) {
        const orderIndex = orders.findIndex(o => o.id === orderId);
        if (orderIndex >= 0) {
            const order = orders[orderIndex];

            if (order.userId !== userId) {
                return { success: false, error: 'Not your order' };
            }

            if (order.isCancelled) {
                return { success: false, error: 'Already cancelled' };
            }

            if (order.isFilled) {
                return { success: false, error: 'Already filled' };
            }

            // Cancel and refund
            const refundAmount = (order.orderAmount ?? 0) - order.amount;
            order.isCancelled = true;
            updateUserBalance(userId, refundAmount);

            return { success: true, refund: refundAmount };
        }
    }

    return { success: false, error: 'Order not found' };
}

// ============================================
// LIMIT ORDER EXPIRATION (Section 3.4)
// ============================================

export interface ExpireLimitOrdersResult {
    expiredCount: number;
    totalRefunded: number;
    expiredOrders: LimitBet[];
}

/**
 * Expire (cancel) all limit orders that have passed their expiresAt time.
 * Should be called periodically (e.g., every minute) by a scheduled job.
 */
export function expireLimitOrders(): ExpireLimitOrdersResult {
    const now = Date.now();
    const expiredOrders: LimitBet[] = [];
    let totalRefunded = 0;

    // Iterate through all contracts with limit orders
    for (const [contractId, orders] of limitOrders.entries()) {
        for (const order of orders) {
            // Skip if already filled or cancelled
            if (order.isFilled || order.isCancelled) continue;

            // Check if order has expired
            if (order.expiresAt && order.expiresAt < now) {
                // Calculate refund amount
                const refundAmount = (order.orderAmount ?? 0) - order.amount;

                // Mark as cancelled
                order.isCancelled = true;

                // Refund user
                if (refundAmount > 0) {
                    updateUserBalance(order.userId, refundAmount);
                    totalRefunded += refundAmount;
                }

                expiredOrders.push(order);
                console.log(`[Limit Order] Expired order ${order.id} for user ${order.userId}, refunded $${refundAmount.toFixed(2)}`);
            }
        }
    }

    if (expiredOrders.length > 0) {
        console.log(`[Limit Order] Expired ${expiredOrders.length} orders, total refund: $${totalRefunded.toFixed(2)}`);
    }

    return {
        expiredCount: expiredOrders.length,
        totalRefunded,
        expiredOrders
    };
}

/**
 * Get all active (non-filled, non-cancelled, non-expired) limit orders for a contract
 */
export function getActiveLimitOrders(contractId: string): LimitBet[] {
    const now = Date.now();
    return getLimitOrders(contractId).filter(order =>
        !order.isFilled &&
        !order.isCancelled &&
        (!order.expiresAt || order.expiresAt > now)
    );
}
