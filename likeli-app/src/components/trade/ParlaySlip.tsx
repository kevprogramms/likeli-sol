"use client";

import { useState, useEffect } from "react";
import { useParlay, MAX_PARLAY_LEGS } from "@/context/ParlayContext";
import { useStore } from "@/lib/store";
import { useAuth } from "@/context/AuthContext";
import { X, Trash2, Trophy, ChevronDown, ChevronUp, Layers } from "lucide-react";
import clsx from "clsx";

export default function ParlaySlip() {
    const { legs, isOpen, removeLeg, clearParlay, setOpen, canPlace } = useParlay();
    const { placeParlay, currentUser, markets } = useStore();
    const { isAuthenticated } = useAuth();

    const [stake, setStake] = useState("");
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [lastPayout, setLastPayout] = useState(0);

    // Calculate live prices and combined odds
    const legsWithLivePrices = legs.map(leg => {
        const market = markets.find(m => m.id === leg.marketId);
        const outcome = market?.outcomes.find(o =>
            o.id.toLowerCase() === leg.outcome.toLowerCase()
        );
        const livePrice = outcome?.price ?? leg.displayPrice;
        const decimalOdds = livePrice > 0 ? 1 / livePrice : 1;
        return {
            ...leg,
            livePrice,
            decimalOdds,
        };
    });

    const combinedOdds = legsWithLivePrices.reduce((acc, leg) => acc * leg.decimalOdds, 1);
    const houseEdge = 0.05;
    const effectiveMultiplier = combinedOdds * (1 - houseEdge);
    const stakeNum = parseFloat(stake) || 0;
    const potentialPayout = stakeNum * effectiveMultiplier;
    const potentialProfit = potentialPayout - stakeNum;

    const canSubmit = canPlace && stakeNum > 0 && stakeNum <= currentUser.balance && isAuthenticated;

    const handleSubmit = () => {
        if (!canSubmit) return;

        // Use live prices for the parlay
        placeParlay(
            legs.map(leg => ({
                marketId: leg.marketId,
                outcomeId: leg.outcome.toLowerCase(),
            })),
            stakeNum
        );

        setLastPayout(potentialPayout);
        setShowConfirmation(true);
    };

    const handleClose = () => {
        setShowConfirmation(false);
        clearParlay();
        setStake("");
        setOpen(false);
    };

    // Don't render if no legs
    if (legs.length === 0 && !isOpen) return null;

    // Confirmation modal
    if (showConfirmation) {
        return (
            <div className="fixed bottom-4 right-4 z-50 w-[360px] animate-scaleIn">
                <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <Trophy size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Parlay Placed! 🎉</h2>
                    <p className="text-gray-600 mb-4">
                        Your {legs.length}-leg parlay is live.<br />
                        Potential Payout: <strong className="text-emerald-600">${lastPayout.toFixed(2)}</strong>
                    </p>
                    <button
                        onClick={handleClose}
                        className="w-full py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold rounded-xl hover:shadow-lg transition-all"
                    >
                        Awesome!
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={clsx(
            "fixed bottom-4 right-4 z-50 transition-all duration-300",
            isOpen ? "w-[360px]" : "w-auto"
        )}>
            {/* Collapsed State - Just a button */}
            {!isOpen && legs.length > 0 && (
                <button
                    onClick={() => setOpen(true)}
                    className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-xl shadow-xl hover:shadow-2xl transition-all animate-scaleIn"
                >
                    <Layers size={18} />
                    <span>Parlay ({legs.length})</span>
                    <ChevronUp size={16} />
                </button>
            )}

            {/* Expanded State - Full Panel */}
            {isOpen && (
                <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-scaleIn">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Layers size={20} />
                            <div>
                                <h3 className="font-bold text-sm">Parlay Builder</h3>
                                <p className="text-xs text-purple-200">{legs.length}/{MAX_PARLAY_LEGS} legs</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {legs.length > 0 && (
                                <button
                                    onClick={clearParlay}
                                    className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                                    title="Clear all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                            <button
                                onClick={() => setOpen(false)}
                                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <ChevronDown size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Legs List */}
                    <div className="max-h-[240px] overflow-y-auto">
                        {legs.length === 0 ? (
                            <div className="p-6 text-center text-gray-500 text-sm">
                                <Layers size={32} className="mx-auto mb-2 text-gray-300" />
                                Click "Add to Parlay" on any market to start building
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {legsWithLivePrices.map((leg, i) => (
                                    <div key={leg.marketId} className="p-3 hover:bg-gray-50 transition-colors">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-gray-900 font-medium line-clamp-2">
                                                    {leg.marketQuestion}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={clsx(
                                                        "text-xs font-bold px-2 py-0.5 rounded",
                                                        leg.outcome === "YES"
                                                            ? "bg-emerald-100 text-emerald-700"
                                                            : "bg-red-100 text-red-700"
                                                    )}>
                                                        {leg.outcome}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        @ {(leg.livePrice * 100).toFixed(0)}¢
                                                    </span>
                                                    <span className="text-xs text-purple-600 font-medium">
                                                        {leg.decimalOdds.toFixed(2)}x
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => removeLeg(leg.marketId)}
                                                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Summary & Stake */}
                    {legs.length > 0 && (
                        <div className="border-t border-gray-100 p-4 bg-gray-50">
                            {/* Combined Odds */}
                            <div className="flex items-center justify-between text-sm mb-3">
                                <span className="text-gray-600">Combined Odds</span>
                                <span className="font-bold text-purple-600">{effectiveMultiplier.toFixed(2)}x</span>
                            </div>

                            {/* Stake Input */}
                            <div className="mb-3">
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                    <input
                                        type="number"
                                        value={stake}
                                        onChange={e => setStake(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full pl-7 pr-16 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                                    />
                                    <button
                                        onClick={() => setStake(currentUser.balance.toFixed(2))}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-bold text-purple-600 bg-purple-50 rounded hover:bg-purple-100"
                                    >
                                        MAX
                                    </button>
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                    <span className="text-xs text-gray-500">Balance: ${currentUser.balance.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Potential Payout */}
                            <div className="flex items-center justify-between text-sm mb-4 p-3 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl border border-emerald-100">
                                <span className="text-gray-700 font-medium">Potential Payout</span>
                                <div className="text-right">
                                    <span className="text-lg font-bold text-emerald-600">${potentialPayout.toFixed(2)}</span>
                                    {potentialProfit > 0 && (
                                        <p className="text-xs text-emerald-500">+${potentialProfit.toFixed(2)} profit</p>
                                    )}
                                </div>
                            </div>

                            {/* Submit Button */}
                            <button
                                onClick={handleSubmit}
                                disabled={!canSubmit}
                                className={clsx(
                                    "w-full py-3 rounded-xl font-bold text-white transition-all",
                                    canSubmit
                                        ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-lg hover:shadow-xl active:scale-[0.98]"
                                        : "bg-gray-300 cursor-not-allowed"
                                )}
                            >
                                {!isAuthenticated
                                    ? "Connect Wallet"
                                    : legs.length < 2
                                        ? `Add ${2 - legs.length} more leg${2 - legs.length > 1 ? 's' : ''}`
                                        : "Place Parlay"
                                }
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
