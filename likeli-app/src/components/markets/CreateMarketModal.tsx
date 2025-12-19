"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { X, Plus, Trash2 } from "lucide-react";
import styles from "./markets.module.css";
import { MINIMUM_ANTE, MAX_ANSWERS } from "@/lib/graduation";

interface CreateMarketModalProps {
    onClose: () => void;
}

export default function CreateMarketModal({ onClose }: CreateMarketModalProps) {
    const { currentUser } = useStore();
    const router = useRouter();
    const { isAuthenticated } = useAuth();

    const [question, setQuestion] = useState("");
    const [category, setCategory] = useState("General");
    const [date, setDate] = useState("");
    const [liquidity, setLiquidity] = useState("100");
    const [rules, setRules] = useState("");

    // Multi-choice support
    const [outcomeType, setOutcomeType] = useState<"BINARY" | "MULTIPLE_CHOICE">("BINARY");
    const [answers, setAnswers] = useState<string[]>(["", ""]);
    // Dependent = probabilities must sum to 100%, Independent = each answer is separate
    const [shouldAnswersSumToOne, setShouldAnswersSumToOne] = useState(true);

    // Oracle configuration
    const [useOracle, setUseOracle] = useState(false);
    const [oracleType, setOracleType] = useState<'crypto_price' | 'sports_game'>('crypto_price');

    // Crypto oracle fields
    const [oracleAsset, setOracleAsset] = useState("bitcoin");
    const [oracleTargetPrice, setOracleTargetPrice] = useState("");
    const [oracleCondition, setOracleCondition] = useState<"gte" | "lte" | "gt" | "lt">("gte");

    // Sports oracle fields
    const [sportsLeague, setSportsLeague] = useState("nba");
    const [teamToWin, setTeamToWin] = useState("");
    const [homeTeam, setHomeTeam] = useState("");
    const [awayTeam, setAwayTeam] = useState("");
    const [gameDate, setGameDate] = useState("");

    const SUPPORTED_ASSETS = [
        { id: "bitcoin", label: "Bitcoin (BTC)" },
        { id: "ethereum", label: "Ethereum (ETH)" },
        { id: "solana", label: "Solana (SOL)" },
        { id: "dogecoin", label: "Dogecoin (DOGE)" },
        { id: "cardano", label: "Cardano (ADA)" },
        { id: "ripple", label: "XRP" },
    ];

    const SUPPORTED_LEAGUES = [
        { id: "nba", label: "🏀 NBA Basketball" },
        { id: "nfl", label: "🏈 NFL Football" },
        { id: "mlb", label: "⚾ MLB Baseball" },
        { id: "nhl", label: "🏒 NHL Hockey" },
        { id: "mls", label: "⚽ MLS Soccer" },
        { id: "epl", label: "⚽ English Premier League" },
    ];

    const addAnswer = () => {
        if (answers.length < MAX_ANSWERS) {
            setAnswers([...answers, ""]);
        }
    };

    const removeAnswer = (index: number) => {
        if (answers.length > 2) {
            setAnswers(answers.filter((_, i) => i !== index));
        }
    };

    const updateAnswer = (index: number, value: string) => {
        const newAnswers = [...answers];
        newAnswers[index] = value;
        setAnswers(newAnswers);
    };

    const handleSubmit = async () => {
        if (!question || !date) {
            alert("Please fill all required fields");
            return;
        }

        const liqNum = parseFloat(liquidity);
        if (liqNum < MINIMUM_ANTE) {
            alert(`Minimum liquidity is $${MINIMUM_ANTE}`);
            return;
        }

        // Validate multi-choice answers
        if (outcomeType === "MULTIPLE_CHOICE") {
            const validAnswers = answers.filter(a => a.trim().length > 0);
            if (validAnswers.length < 2) {
                alert("Please provide at least 2 answers for multi-choice markets");
                return;
            }
        }

        try {
            const body: any = {
                question,
                category,
                closeTime: new Date(date).getTime(),
                ante: liqNum,
                rules,
                outcomeType,
                userId: currentUser?.id || "demo-user"
            };

            if (outcomeType === "MULTIPLE_CHOICE") {
                body.answers = answers.filter(a => a.trim().length > 0);
                body.shouldAnswersSumToOne = shouldAnswersSumToOne;
            }

            // Add oracle resolution source
            if (useOracle) {
                if (oracleType === 'crypto_price' && oracleTargetPrice) {
                    const conditionLabels: Record<string, string> = {
                        gte: "≥",
                        lte: "≤",
                        gt: ">",
                        lt: "<"
                    };
                    body.resolutionSource = {
                        type: "crypto_price",
                        asset: oracleAsset,
                        targetPrice: parseFloat(oracleTargetPrice),
                        condition: oracleCondition,
                        deadline: new Date(date).getTime(),
                        description: `${oracleAsset.toUpperCase()} ${conditionLabels[oracleCondition]} $${parseFloat(oracleTargetPrice).toLocaleString()}`
                    };
                } else if (oracleType === 'sports_game' && teamToWin) {
                    body.resolutionSource = {
                        type: "sports_game",
                        league: sportsLeague,
                        teamToWin: teamToWin.toUpperCase(),
                        homeTeam: homeTeam.toUpperCase() || undefined,
                        awayTeam: awayTeam.toUpperCase() || undefined,
                        gameDate: gameDate || undefined,
                        deadline: new Date(date).getTime(),
                        description: `${teamToWin.toUpperCase()} wins${homeTeam && awayTeam ? ` (${awayTeam.toUpperCase()} @ ${homeTeam.toUpperCase()})` : ''}`
                    };
                }
            }

            const res = await fetch("/api/manifold/markets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            const result = await res.json();

            if (res.ok && result.success) {
                onClose();
                router.push(`/market/${result.market.id}`);
            } else {
                alert(result.error || "Failed to create market");
            }
        } catch (e) {
            console.error(e);
            alert("Error creating market");
        }
    };

    const totalCost = parseFloat(liquidity || "0") + 50;
    const canAfford = currentUser?.balance >= totalCost && isAuthenticated;

    return (
        <div className={styles.backdrop}>
            <div className={styles.modalCard}>
                {/* Header */}
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title}>Create Sandbox Market</h2>
                        <p className={styles.subtitle}>Launch a new market. Reach $500 volume to graduate to main!</p>
                    </div>
                    <button onClick={onClose} className={styles.close}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.content}>
                    {/* Left Column: Form Fields */}
                    <div className={styles.left}>
                        {/* Market Type Toggle */}
                        <div className={styles.field}>
                            <label className={styles.label}>Market Type</label>
                            <div className={styles.typeToggle}>
                                <button
                                    type="button"
                                    className={`${styles.typeBtn} ${outcomeType === "BINARY" ? styles.typeBtnActive : ""}`}
                                    onClick={() => setOutcomeType("BINARY")}
                                >
                                    Yes / No
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.typeBtn} ${outcomeType === "MULTIPLE_CHOICE" ? styles.typeBtnActive : ""}`}
                                    onClick={() => setOutcomeType("MULTIPLE_CHOICE")}
                                >
                                    Multiple Choice
                                </button>
                            </div>
                        </div>

                        {/* Question Input */}
                        <div className={styles.field}>
                            <label className={styles.label}>Market Question</label>
                            <input
                                className={styles.input}
                                placeholder={outcomeType === "BINARY"
                                    ? "e.g. Will Bitcoin hit $100k by 2025?"
                                    : "e.g. Who will win the 2024 election?"
                                }
                                value={question}
                                onChange={e => setQuestion(e.target.value)}
                                autoFocus
                            />
                        </div>

                        {/* Multi-choice Answers */}
                        {outcomeType === "MULTIPLE_CHOICE" && (
                            <div className={styles.field}>
                                <label className={styles.label}>Answers ({answers.length}/{MAX_ANSWERS})</label>
                                <div className={styles.answersContainer}>
                                    {answers.map((answer, index) => (
                                        <div key={index} className={styles.answerRow}>
                                            <input
                                                className={styles.input}
                                                placeholder={`Answer ${index + 1}`}
                                                value={answer}
                                                onChange={e => updateAnswer(index, e.target.value)}
                                            />
                                            {answers.length > 2 && (
                                                <button
                                                    type="button"
                                                    className={styles.removeAnswerBtn}
                                                    onClick={() => removeAnswer(index)}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {answers.length < MAX_ANSWERS && (
                                        <button
                                            type="button"
                                            className={styles.addAnswerBtn}
                                            onClick={addAnswer}
                                        >
                                            <Plus size={14} /> Add Answer
                                        </button>
                                    )}
                                </div>

                                {/* Dependent/Independent Toggle */}
                                <div style={{ marginTop: '12px' }}>
                                    <label className={styles.label}>Probability Mode</label>
                                    <div className={styles.typeToggle}>
                                        <button
                                            type="button"
                                            className={`${styles.typeBtn} ${shouldAnswersSumToOne ? styles.typeBtnActive : ""}`}
                                            onClick={() => setShouldAnswersSumToOne(true)}
                                        >
                                            Dependent (Sum to 100%)
                                        </button>
                                        <button
                                            type="button"
                                            className={`${styles.typeBtn} ${!shouldAnswersSumToOne ? styles.typeBtnActive : ""}`}
                                            onClick={() => setShouldAnswersSumToOne(false)}
                                        >
                                            Independent
                                        </button>
                                    </div>
                                    <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>
                                        {shouldAnswersSumToOne
                                            ? "Probabilities will always sum to 100%. Buying YES on one answer automatically lowers others."
                                            : "Each answer has its own independent probability. Good for non-exclusive outcomes."
                                        }
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Category */}
                            <div className={styles.field}>
                                <label className={styles.label}>Category</label>
                                <select
                                    className={styles.select}
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                >
                                    <option>General</option>
                                    <option>Crypto</option>
                                    <option>Politics</option>
                                    <option>Sports</option>
                                    <option>Tech</option>
                                    <option>Culture</option>
                                </select>
                            </div>

                            {/* Date */}
                            <div className={styles.field}>
                                <label className={styles.label}>Resolution Date</label>
                                <input
                                    type="date"
                                    className={styles.input}
                                    value={date}
                                    onChange={e => setDate(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Rules */}
                        <div className={styles.field}>
                            <label className={styles.label}>Resolution Rules (optional)</label>
                            <textarea
                                className={`${styles.input} min-h-[80px]`}
                                placeholder="Define exact resolution conditions..."
                                value={rules}
                                onChange={e => setRules(e.target.value)}
                            />
                        </div>

                        {/* Oracle Configuration - Only for Binary markets */}
                        {outcomeType === "BINARY" && (
                            <div className={styles.field}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <input
                                        type="checkbox"
                                        id="useOracle"
                                        checked={useOracle}
                                        onChange={e => setUseOracle(e.target.checked)}
                                        style={{ width: '16px', height: '16px' }}
                                    />
                                    <label htmlFor="useOracle" className={styles.label} style={{ marginBottom: 0 }}>
                                        🤖 Enable AI Oracle (Auto-Resolution)
                                    </label>
                                </div>

                                {useOracle && (
                                    <div style={{
                                        padding: '12px',
                                        backgroundColor: 'var(--bg-input)',
                                        borderRadius: '8px',
                                        marginTop: '8px'
                                    }}>
                                        {/* Oracle Type Toggle */}
                                        <div style={{ marginBottom: '12px' }}>
                                            <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                                                Oracle Type
                                            </label>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setOracleType('crypto_price')}
                                                    style={{
                                                        flex: 1,
                                                        padding: '8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid',
                                                        borderColor: oracleType === 'crypto_price' ? '#3b82f6' : 'var(--border-subtle)',
                                                        backgroundColor: oracleType === 'crypto_price' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                                        color: oracleType === 'crypto_price' ? '#3b82f6' : 'var(--text-secondary)',
                                                        fontSize: '12px',
                                                        fontWeight: 500,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    📈 Crypto Price
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setOracleType('sports_game')}
                                                    style={{
                                                        flex: 1,
                                                        padding: '8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid',
                                                        borderColor: oracleType === 'sports_game' ? '#22c55e' : 'var(--border-subtle)',
                                                        backgroundColor: oracleType === 'sports_game' ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                                                        color: oracleType === 'sports_game' ? '#22c55e' : 'var(--text-secondary)',
                                                        fontSize: '12px',
                                                        fontWeight: 500,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    🏆 Sports Game
                                                </button>
                                            </div>
                                        </div>

                                        {/* Crypto Price Fields */}
                                        {oracleType === 'crypto_price' && (
                                            <>
                                                <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '12px' }}>
                                                    Resolves based on crypto price from CoinGecko.
                                                </p>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                                    <div>
                                                        <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                                                            Asset
                                                        </label>
                                                        <select
                                                            className={styles.select}
                                                            value={oracleAsset}
                                                            onChange={e => setOracleAsset(e.target.value)}
                                                        >
                                                            {SUPPORTED_ASSETS.map(a => (
                                                                <option key={a.id} value={a.id}>{a.label}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                                                            Condition
                                                        </label>
                                                        <select
                                                            className={styles.select}
                                                            value={oracleCondition}
                                                            onChange={e => setOracleCondition(e.target.value as any)}
                                                        >
                                                            <option value="gte">≥ Greater or Equal</option>
                                                            <option value="gt">&gt; Greater Than</option>
                                                            <option value="lte">≤ Less or Equal</option>
                                                            <option value="lt">&lt; Less Than</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                                                        Target Price (USD)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        className={styles.input}
                                                        placeholder="e.g. 100000"
                                                        value={oracleTargetPrice}
                                                        onChange={e => setOracleTargetPrice(e.target.value)}
                                                    />
                                                </div>
                                                {oracleTargetPrice && (
                                                    <div style={{
                                                        marginTop: '8px',
                                                        padding: '8px',
                                                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                                        borderRadius: '4px',
                                                        fontSize: '12px',
                                                        color: '#3b82f6'
                                                    }}>
                                                        Resolves YES if {oracleAsset.toUpperCase()} {oracleCondition === 'gte' ? '≥' : oracleCondition === 'lte' ? '≤' : oracleCondition === 'gt' ? '>' : '<'} ${parseFloat(oracleTargetPrice).toLocaleString()}
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Sports Game Fields */}
                                        {oracleType === 'sports_game' && (
                                            <>
                                                <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '12px' }}>
                                                    Resolves based on game result from ESPN.
                                                </p>
                                                <div style={{ marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                                                        League
                                                    </label>
                                                    <select
                                                        className={styles.select}
                                                        value={sportsLeague}
                                                        onChange={e => setSportsLeague(e.target.value)}
                                                    >
                                                        {SUPPORTED_LEAGUES.map(l => (
                                                            <option key={l.id} value={l.id}>{l.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                                    <div>
                                                        <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                                                            Home Team (abbrev)
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className={styles.input}
                                                            placeholder="e.g. LAL"
                                                            value={homeTeam}
                                                            onChange={e => setHomeTeam(e.target.value.toUpperCase())}
                                                            maxLength={4}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                                                            Away Team (abbrev)
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className={styles.input}
                                                            placeholder="e.g. GSW"
                                                            value={awayTeam}
                                                            onChange={e => setAwayTeam(e.target.value.toUpperCase())}
                                                            maxLength={4}
                                                        />
                                                    </div>
                                                </div>
                                                <div style={{ marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                                                        Team to Win (for YES)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        className={styles.input}
                                                        placeholder="e.g. LAL"
                                                        value={teamToWin}
                                                        onChange={e => setTeamToWin(e.target.value.toUpperCase())}
                                                        maxLength={4}
                                                    />
                                                </div>
                                                <div style={{ marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                                                        Game Date (optional)
                                                    </label>
                                                    <input
                                                        type="date"
                                                        className={styles.input}
                                                        value={gameDate}
                                                        onChange={e => setGameDate(e.target.value)}
                                                    />
                                                </div>
                                                {teamToWin && (
                                                    <div style={{
                                                        marginTop: '8px',
                                                        padding: '8px',
                                                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                                        borderRadius: '4px',
                                                        fontSize: '12px',
                                                        color: '#22c55e'
                                                    }}>
                                                        Resolves YES if {teamToWin} wins{homeTeam && awayTeam ? ` (${awayTeam} @ ${homeTeam})` : ''}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Liquidity Section */}
                        <div className={styles.field}>
                            <div className="flex justify-between">
                                <label className={styles.label}>Initial Liquidity</label>
                                <span className="text-xs text-gray-400">Min: ${MINIMUM_ANTE}</span>
                            </div>
                            <input
                                type="number"
                                className={styles.input}
                                value={liquidity}
                                onChange={e => setLiquidity(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Right Column: Summary & Actions */}
                    <div className={styles.right}>
                        <div className={styles.summaryBox}>
                            <div className={styles.summaryContent}>
                                <h3 className={styles.label} style={{ marginBottom: "16px" }}>Cost Summary</h3>

                                <div className={styles.summaryRow}>
                                    <span>Market Type</span>
                                    <span className="font-mono">{outcomeType === "BINARY" ? "Yes/No" : `${answers.filter(a => a.trim()).length} Choices`}</span>
                                </div>
                                <div className={styles.summaryRow}>
                                    <span>Liquidity Deposit</span>
                                    <span className="font-mono">${parseFloat(liquidity || "0").toFixed(2)}</span>
                                </div>
                                <div className={styles.summaryRow}>
                                    <span>Creation Fee</span>
                                    <span className="font-mono">$50.00</span>
                                </div>

                                <div className={styles.summaryTotal}>
                                    <span>Total Cost</span>
                                    <span style={{ color: canAfford ? "inherit" : "#ef4444" }}>
                                        ${totalCost.toFixed(2)}
                                    </span>
                                </div>

                                <div className={styles.graduationNote}>
                                    💡 Reach $500 volume to graduate to main markets!
                                </div>
                            </div>

                            <div className={styles.actions}>
                                <button
                                    className={`${styles.btn} ${styles.btnOutline}`}
                                    onClick={onClose}
                                >
                                    Cancel
                                </button>
                                <button
                                    className={`${styles.btn} ${styles.btnPrimary}`}
                                    disabled={!canAfford || !question || !date}
                                    onClick={handleSubmit}
                                >
                                    {!isAuthenticated ? "Connect Wallet" : canAfford ? "Create Market" : "Insufficient Balance"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
