"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";

// Answer data from multi-choice market
interface AnswerData {
    id: string;
    text: string;
    prob: number;
    poolYes: number;
    poolNo: number;
}

interface MultiOutcomeChartProps {
    answers: AnswerData[];
    volume?: number;
    priceHistory?: { [answerId: string]: { timestamp: number; prob: number }[] };
}

type TimeFrame = "1D" | "1W" | "1M" | "ALL";

// Kalshi-inspired color palette (up to 10 distinct colors)
const CHART_COLORS = [
    "#22c55e", // green
    "#3b82f6", // blue
    "#1f2937", // dark gray/black
    "#8b5cf6", // purple
    "#f59e0b", // amber
    "#ef4444", // red
    "#06b6d4", // cyan
    "#ec4899", // pink
    "#84cc16", // lime
    "#6366f1", // indigo
];

export default function MultiOutcomeChart({
    answers,
    volume = 0,
    priceHistory,
}: MultiOutcomeChartProps) {
    const [timeFrame, setTimeFrame] = useState<TimeFrame>("ALL");

    // Generate chart data combining all answers
    const { chartData, sortedAnswers } = useMemo(() => {
        // Sort answers by current probability (highest first)
        const sorted = [...answers].sort((a, b) => b.prob - a.prob);

        // If we have real price history, use it
        if (priceHistory && Object.keys(priceHistory).length > 0) {
            // Get all unique timestamps
            const allTimestamps = new Set<number>();
            Object.values(priceHistory).forEach(history => {
                history.forEach(point => allTimestamps.add(point.timestamp));
            });

            // Filter by timeframe
            const now = Date.now();
            let cutoff = 0;
            switch (timeFrame) {
                case "1D": cutoff = now - 24 * 60 * 60 * 1000; break;
                case "1W": cutoff = now - 7 * 24 * 60 * 60 * 1000; break;
                case "1M": cutoff = now - 30 * 24 * 60 * 60 * 1000; break;
                case "ALL": cutoff = 0; break;
            }

            const filteredTimestamps = Array.from(allTimestamps)
                .filter(ts => ts >= cutoff)
                .sort((a, b) => a - b);

            // Build chart data with all answers
            const data = filteredTimestamps.map(ts => {
                const point: any = { timestamp: ts };
                sorted.forEach((answer, idx) => {
                    const history = priceHistory[answer.id] || [];
                    // Find closest point at or before this timestamp
                    const closest = history
                        .filter(p => p.timestamp <= ts)
                        .sort((a, b) => b.timestamp - a.timestamp)[0];
                    point[`answer_${idx}`] = closest ? closest.prob * 100 : answer.prob * 100;
                });
                return point;
            });

            // Add current point if not recent
            const lastTs = filteredTimestamps[filteredTimestamps.length - 1] || 0;
            if (now - lastTs > 60000) {
                const currentPoint: any = { timestamp: now };
                sorted.forEach((answer, idx) => {
                    currentPoint[`answer_${idx}`] = answer.prob * 100;
                });
                data.push(currentPoint);
            }

            return { chartData: data.length > 0 ? data : generateDefaultData(sorted), sortedAnswers: sorted };
        }

        // No history - generate synthetic data based on current probabilities
        return { chartData: generateDefaultData(sorted), sortedAnswers: sorted };
    }, [answers, priceHistory, timeFrame]);

    // Generate default chart data (flat line from past to now)
    function generateDefaultData(sortedAnswers: AnswerData[]) {
        const now = Date.now();
        const past = now - 7 * 24 * 60 * 60 * 1000; // 1 week ago
        const points = [past, now];

        return points.map(ts => {
            const point: any = { timestamp: ts };
            sortedAnswers.forEach((answer, idx) => {
                point[`answer_${idx}`] = answer.prob * 100;
            });
            return point;
        });
    }

    // Format date for axis
    const formatDate = (ts: number) => {
        const date = new Date(ts);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    // Format for tooltip
    const formatDateFull = (ts: number) => {
        const date = new Date(ts);
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Format volume
    const formatVolume = (vol: number) => {
        if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
        if (vol >= 1000) return `$${(vol / 1000).toFixed(0)}K`;
        return `$${vol.toFixed(0)}`;
    };

    // Custom dot for last point with label
    const createLastDot = (answerIndex: number, color: string) => {
        const answer = sortedAnswers[answerIndex];
        const lastIndex = chartData.length - 1;

        return (props: any) => {
            const { cx, cy, index } = props;
            if (index !== lastIndex || !cx || !cy) return null;
            return (
                <g>
                    <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={2} />
                </g>
            );
        };
    };

    return (
        <div className="w-full flex flex-col mb-4">
            {/* Legend */}
            <div className="flex flex-wrap gap-4 mb-3 px-2">
                {sortedAnswers.slice(0, 10).map((answer, idx) => (
                    <div key={answer.id} className="flex items-center gap-2">
                        <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: CHART_COLORS[idx] }}
                        />
                        <span className="text-sm text-[var(--text-main)]">
                            {answer.text}
                        </span>
                        <span className="text-sm font-semibold" style={{ color: CHART_COLORS[idx] }}>
                            {Math.round(answer.prob * 100)}%
                        </span>
                    </div>
                ))}
            </div>

            {/* Chart Panel */}
            <div
                className="w-full rounded-xl border border-[var(--border-subtle)]"
                style={{
                    backgroundColor: "var(--bg-panel)",
                    padding: "20px",
                }}
            >
                <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData} margin={{ top: 10, right: 50, left: 10, bottom: 10 }}>
                        <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" vertical={false} />

                        <XAxis
                            dataKey="timestamp"
                            tickFormatter={formatDate}
                            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                            axisLine={{ stroke: "var(--border-subtle)" }}
                            tickLine={false}
                            minTickGap={50}
                        />

                        <YAxis
                            orientation="right"
                            domain={[0, 100]}
                            tickFormatter={(v: number) => `${v}%`}
                            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            width={40}
                        />

                        <Tooltip
                            contentStyle={{
                                backgroundColor: "var(--bg-panel)",
                                border: "1px solid var(--border-subtle)",
                                borderRadius: 8,
                                boxShadow: "var(--shadow-md)",
                            }}
                            labelFormatter={formatDateFull}
                            formatter={(value: number, name: string) => {
                                const idx = parseInt(name.replace('answer_', ''));
                                const answer = sortedAnswers[idx];
                                return [`${value.toFixed(1)}%`, answer?.text || name];
                            }}
                        />

                        {/* Render a line for each answer (up to 10) */}
                        {sortedAnswers.slice(0, 10).map((answer, idx) => (
                            <Line
                                key={answer.id}
                                type="linear"
                                dataKey={`answer_${idx}`}
                                stroke={CHART_COLORS[idx]}
                                strokeWidth={2}
                                dot={createLastDot(idx, CHART_COLORS[idx])}
                                activeDot={{ r: 5, fill: CHART_COLORS[idx], stroke: "#fff", strokeWidth: 2 }}
                                isAnimationActive={false}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Bottom bar: Volume + Timeframe */}
            <div className="flex justify-between items-center mt-3 px-2">
                <span className="text-sm text-[var(--text-muted)]">
                    {formatVolume(volume)} vol
                </span>

                <div className="flex gap-1">
                    {(["1D", "1W", "1M", "ALL"] as TimeFrame[]).map((tf) => (
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
            </div>
        </div>
    );
}
