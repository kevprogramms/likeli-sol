"use client";


import styles from "./layout.module.css";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Topbar() {
    const { walletAddress, username, disconnect, openWalletModal } = useAuth();

    return (
        <header className={styles.topbar}>
            <div className={styles.networkBadge}>
                <span style={{ fontSize: "8px" }}>●</span> Mainnet Beta
            </div>

            <div className={styles.topbarRight}>
                <div className="flex-center" style={{ gap: "var(--space-2)", fontSize: "var(--font-sm)", color: "var(--text-secondary)", cursor: "pointer" }}>
                    <img src="https://cryptologos.cc/logos/ethereum-eth-logo.png?v=026" alt="ETH" width={16} height={16} />
                    <span>ETH Mainnet</span>
                    <ChevronDown size={14} />
                </div>

                <div className={styles.balance}>
                    2,450.00 USDC
                </div>

                {walletAddress ? (
                    <button className={styles.connectBtn} onClick={disconnect}>
                        {username || walletAddress.substring(0, 6) + "..."}
                    </button>
                ) : (
                    <button className={styles.connectBtn} onClick={openWalletModal}>
                        Connect Wallet
                    </button>
                )}
            </div>
        </header >
    );
}
