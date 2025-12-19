// lib/manifold/bonuses.ts
// Bonus Systems - Unique Bettor Bonus & Betting Streaks

import { generateId } from './cpmm';
import { Contract, Bet, User } from './types';
import { getOrCreateUser, updateUserBalance, getBets } from './store';

// ============================================
// CONFIGURATION
// ============================================

/** Bonus paid to market creator when a new bettor joins */
export const UNIQUE_BETTOR_BONUS_AMOUNT = 5;  // $5 per unique bettor

/** Bonus amounts for betting streaks by day */
export const STREAK_BONUS_AMOUNTS = [0, 3, 5, 10, 15, 20, 25, 30, 35, 40];

// ============================================
// UNIQUE BETTOR BONUS
// ============================================

export interface UniqueBettorBonusResult {
    paid: boolean;
    creatorId?: string;
    amount?: number;
    bettorId?: string;
}

/**
 * Check if this is a new bettor on the market and pay bonus to creator.
 * Called after every bet placement.
 */
export function checkAndPayUniqueBettorBonus(
    contract: Contract,
    userId: string,
    bet: Bet
): UniqueBettorBonusResult {
    // Skip if market creator is betting on their own market
    if (userId === contract.creatorId) {
        return { paid: false };
    }

    // Skip redemption bets
    if (bet.isRedemption) {
        return { paid: false };
    }

    // Check if user has bet on this contract before
    const existingBets = getBets(contract.id);
    const userPreviousBets = existingBets.filter(
        (b: Bet) => b.userId === userId && b.id !== bet.id && !b.isRedemption
    );

    // If they have previous bets, not a unique bettor
    if (userPreviousBets.length > 0) {
        return { paid: false };
    }

    // This is a unique new bettor! Pay the bonus to creator
    const bonusAmount = UNIQUE_BETTOR_BONUS_AMOUNT;

    // Update creator's balance
    updateUserBalance(contract.creatorId, bonusAmount);

    // Update contract's unique bettor count
    contract.uniqueBettorCount = (contract.uniqueBettorCount || 0) + 1;

    console.log(`[Bonus] Paid $${bonusAmount} to creator ${contract.creatorId} for new bettor ${userId}`);

    return {
        paid: true,
        creatorId: contract.creatorId,
        amount: bonusAmount,
        bettorId: userId
    };
}

// ============================================
// BETTING STREAK SYSTEM
// ============================================

export interface StreakResult {
    updated: boolean;
    newStreak?: number;
    bonusAmount?: number;
}

/**
 * Check and update user's betting streak.
 * Awards bonus based on streak length.
 */
export function checkAndUpdateBettingStreak(
    user: User,
    bet: Bet
): StreakResult {
    // Skip redemption bets
    if (bet.isRedemption) {
        return { updated: false };
    }

    const now = Date.now();
    const lastBetTime = user.lastBetTime ?? 0;
    const currentStreak = user.currentBettingStreak ?? 0;

    // Check if this is a new day (UTC)
    const lastBetDay = new Date(lastBetTime).toISOString().split('T')[0];
    const todayDay = new Date(now).toISOString().split('T')[0];

    if (lastBetDay === todayDay) {
        // Already bet today, no streak update needed
        return { updated: false };
    }

    // Calculate new streak
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    let newStreak: number;

    if (lastBetDay === yesterday) {
        // Bet yesterday, increment streak
        newStreak = currentStreak + 1;
    } else {
        // Streak broken, start over
        newStreak = 1;
    }

    // Update user's streak data
    user.currentBettingStreak = newStreak;
    user.lastBetTime = now;

    // Calculate streak bonus
    const bonusIndex = Math.min(newStreak, STREAK_BONUS_AMOUNTS.length - 1);
    const bonusAmount = STREAK_BONUS_AMOUNTS[bonusIndex];

    if (bonusAmount > 0) {
        updateUserBalance(user.id, bonusAmount);
        console.log(`[Streak] Day ${newStreak} streak bonus: $${bonusAmount} to ${user.id}`);
    }

    return {
        updated: true,
        newStreak,
        bonusAmount
    };
}
