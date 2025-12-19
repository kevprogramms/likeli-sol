"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import MyBets from "./MyBets";
import MyOrders from "./MyOrders";
import { TrendingUp, Wallet, ListOrdered } from "lucide-react";

interface TradePanelProps {
    mode: "simple" | "advanced";
    market: any; // Using any for now to decouple from store types completely
    onOrderPlaced?: () => void;
    currentPrice?: number; // Current YES price (0-1)
    bestAsk?: number;      // Best Ask price for YES (to estimate Buy shares)
    onOutcomeChange?: (outcome: 'yes' | 'no') => void;
}

export default function TradePanel({ mode, market, onOrderPlaced, currentPrice = 0.5, bestAsk, onOutcomeChange }: TradePanelProps) {
    // Local state for form
    const [tradeSide, setTradeSide] = useState<"BUY" | "SELL">("BUY");
    const [outcomeId, setOutcomeId] = useState<"yes" | "no">("yes");
    const [amount, setAmount] = useState("");
    const [limitPrice, setLimitPrice] = useState("");
    const [isLimit, setIsLimit] = useState(false);

    // Dynamic Prices (Sandbox support)
    const marketPhase = market?.phase;
    const isGraduating = marketPhase === "graduating";
    const isManifoldMarket = market?.mechanism?.startsWith('cpmm') || market?.pool !== undefined;
    const isMainManifold = marketPhase === "main"; // Simplified: Main is Main
    const limitDisabled = marketPhase !== "main"; // Rule: Only Main markets have Limit Orders
    const [yesPriceState, setYesPriceState] = useState(market?.currentPrices?.probYes ?? currentPrice);
    const [noPriceState, setNoPriceState] = useState(market?.currentPrices?.probNo ?? (1 - currentPrice));

    // Dynamic balance - starts at $10,000, updates from trade response
    const [balance, setBalance] = useState(10000.00);

    // User positions - shares held
    const [yesShares, setYesShares] = useState(0);
    const [noShares, setNoShares] = useState(0);

    // Fetch user positions on mount and after trades
    const fetchPositions = async () => {
        if (!market?.id) return;
        try {
            const res = await fetch(`/api/manifold/positions?contractId=${market.id}&userId=demo-user&t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                setYesShares(data.yesShares ?? 0);
                setNoShares(data.noShares ?? 0);
            }
        } catch (e) {
            console.error('Failed to fetch positions', e);
        }
    };

    useEffect(() => {
        // Fetch positions when market loads or when switching to SELL tab
        if (market?.id) {
            fetchPositions();
        }
    }, [market?.id, tradeSide]);

    useEffect(() => {
        if (limitDisabled && isLimit) {
            setIsLimit(false);
            setLimitPrice("");
        }
    }, [limitDisabled, isLimit]);

    const tradingDisabled = isGraduating;

    // Display Price
    const displayPrice = outcomeId === 'yes' ? yesPriceState : noPriceState;

    const handlePlaceOrder = async () => {
        if (isGraduating) {
            alert("Trading is paused while this market is graduating.");
            return;
        }

        if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            alert("Please enter a valid amount");
            return;
        }

        const priceNum = parseFloat(limitPrice);
        const qtyNum = parseFloat(amount);

        // Validation for Limit
        if (isLimit && (isNaN(priceNum) || priceNum <= 0 || priceNum >= 1)) {
            alert("Please enter a valid limit price (0.01 - 0.99)");
            return;
        }
        if (isLimit && isManifoldMarket && !isMainManifold) {
            alert("Limit orders are only available on Main markets.");
            return;
        }
        if (isLimit && isManifoldMarket && tradeSide === "SELL") {
            alert("Limit sell orders aren't supported on Manifold markets yet. Please use a market sell.");
            return;
        }

        // Determine Final Price to submit for CLOB
        const finalPrice = isLimit
            ? priceNum
            : (tradeSide === "BUY" ? 0.99 : 0.01);

        let endpoint = "";
        let payload: any = {};

        if (isManifoldMarket) {
            // Use new Manifold API
            if (isLimit && isMainManifold) {
                endpoint = '/api/manifold/limit-order';
                payload = {
                    contractId: market.id,
                    amount: qtyNum,
                    outcome: outcomeId.toUpperCase(),
                    userId: "demo-user",
                    limitProb: priceNum
                };
            } else if (tradeSide === "BUY") {
                endpoint = '/api/manifold/bet';
                payload = {
                    contractId: market.id,
                    amount: qtyNum,
                    outcome: outcomeId.toUpperCase(),
                    userId: "demo-user"
                };
            } else {
                endpoint = '/api/manifold/sell';
                payload = {
                    contractId: market.id,
                    shares: qtyNum,
                    outcome: outcomeId.toUpperCase(),
                    userId: "demo-user"
                };
            }
            console.log("Manifold Trade:", { endpoint, payload });
        } else {
            endpoint = `/api/markets/${market.id}/orders`;

            // CLOB Logic
            let shares = 0;
            if (tradeSide === "BUY") {
                let conversionPrice = 0;
                if (isLimit) {
                    conversionPrice = priceNum;
                } else {
                    conversionPrice = bestAsk || currentPrice || 0.5;
                    if (conversionPrice <= 0.01) conversionPrice = 0.5;
                }
                shares = qtyNum / conversionPrice;
            } else {
                shares = qtyNum;
            }

            payload = {
                userId: "demo-user",
                tab: tradeSide.toLowerCase(),
                outcome: outcomeId,
                price: finalPrice,
                qty: shares
            };
        }

        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const json = await res.json();

            if (!res.ok || json.error) {
                if (json.error === "INSUFFICIENT_SHARES" || json.error?.includes("No")) {
                    alert("Error: Insufficient shares to sell.");
                } else {
                    alert("Order failed: " + (json.error || "Unknown error"));
                }
                return;
            }

            // Success
            setAmount("");
            if (isLimit) {
                setLimitPrice("");
                setIsLimit(false);
            }

            // Update prices from Manifold response
            const probabilityUpdate = json.currentProbability ?? json.probAfter ?? json.order?.probAfter;
            if (probabilityUpdate !== undefined) {
                setYesPriceState(probabilityUpdate);
                setNoPriceState(1 - probabilityUpdate);
            } else if (json.currentPrices) {
                setYesPriceState(json.currentPrices.probYes);
                setNoPriceState(json.currentPrices.probNo);
            }

            // Update balance from response
            if (json.newBalance !== undefined) {
                setBalance(json.newBalance);
            } else if (json.userCash !== undefined) {
                setBalance(json.userCash);
            }

            // Check for automatic redemption (netting out YES+NO)
            if (json.redemptionBets && json.redemptionBets.length > 0) {
                // Redemption creates bets with negative shares. We want the positive count of pairs.
                // Since it returns pairs (YES and NO), we can just take the first one's absolute value.
                const firstBet = json.redemptionBets[0];
                const redeemedPairs = Math.abs(firstBet.shares || 0);
                const cashReceived = redeemedPairs; // 1 pair (YES+NO) = $1 always

                alert(`✅ Redemption Success!\n\nBecause you held both YES and NO shares, we automatically converted ${redeemedPairs.toFixed(2)} overlapping pairs into $${cashReceived.toFixed(2)} cash.\n\nYour position has been netted out.`);
            }

            // Refresh positions after trade
            fetchPositions();

            if (onOrderPlaced) onOrderPlaced();

        } catch (e) {
            console.error("Order error", e);
            alert("Failed to place order");
        }
    };

    const setMax = () => {
        // Set amount to full balance for buy, or max shares for sell
        if (tradeSide === 'BUY') {
            setAmount(balance.toFixed(2));
        } else {
            // For sell, use the shares the user holds
            const maxShares = outcomeId === 'yes' ? yesShares : noShares;
            setAmount(maxShares.toFixed(2));
        }
    };

    return (
        <div className="flex flex-col h-full bg-gradient-to-b from-[var(--bg-panel)] to-[var(--bg-page)] border-l border-[var(--border-subtle)]">
            {/* Header with glassmorphism */}
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-glass)] backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[#FF6B6B] flex items-center justify-center shadow-lg">
                        <TrendingUp size={16} className="text-white" />
                    </div>
                    <div>
                        <span className="font-bold text-sm text-[var(--text-main)]">Trade</span>
                        <div className="text-[10px] text-[var(--text-muted)]">
                            {isGraduating ? "Graduating (trading paused)" : isLimit ? "Limit Order" : "Market Order"}
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                {isGraduating && (
                    <div className="p-3 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-secondary)]">
                        This market is graduating right now. Trading is paused until it reaches Main.
                    </div>
                )}
                {/* Buy / Sell Tabs with gradient active state */}
                <div className="flex p-1 bg-[var(--bg-input)] rounded-xl border border-[var(--border-subtle)] shadow-inner">
                    <button
                        className={clsx(
                            "flex-1 py-3 text-sm font-bold rounded-lg transition-all duration-200",
                            tradeSide === "BUY"
                                ? "bg-gradient-to-r from-[var(--color-success)] to-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                                : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-panel-hover)]"
                        )}
                        onClick={() => { setTradeSide("BUY"); setAmount(""); }}
                        disabled={tradingDisabled}
                    >
                        Buy
                    </button>
                    <button
                        className={clsx(
                            "flex-1 py-3 text-sm font-bold rounded-lg transition-all duration-200",
                            tradeSide === "SELL"
                                ? "bg-gradient-to-r from-[var(--color-danger)] to-red-500 text-white shadow-lg shadow-red-500/25"
                                : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-panel-hover)]"
                        )}
                        onClick={() => { setTradeSide("SELL"); setAmount(""); }}
                        disabled={tradingDisabled}
                    >
                        Sell
                    </button>
                </div>

                {/* Outcome Toggles with enhanced cards */}
                <div className="flex gap-3">
                    <button
                        className={clsx(
                            "flex-1 p-4 rounded-xl transition-all duration-200 flex flex-col items-center justify-center gap-2 border-2",
                            outcomeId === "yes"
                                ? "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-400 shadow-lg shadow-emerald-500/20"
                                : "bg-[var(--bg-input)] border-transparent hover:border-[var(--border-active)] hover:shadow-md"
                        )}
                        onClick={() => { setOutcomeId("yes"); onOutcomeChange?.("yes"); }}
                    >
                        <span className={clsx("text-sm font-bold", outcomeId === "yes" ? "text-emerald-600" : "text-[var(--text-muted)]")}>YES</span>
                        <span className={clsx("text-lg font-mono font-bold", outcomeId === "yes" ? "text-emerald-700" : "text-[var(--text-secondary)]")}>{(yesPriceState * 100).toFixed(0)}¢</span>
                        {tradeSide === "SELL" && (
                            <span className="text-[10px] text-gray-400">{yesShares.toFixed(1)} shares</span>
                        )}
                    </button>
                    <button
                        className={clsx(
                            "flex-1 p-4 rounded-xl transition-all duration-200 flex flex-col items-center justify-center gap-2 border-2",
                            outcomeId === "no"
                                ? "bg-gradient-to-br from-red-50 to-red-100 border-red-400 shadow-lg shadow-red-500/20"
                                : "bg-[var(--bg-input)] border-transparent hover:border-[var(--border-active)] hover:shadow-md"
                        )}
                        onClick={() => { setOutcomeId("no"); onOutcomeChange?.("no"); }}
                    >
                        <span className={clsx("text-sm font-bold", outcomeId === "no" ? "text-red-600" : "text-[var(--text-muted)]")}>NO</span>
                        <span className={clsx("text-lg font-mono font-bold", outcomeId === "no" ? "text-red-700" : "text-[var(--text-secondary)]")}>{(noPriceState * 100).toFixed(0)}¢</span>
                        {tradeSide === "SELL" && (
                            <span className="text-[10px] text-gray-400">{noShares.toFixed(1)} shares</span>
                        )}
                    </button>
                </div>

                {/* Limit Order Checkbox */}
                {market?.phase !== "sandbox_curve" && (
                    <label className={clsx(
                        "flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] select-none",
                        limitDisabled || tradingDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                    )}>
                        <input
                            type="checkbox"
                            checked={isLimit}
                            disabled={limitDisabled || tradingDisabled}
                            onChange={(e) => setIsLimit(e.target.checked)}
                            className="rounded border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--color-primary)] focus:ring-0"
                        />
                        <span>
                            Limit Order {limitDisabled ? "(Main markets only)" : ""}
                        </span>
                    </label>
                )}

                {/* Limit Price Input */}
                {isLimit && (
                    <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex justify-between text-xs">
                            <span className="font-bold text-[var(--text-secondary)] uppercase">Price</span>
                        </div>
                        <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max="0.99"
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg p-3 text-[var(--text-main)] font-mono placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)] transition-all pl-3"
                            placeholder="0.50"
                            value={limitPrice}
                            disabled={tradingDisabled}
                            onChange={(e) => setLimitPrice(e.target.value)}
                        />
                    </div>
                )}

                {/* Amount Input */}
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs">
                        <span className="font-bold text-[var(--text-secondary)] uppercase">
                            {tradeSide === "BUY" ? "Amount (USD)" : "Amount (Shares)"}
                        </span>
                        <div className="flex items-center gap-1 text-[var(--text-muted)]">
                            <Wallet size={10} />
                            <span>${balance.toFixed(2)}</span>
                        </div>
                    </div>
                    <div className="relative group">
                        {tradeSide === "BUY" && (
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--text-main)] transition-colors">$</span>
                        )}
                        <input
                            type="number"
                            className={clsx(
                                "w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg p-3 text-[var(--text-main)] font-mono placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)] transition-all",
                                tradeSide === "BUY" ? "pl-7" : "pl-3"
                            )}
                            placeholder="0.00"
                            value={amount}
                            disabled={tradingDisabled}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                        <button onClick={setMax} disabled={tradingDisabled} className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-1 rounded disabled:opacity-50">MAX</button>
                    </div>
                </div>

                {/* Submit Button with gradient and animation */}
                {(() => {
                    const canSell = tradeSide === "SELL"
                        ? (outcomeId === "yes" ? yesShares > 0 : noShares > 0)
                        : true;
                    const isDisabled = tradingDisabled || (tradeSide === "SELL" && !canSell);
                    return (
                        <button
                            className={clsx(
                                "w-full p-4 rounded-xl font-bold text-white shadow-xl transition-all duration-200 transform",
                                isDisabled
                                    ? "bg-gray-300 cursor-not-allowed opacity-60"
                                    : tradeSide === "BUY"
                                        ? "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-emerald-500/30 hover:shadow-emerald-500/50 active:scale-[0.97]"
                                        : "bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-red-500/30 hover:shadow-red-500/50 active:scale-[0.97]"
                            )}
                            onClick={handlePlaceOrder}
                            disabled={isDisabled}
                        >
                            {isDisabled
                                ? `No ${outcomeId.toUpperCase()} shares to sell`
                                : `${tradeSide} ${outcomeId.toUpperCase()} ${isLimit && limitPrice ? "@ " + limitPrice : (isLimit ? "" : "@ Market")}`
                            }
                        </button>
                    );
                })()}
            </div>

            <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-input)]">
                {/* Tabbed Interface for Activity and Orders */}
                <div className="flex border-b border-[var(--border-subtle)]">
                    <button
                        className={clsx(
                            "flex-1 p-3 text-xs font-bold uppercase transition-colors flex items-center justify-center gap-2",
                            !isLimit
                                ? "text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]"
                                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        )}
                        onClick={() => setIsLimit(false)}
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-current" />
                        My Activity
                    </button>
                    {isMainManifold && (
                        <button
                            className={clsx(
                                "flex-1 p-3 text-xs font-bold uppercase transition-colors flex items-center justify-center gap-2",
                                isLimit
                                    ? "text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                            )}
                            onClick={() => setIsLimit(true)}
                        >
                            <ListOrdered size={12} />
                            My Orders
                        </button>
                    )}
                </div>
                <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                    {isLimit && isMainManifold ? (
                        <MyOrders
                            marketId={market.id}
                            onOrderCancelled={() => {
                                fetchPositions();
                                if (onOrderPlaced) onOrderPlaced();
                            }}
                        />
                    ) : (
                        <MyBets marketId={market.id} isManifold={isManifoldMarket} />
                    )}
                </div>
            </div>
        </div>
    );
}
