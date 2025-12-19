import styles from "./vaults.module.css";
import clsx from "clsx";

const LEADERS = [
    { rank: 1, name: "Alpha Centauri", pnl: "+145%", allTime: "+320%", draw: "-12%", tvl: "$2.4M" },
    { rank: 2, name: "Macro King", pnl: "+98%", allTime: "+210%", draw: "-8%", tvl: "$1.1M" },
    { rank: 3, name: "Crypto Whale", pnl: "+85%", allTime: "+180%", draw: "-15%", tvl: "$5.6M" },
    { rank: 4, name: "Safe Haven", pnl: "+45%", allTime: "+90%", draw: "-2%", tvl: "$890k" },
    { rank: 5, name: "Degen Plays", pnl: "+120%", allTime: "-40%", draw: "-60%", tvl: "$120k" },
];

export default function LeaderboardTable() {
    return (
        <div className="bg-panel" style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
            <table className={styles.leaderboard}>
                <thead>
                    <tr>
                        <th style={{ width: "60px", textAlign: "center" }}>Rank</th>
                        <th>Vault / Trader</th>
                        <th style={{ textAlign: "right" }}>30d PnL</th>
                        <th style={{ textAlign: "right" }}>All-Time</th>
                        <th style={{ textAlign: "right" }}>Max Drawdown</th>
                        <th style={{ textAlign: "right" }}>TVL</th>
                    </tr>
                </thead>
                <tbody>
                    {LEADERS.map((leader) => (
                        <tr key={leader.rank}>
                            <td className={clsx(styles.rankCell, leader.rank <= 3 && styles.rankTop)}>
                                {leader.rank}
                            </td>
                            <td style={{ fontWeight: 500 }}>{leader.name}</td>
                            <td style={{ textAlign: "right" }} className="text-success">{leader.pnl}</td>
                            <td style={{ textAlign: "right" }} className={leader.allTime.startsWith("-") ? "text-danger" : "text-success"}>
                                {leader.allTime}
                            </td>
                            <td style={{ textAlign: "right" }} className="text-danger">{leader.draw}</td>
                            <td style={{ textAlign: "right" }}>{leader.tvl}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
