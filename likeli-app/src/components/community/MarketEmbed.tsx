"use client";

import Link from "next/link";
import styles from "./community.module.css";

interface MarketEmbedProps {
    market: {
        id: string;
        question: string;
        probability: number;
        volume?: number;
    };
    position?: {
        outcome: "YES" | "NO";
        probability: number;
        priceChange?: number;
    };
}

export default function MarketEmbed({ market, position }: MarketEmbedProps) {
    const prob = Math.round(market.probability * 100);
    const yesProb = prob;
    const noProb = 100 - prob;

    return (
        <div className={styles.marketEmbed}>
            <Link
                href={`/market/${market.id}`}
                className={styles.marketQuestion}
            >
                {market.question}
            </Link>

            <div className={styles.marketOdds}>
                {position ? (
                    <>
                        <span className={position.outcome === "YES" ? styles.oddsYes : styles.oddsNo}>
                            {position.outcome} · {Math.round(position.probability * 100)}% chance
                        </span>
                        {position.priceChange !== undefined && (
                            <span className={position.priceChange >= 0 ? styles.priceUp : styles.priceDown}>
                                {position.priceChange >= 0 ? "↑" : "↓"} Now {prob}% chance
                            </span>
                        )}
                    </>
                ) : (
                    <span className={styles.oddsNeutral}>
                        Yes {yesProb}% · No {noProb}%
                    </span>
                )}
            </div>

            <Link
                href={`/market/${market.id}`}
                className={styles.buyButton}
            >
                Buy
            </Link>
        </div>
    );
}
