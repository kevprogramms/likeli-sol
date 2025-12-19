"use client";

import { useState } from "react";
import styles from "./trade.module.css";
import clsx from "clsx";

const ORDER_BOOK_BIDS = [
    { price: 0.32, size: 15000, total: 15000 },
    { price: 0.31, size: 25000, total: 40000 },
    { price: 0.30, size: 50000, total: 90000 },
    { price: 0.29, size: 12000, total: 102000 },
    { price: 0.28, size: 8000, total: 110000 },
];

const ORDER_BOOK_ASKS = [
    { price: 0.33, size: 10000, total: 10000 },
    { price: 0.34, size: 22000, total: 32000 },
    { price: 0.35, size: 45000, total: 77000 },
    { price: 0.36, size: 18000, total: 95000 },
    { price: 0.37, size: 5000, total: 100000 },
];

const TRADES = [
    { time: "12:45:32", side: "buy", price: 0.32, size: 500 },
    { time: "12:45:15", side: "sell", price: 0.32, size: 1200 },
    { time: "12:44:58", side: "buy", price: 0.32, size: 2500 },
    { time: "12:44:22", side: "buy", price: 0.31, size: 100 },
    { time: "12:43:10", side: "sell", price: 0.32, size: 5000 },
];

interface MarketTabsProps {
    mode?: "simple" | "advanced";
}

export default function MarketTabs({ mode }: MarketTabsProps) {
    const [activeTab, setActiveTab] = useState<"book" | "trades">("book");

    return (
        <div className={styles.orderBook}>
            <div className={styles.panelTabs} style={{ margin: 0, borderBottom: "1px solid var(--border-subtle)" }}>
                <div
                    className={clsx(styles.panelTab, activeTab === "book" && styles.panelTabActive)}
                    onClick={() => setActiveTab("book")}
                    style={{ padding: "var(--space-3)" }}
                >
                    Order Book
                </div>
                <div
                    className={clsx(styles.panelTab, activeTab === "trades" && styles.panelTabActive)}
                    onClick={() => setActiveTab("trades")}
                    style={{ padding: "var(--space-3)" }}
                >
                    Recent Trades
                </div>
            </div>

            {activeTab === "book" ? (
                <div className="flex-col" style={{ flex: 1, overflowY: "auto" }}>
                    <div className={styles.obHeader}>
                        <span className={styles.obPrice}>Price</span>
                        <span className={styles.obSize}>Size</span>
                        <span className={styles.obTotal}>Total</span>
                    </div>
                    <div className="flex-col" style={{ paddingBottom: "var(--space-2)" }}>
                        {ORDER_BOOK_ASKS.slice().reverse().map((row, i) => (
                            <div key={i} className={styles.obRow}>
                                <span className={clsx(styles.obPrice, styles.textRed)}>{row.price.toFixed(2)}</span>
                                <span className={styles.obSize}>{row.size.toLocaleString()}</span>
                                <span className={styles.obTotal}>{row.total.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                    <div style={{ padding: "var(--space-2) var(--space-4)", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", textAlign: "center", fontWeight: 600, color: "var(--color-success)" }}>
                        0.32¢
                    </div>
                    <div className="flex-col" style={{ paddingTop: "var(--space-2)" }}>
                        {ORDER_BOOK_BIDS.map((row, i) => (
                            <div key={i} className={styles.obRow}>
                                <span className={clsx(styles.obPrice, styles.textGreen)}>{row.price.toFixed(2)}</span>
                                <span className={styles.obSize}>{row.size.toLocaleString()}</span>
                                <span className={styles.obTotal}>{row.total.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex-col" style={{ flex: 1, overflowY: "auto" }}>
                    <div className={styles.obHeader}>
                        <span style={{ flex: 1 }}>Time</span>
                        <span style={{ flex: 1 }}>Side</span>
                        <span style={{ flex: 1, textAlign: "right" }}>Price</span>
                        <span style={{ flex: 1, textAlign: "right" }}>Size</span>
                    </div>
                    {TRADES.map((trade, i) => (
                        <div key={i} className={styles.obRow} style={{ padding: "var(--space-2) var(--space-4)" }}>
                            <span style={{ flex: 1, color: "var(--text-muted)" }}>{trade.time}</span>
                            <span style={{ flex: 1, color: trade.side === "buy" ? "var(--color-success)" : "var(--color-danger)" }}>
                                {trade.side.toUpperCase()}
                            </span>
                            <span style={{ flex: 1, textAlign: "right" }}>{trade.price.toFixed(2)}</span>
                            <span style={{ flex: 1, textAlign: "right" }}>{trade.size.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
