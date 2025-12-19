"use client";

import { useState } from "react";
import { Search, Filter } from "lucide-react";
import styles from "./markets.module.css";
import clsx from "clsx";
import Link from "next/link";

const CATEGORIES = ["All", "Crypto", "Macro", "Politics", "Sports", "Culture"];

const MOCK_MARKETS = [
    { id: 1, name: "Bitcoin > $100k by 2025", category: "Crypto", yes: 0.32, no: 0.68, vol: "$12.5M", end: "Dec 31" },
    { id: 2, name: "Fed Rate Cut in Dec", category: "Macro", yes: 0.85, no: 0.15, vol: "$45.2M", end: "Dec 18" },
    { id: 3, name: "GTA VI Release Date", category: "Culture", yes: 0.12, no: 0.88, vol: "$2.1M", end: "Q4 2025" },
    { id: 4, name: "Ethereum ETF Approval", category: "Crypto", yes: 0.95, no: 0.05, vol: "$8.4M", end: "May 23" },
    { id: 5, name: "Super Bowl Winner: Chiefs", category: "Sports", yes: 0.18, no: 0.82, vol: "$5.6M", end: "Feb 11" },
    { id: 6, name: "US Recession in 2024", category: "Macro", yes: 0.45, no: 0.55, vol: "$18.9M", end: "Dec 31" },
];

export default function MarketsTable() {
    const [activeCategory, setActiveCategory] = useState("All");

    return (
        <div className={styles.tableContainer}>
            <div className={styles.controls}>
                <div className={styles.searchBar}>
                    <Search size={16} className={styles.searchIcon} />
                    <input type="text" placeholder="Search markets..." className={styles.searchInput} />
                </div>

                <div className={styles.filters}>
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat}
                            className={clsx(styles.filterPill, activeCategory === cat && styles.filterPillActive)}
                            onClick={() => setActiveCategory(cat)}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Market</th>
                        <th style={{ textAlign: "right" }}>Yes</th>
                        <th style={{ textAlign: "right" }}>No</th>
                        <th style={{ textAlign: "right" }}>Volume</th>
                        <th style={{ textAlign: "right" }}>Ends</th>
                    </tr>
                </thead>
                <tbody>
                    {MOCK_MARKETS.map((market) => (
                        <tr key={market.id} onClick={() => window.location.href = `/market/${market.id}`}>
                            <td>
                                <div className={styles.marketName}>
                                    <div className={styles.marketIcon} />
                                    <span>{market.name}</span>
                                    <span className={styles.categoryTag}>{market.category}</span>
                                </div>
                            </td>
                            <td style={{ textAlign: "right" }}>
                                <span className="text-success">{market.yes.toFixed(2)}¢</span>
                                <div className={styles.outcomeProb}>{(market.yes * 100).toFixed(0)}%</div>
                            </td>
                            <td style={{ textAlign: "right" }}>
                                <span className="text-danger">{market.no.toFixed(2)}¢</span>
                                <div className={styles.outcomeProb}>{(market.no * 100).toFixed(0)}%</div>
                            </td>
                            <td style={{ textAlign: "right" }} className={styles.volumeCell}>{market.vol}</td>
                            <td style={{ textAlign: "right" }} className="text-muted">{market.end}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
