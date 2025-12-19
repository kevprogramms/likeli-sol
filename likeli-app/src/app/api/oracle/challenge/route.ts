// app/api/oracle/challenge/route.ts
// Challenge a provisional resolution

import { NextResponse, NextRequest } from "next/server";
import { getContract, saveContract } from "@/lib/manifold/store";
import { submitChallenge } from "@/lib/oracle/challenge";

/**
 * POST /api/oracle/challenge
 * Submit a challenge against a provisional resolution
 * 
 * Body: { 
 *   contractId: string, 
 *   challengerId: string (userId),
 *   reason: string 
 * }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { contractId, challengerId, reason } = body;

        if (!contractId) {
            return NextResponse.json({ error: 'contractId required' }, { status: 400 });
        }
        if (!challengerId) {
            return NextResponse.json({ error: 'challengerId required' }, { status: 400 });
        }
        if (!reason || reason.trim().length === 0) {
            return NextResponse.json({ error: 'reason required' }, { status: 400 });
        }

        // Get contract
        const contract = getContract(contractId);
        if (!contract) {
            return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
        }

        // Check status
        if (contract.oracleStatus !== 'PROVISIONAL') {
            return NextResponse.json({
                error: `Cannot challenge. Current status: ${contract.oracleStatus || 'no proposal'}`
            }, { status: 400 });
        }

        if (!contract.oracleProposal) {
            return NextResponse.json({ error: 'No proposal to challenge' }, { status: 400 });
        }

        // Submit challenge
        const result = submitChallenge(
            challengerId,
            reason.trim(),
            contract.oracleStatus,
            contract.oracleProposal.challengeWindowEnd
        );

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        // Update contract
        contract.oracleChallenge = result.challenge;
        contract.oracleStatus = 'CHALLENGED';
        saveContract(contract);

        console.log(`[Oracle] Challenge received for ${contractId} by ${challengerId}`);

        return NextResponse.json({
            success: true,
            message: 'Challenge submitted. Market is now in dispute.',
            challenge: result.challenge,
            oracleStatus: contract.oracleStatus
        });

    } catch (error) {
        console.error('POST /api/oracle/challenge error:', error);
        return NextResponse.json({ error: 'Failed to challenge' }, { status: 500 });
    }
}
