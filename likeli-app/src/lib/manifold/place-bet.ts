// lib/manifold/place-bet.ts
// Bet Placement Logic - 100% Manifold Match

import { Pool, Bet, Contract, Answer, CPMM_MIN_POOL_QTY } from './types';
import { calculateCpmmPurchase, getCpmmProbability, generateId } from './cpmm';
import { calculateCpmmMultiArbitrageBet } from './calculate-cpmm-arbitrage';
import { computeFills } from './calculate-cpmm';
import { noFees } from './fees';
import {
    getContract,
    saveContract,
    getOrCreateUser,
    updateUserBalance,
    addBet,
    getOrCreateMetric,
    updateMetric,
    addPricePoint,
    addAnswerPricePoint
} from './store';
import { executeRedemption, RedeemResult } from './redeem';
import { checkAndPayUniqueBettorBonus } from './bonuses';
import { checkAndFillLimitOrders } from './limit-orders';
import { getActiveLimitOrders, getBalanceByUserId, applyMakerFills, cancelOrders } from './limit-orders';

// ============================================
// PLACE BET - MAIN FUNCTION
// ============================================

export interface PlaceBetParams {
    contractId: string;
    amount: number;
    outcome: 'YES' | 'NO';
    userId: string;
    answerId?: string;  // For multi-choice
    suppressRedemption?: boolean; // If true, disable automatic netting
}

export interface PlaceBetResult {
    success: boolean;
    error?: string;
    bet?: Bet;
    shares?: number;
    probBefore?: number;
    probAfter?: number;
    newBalance?: number;
    redemptionBets?: Bet[];  // Any redemption bets created
}

/**
 * Main bet placement function
 * This is the CORE trading logic
 */
export function placeBet(params: PlaceBetParams): PlaceBetResult {
    const { contractId, amount, outcome, userId, answerId } = params;

    // 1. Validate amount
    if (amount <= 0) {
        return { success: false, error: 'Amount must be positive' };
    }

    // 2. Get user and validate balance
    const user = getOrCreateUser(userId);
    if (user.balance < amount) {
        return { success: false, error: 'Insufficient balance' };
    }

    // 3. Get contract
    const contract = getContract(contractId);
    if (!contract) {
        return { success: false, error: 'Contract not found' };
    }

    if (contract.resolution) {
        return { success: false, error: 'Market already resolved' };
    }

    // MAIN MARKETS (BINARY): full limit-order matching
    if (contract.phase === 'main' && contract.outcomeType === 'BINARY') {
        const unfilled = getActiveLimitOrders(contractId);
        const balanceByUserId = getBalanceByUserId(unfilled);

        const state = {
            pool: contract.pool,
            p: contract.p ?? 0.5,
            collectedFees: noFees
        };

        const { takers, makers, cpmmState, ordersToCancel } = computeFills(
            state,
            outcome,
            amount,
            undefined,
            unfilled,
            balanceByUserId
        );

        const totalSpent = takers.reduce((s, t) => s + t.amount, 0);
        const totalShares = takers.reduce((s, t) => s + t.shares, 0);

        const probBefore = getCpmmProbability(contract.pool, contract.p ?? 0.5);
        const probAfter = getCpmmProbability(cpmmState.pool as unknown as Pool, cpmmState.p);

        if (totalSpent <= 0 || totalShares <= 0) {
            return { success: false, error: 'Order could not be filled' };
        }

        updateUserBalance(userId, -totalSpent);

        const betId = generateId();
        const now = Date.now();

        const bet: Bet = {
            id: betId,
            contractId,
            userId,
            amount: totalSpent,
            shares: totalShares,
            outcome,
            probBefore,
            probAfter,
            isRedemption: false,
            isFilled: true,
            isCancelled: false,
            createdTime: now
        };

        addBet(contractId, bet);

        contract.pool = cpmmState.pool as Pool;
        contract.p = cpmmState.p;
        contract.volume += totalSpent;
        contract.lastBetTime = now;
        contract.lastUpdatedTime = now;
        saveContract(contract);

        applyMakerFills(betId, makers);
        cancelOrders(ordersToCancel);

        const userBalance = getOrCreateUser(userId).balance;

        addPricePoint(contractId, probAfter);

        checkAndFillLimitOrders(contractId);

        return {
            success: true,
            bet,
            shares: totalShares,
            probBefore,
            probAfter,
            newBalance: userBalance,
            redemptionBets: []
        };
    }

    // 3.5 MULTI-CHOICE NORMALIZATION (Sum-To-One) - EXACT MANIFOLD ARBITRAGE
    // Uses the precise Manifold binary search algorithm for sum-to-one markets
    if (contract.outcomeType === 'MULTIPLE_CHOICE' && contract.shouldAnswersSumToOne && answerId) {
        const targetA = contract.answers?.find(a => a.id === answerId);
        if (!targetA || !contract.answers) return { success: false, error: "Answer not found" };

        console.log('[PlaceBet] Using EXACT Manifold arbitrage for dependent multi-choice');
        console.log('[PlaceBet] Before probs:', contract.answers.map(a => ({ id: a.id, prob: a.prob })));

        const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageBet(
            contract.answers,
            targetA,
            outcome,
            amount,
            undefined, // limitProb
            [], // unfilledBets
            {}, // balanceByUserId
            noFees // collectedFees
        );

        // DETAILED DEBUG: Log exactly what arbitrage returned
        console.log('[PlaceBet] ====== ARBITRAGE RESULT ======');
        console.log('[PlaceBet] newBetResult:', {
            outcome: newBetResult.outcome,
            answerId: newBetResult.answer?.id,
            takersCount: newBetResult.takers?.length,
            takers: newBetResult.takers?.map(t => ({ amount: t.amount?.toFixed(4), shares: t.shares?.toFixed(4) })),
            pool: newBetResult.cpmmState?.pool
        });
        console.log('[PlaceBet] otherBetResults count:', otherBetResults?.length);
        otherBetResults?.forEach((r, i) => {
            console.log(`[PlaceBet] otherBetResults[${i}]:`, {
                outcome: r.outcome,
                answerId: r.answer?.id,
                takersCount: r.takers?.length,
                takers: r.takers?.map(t => ({ amount: t.amount?.toFixed(4), shares: t.shares?.toFixed(4) })),
                pool: r.cpmmState?.pool
            });
        });
        console.log('[PlaceBet] ==============================');

        const now = Date.now();
        const betGroupId = generateId();
        const allBets: Bet[] = [];

        // 2. Persist Main Bet (YES)
        const probBefore = targetA.prob;

        // Update pool FIRST (to get correct probAfter for record)
        const mainPool = newBetResult.cpmmState.pool as { YES: number; NO: number };
        targetA.poolYes = mainPool.YES;
        targetA.poolNo = mainPool.NO;
        targetA.prob = getCpmmProbability(mainPool, targetA.p ?? 0.5);
        targetA.volume += newBetResult.takers.reduce((sum, t) => sum + Math.abs(t.amount), 0);

        // Record price point for this answer (for chart)
        addAnswerPricePoint(contractId, targetA.id, targetA.prob);

        const mainBetAmount = newBetResult.takers.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const mainBetShares = newBetResult.takers.reduce((sum, t) => sum + t.shares, 0);

        const mainBet: Bet = {
            id: generateId(),
            userId,
            contractId,
            answerId,
            amount: mainBetAmount,
            shares: mainBetShares,
            outcome: newBetResult.outcome as 'YES' | 'NO',
            probBefore,
            probAfter: targetA.prob,
            createdTime: now,
            isRedemption: false,
            isFilled: true,
            isCancelled: false,
            betGroupId
        };
        addBet(contractId, mainBet);
        allBets.push(mainBet);

        // 3. Persist Side Bets (NO)
        for (const res of otherBetResults) {
            const sideA = contract.answers.find(a => a.id === res.answer.id)!;
            const sideProbBefore = sideA.prob;

            const sidePool = res.cpmmState.pool as { YES: number; NO: number };
            sideA.poolYes = sidePool.YES;
            sideA.poolNo = sidePool.NO;
            sideA.prob = getCpmmProbability(sidePool, sideA.p ?? 0.5);
            sideA.volume += res.takers.reduce((sum, t) => sum + Math.abs(t.amount), 0);

            // Record price point for this answer (for chart)
            addAnswerPricePoint(contractId, sideA.id, sideA.prob);

            const sideBetAmount = res.takers.reduce((sum, t) => sum + Math.abs(t.amount), 0);
            const sideBetShares = res.takers.reduce((sum, t) => sum + t.shares, 0);

            const sideBet: Bet = {
                id: generateId(),
                userId,
                contractId,
                answerId: sideA.id,
                amount: sideBetAmount,
                shares: sideBetShares,
                outcome: res.outcome as 'YES' | 'NO',
                probBefore: sideProbBefore,
                probAfter: sideA.prob,
                createdTime: now,
                isRedemption: false,
                isFilled: true,
                isCancelled: false,
                betGroupId
            };
            addBet(contractId, sideBet);
            allBets.push(sideBet);
        }

        // DEBUG: Log final probabilities after arbitrage
        const finalProbs = contract.answers.map(a => ({ id: a.id, text: a.text.slice(0, 20), prob: a.prob }));
        const probSum = contract.answers.reduce((sum, a) => sum + a.prob, 0);
        console.log('[PlaceBet] After probs:', finalProbs);
        console.log('[PlaceBet] Probability sum:', probSum.toFixed(4), probSum >= 0.99 && probSum <= 1.01 ? '✓' : '✗');

        // 4. Update Balance & Metrics
        // Deduct the full original amount (which funded main + side bets)
        updateUserBalance(userId, -amount);

        // Update Position Metrics
        for (const b of allBets) {
            const m = getOrCreateMetric(userId, contractId, b.answerId!);
            if (b.outcome === 'YES') {
                m.totalSharesYes += b.shares;
                m.hasYesShares = true;
            } else {
                m.totalSharesNo += b.shares;
                m.hasNoShares = true;
            }
            m.invested += b.amount;
            updateMetric(m);
        }

        addPricePoint(contractId, targetA.prob);
        checkAndPayUniqueBettorBonus(contract, userId, mainBet);

        contract.volume += amount;
        contract.lastBetTime = now;
        contract.lastUpdatedTime = now;
        // Start graduation if threshold reached (applies to multi-choice too)
        const GRAD_THRESHOLD = 1000;
        if (contract.phase === 'sandbox' && contract.volume >= GRAD_THRESHOLD) {
            contract.phase = 'graduating';
            contract.graduationStartTime = now;
            console.log(`[Graduation] Market ${contract.id} started graduation at volume $${contract.volume}`);
        }
        saveContract(contract);
        // Fill any limit orders that became matchable after this trade (main markets only)
        if ((contract as any).outcomeType === 'BINARY') {
            checkAndFillLimitOrders(contractId);
        }

        return {
            success: true,
            bet: mainBet,
            shares: mainBet.shares,
            probBefore: mainBet.probBefore,
            probAfter: mainBet.probAfter,
            newBalance: user.balance - amount,
            redemptionBets: allBets.filter(b => b.id !== mainBet.id)
        };
    }

    // 4. For multi-choice, find the answer (Legacy/Binary fallback)
    let pool: Pool;
    let answer: Answer | undefined;

    if (contract.outcomeType === 'MULTIPLE_CHOICE' && answerId) {
        answer = contract.answers?.find(a => a.id === answerId);
        if (!answer) {
            return { success: false, error: 'Answer not found' };
        }
        pool = { YES: answer.poolYes, NO: answer.poolNo };
    } else {
        pool = contract.pool;
    }

    // 5. Calculate bet result using CPMM
    // NOTE: Tripple Checked P-Parameter logic here
    const { shares, newPool, probBefore, probAfter } = calculateCpmmPurchase(
        pool,
        amount,
        outcome,
        answer?.p ?? contract.p ?? 0.5
    );

    // 6. Validate the trade
    if (Math.min(newPool.YES, newPool.NO) < CPMM_MIN_POOL_QTY) {
        return { success: false, error: 'Trade too large for current liquidity' };
    }

    // 7. Create bet record
    const betId = generateId();
    const now = Date.now();

    const bet: Bet = {
        id: betId,
        contractId,
        userId,
        amount,
        shares,
        outcome,
        probBefore,
        probAfter,
        answerId,
        isRedemption: false,
        isFilled: true,
        isCancelled: false,
        createdTime: now
    };

    // 8. Update user balance (deduct amount)
    updateUserBalance(userId, -amount);

    // 9. Save bet
    addBet(contractId, bet);

    // 10. Update contract/answer pool and stats
    if (answer) {
        // Multi-choice: update answer
        answer.poolYes = newPool.YES;
        answer.poolNo = newPool.NO;
        answer.prob = getCpmmProbability(newPool, answer.p ?? contract.p ?? 0.5);
        answer.volume += amount;
        // Record price point for this answer (for chart)
        addAnswerPricePoint(contractId, answer.id, answer.prob);
    } else {
        // Binary: update contract
        contract.pool = newPool;
        // contract.p = probAfter; // Do NOT update p (constant parameter)
    }

    contract.volume += amount;
    contract.lastBetTime = now;
    contract.lastUpdatedTime = now;

    // Check graduation eligibility: start graduating when volume threshold is reached
    const GRAD_THRESHOLD = 1000; // Match graduation.ts GRADUATION_VOLUME_THRESHOLD
    if (contract.phase === 'sandbox' && contract.volume >= GRAD_THRESHOLD) {
        contract.phase = 'graduating';
        contract.graduationStartTime = now;
        console.log(`[Graduation] Market ${contract.id} started graduation at volume $${contract.volume}`);
    }

    saveContract(contract);

    // 11. Update user metrics (position tracking)
    const metric = getOrCreateMetric(userId, contractId, answerId);
    if (outcome === 'YES') {
        metric.totalSharesYes += shares;
        metric.hasYesShares = true;
    } else {
        metric.totalSharesNo += shares;
        metric.hasNoShares = true;
    }
    metric.invested += amount;
    updateMetric(metric);

    // 12. Add price point for chart
    addPricePoint(contractId, probAfter);
    // Check any waiting limit orders after the price move (main markets only)
    if (contract.outcomeType === 'BINARY') {
        checkAndFillLimitOrders(contractId);
    }

    // 13. REDEMPTION: Check if user now holds both YES and NO shares
    // If so, convert pairs to cash (1 YES + 1 NO = $1)
    // DISABLED PER USER REQUEST: User wants to hold separate positions
    // const redemptionResult = executeRedemption(userId, contractId, probAfter, answerId);

    // 14. UNIQUE BETTOR BONUS: Pay $5 to creator if this is a new bettor
    checkAndPayUniqueBettorBonus(contract, userId, bet);

    // 15. Return result
    return {
        success: true,
        bet,
        shares,
        probBefore,
        probAfter,
        newBalance: user.balance - amount, // + (redemptionResult.amount ?? 0),
        redemptionBets: [] // redemptionResult.redemptionBets
    };
}

/**
 * Place bet on a multi-choice answer (convenience wrapper)
 */
export function placeAnswerBet(
    contractId: string,
    answerId: string,
    amount: number,
    outcome: 'YES' | 'NO',
    userId: string
): PlaceBetResult {
    return placeBet({
        contractId,
        amount,
        outcome,
        userId,
        answerId
    });
}
