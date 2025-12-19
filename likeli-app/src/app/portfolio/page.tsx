"use client";


import { useStore } from "@/lib/store";
import { useAuth } from "@/context/AuthContext";
import styles from "./portfolio.module.css";
import clsx from "clsx";
import AccountOverview from "@/components/portfolio/AccountOverview";
import PositionsAndHistory from "@/components/portfolio/PositionsAndHistory";

export default function PortfolioPage() {
    const { currentUser, markets } = useStore();
    const { isAuthenticated, openWalletModal } = useAuth();

    if (!isAuthenticated) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                <div className={styles.summaryCard} style={{ maxWidth: '400px', width: '100%', padding: '2rem' }}>
                    <h2 className="text-2xl font-bold mb-4">Connect Wallet</h2>
                    <p className="text-[var(--text-secondary)] mb-8">Connect a wallet to see your portfolio and history.</p>
                    <button
                        onClick={openWalletModal}
                        className="w-full px-6 py-3 bg-[var(--color-primary)] text-white font-bold rounded-xl hover:opacity-90 transition-opacity"
                    >
                        Connect Wallet
                    </button>
                </div>
            </div>
        );
    }

    // Calculate summary stats for the top cards (keep existing logic for now)
    const totalEquity = currentUser.balance + currentUser.positions.reduce((acc, pos) => acc + (pos.shares * pos.avgPrice), 0); // Simplified equity
    const openPnl = currentUser.positions.reduce((acc, pos) => {
        const market = markets.find(m => m.id === pos.marketId);
        const outcome = market?.outcomes.find(o => o.name === pos.outcome); // Match by name (YES/NO)
        const currentPrice = outcome?.price || pos.avgPrice;
        const currentValue = pos.shares * currentPrice;
        const costBasis = pos.shares * pos.avgPrice;
        return acc + (currentValue - costBasis);
    }, 0);

    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">Portfolio</h1>

            <div className={styles.summaryStrip}>
                <div className={styles.highlightedSummaryCard}>
                    <div className={styles.summaryLabel}>Total Equity</div>
                    <div className={styles.summaryValue}>${totalEquity.toFixed(2)}</div>
                </div>
                <div className={styles.highlightedSummaryCard}>
                    <div className={styles.summaryLabel}>Available Balance</div>
                    <div className={styles.summaryValue}>${currentUser.balance.toFixed(2)}</div>
                </div>
                <div className={styles.highlightedSummaryCard}>
                    <div className={styles.summaryLabel}>Open PnL</div>
                    <div className={clsx(styles.summaryValue, openPnl >= 0 ? "text-success" : "text-danger")}>
                        {openPnl >= 0 ? "+" : ""}${openPnl.toFixed(2)}
                    </div>
                </div>
            </div>

            <AccountOverview />

            <PositionsAndHistory defaultTab="normal" />
        </div>
    );
}
