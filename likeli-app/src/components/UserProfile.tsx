"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useLikeliProgram } from "@/hooks/useLikeliProgram";
import { User, Edit2, Check, X, TrendingUp, Wallet, ExternalLink } from "lucide-react";

interface UserData {
    wallet: string;
    username: string | null;
    avatar: string | null;
    bio: string | null;
    exists: boolean;
}

interface UserStats {
    volume: number;
    trades: number;
    markets: number;
}

export default function UserProfile() {
    const { publicKey, connected } = useWallet();
    const [userData, setUserData] = useState<UserData | null>(null);
    const [stats, setStats] = useState<UserStats>({ volume: 0, trades: 0, markets: 0 });
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Edit form state
    const [editUsername, setEditUsername] = useState("");
    const [editBio, setEditBio] = useState("");

    useEffect(() => {
        if (!connected || !publicKey) {
            setUserData(null);
            setLoading(false);
            return;
        }

        const fetchUserData = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/users/${publicKey.toBase58()}`);
                const data = await res.json();
                setUserData(data);
                setEditUsername(data.username || "");
                setEditBio(data.bio || "");
            } catch (error) {
                console.error("Failed to fetch user data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchUserData();
    }, [publicKey, connected]);

    const handleSave = async () => {
        if (!publicKey) return;

        try {
            setSaving(true);
            const res = await fetch(`/api/users/${publicKey.toBase58()}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: editUsername || null,
                    bio: editBio || null,
                }),
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || "Failed to save");
            }

            const updatedData = await res.json();
            setUserData(updatedData);
            setEditing(false);
        } catch (error: any) {
            alert(error.message);
        } finally {
            setSaving(false);
        }
    };

    const formatWallet = (wallet: string) => {
        return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
    };

    if (!connected) {
        return (
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-8 text-center">
                <User size={48} className="mx-auto text-slate-600 mb-4" />
                <h3 className="text-white font-semibold mb-2">Connect Wallet</h3>
                <p className="text-slate-400 text-sm">
                    Connect your wallet to view and edit your profile
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-8 text-center">
                <div className="animate-pulse">Loading profile...</div>
            </div>
        );
    }

    return (
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-800">
                <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-2xl font-bold">
                        {userData?.username?.[0]?.toUpperCase() || publicKey?.toBase58()[0]}
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                        {editing ? (
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    value={editUsername}
                                    onChange={e => setEditUsername(e.target.value)}
                                    placeholder="Username"
                                    maxLength={50}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                                />
                                <textarea
                                    value={editBio}
                                    onChange={e => setEditBio(e.target.value)}
                                    placeholder="Bio (optional)"
                                    maxLength={200}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white h-20 resize-none"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm"
                                    >
                                        <Check size={14} />
                                        {saving ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                        onClick={() => setEditing(false)}
                                        className="flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
                                    >
                                        <X size={14} />
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-2 mb-1">
                                    <h2 className="text-xl font-bold text-white">
                                        {userData?.username || "Anonymous Trader"}
                                    </h2>
                                    <button
                                        onClick={() => setEditing(true)}
                                        className="p-1 text-slate-400 hover:text-white transition-colors"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                </div>

                                <div className="flex items-center gap-1 text-sm text-slate-400 mb-2">
                                    <Wallet size={14} />
                                    {formatWallet(publicKey?.toBase58() || "")}
                                    <a
                                        href={`https://solscan.io/account/${publicKey?.toBase58()}?cluster=devnet`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-1 hover:text-purple-400"
                                    >
                                        <ExternalLink size={12} />
                                    </a>
                                </div>

                                {userData?.bio && (
                                    <p className="text-slate-300 text-sm">{userData.bio}</p>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 divide-x divide-slate-800">
                <div className="p-4 text-center">
                    <div className="text-2xl font-bold text-white">
                        ${stats.volume.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-400">Total Volume</div>
                </div>
                <div className="p-4 text-center">
                    <div className="text-2xl font-bold text-white">
                        {stats.trades}
                    </div>
                    <div className="text-xs text-slate-400">Trades</div>
                </div>
                <div className="p-4 text-center">
                    <div className="text-2xl font-bold text-white">
                        {stats.markets}
                    </div>
                    <div className="text-xs text-slate-400">Markets Created</div>
                </div>
            </div>
        </div>
    );
}
