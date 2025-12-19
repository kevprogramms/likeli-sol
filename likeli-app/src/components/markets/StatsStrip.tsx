import styles from "./markets.module.css";
import { BarChart3, Activity, Layers, DollarSign } from "lucide-react";

const STATS = [
    { label: "Total Volume (30d)", value: "$1.2B", icon: BarChart3, change: "+12%" },
    { label: "24h Volume", value: "$45.2M", icon: Activity, change: "+5%" },
    { label: "Open Markets", value: "2,450", icon: Layers, change: "" },
    { label: "TVL", value: "$380M", icon: DollarSign, change: "+8%" },
];

export default function StatsStrip() {
    return (
        <div className={styles.statsStrip}>
            {STATS.map((stat) => {
                const Icon = stat.icon;
                return (
                    <div key={stat.label} className={styles.statCard}>
                        <div className={styles.statLabel}>
                            <Icon size={14} />
                            {stat.label}
                        </div>
                        <div className="flex-between">
                            <div className={styles.statValue}>{stat.value}</div>
                            {stat.change && <div className={styles.statChange}>{stat.change}</div>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
