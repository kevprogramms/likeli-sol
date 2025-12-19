// app/api/manifold/resolve/route.ts
// Resolve Market API

import { NextResponse, NextRequest } from "next/server";
import { resolveMarket, canResolve } from "@/lib/manifold";

/**
 * POST /api/manifold/resolve - Resolve a market
 * 
 * Request body:
 * {
 *   contractId: string,
 *   resolution: 'YES' | 'NO' | 'MKT' | 'CANCEL',
 *   probability?: number,  // For MKT resolution (0-1)
 *   userId: string,
 *   answerId?: string  // For multi-choice
 * }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const {
            contractId,
            resolution,
            probability,
            userId = 'demo-user',
            answerId
        } = body;

        // Validate required fields
        if (!contractId) {
            return NextResponse.json({ error: 'contractId is required' }, { status: 400 });
        }
        if (!resolution || !['YES', 'NO', 'MKT', 'CANCEL'].includes(resolution)) {
            return NextResponse.json({ error: 'resolution must be YES, NO, MKT, or CANCEL' }, { status: 400 });
        }

        // Check if user can resolve
        if (!canResolve(contractId, userId)) {
            return NextResponse.json({ error: 'Only creator can resolve' }, { status: 403 });
        }

        // Resolve the market
        const result = resolveMarket({
            contractId,
            resolution,
            resolutionProbability: probability,
            resolverId: userId,
            answerId
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            payouts: result.payouts
        });
    } catch (error) {
        console.error('POST /api/manifold/resolve error:', error);
        return NextResponse.json({ error: 'Failed to resolve market' }, { status: 500 });
    }
}
