"use client";

import clsx from "clsx";
import { useMemo } from "react";

// Simplified interface to match ad-hoc data passing
interface OrderLevel {
    price: number;
    size: number;
}

interface OrderBookProps {
    bids: OrderLevel[];
    asks: OrderLevel[];
    lastTrade?: number;
    selectedOutcome?: 'yes' | 'no';
}

export default function OrderBook({ bids, asks, lastTrade, selectedOutcome = 'yes' }: OrderBookProps) {
    // Aggregation logic removed because API already aggregates (or we trust the passed aggregated data)
    // The previous component aggregated raw orders.
    // If API returns levels, we just display them.
    // However, MarketPage maps API levels to this prop.
    // Let's assume API returns aggregated levels (which it does: OrderbookLevel[]).

    // Just sort and slice
    const displayBids = bids.slice(0, 15);
    const displayAsks = asks.slice(0, 15);

    const bestBid = displayBids[0]?.price || 0;
    const bestAsk = displayAsks[0]?.price || 0;
    const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;

    // Calculate max size for visual bars
    const maxSize = Math.max(
        ...displayBids.map(b => b.size ?? 0),
        ...displayAsks.map(a => a.size ?? 0),
        1
    );

    return (
        <div className="flex flex-col gap-4">
            <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg p-4 shadow-sm">
                <h3 className="text-[var(--text-main)] font-semibold mb-3 text-sm">Order Book ({selectedOutcome.toUpperCase()})</h3>

                <div className="flex gap-4">
                    {/* Bids Column (Green) */}
                    <div className="flex-1">
                        <div className="grid grid-cols-3 text-[10px] text-[var(--text-secondary)] mb-2 font-medium uppercase tracking-wider">
                            <div className="text-left">Price</div>
                            <div className="text-right">Size</div>
                            <div className="text-right">Total</div>
                        </div>
                        <div className="flex flex-col gap-[1px]">
                            {displayBids.map((bid, i) => (
                                <div
                                    key={i}
                                    className="relative grid grid-cols-3 text-xs py-1 px-1 rounded overflow-hidden"
                                >
                                    <div
                                        className="absolute top-0 right-0 bottom-0 bg-[var(--color-success)] opacity-10"
                                        style={{ width: `${((bid.size ?? 0) / maxSize) * 100}%` }}
                                    />
                                    <div className="relative text-left text-[var(--color-success)] font-medium">{(bid.price ?? 0).toFixed(2)}¢</div>
                                    <div className="relative text-right text-[var(--text-main)]">{(bid.size ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                    <div className="relative text-right text-[var(--text-secondary)]">${((bid.price ?? 0) * (bid.size ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                </div>
                            ))}
                            {displayBids.length === 0 && (
                                <div className="text-xs text-[var(--text-secondary)] text-center py-8 opacity-50">No bids</div>
                            )}
                        </div>
                    </div>

                    {/* Asks Column (Red) */}
                    <div className="flex-1">
                        <div className="grid grid-cols-3 text-[10px] text-[var(--text-secondary)] mb-2 font-medium uppercase tracking-wider">
                            <div className="text-left">Price</div>
                            <div className="text-right">Size</div>
                            <div className="text-right">Total</div>
                        </div>
                        <div className="flex flex-col gap-[1px]">
                            {displayAsks.map((ask, i) => (
                                <div
                                    key={i}
                                    className="relative grid grid-cols-3 text-xs py-1 px-1 rounded overflow-hidden"
                                >
                                    <div
                                        className="absolute top-0 left-0 bottom-0 bg-[var(--color-danger)] opacity-10"
                                        style={{ width: `${((ask.size ?? 0) / maxSize) * 100}%` }}
                                    />
                                    <div className="relative text-left text-[var(--color-danger)] font-medium">{(ask.price ?? 0).toFixed(2)}¢</div>
                                    <div className="relative text-right text-[var(--text-main)]">{(ask.size ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                    <div className="relative text-right text-[var(--text-secondary)]">${((ask.price ?? 0) * (ask.size ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                </div>
                            ))}
                            {displayAsks.length === 0 && (
                                <div className="text-xs text-[var(--text-secondary)] text-center py-8 opacity-50">No asks</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex justify-between text-xs text-[var(--text-secondary)]">
                    <div>
                        Spread: <span className="text-[var(--text-main)] font-medium">{spread > 0 ? `${(spread * 100).toFixed(1)}¢` : '-'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
