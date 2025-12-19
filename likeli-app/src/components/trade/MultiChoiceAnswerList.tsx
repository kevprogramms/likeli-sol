"use client";

import { useState, useEffect } from "react";
import styles from "./trade.module.css";
import { useStore } from "@/lib/store";
import { useAuth } from "@/context/AuthContext";

interface AnswerData {
    id: string;
    text: string;
    poolYes: number;
    poolNo: number;
    prob: number;
    volume: number;
    index: number;
}

interface OrderBookLevel {
    price: number;
    size: number;
}

interface AnswerOrderBookData {
    yesBids: OrderBookLevel[];
    yesAsks: OrderBookLevel[];
    noBids: OrderBookLevel[];
    noAsks: OrderBookLevel[];
}

interface MultiChoiceAnswerListProps {
    marketId: string;
    answers: AnswerData[];
    onTrade?: () => void;
    phase?: string;  // 'sandbox' | 'graduating' | 'main'
}

export default function MultiChoiceAnswerList({
    marketId,
    answers,
    onTrade,
    phase
}: MultiChoiceAnswerListProps) {
    const isMainMarket = phase === 'main';
    const isGraduating = phase === 'graduating';
    const tradingDisabled = isGraduating;
    const [expandedAnswer, setExpandedAnswer] = useState<string | null>(null);
    const [selectedOutcome, setSelectedOutcome] = useState<'YES' | 'NO'>('YES');
    const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
    const [loading, setLoading] = useState<string | null>(null);
    const [amount, setAmount] = useState("10");
    const [isLimit, setIsLimit] = useState(false);
    const [limitPrice, setLimitPrice] = useState("");
    const [answerOrderbook, setAnswerOrderbook] = useState<Record<string, AnswerOrderBookData>>({});
    const [userPositions, setUserPositions] = useState<Record<string, { yesShares: number; noShares: number }>>({});
    const { currentUser } = useStore();
    const { isAuthenticated } = useAuth();

    // Fetch user positions for this market
    useEffect(() => {
        if (!isAuthenticated || !currentUser?.id) return;

        const fetchPositions = async () => {
            try {
                const res = await fetch(`/api/manifold/positions?contractId=${marketId}&userId=${currentUser.id}`);
                if (res.ok) {
                    const data = await res.json();
                    // Build positions map per answer
                    const posMap: Record<string, { yesShares: number; noShares: number }> = {};
                    if (data.answerPositions) {
                        data.answerPositions.forEach((pos: any) => {
                            posMap[pos.answerId] = { yesShares: pos.yesShares || 0, noShares: pos.noShares || 0 };
                        });
                    }
                    setUserPositions(posMap);
                }
            } catch (e) {
                console.error('Failed to fetch positions:', e);
            }
        };

        fetchPositions();
    }, [marketId, currentUser?.id, isAuthenticated]);

    // Fetch orderbook for the expanded answer
    useEffect(() => {
        if (!expandedAnswer || !isMainMarket) return;

        const fetchAnswerOrderbook = async () => {
            try {
                const res = await fetch(`/api/manifold/limit-order?contractId=${marketId}&answerId=${expandedAnswer}`);
                if (res.ok) {
                    const data = await res.json();
                    const ob = data.orderbook || {};
                    setAnswerOrderbook(prev => ({
                        ...prev,
                        [expandedAnswer]: {
                            yesBids: ob?.yes?.bids || [],
                            yesAsks: ob?.yes?.asks || [],
                            noBids: ob?.no?.bids || [],
                            noAsks: ob?.no?.asks || []
                        }
                    }));
                }
            } catch (e) {
                console.error('Failed to fetch answer orderbook:', e);
            }
        };

        fetchAnswerOrderbook();
    }, [expandedAnswer, marketId, isMainMarket]);

    const handleTrade = async (answerId: string, outcome: 'YES' | 'NO') => {
        if (!isAuthenticated) {
            alert("Please connect your wallet first");
            return;
        }

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            alert("Enter a valid amount");
            return;
        }

        if ((currentUser?.balance || 0) < amountNum) {
            alert("Insufficient balance");
            return;
        }

        // Limit order validation
        if (isLimit) {
            const priceNum = parseFloat(limitPrice);
            if (isNaN(priceNum) || priceNum <= 0 || priceNum >= 1) {
                alert("Enter a valid limit price (0.01 - 0.99)");
                return;
            }
        }

        setLoading(answerId);

        try {
            let endpoint = '/api/manifold/bet';
            let payload: any = {
                contractId: marketId,
                answerId,
                amount: amountNum,
                outcome,
                userId: currentUser?.id || "demo-user"
            };

            // Use limit order endpoint if limit is enabled
            if (isLimit) {
                endpoint = '/api/manifold/limit-order';
                payload = {
                    contractId: marketId,
                    answerId,
                    amount: amountNum,
                    outcome,
                    limitProb: parseFloat(limitPrice),
                    userId: currentUser?.id || "demo-user"
                };
            }

            console.log('[MultiChoice Trade Request]', { endpoint, payload });

            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            console.log('[Trade Response]', data);
            if (data.allAnswerProbs) {
                console.log('[All Answer Probs after trade]:', data.allAnswerProbs);
            }

            if (res.ok && (data.success !== false)) {
                onTrade?.();
                setExpandedAnswer(null);
                setIsLimit(false);
                setLimitPrice("");
            } else {
                alert(data.error || "Trade failed");
            }
        } catch (e) {
            console.error(e);
            alert("Trade error");
        } finally {
            setLoading(null);
        }
    };

    // Handle selling shares for multi-choice
    const handleSell = async (answerId: string, outcome: 'YES' | 'NO') => {
        if (!isAuthenticated) {
            alert("Please connect your wallet first");
            return;
        }

        const sharesNum = parseFloat(amount);
        if (isNaN(sharesNum) || sharesNum <= 0) {
            alert("Enter a valid number of shares to sell");
            return;
        }

        // Check if user has enough shares
        const position = userPositions[answerId];
        const maxShares = outcome === 'YES' ? (position?.yesShares || 0) : (position?.noShares || 0);
        if (sharesNum > maxShares) {
            alert(`You only have ${maxShares.toFixed(2)} ${outcome} shares`);
            return;
        }

        // Validate limit price if limit sell
        if (isLimit) {
            const priceNum = parseFloat(limitPrice);
            if (isNaN(priceNum) || priceNum <= 0 || priceNum >= 1) {
                alert("Enter a valid limit price (0.01 - 0.99)");
                return;
            }
        }

        setLoading(answerId);

        try {
            let endpoint = '/api/manifold/sell';
            let payload: any = {
                contractId: marketId,
                answerId,
                shares: sharesNum,
                outcome,
                userId: currentUser?.id || "demo-user"
            };

            // Use limit order endpoint for limit sells
            if (isLimit) {
                endpoint = '/api/manifold/limit-order';
                // For limit sell, we place a limit order in the opposite direction
                // Selling YES shares = placing an ask on YES (offering to sell at limit price)
                payload = {
                    contractId: marketId,
                    answerId,
                    amount: sharesNum * parseFloat(limitPrice), // Value of shares at limit price
                    outcome,
                    limitProb: parseFloat(limitPrice),
                    isSell: true,
                    userId: currentUser?.id || "demo-user"
                };
            }

            console.log('[MultiChoice Sell Request]', { endpoint, payload });

            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            console.log('[Sell Response]', data);

            if (res.ok && (data.success !== false)) {
                onTrade?.();
                setExpandedAnswer(null);
                setIsLimit(false);
                setLimitPrice("");
                // Only update positions for market sell, not limit sell (limit stays pending)
                if (!isLimit) {
                    setUserPositions(prev => ({
                        ...prev,
                        [answerId]: {
                            yesShares: outcome === 'YES'
                                ? (prev[answerId]?.yesShares || 0) - sharesNum
                                : (prev[answerId]?.yesShares || 0),
                            noShares: outcome === 'NO'
                                ? (prev[answerId]?.noShares || 0) - sharesNum
                                : (prev[answerId]?.noShares || 0)
                        }
                    }));
                }
            } else {
                alert(data.error || "Sell failed");
            }
        } catch (e) {
            console.error(e);
            alert("Sell error");
        } finally {
            setLoading(null);
        }
    };

    // Sort answers by probability (highest first)
    const sortedAnswers = [...answers].sort((a, b) => b.prob - a.prob);

    return (
        <div className={styles.multiChoiceContainer}>
            <div className={styles.multiChoiceHeader}>
                <span>Answer</span>
                <span>Chance</span>
                <span>Trade</span>
            </div>

            {isGraduating && (
                <div style={{
                    padding: '12px',
                    marginBottom: '12px',
                    borderRadius: '8px',
                    background: 'var(--color-warning-light, #fef3c7)',
                    color: 'var(--color-warning, #d97706)',
                    fontSize: '12px',
                    textAlign: 'center'
                }}>
                    🎓 This market is graduating. Trading is paused until it reaches Main.
                </div>
            )}

            <div className={styles.answerList}>
                {sortedAnswers.map((answer) => {
                    const prob = Math.round(answer.prob * 100);
                    const isExpanded = expandedAnswer === answer.id;
                    const isLoading = loading === answer.id;

                    return (
                        <div key={answer.id} className={styles.answerItem}>
                            <div className={styles.answerMain}>
                                {/* Probability bar background */}
                                <div
                                    className={styles.answerProbBar}
                                    style={{ width: `${prob}%` }}
                                />

                                {/* Rank & Text */}
                                <div className={styles.answerInfo}>
                                    <span className={styles.answerRank}>{prob}%</span>
                                    <span className={styles.answerText}>{answer.text}</span>
                                </div>

                                {/* Trade Buttons - Both YES and NO */}
                                <div className={styles.answerActions}>
                                    <button
                                        className={`${styles.answerBtn} ${styles.answerBtnYes}`}
                                        onClick={() => {
                                            setExpandedAnswer(isExpanded && selectedOutcome === 'YES' ? null : answer.id);
                                            setSelectedOutcome('YES');
                                        }}
                                        disabled={isLoading || tradingDisabled}
                                    >
                                        Yes
                                    </button>
                                    <button
                                        className={`${styles.answerBtn} ${styles.answerBtnNo}`}
                                        onClick={() => {
                                            setExpandedAnswer(isExpanded && selectedOutcome === 'NO' ? null : answer.id);
                                            setSelectedOutcome('NO');
                                        }}
                                        disabled={isLoading || tradingDisabled}
                                    >
                                        No
                                    </button>
                                </div>
                            </div>

                            {/* Expanded Trade Panel */}
                            {isExpanded && (
                                <div className={styles.answerTradePanel}>
                                    {/* Buy/Sell Tabs */}
                                    <div style={{ display: 'flex', gap: '0', marginBottom: '12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                                        <button
                                            onClick={() => setTradeMode('buy')}
                                            style={{
                                                flex: 1,
                                                padding: '8px 12px',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                border: 'none',
                                                cursor: 'pointer',
                                                background: tradeMode === 'buy' ? 'var(--color-success)' : 'var(--bg-input)',
                                                color: tradeMode === 'buy' ? 'white' : 'var(--text-muted)'
                                            }}
                                        >
                                            Buy
                                        </button>
                                        <button
                                            onClick={() => setTradeMode('sell')}
                                            style={{
                                                flex: 1,
                                                padding: '8px 12px',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                border: 'none',
                                                cursor: 'pointer',
                                                background: tradeMode === 'sell' ? 'var(--color-danger)' : 'var(--bg-input)',
                                                color: tradeMode === 'sell' ? 'white' : 'var(--text-muted)'
                                            }}
                                        >
                                            Sell
                                        </button>
                                    </div>

                                    {/* User's position display */}
                                    {tradeMode === 'sell' && (
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', padding: '8px', background: 'var(--bg-input)', borderRadius: '6px' }}>
                                            <div>Your YES shares: <strong>{(userPositions[answer.id]?.yesShares || 0).toFixed(2)}</strong></div>
                                            <div>Your NO shares: <strong>{(userPositions[answer.id]?.noShares || 0).toFixed(2)}</strong></div>
                                        </div>
                                    )}

                                    <div className={styles.answerTradeRow}>
                                        <span style={{
                                            color: selectedOutcome === 'YES' ? 'var(--color-success)' : 'var(--color-danger)',
                                            fontWeight: 600,
                                            fontSize: '14px'
                                        }}>
                                            {tradeMode === 'buy' ? 'Buy' : 'Sell'} {selectedOutcome} on "{answer.text}"
                                        </span>
                                    </div>
                                    <div className={styles.answerTradeRow}>
                                        <label>{tradeMode === 'buy' ? 'Amount ($)' : 'Shares'}</label>
                                        <input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            className={styles.answerInput}
                                            min="1"
                                            max={tradeMode === 'sell' ? (selectedOutcome === 'YES' ? userPositions[answer.id]?.yesShares : userPositions[answer.id]?.noShares) : undefined}
                                        />
                                    </div>

                                    {/* Limit Order Toggle - Only for Main markets */}
                                    {isMainMarket && (
                                        <div className={styles.answerTradeRow} style={{ alignItems: 'center', gap: '8px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isLimit}
                                                    onChange={(e) => setIsLimit(e.target.checked)}
                                                    style={{ width: '14px', height: '14px' }}
                                                />
                                                Limit Order
                                            </label>
                                            {isLimit && (
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0.01"
                                                    max="0.99"
                                                    placeholder="0.50"
                                                    value={limitPrice}
                                                    onChange={(e) => setLimitPrice(e.target.value)}
                                                    className={styles.answerInput}
                                                    style={{ width: '80px' }}
                                                />
                                            )}
                                        </div>
                                    )}

                                    <div className={styles.answerTradeRow}>
                                        <span className={styles.answerEstimate}>
                                            {isLimit && limitPrice
                                                ? `Limit ${tradeMode === 'buy' ? 'Buy' : 'Sell'} ${selectedOutcome} @ ${(parseFloat(limitPrice) * 100).toFixed(0)}¢`
                                                : tradeMode === 'buy'
                                                    ? (selectedOutcome === 'YES'
                                                        ? `Est. payout: $${(parseFloat(amount || "0") / answer.prob).toFixed(2)} if ${answer.text} wins`
                                                        : `Est. payout: $${(parseFloat(amount || "0") / (1 - answer.prob)).toFixed(2)} if ${answer.text} loses`)
                                                    : `Sell ${parseFloat(amount || "0").toFixed(2)} ${selectedOutcome} shares`
                                            }
                                        </span>
                                    </div>
                                    <div className={styles.answerTradeActions}>
                                        <button
                                            className={`${styles.answerTradeBtn} ${selectedOutcome === 'YES' ? styles.answerTradeBtnYes : styles.answerTradeBtnNo
                                                }`}
                                            style={{
                                                background: tradeMode === 'sell'
                                                    ? 'var(--color-danger)'
                                                    : (selectedOutcome === 'YES' ? 'var(--color-success)' : 'var(--color-danger)')
                                            }}
                                            onClick={() => tradeMode === 'buy'
                                                ? handleTrade(answer.id, selectedOutcome)
                                                : handleSell(answer.id, selectedOutcome)
                                            }
                                            disabled={isLoading || !isAuthenticated || tradingDisabled}
                                        >
                                            {isLoading
                                                ? (tradeMode === 'buy' ? "Buying..." : "Selling...")
                                                : isLimit && limitPrice
                                                    ? `Limit ${tradeMode === 'buy' ? 'Buy' : 'Sell'} ${selectedOutcome} @ ${(parseFloat(limitPrice) * 100).toFixed(0)}¢`
                                                    : tradeMode === 'buy'
                                                        ? `Buy ${selectedOutcome} @ ${selectedOutcome === 'YES' ? prob : 100 - prob}¢`
                                                        : `Sell ${selectedOutcome} Shares`
                                            }
                                        </button>
                                        <button
                                            className={styles.answerTradeBtn}
                                            style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
                                            onClick={() => { setExpandedAnswer(null); setIsLimit(false); setLimitPrice(""); }}
                                        >
                                            Cancel
                                        </button>
                                    </div>

                                    {/* Mini Orderbook for this answer - Shows relevant side based on YES/NO selection */}
                                    {isMainMarket && (
                                        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                                            <div style={{ background: 'var(--bg-input)', borderRadius: '8px', padding: '10px' }}>
                                                <div style={{ fontSize: '11px', fontWeight: 600, color: selectedOutcome === 'YES' ? 'var(--color-success)' : 'var(--color-danger)', marginBottom: '8px' }}>
                                                    {selectedOutcome} Order Book
                                                </div>
                                                {/* Header */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '9px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 500 }}>
                                                    <div>Price</div>
                                                    <div style={{ textAlign: 'right' }}>Size</div>
                                                    <div style={{ textAlign: 'right' }}>Total</div>
                                                </div>
                                                {/* Bids/Asks for selected outcome */}
                                                {(() => {
                                                    const ob = answerOrderbook[answer.id];
                                                    const bids = selectedOutcome === 'YES' ? (ob?.yesBids || []) : (ob?.noBids || []);
                                                    const asks = selectedOutcome === 'YES' ? (ob?.yesAsks || []) : (ob?.noAsks || []);
                                                    const maxSize = Math.max(...bids.map(b => b.size || 0), ...asks.map(a => a.size || 0), 1);

                                                    if (bids.length === 0 && asks.length === 0) {
                                                        return <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>No orders</div>;
                                                    }
                                                    return (
                                                        <>
                                                            {bids.slice(0, 5).map((b, i) => (
                                                                <div key={`b${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '10px', padding: '2px 0', position: 'relative' }}>
                                                                    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, background: 'var(--color-success)', opacity: 0.1, width: `${((b.size || 0) / maxSize) * 100}%` }} />
                                                                    <div style={{ color: 'var(--color-success)', fontWeight: 500, position: 'relative' }}>{((b.price || 0) * 100).toFixed(0)}¢</div>
                                                                    <div style={{ textAlign: 'right', position: 'relative' }}>{(b.size || 0).toFixed(0)}</div>
                                                                    <div style={{ textAlign: 'right', color: 'var(--text-secondary)', position: 'relative' }}>${((b.price || 0) * (b.size || 0)).toFixed(0)}</div>
                                                                </div>
                                                            ))}
                                                            {asks.slice(0, 5).map((a, i) => (
                                                                <div key={`a${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '10px', padding: '2px 0', position: 'relative' }}>
                                                                    <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, background: 'var(--color-danger)', opacity: 0.1, width: `${((a.size || 0) / maxSize) * 100}%` }} />
                                                                    <div style={{ color: 'var(--color-danger)', fontWeight: 500, position: 'relative' }}>{((a.price || 0) * 100).toFixed(0)}¢</div>
                                                                    <div style={{ textAlign: 'right', position: 'relative' }}>{(a.size || 0).toFixed(0)}</div>
                                                                    <div style={{ textAlign: 'right', color: 'var(--text-secondary)', position: 'relative' }}>${((a.price || 0) * (a.size || 0)).toFixed(0)}</div>
                                                                </div>
                                                            ))}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {answers.length > 10 && (
                <button className={styles.showMoreBtn}>
                    Show {answers.length - 10} more answers
                </button>
            )}
        </div>
    );
}
