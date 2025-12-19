"use client";

import styles from "@/components/markets/markets.module.css";
import { X } from "lucide-react";

interface WalletSelectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConnectMetamask: () => void;
    onConnectPhantom: () => void;
}

export default function WalletSelectModal({ isOpen, onClose, onConnectMetamask, onConnectPhantom }: WalletSelectModalProps) {
    if (!isOpen) return null;

    return (
        <div className={styles.backdrop}>
            <div className={styles.modalCard} style={{ maxWidth: "480px" }}>
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title}>Connect Wallet</h2>
                        <p className={styles.subtitle}>Choose a wallet to connect to Likeli.</p>
                    </div>
                    <button onClick={onClose} className={styles.close}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.content} style={{ flexDirection: "column", gap: "16px" }}>
                    {/* Metamask Option */}
                    <div
                        onClick={onConnectMetamask}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "16px",
                            padding: "16px",
                            borderRadius: "12px",
                            border: "1px solid #e5e7eb",
                            cursor: "pointer",
                            transition: "background-color 0.2s",
                            backgroundColor: "#fff"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f9fafb"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#fff"}
                    >
                        <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {/* Placeholder for Metamask Icon */}
                            <span style={{ fontSize: "20px" }}>🦊</span>
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, color: "#111827" }}>Metamask</div>
                            <div style={{ fontSize: "12px", color: "#6b7280" }}>EVM wallet</div>
                        </div>
                    </div>

                    {/* Phantom Option */}
                    <div
                        onClick={onConnectPhantom}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "16px",
                            padding: "16px",
                            borderRadius: "12px",
                            border: "1px solid #e5e7eb",
                            cursor: "pointer",
                            transition: "background-color 0.2s",
                            backgroundColor: "#fff"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f9fafb"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#fff"}
                    >
                        <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: "#ab9ff2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {/* Placeholder for Phantom Icon */}
                            <span style={{ fontSize: "20px" }}>👻</span>
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, color: "#111827" }}>Phantom</div>
                            <div style={{ fontSize: "12px", color: "#6b7280" }}>Solana wallet</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
