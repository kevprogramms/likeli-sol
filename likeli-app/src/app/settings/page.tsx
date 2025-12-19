import styles from "../portfolio/portfolio.module.css";

export default function SettingsPage() {
    return (
        <div style={{ maxWidth: "800px" }}>
            <h1 className="text-2xl font-bold mb-6">Settings</h1>

            <div className={styles.settingsSection}>
                <h2 className={styles.sectionTitle}>Profile</h2>
                <div className={styles.formGroup}>
                    <label className={styles.label}>Display Name</label>
                    <input type="text" className={styles.input} defaultValue="John Doe" />
                </div>
                <div className={styles.formGroup}>
                    <label className={styles.label}>Email</label>
                    <input type="email" className={styles.input} defaultValue="john@example.com" />
                </div>
            </div>

            <div className={styles.settingsSection}>
                <h2 className={styles.sectionTitle}>Preferences</h2>
                <div className={styles.formGroup}>
                    <label className={styles.label}>Default Currency</label>
                    <select className={styles.input}>
                        <option>USDC</option>
                        <option>ETH</option>
                    </select>
                </div>

            </div>

            <div className={styles.settingsSection}>
                <h2 className={styles.sectionTitle}>About</h2>
                <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                    <strong style={{ fontFamily: "var(--font-serif)", color: "var(--color-primary)" }}>Likeli</strong> is The Next-gen prediction market. Opinions ➜ Positions. Create & graduate markets, run private team markets, build parlays, trade perps with leverage.
                </p>
            </div>
        </div>
    );
}
