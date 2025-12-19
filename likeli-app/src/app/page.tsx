"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useLikeliProgram, MarketAccount, PROGRAM_ID } from "@/hooks/useLikeliProgram";
import { PublicKey } from "@solana/web3.js";
import styles from "./page.module.css";
import { Search, Clock, TrendingUp, Sparkles, Trophy, Layers, Plus, Loader2 } from "lucide-react";
import clsx from "clsx";
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton";
import SolanaCreateMarketModal from "@/components/markets/SolanaCreateMarketModal";
import MarketCard from "@/components/markets/MarketCard";
import LandingHero from "@/components/landing/LandingHero";
import { GRADUATION_VOLUME_THRESHOLD, GRADUATION_TIMER_MS } from "@/lib/graduation";

const CATEGORIES = ["All", "Crypto", "Macro", "Politics", "Sports", "Culture"];

// Tab types for the market lifecycle
type MarketTab = "sandbox" | "graduating" | "main";

interface SolanaMarket {
  publicKey: PublicKey;
  account: MarketAccount;
  yesPrice: number;
  noPrice: number;
  phase: MarketTab;
  graduationStartTime?: number;
}

export default function Home() {
  const { connected } = useWallet();
  const { fetchAllMarkets, fetchAllMultiMarkets, fetchAllGlobalAnswers, createMarket, buyShares } = useLikeliProgram();

  const [activeTab, setActiveTab] = useState<MarketTab>("sandbox");
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Markets State
  const [markets, setMarkets] = useState<SolanaMarket[]>([]);
  const [loading, setLoading] = useState(false);

  // Stable Mock Graduation Timers
  const graduationStartTimes = useRef<Record<string, number>>({});

  // Hydrate stored graduation timers so the countdown doesn't reset on refresh
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("graduationStartTimes");
    if (stored) {
      try {
        graduationStartTimes.current = JSON.parse(stored);
      } catch {
        graduationStartTimes.current = {};
      }
    }
  }, []);

  // Load markets from blockchain
  const loadMarkets = useCallback(async (silent = false) => {
    if (!connected) return;

    try {
      if (!silent) setLoading(true);

      // Fetch all three types of data
      const [fetchedBinaries, fetchedMultis, fetchedAnswers] = await Promise.all([
        fetchAllMarkets(),
        fetchAllMultiMarkets(),
        fetchAllGlobalAnswers()
      ]);

      // If ALL fetches returned empty, this is likely an RPC failure - don't update state
      if (fetchedBinaries.length === 0 && fetchedMultis.length === 0 && fetchedAnswers.length === 0) {
        console.log("All fetches returned empty - likely RPC failure, preserving current state");
        return; // Don't update state at all - keep existing markets
      }

      let startTimesChanged = false;

      // 1. Process Binaries (Standard logic)
      const binaryMarketsMapped = fetchedBinaries.map((m: any) => {
        const volume = m.account.totalVolume.toNumber();
        const pk = m.publicKey.toString();

        let phase: MarketTab = "sandbox";
        let graduationStartTime: number | undefined;

        if (volume >= GRADUATION_VOLUME_THRESHOLD) {
          if (!graduationStartTimes.current[pk]) {
            graduationStartTimes.current[pk] = Date.now();
            startTimesChanged = true;
          }
          const start = graduationStartTimes.current[pk];
          const elapsed = Date.now() - start;
          if (elapsed >= GRADUATION_TIMER_MS) phase = "main";
          else {
            phase = "graduating";
            graduationStartTime = start;
          }
        }

        return {
          ...m,
          yesPrice: m.account.yesPrice || 0.5,
          noPrice: m.account.noPrice || 0.5,
          phase,
          graduationStartTime
        };
      });

      // 2. Process Multi-Markets (Map each answer into its own card structure but grouped by groupId later)
      // Actually, let's just make MultiMarket + Answers look like binary markets with a shared GroupID for the current UI
      const multiChoiceMarketsMapped = fetchedMultis.flatMap((mm: any) => {
        const mAnswers = fetchedAnswers.filter((a: any) => a.account.market.equals(mm.publicKey));
        const totalVolume = mm.account.volume.toNumber();
        const pk = mm.publicKey.toString();

        let phase: MarketTab = "sandbox";
        if (totalVolume >= 5000) phase = "main";
        else if (totalVolume >= 1000) phase = "graduating";

        return mAnswers.map((ans: any) => {
          const yesPool = ans.account.yesPool.toNumber();
          const noPool = ans.account.noPool.toNumber();
          const total = yesPool + noPool;
          const yesPrice = total > 0 ? noPool / total : 0.5;
          const noPrice = total > 0 ? yesPool / total : 0.5;

          return {
            publicKey: ans.publicKey,
            account: {
              creator: mm.account.creator,
              question: mm.account.question || "Multi-Choice Market",
              // Use a virtual question for display filtering
              questionDisplay: mm.account.question || "Multi-Choice Market",
              yesPool: ans.account.yesPool,
              noPool: ans.account.noPool,
              totalVolume: ans.account.volume,
              groupId: mm.publicKey.toString(), // Anchor this to the MultiMarket record
              answerLabel: `Answer ${ans.account.index + 1}`,
              resolved: ans.account.resolved,
              outcome: ans.account.outcome,
            } as any,
            yesPrice,
            noPrice,
            phase,
          };
        });
      });

      if (startTimesChanged && typeof window !== "undefined") {
        localStorage.setItem("graduationStartTimes", JSON.stringify(graduationStartTimes.current));
      }

      // Update state with the fetched markets
      const allMarkets = [...binaryMarketsMapped, ...multiChoiceMarketsMapped];
      setMarkets(allMarkets);
    } catch (error) {
      // On error, DON'T update state - preserve existing markets
      console.error("Failed to load markets (preserving current state):", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [connected, fetchAllMarkets, fetchAllMultiMarkets, fetchAllGlobalAnswers]);

  useEffect(() => {
    if (connected) {
      loadMarkets(false); // Initial load with spinner
      // Refresh every 30 seconds silently (reduced to avoid RPC rate limits)
      const interval = setInterval(() => loadMarkets(true), 30000);
      return () => clearInterval(interval);
    }
  }, [connected, loadMarkets]);

  // Handle create market (Moved to SolanaCreateMarketModal)
  /*
  const handleCreateMarket = async () => {
    if (!newQuestion || !connected) return;

    try {
      setCreating(true);
      const resolutionTime = Math.floor(Date.now() / 1000) + (parseInt(newResolutionDays) * 24 * 60 * 60);
      const liquidity = parseInt(newLiquidity);

      await createMarket(newQuestion, resolutionTime, liquidity);

      // Reset form and reload
      setNewQuestion("");
      setIsCreateOpen(false);
      await loadMarkets();

      alert("Market created on Solana! 🎉");
    } catch (error: any) {
      console.error("Failed to create market:", error);
      alert(`Failed to create market: ${error.message}`);
    } finally {
      setCreating(false);
    }
  };
  */

  // Handle buy shares
  const handleBuy = async (marketPubkey: PublicKey, outcome: boolean) => {
    if (!connected) {
      alert("Please connect your wallet first");
      return;
    }

    const amount = prompt(`Enter amount to buy ${outcome ? "YES" : "NO"} shares:`);
    if (!amount) return;

    try {
      await buyShares(marketPubkey, outcome, parseInt(amount));
      await loadMarkets();
      alert(`Bought ${outcome ? "YES" : "NO"} shares! 🎉`);
    } catch (error: any) {
      console.error("Failed to buy shares:", error);
      alert(`Failed to buy: ${error.message}`);
    }
  };

  // Filter markets by tab, category, and search
  const getVisibleMarkets = () => {
    return markets.filter(m => {
      const matchesTab = m.phase === activeTab;
      const matchesCategory = activeCategory === "All" || true; // TODO: Add category to markets
      const matchesSearch = m.account.question.toLowerCase().includes(search.toLowerCase());
      return matchesTab && matchesCategory && matchesSearch;
    });
  };

  const visibleMarkets = getVisibleMarkets();

  // Count markets in each phase
  const sandboxCount = markets.filter(m => m.phase === "sandbox").length;
  const graduatingCount = markets.filter(m => m.phase === "graduating").length;
  const mainCount = markets.filter(m => m.phase === "main").length;

  // Not connected state
  if (!connected) {
    return <LandingHero />;
  }

  return (
    <div className="flex-col" style={{ gap: "var(--space-6)" }}>
      {/* Stats Strip - Solana info */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
        backgroundColor: "var(--bg-card)",
        borderRadius: "12px",
        marginBottom: "16px",
      }}>
        <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          ⛓️ Solana Devnet • Program: <code>{PROGRAM_ID.toString().slice(0, 12)}...</code>
        </span>
        <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          {markets.length} markets on-chain
        </span>
      </div>

      <div className={styles.controlsRow}>
        <div className={styles.controlsLeft}>
          {/* Tabs with counts */}
          <div className={styles.tabGroup}>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === "sandbox" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("sandbox")}
            >
              <Sparkles size={14} />
              Sandbox
              {sandboxCount > 0 && <span className={styles.tabBadge}>{sandboxCount}</span>}
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === "graduating" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("graduating")}
            >
              <TrendingUp size={14} />
              Graduating
              {graduatingCount > 0 && (
                <span className={`${styles.tabBadge} ${styles.tabBadgeGraduating}`}>
                  {graduatingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === "main" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("main")}
            >
              <Trophy size={14} />
              Main Markets
              {mainCount > 0 && <span className={styles.tabBadge}>{mainCount}</span>}
            </button>
          </div>

          {/* Search */}
          <div className={styles.searchBar}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search markets..."
              className={styles.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filters */}
          <div className={styles.filters}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={clsx(styles.filterPill, activeCategory === cat && styles.filterPillActive)}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Header Actions */}
        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus size={14} />
            Create Market
          </button>
        </div>
      </div>

      {/* Tab description */}
      <div className={styles.tabDescription}>
        {activeTab === "sandbox" && (
          <p>
            <Sparkles size={14} /> New markets start here. Trade to reach $1,000 volume for graduation.
          </p>
        )}
        {activeTab === "graduating" && (
          <p>
            <Clock size={14} /> Markets that reached volume threshold. Moving to main soon.
          </p>
        )}
        {activeTab === "main" && (
          <p>
            <Trophy size={14} /> Fully graduated markets with proven liquidity and volume.
          </p>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: "center", padding: "48px" }}>
          <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto 16px" }} />
          <p>Loading markets from Solana...</p>
        </div>
      )}

      {/* Markets Grid */}
      {!loading && visibleMarkets.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: "48px",
          backgroundColor: "var(--bg-card)",
          borderRadius: "16px"
        }}>
          <h3 style={{ marginBottom: "8px" }}>No {activeTab} markets yet</h3>
          <p style={{ color: "var(--text-secondary)" }}>
            {activeTab === "sandbox" ? "Create the first prediction market!" : `Markets will appear here when they reach ${activeTab === "graduating" ? "$1,000" : "$5,000"} volume.`}
          </p>
        </div>
      )}

      {!loading && visibleMarkets.length > 0 && (
        <div className="stagger-children" style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "20px"
        }}>
          {(() => {
            // Group markets by group_id
            const groups: { [key: string]: SolanaMarket[] } = {};
            const binaries: SolanaMarket[] = [];

            visibleMarkets.forEach(m => {
              if (m.account.groupId) {
                if (!groups[m.account.groupId]) groups[m.account.groupId] = [];
                groups[m.account.groupId].push(m);
              } else {
                binaries.push(m);
              }
            });

            // Combine into display list
            const displayItems: (
              | { type: 'binary', market: SolanaMarket }
              | { type: 'multi', markets: SolanaMarket[], question: string, phase: MarketTab }
            )[] = [
                ...binaries.map(m => ({ type: 'binary' as const, market: m })),
                ...Object.values(groups).map(group => ({
                  type: 'multi' as const,
                  markets: group,
                  question: group[0].account.question.replace(/\[Oracle:.*?\]/, "").trim(), // Clean question for header
                  phase: group[0].phase
                }))
              ];

            return displayItems.map((item, idx) => {
              if (item.type === 'binary') {
                const { market } = item;
                return (
                  <MarketCard
                    key={market.publicKey.toString()}
                    id={market.publicKey.toString()}
                    name={market.account.question.replace(/\s*\[Oracle:.*\]/, "").trim()}
                    category={"General"} // Default for now
                    yes={market.yesPrice}
                    no={market.noPrice}
                    vol={`$${(market.account.totalVolume.toNumber() / 1000).toFixed(1)}k`}
                    phase={market.phase}
                    volume={market.account.totalVolume.toNumber()}
                    graduationStartTime={market.graduationStartTime}
                  />
                );
              } else {
                // Multi-Choice Card
                const { markets, question } = item;
                const totalVol = markets.reduce((acc, m) => acc + m.account.totalVolume.toNumber(), 0);

                // Sort by probability to find Top 2
                const sorted = [...markets].sort((a, b) => (b.yesPrice || 0) - (a.yesPrice || 0));
                const top = sorted[0];
                const second = sorted[1];

                const topPrice = top?.yesPrice || 0;
                const secondPrice = second?.yesPrice || 0;

                let groupPhase: MarketTab = "sandbox";
                if (totalVol >= 5000) groupPhase = "main";
                else if (totalVol >= 1000) groupPhase = "graduating";

                // Use the publicKey of the *top* option as the link ID.
                // The MarketPage will detect the group and load all siblings.
                const linkId = top.publicKey.toString();

                return (
                  <MarketCard
                    key={`group-${idx}`}
                    id={linkId}
                    name={question}
                    category={"General"}
                    yes={topPrice}
                    no={secondPrice}
                    vol={`$${(totalVol / 1000).toFixed(1)}k`}
                    phase={groupPhase}
                    volume={totalVol}
                    graduationStartTime={top?.graduationStartTime}
                    isMultiChoice={true}
                    answerCount={markets.length}
                    outcomes={sorted.map((m, i) => ({
                      label: m.account.answerLabel || `Outcome ${i + 1}`,
                      probability: m.yesPrice || 0,
                      id: m.publicKey.toString()
                    }))}
                  />
                );
              }
            });
          })()}
        </div>
      )}

      {/* Create Market Modal */}
      {isCreateOpen && (
        <SolanaCreateMarketModal
          onClose={() => setIsCreateOpen(false)}
          onSuccess={() => {
            loadMarkets();
            alert("Market created on Solana! 🎉");
          }}
        />
      )}
    </div>
  );
}
