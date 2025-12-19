// lib/oracle/challenge.ts
// Challenge and dispute resolution logic

import { OracleChallenge, ChallengeResult, FinalizeResult } from './types';
import { CHALLENGE_BOND, CHALLENGER_REWARD_RATIO } from './config';
import { Resolution } from '@/lib/manifold/types';
import { getOrCreateUser, updateUserBalance } from '@/lib/manifold/store';

/**
 * Submit a challenge against a provisional resolution
 */
export function submitChallenge(
    challengerId: string,
    reason: string,
    currentStatus: string,
    challengeWindowEnd: number
): ChallengeResult & { challenge?: OracleChallenge } {
    // Validate status
    if (currentStatus !== 'PROVISIONAL') {
        return {
            success: false,
            error: 'Market is not in provisional state'
        };
    }

    // Validate challenge window
    if (Date.now() > challengeWindowEnd) {
        return {
            success: false,
            error: 'Challenge window has closed'
        };
    }

    // Check user balance for bond
    const user = getOrCreateUser(challengerId);
    if (!user) {
        return {
            success: false,
            error: 'User not found'
        };
    }

    if (user.balance < CHALLENGE_BOND) {
        return {
            success: false,
            error: `Insufficient balance. Need $${CHALLENGE_BOND} bond, have $${user.balance.toFixed(2)}`
        };
    }

    // Deduct bond from challenger
    updateUserBalance(challengerId, -CHALLENGE_BOND);

    // Create challenge record
    const challenge: OracleChallenge = {
        challengerId,
        bondAmount: CHALLENGE_BOND,
        reason,
        challengedAt: Date.now()
    };

    console.log(`[Oracle] Challenge submitted by ${challengerId}: "${reason}"`);

    return {
        success: true,
        challenge
    };
}

/**
 * Resolve a disputed market
 * Called by an admin/resolver after a challenge
 */
export function resolveDispute(
    challenge: OracleChallenge,
    proposedResolution: Resolution,
    finalResolution: Resolution,
    challengerWins: boolean
): { payout: number; message: string } {
    if (challengerWins) {
        // Challenger was right - refund bond + bonus
        const bonus = challenge.bondAmount * CHALLENGER_REWARD_RATIO;
        const totalPayout = challenge.bondAmount + bonus;

        updateUserBalance(challenge.challengerId, totalPayout);

        console.log(`[Oracle] Challenger ${challenge.challengerId} wins! Payout: $${totalPayout}`);

        return {
            payout: totalPayout,
            message: `Challenge successful! Bond returned ($${challenge.bondAmount}) + bonus ($${bonus.toFixed(2)})`
        };
    } else {
        // Challenger was wrong - bond is lost (burned or kept by protocol)
        console.log(`[Oracle] Challenger ${challenge.challengerId} loses bond of $${challenge.bondAmount}`);

        return {
            payout: 0,
            message: `Challenge failed. Bond of $${challenge.bondAmount} forfeited.`
        };
    }
}

/**
 * Check if a resolution matches the proposal
 */
export function didChallengerWin(
    proposedResolution: Resolution,
    finalResolution: Resolution
): boolean {
    // Challenger wins if the final resolution differs from the proposal
    return proposedResolution !== finalResolution;
}
