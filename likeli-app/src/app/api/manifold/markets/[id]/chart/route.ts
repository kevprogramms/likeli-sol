// app/api/manifold/markets/[id]/chart/route.ts
// Chart Data API - Part 11 Match

import { NextResponse, NextRequest } from "next/server";
import { getFullPriceHistory, downsamplePoints, formatChartResponse } from "@/lib/manifold";

/**
 * GET /api/manifold/markets/[id]/chart - Get chart data
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const url = new URL(req.url);
        const maxPoints = parseInt(url.searchParams.get('points') ?? '500');
        const answerId = url.searchParams.get('answerId') ?? undefined;

        const history = getFullPriceHistory(id, answerId);

        // Downsample if needed
        const points = history.length > maxPoints
            ? downsamplePoints(history, maxPoints)
            : history;

        return NextResponse.json(formatChartResponse(points));
    } catch (error) {
        console.error('GET /api/manifold/markets/[id]/chart error:', error);
        return NextResponse.json({ error: 'Failed to get chart data' }, { status: 500 });
    }
}
