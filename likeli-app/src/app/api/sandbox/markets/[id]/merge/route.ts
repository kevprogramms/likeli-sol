import { NextRequest, NextResponse } from "next/server";
import {
    sandboxMarkets,
    sandboxUsers,
    executeSandboxMerge
} from "@/lib/sandbox";

/**
 * POST /api/sandbox/markets/[id]/merge
 * 
 * Merge YES+NO tokens back to collateral (Polymarket-style NegRisk)
 * 
 * Body:
 * - answerId: string - The answer to merge for
 * - amount: number - Amount of YES+NO tokens to merge
 * - userId: string (optional, default "demo-user")
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const market = sandboxMarkets.get(id);

        if (!market) {
            return NextResponse.json({ error: "Market not found" }, { status: 404 });
        }

        if (market.resolution) {
            return NextResponse.json({ error: "Market is resolved" }, { status: 400 });
        }

        const body = await req.json();
        const { answerId, amount, userId } = body;
        const user = userId || "demo-user";

        if (!answerId) {
            return NextResponse.json({ error: "answerId required" }, { status: 400 });
        }

        const amountNum = parseFloat(amount);
        if (!amountNum || amountNum <= 0) {
            return NextResponse.json({ error: "Valid amount required" }, { status: 400 });
        }

        // Initialize user if not exists
        if (!sandboxUsers.has(user)) {
            sandboxUsers.set(user, { id: user, cash: 10000, positions: {} });
        }
        const currentUser = sandboxUsers.get(user)!;

        try {
            const result = executeSandboxMerge(market, currentUser, answerId, amountNum);

            // Persist state
            sandboxMarkets.set(id, market);
            sandboxUsers.set(user, currentUser);

            return NextResponse.json({
                success: true,
                collateral: result.collateral,
                userCash: currentUser.cash,
                positions: currentUser.positions
            });
        } catch (mergeError: any) {
            return NextResponse.json({ error: mergeError.message }, { status: 400 });
        }

    } catch (e) {
        console.error("Merge error:", e);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
