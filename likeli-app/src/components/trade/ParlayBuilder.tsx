"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/context/AuthContext";
import { X, Trophy } from "lucide-react";
import styles from "@/components/markets/markets.module.css";

interface ParlayBuilderProps {
    onClose: () => void;
}

export default function ParlayBuilder({ onClose }: ParlayBuilderProps) {
    const { markets, currentUser, placeParlay } = useStore();
    const { isAuthenticated } = useAuth();
    const [leg1MarketId, setLeg1MarketId] = useState("");
    const [leg2MarketId, setLeg2MarketId] = useState("");
    const [stake, setStake] = useState("");
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [lastPayout, setLastPayout] = useState(0);

    // Filter active markets
    const activeMarkets = useMemo(() => markets.filter(m => m.status === "active"), [markets]);

    // Calculate odds (Assuming YES outcome for simplicity as per demo requirements)
    const leg1Market = markets.find(m => m.id === leg1MarketId);
    const leg1Outcome = leg1Market?.outcomes.find(o => o.id === "yes");
    const leg1Prob = leg1Outcome?.price || 0;

    const leg2Market = markets.find(m => m.id === leg2MarketId);
    const leg2Outcome = leg2Market?.outcomes.find(o => o.id === "yes");
    const leg2Prob = leg2Outcome?.price || 0;

    const combinedProb = leg1Prob * leg2Prob;
    const houseEdge = 0.05;
    const multiplier = combinedProb > 0 ? (1 / combinedProb) * (1 - houseEdge) : 0;
    const potentialPayout = (parseFloat(stake) || 0) * multiplier;
    const roiPercent = multiplier > 1 ? ((multiplier - 1) * 100).toFixed(0) : "0";

    const canPlaceParlay = leg1MarketId && leg2MarketId && parseFloat(stake) > 0 && parseFloat(stake) <= currentUser.balance && isAuthenticated;

    const handleSubmit = () => {
        if (!canPlaceParlay) return;

        placeParlay([
            { marketId: leg1MarketId, outcomeId: "yes" },
            { marketId: leg2MarketId, outcomeId: "yes" }
        ], parseFloat(stake));

        setLastPayout(potentialPayout);
        setShowConfirmation(true);
    };

    const handleClose = () => {
        setShowConfirmation(false);
        onClose();
    };

    if (showConfirmation) {
        return (
            <div className={styles.backdrop}>
                <div className={styles.modalCard} style={{ maxWidth: "480px", textAlign: "center" }}>
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Trophy size={32} />
                    </div>
                    <h2 className={styles.modalTitle}>Parlay Placed!</h2>
                    <p className={styles.modalSubtitle} style={{ marginBottom: "24px" }}>
                        Your bet has been successfully placed. <br />
                        Potential Payout: <strong className="text-green-600">${lastPayout.toFixed(2)}</strong>
                    </p>
                    <button
                        onClick={handleClose}
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        style={{ width: "100%" }}
                    >
                        Awesome
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.backdrop}>
            <div className={styles.modalCard}>
                {/* Header */}
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title}>Parlay Builder</h2>
                        <p className={styles.subtitle}>Combine 2 markets for multiplied returns.</p>
                    </div>
                    <button onClick={onClose} className={styles.close}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.content}>
                    {/* Left Column: Leg Selection */}
                    <div className={styles.left}>
                        {/* Leg 1 */}
                        <div className={styles.field}>
                            <label className={styles.label}>Leg 1</label>
                            <select
                                className={styles.select}
                                value={leg1MarketId}
                                onChange={e => setLeg1MarketId(e.target.value)}
                            >
                                <option value="">Select Market...</option>
                                {activeMarkets.map(m => (
                                    <option key={m.id} value={m.id}>{m.question}</option>
                                ))}
                            </select>
                        </div>

                        {/* Leg 2 */}
                        <div className={styles.field}>
                            <label className={styles.label}>Leg 2</label>
                            <select
                                className={styles.select}
                                value={leg2MarketId}
                                onChange={e => setLeg2MarketId(e.target.value)}
                            >
                                <option value="">Select Market...</option>
                                {activeMarkets.filter(m => m.id !== leg1MarketId).map(m => (
                                    <option key={m.id} value={m.id}>{m.question}</option>
                                ))}
                            </select>
                        </div>

                        {/* Stake */}
                        <div className={styles.field}>
                            <label className={styles.label}>Your Stake</label>
                            <div style={{ position: "relative" }}>
                                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#6b7280" }}>$</span>
                                <input
                                    type="number"
                                    className={styles.input}
                                    style={{ paddingLeft: "28px" }}
                                    placeholder="0.00"
                                    value={stake}
                                    onChange={e => setStake(e.target.value)}
                                />
                                <button
                                    onClick={() => setStake(currentUser.balance.toString())}
                                    style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "12px", fontWeight: "bold", color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}
                                >
                                    MAX
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Summary */}
                    <div className={styles.right}>
                        <div className={styles.summaryBox}>
                            <div className={styles.summaryContent}>
                                <h3 className={styles.label} style={{ marginBottom: "16px" }}>Summary</h3>

                                <div className={styles.summaryRow}>
                                    <span>Combined Odds</span>
                                    <span className="font-mono font-medium text-gray-900">{(combinedProb * 100).toFixed(2)}%</span>
                                </div>
                                <div className={styles.summaryRow}>
                                    <span>Balance</span>
                                    <span className="font-mono font-medium text-gray-900">${currentUser.balance.toFixed(2)}</span>
                                </div>

                                <div className={styles.summaryTotal}>
                                    <span>Potential Payout</span>
                                    <span style={{ color: "#16a34a" }}>${potentialPayout.toFixed(2)}</span>
                                </div>
                                <div className={styles.summaryRow}>
                                    <span>ROI</span>
                                    <span style={{ color: "#16a34a", fontWeight: "bold" }}>{roiPercent}%</span>
                                </div>
                            </div>

                            <div className={styles.actions}>
                                <button
                                    className={`${styles.btn} ${styles.btnOutline}`}
                                    onClick={onClose}
                                >
                                    Cancel
                                </button>
                                <button
                                    className={`${styles.btn} ${styles.btnPrimary}`}
                                    disabled={!canPlaceParlay}
                                    onClick={handleSubmit}
                                >
                                    {isAuthenticated ? "Place Parlay Bet" : "Connect Wallet to Bet"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
