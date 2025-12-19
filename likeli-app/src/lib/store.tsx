"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { Pool, buyShares, sellShares, getProb, createPool } from "./cpmm";

// --- Types ---

export type MarketType = "yes_no" | "multiple_choice";
export type MarketStatus = "active" | "resolved" | "void";

export interface Market {
    id: string;
    question: string;
    category: string;
    type: MarketType;
    status: MarketStatus;
    resolutionDate: string;
    image?: string;

    // Liquidity & Volume
    liquidity: number;
    volume: number;

    // CPMM Pool (replaces orderBook)
    pool: Pool;

    // Outcomes (for yes_no: 0=YES, 1=NO)
    outcomes: {
        id: string;
        name: string;
        price: number; // 0.0 to 1.0 - derived from pool
    }[];

    // Graduation
    isGraduated: boolean;
    creatorId: string;

    // Resolution
    resolutionResult?: string; // outcomeId that won

    // Sandbox Extensions (for compatibility)
    phase?: "sandbox_curve" | "main_clob";
    rules?: string;

    // History
    probabilityHistory: ProbabilityTick[];
    priceHistory: { t: number; yesPrice: number; noPrice: number }[];
}

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';

// Keep Order type for backward compatibility but not used in CPMM
export interface Order {
    id: string;
    marketId: string;
    outcome: 'YES' | 'NO';
    side: OrderSide;
    type: OrderType;
    price: number;
    size: number;
    createdAt: number;
    ownerId: string;
}

export type OrderBookRow = { price: number; size: number; total: number; };
export type OrderBookSide = OrderBookRow[];

// Deprecated - kept for backward compatibility
export interface OrderBook {
    marketId: string;
    bids: Order[];
    asks: Order[];
    lastTradePriceYes?: number;
    lastTradeAt?: number;
}

export type ProbabilityTick = {
    timestamp: number;
    yesPrice: number | null;
    noPrice: number | null;
};

export type Outcome = 'YES' | 'NO';

export interface Position {
    marketId: string;
    outcome: Outcome;
    shares: number;
    avgPrice: number;
    realizedPnl: number;
}

export interface ParlayLeg {
    marketId: string;
    outcomeId: string;
    outcomeName: string;
    marketQuestion: string;
    prob: number;
}

export interface ParlayBet {
    id: string;
    legs: ParlayLeg[];
    stake: number;
    multiplier: number;
    potentialPayout: number;
    status: "open" | "won" | "lost" | "void";
    createdAt: number;
}

export type TradeKind = "single" | "parlay" | "perp";

export interface EquityPoint {
    ts: number;
    equity: number;
    pnl: number;
}

export interface TradeHistoryItem {
    id: string;
    ts: number;
    kind: TradeKind;
    marketId: string | null;
    description: string;
    side: string;
    size: number;
    leverage?: number | null;
    entryPrice?: number | null;
    exitPrice?: number | null;
    status: "open" | "closed" | "settled" | "void";
    realizedPnl: number;
    potentialPayout?: number | null;
}

export interface User {
    id: string;
    balance: number;
    positions: Position[];
    parlays: ParlayBet[];
    perps: any[];
    history: TradeHistoryItem[];
    equityHistory: EquityPoint[];
}

interface StoreContextType {
    currentUser: User;
    markets: Market[];
    buy: (marketId: string, outcomeId: string, amountUSD: number) => void;
    sell: (marketId: string, outcomeId: string, amountShares: number) => void;
    placeMarketOrder: (marketId: string, outcomeId: string, side: OrderSide, size: number) => void;
    placeLimitOrder: (marketId: string, side: OrderSide, price: number, size: number) => void;
    createMarket: (data: Partial<Market>) => void;
    placeParlay: (legs: { marketId: string; outcomeId: string }[], stake: number) => void;
    resolveMarket: (marketId: string, winningOutcomeId: string) => void;
    getMarketPrice: (market: Market) => number;
    loading: boolean;
}

// --- Mock Data with CPMM Pools ---

// Helper to create initial market with CPMM pool
function createInitialMarket(
    id: string,
    question: string,
    category: string,
    resolutionDate: string,
    liquidity: number,
    volume: number,
    initialYesProb: number,
    isGraduated: boolean = true,
    creatorId: string = "system"
): Market {
    const pool = createPool(liquidity, initialYesProb);
    const yesPrice = getProb(pool);
    const noPrice = 1 - yesPrice;

    // Generate some historical points ending at current price
    const now = Date.now();
    const historyPoints = [
        { timestamp: now - 86400000 * 4, yesPrice: initialYesProb * 0.9, noPrice: 1 - initialYesProb * 0.9 },
        { timestamp: now - 86400000 * 3, yesPrice: initialYesProb * 1.05, noPrice: 1 - initialYesProb * 1.05 },
        { timestamp: now - 86400000 * 2, yesPrice: initialYesProb * 0.95, noPrice: 1 - initialYesProb * 0.95 },
        { timestamp: now - 86400000, yesPrice: initialYesProb * 1.02, noPrice: 1 - initialYesProb * 1.02 },
        { timestamp: now - 43200000, yesPrice: initialYesProb * 0.98, noPrice: 1 - initialYesProb * 0.98 },
        { timestamp: now, yesPrice, noPrice },
    ];

    return {
        id,
        question,
        category,
        type: "yes_no",
        status: "active",
        resolutionDate,
        liquidity,
        volume,
        pool,
        outcomes: [
            { id: "yes", name: "Yes", price: yesPrice },
            { id: "no", name: "No", price: noPrice },
        ],
        isGraduated,
        creatorId,
        probabilityHistory: historyPoints,
        priceHistory: historyPoints.map(h => ({ t: h.timestamp, yesPrice: h.yesPrice, noPrice: h.noPrice })),
    };
}

const INITIAL_MARKETS: Market[] = [
    createInitialMarket("m1", "Will Bitcoin hit $100k by 2025?", "Crypto", "2024-12-31", 50000, 125000, 0.65),
    createInitialMarket("m2", "Will the Fed cut rates in December?", "Politics", "2024-12-18", 20000, 45000, 0.40),
    createInitialMarket("m3", "Will 'Dune: Part 3' be announced this month?", "Movies", "2024-11-30", 1000, 500, 0.20, false, "user123"),
];

const INITIAL_USER: User = {
    id: "u1",
    balance: 10000,
    positions: [],
    parlays: [],
    perps: [],
    history: [],
    equityHistory: [],
};

// --- Store Implementation ---

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
    const { accountId } = useAuth();
    const [usersById, setUsersById] = useState<Record<string, User>>({});
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [markets, setMarkets] = useState<Market[]>(INITIAL_MARKETS);
    const [loading, setLoading] = useState(true);

    // Load from localStorage
    useEffect(() => {
        const savedUsers = localStorage.getItem("likeli_demo_users");
        const savedMarkets = localStorage.getItem("likeli_markets");

        if (savedUsers) {
            try {
                const parsedUsers = JSON.parse(savedUsers);
                Object.keys(parsedUsers).forEach(uid => {
                    const u = parsedUsers[uid];
                    if (!u.history) u.history = [];
                    if (!u.equityHistory) u.equityHistory = [];
                    if (!u.perps) u.perps = [];
                    if (!u.parlays) u.parlays = [];
                    if (!u.positions) u.positions = [];
                });
                setUsersById(parsedUsers);
            } catch (e) {
                console.error("Failed to parse users from local storage", e);
            }
        }

        if (savedMarkets) {
            try {
                const parsedMarkets = JSON.parse(savedMarkets);
                // Migration: Ensure all markets have CPMM pools
                const migratedMarkets = parsedMarkets.map((m: any) => {
                    // If market has old orderBook but no pool, create pool from current price
                    if (!m.pool) {
                        const currentYesPrice = m.outcomes?.find((o: any) => o.id === "yes")?.price || 0.5;
                        m.pool = createPool(m.liquidity || 1000, currentYesPrice);
                    }

                    // Ensure history arrays exist
                    if (!m.probabilityHistory || m.probabilityHistory.length < 5) {
                        const prob = getProb(m.pool);
                        m.probabilityHistory = [
                            { timestamp: Date.now() - 86400000 * 4, yesPrice: prob * 0.9, noPrice: 1 - prob * 0.9 },
                            { timestamp: Date.now() - 86400000 * 2, yesPrice: prob * 1.05, noPrice: 1 - prob * 1.05 },
                            { timestamp: Date.now(), yesPrice: prob, noPrice: 1 - prob },
                        ];
                    }
                    if (!m.priceHistory || m.priceHistory.length === 0) {
                        m.priceHistory = m.probabilityHistory.map((h: any) => ({
                            t: h.timestamp,
                            yesPrice: h.yesPrice,
                            noPrice: h.noPrice
                        }));
                    }

                    return m;
                });
                setMarkets(migratedMarkets);
            } catch (e) {
                console.error("Failed to parse markets from local storage", e);
                setMarkets(INITIAL_MARKETS);
            }
        } else {
            setMarkets(INITIAL_MARKETS);
        }
        setLoading(false);
    }, []);

    // Sync currentUserId with AuthContext accountId
    useEffect(() => {
        if (!accountId) {
            setCurrentUserId(null);
            return;
        }

        setCurrentUserId(accountId);

        setUsersById(prev => {
            if (prev[accountId]) return prev;

            return {
                ...prev,
                [accountId]: {
                    ...INITIAL_USER,
                    id: accountId,
                    balance: 10000,
                }
            };
        });
    }, [accountId]);

    // Save to localStorage
    useEffect(() => {
        if (!loading) {
            localStorage.setItem("likeli_demo_users", JSON.stringify(usersById));
            localStorage.setItem("likeli_markets", JSON.stringify(markets));
        }
    }, [usersById, markets, loading]);

    const currentUser = currentUserId && usersById[currentUserId]
        ? { ...INITIAL_USER, ...usersById[currentUserId] }
        : { ...INITIAL_USER, id: "guest", balance: 0 };

    // --- CPMM Trading Actions ---

    /**
     * Get current YES probability from market pool
     */
    const getMarketPrice = (market: Market): number => {
        return getProb(market.pool);
    };

    /**
     * Update market outcomes based on current pool state
     */
    const updateMarketOutcomes = (market: Market): void => {
        const yesPrice = getProb(market.pool);
        market.outcomes = [
            { id: "yes", name: "Yes", price: yesPrice },
            { id: "no", name: "No", price: 1 - yesPrice },
        ];
    };

    /**
     * Record price history point
     */
    const recordPriceHistory = (market: Market): void => {
        const yesPrice = getProb(market.pool);
        const noPrice = 1 - yesPrice;
        const now = Date.now();

        market.probabilityHistory.push({
            timestamp: now,
            yesPrice,
            noPrice,
        });
        market.priceHistory.push({
            t: now,
            yesPrice,
            noPrice,
        });

        // Keep only last 100 points
        if (market.probabilityHistory.length > 100) {
            market.probabilityHistory = market.probabilityHistory.slice(-100);
        }
        if (market.priceHistory.length > 100) {
            market.priceHistory = market.priceHistory.slice(-100);
        }
    };

    /**
     * Buy shares using CPMM
     */
    const buy = (marketId: string, outcomeId: string, amountUSD: number) => {
        if (!currentUserId) return;
        if (amountUSD <= 0) return;

        const outcome: Outcome = outcomeId.toUpperCase() === "YES" ? "YES" : "NO";

        setMarkets(prev => prev.map(m => {
            if (m.id !== marketId) return m;

            // Execute CPMM buy
            const result = buyShares(m.pool, outcome, amountUSD);

            // Update market
            const updatedMarket = {
                ...m,
                pool: result.newPool,
                volume: m.volume + amountUSD,
            };
            updateMarketOutcomes(updatedMarket);
            recordPriceHistory(updatedMarket);

            return updatedMarket;
        }));

        setUsersById(prev => {
            const user = prev[currentUserId];
            if (!user) return prev;
            if (user.balance < amountUSD) {
                console.warn("Insufficient balance");
                return prev;
            }

            // Find market to get shares
            const market = markets.find(m => m.id === marketId);
            if (!market) return prev;

            const result = buyShares(market.pool, outcome, amountUSD);
            const shares = result.shares;
            const price = amountUSD / shares; // Effective price per share

            // Update position
            let posIndex = user.positions.findIndex(p => p.marketId === marketId && p.outcome === outcome);
            let newPositions = [...user.positions];

            if (posIndex >= 0) {
                const pos = newPositions[posIndex];
                const totalCost = pos.shares * pos.avgPrice + amountUSD;
                const totalShares = pos.shares + shares;
                newPositions[posIndex] = {
                    ...pos,
                    shares: totalShares,
                    avgPrice: totalShares > 0 ? totalCost / totalShares : 0,
                };
            } else {
                newPositions.push({
                    marketId,
                    outcome,
                    shares,
                    avgPrice: price,
                    realizedPnl: 0,
                });
            }

            // Create history item
            const historyItem: TradeHistoryItem = {
                id: Math.random().toString(36).substr(2, 9),
                ts: Date.now(),
                kind: "single",
                marketId,
                description: `BUY ${outcome}`,
                side: `BUY ${outcome}`,
                size: amountUSD,
                entryPrice: price,
                status: "open",
                realizedPnl: 0,
            };

            return {
                ...prev,
                [currentUserId]: {
                    ...user,
                    balance: user.balance - amountUSD,
                    positions: newPositions,
                    history: [historyItem, ...user.history],
                }
            };
        });
    };

    /**
     * Sell shares using CPMM
     */
    const sell = (marketId: string, outcomeId: string, amountShares: number) => {
        if (!currentUserId) return;
        if (amountShares <= 0) return;

        const outcome: Outcome = outcomeId.toUpperCase() === "YES" ? "YES" : "NO";

        // Find user's position first
        const user = usersById[currentUserId];
        if (!user) return;

        const posIndex = user.positions.findIndex(p => p.marketId === marketId && p.outcome === outcome);
        if (posIndex < 0) {
            console.warn("No position to sell");
            return;
        }

        const pos = user.positions[posIndex];
        const sharesToSell = Math.min(amountShares, pos.shares);
        if (sharesToSell <= 0) return;

        // Get payout from market
        const market = markets.find(m => m.id === marketId);
        if (!market) return;

        const result = sellShares(market.pool, outcome, sharesToSell);
        const payout = result.payout;

        setMarkets(prev => prev.map(m => {
            if (m.id !== marketId) return m;

            const updatedMarket = {
                ...m,
                pool: result.newPool,
            };
            updateMarketOutcomes(updatedMarket);
            recordPriceHistory(updatedMarket);

            return updatedMarket;
        }));

        setUsersById(prev => {
            const user = prev[currentUserId];
            if (!user) return prev;

            let newPositions = [...user.positions];
            const pos = { ...newPositions[posIndex] };

            // Calculate realized PnL
            const costBasis = sharesToSell * pos.avgPrice;
            const realizedPnl = payout - costBasis;

            pos.shares -= sharesToSell;
            pos.realizedPnl += realizedPnl;

            if (pos.shares <= 0.0001) {
                newPositions.splice(posIndex, 1);
            } else {
                newPositions[posIndex] = pos;
            }

            // Create history item
            const historyItem: TradeHistoryItem = {
                id: Math.random().toString(36).substr(2, 9),
                ts: Date.now(),
                kind: "single",
                marketId,
                description: `SELL ${outcome}`,
                side: `SELL ${outcome}`,
                size: payout,
                exitPrice: payout / sharesToSell,
                status: "closed",
                realizedPnl,
            };

            return {
                ...prev,
                [currentUserId]: {
                    ...user,
                    balance: user.balance + payout,
                    positions: newPositions,
                    history: [historyItem, ...user.history],
                }
            };
        });
    };

    /**
     * Place market order (wrapper for buy/sell)
     * In CPMM, all orders execute at market price
     */
    const placeMarketOrder = (marketId: string, outcomeId: string, side: OrderSide, size: number) => {
        if (side === 'BUY') {
            // For buy, size is USD amount
            const market = markets.find(m => m.id === marketId);
            if (!market) return;

            const outcome = outcomeId.toUpperCase() === "YES" ? "YES" : "NO";
            const price = outcome === "YES" ? getProb(market.pool) : 1 - getProb(market.pool);
            const amountUSD = size * price;

            buy(marketId, outcomeId, amountUSD);
        } else {
            // For sell, size is shares
            sell(marketId, outcomeId, size);
        }
    };

    /**
     * Place limit order - in CPMM, this just executes as market order
     * (Limit orders not supported in pure CPMM)
     */
    const placeLimitOrder = (marketId: string, side: OrderSide, price: number, size: number) => {
        // In CPMM, execute as market order
        placeMarketOrder(marketId, 'yes', side, size);
    };

    /**
     * Create a new market with CPMM pool
     */
    const createMarket = (data: Partial<Market>) => {
        if (!currentUserId) return;

        const creationCost = 50;
        const liquidity = data.liquidity || 100;

        if (currentUser.balance < creationCost + liquidity) {
            alert("Insufficient balance for creation fee + liquidity");
            return;
        }

        const pool = createPool(liquidity, 0.5); // Start at 50/50

        const newMarket: Market = {
            id: Math.random().toString(36).substr(2, 9),
            question: data.question || "Untitled Market",
            category: data.category || "General",
            type: "yes_no",
            status: "active",
            resolutionDate: data.resolutionDate || "2025-01-01",
            liquidity,
            volume: 0,
            pool,
            isGraduated: false,
            creatorId: currentUser.id,
            outcomes: [
                { id: "yes", name: "Yes", price: 0.5 },
                { id: "no", name: "No", price: 0.5 },
            ],
            probabilityHistory: [{ timestamp: Date.now(), yesPrice: 0.5, noPrice: 0.5 }],
            priceHistory: [{ t: Date.now(), yesPrice: 0.5, noPrice: 0.5 }],
            ...data,
        };

        setMarkets(prev => [...prev, newMarket]);

        setUsersById(prev => {
            const user = prev[currentUserId];
            if (!user) return prev;

            return {
                ...prev,
                [currentUserId]: {
                    ...user,
                    balance: user.balance - creationCost - liquidity,
                }
            };
        });
    };

    /**
     * Place a parlay bet
     */
    const placeParlay = (legs: { marketId: string; outcomeId: string }[], stake: number) => {
        if (!currentUserId) return;

        if (currentUser.balance < stake) {
            alert("Insufficient balance");
            return;
        }

        if (legs.length < 2 || legs.length > 5) {
            alert("Parlays require 2-5 legs");
            return;
        }

        // Check for duplicate markets
        const marketIds = legs.map(l => l.marketId);
        if (new Set(marketIds).size !== marketIds.length) {
            alert("Cannot add the same market twice to a parlay");
            return;
        }

        const parlayLegs: ParlayLeg[] = [];
        let combinedProb = 1;

        for (const leg of legs) {
            const m = markets.find(mk => mk.id === leg.marketId);
            if (!m) return;
            const o = m.outcomes.find(oc => oc.id === leg.outcomeId);
            if (!o) return;

            combinedProb *= o.price;
            parlayLegs.push({
                marketId: m.id,
                outcomeId: o.id,
                outcomeName: o.name,
                marketQuestion: m.question,
                prob: o.price,
            });
        }

        const houseEdge = 0.05;
        const multiplier = (1 / combinedProb) * (1 - houseEdge);
        const potentialPayout = stake * multiplier;

        const newParlay: ParlayBet = {
            id: Math.random().toString(36).substr(2, 9),
            legs: parlayLegs,
            stake,
            multiplier,
            potentialPayout,
            status: "open",
            createdAt: Date.now(),
        };

        setUsersById(prev => {
            const user = prev[currentUserId];
            if (!user) return prev;

            const historyItem: TradeHistoryItem = {
                id: Math.random().toString(36).substr(2, 9),
                ts: Date.now(),
                kind: "parlay",
                marketId: null,
                description: `Parlay (${parlayLegs.length} legs)`,
                side: "Long",
                size: stake,
                status: "open",
                realizedPnl: 0,
                potentialPayout,
            };

            const updatedUser = {
                ...user,
                balance: user.balance - stake,
                parlays: [...user.parlays, newParlay],
                history: [historyItem, ...user.history],
            };

            const equityPoint: EquityPoint = {
                ts: Date.now(),
                equity: updatedUser.balance,
                pnl: updatedUser.balance - 10000,
            };

            return {
                ...prev,
                [currentUserId]: {
                    ...updatedUser,
                    equityHistory: [...updatedUser.equityHistory, equityPoint],
                }
            };
        });
    };

    /**
     * Resolve a market
     */
    const resolveMarket = (marketId: string, winningOutcomeId: string) => {
        setMarkets(prev =>
            prev.map(m =>
                m.id === marketId
                    ? { ...m, status: "resolved", resolutionResult: winningOutcomeId }
                    : m
            )
        );

        setTimeout(() => settleForMarket(marketId, winningOutcomeId), 100);
    };

    /**
     * Settle positions for a resolved market
     */
    const settleForMarket = (marketId: string, winningOutcomeId: string) => {
        setUsersById(prev => {
            const nextUsers = { ...prev };

            Object.keys(nextUsers).forEach(userId => {
                const user = nextUsers[userId];
                let newBalance = user.balance;

                const newPositions = user.positions.filter(p => {
                    if (p.marketId !== marketId) return true;

                    // Payout winning shares at $1 each
                    if (p.outcome === "YES" && winningOutcomeId === "yes") {
                        newBalance += p.shares;
                    } else if (p.outcome === "NO" && winningOutcomeId === "no") {
                        newBalance += p.shares;
                    }
                    return false;
                });

                const newParlays = user.parlays.map(parlay => {
                    if (parlay.status !== "open") return parlay;

                    // Check if any leg in this parlay matches the resolved market
                    const matchingLeg = parlay.legs.find(l => l.marketId === marketId);
                    if (!matchingLeg) return parlay;

                    // If the matching leg lost, the whole parlay loses
                    if (matchingLeg.outcomeId !== winningOutcomeId) {
                        return { ...parlay, status: "lost" as const };
                    }

                    // Check all other legs to see if parlay can be resolved
                    const otherLegs = parlay.legs.filter(l => l.marketId !== marketId);

                    // Check if all other legs are resolved and won
                    let allOthersWon = true;
                    let anyOtherPending = false;

                    for (const otherLeg of otherLegs) {
                        const otherMarket = markets.find(m => m.id === otherLeg.marketId);
                        if (!otherMarket || otherMarket.status !== "resolved") {
                            anyOtherPending = true;
                            break;
                        }
                        if (otherMarket.resolutionResult !== otherLeg.outcomeId) {
                            allOthersWon = false;
                            break;
                        }
                    }

                    // If any leg is still pending, parlay stays open
                    if (anyOtherPending) {
                        return parlay;
                    }

                    // All legs resolved - determine final outcome
                    if (allOthersWon) {
                        newBalance += parlay.potentialPayout;
                        return { ...parlay, status: "won" as const };
                    } else {
                        return { ...parlay, status: "lost" as const };
                    }
                });

                let newHistory = user.history;
                if (newBalance !== user.balance) {
                    const pnl = newBalance - user.balance;
                    const historyItem: TradeHistoryItem = {
                        id: Math.random().toString(36).substr(2, 9),
                        ts: Date.now(),
                        kind: "single",
                        marketId,
                        description: `Settlement for ${marketId}`,
                        side: "Settlement",
                        size: 0,
                        status: "settled",
                        realizedPnl: pnl,
                    };
                    newHistory = [historyItem, ...user.history];
                }

                nextUsers[userId] = {
                    ...user,
                    balance: newBalance,
                    positions: newPositions,
                    parlays: newParlays,
                    history: newHistory,
                };
            });

            return nextUsers;
        });
    };

    return (
        <StoreContext.Provider
            value={{
                currentUser,
                markets,
                buy,
                sell,
                placeMarketOrder,
                placeLimitOrder,
                createMarket,
                placeParlay,
                resolveMarket,
                getMarketPrice,
                loading,
            }}
        >
            {children}
        </StoreContext.Provider>
    );
}

export function useStore() {
    const context = useContext(StoreContext);
    if (context === undefined) {
        throw new Error("useStore must be used within a StoreProvider");
    }
    return context;
}
