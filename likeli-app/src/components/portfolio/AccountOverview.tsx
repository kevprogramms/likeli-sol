"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import styles from "./portfolio.module.css";
import clsx from "clsx";

export default function AccountOverview() {
    const { currentUser } = useStore();
    const [chartTab, setChartTab] = useState<"value" | "pnl">("value");

    // Calculate stats
    const totalEquity = currentUser.equityHistory.length > 0
        ? currentUser.equityHistory[currentUser.equityHistory.length - 1].equity
        : currentUser.balance; // Fallback

    const totalPnl = currentUser.equityHistory.length > 0
        ? currentUser.equityHistory[currentUser.equityHistory.length - 1].pnl
        : 0;

    // Filter history for volume
    const volume = currentUser.history.reduce((acc, item) => acc + item.size, 0);

    // Generate demo data if not enough history
    const chartData = useMemo(() => {
        if (currentUser.equityHistory.length > 1) {
            return currentUser.equityHistory.map(point => ({
                time: point.ts,
                value: point.equity,
                pnl: point.pnl,
            }));
        }

        // Demo data generation
        const points = 10;
        const now = Date.now();
        const data = [];
        const baseEquity = totalEquity;
        const basePnl = totalPnl;

        for (let i = points - 1; i >= 0; i--) {
            const time = now - (i * 3600000 * 24); // 1 day intervals
            // Create a slight trend towards current values
            const randomFactor = (Math.random() - 0.5) * 500;
            const trend = (points - i) / points;

            data.push({
                time,
                value: baseEquity - (i * 100) + randomFactor,
                pnl: basePnl - (i * 50) + (randomFactor / 2),
            });
        }
        // Ensure last point matches current
        data[data.length - 1] = { time: now, value: baseEquity, pnl: basePnl };
        return data;
    }, [currentUser.equityHistory, totalEquity, totalPnl]);

    // Chart dimensions
    const width = 500;
    const height = 200;
    const padding = 40; // Increased padding for axes

    // Calculate scales
    const dataKey = chartTab === "value" ? "value" : "pnl";
    const values = chartData.map(d => d[dataKey]);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1; // Avoid divide by zero

    // Generate path
    const points = chartData.map((d, i) => {
        const x = padding + (i / (chartData.length - 1)) * (width - 2 * padding);
        const y = height - padding - ((d[dataKey] - minVal) / range) * (height - 2 * padding);
        return `${x},${y}`;
    }).join(" ");

    // Axis labels
    const yLabels = [minVal, (minVal + maxVal) / 2, maxVal].map(v =>
        chartTab === "value" ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`
    );

    const xLabels = chartData.length > 1 ? [
        new Date(chartData[0].time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        new Date(chartData[Math.floor(chartData.length / 2)].time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        new Date(chartData[chartData.length - 1].time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    ] : [];

    const [hoveredPoint, setHoveredPoint] = useState<{ x: number, y: number, value: number, time: number } | null>(null);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Stats Card */}
            <div className={styles.summaryCard}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-[var(--text-main)]">Stats</h3>
                    <div className="flex gap-2">
                        <select className="bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-secondary)]">
                            <option>All</option>
                            <option>Normal Bets</option>
                            <option>Parlays</option>
                            <option>Perps</option>
                        </select>
                        <select className="bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-secondary)]">
                            <option>All-time</option>
                            <option>30D</option>
                            <option>7D</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">PnL</span>
                        <span className={clsx(totalPnl >= 0 ? "text-success" : "text-danger")}>
                            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">Volume</span>
                        <span className="text-[var(--text-main)]">${volume.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">Max Drawdown</span>
                        <span className="text-[var(--text-main)]">0.00%</span>
                    </div>
                    <div className="h-px bg-[var(--border-subtle)] my-2" />
                    <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">Total Equity</span>
                        <span className="text-[var(--text-main)]">${totalEquity.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">Normal Bets Equity</span>
                        <span className="text-[var(--text-main)]">$0.00</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">Parlay Equity</span>
                        <span className="text-[var(--text-main)]">$0.00</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">Perps Equity</span>
                        <span className="text-[var(--text-main)]">$0.00</span>
                    </div>
                </div>
            </div>

            {/* Performance Card */}
            <div className={styles.summaryCard}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-[var(--text-main)]">Performance</h3>
                    <div className="flex bg-[var(--bg-input)] rounded-lg p-1">
                        <button
                            onClick={() => setChartTab("value")}
                            className={clsx(
                                "px-3 py-1 text-xs rounded-md transition-colors",
                                chartTab === "value" ? "bg-[var(--bg-panel)] text-[var(--text-main)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-main)]"
                            )}
                        >
                            Account Value
                        </button>
                        <button
                            onClick={() => setChartTab("pnl")}
                            className={clsx(
                                "px-3 py-1 text-xs rounded-md transition-colors",
                                chartTab === "pnl" ? "bg-[var(--bg-panel)] text-[var(--text-main)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-main)]"
                            )}
                        >
                            PNL
                        </button>
                    </div>
                </div>

                <div className="h-[200px] w-full flex items-center justify-center relative" onMouseLeave={() => setHoveredPoint(null)}>
                    {chartData.length === 0 ? (
                        <div className="text-[var(--text-secondary)] text-sm">
                            No performance data yet — start trading to see your portfolio history.
                        </div>
                    ) : (
                        <>
                            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                                {/* Grid lines */}
                                <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border-subtle)" strokeWidth="1" />
                                <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="var(--border-subtle)" strokeWidth="1" />

                                {/* Y Axis Labels */}
                                <text x={padding - 5} y={height - padding} textAnchor="end" fontSize="10" fill="var(--text-secondary)">{yLabels[0]}</text>
                                <text x={padding - 5} y={height / 2} textAnchor="end" fontSize="10" fill="var(--text-secondary)">{yLabels[1]}</text>
                                <text x={padding - 5} y={padding + 5} textAnchor="end" fontSize="10" fill="var(--text-secondary)">{yLabels[2]}</text>

                                {/* X Axis Labels */}
                                <text x={padding} y={height - 5} textAnchor="start" fontSize="10" fill="var(--text-secondary)">{xLabels[0]}</text>
                                <text x={width / 2} y={height - 5} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">{xLabels[1]}</text>
                                <text x={width - padding} y={height - 5} textAnchor="end" fontSize="10" fill="var(--text-secondary)">{xLabels[2]}</text>

                                {/* Chart Line */}
                                <polyline
                                    fill="none"
                                    stroke="#ef4444"
                                    strokeWidth="2"
                                    points={points}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />

                                {/* Interactive Points */}
                                {chartData.map((d, i) => {
                                    const x = padding + (i / (chartData.length - 1)) * (width - 2 * padding);
                                    const y = height - padding - ((d[dataKey] - minVal) / range) * (height - 2 * padding);
                                    return (
                                        <circle
                                            key={i}
                                            cx={x}
                                            cy={y}
                                            r="4"
                                            fill="transparent"
                                            className="cursor-pointer hover:fill-[#ef4444]"
                                            onMouseEnter={() => setHoveredPoint({ x, y, value: d[dataKey], time: d.time })}
                                        />
                                    );
                                })}
                            </svg>

                            {/* Tooltip */}
                            {hoveredPoint && (
                                <div
                                    className="absolute bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs shadow-lg pointer-events-none z-10"
                                    style={{
                                        left: `${(hoveredPoint.x / width) * 100}%`,
                                        top: `${(hoveredPoint.y / height) * 100}%`,
                                        transform: 'translate(-50%, -120%)'
                                    }}
                                >
                                    <div className="font-bold text-[var(--text-main)]">
                                        {chartTab === "value" ? `$${hoveredPoint.value.toFixed(2)}` : (hoveredPoint.value >= 0 ? "+" : "") + `$${hoveredPoint.value.toFixed(2)}`}
                                    </div>
                                    <div className="text-[var(--text-secondary)]">
                                        {new Date(hoveredPoint.time).toLocaleDateString()}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
