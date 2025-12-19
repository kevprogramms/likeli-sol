// app/api/oracle/finalize/route.ts
// Finalize a market resolution after challenge window

import { NextResponse, NextRequest } from "next/server";
import { getContract, saveContract } from "@/lib/manifold/store";
import { resolveMarket } from "@/lib/manifold/resolve-market";
import { isChallengeWindowExpired } from "@/lib/oracle/agent";
import { resolveDispute, didChallengerWin } from "@/lib/oracle/challenge";
import { Resolution } from "@/lib/manifold/types";

/**
 * POST /api/oracle/finalize
 * Finalize a market after challenge window closes (or resolve a dispute)
 * 
 * Body: { 
 *   contractId: string,
 *   // For dispute resolution:
 *   finalResolution?: Resolution,  // Override resolution (only for disputes)
 *   resolverId?: string            // Who is resolving the dispute
 * }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { contractId, finalResolution, resolverId } = body;

        if (!contractId) {
            return NextResponse.json({ error: 'contractId required' }, { status: 400 });
        }

        // Get contract
        const contract = getContract(contractId);
        if (!contract) {
            return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
        }

        // Already finalized?
        if (contract.resolution) {
            return NextResponse.json({
                error: 'Already finalized',
                resolution: contract.resolution
            }, { status: 400 });
        }

        // Handle CHALLENGED status (dispute resolution)
        if (contract.oracleStatus === 'CHALLENGED') {
            if (!finalResolution) {
                return NextResponse.json({
                    error: 'finalResolution required for disputed markets'
                }, { status: 400 });
            }

            if (!contract.oracleProposal || !contract.oracleChallenge) {
                return NextResponse.json({ error: 'Invalid dispute state' }, { status: 400 });
            }

            // Did challenger win?
            const challengerWins = didChallengerWin(
                contract.oracleProposal.resolution,
                finalResolution
            );

            // Handle dispute payout
            const disputeResult = resolveDispute(
                contract.oracleChallenge,
                contract.oracleProposal.resolution,
                finalResolution,
                challengerWins
            );

            // Resolve market with final resolution
            const resolveResult = resolveMarket({
                contractId,
                resolution: finalResolution,
                resolverId: resolverId || 'oracle-admin'
            });

            if (!resolveResult.success) {
                return NextResponse.json({
                    error: resolveResult.error
                }, { status: 500 });
            }

            // Update oracle status
            contract.oracleStatus = 'FINALIZED';
            saveContract(contract);

            return NextResponse.json({
                success: true,
                resolution: finalResolution,
                message: disputeResult.message,
                challengerWins,
                payoutsCount: resolveResult.payouts?.length || 0
            });
        }

        // Handle PROVISIONAL status (auto-finalize after window)
        if (contract.oracleStatus === 'PROVISIONAL') {
            if (!contract.oracleProposal) {
                return NextResponse.json({ error: 'No proposal' }, { status: 400 });
            }

            // Check if window expired
            if (!isChallengeWindowExpired(contract.oracleProposal.challengeWindowEnd)) {
                const remaining = contract.oracleProposal.challengeWindowEnd - Date.now();
                return NextResponse.json({
                    error: `Challenge window still open. ${Math.ceil(remaining / 1000)}s remaining`
                }, { status: 400 });
            }

            // No challenge, finalize with proposal
            const resolveResult = resolveMarket({
                contractId,
                resolution: contract.oracleProposal.resolution,
                resolverId: 'oracle-auto'
            });

            if (!resolveResult.success) {
                return NextResponse.json({
                    error: resolveResult.error
                }, { status: 500 });
            }

            // Update oracle status
            contract.oracleStatus = 'FINALIZED';
            saveContract(contract);

            console.log(`[Oracle] Finalized ${contractId} as ${contract.oracleProposal.resolution}`);

            return NextResponse.json({
                success: true,
                resolution: contract.oracleProposal.resolution,
                message: 'Market finalized. No challenge received.',
                payoutsCount: resolveResult.payouts?.length || 0
            });
        }

        return NextResponse.json({
            error: `Cannot finalize. Status: ${contract.oracleStatus || 'unknown'}`
        }, { status: 400 });

    } catch (error) {
        console.error('POST /api/oracle/finalize error:', error);
        return NextResponse.json({ error: 'Failed to finalize' }, { status: 500 });
    }
}
