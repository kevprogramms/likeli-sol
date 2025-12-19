import { Answer, Pool } from './types'
import { getCpmmProbability, calculateCpmmPurchase, calculateCpmmAmountForShares } from './cpmm'

const EPSILON = 0.0001

// ==========================================
// 🔴 THE ARBITRAGE ALGORITHM (Manifold 100%)
// "The Water Level Strategy"
// ==========================================

export function calculateMultiChoiceSplit(
    answers: Answer[],
    answerToBuy: Answer,
    betAmount: number,
    outcome: 'YES' | 'NO'
) {
    if (outcome === 'YES') {
        return calculateYesArbitrage(answers, answerToBuy, betAmount)
    } else {
        return calculateNoArbitrage(answers, answerToBuy, betAmount)
    }
}

function calculateYesArbitrage(
    answers: Answer[],
    answerToBuy: Answer,
    betAmount: number
) {
    // 1. Estimate bounds: If we bought strictly NO on everyone else
    const otherAnswers = answers.filter(a => a.id !== answerToBuy.id)
    const noSharePriceSum = otherAnswers.reduce((sum, a) => sum + (1 - a.prob), 0)
    const maxNoShares = betAmount / Math.max(0.001, (noSharePriceSum - answers.length + 2))

    // 2. Binary Search for "noShares"
    // optimizing for Sum(Probs) == 1
    const optimalNoShares = binarySearch(0, maxNoShares, (shares) => {
        // A. Simulate buying 'shares' amount of NO on all other answers
        const simulator = simulateBuyNoOnOthers(otherAnswers, shares)
        if (simulator.totalCost === Infinity) return -1 // Too many shares

        // B. Calculate leftovers for the Main YES bet
        const costForNo = simulator.totalCost
        const redemptionBonus = shares * (answers.length - 2)
        const remainderForYes = betAmount - (costForNo - redemptionBonus)

        if (remainderForYes < 0) return -1 // Too many NO shares, too expensive

        // C. Simulate buying YES on target
        const { newPool } = simulateCpmmTrade(
            answerToBuy.poolYes,
            answerToBuy.poolNo,
            remainderForYes,
            'YES',
            answerToBuy.p ?? 0.5
        )

        // D. Check Global Sum
        const totalProb = simulator.newPools.reduce((s, pState) => s + getCpmmProbability(pState.pool, pState.p), 0)
            + getCpmmProbability(newPool, answerToBuy.p ?? 0.5)

        return 1 - totalProb // We want this to be 0
    })

    // 3. Final Computation with optimal value
    return buildFinalResult(answers, answerToBuy, betAmount, optimalNoShares, 'YES')
}

function calculateNoArbitrage(
    answers: Answer[],
    answerToBuy: Answer,
    betAmount: number
) {
    // Buying NO on A == Buying YES on B+C+D
    const otherAnswers = answers.filter(a => a.id !== answerToBuy.id)
    const yesSharePriceSum = otherAnswers.reduce((sum, a) => sum + a.prob, 0)
    const maxYesShares = betAmount / Math.max(0.001, yesSharePriceSum)

    const optimalYesShares = binarySearch(0, maxYesShares, (shares) => {
        // A. Simulate buying YES on all others
        const simulator = simulateBuyYesOnOthers(otherAnswers, shares)
        if (simulator.totalCost === Infinity) return -1

        // B. Leftovers go to buying NO on target
        const costForYes = simulator.totalCost
        const remainderForNo = betAmount - costForYes

        if (remainderForNo < 0) return -1

        // C. Buy NO on target
        const { newPool } = simulateCpmmTrade(
            answerToBuy.poolYes,
            answerToBuy.poolNo,
            remainderForNo,
            'NO',
            answerToBuy.p ?? 0.5
        )

        // D. Check Global Sum
        const totalProb = simulator.newPools.reduce((s, pState) => s + getCpmmProbability(pState.pool, pState.p), 0)
            + getCpmmProbability(newPool, answerToBuy.p ?? 0.5)

        return totalProb - 1
    })

    return buildFinalResult(answers, answerToBuy, betAmount, optimalYesShares, 'NO')
}

// --- LOWER LEVEL SIMULATORS ---

function simulateBuyNoOnOthers(answers: Answer[], shares: number) {
    let totalCost = 0
    const newPools: { pool: Pool, p: number }[] = []

    for (const ans of answers) {
        const p = ans.p ?? 0.5
        // CPMM: To buy `shares` of NO
        const { poolYes, poolNo } = ans

        // 1. Calculate Cost to buy specific shares
        const cost = calculateCpmmAmountForShares({ YES: poolYes, NO: poolNo }, shares, 'NO')
        if (cost === Infinity) return { totalCost: Infinity, newPools: [] }

        // 2. Calculate resulting pool
        const { newPool } = calculateCpmmPurchase({ YES: poolYes, NO: poolNo }, cost, 'NO', p)

        totalCost += cost
        newPools.push({ pool: newPool, p })
    }
    return { totalCost, newPools }
}

function simulateBuyYesOnOthers(answers: Answer[], shares: number) {
    let totalCost = 0
    const newPools: { pool: Pool, p: number }[] = []

    for (const ans of answers) {
        const p = ans.p ?? 0.5
        // Buying `shares` of YES
        const { poolYes, poolNo } = ans

        // 1. Calculate Cost
        const cost = calculateCpmmAmountForShares({ YES: poolYes, NO: poolNo }, shares, 'YES')
        if (cost === Infinity) return { totalCost: Infinity, newPools: [] }

        // 2. Calculate New Pool
        const { newPool } = calculateCpmmPurchase({ YES: poolYes, NO: poolNo }, cost, 'YES', p)

        totalCost += cost
        newPools.push({ pool: newPool, p })
    }
    return { totalCost, newPools }
}

function simulateCpmmTrade(y: number, n: number, amount: number, outcome: 'YES' | 'NO', p: number) {
    return calculateCpmmPurchase({ YES: y, NO: n }, amount, outcome, p)
}

function buildFinalResult(
    answers: Answer[],
    target: Answer,
    amount: number,
    shares: number,
    outcome: 'YES' | 'NO'
) {
    if (outcome === 'YES') {
        const otherAnswers = answers.filter(a => a.id !== target.id)
        const simulator = simulateBuyNoOnOthers(otherAnswers, shares)
        const costForNo = simulator.totalCost
        const redemptionBonus = shares * (answers.length - 2)
        const remainderForYes = amount - (costForNo - redemptionBonus)

        const { newPool, shares: mainShares } = simulateCpmmTrade(
            target.poolYes,
            target.poolNo,
            remainderForYes,
            'YES',
            target.p ?? 0.5
        )

        return {
            newBetResult: {
                outcome: 'YES',
                answer: target,
                takers: [{ amount: remainderForYes, shares: mainShares }],
                cpmmState: { pool: newPool, p: target.p ?? 0.5 }
            },
            otherBetResults: otherAnswers.map((a, i) => ({
                outcome: 'NO',
                answer: a,
                takers: [{
                    // Cost difference is what was paid
                    amount: calculateCpmmAmountForShares({ YES: a.poolYes, NO: a.poolNo }, shares, 'NO'),
                    shares: shares
                }],
                cpmmState: simulator.newPools[i]
            }))
        }
    } else {
        // Buying NO on Target = Buying YES on Others
        const otherAnswers = answers.filter(a => a.id !== target.id)
        const simulator = simulateBuyYesOnOthers(otherAnswers, shares)
        const costForYes = simulator.totalCost
        const remainderForNo = amount - costForYes

        const { newPool, shares: mainShares } = simulateCpmmTrade(
            target.poolYes,
            target.poolNo,
            remainderForNo,
            'NO',
            target.p ?? 0.5
        )

        return {
            newBetResult: {
                outcome: 'NO', // Main bet is NO
                answer: target,
                takers: [{ amount: remainderForNo, shares: mainShares }],
                cpmmState: { pool: newPool, p: target.p ?? 0.5 }
            },
            otherBetResults: otherAnswers.map((a, i) => ({
                outcome: 'YES', // Side bets are YES
                answer: a,
                takers: [{
                    amount: calculateCpmmAmountForShares({ YES: a.poolYes, NO: a.poolNo }, shares, 'YES'),
                    shares: shares
                }],
                cpmmState: simulator.newPools[i]
            }))
        }
    }
}

// *** THE BINARY SEARCH PRIMITIVE ***
function binarySearch(
    min: number,
    max: number,
    comparator: (value: number) => number
): number {
    let currMin = min
    let currMax = max
    let mid = 0

    for (let i = 0; i < 50; i++) { // 50 iterations is plenty for precision
        mid = (currMin + currMax) / 2
        const diff = comparator(mid)
        if (Math.abs(diff) < EPSILON) return mid
        if (diff > 0) currMin = mid
        else currMax = mid
    }
    return mid
}
