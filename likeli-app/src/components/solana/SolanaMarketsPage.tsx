"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useLikeliProgram, MarketAccount, PROGRAM_ID } from "@/hooks/useLikeliProgram";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import styles from "../markets/markets.module.css";
import pageStyles from "../../app/page.module.css";
import { Search, Plus, Loader2 } from "lucide-react";

interface SolanaMarket {
    publicKey: PublicKey;
    account: MarketAccount;
    yesPrice: number;
    noPrice: number;
}

export default function SolanaMarketsPage() {
    const { connected, publicKey } = useWallet();
    const { fetchAllMarkets, createMarket, buyShares } = useLikeliProgram();

    const [markets, setMarkets] = useState<SolanaMarket[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    // Create market form state
    const [newQuestion, setNewQuestion] = useState("");
    const [newResolutionDays, setNewResolutionDays] = useState("7");
    const [newLiquidity, setNewLiquidity] = useState("1000");
    const [creating, setCreating] = useState(false);

    // Load markets from blockchain
    const loadMarkets = useCallback(async () => {
        try {
            setLoading(true);
            const fetchedMarkets = await fetchAllMarkets();

            // Calculate prices from pools
            const marketsWithPrices = fetchedMarkets.map((m: { publicKey: PublicKey; account: MarketAccount }) => {
                const yesPool = m.account.yesPool.toNumber();
                const noPool = m.account.noPool.toNumber();
                const total = yesPool + noPool;
                // YES price = NO_pool / total (higher NO pool = higher YES price)
                const yesPrice = total > 0 ? noPool / total : 0.5;
                const noPrice = total > 0 ? yesPool / total : 0.5;

                return {
                    ...m,
                    yesPrice,
                    noPrice,
                };
            });

            setMarkets(marketsWithPrices);
        } catch (error) {
            console.error("Failed to load markets:", error);
        } finally {
            setLoading(false);
        }
    }, [fetchAllMarkets]);

    useEffect(() => {
        if (connected) {
            loadMarkets();
            // Refresh every 10 seconds
            const interval = setInterval(loadMarkets, 10000);
            return () => clearInterval(interval);
        }
    }, [connected, loadMarkets]);

    // Handle create market
    const handleCreateMarket = async () => {
        if (!newQuestion || !connected) return;

        try {
            setCreating(true);
            const resolutionTime = Math.floor(Date.now() / 1000) + (parseInt(newResolutionDays) * 24 * 60 * 60);
            const liquidity = parseInt(newLiquidity);

            await createMarket(newQuestion, resolutionTime, liquidity);

            // Reset form and reload
            setNewQuestion("");
            setIsCreateOpen(false);
            await loadMarkets();

            alert("Market created on Solana! 🎉");
        } catch (error: any) {
            console.error("Failed to create market:", error);
            alert(`Failed to create market: ${error.message}`);
        } finally {
            setCreating(false);
        }
    };

    // Handle buy shares
    const handleBuy = async (marketPubkey: PublicKey, outcome: boolean) => {
        if (!connected) {
            alert("Please connect your wallet first");
            return;
        }

        const amount = prompt(`Enter amount to buy ${outcome ? "YES" : "NO"} shares:`);
        if (!amount) return;

        try {
            await buyShares(marketPubkey, outcome, parseInt(amount));
            await loadMarkets();
            alert(`Bought ${outcome ? "YES" : "NO"} shares! 🎉`);
        } catch (error: any) {
            console.error("Failed to buy shares:", error);
            alert(`Failed to buy: ${error.message}`);
        }
    };

    // Filter markets by search
    const filteredMarkets = markets.filter(m =>
        m.account.question.toLowerCase().includes(search.toLowerCase())
    );

    if (!connected) {
        return (
            <div className={styles.emptyState}>
                <h2>Connect Your Wallet</h2>
                <p>Connect Phantom wallet to view and trade on Solana prediction markets.</p>
            </div>
        );
    }

    return (
        <div style={{ padding: "24px" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                <div>
                    <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>
                        🔗 Solana Prediction Markets
                    </h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                        Live on Devnet • Program: {PROGRAM_ID.toString().slice(0, 8)}...
                    </p>
                </div>

                <button
                    onClick={() => setIsCreateOpen(true)}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "12px 20px",
                        backgroundColor: "var(--color-primary)",
                        color: "white",
                        border: "none",
                        borderRadius: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                    }}
                >
                    <Plus size={16} />
                    Create Market
                </button>
            </div>

            {/* Search */}
            <div style={{ marginBottom: "24px" }}>
                <div style={{ position: "relative", maxWidth: "400px" }}>
                    <Search
                        size={16}
                        style={{
                            position: "absolute",
                            left: "12px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "var(--text-secondary)"
                        }}
                    />
                    <input
                        type="text"
                        placeholder="Search markets..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "12px 12px 12px 40px",
                            backgroundColor: "var(--bg-input)",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "8px",
                            color: "var(--text-primary)",
                            fontSize: "14px",
                        }}
                    />
                </div>
            </div>

            {/* Loading state */}
            {loading && (
                <div style={{ textAlign: "center", padding: "48px" }}>
                    <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto 16px" }} />
                    <p>Loading markets from Solana...</p>
                </div>
            )}

            {/* Markets Grid */}
            {!loading && filteredMarkets.length === 0 && (
                <div style={{
                    textAlign: "center",
                    padding: "48px",
                    backgroundColor: "var(--bg-card)",
                    borderRadius: "16px"
                }}>
                    <h3 style={{ marginBottom: "8px" }}>No markets yet</h3>
                    <p style={{ color: "var(--text-secondary)" }}>
                        Create the first prediction market on Solana!
                    </p>
                </div>
            )}

            {!loading && filteredMarkets.length > 0 && (
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                    gap: "20px"
                }}>
                    {filteredMarkets.map((market) => (
                        <div
                            key={market.publicKey.toString()}
                            style={{
                                backgroundColor: "var(--bg-card)",
                                borderRadius: "16px",
                                padding: "20px",
                                border: "1px solid var(--border-subtle)",
                            }}
                        >
                            {/* Question */}
                            <h3 style={{
                                fontSize: "16px",
                                fontWeight: 600,
                                marginBottom: "16px",
                                lineHeight: 1.4,
                            }}>
                                {market.account.question}
                            </h3>

                            {/* Prices */}
                            <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                                <div style={{
                                    flex: 1,
                                    padding: "12px",
                                    backgroundColor: "rgba(34, 197, 94, 0.1)",
                                    borderRadius: "8px",
                                    textAlign: "center",
                                }}>
                                    <div style={{ fontSize: "12px", color: "#22c55e", marginBottom: "4px" }}>YES</div>
                                    <div style={{ fontSize: "20px", fontWeight: 700, color: "#22c55e" }}>
                                        {(market.yesPrice * 100).toFixed(1)}¢
                                    </div>
                                </div>
                                <div style={{
                                    flex: 1,
                                    padding: "12px",
                                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                                    borderRadius: "8px",
                                    textAlign: "center",
                                }}>
                                    <div style={{ fontSize: "12px", color: "#ef4444", marginBottom: "4px" }}>NO</div>
                                    <div style={{ fontSize: "20px", fontWeight: 700, color: "#ef4444" }}>
                                        {(market.noPrice * 100).toFixed(1)}¢
                                    </div>
                                </div>
                            </div>

                            {/* Stats */}
                            <div style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: "12px",
                                color: "var(--text-secondary)",
                                marginBottom: "16px",
                            }}>
                                <span>Volume: {market.account.totalVolume.toNumber()}</span>
                                <span>{market.account.resolved ? "✅ Resolved" : "🔴 Active"}</span>
                            </div>

                            {/* Buy Buttons */}
                            {!market.account.resolved && (
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <button
                                        onClick={() => handleBuy(market.publicKey, true)}
                                        style={{
                                            flex: 1,
                                            padding: "10px",
                                            backgroundColor: "#22c55e",
                                            color: "white",
                                            border: "none",
                                            borderRadius: "8px",
                                            fontWeight: 600,
                                            cursor: "pointer",
                                        }}
                                    >
                                        Buy YES
                                    </button>
                                    <button
                                        onClick={() => handleBuy(market.publicKey, false)}
                                        style={{
                                            flex: 1,
                                            padding: "10px",
                                            backgroundColor: "#ef4444",
                                            color: "white",
                                            border: "none",
                                            borderRadius: "8px",
                                            fontWeight: 600,
                                            cursor: "pointer",
                                        }}
                                    >
                                        Buy NO
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Create Market Modal */}
            {isCreateOpen && (
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1000,
                }}>
                    <div style={{
                        backgroundColor: "var(--bg-card)",
                        borderRadius: "20px",
                        padding: "32px",
                        maxWidth: "500px",
                        width: "90%",
                    }}>
                        <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "24px" }}>
                            Create Market on Solana
                        </h2>

                        <div style={{ marginBottom: "20px" }}>
                            <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>
                                Question
                            </label>
                            <input
                                type="text"
                                placeholder="Will Bitcoin hit $150k by end of 2025?"
                                value={newQuestion}
                                onChange={(e) => setNewQuestion(e.target.value)}
                                maxLength={200}
                                style={{
                                    width: "100%",
                                    padding: "12px",
                                    backgroundColor: "var(--bg-input)",
                                    border: "1px solid var(--border-subtle)",
                                    borderRadius: "8px",
                                    color: "var(--text-primary)",
                                    fontSize: "14px",
                                }}
                            />
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                {newQuestion.length}/200 characters
                            </span>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                            <div>
                                <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>
                                    Resolution (days)
                                </label>
                                <input
                                    type="number"
                                    value={newResolutionDays}
                                    onChange={(e) => setNewResolutionDays(e.target.value)}
                                    min="1"
                                    style={{
                                        width: "100%",
                                        padding: "12px",
                                        backgroundColor: "var(--bg-input)",
                                        border: "1px solid var(--border-subtle)",
                                        borderRadius: "8px",
                                        color: "var(--text-primary)",
                                        fontSize: "14px",
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>
                                    Initial Liquidity
                                </label>
                                <input
                                    type="number"
                                    value={newLiquidity}
                                    onChange={(e) => setNewLiquidity(e.target.value)}
                                    min="100"
                                    style={{
                                        width: "100%",
                                        padding: "12px",
                                        backgroundColor: "var(--bg-input)",
                                        border: "1px solid var(--border-subtle)",
                                        borderRadius: "8px",
                                        color: "var(--text-primary)",
                                        fontSize: "14px",
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{
                            padding: "12px",
                            backgroundColor: "rgba(59, 130, 246, 0.1)",
                            borderRadius: "8px",
                            marginBottom: "24px",
                            fontSize: "13px",
                            color: "#3b82f6",
                        }}>
                            ⛓️ This will create a real market on Solana Devnet. Your wallet will sign the transaction.
                        </div>

                        <div style={{ display: "flex", gap: "12px" }}>
                            <button
                                onClick={() => setIsCreateOpen(false)}
                                style={{
                                    flex: 1,
                                    padding: "12px",
                                    backgroundColor: "transparent",
                                    border: "1px solid var(--border-subtle)",
                                    borderRadius: "8px",
                                    color: "var(--text-primary)",
                                    fontWeight: 500,
                                    cursor: "pointer",
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateMarket}
                                disabled={creating || !newQuestion}
                                style={{
                                    flex: 1,
                                    padding: "12px",
                                    backgroundColor: creating ? "var(--bg-input)" : "var(--color-primary)",
                                    border: "none",
                                    borderRadius: "8px",
                                    color: "white",
                                    fontWeight: 600,
                                    cursor: creating ? "wait" : "pointer",
                                    opacity: !newQuestion ? 0.5 : 1,
                                }}
                            >
                                {creating ? "Creating..." : "Create on Solana"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
