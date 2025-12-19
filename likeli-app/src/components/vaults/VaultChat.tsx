"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import styles from "./vaults.module.css";

const MOCK_MESSAGES = [
    { id: 1, user: "CryptoKing", text: "Great performance this month!", time: "2h ago" },
    { id: 2, user: "MacroGuru", text: "Are we hedging for the election?", time: "1h ago" },
    { id: 3, user: "VaultManager", text: "Yes, we have increased our cash position.", time: "15m ago", isManager: true },
];

export default function VaultChat() {
    const [input, setInput] = useState("");

    return (
        <div className={styles.chatContainer}>
            <div className={styles.chatHeader}>Vault Chat</div>

            <div className={styles.chatMessages}>
                {MOCK_MESSAGES.map((msg) => (
                    <div key={msg.id} className={styles.message}>
                        <div className={styles.messageHeader}>
                            <span className={msg.isManager ? styles.managerName : styles.userName}>
                                {msg.user}
                                {msg.isManager && <span className={styles.managerBadge}>MANAGER</span>}
                            </span>
                            <span className={styles.messageTime}>{msg.time}</span>
                        </div>
                        <div className={styles.messageText}>{msg.text}</div>
                    </div>
                ))}
            </div>

            <div className={styles.chatInputArea}>
                <input
                    type="text"
                    className={styles.chatInput}
                    placeholder="Ask a question..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                />
                <button className={styles.sendBtn}>
                    <Send size={16} />
                </button>
            </div>
        </div>
    );
}
