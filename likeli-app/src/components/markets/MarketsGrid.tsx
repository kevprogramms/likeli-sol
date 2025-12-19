"use client";

import styles from "./markets.module.css";
import MarketCard from "./MarketCard";

interface ExtendedMarket {
    id: string;
    question: string;
    category?: string;
    outcomes: Array<{ id: string; name: string; price: number }>;
    volume?: number;
    resolutionDate?: string;
    image?: string;
    phase?: string;
    graduationStartTime?: number;
    outcomeType?: string;
}

interface MarketsGridProps {
    markets: ExtendedMarket[];
    showGraduationProgress?: boolean;
}

export default function MarketsGrid({ markets, showGraduationProgress = false }: MarketsGridProps) {
    return (
        <div className={styles.grid}>
            {markets.length === 0 ? (
                <div className="col-span-full text-center text-muted py-10">
                    No markets found.
                </div>
            ) : (
                markets.map((market) => {
                    // For multi-choice, show first answer prob as "yes"
                    const isMultiChoice = market.outcomeType === 'MULTIPLE_CHOICE';
                    const yesPrice = isMultiChoice
                        ? (market.outcomes[0]?.price || 0.5)
                        : (market.outcomes.find(o => o.id === "yes")?.price || 0.5);
                    const noPrice = isMultiChoice
                        ? (market.outcomes[1]?.price || 0.5)
                        : (market.outcomes.find(o => o.id === "no")?.price || 0.5);

                    return (
                        <MarketCard
                            key={market.id}
                            id={market.id}
                            name={market.question}
                            category={market.category || "General"}
                            yes={yesPrice}
                            no={noPrice}
                            vol={`$${((market.volume || 0) / 1000).toFixed(1)}k`}
                            end={market.resolutionDate}
                            image={market.image}
                            phase={showGraduationProgress ? market.phase : undefined}
                            volume={showGraduationProgress ? market.volume : undefined}
                            graduationStartTime={showGraduationProgress ? market.graduationStartTime : undefined}
                            isMultiChoice={isMultiChoice}
                            answerCount={isMultiChoice ? market.outcomes.length : undefined}
                        />
                    );
                })
            )}
        </div>
    );
}
