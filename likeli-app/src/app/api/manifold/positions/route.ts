// app/api/manifold/positions/route.ts
// Get user positions for a contract

import { NextResponse, NextRequest } from "next/server";
import { getOrCreateMetric } from "@/lib/manifold";

/**
 * GET /api/manifold/positions?contractId=...&userId=...
 * Returns user's share positions for a contract
 */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const contractId = url.searchParams.get('contractId');
        const userId = url.searchParams.get('userId') || 'demo-user';

        if (!contractId) {
            return NextResponse.json({ error: 'contractId required' }, { status: 400 });
        }

        // Get metric for this user/contract
        const metric = getOrCreateMetric(userId, contractId);

        return NextResponse.json({
            yesShares: metric.totalSharesYes ?? 0,
            noShares: metric.totalSharesNo ?? 0,
            invested: metric.invested ?? 0,
            profit: metric.profit ?? 0
        });
    } catch (error) {
        console.error('GET /api/manifold/positions error:', error);
        return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
    }
}
