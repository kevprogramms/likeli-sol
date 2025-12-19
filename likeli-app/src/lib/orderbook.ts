// lib/orderbook.ts
// DEPRECATED: This file is kept for API compatibility but trading now uses CPMM
// See lib/cpmm.ts for the new trading engine

import { Pool, buyShares, sellShares, getProb, createPool } from './cpmm';

export type Outcome = "yes" | "no";
export type Side = "buy" | "sell";

export interface Market {
    id: string;
    question: string;
    status: "open" | "resolved";
    outcome?: Outcome;
    pool?: Pool;
}

export interface Order {
    id: string;
    marketId: string;
    userId: string;
    outcome: Outcome;
    side: Side;
    price: number;
    qty: number;
    remainingQty: number;
    status: "open" | "partial" | "filled" | "cancelled";
    createdAt: number;
}

export interface Trade {
    id: string;
    marketId: string;
    outcome: Outcome;
    price: number;
    qty: number;
    takerOrderId: string;
    makerOrderId: string;
    takerUserId: string;
    makerUserId: string;
    createdAt: number;
}

export interface OutcomePosition {
    userId: string;
    marketId: string;
    outcome: Outcome;
    qty: number;
    avgPrice: number;
    realizedPnl: number;
}

export interface PricePoint {
    marketId: string;
    timestamp: number;
    yesProb: number;
    noProb: number;
}

// Global singleton to survive hot reloads in dev
const globalStore = global as unknown as {
    likeli_markets: Record<string, Market>;
    likeli_orders: Order[];
    likeli_trades: Trade[];
    likeli_positions: OutcomePosition[];
    likeli_priceHistory: PricePoint[];
    likeli_pools: Record<string, Pool>;
};

if (!globalStore.likeli_markets) globalStore.likeli_markets = {};
if (!globalStore.likeli_orders) globalStore.likeli_orders = [];
if (!globalStore.likeli_trades) globalStore.likeli_trades = [];
if (!globalStore.likeli_positions) globalStore.likeli_positions = [];
if (!globalStore.likeli_priceHistory) globalStore.likeli_priceHistory = [];
if (!globalStore.likeli_pools) globalStore.likeli_pools = {};

export const markets = globalStore.likeli_markets;
export const orders = globalStore.likeli_orders;
export const trades = globalStore.likeli_trades;
export const positions = globalStore.likeli_positions;
export const priceHistory = globalStore.likeli_priceHistory;
export const pools = globalStore.likeli_pools;

let idCounter = 1;
function nextId(prefix: string): string {
    return `${prefix}_${idCounter++}`;
}

function getOrCreatePosition(
    userId: string,
    marketId: string,
    outcome: Outcome
): OutcomePosition {
    let pos = positions.find(
        (p) =>
            p.userId === userId &&
            p.marketId === marketId &&
            p.outcome === outcome
    );
    if (!pos) {
        pos = {
            userId,
            marketId,
            outcome,
            qty: 0,
            avgPrice: 0,
            realizedPnl: 0,
        };
        positions.push(pos);
    }
    return pos;
}

function getOrCreatePool(marketId: string): Pool {
    if (!pools[marketId]) {
        pools[marketId] = createPool(1000, 0.5); // Default pool
    }
    return pools[marketId];
}

export interface NewOrderInput {
    marketId: string;
    userId: string;
    outcome: Outcome;
    side: Side;
    price: number;
    qty: number;
}

export type SubmitOrderResult =
    | { ok: true; order: Order; trades: Trade[] }
    | { ok: false; error: string };

/**
 * Submit order using CPMM (replaces old order book matching)
 */
export function submitLimitOrder(input: NewOrderInput): SubmitOrderResult {
    const { marketId, userId, outcome, side } = input;
    let { price, qty } = input;

    if (qty <= 0 || !Number.isFinite(qty)) {
        return { ok: false, error: "INVALID_QTY" };
    }
    if (!Number.isFinite(price) || price < 0 || price > 1) {
        return { ok: false, error: "INVALID_PRICE" };
    }

    price = Math.round(price * 100) / 100;

    const pos = getOrCreatePosition(userId, marketId, outcome);

    // For sells, check user has enough shares
    if (side === "sell") {
        if (pos.qty + 1e-8 < qty) {
            return { ok: false, error: "INSUFFICIENT_SHARES" };
        }
    }

    const pool = getOrCreatePool(marketId);
    const normalizedOutcome = outcome.toUpperCase() === "YES" ? "YES" : "NO";

    let tradePrice: number;
    let tradeQty: number;

    if (side === "buy") {
        // In CPMM, user pays amount and gets shares
        const amount = price * qty;
        const result = buyShares(pool as Pool, normalizedOutcome as 'YES' | 'NO', amount);
        pools[marketId] = result.newPool;
        tradeQty = result.shares;
        tradePrice = amount / tradeQty;

        // Update position
        const totalCost = pos.qty * pos.avgPrice + amount;
        pos.qty += tradeQty;
        pos.avgPrice = pos.qty > 0 ? totalCost / pos.qty : 0;
    } else {
        // Sell
        const sharesToSell = Math.min(qty, pos.qty);
        const result = sellShares(pool as Pool, normalizedOutcome as 'YES' | 'NO', sharesToSell);
        pools[marketId] = result.newPool;
        tradeQty = sharesToSell;
        tradePrice = result.payout / sharesToSell;

        // Update position
        const costBasis = sharesToSell * pos.avgPrice;
        const pnl = result.payout - costBasis;
        pos.realizedPnl += pnl;
        pos.qty -= sharesToSell;
        if (pos.qty <= 0) {
            pos.avgPrice = 0;
        }
    }

    // Create order record
    const order: Order = {
        id: nextId("order"),
        marketId,
        userId,
        outcome,
        side,
        price: tradePrice,
        qty: tradeQty,
        remainingQty: 0,
        status: "filled",
        createdAt: Date.now(),
    };

    // Create trade record
    const trade: Trade = {
        id: nextId("trade"),
        marketId,
        outcome,
        price: tradePrice,
        qty: tradeQty,
        takerOrderId: order.id,
        makerOrderId: "CPMM",
        takerUserId: userId,
        makerUserId: "CPMM",
        createdAt: Date.now(),
    };
    trades.push(trade);

    recordPriceSnapshot(marketId);

    return { ok: true, order, trades: [trade] };
}

// ---- ORDERBOOK (Deprecated - now uses pool) ----

export interface OrderbookLevel {
    price: number;
    qty: number;
}

export interface OutcomeOrderbook {
    bids: OrderbookLevel[];
    asks: OrderbookLevel[];
    bestBid?: number;
    bestAsk?: number;
}

export interface MarketOrderbook {
    yes: OutcomeOrderbook;
    no: OutcomeOrderbook;
    probability: number;
}

export function getOrderbook(marketId: string): MarketOrderbook {
    // Return synthetic orderbook from CPMM pool
    const pool = getOrCreatePool(marketId);
    const prob = getProb(pool);

    return {
        yes: { bids: [], asks: [], bestBid: prob - 0.01, bestAsk: prob + 0.01 },
        no: { bids: [], asks: [], bestBid: 1 - prob - 0.01, bestAsk: 1 - prob + 0.01 },
        probability: prob * 100,
    };
}

// ---- PRICE HISTORY FOR CHART ----

export function recordPriceSnapshot(marketId: string): void {
    const pool = getOrCreatePool(marketId);
    const yesProb = getProb(pool);
    const noProb = 1 - yesProb;
    priceHistory.push({
        marketId,
        timestamp: Date.now(),
        yesProb,
        noProb,
    });
}

export function getPriceHistory(marketId: string): PricePoint[] {
    return priceHistory
        .filter((p) => p.marketId === marketId)
        .sort((a, b) => a.timestamp - b.timestamp);
}

export function getUserPositions(userId: string, marketId: string): OutcomePosition[] {
    return positions.filter(p => p.userId === userId && p.marketId === marketId);
}
