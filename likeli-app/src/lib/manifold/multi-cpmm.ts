import { Answer, Bet, LimitBet, Pool } from './types'
import { calculateCpmmPurchase, getCpmmProbability, getK } from './cpmm'
import { binarySearch } from './binary-search'

// --- HELPER TYPES ---
type BetResult = {
    outcome: 'YES' | 'NO'
    answer: Answer
    takers: {
        matchedBetId: string | null
        amount: number
        shares: number
        timestamp: number
    }[]
    cpmmState: { pool: Pool; p: number }
    extra?: {
        arbitrageShares?: number
    }
}

const EPSILON = 0.001

/**
 * Main Entry Point: Calculate a bet on a multi-choice answer
 * that automatically arbitrages other answers to keep Sum(Prob) = 1
 */
export function calculateCpmmMultiArbitrageYesBets(
    answers: Answer[],
    answerToBuy: Answer,
    betAmount: number,
    limitProb: number | undefined,
    unfilledBets: LimitBet[],
    balanceByUserId: { [userId: string]: number }
) {
    // 1. Calculate max shares we could buy if we just bought NO on everything else
    const otherAnswers = answers.filter(a => a.id !== answerToBuy.id)

    // Use p-aware probability sum (though a.prob should be up to date)
    const noSharePriceSum = otherAnswers.reduce((sum, a) => sum + (1 - a.prob), 0)

    // Estimate max shares to establish binary search bounds
    // (answers.length + 2) is a heuristic from Manifold
    const maxNoShares = betAmount / Math.max(0.001, noSharePriceSum - answers.length + 2)

    // 2. Binary Search for the perfect amount of 'NO' shares to buy on others
    // such that the resulting probability sum equals 1.0
    const noShares = binarySearch(0, maxNoShares, (noShares) => {
        const result = simulateBuyChoice(
            answers,
            answerToBuy,
            betAmount,
            noShares
        )
        if (!result) return 1 // Logic failed, try smaller amount

        // Check how close we are to Sum(Prob) = 1
        // CRITICAL: Use answer.p for correct probability calculation
        const totalProb = [
            ...result.noBetResults,
            result.yesBetResult
        ].reduce((sum, res) => sum + getCpmmProbability(res.cpmmState.pool, res.answer.p ?? 0.5), 0)

        return 1 - totalProb
    })

    // 3. Calculate final execution with the found `noShares` value
    const finalResult = simulateBuyChoice(
        answers,
        answerToBuy,
        betAmount,
        noShares
    )

    if (!finalResult) throw new Error('Arbitrage calculation failed')

    return {
        newBetResult: { ...finalResult.yesBetResult, outcome: 'YES' } as BetResult,
        otherBetResults: finalResult.noBetResults.map(r => ({ ...r, outcome: 'NO' } as BetResult))
    }
}

/**
 * Internal logic: Simulates buying NO on all other answers, 
 * then using remaining funds + redemption bonus to buy YES on target.
 */
function simulateBuyChoice(
    answers: Answer[],
    answerToBuy: Answer,
    betAmount: number,
    noShares: number
) {
    const otherAnswers = answers.filter(a => a.id !== answerToBuy.id)

    // A. Calculate cost to buy `noShares` of NO on each other answer
    const noBuyCalculations = otherAnswers.map(answer => {
        // Inverse CPMM buy: how much to pay to get X shares
        const { poolYes, poolNo } = answer
        const k = poolYes * poolNo
        const newNo = poolNo - noShares

        // Safety check for pool drain
        if (newNo <= 0) return { answer, cost: Infinity, newPool: { YES: poolYes, NO: poolNo } }

        const newYes = k / newNo
        const cost = newYes - poolYes

        return {
            answer,
            cost,
            newPool: { YES: newYes, NO: newNo }
        }
    })

    const totalNoCost = noBuyCalculations.reduce((sum, x) => sum + x.cost, 0)

    // B. Calculate "Redemption Bonus"
    // If you buy NO on (N-1) outcomes, you effectively bought YES on the Nth.
    const redemptionAmount = noShares * (answers.length - 2)
    const netCostForNo = totalNoCost

    // C. Remaining bet amount is used to buy YES on the target answer
    // (simplified fee deduction)
    let yesBetAmount = betAmount - (netCostForNo - redemptionAmount)

    if (yesBetAmount < 0) return undefined

    // D. Buy YES shares on the target answer
    const { poolYes, poolNo } = answerToBuy

    // CRITICAL: Use answerToBuy.p ?? 0.5
    const { shares: yesShares, newPool: yesNewPool } = calculateCpmmPurchase(
        { YES: poolYes, NO: poolNo },
        yesBetAmount,
        'YES',
        answerToBuy.p ?? 0.5
    )

    // E. Construct Results
    const noBetResults = noBuyCalculations.map(calc => ({
        answer: calc.answer,
        takers: [{
            matchedBetId: null,
            amount: calc.cost,
            shares: noShares,
            timestamp: Date.now()
        }],
        cpmmState: { pool: calc.newPool, p: calc.answer.p ?? 0.5 }
    }))

    const yesBetResult = {
        answer: answerToBuy,
        takers: [{
            matchedBetId: null,
            amount: yesBetAmount,
            shares: yesShares,
            timestamp: Date.now()
        }],
        // IMPORTANT: Adding the arbitrage shares we effectively gained
        arbitrageShares: noShares,
        cpmmState: { pool: yesNewPool, p: answerToBuy.p ?? 0.5 }
    }

    return { noBetResults, yesBetResult }
}
