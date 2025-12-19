import { NextRequest, NextResponse } from "next/server";
import {
    sandboxMarkets,
    createSandboxMarket,
    createMultiChoiceSandboxMarket,
    checkAllGraduations
} from "@/lib/sandbox";
import { validateAnswers, MINIMUM_ANTE } from "@/lib/graduation";

/**
 * POST /api/sandbox/markets - Create a new sandbox market
 * 
 * Body:
 * - question: string (required)
 * - category: string (optional, default "General")
 * - resolutionDate: string (optional)
 * - initialLiquidityUsd: number (required, min 100)
 * - rules: string (optional)
 * - outcomeType: "BINARY" | "MULTIPLE_CHOICE" (optional, default "BINARY")
 * - answers: string[] (required for MULTIPLE_CHOICE)
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            question,
            category,
            resolutionDate,
            initialLiquidityUsd,
            rules,
            outcomeType = "BINARY",
            answers,
            shouldAnswersSumToOne = true // Default to dependent (sum-to-one)
        } = body;

        // Validate required fields
        if (!question) {
            return NextResponse.json({ error: "Question is required" }, { status: 400 });
        }

        const baseLiquidity = parseFloat(initialLiquidityUsd) || 0;
        if (baseLiquidity < MINIMUM_ANTE) {
            return NextResponse.json({
                error: `Minimum initial liquidity is $${MINIMUM_ANTE}`
            }, { status: 400 });
        }

        let newMarket;

        if (outcomeType === "MULTIPLE_CHOICE") {
            // Validate answers for multi-choice
            if (!answers || !Array.isArray(answers)) {
                return NextResponse.json({
                    error: "Answers array is required for multi-choice markets"
                }, { status: 400 });
            }

            try {
                validateAnswers(answers);
            } catch (e: any) {
                return NextResponse.json({ error: e.message }, { status: 400 });
            }

            console.log('[API] Creating multi-choice market with shouldAnswersSumToOne:', shouldAnswersSumToOne);

            newMarket = createMultiChoiceSandboxMarket(
                question,
                category || "General",
                resolutionDate || "",
                baseLiquidity,
                answers,
                rules || "",
                "demo-user",
                shouldAnswersSumToOne // Pass the flag!
            );
        } else {
            // Create BINARY market
            newMarket = createSandboxMarket(
                question,
                category || "General",
                resolutionDate || "",
                baseLiquidity,
                rules || "",
                "demo-user"
            );
        }

        // Store market
        sandboxMarkets.set(newMarket.id, newMarket);

        return NextResponse.json(newMarket);

    } catch (e) {
        console.error("Error creating sandbox market:", e);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

/**
 * GET /api/sandbox/markets - Get all sandbox markets
 * 
 * Query params:
 * - phase: "sandbox" | "graduating" | "main" | "resolved" (optional filter)
 */
export async function GET(req: NextRequest) {
    try {
        // Check for graduation completions
        checkAllGraduations();

        const { searchParams } = new URL(req.url);
        const phaseFilter = searchParams.get("phase");

        let markets = Array.from(sandboxMarkets.values());

        // Filter by phase if specified
        if (phaseFilter) {
            markets = markets.filter(m => m.phase === phaseFilter);
        }

        // Sort by created time (newest first)
        markets.sort((a, b) => b.createdTime - a.createdTime);

        return NextResponse.json(markets);

    } catch (e) {
        console.error("Error fetching sandbox markets:", e);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
