// app/api/manifold/bet/route.ts
// Place Bet API - 100% Manifold Match

import { NextResponse, NextRequest } from "next/server";
import { placeBet, getContract, getCpmmProbability, getOrCreateUser, saveContract } from "@/lib/manifold";
import { checkGraduationComplete } from "@/lib/graduation";

/**
 * POST /api/manifold/bet - Place a bet
 * 
 * Request body:
 * {
 *   contractId: string,
 *   amount: number,
 *   outcome: 'YES' | 'NO',
 *   userId: string,
 *   answerId?: string  // For multi-choice
 * }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const {
            contractId,
            amount,
            outcome,
            userId = 'demo-user',
            answerId
        } = body;

        // Validate required fields
        if (!contractId) {
            return NextResponse.json({ error: 'contractId is required' }, { status: 400 });
        }
        if (!amount || amount <= 0) {
            return NextResponse.json({ error: 'amount must be positive' }, { status: 400 });
        }
        if (!outcome || !['YES', 'NO'].includes(outcome)) {
            return NextResponse.json({ error: 'outcome must be YES or NO' }, { status: 400 });
        }

        // Place the bet
        const result = placeBet({
            contractId,
            amount: Number(amount),
            outcome: outcome as 'YES' | 'NO',
            userId,
            answerId
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        // Get updated contract state
        const contract = getContract(contractId);
        const user = getOrCreateUser(userId);

        // Check for graduation completion (graduating -> main)
        if (contract && checkGraduationComplete(contract.phase, contract.graduationStartTime)) {
            contract.phase = 'main';
            console.log(`[Graduation] Market ${contract.id} graduated to main!`);
            saveContract(contract);
        }

        // DEBUG: Include all answer probabilities in response for multi-choice
        let allAnswerProbs: { id: string; text: string; prob: number }[] | undefined;
        if (contract?.outcomeType === 'MULTIPLE_CHOICE' && contract.answers) {
            allAnswerProbs = contract.answers.map(a => ({
                id: a.id,
                text: a.text.slice(0, 30),
                prob: Math.round(a.prob * 100)
            }));
            const probSum = contract.answers.reduce((s, a) => s + a.prob, 0);
            console.log('[BetRoute] Final answer probs:', allAnswerProbs, 'Sum:', probSum.toFixed(4));
        }

        return NextResponse.json({
            success: true,
            bet: result.bet,
            shares: result.shares,
            probBefore: result.probBefore,
            probAfter: result.probAfter,
            newBalance: user.balance,
            currentProbability: contract ? getCpmmProbability(contract.pool as unknown as { [outcome: string]: number }, contract.p ?? 0.5) : result.probAfter,
            phase: contract?.phase,
            redemptionBets: result.redemptionBets,
            // DEBUG: Include for visibility
            allAnswerProbs
        });
    } catch (error) {
        console.error('POST /api/manifold/bet error:', error);
        return NextResponse.json({ error: 'Failed to place bet' }, { status: 500 });
    }
}
