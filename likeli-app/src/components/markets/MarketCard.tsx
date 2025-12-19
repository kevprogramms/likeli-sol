"use client";

import { useState, useEffect } from "react";
import styles from "./markets.module.css";
import clsx from "clsx";
import Link from "next/link";
import { Clock, Users, TrendingUp, ArrowUpRight, ArrowDownRight, Layers } from "lucide-react";
import { GRADUATION_VOLUME_THRESHOLD, GRADUATION_TIMER_MS, formatTimeRemaining } from "@/lib/graduation";
import { useParlay } from "@/context/ParlayContext";

interface MarketCardProps {
    id: string | number;
    name: string;
    category: string;
    yes: number;
    no: number;
    vol: string;
    end?: string;
    image?: string;
    phase?: string;
    volume?: number;
    graduationStartTime?: number;
    isMultiChoice?: boolean;
    answerCount?: number;
    outcomes?: Array<{
        label: string;
        probability: number;
        id: string;
    }>;
}

export default function MarketCard({
    id,
    name,
    category,
    yes,
    no,
    vol,
    end,
    image,
    phase,
    volume = 0,
    graduationStartTime,
    isMultiChoice,
    answerCount,
    outcomes
}: MarketCardProps) {
    const prob = (yes * 100).toFixed(0);
    const [timeRemaining, setTimeRemaining] = useState<string | null>(null);
    const [isHovered, setIsHovered] = useState(false);
    const { addLeg, hasMarket, canAddMore } = useParlay();
    const isInParlay = hasMarket(String(id));

    // Calculate volume progress toward graduation
    const volumeProgress = Math.min(100, (volume / GRADUATION_VOLUME_THRESHOLD) * 100);

    // Simulated price change for demo (random between -5 and +5)
    const priceChange = ((yes * 100) - 50) > 0 ? 2.3 : -1.8;
    const isUp = priceChange >= 0;

    // Update graduation timer countdown
    useEffect(() => {
        if (phase === "graduating" && graduationStartTime) {
            const updateTime = () => {
                const elapsed = Date.now() - graduationStartTime;
                const remaining = Math.max(0, GRADUATION_TIMER_MS - elapsed);
                setTimeRemaining(formatTimeRemaining(remaining));
            };

            updateTime();
            const interval = setInterval(updateTime, 1000);
            return () => clearInterval(interval);
        }
    }, [phase, graduationStartTime]);

    // Handle add to parlay
    const handleAddToParlay = (e: React.MouseEvent, outcome: "YES" | "NO") => {
        e.preventDefault();
        e.stopPropagation();
        if (!isInParlay && canAddMore) {
            addLeg(String(id), name, outcome, outcome === "YES" ? yes : no);
        }
    };

    return (
        <Link
            href={`/market/${id}`}
            className={styles.marketCard}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                boxShadow: isHovered
                    ? '0 12px 28px -8px rgba(0, 0, 0, 0.15)'
                    : '0 1px 3px rgba(0, 0, 0, 0.06)',
            }}
        >
            {/* Card Header with gradient overlay */}
            <div className={styles.cardHeader} style={{
                background: `linear-gradient(135deg, 
                    ${phase === 'sandbox' ? '#3B82F6' : phase === 'graduating' ? '#10B981' : '#8B5CF6'} 0%, 
                    ${phase === 'sandbox' ? '#1D4ED8' : phase === 'graduating' ? '#059669' : '#7C3AED'} 100%)`
            }}>
                {/* Category badge */}
                <div className={styles.cardCategory} style={{
                    background: 'rgba(255, 255, 255, 0.15)',
                    backdropFilter: 'blur(8px)',
                    color: 'white',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                }}>
                    {category}
                    {isMultiChoice && (
                        <span style={{
                            marginLeft: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            opacity: 0.9,
                        }}>
                            <Users size={10} /> {answerCount}
                        </span>
                    )}
                </div>

                {/* Phase badge */}
                {phase && (
                    <div className={clsx(
                        styles.phaseBadge,
                        phase === "sandbox" && styles.phaseBadgeSandbox,
                        phase === "graduating" && styles.phaseBadgeGraduating,
                        phase === "main" && styles.phaseBadgeMain
                    )} style={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        color: phase === 'sandbox' ? '#3B82F6' : phase === 'graduating' ? '#10B981' : '#8B5CF6',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}>
                        {phase === "sandbox" && "🧪 Sandbox"}
                        {phase === "graduating" && (
                            <>
                                <Clock size={10} />
                                {timeRemaining}
                            </>
                        )}
                        {phase === "main" && "🏆 Main"}
                    </div>
                )}

                {/* Large probability display */}
                <div style={{
                    position: 'absolute',
                    bottom: '12px',
                    right: '12px',
                    fontSize: '32px',
                    fontWeight: 700,
                    color: 'white',
                    textShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    lineHeight: 1,
                }}>
                    {prob}%
                </div>
            </div>

            {/* Card Body */}
            <div className={styles.cardBody} style={{ padding: '16px' }}>
                <h3 className={styles.cardTitle} style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    lineHeight: 1.4,
                    marginBottom: '12px',
                    color: 'var(--text-main)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}>
                    {name}
                </h3>

                {/* Price row - Different for multi-choice vs binary */}
                {isMultiChoice && outcomes && outcomes.length > 0 ? (
                    /* Multi-Outcome Display */
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        marginBottom: '12px',
                    }}>
                        {outcomes.slice(0, 4).map((outcome, idx) => {
                            const colors = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6'];
                            const percent = (outcome.probability * 100).toFixed(0);
                            return (
                                <div key={outcome.id} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}>
                                    <div style={{
                                        flex: 1,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '3px',
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}>
                                            <span style={{
                                                fontSize: '11px',
                                                fontWeight: 500,
                                                color: 'var(--text-main)',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                maxWidth: '120px',
                                            }}>
                                                {outcome.label}
                                            </span>
                                            <span style={{
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                color: colors[idx % colors.length],
                                            }}>
                                                {percent}%
                                            </span>
                                        </div>
                                        <div style={{
                                            height: '4px',
                                            background: 'var(--bg-input)',
                                            borderRadius: '999px',
                                            overflow: 'hidden',
                                        }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${percent}%`,
                                                background: colors[idx % colors.length],
                                                borderRadius: '999px',
                                                transition: 'width 0.3s ease',
                                            }} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {outcomes.length > 4 && (
                            <div style={{
                                fontSize: '10px',
                                color: 'var(--text-muted)',
                                textAlign: 'center',
                            }}>
                                +{outcomes.length - 4} more outcomes
                            </div>
                        )}
                    </div>
                ) : (
                    /* Binary Market Display */
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px',
                    }}>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <div style={{ textAlign: 'left' }}>
                                <div style={{
                                    fontSize: '10px',
                                    color: 'var(--text-muted)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    marginBottom: '2px'
                                }}>
                                    Yes
                                </div>
                                <div style={{
                                    fontSize: '16px',
                                    fontWeight: 700,
                                    color: 'var(--color-success)'
                                }}>
                                    {(yes * 100).toFixed(0)}¢
                                </div>
                            </div>
                            <div style={{ textAlign: 'left' }}>
                                <div style={{
                                    fontSize: '10px',
                                    color: 'var(--text-muted)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    marginBottom: '2px'
                                }}>
                                    No
                                </div>
                                <div style={{
                                    fontSize: '16px',
                                    fontWeight: 700,
                                    color: 'var(--color-danger)'
                                }}>
                                    {(no * 100).toFixed(0)}¢
                                </div>
                            </div>
                        </div>

                        {/* Price change badge */}
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: isUp ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                            color: isUp ? 'var(--color-success)' : 'var(--color-danger)',
                        }}>
                            {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {Math.abs(priceChange).toFixed(1)}%
                        </div>
                    </div>
                )}

                {/* Progress bar - only for binary markets */}
                {!isMultiChoice && (
                    <div style={{
                        height: '6px',
                        background: 'var(--bg-input)',
                        borderRadius: '999px',
                        overflow: 'hidden',
                        marginBottom: '8px',
                    }}>
                        <div style={{
                            height: '100%',
                            width: `${prob}%`,
                            background: `linear-gradient(90deg, var(--color-success) 0%, #10B981 100%)`,
                            borderRadius: '999px',
                            transition: 'width 0.5s ease',
                        }} />
                    </div>
                )}

                {/* Graduation progress (only for sandbox phase) */}
                {phase === "sandbox" && (
                    <div style={{
                        marginTop: '8px',
                        padding: '8px',
                        background: 'var(--bg-input)',
                        borderRadius: '8px',
                    }}>
                        <div style={{
                            height: '4px',
                            background: 'var(--border-subtle)',
                            borderRadius: '999px',
                            overflow: 'hidden',
                            marginBottom: '6px',
                        }}>
                            <div style={{
                                height: '100%',
                                width: `${volumeProgress}%`,
                                background: 'linear-gradient(90deg, #3B82F6 0%, #1D4ED8 100%)',
                                transition: 'width 0.3s ease',
                            }} />
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            color: 'var(--text-secondary)',
                        }}>
                            <TrendingUp size={10} style={{ color: '#3B82F6' }} />
                            ${volume.toFixed(0)} / ${GRADUATION_VOLUME_THRESHOLD}  to graduate
                        </div>
                    </div>
                )}

                {/* Footer with Add to Parlay */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 'auto',
                    paddingTop: '8px',
                }}>
                    <span style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--color-primary)',
                    }}>
                        {prob}% Chance
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            fontSize: '12px',
                            color: 'var(--text-muted)',
                        }}>
                            {vol} Vol
                        </span>
                        {/* Add to Parlay button */}
                        <button
                            onClick={(e) => handleAddToParlay(e, "YES")}
                            disabled={isInParlay || !canAddMore}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 8px',
                                fontSize: '10px',
                                fontWeight: 600,
                                borderRadius: '6px',
                                border: 'none',
                                cursor: isInParlay || !canAddMore ? 'not-allowed' : 'pointer',
                                background: isInParlay ? '#E0E7FF' : 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                                color: isInParlay ? '#4F46E5' : 'white',
                                opacity: !canAddMore && !isInParlay ? 0.5 : 1,
                                transition: 'all 0.2s',
                            }}
                        >
                            <Layers size={10} />
                            {isInParlay ? 'In Parlay' : '+Parlay'}
                        </button>
                    </div>
                </div>
            </div>
        </Link>
    );
}

