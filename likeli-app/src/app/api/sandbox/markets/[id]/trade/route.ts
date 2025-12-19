import { NextRequest, NextResponse } from "next/server";
import {
    sandboxMarkets,
    sandboxUsers,
    getProbability,
    executeSandboxBuy,
    executeSandboxSell,
    executeSandboxMultiArbitrageBuy,
    executeSandboxAnswerSell,
    updateMarketPhase,
    Outcome,
    SandboxUser
} from "@/lib/sandbox";
import { GRADUATION_VOLUME_THRESHOLD } from "@/lib/graduation";

/**
 * POST /api/sandbox/markets/[id]/trade
 * 
 * Execute a trade on a sandbox market (BINARY or MULTIPLE_CHOICE)
 * 
 * Body:
 * - side: "BUY" | "SELL"
 * - outcome: "YES" | "NO" (for BINARY)
 * - answerId: string (for MULTIPLE_CHOICE)
 * - amountUsd: number (for BUY)
 * - qty: number (shares for SELL)
 * - userId: string (optional, default "demo-user")
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const market = sandboxMarkets.get(id);

        if (!market) {
            return NextResponse.json({ error: "Market not found" }, { status: 404 });
        }

        // Check if market can be traded
        if (market.resolution) {
            return NextResponse.json({ error: "Market is resolved" }, { status: 400 });
        }

        const body = await req.json();
        const { side, outcome, answerId, amountUsd, qty, userId } = body;
        const user = userId || "demo-user";

        // Initialize user if not exists
        if (!sandboxUsers.has(user)) {
            sandboxUsers.set(user, { id: user, cash: 10000, positions: {} });
        }
        const currentUser = sandboxUsers.get(user)!;

        try {
            // Determine if this is a multi-choice trade
            const isMultiChoice = market.outcomeType === 'MULTIPLE_CHOICE' && answerId;

            if (side === "BUY") {
                const amount = parseFloat(amountUsd) || 0;
                if (amount <= 0) {
                    return NextResponse.json({ error: "Amount required" }, { status: 400 });
                }

                if (isMultiChoice) {
                    // Multi-choice buy - use correct logic based on shouldAnswersSumToOne
                    if (market.shouldAnswersSumToOne !== false) {
                        // Dependent: probabilities must sum to 100%
                        const result = executeSandboxMultiArbitrageBuy(market, currentUser, answerId, amount);
                        console.log('[Trade] MULTI-CHOICE BUY (DEPENDENT):', {
                            answerId,
                            shares: result.shares,
                            cost: amount,
                            probAfter: result.probAfter
                        });
                    } else {
                        // Independent: each answer is separate
                        const { executeSandboxAnswerBuy } = await import("@/lib/sandbox");
                        const result = executeSandboxAnswerBuy(market, currentUser, answerId, amount);
                        console.log('[Trade] MULTI-CHOICE BUY (INDEPENDENT):', {
                            answerId,
                            shares: result.shares,
                            cost: amount,
                            probAfter: result.probAfter
                        });
                    }
                } else {
                    // Binary buy
                    const normalizedOutcome: Outcome = String(outcome).toUpperCase() === "YES" ? "YES" : "NO";
                    const result = executeSandboxBuy(market, currentUser, normalizedOutcome, amount);
                    console.log('[Trade] BINARY BUY:', {
                        outcome: normalizedOutcome,
                        shares: result.shares,
                        cost: amount,
                        probAfter: result.probAfter
                    });
                }

            } else {
                // SELL
                const sharesToSell = parseFloat(qty) || 0;
                if (sharesToSell <= 0) {
                    return NextResponse.json({ error: "Quantity required for sell" }, { status: 400 });
                }

                if (isMultiChoice) {
                    // Multi-choice sell
                    const result = executeSandboxAnswerSell(market, currentUser, answerId, sharesToSell);
                    console.log('[Trade] MULTI-CHOICE SELL:', {
                        answerId,
                        shares: sharesToSell,
                        payout: result.payout,
                        probAfter: result.probAfter
                    });
                } else {
                    // Binary sell
                    const normalizedOutcome: Outcome = String(outcome).toUpperCase() === "YES" ? "YES" : "NO";
                    const result = executeSandboxSell(market, currentUser, normalizedOutcome, sharesToSell);
                    console.log('[Trade] BINARY SELL:', {
                        outcome: normalizedOutcome,
                        shares: sharesToSell,
                        payout: result.payout,
                        probAfter: result.probAfter
                    });
                }
            }
        } catch (tradeError: any) {
            return NextResponse.json({ error: tradeError.message }, { status: 400 });
        }

        // Check for graduation completion (graduating -> main)
        updateMarketPhase(market);

        // Write back updated state
        sandboxMarkets.set(id, market);
        sandboxUsers.set(user, currentUser);

        // Build response
        const currentPrices = getProbability(market);

        // Log graduation status
        if (market.phase === 'graduating') {
            console.log(`[Graduation] Market ${id} is graduating! Volume: $${market.volume}`);
        } else if (market.volume >= GRADUATION_VOLUME_THRESHOLD * 0.8) {
            console.log(`[Graduation] Market ${id} near threshold: $${market.volume}/$${GRADUATION_VOLUME_THRESHOLD}`);
        }

        return NextResponse.json({
            market,
            position: currentUser.positions,
            currentPrices,
            userCash: currentUser.cash,
            // Graduation info
            phase: market.phase,
            volume: market.volume,
            graduationThreshold: GRADUATION_VOLUME_THRESHOLD,
            graduationProgress: Math.min(100, (market.volume / GRADUATION_VOLUME_THRESHOLD) * 100)
        });

    } catch (e) {
        console.error("Trade error:", e);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
