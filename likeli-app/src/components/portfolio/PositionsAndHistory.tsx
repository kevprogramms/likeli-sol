"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import styles from "./portfolio.module.css";
import clsx from "clsx";

interface Props {
    defaultTab?: "normal" | "parlays" | "perps" | "history";
}

interface SandboxPosition {
    marketId: string;
    marketQuestion: string;
    outcome: string;
    answerId?: string;
    shares: number;
    avgPrice: number;
    currentPrice: number;
    currentValue: number;
    pnl: number;
    phase: string;
}

export default function PositionsAndHistory({ defaultTab = "normal" }: Props) {
    const { currentUser, markets } = useStore();
    const [activeTab, setActiveTab] = useState(defaultTab);
    const [sandboxPositions, setSandboxPositions] = useState<SandboxPosition[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch positions from sandbox API
    useEffect(() => {
        const fetchPositions = async () => {
            try {
                const res = await fetch(`/api/manifold/portfolio?userId=demo-user&t=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    setSandboxPositions(data.positions || []);
                }
            } catch (e) {
                console.error('Failed to fetch positions', e);
            } finally {
                setLoading(false);
            }
        };
        fetchPositions();
        // Refresh every 10 seconds
        const interval = setInterval(fetchPositions, 10000);
        return () => clearInterval(interval);
    }, []);

    // Combine Zustand positions with sandbox positions
    const allPositions = sandboxPositions;

    return (
        <div className={styles.summaryCard}>
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-[var(--text-main)]">Positions & History</h3>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 border-b border-[var(--border-subtle)] pb-4 mb-2 overflow-x-auto">
                    {[
                        { id: "normal", label: "Normal Bets" },
                        { id: "parlays", label: "Parlays" },
                        { id: "perps", label: "Perps" },
                        { id: "history", label: "All History" },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={clsx(
                                "px-4 py-2 text-sm font-medium rounded-full transition-colors whitespace-nowrap",
                                activeTab === tab.id
                                    ? "bg-[var(--color-primary)] text-white"
                                    : "bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-main)]"
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="overflow-x-auto">
                    {activeTab === "normal" && (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Market</th>
                                    <th>Side</th>
                                    <th style={{ textAlign: "right" }}>Shares</th>
                                    <th style={{ textAlign: "right" }}>Avg Price</th>
                                    <th style={{ textAlign: "right" }}>Current Price</th>
                                    <th style={{ textAlign: "right" }}>Value</th>
                                    <th style={{ textAlign: "right" }}>PnL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="text-center py-8 text-[var(--text-muted)]">
                                            Loading positions...
                                        </td>
                                    </tr>
                                ) : allPositions.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="text-center py-8 text-[var(--text-muted)]">
                                            No active positions
                                        </td>
                                    </tr>
                                ) : (
                                    allPositions.map((pos, i) => {
                                        const pnlPercent = pos.avgPrice > 0
                                            ? ((pos.pnl / (pos.shares * pos.avgPrice)) * 100).toFixed(1)
                                            : '0';

                                        return (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 500 }}>
                                                    {pos.marketQuestion}
                                                    <span className="ml-2 text-xs text-[var(--text-muted)] px-1.5 py-0.5 bg-[var(--bg-input)] rounded">
                                                        {pos.phase}
                                                    </span>
                                                </td>
                                                <td className={pos.outcome === "YES" || pos.outcome.includes('YES') ? "text-success" : "text-danger"}>
                                                    {pos.outcome}
                                                </td>
                                                <td style={{ textAlign: "right" }}>{pos.shares.toFixed(2)}</td>
                                                <td style={{ textAlign: "right" }}>{(pos.avgPrice * 100).toFixed(0)}¢</td>
                                                <td style={{ textAlign: "right" }}>{(pos.currentPrice * 100).toFixed(0)}¢</td>
                                                <td style={{ textAlign: "right" }}>${pos.currentValue.toFixed(2)}</td>
                                                <td style={{ textAlign: "right" }}>
                                                    <div className={pos.pnl >= 0 ? "text-success" : "text-danger"}>
                                                        {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)}
                                                    </div>
                                                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{pnlPercent}%</div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    )}

                    {activeTab === "parlays" && (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Created</th>
                                    <th>Legs</th>
                                    <th style={{ textAlign: "right" }}>Stake</th>
                                    <th style={{ textAlign: "right" }}>Potential Payout</th>
                                    <th style={{ textAlign: "right" }}>Status</th>
                                    <th style={{ textAlign: "right" }}>Realized PnL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentUser.parlays.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-8 text-[var(--text-muted)]">
                                            No parlays found
                                        </td>
                                    </tr>
                                ) : (
                                    currentUser.parlays.map((parlay, i) => (
                                        <tr key={i}>
                                            <td style={{ color: "var(--text-muted)" }}>
                                                {new Date(parlay.createdAt).toLocaleString()}
                                            </td>
                                            <td>
                                                <div className="flex flex-col gap-1 text-xs">
                                                    {parlay.legs.map((leg, j) => (
                                                        <div key={j}>
                                                            {leg.marketQuestion.substring(0, 30)}...
                                                            <span className="font-bold ml-1">[{leg.outcomeName}]</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td style={{ textAlign: "right" }}>${parlay.stake.toFixed(2)}</td>
                                            <td style={{ textAlign: "right" }}>${parlay.potentialPayout.toFixed(2)}</td>
                                            <td style={{ textAlign: "right" }}>
                                                <span className={clsx(
                                                    parlay.status === "won" ? "text-success" :
                                                        parlay.status === "lost" ? "text-danger" :
                                                            "text-[var(--color-primary)]"
                                                )}>
                                                    {parlay.status.toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: "right" }}>
                                                {parlay.status === "won" ? (
                                                    <span className="text-success">+${(parlay.potentialPayout - parlay.stake).toFixed(2)}</span>
                                                ) : parlay.status === "lost" ? (
                                                    <span className="text-danger">-${parlay.stake.toFixed(2)}</span>
                                                ) : (
                                                    <span className="text-[var(--text-muted)]">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}

                    {activeTab === "perps" && (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Market</th>
                                    <th>Side</th>
                                    <th style={{ textAlign: "right" }}>Size</th>
                                    <th style={{ textAlign: "right" }}>Leverage</th>
                                    <th style={{ textAlign: "right" }}>Entry Price</th>
                                    <th style={{ textAlign: "right" }}>Mark Price</th>
                                    <th style={{ textAlign: "right" }}>Unrealized PnL</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td colSpan={7} className="text-center py-8 text-[var(--text-muted)]">
                                        No active perp positions
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    )}

                    {activeTab === "history" && (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Type</th>
                                    <th>Description</th>
                                    <th>Side</th>
                                    <th style={{ textAlign: "right" }}>Size</th>
                                    <th style={{ textAlign: "right" }}>Status</th>
                                    <th style={{ textAlign: "right" }}>Realized PnL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentUser.history.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="text-center py-8 text-[var(--text-muted)]">
                                            No history found
                                        </td>
                                    </tr>
                                ) : (
                                    currentUser.history.map((item, i) => (
                                        <tr key={i}>
                                            <td style={{ color: "var(--text-muted)" }}>
                                                {new Date(item.ts).toLocaleString()}
                                            </td>
                                            <td>
                                                <span className="px-2 py-1 rounded bg-[var(--bg-input)] text-xs uppercase">
                                                    {item.kind}
                                                </span>
                                            </td>
                                            <td>{item.description}</td>
                                            <td className={item.side.includes("Buy") || item.side === "Long" ? "text-success" : "text-danger"}>
                                                {item.side}
                                            </td>
                                            <td style={{ textAlign: "right" }}>${item.size.toFixed(2)}</td>
                                            <td style={{ textAlign: "right" }}>{item.status}</td>
                                            <td style={{ textAlign: "right" }}>
                                                <span className={clsx(
                                                    item.realizedPnl > 0 ? "text-success" :
                                                        item.realizedPnl < 0 ? "text-danger" :
                                                            "text-[var(--text-muted)]"
                                                )}>
                                                    {item.realizedPnl > 0 ? "+" : ""}${item.realizedPnl.toFixed(2)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div >
        </div >
    );
}
