"use client";

import { useState } from "react";
import styles from "@/components/vaults/vaults.module.css";
import VaultChat from "@/components/vaults/VaultChat";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const PERFORMANCE_DATA = [
    { date: "Nov 1", value: 100 },
    { date: "Nov 5", value: 105 },
    { date: "Nov 10", value: 103 },
    { date: "Nov 15", value: 112 },
    { date: "Nov 20", value: 118 },
    { date: "Nov 25", value: 124 },
];

export default function VaultDetailPage() {
    return (
        <div className={styles.detailContainer}>
            <div className={styles.detailMain}>
                <div>
                    <h1 className={styles.pageTitle}>Macro Trends</h1>
                    <p className={styles.pageDesc}>Managed by Global Macro Fund</p>
                </div>

                <div className="bg-panel" style={{ height: "400px", padding: "var(--space-4)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)" }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={PERFORMANCE_DATA}>
                            <XAxis dataKey="date" stroke="#8B91A0" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#8B91A0" fontSize={12} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                            <Tooltip
                                contentStyle={{ backgroundColor: "#191D26", border: "1px solid #262B35", borderRadius: "4px" }}
                                itemStyle={{ color: "#F5F5F7" }}
                            />
                            <Line type="monotone" dataKey="value" stroke="#E63946" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <div className={styles.vaultStats}>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>30d Return</span>
                        <span className="text-success text-xl font-bold">+24.0%</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>TVL</span>
                        <span className="text-xl font-bold">$4.5M</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>Depositors</span>
                        <span className="text-xl font-bold">1,240</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>Max Drawdown</span>
                        <span className="text-danger text-xl font-bold">-8.5%</span>
                    </div>
                </div>
            </div>

            <div className={styles.detailSidebar}>
                <div className="bg-panel" style={{ padding: "var(--space-4)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", marginBottom: "var(--space-4)" }}>
                    <div className="flex-between" style={{ marginBottom: "var(--space-4)" }}>
                        <span className="text-muted">Your Balance</span>
                        <span className="font-bold">0.00 USDC</span>
                    </div>
                    <button className={styles.depositBtn} style={{ backgroundColor: "var(--color-primary)", color: "white", border: "none" }}>
                        Deposit
                    </button>
                </div>

                <VaultChat />
            </div>
        </div>
    );
}
