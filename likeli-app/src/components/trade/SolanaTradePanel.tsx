"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { TrendingUp, Wallet, CheckCircle, AlertCircle, List, X, RefreshCcw } from "lucide-react";
import { useLikeliProgram, UserPositionAccount, LimitOrderAccount } from "@/hooks/useLikeliProgram";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";

interface SolanaTradePanelProps {
    market: {
        publicKey: PublicKey;
        account: {
            question: string;
            yesPrice: number;
            noPrice: number;
            totalVolume: any;
            resolved: boolean;
            isMulti?: boolean;
            answerIndex?: number;
            multiMarketPDA?: PublicKey;
        };
    };
    onOrderPlaced?: () => void;
    isGraduating?: boolean;
    siblings?: { publicKey: PublicKey, account: any }[];
}

export default function SolanaTradePanel({ market, onOrderPlaced, isGraduating, siblings }: SolanaTradePanelProps) {
    const { buyShares, buyMulti, placeOrder, placeMultiOrder, cancelOrder, sellShares, sellMulti, fetchUserPosition, fetchMultiPosition, fetchOpenOrders } = useLikeliProgram();
    const { connected, publicKey } = useWallet();

    // UI State
    const [activeTab, setActiveTab] = useState<"market" | "sell" | "limit">("market");
    const [outcome, setOutcome] = useState<"YES" | "NO">("YES");

    // Form State
    const [amount, setAmount] = useState("");
    const [limitPrice, setLimitPrice] = useState("");

    // Request State
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Data State
    const [userPosition, setUserPosition] = useState<UserPositionAccount | null>(null);
    const [myOrders, setMyOrders] = useState<LimitOrderAccount[]>([]);

    // Derived
    const currentPrice = outcome === "YES" ? market.account.yesPrice : market.account.noPrice;
    const estShares = amount ? (parseFloat(amount) / (activeTab === 'market' ? currentPrice : (parseFloat(limitPrice) / 100 || currentPrice))).toFixed(2) : "0.00";

    // Load Data
    // Load Data
    const refreshData = async () => {
        if (!connected || !publicKey) return;

        if (market.account.isMulti && market.account.multiMarketPDA && market.account.answerIndex !== undefined) {
            // Load Multi Position
            const pos = await fetchMultiPosition(market.account.multiMarketPDA);
            if (pos) {
                // Map MultiPosition to UserPosition shape for the UI
                setUserPosition({
                    owner: pos.owner,
                    market: pos.market,
                    yesShares: pos.yesShares[market.account.answerIndex],
                    noShares: pos.noShares[market.account.answerIndex]
                } as any);
            }
        } else {
            // Load Binary Position
            const pos = await fetchUserPosition(market.publicKey);
            setUserPosition(pos);
        }

        // Load Orders
        const allOrders = await fetchOpenOrders(market.publicKey);
        const mine = allOrders.filter(o => o.owner.toString() === publicKey.toString());
        setMyOrders(mine);
    };

    useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, 5000);
        return () => clearInterval(interval);
    }, [connected, market.publicKey]);

    const handleMarketBuy = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            setError("Invalid amount");
            return;
        }
        setIsSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            if (market.account.isMulti && market.account.multiMarketPDA && market.account.answerIndex !== undefined) {
                const siblingRemainingAccounts = siblings
                    ?.filter(s => s.publicKey.toString() !== market.publicKey.toString())
                    .map(s => ({
                        pubkey: s.publicKey,
                        isWritable: true,
                        isSigner: false
                    })) || [];

                await buyMulti(market.account.multiMarketPDA, market.account.answerIndex, outcome === "YES", parseFloat(amount), 0, siblingRemainingAccounts);
            } else {
                await buyShares(market.publicKey, outcome === "YES", parseFloat(amount));
            }
            setSuccess(`Bought $${amount} of ${outcome}`);
            setAmount("");
            if (onOrderPlaced) onOrderPlaced();
            refreshData();
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Transaction failed");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleMarketSell = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            setError("Invalid shares amount");
            return;
        }
        setIsSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            if (market.account.isMulti && market.account.multiMarketPDA && market.account.answerIndex !== undefined) {
                const siblingRemainingAccounts = siblings
                    ?.filter(s => s.publicKey.toString() !== market.publicKey.toString())
                    .map(s => ({
                        pubkey: s.publicKey,
                        isWritable: true,
                        isSigner: false
                    })) || [];

                await sellMulti(market.account.multiMarketPDA, market.account.answerIndex, outcome === "YES", parseFloat(amount), 0, siblingRemainingAccounts);
            } else {
                await sellShares(market.publicKey, outcome === "YES", parseFloat(amount));
            }
            setSuccess(`Sold ${amount} shares of ${outcome}`);
            setAmount("");
            refreshData();
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Transaction failed");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLimitOrder = async () => {
        if (!amount || !limitPrice) {
            setError("Invalid inputs");
            return;
        }
        const priceVal = parseFloat(limitPrice) / 100; // Input is % (e.g. 60) -> 0.60
        if (priceVal <= 0 || priceVal >= 1) {
            setError("Price must be between 1% and 99%");
            return;
        }

        setIsSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            const qty = parseFloat(amount); // Simplified: amount is QTY of shares here or USD? 
            // Standard: Limit order size is usually Shares. Let's assume Shares.
            // Wait, UI says "AMOUNT (USD)". 
            // Let's stick to USD input for consistency? 
            // Actually limit orders specify Quantity and Price. Cost = Qty * Price.
            // Let's treat Input as USD amount to match Market tab, calculate shares.
            const sharesQty = Math.floor(parseFloat(amount) / priceVal);

            if (market.account.isMulti && market.account.multiMarketPDA && market.account.answerIndex !== undefined) {
                await placeMultiOrder(
                    market.account.multiMarketPDA,
                    market.account.answerIndex,
                    priceVal,
                    sharesQty, // Qty of shares
                    outcome === "YES",
                    true // Always Bid (Buy) for now
                );
            } else {
                await placeOrder(
                    market.publicKey,
                    priceVal,
                    sharesQty, // Qty of shares
                    outcome === "YES",
                    true // Always Bid (Buy) for now
                );
            }

            setSuccess(`Placed order for ${sharesQty} shares @ ${priceVal * 100}%`);
            setAmount("");
            refreshData();
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Order failed");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancel = async (orderPubkey: PublicKey) => {
        if (!confirm("Cancel this order?")) return;
        try {
            await cancelOrder(orderPubkey);
            refreshData();
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] text-[var(--text-main)]">
            {/* Header Tabs */}
            <div className="flex border-b border-[var(--border-subtle)]">
                <button
                    onClick={() => setActiveTab("market")}
                    className={clsx(
                        "flex-1 p-4 text-sm font-bold transition-colors",
                        activeTab === "market"
                            ? "bg-[var(--bg-card)] text-[var(--text-main)] border-b-2 border-blue-500"
                            : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                    )}
                >
                    Buy
                </button>
                <button
                    onClick={() => setActiveTab("sell")}
                    className={clsx(
                        "flex-1 p-4 text-sm font-bold transition-colors",
                        activeTab === "sell"
                            ? "bg-[var(--bg-card)] text-[var(--text-main)] border-b-2 border-red-500"
                            : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                    )}
                >
                    Sell
                </button>
                <button
                    onClick={() => {
                        if (market.account.totalVolume.toNumber() >= 1000) {
                            setActiveTab("limit");
                        }
                    }}
                    className={clsx(
                        "flex-1 p-4 text-sm font-bold transition-colors",
                        activeTab === "limit"
                            ? "bg-[var(--bg-card)] text-[var(--text-main)] border-b-2 border-purple-500"
                            : market.account.totalVolume.toNumber() >= 1000
                                ? "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                                : "text-[var(--text-muted)] opacity-50 cursor-not-allowed"
                    )}
                    disabled={market.account.totalVolume.toNumber() < 1000 || isGraduating}
                    title={market.account.totalVolume.toNumber() < 1000 ? "Limit orders available after graduation (Vol > $1k)" : isGraduating ? "Limit orders disabled during graduation phase" : ""}
                >
                    Limit {market.account.totalVolume.toNumber() < 1000 && <span className="text-[10px] block">(Graduated Only)</span>}
                </button>
            </div>

            <div className="p-6 flex-1 flex flex-col gap-6 overflow-y-auto">
                {/* Outcome Toggle */}
                <div className="flex p-1 bg-[var(--bg-input)] rounded-lg border border-[var(--border-subtle)]">
                    <button
                        className={clsx(
                            "flex-1 py-2 text-sm font-bold rounded transition-all",
                            outcome === "YES" ? "bg-emerald-600 text-white" : "text-[var(--text-muted)]"
                        )}
                        onClick={() => setOutcome("YES")}
                    >
                        YES
                    </button>
                    <button
                        className={clsx(
                            "flex-1 py-2 text-sm font-bold rounded transition-all",
                            outcome === "NO" ? "bg-red-600 text-white" : "text-[var(--text-muted)]"
                        )}
                        onClick={() => setOutcome("NO")}
                    >
                        NO
                    </button>
                </div>

                {/* Graduation Banner */}
                {isGraduating && (
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-center gap-3 mb-4 animate-pulse">
                        <RefreshCcw className="text-blue-500 animate-spin" size={16} />
                        <div className="text-xs text-blue-400 font-bold tracking-wide">
                            GRADUATING... TRADING PAUSED
                        </div>
                    </div>
                )}

                {/* Market Info */}
                {activeTab !== 'limit' && (
                    <div className="text-center p-4 bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)]">
                        <div className="text-[var(--text-muted)] text-xs font-bold uppercase">Current Price</div>
                        <div className={clsx("text-4xl font-black my-1", outcome === 'YES' ? "text-emerald-500" : "text-red-500")}>
                            {(currentPrice * 100).toFixed(1)}¢
                        </div>
                    </div>
                )}

                {/* Limit Inputs */}
                {activeTab === 'limit' && (
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-[var(--text-secondary)]">LIMIT PRICE (%)</label>
                        <div className="relative">
                            <input
                                type="number"
                                value={limitPrice}
                                onChange={e => setLimitPrice(e.target.value)}
                                placeholder="e.g. 60"
                                className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg p-3 text-[var(--text-main)] font-mono"
                            />
                            <span className="absolute right-4 top-3 text-[var(--text-muted)]">%</span>
                        </div>
                    </div>
                )}

                {/* Amount Input */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-[var(--text-secondary)]">
                        {activeTab === 'sell' ? "SHARES TO SELL" : "AMOUNT (USD)"}
                    </label>
                    <div className="relative">
                        {activeTab !== 'sell' && <span className="absolute left-3 top-3 text-[var(--text-muted)]">$</span>}
                        <input
                            type="number"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            placeholder={activeTab === 'sell' ? "0" : "0.00"}
                            className={clsx(
                                "w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg p-3 text-[var(--text-main)] font-mono",
                                activeTab !== 'sell' && "pl-7"
                            )}
                        />
                    </div>
                    {activeTab !== 'sell' && (
                        <div className="text-right text-xs text-[var(--text-muted)]">
                            Est. Shares: {estShares}
                        </div>
                    )}
                    {activeTab === 'sell' && userPosition && (
                        <div className="text-right text-xs text-[var(--text-muted)]">
                            Max: {outcome === 'YES' ? userPosition.yesShares.toString() : userPosition.noShares.toString()}
                        </div>
                    )}
                </div>

                {/* Action Button */}
                {!connected ? (
                    <div className="w-full p-4 bg-gray-700 text-white text-center rounded-lg font-bold">Connect Wallet</div>
                ) : (
                    <button
                        onClick={activeTab === 'market' ? handleMarketBuy : activeTab === 'sell' ? handleMarketSell : handleLimitOrder}
                        disabled={isSubmitting || isGraduating}
                        className={clsx(
                            "w-full py-4 rounded-lg font-bold text-white shadow-lg transition-transform active:scale-95",
                            isSubmitting ? "opacity-50 cursor-wait bg-gray-600" :
                                activeTab === 'sell' ? "bg-red-600 hover:bg-red-500" :
                                    outcome === 'YES' ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500"
                        )}
                    >
                        {isSubmitting ? "Processing..." :
                            activeTab === 'market' ? `Buy ${outcome} at Market` :
                                activeTab === 'sell' ? `Sell ${outcome} Shares` :
                                    `Place Limit Buy ${outcome}`
                        }
                    </button>
                )}

                {/* Status Messages */}
                {error && <div className="text-red-500 text-sm p-2 bg-red-900/20 rounded border border-red-500/30">{error}</div>}
                {success && <div className="text-emerald-500 text-sm p-2 bg-emerald-900/20 rounded border border-emerald-500/30">{success}</div>}

                <div className="border-t border-[var(--border-subtle)] my-2" />

                {/* User Positions */}
                <div>
                    <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-2 flex items-center gap-2">
                        <Wallet size={12} /> YOUR POSITION
                    </h3>
                    {userPosition ? (
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-[var(--bg-card)] p-3 rounded border border-[var(--border-subtle)]">
                                <div className="text-emerald-500 font-bold text-xs">YES SHARES</div>
                                <div className="text-xl font-mono">{userPosition.yesShares.toString()}</div>
                            </div>
                            <div className="bg-[var(--bg-card)] p-3 rounded border border-[var(--border-subtle)]">
                                <div className="text-red-500 font-bold text-xs">NO SHARES</div>
                                <div className="text-xl font-mono">{userPosition.noShares.toString()}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-[var(--text-muted)] italic">No positions yet</div>
                    )}
                </div>

                {/* Open Orders */}
                {activeTab === 'limit' && (
                    <div className="mt-4">
                        <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-2 flex items-center gap-2">
                            <List size={12} /> OPEN ORDERS
                        </h3>
                        {myOrders.length === 0 ? (
                            <div className="text-sm text-[var(--text-muted)] italic">No open orders</div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {myOrders.map(o => (
                                    <div key={o.publicKey.toString()} className="flex items-center justify-between p-2 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded text-sm">
                                        <div>
                                            <span className={o.isYes ? "text-emerald-500 font-bold" : "text-red-500 font-bold"}>
                                                {o.isYes ? "YES" : "NO"}
                                            </span>
                                            <span className="mx-2 text-[var(--text-muted)]">@</span>
                                            <span className="font-mono">{(o.price.toNumber() / 100).toFixed(0)}¢</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[var(--text-muted)]">{o.qty.toString()} sh</span>
                                            <button
                                                onClick={() => handleCancel(o.publicKey)}
                                                className="text-red-400 hover:text-red-300"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
