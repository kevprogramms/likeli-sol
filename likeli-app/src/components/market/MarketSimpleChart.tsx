"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from "recharts";

// Generic type for the history we receive
interface HistoryPoint {
    timestamp: number;
    yesPrice?: number;
    noPrice?: number;
    yesProb?: number;
    noProb?: number;
    probYes?: number;
    probNo?: number;
}

interface MarketSimpleChartProps {
    priceHistory: HistoryPoint[];
    mode?: "simple" | "advanced";
}

type TimeFrame = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

export default function MarketSimpleChart({ priceHistory, mode = "simple" }: MarketSimpleChartProps) {
    const [timeFrame, setTimeFrame] = useState<TimeFrame>("ALL");

    const { chartData, yDomain } = useMemo(() => {
        const rawHistory = priceHistory ?? [];

        // Sort by timestamp
        const sorted = [...rawHistory].sort((a, b) => a.timestamp - b.timestamp);

        // Filter by timeframe
        const now = Date.now();
        let cutoff = 0;
        switch (timeFrame) {
            case "1H": cutoff = now - 60 * 60 * 1000; break;
            case "6H": cutoff = now - 6 * 60 * 60 * 1000; break;
            case "1D": cutoff = now - 24 * 60 * 60 * 1000; break;
            case "1W": cutoff = now - 7 * 24 * 60 * 60 * 1000; break;
            case "1M": cutoff = now - 30 * 24 * 60 * 60 * 1000; break;
            case "ALL": cutoff = 0; break;
        }

        const filtered = cutoff > 0 ? sorted.filter(p => p.timestamp >= cutoff) : sorted;

        // Transform to percentage format
        const data = filtered.map(p => {
            let probYes = p.probYes ?? p.yesProb;
            let probNo = p.probNo ?? p.noProb;

            if (probYes === undefined || probNo === undefined) {
                const yP = p.yesPrice ?? 0;
                const nP = p.noPrice ?? 0;
                const total = yP + nP;
                probYes = total > 0 ? (yP / total) : 0.5;
                probNo = 1 - probYes;
            }

            return {
                timestamp: p.timestamp,
                probYesPct: probYes * 100,
                probNoPct: probNo * 100,
            };
        });

        if (data.length === 0) {
            data.push({
                timestamp: Date.now(),
                probYesPct: 50,
                probNoPct: 50,
            });
        }

        // X-axis: let chart auto-fill (no fixed air gap)
        // Use 'auto' domain so Recharts fills the width with data
        const allValues = data.flatMap(p => [p.probYesPct, p.probNoPct]);
        const minVal = Math.min(...allValues);
        const maxVal = Math.max(...allValues);
        const padding = 5; // 5% padding
        const yMin = Math.max(0, Math.floor(minVal - padding));
        const yMax = Math.min(100, Math.ceil(maxVal + padding));
        const yDomain: [number, number] = isFinite(yMin) && isFinite(yMax) && yMax > yMin
            ? [yMin, yMax]
            : [0, 100];

        return { chartData: data, yDomain };
    }, [priceHistory, timeFrame]);

    const lastIndex = chartData.length - 1;

    // Get last values for labels
    const lastYesPct = chartData[lastIndex]?.probYesPct ?? 50;
    const lastNoPct = chartData[lastIndex]?.probNoPct ?? 50;

    // Custom dot that only renders on the last point with label like Kalshi
    const LastDotYes = (props: any) => {
        const { cx, cy, index } = props;
        if (index !== lastIndex || !cx || !cy) return null;
        return (
            <g>
                <circle cx={cx} cy={cy} r={5} fill="#3b82f6" stroke="#fff" strokeWidth={2} />
                <text x={cx + 12} y={cy + 4} fill="#3b82f6" fontSize={12} fontWeight={600}>
                    {lastYesPct.toFixed(0)}%
                </text>
            </g>
        );
    };

    const LastDotNo = (props: any) => {
        const { cx, cy, index } = props;
        if (index !== lastIndex || !cx || !cy) return null;
        return (
            <g>
                <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#fff" strokeWidth={2} />
                <text x={cx + 12} y={cy + 4} fill="#ef4444" fontSize={12} fontWeight={600}>
                    {lastNoPct.toFixed(0)}%
                </text>
            </g>
        );
    };

    const formatDate = (ts: number) => {
        const date = new Date(ts);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const formatDateFull = (ts: number) => {
        const date = new Date(ts);
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="w-full flex flex-col">
            {/* Timeframe buttons */}
            <div className="flex justify-end gap-1 mb-3 px-2">
                {(["1H", "6H", "1D", "1W", "1M", "ALL"] as TimeFrame[]).map((tf) => (
                    <button
                        key={tf}
                        onClick={() => setTimeFrame(tf)}
                        className={clsx(
                            "text-[11px] font-semibold px-3 py-1.5 rounded-md transition-colors",
                            timeFrame === tf
                                ? "bg-[var(--color-primary)] text-white"
                                : "bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                        )}
                    >
                        {tf}
                    </button>
                ))}
            </div>

            {/* Chart Panel - Light grey background matching UI */}
            <div
                className="w-full rounded-xl border border-[var(--border-subtle)]"
                style={{
                    backgroundColor: "var(--bg-panel)",
                    padding: "20px",
                }}
            >
                <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={chartData} margin={{ top: 10, right: 60, left: 10, bottom: 10 }}>
                        <defs>
                            <linearGradient id="colorYes" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorNo" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                            </linearGradient>
                        </defs>

                        <XAxis
                            dataKey="timestamp"
                            tickFormatter={formatDate}
                            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            minTickGap={50}
                            dy={10}
                        />

                        <YAxis
                            orientation="right"
                            domain={yDomain}
                            tickFormatter={(v: number) => `${v}%`}
                            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            width={45}
                        />

                        <Tooltip
                            contentStyle={{
                                backgroundColor: "rgba(255, 255, 255, 0.95)",
                                border: "none",
                                borderRadius: 8,
                                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                                fontSize: "12px",
                                fontWeight: 500
                            }}
                            labelFormatter={formatDateFull}
                            formatter={(value: number, name: string) => [
                                `${value.toFixed(1)}%`,
                                name === "probYesPct" ? "YES" : "NO"
                            ]}
                        />

                        {/* YES Area - Green Gradient */}
                        <Area
                            type="monotone"
                            dataKey="probYesPct"
                            stroke="#22c55e"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorYes)"
                            activeDot={{ r: 6, fill: "#22c55e", stroke: "#fff", strokeWidth: 3 }}
                            isAnimationActive={true}
                            animationDuration={1500}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
