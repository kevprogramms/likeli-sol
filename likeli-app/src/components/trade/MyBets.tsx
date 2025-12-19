"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

interface PositionDisplay {
    outcome: string;
    shares: number;
    avgPrice?: number;
}

interface MyBetsProps {
    marketId: string;
    isManifold?: boolean;
}

export default function MyBets({ marketId, isManifold = false }: MyBetsProps) {
    const [positions, setPositions] = useState<PositionDisplay[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchPositions = async () => {
        try {
            setLoading(true);

            if (isManifold) {
                // Use Manifold positions API
                const res = await fetch(`/api/manifold/positions?contractId=${marketId}&userId=demo-user&t=${Date.now()}`);
                const data = await res.json();
                const newPositions: PositionDisplay[] = [];
                if (data.yesShares > 0.001) {
                    newPositions.push({ outcome: 'yes', shares: data.yesShares });
                }
                if (data.noShares > 0.001) {
                    newPositions.push({ outcome: 'no', shares: data.noShares });
                }
                setPositions(newPositions);
            } else {
                // Use CLOB positions API
                const res = await fetch(`/api/markets/${marketId}/positions?userId=demo-user`);
                const data = await res.json();
                if (data.positions) {
                    setPositions(data.positions.map((p: any) => ({
                        outcome: p.outcome,
                        shares: p.qty,
                        avgPrice: p.avgPrice
                    })));
                }
            }
        } catch (e) {
            console.error("Failed to fetch positions", e);
        } finally {
            setLoading(false);
        }
    };

    // Poll for updates every 3 seconds for liveliness
    useEffect(() => {
        fetchPositions();
        const interval = setInterval(fetchPositions, 3000);
        return () => clearInterval(interval);
    }, [marketId, isManifold]);

    if (loading && positions.length === 0) {
        return <div className="p-4 text-center text-muted text-xs">Loading positions...</div>;
    }

    if (positions.length === 0) {
        return <div className="p-4 text-center text-muted text-sm">No active bets.</div>;
    }

    return (
        <div className="flex-col gap-4 p-4">
            <div className="flex-col gap-2">
                {positions.map((pos, idx) => {
                    if (pos.shares <= 0.0001) return null;

                    return (
                        <div key={idx} className="p-3 bg-secondary rounded-lg border border-border text-sm mb-2">
                            <div className="flex-between mb-1">
                                <span className={clsx("font-bold", pos.outcome === "yes" ? "text-success" : "text-danger")}>
                                    {pos.outcome.toUpperCase()}
                                </span>
                            </div>
                            <div className="flex-between text-xs text-muted">
                                <span>
                                    {pos.shares.toFixed(2)} shares
                                    {pos.avgPrice !== undefined && ` @ ${pos.avgPrice.toFixed(2)}¢`}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
