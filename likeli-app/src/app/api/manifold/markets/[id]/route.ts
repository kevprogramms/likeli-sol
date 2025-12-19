// app/api/manifold/markets/[id]/route.ts
// Get single market API

import { NextResponse, NextRequest } from "next/server";
import { getContract, getCpmmProbability, getPriceHistory, saveContract } from "@/lib/manifold";
import { getAnswerPricePoints } from "@/lib/manifold/store";
import { checkGraduationComplete } from "@/lib/graduation";

/**
 * GET /api/manifold/markets/[id] - Get market details
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const contract = getContract(id);
        if (!contract) {
            return NextResponse.json({ error: 'Market not found' }, { status: 404 });
        }

        // Check for graduation completion
        if (checkGraduationComplete(contract.phase, contract.graduationStartTime)) {
            contract.phase = 'main';
            console.log(`[Graduation] Market ${contract.id} graduated to main!`);
            saveContract(contract);
        }

        // Get price history for chart (binary markets)
        const priceHistory = getPriceHistory(id);

        // Get per-answer price history (for multi-outcome charts)
        const answerPriceHistory: { [answerId: string]: { timestamp: number; prob: number }[] } = {};
        if (contract.answers) {
            for (const answer of contract.answers) {
                const history = getAnswerPricePoints(id, answer.id);
                // Add initial point if no history exists
                if (history.length === 0) {
                    answerPriceHistory[answer.id] = [{
                        timestamp: contract.createdTime,
                        prob: answer.prob
                    }];
                } else {
                    answerPriceHistory[answer.id] = history.map(p => ({
                        timestamp: p.timestamp,
                        prob: p.probability
                    }));
                }
            }
        }

        // Calculate current probability
        const probability = getCpmmProbability(contract.pool as unknown as { [outcome: string]: number }, contract.p ?? 0.5);

        return NextResponse.json({
            ...contract,
            probability,
            priceHistory: priceHistory.map(p => ({
                timestamp: p.timestamp,
                yesPrice: p.probability,
                noPrice: 1 - p.probability,
                probYes: p.probability,
                probNo: 1 - p.probability
            })),
            answerPriceHistory
        });
    } catch (error) {
        console.error('GET /api/manifold/markets/[id] error:', error);
        return NextResponse.json({ error: 'Failed to fetch market' }, { status: 500 });
    }
}
