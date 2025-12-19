// app/api/oracle/check/route.ts
// Check and process pending markets (cron-like endpoint)

import { NextResponse, NextRequest } from "next/server";
import { getAllContracts, saveContract } from "@/lib/manifold/store";
import { createProposal, isDeadlinePassed, isChallengeWindowExpired } from "@/lib/oracle/agent";
import { resolveMarket } from "@/lib/manifold/resolve-market";

/**
 * GET /api/oracle/check
 * Check all markets for pending oracle actions
 * This would be called by a cron job in production
 */
export async function GET() {
    try {
        const contracts = getAllContracts();
        const results = {
            checked: 0,
            proposed: 0,
            finalized: 0,
            errors: 0,
            details: [] as { id: string; action: string; result: string }[]
        };

        for (const contract of contracts) {
            // Skip already resolved
            if (contract.resolution) continue;

            // Skip without resolution source
            if (!contract.resolutionSource) continue;

            results.checked++;

            // Case 1: Deadline passed, no proposal yet
            if (!contract.oracleProposal && isDeadlinePassed(contract.resolutionSource.deadline)) {
                try {
                    const proposalResult = await createProposal(contract.resolutionSource);
                    if (proposalResult.success && proposalResult.proposal) {
                        contract.oracleProposal = proposalResult.proposal;
                        contract.oracleStatus = 'PROVISIONAL';
                        saveContract(contract);
                        results.proposed++;
                        results.details.push({
                            id: contract.id,
                            action: 'propose',
                            result: `Proposed ${proposalResult.proposal.resolution}`
                        });
                    }
                } catch (e) {
                    results.errors++;
                }
            }

            // Case 2: Has proposal, window expired, not challenged
            if (
                contract.oracleStatus === 'PROVISIONAL' &&
                contract.oracleProposal &&
                isChallengeWindowExpired(contract.oracleProposal.challengeWindowEnd)
            ) {
                try {
                    const resolution = contract.oracleProposal.resolution;
                    resolveMarket({
                        contractId: contract.id,
                        resolution,
                        resolverId: 'oracle-auto'
                    });
                    contract.oracleStatus = 'FINALIZED';
                    saveContract(contract);
                    results.finalized++;
                    results.details.push({
                        id: contract.id,
                        action: 'finalize',
                        result: `Finalized as ${resolution}`
                    });
                } catch (e) {
                    results.errors++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            ...results,
            message: `Checked ${results.checked} markets, proposed ${results.proposed}, finalized ${results.finalized}`
        });

    } catch (error) {
        console.error('GET /api/oracle/check error:', error);
        return NextResponse.json({ error: 'Failed to check' }, { status: 500 });
    }
}
