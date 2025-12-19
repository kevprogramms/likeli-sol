"use client";

import { useState } from "react";
import styles from "@/components/markets/markets.module.css";

interface UsernameModalProps {
    isOpen: boolean;
    onSubmit: (username: string) => void;
    onClose: () => void;
    error?: string | null;
}

export default function UsernameModal({ isOpen, onSubmit, onClose, error }: UsernameModalProps) {
    const [username, setUsername] = useState("");

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (username.trim().length >= 3) {
            onSubmit(username);
        }
    };

    return (
        <div className={styles.backdrop}>
            <div className={styles.modalCard} style={{ maxWidth: "480px" }}>
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title}>Choose a username</h2>
                        <p className={styles.subtitle}>This will be your public name on Likeli. One username per person.</p>
                    </div>
                </div>

                <div className={styles.content}>
                    <div style={{ width: "100%" }}>
                        <div className={styles.field}>
                            <label className={styles.label}>Username</label>
                            <input
                                type="text"
                                className={styles.input}
                                placeholder="e.g. satoshi_nakamoto"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                            />
                            {error && (
                                <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                                    {error}
                                </p>
                            )}
                            <p style={{ color: "#6b7280", fontSize: "12px", marginTop: "4px" }}>
                                3-20 characters, letters, numbers, underscores only.
                            </p>
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
                                onClick={handleSubmit}
                                disabled={username.trim().length < 3}
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
