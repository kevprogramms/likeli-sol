// app/api/oracle/propose/route.ts
// Trigger oracle proposal for a market

import { NextResponse, NextRequest } from "next/server";
import { getContract, saveContract } from "@/lib/manifold/store";
import { createProposal, isDeadlinePassed } from "@/lib/oracle/agent";

/**
 * POST /api/oracle/propose
 * Trigger the oracle to propose a resolution for a market
 * 
 * Body: { contractId: string }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { contractId } = body;

        if (!contractId) {
            return NextResponse.json({ error: 'contractId required' }, { status: 400 });
        }

        // Get contract
        const contract = getContract(contractId);
        if (!contract) {
            return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
        }

        // Check if already resolved
        if (contract.resolution) {
            return NextResponse.json({ error: 'Already resolved' }, { status: 400 });
        }

        // Check if has resolution source
        if (!contract.resolutionSource) {
            return NextResponse.json({
                error: 'No resolution source configured for this market'
            }, { status: 400 });
        }

        // Check if deadline passed (optional - can propose before for testing)
        // if (!isDeadlinePassed(contract.resolutionSource.deadline)) {
        //     return NextResponse.json({ 
        //         error: 'Deadline not yet passed' 
        //     }, { status: 400 });
        // }

        // Check if already has a proposal
        if (contract.oracleProposal) {
            return NextResponse.json({
                error: 'Already has a proposal',
                oracleStatus: contract.oracleStatus,
                proposal: contract.oracleProposal
            }, { status: 400 });
        }

        // Create proposal
        const result = await createProposal(contract.resolutionSource);

        if (!result.success || !result.proposal) {
            return NextResponse.json({
                error: result.error || 'Failed to create proposal'
            }, { status: 500 });
        }

        // Save proposal to contract
        contract.oracleProposal = result.proposal;
        contract.oracleStatus = 'PROVISIONAL';
        saveContract(contract);

        console.log(`[Oracle] Proposed ${result.proposal.resolution} for ${contractId}`);

        return NextResponse.json({
            success: true,
            proposal: result.proposal,
            oracleStatus: contract.oracleStatus,
            message: `Proposed resolution: ${result.proposal.resolution}. Challenge window ends at ${new Date(result.proposal.challengeWindowEnd).toISOString()}`
        });

    } catch (error) {
        console.error('POST /api/oracle/propose error:', error);
        return NextResponse.json({ error: 'Failed to propose' }, { status: 500 });
    }
}
