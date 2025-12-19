import { NextRequest, NextResponse } from "next/server";
import { sandboxMarkets, getProbability, updateMarketPhase } from "@/lib/sandbox";
import {
    GRADUATION_VOLUME_THRESHOLD,
    GRADUATION_TIMER_MS,
    getGraduationTimeRemaining,
    formatTimeRemaining,
    getGraduationProgress
} from "@/lib/graduation";

/**
 * GET /api/sandbox/markets/[id]
 * 
 * Get a single sandbox market with full details
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const market = sandboxMarkets.get(id);

    if (!market) {
        return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    // Check for phase updates
    updateMarketPhase(market);
    sandboxMarkets.set(id, market);

    const currentPrices = getProbability(market);

    // Build graduation info
    const graduationInfo = {
        phase: market.phase,
        volume: market.volume,
        volumeThreshold: GRADUATION_VOLUME_THRESHOLD,
        volumeProgress: Math.min(100, (market.volume / GRADUATION_VOLUME_THRESHOLD) * 100),

        // For graduating markets
        ...(market.phase === 'graduating' && market.graduationStartTime ? {
            graduationStartTime: market.graduationStartTime,
            timeRemainingMs: getGraduationTimeRemaining(market.graduationStartTime),
            timeRemainingFormatted: formatTimeRemaining(getGraduationTimeRemaining(market.graduationStartTime)),
            graduationProgress: getGraduationProgress(market.graduationStartTime),
            totalGraduationTimeMs: GRADUATION_TIMER_MS
        } : {})
    };

    return NextResponse.json({
        ...market,
        currentPrices,
        graduationInfo
    });
}
