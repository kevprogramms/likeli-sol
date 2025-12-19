"use client";

import styles from "./trade.module.css";
import clsx from "clsx";
import MarketSimpleChart from "@/components/market/MarketSimpleChart";
import { PricePoint } from "@/lib/orderbook";

interface ChartContainerProps {
    mode: "simple" | "advanced";
    setMode: (mode: "simple" | "advanced") => void;
    priceHistory?: PricePoint[]; // Accept directly
    market?: any; // Legacy
}

export default function ChartContainer({ mode, setMode, priceHistory }: ChartContainerProps) {
    return (
        <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
                <div style={{ fontWeight: 500 }}>
                    Price History
                </div>
            </div>

            <div className={styles.chartArea}>
                <MarketSimpleChart
                    priceHistory={priceHistory || []}
                    mode={mode}
                />
            </div>
        </div>
    );
}
