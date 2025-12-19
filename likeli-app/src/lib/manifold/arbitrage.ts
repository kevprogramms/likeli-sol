// lib/manifold/arbitrage.ts
// Multi-Choice Arbitrage System (Section 2)
// For markets where answers must sum to 100%
// When you buy YES on one answer, automatically buy NO on others

import { Pool, Bet, Answer, Contract } from './types';
import { calculateCpmmPurchase, getCpmmProbability, generateId } from './cpmm';
import { getContract, saveContract, addBet, getOrCreateMetric, updateMetric, updateUserBalance, getOrCreateUser } from './store';

// ============================================
// CONFIGURATION
// ============================================

const MAX_CPMM_PROB = 0.99;
const MIN_CPMM_PROB = 0.01;

// ============================================
// BINARY SEARCH UTILITY (Section 2.5)
// ============================================

/**
 * Binary search to find x where f(x) ≈ 0
 * @param min Lower bound
 * @param max Upper bound  
 * @param f Function that returns positive if x is too high, negative if too low
 * @param tolerance Precision of search
 */
export function binarySearch(
    min: number,
    max: number,
    f: (x: number) => number,
    tolerance: number = 0.0001
): number {
    let lo = min;
    let hi = max;

    // Limit iterations to prevent infinite loops
    let iterations = 0;
    const maxIterations = 100;

    while (hi - lo > tolerance && iterations < maxIterations) {
        const mid = (lo + hi) / 2;
        const result = f(mid);

        if (result > 0) {
            hi = mid;
        } else {
            lo = mid;
        }
        iterations++;
    }

    return (lo + hi) / 2;
}

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ArbitrageBetResult {
    answer: Answer;
    outcome: 'YES' | 'NO';
    amount: number;
    shares: number;
    newPool: Pool;
    probBefore: number;
    probAfter: number;
}

export interface MultiArbitrageResult {
    success: boolean;
    error?: string;
    mainBet?: ArbitrageBetResult;
    arbitrageBets: ArbitrageBetResult[];
    totalSpent: number;
    allBets: Bet[];
}

// ============================================
// CALCULATE AMOUNT TO BUY SHARES
// ============================================

/**
 * Calculate how much money needed to buy a specific number of shares
 */
function calculateAmountForShares(
    pool: Pool,
    shares: number,
    outcome: 'YES' | 'NO'
): number {
    const { YES: y, NO: n } = pool;
    const k = y * n;

    if (outcome === 'YES') {
        const newY = y - shares;
        if (newY <= 0) return Infinity;
        const newN = k / newY;
        return newN - n;
    } else {
        const newN = n - shares;
        if (newN <= 0) return Infinity;
        const newY = k / newN;
        return newY - y;
    }
}

// ============================================
// BUY YES WITH ARBITRAGE (Section 2.3)
// ============================================

/**
 * Buy YES on one answer by:
 * 1. Buying NO on all other answers (lowers their probability)
 * 2. This automatically maintains sum = 1 constraint
 * 
 * For sum-to-one markets: P(A) + P(B) + P(C) = 1
 */
export function calculateArbitrageBuyYes(
    answers: Answer[],
    answerToBuy: Answer,
    betAmount: number,
    p: number = 0.5
): {
    noSharesToBuy: number;
    yesBetAmount: number;
    noBetAmounts: { answerId: string; amount: number }[];
} | null {
    const otherAnswers = answers.filter(a => a.id !== answerToBuy.id);

    if (otherAnswers.length === 0) {
        // Binary market, no arbitrage needed
        return null;
    }

    // Calculate the sum of NO prices on other answers
    const noSharePriceSum = otherAnswers.reduce((sum, a) => {
        const pool = { YES: a.poolYes, NO: a.poolNo };
        const prob = getCpmmProbability(pool, a.p ?? p);
        return sum + (1 - prob);  // Price of NO = 1 - prob
    }, 0);

    // If there are n answers and you buy 1 NO share in each of (n-1) other answers,
    // you effectively get 1 YES share in the target answer via redemption
    // Cost = sum of NO prices, but you redeem (n-2) times for $1 each
    const numOtherAnswers = otherAnswers.length;
    const redemptionValue = numOtherAnswers - 1;  // Each complete set redeems for $1

    // Calculate max NO shares we could buy with betAmount
    // effectiveCostPerNoShare = (sum of NO costs) - redemptionValue
    const effectiveCostPerShare = noSharePriceSum - redemptionValue;

    if (effectiveCostPerShare <= 0) {
        // Arbitrage opportunity! (unusual case)
        effectiveCostPerShare === 0.001;
    }

    const maxNoShares = betAmount / Math.max(effectiveCostPerShare, 0.01);

    // Binary search to find the right number of NO shares
    const noShares = binarySearch(0, maxNoShares, (testNoShares) => {
        // Calculate cost of buying testNoShares of NO in each other answer
        let totalCost = 0;
        let probSum = getCpmmProbability({ YES: answerToBuy.poolYes, NO: answerToBuy.poolNo }, answerToBuy.p ?? p);

        for (const answer of otherAnswers) {
            const pool = { YES: answer.poolYes, NO: answer.poolNo };
            const costForThisAnswer = calculateAmountForShares(pool, testNoShares, 'NO');
            totalCost += costForThisAnswer;

            // Calculate new probability after buying NO
            const { newPool } = calculateCpmmPurchase(pool, costForThisAnswer, 'NO', answer.p ?? p);
            probSum += getCpmmProbability(newPool, answer.p ?? p);
        }

        // We want probSum ≈ 1
        return probSum - 1;
    });

    // Calculate the actual amounts for each answer
    const noBetAmounts: { answerId: string; amount: number }[] = [];
    let totalNoAmount = 0;

    for (const answer of otherAnswers) {
        const pool = { YES: answer.poolYes, NO: answer.poolNo };
        const amount = calculateAmountForShares(pool, noShares, 'NO');
        noBetAmounts.push({ answerId: answer.id, amount });
        totalNoAmount += amount;
    }

    // Remaining amount goes to YES bet on target answer
    const yesBetAmount = betAmount - totalNoAmount + (noShares * redemptionValue);

    return {
        noSharesToBuy: noShares,
        yesBetAmount: Math.max(0, yesBetAmount),
        noBetAmounts
    };
}

// ============================================
// BUY NO WITH ARBITRAGE (Section 2.4)
// ============================================

/**
 * Buy NO on one answer by:
 * 1. Buying YES on all other answers (raises their probability)
 * 2. This automatically maintains sum = 1 constraint
 */
export function calculateArbitrageBuyNo(
    answers: Answer[],
    answerToBuy: Answer,
    betAmount: number,
    p: number = 0.5
): {
    yesSharesToBuy: number;
    noBetAmount: number;
    yesBetAmounts: { answerId: string; amount: number }[];
} | null {
    const otherAnswers = answers.filter(a => a.id !== answerToBuy.id);

    if (otherAnswers.length === 0) {
        return null;
    }

    // Calculate the sum of YES prices on other answers
    const yesSharePriceSum = otherAnswers.reduce((sum, a) => {
        const pool = { YES: a.poolYes, NO: a.poolNo };
        return sum + getCpmmProbability(pool, a.p ?? p);  // Price of YES = prob
    }, 0);

    const maxYesShares = betAmount / Math.max(yesSharePriceSum, 0.01);

    // Binary search for correct YES shares
    const yesShares = binarySearch(0, maxYesShares, (testYesShares) => {
        let probSum = getCpmmProbability({ YES: answerToBuy.poolYes, NO: answerToBuy.poolNo }, answerToBuy.p ?? p);

        for (const answer of otherAnswers) {
            const pool = { YES: answer.poolYes, NO: answer.poolNo };
            const costForThisAnswer = calculateAmountForShares(pool, testYesShares, 'YES');
            const { newPool } = calculateCpmmPurchase(pool, costForThisAnswer, 'YES', answer.p ?? p);
            probSum += getCpmmProbability(newPool, answer.p ?? p);
        }

        return 1 - probSum;  // We want sum = 1
    });

    // Calculate amounts for each answer
    const yesBetAmounts: { answerId: string; amount: number }[] = [];
    let totalYesAmount = 0;

    for (const answer of otherAnswers) {
        const pool = { YES: answer.poolYes, NO: answer.poolNo };
        const amount = calculateAmountForShares(pool, yesShares, 'YES');
        yesBetAmounts.push({ answerId: answer.id, amount });
        totalYesAmount += amount;
    }

    const noBetAmount = betAmount - totalYesAmount;

    return {
        yesSharesToBuy: yesShares,
        noBetAmount: Math.max(0, noBetAmount),
        yesBetAmounts
    };
}

// ============================================
// MAIN ARBITRAGE FUNCTION (Section 2.2)
// ============================================

/**
 * Calculate a bet on a multi-choice market where answers sum to one.
 * Returns both the main bet AND arbitrage bets needed to maintain sum = 1.
 */
export function placeArbitrageBet(
    contractId: string,
    answerId: string,
    outcome: 'YES' | 'NO',
    betAmount: number,
    userId: string
): MultiArbitrageResult {
    const contract = getContract(contractId);
    if (!contract) {
        return { success: false, error: 'Contract not found', arbitrageBets: [], totalSpent: 0, allBets: [] };
    }

    if (!contract.answers || contract.answers.length < 2) {
        return { success: false, error: 'Not a multi-choice market', arbitrageBets: [], totalSpent: 0, allBets: [] };
    }

    // Check if this market should have answers sum to one
    if (!contract.shouldAnswersSumToOne) {
        return { success: false, error: 'Market does not require sum-to-one', arbitrageBets: [], totalSpent: 0, allBets: [] };
    }

    const answerToBuy = contract.answers.find(a => a.id === answerId);
    if (!answerToBuy) {
        return { success: false, error: 'Answer not found', arbitrageBets: [], totalSpent: 0, allBets: [] };
    }

    // Check user balance
    const user = getOrCreateUser(userId);
    if (user.balance < betAmount) {
        return { success: false, error: 'Insufficient balance', arbitrageBets: [], totalSpent: 0, allBets: [] };
    }

    const now = Date.now();
    const betGroupId = generateId();  // Link all bets together
    const allBets: Bet[] = [];
    const arbitrageBets: ArbitrageBetResult[] = [];
    let totalSpent = 0;

    if (outcome === 'YES') {
        const calc = calculateArbitrageBuyYes(contract.answers, answerToBuy, betAmount, contract.p ?? 0.5);

        if (!calc) {
            // Binary market, just place normal bet
            return placeSingleBet(contract, answerToBuy, outcome, betAmount, userId, contract.p ?? 0.5);
        }

        // 1. Place NO bets on other answers
        for (const noBet of calc.noBetAmounts) {
            const answer = contract.answers.find(a => a.id === noBet.answerId);
            if (!answer || noBet.amount <= 0) continue;

            const pool = { YES: answer.poolYes, NO: answer.poolNo };
            const { shares, newPool, probBefore, probAfter } = calculateCpmmPurchase(pool, noBet.amount, 'NO', answer.p ?? contract.p ?? 0.5);
            answer.poolYes = newPool.YES;
            answer.poolNo = newPool.NO;
            answer.prob = getCpmmProbability(newPool, answer.p ?? contract.p ?? 0.5);

            // Create bet record
            const bet: Bet = {
                id: generateId(),
                userId,
                contractId,
                answerId: answer.id,
                amount: noBet.amount,
                shares,
                outcome: 'NO',
                probBefore,
                probAfter,
                createdTime: now,
                isRedemption: false,
                isFilled: true,
                isCancelled: false
            };
            addBet(contractId, bet);
            allBets.push(bet);
            totalSpent += noBet.amount;

            arbitrageBets.push({
                answer,
                outcome: 'NO',
                amount: noBet.amount,
                shares,
                newPool,
                probBefore,
                probAfter
            });
        }

        // 2. Place YES bet on target answer
        if (calc.yesBetAmount > 0) {
            const pool = { YES: answerToBuy.poolYes, NO: answerToBuy.poolNo };
            const { shares, newPool, probBefore, probAfter } = calculateCpmmPurchase(pool, calc.yesBetAmount, 'YES', answerToBuy.p ?? contract.p ?? 0.5);

            answerToBuy.poolYes = newPool.YES;
            answerToBuy.poolNo = newPool.NO;
            answerToBuy.prob = getCpmmProbability(newPool, answerToBuy.p ?? contract.p ?? 0.5);

            const mainBet: Bet = {
                id: generateId(),
                userId,
                contractId,
                answerId: answerToBuy.id,
                amount: calc.yesBetAmount,
                shares,
                outcome: 'YES',
                probBefore,
                probAfter,
                createdTime: now,
                isRedemption: false,
                isFilled: true,
                isCancelled: false
            };
            addBet(contractId, mainBet);
            allBets.push(mainBet);
            totalSpent += calc.yesBetAmount;
        }

    } else {
        // Buying NO - buy YES on other answers
        const calc = calculateArbitrageBuyNo(contract.answers, answerToBuy, betAmount, contract.p ?? 0.5);

        if (!calc) {
            return placeSingleBet(contract, answerToBuy, outcome, betAmount, userId, contract.p ?? 0.5);
        }

        // 1. Place YES bets on other answers
        for (const yesBet of calc.yesBetAmounts) {
            const answer = contract.answers.find(a => a.id === yesBet.answerId);
            if (!answer || yesBet.amount <= 0) continue;

            const pool = { YES: answer.poolYes, NO: answer.poolNo };
            const { shares, newPool, probBefore, probAfter } = calculateCpmmPurchase(pool, yesBet.amount, 'YES', answer.p ?? contract.p ?? 0.5);

            answer.poolYes = newPool.YES;
            answer.poolNo = newPool.NO;
            answer.prob = getCpmmProbability(newPool, answer.p ?? contract.p ?? 0.5);

            const bet: Bet = {
                id: generateId(),
                userId,
                contractId,
                answerId: answer.id,
                amount: yesBet.amount,
                shares,
                outcome: 'YES',
                probBefore,
                probAfter,
                createdTime: now,
                isRedemption: false,
                isFilled: true,
                isCancelled: false
            };
            addBet(contractId, bet);
            allBets.push(bet);
            totalSpent += yesBet.amount;

            arbitrageBets.push({
                answer,
                outcome: 'YES',
                amount: yesBet.amount,
                shares,
                newPool,
                probBefore,
                probAfter
            });
        }

        // 2. Place NO bet on target answer
        if (calc.noBetAmount > 0) {
            const pool = { YES: answerToBuy.poolYes, NO: answerToBuy.poolNo };
            const { shares, newPool, probBefore, probAfter } = calculateCpmmPurchase(pool, calc.noBetAmount, 'NO', answerToBuy.p ?? contract.p ?? 0.5);

            answerToBuy.poolYes = newPool.YES;
            answerToBuy.poolNo = newPool.NO;
            answerToBuy.prob = getCpmmProbability(newPool, answerToBuy.p ?? contract.p ?? 0.5);

            const mainBet: Bet = {
                id: generateId(),
                userId,
                contractId,
                answerId: answerToBuy.id,
                amount: calc.noBetAmount,
                shares,
                outcome: 'NO',
                probBefore,
                probAfter,
                createdTime: now,
                isRedemption: false,
                isFilled: true,
                isCancelled: false
            };
            addBet(contractId, mainBet);
            allBets.push(mainBet);
            totalSpent += calc.noBetAmount;
        }
    }

    // Update user balance
    updateUserBalance(userId, -totalSpent);

    // Save contract with updated answer pools
    contract.volume += totalSpent;
    contract.lastBetTime = now;
    contract.lastUpdatedTime = now;
    saveContract(contract);

    return {
        success: true,
        arbitrageBets,
        totalSpent,
        allBets
    };
}

/**
 * Helper: Place single bet without arbitrage (for binary markets)
 */
function placeSingleBet(
    contract: Contract,
    answer: Answer,
    outcome: 'YES' | 'NO',
    amount: number,
    userId: string,
    p: number = 0.5
): MultiArbitrageResult {
    const pool = { YES: answer.poolYes, NO: answer.poolNo };
    const { shares, newPool, probBefore, probAfter } = calculateCpmmPurchase(pool, amount, outcome, answer.p ?? p);

    answer.poolYes = newPool.YES;
    answer.poolNo = newPool.NO;
    answer.prob = getCpmmProbability(newPool, answer.p ?? p);

    const bet: Bet = {
        id: generateId(),
        userId,
        contractId: contract.id,
        answerId: answer.id,
        amount,
        shares,
        outcome,
        probBefore,
        probAfter,
        createdTime: Date.now(),
        isRedemption: false,
        isFilled: true,
        isCancelled: false
    };

    addBet(contract.id, bet);
    updateUserBalance(userId, -amount);

    contract.volume += amount;
    contract.lastBetTime = Date.now();
    contract.lastUpdatedTime = Date.now();
    saveContract(contract);

    return {
        success: true,
        mainBet: {
            answer,
            outcome,
            amount,
            shares,
            newPool,
            probBefore,
            probAfter
        },
        arbitrageBets: [],
        totalSpent: amount,
        allBets: [bet]
    };
}
