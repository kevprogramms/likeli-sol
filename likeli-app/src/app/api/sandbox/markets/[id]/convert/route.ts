import { NextRequest, NextResponse } from "next/server";
import {
    sandboxMarkets,
    sandboxUsers,
    executeSandboxConvert
} from "@/lib/sandbox";

/**
 * POST /api/sandbox/markets/[id]/convert
 * 
 * Convert NO positions to YES + cash (Polymarket-style NegRisk)
 * Only works for one-winner markets (shouldAnswersSumToOne = true)
 * 
 * Body:
 * - indexSet: number - Bitmask of which answers to convert NO from
 * - amount: number - Amount of NO shares to convert from each position
 * - userId: string (optional, default "demo-user")
 * 
 * Example: For a 3-answer market, indexSet=5 (binary: 101) converts NO from answers 0 and 2
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

        if (!market.shouldAnswersSumToOne) {
            return NextResponse.json({
                error: "Convert only works for one-winner (NegRisk) markets"
            }, { status: 400 });
        }

        const body = await req.json();
        const { indexSet, amount, userId } = body;
        const user = userId || "demo-user";

        if (typeof indexSet !== 'number' || indexSet <= 0) {
            return NextResponse.json({ error: "Valid indexSet (bitmask) required" }, { status: 400 });
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
            const result = executeSandboxConvert(market, currentUser, indexSet, amountNum);

            // Persist state
            sandboxMarkets.set(id, market);
            sandboxUsers.set(user, currentUser);

            return NextResponse.json({
                success: true,
                collateralOut: result.collateralOut,
                yesSharesMinted: result.yesSharesMinted,
                userCash: currentUser.cash,
                positions: currentUser.positions
            });
        } catch (convertError: any) {
            return NextResponse.json({ error: convertError.message }, { status: 400 });
        }

    } catch (e) {
        console.error("Convert error:", e);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
