import styles from "./vaults.module.css";
import clsx from "clsx";

interface VaultProps {
    name: string;
    manager?: string; // For backward compatibility or specific display
    leader?: string; // New prop for Copy Vaults
    strategy?: string;
    return30d: string;
    tvl: string;
    risk: "Low" | "Medium" | "High";
    isLikeli?: boolean; // LLP Vault
    performanceFee?: string;
    maxDrawdown?: string;
    age?: string;
    volume?: string; // For LLP
}

export default function VaultCard({
    name,
    manager,
    leader,
    strategy,
    return30d,
    tvl,
    risk,
    isLikeli,
    performanceFee,
    maxDrawdown,
    age,
    volume
}: VaultProps) {
    return (
        <div className={clsx(styles.vaultCard, isLikeli && styles.likeliVaultCard)}>
            <div className={styles.vaultHeader}>
                <div className="flex-col">
                    <div className={styles.vaultTitle}>{name}</div>
                    <div className={styles.vaultManager}>
                        {isLikeli ? "Protocol Vault" : (leader || manager)}
                    </div>
                </div>
                <div className={clsx(styles.riskTag,
                    risk === "Low" ? styles.riskLow :
                        risk === "Medium" ? styles.riskMed :
                            styles.riskHigh
                )}>
                    {risk} Risk
                </div>
            </div>

            {strategy && <div className={styles.strategyDesc}>{strategy}</div>}

            <div className={styles.vaultStats}>
                <div className={styles.statItem}>
                    <span className={styles.statLabel}>30d Return</span>
                    <span className={clsx(styles.statValue, "text-success")}>{return30d}</span>
                </div>
                <div className={styles.statItem}>
                    <span className={styles.statLabel}>TVL</span>
                    <span className={styles.statValue}>{tvl}</span>
                </div>
                {isLikeli ? (
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>24h Volume</span>
                        <span className={styles.statValue}>{volume || "-"}</span>
                    </div>
                ) : (
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>Max Drawdown</span>
                        <span className={styles.statValue} style={{ color: 'var(--color-danger)' }}>{maxDrawdown || "-"}</span>
                    </div>
                )}
            </div>

            {!isLikeli && (
                <div className={styles.vaultStats} style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-subtle)' }}>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>Perf. Fee</span>
                        <span className={styles.statValue}>{performanceFee || "0%"}</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>Age</span>
                        <span className={styles.statValue}>{age || "-"}</span>
                    </div>
                </div>
            )}

            <div className={styles.vaultActions}>
                <button className={styles.depositBtn}>
                    {isLikeli ? "Provide Liquidity" : "Copy Trade"}
                </button>
            </div>
        </div>
    );
}
