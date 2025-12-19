"use client";

import { useEffect, useState, use, useRef } from "react";
import { useLikeliProgram } from "@/hooks/useLikeliProgram";
import SolanaTradePanel from "@/components/trade/SolanaTradePanel";
import ChartContainer from "@/components/trade/ChartContainer";
import { PublicKey } from "@solana/web3.js";
import { MarketAccount } from "@/hooks/useLikeliProgram";
import { Clock, Layers } from "lucide-react";
import { PricePoint } from "@/lib/orderbook";
import MultiOutcomeChart from "@/components/market/MultiOutcomeChart";
import { GRADUATION_VOLUME_THRESHOLD, GRADUATION_TIMER_MS } from "@/lib/graduation";

export default function MarketPage({ params }: { params: Promise<{ id: string }> }) {
    // Unwrap params in Next.js 15+ 
    // Actually, in Client Components we can use `use(params)` or `useParams()`. 
    // But since this is a page, `params` is passed as prop. 
    // Let's use `use(params)` pattern which is standard for Next 15.
    const { id } = use(params);

    const [market, setMarket] = useState<{ publicKey: PublicKey, account: any } | null>(null);
    const [multiMarket, setMultiMarket] = useState<{ publicKey: PublicKey, account: any } | null>(null);
    const [siblings, setSiblings] = useState<{ publicKey: PublicKey, account: any }[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Selected market for the Trade Panel (defaults to the visited ID)
    const [selectedMarketId, setSelectedMarketId] = useState<string>(id);

    // Fetch helpers
    const { fetchMarket, fetchMultiMarket, fetchAnswer, fetchAllAnswers, fetchAllMarkets, program, rebalanceMarket, setMultiMarketConfig } = useLikeliProgram();

    // --- MARKET RESOLUTION (Derived State) ---
    const isMultiOutcome = !!multiMarket;
    const activeMarket = isMultiOutcome
        ? siblings.find(s => s.publicKey.toString() === selectedMarketId)
        : market;
    const targetMarket = activeMarket || market;
    const isResolved = targetMarket?.account.resolved ?? false;

    // --- GRADUATION STATE & EFFECT ---
    const graduationStartTimeRef = useRef<number | null>(null);
    const [phase, setPhase] = useState<'sandbox' | 'graduating' | 'main'>('sandbox');

    // Hydrate stored graduation start time for this market so timer does not reset on refresh
    useEffect(() => {
        if (!id || typeof window === "undefined") return;
        const stored = localStorage.getItem("graduationStartTimes");
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed[id]) {
                    graduationStartTimeRef.current = parsed[id];
                }
            } catch {
                graduationStartTimeRef.current = null;
            }
        }
    }, [id]);

    useEffect(() => {
        if (!targetMarket) return;
        const volume = targetMarket.account.volume?.toNumber() || targetMarket.account.totalVolume?.toNumber() || 0;
        const marketKey = targetMarket.publicKey.toString();

        const persistStartTime = (value: number | null) => {
            if (typeof window === "undefined") return;
            const stored = localStorage.getItem("graduationStartTimes");
            const parsed = stored ? (() => { try { return JSON.parse(stored); } catch { return {}; } })() : {};
            if (value) parsed[marketKey] = value;
            else delete parsed[marketKey];
            localStorage.setItem("graduationStartTimes", JSON.stringify(parsed));
        };

        const updatePhase = () => {
            if (volume >= GRADUATION_VOLUME_THRESHOLD) {
                if (graduationStartTimeRef.current === null) {
                    const start = Date.now();
                    graduationStartTimeRef.current = start;
                    persistStartTime(start);
                }
                const elapsed = Date.now() - graduationStartTimeRef.current;
                if (elapsed >= GRADUATION_TIMER_MS) setPhase('main');
                else setPhase('graduating');
            } else {
                setPhase('sandbox');
                graduationStartTimeRef.current = null;
                persistStartTime(null);
            }
        };

        updatePhase();
        const interval = setInterval(updatePhase, 1000);
        return () => clearInterval(interval);
    }, [targetMarket?.publicKey.toString()]);

    useEffect(() => {
        if (!id || !program) return;

        const loadData = async () => {
            try {
                let pubkey;
                try {
                    pubkey = new PublicKey(id);
                } catch {
                    console.error("Invalid market ID");
                    setLoading(false);
                    return;
                }

                // Try fetching in order: MultiMarket -> Answer -> Binary Market
                // This prevents discriminator errors when trying wrong account type

                // 1. Try fetching as MultiMarket first (most common for multi-outcome markets)
                const multiMarketAcct = await fetchMultiMarket(pubkey);
                if (multiMarketAcct) {
                    setMultiMarket({ publicKey: pubkey, account: multiMarketAcct });

                    // Fetch all answers for this multi-market
                    const allAnswers = await fetchAllAnswers(pubkey, multiMarketAcct.answerCount);
                    if (allAnswers.length > 0) {
                        // Set the first answer as the displayed market
                        setMarket({
                            publicKey: allAnswers[0].publicKey,
                            account: {
                                ...allAnswers[0].account,
                                answerLabel: `Outcome 1`,
                                isMulti: true,
                                answerIndex: 0,
                                multiMarketPDA: pubkey
                            } as any
                        });
                        setSiblings(allAnswers.map((a, idx) => ({
                            publicKey: a.publicKey,
                            account: {
                                ...a.account,
                                answerLabel: `Outcome ${idx + 1}`,
                                isMulti: true,
                                answerIndex: idx,
                                multiMarketPDA: pubkey
                            }
                        })));
                    }
                } else {
                    // 2. Try fetching as an Answer (URL is a specific answer PDA)
                    const answerAcct = await fetchAnswer(pubkey);
                    if (answerAcct) {
                        setMarket({ publicKey: pubkey, account: answerAcct });

                        // Fetch parent multi-market
                        const parentMM = await fetchMultiMarket(answerAcct.market);
                        if (parentMM) {
                            setMultiMarket({ publicKey: answerAcct.market, account: parentMM });

                            // Fetch all answers for this multi-market
                            const allAnswers = await fetchAllAnswers(answerAcct.market, parentMM.answerCount);
                            setSiblings(allAnswers.map((a, idx) => ({
                                publicKey: a.publicKey,
                                account: {
                                    ...a.account,
                                    answerLabel: `Outcome ${idx + 1}`,
                                    isMulti: true,
                                    answerIndex: idx,
                                    multiMarketPDA: answerAcct.market
                                }
                            })));
                        }
                    } else {
                        // 3. Try fetching as a binary market (legacy)
                        const binaryAcct = await fetchMarket(pubkey);
                        if (binaryAcct) {
                            setMarket({ publicKey: pubkey, account: binaryAcct });
                            setMultiMarket(null);

                            // Fetch siblings if it's a legacy group
                            if (binaryAcct.groupId) {
                                const all = await fetchAllMarkets();
                                const groupSiblings = all.filter((m: any) => m.account.groupId === binaryAcct.groupId);
                                setSiblings(groupSiblings);
                            } else {
                                setSiblings([]);
                            }
                        } else {
                            console.warn("No multi-market, answer, or binary market found for ID:", id);
                        }
                    }
                }

            } catch (e) {
                console.error("Failed to fetch market data", e);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [id, program, refreshTrigger, fetchMarket, fetchMultiMarket, fetchAnswer, fetchAllAnswers, fetchAllMarkets]);

    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
        );
    }

    if (!market) {
        return (
            <div className="flex h-screen items-center justify-center flex-col gap-4">
                <h2 className="text-xl font-bold text-gray-400">Market Not Found</h2>
                <p className="text-gray-500">The market ID is invalid or does not exist on Devnet.</p>
            </div>
        );
    }

    // Safety check if activeMarket is somehow missing (e.g., selectedMarketId points to a non-existent sibling)
    if (!activeMarket && isMultiOutcome && siblings.length > 0) {
        // Fallback to first sibling if the selected one is not found
        setSelectedMarketId(siblings[0].publicKey.toString());
        return null; // Trigger re-render with new selectedMarketId
    }

    if (!targetMarket) return null;

    // --- CHART DATA PREP ---
    const now = Date.now();
    let chartProps: any = {};

    if (isMultiOutcome) {
        // Prepare MultiOutcomeChart props
        const answers = siblings.map(s => ({
            id: s.publicKey.toString(),
            text: s.account.answerLabel || s.publicKey.toString().slice(0, 4),
            prob: s.account.yesPrice ?? 0.5,
            poolYes: s.account.yesPool.toNumber(),
            poolNo: s.account.noPool.toNumber()
        }));

        // Mock history for all answers (Start -> Now)
        // Since we don't have price history API yet.
        const priceHistory: any = {};
        siblings.forEach(s => {
            const createdAt = s.account.createdAt ? s.account.createdAt.toNumber() * 1000 : now - 86400000;
            priceHistory[s.publicKey.toString()] = [
                { timestamp: createdAt, prob: 1.0 / siblings.length }, // Start at 1/N probability (approx)
                { timestamp: now, prob: s.account.yesPrice ?? 0.5 }
            ];
        });

        chartProps = {
            answers,
            volume: siblings.reduce((acc, s) => acc + (s.account.totalVolume?.toNumber() || 0), 0),
            priceHistory
        };
    } else {
        // Binary Chart Props
        const yesPrice = market.account.yesPrice ?? 0.5;
        const noPrice = market.account.noPrice ?? 0.5;
        const createdAt = market.account.createdAt
            ? market.account.createdAt.toNumber() * 1000
            : now - 86400000;

        const mockHistory = [
            { marketId: id, timestamp: createdAt, yesProb: 0.5, noProb: 0.5 },
            { marketId: id, timestamp: now, yesProb: yesPrice, noProb: noPrice }
        ];

        chartProps = {
            priceHistory: mockHistory,
            mode: "simple"
        };
    }

    // --- DIAGNOSTICS & SYNC ---
    const probSum = siblings.reduce((acc, s) => acc + (s.account.yesPrice ?? 0.5), 0);
    const isOutOfSync = isMultiOutcome && Math.abs(1 - probSum) > 0.01;
    const isCreator = market?.account.creator?.toString() === program?.provider.publicKey?.toString() ||
        multiMarket?.account.creator?.toString() === program?.provider.publicKey?.toString();

    const handleManualRebalance = async () => {
        if (!multiMarket) return;
        try {
            const siblingAccounts = siblings
                .filter(s => s.publicKey.toString() !== targetMarket.publicKey.toString())
                .map(s => ({ pubkey: s.publicKey, isWritable: true, isSigner: false }));

            await rebalanceMarket(multiMarket.publicKey, targetMarket.account.index, siblingAccounts);
            handleRefresh();
        } catch (e: any) {
            alert("Rebalance failed: " + e.message);
        }
    };

    const handleEnableNegRisk = async () => {
        if (!multiMarket) return;
        try {
            await setMultiMarketConfig(
                multiMarket.publicKey,
                true,
                multiMarket.account.feeBps || 100,
                multiMarket.account.resolutionTime.toNumber()
            );
            handleRefresh();
        } catch (e: any) {
            alert("Failed to update config: " + e.message);
        }
    };


    return (
        <div className="flex flex-col lg:flex-row min-h-[calc(100vh-64px)]">
            {/* Left Column: Info & Chart */}
            <div className="flex-1 p-6 lg:p-10 flex flex-col gap-8 max-w-5xl">

                {/* Header */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full text-xs font-bold uppercase tracking-wide border border-blue-500/20">
                            {isMultiOutcome ? "Multi Choice" : "Binary"}
                        </span>
                        <span className="text-gray-400 text-xs font-mono">
                            {targetMarket.publicKey.toString().slice(0, 8)}...
                        </span>
                        {/* Removed totalVolume display from here */}
                        {isResolved && (
                            <span className="px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-bold border border-green-500/20">
                                Resolved
                            </span>
                        )}
                    </div>

                    <h1 className="text-4xl font-extrabold text-[var(--text-main)] leading-tight">
                        {/* Use the group question if multi, otherwise single question */}
                        {isMultiOutcome
                            ? (multiMarket?.account.questionDisplay || "Multi-Choice Market").replace(/\[Oracle:.*?\]/, "").trim()
                            : (targetMarket.account.question || "Binary Market").replace(/\[Oracle:.*?\]/, "").trim()}
                    </h1>
                    {/* Removed answerLabel display from here */}
                </div>

                {/* Chart Section */}
                <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] p-1 overflow-hidden min-h-[400px]">
                    {isMultiOutcome ? (
                        <MultiOutcomeChart {...chartProps} />
                    ) : (
                        <ChartContainer
                            mode="simple"
                            setMode={() => { }}
                            priceHistory={chartProps.priceHistory}
                        />
                    )}
                </div>

                {/* Multi-Outcome Selection List */}
                {isMultiOutcome && (
                    <div className="space-y-3">
                        <h3 className="font-bold text-lg text-[var(--text-main)]">Outcomes</h3>
                        <div className="grid grid-cols-1 gap-3">
                            {siblings.map((s) => {
                                const isSelected = s.publicKey.toString() === selectedMarketId;
                                const prob = (s.account.yesPrice ?? 0.5) * 100;
                                return (
                                    <button
                                        key={s.publicKey.toString()}
                                        onClick={() => setSelectedMarketId(s.publicKey.toString())}
                                        className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isSelected
                                            ? 'border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-500'
                                            : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:border-blue-300'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            {/* Color dot/index needed here? For now simple text */}
                                            <span className="font-semibold text-[var(--text-main)]">
                                                {s.account.answerLabel || "Option"}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-lg font-bold text-[var(--color-primary)]">
                                                {prob.toFixed(1)}%
                                            </span>
                                            {isSelected && (
                                                <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded">
                                                    TRADING
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Market Rules / Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-[var(--bg-panel)] p-6 rounded-xl border border-[var(--border-subtle)]">
                        <h3 className="flex items-center gap-2 font-bold mb-4 text-[var(--text-main)]">
                            <Clock size={16} /> Resolution
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                            {isMultiOutcome
                                ? "The outcome that occurs will resolve to YES. All others resolve to NO."
                                : "This market will resolve to YES if the event occurs, and NO otherwise."
                            }
                            Resolution is determined by the oracle after {new Date((targetMarket.account.resolutionTime?.toNumber() || 0) * 1000).toLocaleDateString()}.
                        </p>
                    </div>
                    {/* Removed Mechanics section */}
                </div>

            </div>

            {/* Right Column: Trade Panel */}
            <div className="w-full lg:w-[400px] border-l border-[var(--border-subtle)] bg-[var(--bg-panel)] sticky top-0 h-screen overflow-y-auto">
                <div className="p-4 border-b border-[var(--border-subtle)]">
                    <h3 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider">
                        Trade Panel
                    </h3>
                    {isMultiOutcome && (
                        <div className="mt-2 text-sm font-medium text-[var(--text-main)] flex items-center gap-2">
                            Selected: <span className="text-blue-600">{targetMarket.account.answerLabel}</span>
                            {multiMarket.account.isOneWinner ? (
                                <span className="text-[10px] bg-green-500/10 text-green-500 px-1.5 rounded border border-green-500/20">NegRisk</span>
                            ) : (
                                <span className="text-[10px] bg-gray-500/10 text-gray-400 px-1.5 rounded border border-gray-500/20">Independent</span>
                            )}
                        </div>
                    )}
                    {isOutOfSync && (
                        <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                            <div className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-1">⚠️ Probability Imbalance</div>
                            <div className="text-sm text-amber-500/80">
                                Total probability is {(probSum * 100).toFixed(1)}%.
                                {isCreator ? " Sync required to maintain fair pricing." : " This market is currently out of sync."}
                            </div>
                            {isCreator && (
                                <div className="mt-2 flex gap-2">
                                    {!multiMarket?.account.isOneWinner && (
                                        <button
                                            onClick={handleEnableNegRisk}
                                            className="px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition-colors"
                                        >
                                            Enable NegRisk
                                        </button>
                                    )}
                                    <button
                                        onClick={handleManualRebalance}
                                        className="px-3 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-lg hover:bg-blue-600 transition-colors"
                                    >
                                        Auto-Sync Pools
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <SolanaTradePanel
                    key={selectedMarketId} // Force re-render on switch
                    market={{
                        publicKey: targetMarket.publicKey,
                        account: {
                            question: isMultiOutcome ? (multiMarket?.account.questionDisplay || "Multi-Choice Market") : targetMarket.account.question,
                            yesPrice: targetMarket.account.yesPrice ?? 0.5,
                            noPrice: targetMarket.account.noPrice ?? 0.5,
                            totalVolume: targetMarket.account.volume || targetMarket.account.totalVolume,
                            resolved: targetMarket.account.resolved,
                            isMulti: isMultiOutcome,
                            answerIndex: targetMarket.account.index,
                            multiMarketPDA: multiMarket?.publicKey
                        }
                    }}
                    onOrderPlaced={handleRefresh}
                    isGraduating={phase === 'graduating'}
                    siblings={siblings}
                />
            </div>
        </div>
    );
}
