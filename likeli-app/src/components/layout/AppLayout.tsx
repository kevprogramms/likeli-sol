"use client";

import Sidebar from "./Sidebar";
import styles from "./layout.module.css";
import ParlaySlip from "@/components/trade/ParlaySlip";
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { connected } = useWallet();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Prevent hydration mismatch
    if (!mounted) {
        return <div className={styles.appContainer}>{children}</div>;
    }

    if (!connected) {
        return (
            <div className={styles.appContainer} style={{ display: 'block' }}>
                {children}
            </div>
        );
    }

    return (
        <div className={styles.appContainer}>
            <Sidebar />
            <main className={styles.mainContent}>
                {/* Top bar removed/cleaned as requested */}
                <div className={styles.contentScroll}>
                    {children}
                </div>
            </main>
            <ParlaySlip />
        </div>
    );
}

