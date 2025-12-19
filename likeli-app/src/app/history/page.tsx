"use client";


import { useStore } from "@/lib/store";
import { useAuth } from "@/context/AuthContext";
import styles from "../portfolio/portfolio.module.css";
import clsx from "clsx";
import PositionsAndHistory from "@/components/portfolio/PositionsAndHistory";

export default function HistoryPage() {
    const { isAuthenticated, openWalletModal } = useAuth();

    if (!isAuthenticated) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                <div className={styles.summaryCard} style={{ maxWidth: '400px', width: '100%', padding: '2rem' }}>
                    <h2 className="text-2xl font-bold mb-4">Connect Wallet</h2>
                    <p className="text-[var(--text-secondary)] mb-8">Connect a wallet to see your history.</p>
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

    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">History</h1>
            <PositionsAndHistory defaultTab="history" />
        </div>
    );
}
