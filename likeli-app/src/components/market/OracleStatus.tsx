"use client";

import { useState, useEffect } from "react";
import { CHALLENGE_BOND } from "@/lib/oracle/config";
import { formatTimeRemaining } from "@/lib/oracle/agent";

interface OracleStatusProps {
    contractId: string;
    oracleStatus?: string;
    proposal?: {
        resolution: string;
        proposedAt: number;
        reasoning: string;
        challengeWindowEnd: number;
    };
    challenge?: {
        challengerId: string;
        reason: string;
        challengedAt: number;
    };
    resolutionSource?: {
        type: string;
        asset?: string;
        targetPrice?: number;
        condition?: string;
        deadline: number;
        description?: string;
    };
    currentUserId?: string;
    onPropose?: () => void;
    onChallenge?: (reason: string) => void;
    onFinalize?: () => void;
}

export default function OracleStatus({
    contractId,
    oracleStatus,
    proposal,
    challenge,
    resolutionSource,
    currentUserId,
    onPropose,
    onChallenge,
    onFinalize
}: OracleStatusProps) {
    const [timeRemaining, setTimeRemaining] = useState("");
    const [challengeReason, setChallengeReason] = useState("");
    const [showChallengeForm, setShowChallengeForm] = useState(false);

    // Update countdown timer
    useEffect(() => {
        if (!proposal?.challengeWindowEnd) return;

        const update = () => {
            setTimeRemaining(formatTimeRemaining(proposal.challengeWindowEnd));
        };

        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [proposal?.challengeWindowEnd]);

    // No oracle configuration
    if (!resolutionSource) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <span style={styles.icon}>⚙️</span>
                    <span style={styles.title}>Manual Resolution</span>
                </div>
                <p style={styles.text}>This market will be resolved manually by the creator.</p>
            </div>
        );
    }

    // Waiting for deadline
    if (!oracleStatus || oracleStatus === 'UNRESOLVED' || oracleStatus === 'PENDING') {
        const deadlineStr = new Date(resolutionSource.deadline).toLocaleString();
        const isPast = Date.now() >= resolutionSource.deadline;

        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <span style={styles.icon}>🤖</span>
                    <span style={styles.title}>AI Oracle</span>
                </div>
                <p style={styles.text}>
                    {resolutionSource.description ||
                        `${resolutionSource.asset?.toUpperCase()} ${resolutionSource.condition} $${resolutionSource.targetPrice?.toLocaleString()}`}
                </p>
                <p style={styles.deadline}>
                    Resolution deadline: <strong>{deadlineStr}</strong>
                    {isPast && " (passed)"}
                </p>
                {isPast && onPropose && (
                    <button style={styles.button} onClick={onPropose}>
                        🚀 Trigger Oracle Proposal
                    </button>
                )}
            </div>
        );
    }

    // Provisional - showing proposal with challenge option
    if (oracleStatus === 'PROVISIONAL' && proposal) {
        const isExpired = Date.now() >= proposal.challengeWindowEnd;

        return (
            <div style={{ ...styles.container, ...styles.provisional }}>
                <div style={styles.header}>
                    <span style={styles.icon}>⏳</span>
                    <span style={styles.title}>Provisional Resolution</span>
                </div>

                <div style={styles.proposalBox}>
                    <div style={styles.proposalResolution}>
                        AI proposes: <strong style={proposal.resolution === 'YES' ? styles.yes : styles.no}>
                            {proposal.resolution}
                        </strong>
                    </div>
                    <p style={styles.reasoning}>{proposal.reasoning}</p>
                </div>

                <div style={styles.timer}>
                    {isExpired ? (
                        <span>⏰ Challenge window expired</span>
                    ) : (
                        <span>⏳ Challenge window: <strong>{timeRemaining}</strong></span>
                    )}
                </div>

                {!isExpired && !showChallengeForm && (
                    <button
                        style={styles.challengeButton}
                        onClick={() => setShowChallengeForm(true)}
                    >
                        ⚔️ Challenge (${CHALLENGE_BOND} bond)
                    </button>
                )}

                {showChallengeForm && (
                    <div style={styles.challengeForm}>
                        <textarea
                            placeholder="Why is this resolution wrong?"
                            value={challengeReason}
                            onChange={e => setChallengeReason(e.target.value)}
                            style={styles.textarea}
                        />
                        <div style={styles.challengeActions}>
                            <button
                                style={styles.cancelButton}
                                onClick={() => setShowChallengeForm(false)}
                            >
                                Cancel
                            </button>
                            <button
                                style={styles.submitChallenge}
                                onClick={() => {
                                    onChallenge?.(challengeReason);
                                    setShowChallengeForm(false);
                                }}
                                disabled={!challengeReason.trim()}
                            >
                                Submit Challenge
                            </button>
                        </div>
                    </div>
                )}

                {isExpired && onFinalize && (
                    <button style={styles.button} onClick={onFinalize}>
                        ✅ Finalize Resolution
                    </button>
                )}
            </div>
        );
    }

    // Challenged - showing dispute status
    if (oracleStatus === 'CHALLENGED' && challenge) {
        return (
            <div style={{ ...styles.container, ...styles.challenged }}>
                <div style={styles.header}>
                    <span style={styles.icon}>⚔️</span>
                    <span style={styles.title}>Disputed</span>
                </div>

                <div style={styles.proposalBox}>
                    <p><strong>Original proposal:</strong> {proposal?.resolution}</p>
                    <p><strong>Challenged by:</strong> {challenge.challengerId.slice(0, 10)}...</p>
                    <p><strong>Reason:</strong> {challenge.reason}</p>
                </div>

                <p style={styles.text}>
                    This market is under dispute and will be resolved manually.
                </p>
            </div>
        );
    }

    // Finalized
    if (oracleStatus === 'FINALIZED') {
        return (
            <div style={{ ...styles.container, ...styles.finalized }}>
                <div style={styles.header}>
                    <span style={styles.icon}>✅</span>
                    <span style={styles.title}>Oracle Finalized</span>
                </div>
                {proposal && (
                    <p style={styles.text}>
                        Resolved as <strong>{proposal.resolution}</strong>
                    </p>
                )}
            </div>
        );
    }

    return null;
}

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        padding: '16px',
        borderRadius: '8px',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        marginBottom: '16px'
    },
    provisional: {
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.05)'
    },
    challenged: {
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.05)'
    },
    finalized: {
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.05)'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '12px'
    },
    icon: {
        fontSize: '20px'
    },
    title: {
        fontWeight: 600,
        fontSize: '16px',
        color: 'var(--text-main)'
    },
    text: {
        color: 'var(--text-secondary)',
        fontSize: '14px',
        margin: '8px 0'
    },
    deadline: {
        color: 'var(--text-muted)',
        fontSize: '13px'
    },
    proposalBox: {
        backgroundColor: 'var(--bg-input)',
        padding: '12px',
        borderRadius: '6px',
        marginBottom: '12px'
    },
    proposalResolution: {
        fontSize: '16px',
        marginBottom: '8px'
    },
    yes: {
        color: '#22c55e'
    },
    no: {
        color: '#ef4444'
    },
    reasoning: {
        fontSize: '13px',
        color: 'var(--text-secondary)',
        margin: 0
    },
    timer: {
        padding: '8px 12px',
        backgroundColor: 'var(--bg-input)',
        borderRadius: '4px',
        fontSize: '14px',
        marginBottom: '12px'
    },
    button: {
        width: '100%',
        padding: '10px 16px',
        backgroundColor: 'var(--color-primary)',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer'
    },
    challengeButton: {
        width: '100%',
        padding: '10px 16px',
        backgroundColor: 'transparent',
        color: '#f59e0b',
        border: '1px solid #f59e0b',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer'
    },
    challengeForm: {
        marginTop: '12px'
    },
    textarea: {
        width: '100%',
        minHeight: '80px',
        padding: '10px',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-input)',
        color: 'var(--text-main)',
        fontSize: '14px',
        resize: 'vertical',
        marginBottom: '8px'
    },
    challengeActions: {
        display: 'flex',
        gap: '8px',
        justifyContent: 'flex-end'
    },
    cancelButton: {
        padding: '8px 16px',
        backgroundColor: 'transparent',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '6px',
        cursor: 'pointer'
    },
    submitChallenge: {
        padding: '8px 16px',
        backgroundColor: '#f59e0b',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        fontWeight: 600,
        cursor: 'pointer'
    }
};
