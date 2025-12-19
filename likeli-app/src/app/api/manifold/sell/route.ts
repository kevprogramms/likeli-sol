// app/api/manifold/sell/route.ts
// Sell Shares API - 100% Manifold Match

import { NextResponse, NextRequest } from "next/server";
import { sellShares, getSellableShares, getContract, getCpmmProbability, getOrCreateUser } from "@/lib/manifold";

/**
 * POST /api/manifold/sell - Sell shares
 * 
 * Request body:
 * {
 *   contractId: string,
 *   outcome: 'YES' | 'NO',
 *   shares?: number,  // If undefined, sell all
 *   userId: string,
 *   answerId?: string  // For multi-choice
 * }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const {
            contractId,
            outcome,
            shares,
            userId = 'demo-user',
            answerId
        } = body;

        // Validate required fields
        if (!contractId) {
            return NextResponse.json({ error: 'contractId is required' }, { status: 400 });
        }
        if (!outcome || !['YES', 'NO'].includes(outcome)) {
            return NextResponse.json({ error: 'outcome must be YES or NO' }, { status: 400 });
        }

        // Sell the shares
        const result = sellShares({
            contractId,
            outcome: outcome as 'YES' | 'NO',
            shares: shares ? Number(shares) : undefined,
            userId,
            answerId
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        // Get updated contract state
        const contract = getContract(contractId);
        const user = getOrCreateUser(userId);

        return NextResponse.json({
            success: true,
            bet: result.bet,
            payout: result.payout,
            probBefore: result.probBefore,
            probAfter: result.probAfter,
            newBalance: user.balance,
            currentProbability: contract ? getCpmmProbability(contract.pool as unknown as { [outcome: string]: number }, 0.5) : result.probAfter
        });
    } catch (error) {
        console.error('POST /api/manifold/sell error:', error);
        return NextResponse.json({ error: 'Failed to sell shares' }, { status: 500 });
    }
}

/**
 * GET /api/manifold/sell - Get sellable shares
 */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const contractId = url.searchParams.get('contractId');
        const userId = url.searchParams.get('userId') || 'demo-user';
        const answerId = url.searchParams.get('answerId') || undefined;

        if (!contractId) {
            return NextResponse.json({ error: 'contractId is required' }, { status: 400 });
        }

        const shares = getSellableShares(userId, contractId, answerId);

        return NextResponse.json({
            contractId,
            userId,
            answerId,
            yesShares: shares.yesShares,
            noShares: shares.noShares
        });
    } catch (error) {
        console.error('GET /api/manifold/sell error:', error);
        return NextResponse.json({ error: 'Failed to get sellable shares' }, { status: 500 });
    }
}
