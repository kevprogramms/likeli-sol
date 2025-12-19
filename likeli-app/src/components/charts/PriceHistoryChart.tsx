"use client";

import { useState, useEffect } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
} from "recharts";
import { TrendingUp, Clock } from "lucide-react";

interface PriceHistoryProps {
    marketAddress: string;
    answerIndex?: number;
}

interface PricePoint {
    timestamp: number;
    yesProb: number;
    noProb: number;
}

export default function PriceHistoryChart({ marketAddress, answerIndex = 0 }: PriceHistoryProps) {
    const [data, setData] = useState<PricePoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState<"1H" | "24H" | "7D" | "ALL">("ALL");

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                setLoading(true);
                const res = await fetch(
                    `/api/markets/${marketAddress}/history?answer_index=${answerIndex}&limit=500`
                );
                const result = await res.json();
                setData(result.history || []);
            } catch (error) {
                console.error("Failed to fetch price history:", error);
            } finally {
                setLoading(false);
            }
        };

        if (marketAddress) {
            fetchHistory();
        }
    }, [marketAddress, answerIndex, timeframe]);

    const filterDataByTimeframe = (data: PricePoint[]) => {
        if (data.length === 0) return data;

        const now = Date.now();
        const cutoffs = {
            "1H": now - 60 * 60 * 1000,
            "24H": now - 24 * 60 * 60 * 1000,
            "7D": now - 7 * 24 * 60 * 60 * 1000,
            "ALL": 0,
        };

        return data.filter(d => d.timestamp >= cutoffs[timeframe]);
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        if (timeframe === "1H" || timeframe === "24H") {
            return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        }
        return date.toLocaleDateString([], { month: "short", day: "numeric" });
    };

    const formatPercent = (value: number) => `${(value * 100).toFixed(0)}%`;

    const filteredData = filterDataByTimeframe(data);
    const currentYesProb = filteredData.length > 0 ? filteredData[filteredData.length - 1].yesProb : 0.5;
    const startYesProb = filteredData.length > 0 ? filteredData[0].yesProb : 0.5;
    const change = currentYesProb - startYesProb;
    const changePercent = startYesProb !== 0 ? (change / startYesProb) * 100 : 0;

    if (loading) {
        return (
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 h-80 flex items-center justify-center">
                <div className="text-slate-400 animate-pulse">Loading chart...</div>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 h-80 flex flex-col items-center justify-center">
                <Clock size={48} className="text-slate-600 mb-4" />
                <div className="text-slate-400">No price history yet</div>
                <div className="text-slate-500 text-sm">Trades will appear here</div>
            </div>
        );
    }

    return (
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <TrendingUp size={20} className="text-green-400" />
                    <div>
                        <span className="text-2xl font-bold text-white">
                            {formatPercent(currentYesProb)}
                        </span>
                        <span className="text-sm text-slate-400 ml-2">YES</span>
                    </div>
                    <span className={`text-sm font-medium ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {change >= 0 ? '↑' : '↓'} {Math.abs(changePercent).toFixed(1)}%
                    </span>
                </div>

                {/* Timeframe buttons */}
                <div className="flex gap-1">
                    {(["1H", "24H", "7D", "ALL"] as const).map(tf => (
                        <button
                            key={tf}
                            onClick={() => setTimeframe(tf)}
                            className={`
                                px-3 py-1 text-xs rounded-full transition-all
                                ${timeframe === tf
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                }
                            `}
                        >
                            {tf}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart */}
            <div className="p-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={filteredData}>
                        <defs>
                            <linearGradient id="yesGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="noGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                            </linearGradient>
                        </defs>

                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(148, 163, 184, 0.1)"
                            vertical={false}
                        />

                        <XAxis
                            dataKey="timestamp"
                            tickFormatter={formatTime}
                            stroke="#64748b"
                            tick={{ fontSize: 11 }}
                            axisLine={{ stroke: '#334155' }}
                        />

                        <YAxis
                            domain={[0, 1]}
                            tickFormatter={formatPercent}
                            stroke="#64748b"
                            tick={{ fontSize: 11 }}
                            axisLine={{ stroke: '#334155' }}
                            orientation="right"
                            width={50}
                        />

                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                                color: '#f8fafc'
                            }}
                            formatter={(value: number, name: string) => [
                                formatPercent(value),
                                name === 'yesProb' ? 'YES' : 'NO'
                            ]}
                            labelFormatter={(timestamp) => new Date(timestamp).toLocaleString()}
                        />

                        <Area
                            type="monotone"
                            dataKey="yesProb"
                            stroke="#22c55e"
                            strokeWidth={2}
                            fill="url(#yesGradient)"
                            dot={false}
                        />

                        <Area
                            type="monotone"
                            dataKey="noProb"
                            stroke="#ef4444"
                            strokeWidth={2}
                            fill="url(#noGradient)"
                            dot={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
