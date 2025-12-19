// app/api/manifold/markets/route.ts
// Create & List Markets API

import { NextResponse, NextRequest } from "next/server";
import { createMarket, getAllContracts, validateAnswers, saveContract } from "@/lib/manifold";
import { checkGraduationComplete, GRADUATION_TIMER_MS } from "@/lib/graduation";

/**
 * GET /api/manifold/markets - List all markets
 */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const outcomeType = url.searchParams.get('outcomeType');

        let markets = getAllContracts();

        // Check for graduation completions on all graduating markets
        markets.forEach(market => {
            if (checkGraduationComplete(market.phase, market.graduationStartTime)) {
                market.phase = 'main';
                console.log(`[Graduation] Market ${market.id} graduated to main!`);
                saveContract(market);
            }
        });

        // Re-fetch to get updated state
        markets = getAllContracts();

        // Filter by outcome type if specified
        if (outcomeType) {
            markets = markets.filter(m => m.outcomeType === outcomeType);
        }

        // Sort by created time descending
        markets.sort((a, b) => b.createdTime - a.createdTime);

        return NextResponse.json({ markets });
    } catch (error) {
        console.error('GET /api/manifold/markets error:', error);
        return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 });
    }
}

/**
 * POST /api/manifold/markets - Create a new market
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const {
            question,
            description,
            closeTime,
            initialProb = 0.5,
            ante = 100,
            outcomeType = 'BINARY',
            answers,
            shouldAnswersSumToOne = true, // Default to dependent (sum to 100%)
            category = 'General',
            rules = '',
            userId = 'demo-user',
            resolutionSource  // Oracle configuration
        } = body;

        // Validate and clean answers for multi-choice
        const cleanedAnswers = outcomeType === 'MULTIPLE_CHOICE' && answers
            ? validateAnswers(answers)
            : undefined;

        const result = createMarket({
            question,
            description,
            closeTime,
            initialProb,
            ante,
            outcomeType,
            answers: cleanedAnswers,
            shouldAnswersSumToOne: outcomeType === 'MULTIPLE_CHOICE' ? shouldAnswersSumToOne : undefined,
            category,
            rules,
            creatorId: userId
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        // Add oracle configuration if provided
        if (resolutionSource && result.contract) {
            result.contract.resolutionSource = resolutionSource;
            result.contract.oracleStatus = 'UNRESOLVED';
            saveContract(result.contract);
        }

        return NextResponse.json({
            success: true,
            market: result.contract,
            newBalance: result.newBalance
        });
    } catch (error) {
        console.error('POST /api/manifold/markets error:', error);
        return NextResponse.json({ error: 'Failed to create market' }, { status: 500 });
    }
}
