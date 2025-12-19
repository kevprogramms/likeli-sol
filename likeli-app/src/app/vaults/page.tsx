"use client";

import { useState } from "react";
import VaultCard from "@/components/vaults/VaultCard";
import LeaderboardTable from "@/components/vaults/LeaderboardTable";
import styles from "@/components/vaults/vaults.module.css";
import clsx from "clsx";

const LLP_VAULT = {
    id: "llp",
    name: "Likeli Liquidity Provider (LLP)",
    manager: "Protocol",
    return30d: "+8.5%",
    tvl: "$24.5M",
    risk: "Low" as const,
    isLikeli: true,
    strategy: "Protocol-run liquidity pool. Earns fees + funding + trader losses. You become the house.",
    volume: "$142.5M",
};

const COPY_VAULTS = [
    {
        id: 1,
        name: "Macro Trends",
        leader: "Global Macro Fund",
        return30d: "+12.4%",
        tvl: "$4.5M",
        risk: "Medium" as const,
        performanceFee: "15%",
        maxDrawdown: "-8.2%",
        age: "245d"
    },
    {
        id: 2,
        name: "Crypto Alpha",
        leader: "DeFi Degen",
        return30d: "+45.2%",
        tvl: "$1.2M",
        risk: "High" as const,
        performanceFee: "20%",
        maxDrawdown: "-15.4%",
        age: "120d"
    },
    {
        id: 3,
        name: "Stable Yield",
        leader: "SafeHands",
        return30d: "+4.5%",
        tvl: "$12.8M",
        risk: "Low" as const,
        performanceFee: "5%",
        maxDrawdown: "-1.2%",
        age: "365d"
    },
    {
        id: 4,
        name: "Election 2024",
        leader: "PolitiFi",
        return30d: "+8.9%",
        tvl: "$3.4M",
        risk: "Medium" as const,
        performanceFee: "10%",
        maxDrawdown: "-5.6%",
        age: "60d"
    },
];

export default function VaultsPage() {
    const [activeTab, setActiveTab] = useState("All Vaults");
    const tabs = ["All Vaults", "Top Performers", "My Vaults"];

    return (
        <div>
            <div className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>Vaults</h1>
                <p className={styles.pageDesc}>Provide liquidity to the protocol or copy the best traders.</p>
            </div>

            {/* LLP Section */}
            <div style={{ marginBottom: "var(--space-8)" }}>
                <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-4)", fontSize: "1.2rem" }}>Protocol Liquidity</h2>
                <div className={styles.grid}>
                    <VaultCard {...LLP_VAULT} />
                    <div className={styles.llpInfoCard} style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-lg)",
                        padding: "var(--space-6)",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center"
                    }}>
                        <h3 style={{ marginBottom: "var(--space-2)", color: "var(--text-primary)" }}>Why LLP?</h3>
                        <ul style={{ listStyle: "disc", paddingLeft: "var(--space-4)", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                            <li>Earn trading fees & funding rates</li>
                            <li>Counterparty to all trades (Market Making)</li>
                            <li>Capture liquidation penalties</li>
                            <li>Community owned liquidity</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div className={styles.tabs}>
                {tabs.map((tab) => (
                    <div
                        key={tab}
                        className={clsx(styles.tab, activeTab === tab && styles.tabActive)}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab}
                    </div>
                ))}
            </div>

            {activeTab === "Top Performers" ? (
                <LeaderboardTable />
            ) : (
                <>
                    <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-4)", fontSize: "1.2rem" }}>Copy Vaults</h2>
                    <div className={styles.grid}>
                        {COPY_VAULTS.map((vault) => (
                            <VaultCard key={vault.id} {...vault} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
