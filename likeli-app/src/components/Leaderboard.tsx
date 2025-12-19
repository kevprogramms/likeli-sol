"use client";

import { useState, useEffect } from "react";
import { Trophy, TrendingUp, Wallet } from "lucide-react";

interface LeaderboardEntry {
    wallet: string;
    username?: string;
    avatar?: string;
    volume: number;
    trades: number;
}

export default function Leaderboard() {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState<"all" | "week" | "day">("all");

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/leaderboard?limit=50`);
                const data = await res.json();
                setLeaderboard(data.leaderboard || []);
            } catch (error) {
                console.error("Failed to fetch leaderboard:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchLeaderboard();
    }, [timeframe]);

    const formatWallet = (wallet: string) => {
        return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
    };

    const formatVolume = (volume: number) => {
        if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
        if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}K`;
        return `$${volume.toFixed(0)}`;
    };

    const getRankColor = (rank: number) => {
        switch (rank) {
            case 1: return "text-yellow-400";
            case 2: return "text-gray-300";
            case 3: return "text-amber-600";
            default: return "text-slate-400";
        }
    };

    const getRankIcon = (rank: number) => {
        switch (rank) {
            case 1: return "🥇";
            case 2: return "🥈";
            case 3: return "🥉";
            default: return `${rank}`;
        }
    };

    return (
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Trophy className="text-yellow-400" size={20} />
                    <h2 className="font-bold text-white">Leaderboard</h2>
                </div>

                <div className="flex gap-1">
                    {(["day", "week", "all"] as const).map(tf => (
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
                            {tf === "all" ? "All Time" : tf === "week" ? "7D" : "24H"}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="p-8 text-center text-slate-400">
                    Loading leaderboard...
                </div>
            ) : leaderboard.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                    No trading activity yet
                </div>
            ) : (
                <div className="divide-y divide-slate-800">
                    {leaderboard.map((entry, idx) => (
                        <div
                            key={entry.wallet}
                            className="flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                {/* Rank */}
                                <div className={`w-8 text-center font-bold ${getRankColor(idx + 1)}`}>
                                    {getRankIcon(idx + 1)}
                                </div>

                                {/* Avatar */}
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold">
                                    {entry.username?.[0]?.toUpperCase() || entry.wallet[0]}
                                </div>

                                {/* Name/Wallet */}
                                <div>
                                    <div className="text-white font-medium">
                                        {entry.username || formatWallet(entry.wallet)}
                                    </div>
                                    <div className="text-xs text-slate-400 flex items-center gap-1">
                                        <Wallet size={12} />
                                        {formatWallet(entry.wallet)}
                                    </div>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="text-right">
                                <div className="text-white font-bold flex items-center gap-1 justify-end">
                                    <TrendingUp size={14} className="text-green-400" />
                                    {formatVolume(entry.volume)}
                                </div>
                                <div className="text-xs text-slate-400">
                                    {entry.trades} trades
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
