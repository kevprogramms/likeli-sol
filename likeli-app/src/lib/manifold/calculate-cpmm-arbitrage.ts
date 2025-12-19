// lib/manifold/calculate-cpmm-arbitrage.ts
// EXACT MANIFOLD COPY - Arbitrage calculations for sum-to-one markets

import { Dictionary, first, groupBy, mapValues, sum, sumBy } from 'lodash'
import { Answer, LimitBet, Maker, Fill } from './types'
import { Fees, getFeesSplit, getTakerFee, noFees, sumAllFees } from './fees'
import {
    calculateAmountToBuySharesFixedP,
    computeFills,
    getCpmmProbability,
    CpmmState,
} from './calculate-cpmm'
import { binarySearch } from './util/algos'
import { floatingEqual } from './util/math'
import { addObjects } from './util/object'

// Constants
export const MAX_CPMM_PROB = 0.99
export const MIN_CPMM_PROB = 0.01

const DEBUG = false

export type ArbitrageBetArray = ReturnType<typeof combineBetsOnSameAnswers>

export type PreliminaryBetResults = ReturnType<typeof computeFills> & {
    answer: Answer
    iteration?: number
}

const noFillsReturn = (
    outcome: string,
    answer: Answer,
    collectedFees: Fees
) => ({
    newBetResult: {
        outcome,
        answer,
        takers: [] as Fill[],
        makers: [] as Maker[],
        ordersToCancel: [] as LimitBet[],
        cpmmState: {
            pool: { YES: answer.poolYes, NO: answer.poolNo },
            p: 0.5,
            collectedFees,
        },
        totalFees: { creatorFee: 0, liquidityFee: 0, platformFee: 0 },
    },
    otherBetResults: [] as ArbitrageBetArray,
})

export function calculateCpmmMultiArbitrageBet(
    answers: Answer[],
    answerToBuy: Answer,
    outcome: 'YES' | 'NO',
    betAmount: number,
    initialLimitProb: number | undefined,
    unfilledBets: LimitBet[],
    balanceByUserId: { [userId: string]: number },
    collectedFees: Fees
) {
    const limitProb =
        initialLimitProb !== undefined
            ? initialLimitProb
            : outcome === 'YES'
                ? MAX_CPMM_PROB
                : MIN_CPMM_PROB
    if (
        (answerToBuy.prob < MIN_CPMM_PROB && outcome === 'NO') ||
        (answerToBuy.prob > MAX_CPMM_PROB && outcome === 'YES') ||
        (answerToBuy.prob > limitProb && outcome === 'YES') ||
        (answerToBuy.prob < limitProb && outcome === 'NO')
    ) {
        return noFillsReturn(outcome, answerToBuy, collectedFees)
    }
    const result =
        outcome === 'YES'
            ? calculateCpmmMultiArbitrageBetYes(
                answers,
                answerToBuy,
                betAmount,
                limitProb,
                unfilledBets,
                balanceByUserId,
                collectedFees
            )
            : calculateCpmmMultiArbitrageBetNo(
                answers,
                answerToBuy,
                betAmount,
                limitProb,
                unfilledBets,
                balanceByUserId,
                collectedFees
            )
    if (floatingEqual(sumBy(result.newBetResult.takers, 'amount'), 0)) {
        const { outcome, answer } = result.newBetResult
        return noFillsReturn(outcome, answer, collectedFees)
    }
    return result
}

function calculateCpmmMultiArbitrageBetYes(
    answers: Answer[],
    answerToBuy: Answer,
    betAmount: number,
    limitProb: number | undefined,
    unfilledBets: LimitBet[],
    balanceByUserId: { [userId: string]: number },
    collectedFees: Fees
) {
    const startTime = Date.now()
    const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)

    const noSharePriceSum = sumBy(
        answers.filter((a) => a.id !== answerToBuy.id).map((a) => 1 - a.prob)
    )
    const maxNoShares = betAmount / (noSharePriceSum - answers.length + 2)

    const noShares = binarySearch(0, maxNoShares, (noShares) => {
        const result = buyNoSharesInOtherAnswersThenYesInAnswer(
            answers,
            answerToBuy,
            unfilledBetsByAnswer,
            balanceByUserId,
            betAmount,
            limitProb,
            noShares,
            collectedFees
        )
        if (!result) {
            return 1
        }
        const newPools = [
            ...result.noBetResults.map((r) => r.cpmmState.pool),
            result.yesBetResult.cpmmState.pool,
        ]
        const diff = 1 - sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5))
        return diff
    })

    const result = buyNoSharesInOtherAnswersThenYesInAnswer(
        answers,
        answerToBuy,
        unfilledBetsByAnswer,
        balanceByUserId,
        betAmount,
        limitProb,
        noShares,
        collectedFees
    )
    if (!result) {
        console.log('no result', result)
        throw new Error('Invariant failed in calculateCpmmMultiArbitrageBetYes')
    }

    const { noBetResults, yesBetResult } = result

    if (DEBUG) {
        const endTime = Date.now()
        const newPools = [
            ...noBetResults.map((r) => r.cpmmState.pool),
            yesBetResult.cpmmState.pool,
        ]
        console.log('time', endTime - startTime, 'ms')
        console.log(
            'bet amount',
            betAmount,
            'no bet amounts',
            noBetResults.map((r) => r.takers.map((t) => t.amount)),
            'yes bet amount',
            sumBy(yesBetResult.takers, 'amount')
        )
        console.log(
            'getBinaryBuyYes after',
            newPools,
            newPools.map((pool) => getCpmmProbability(pool, 0.5)),
            'prob total',
            sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5))
        )
    }

    const newBetResult = { ...yesBetResult, outcome: 'YES' }
    const otherBetResults = noBetResults.map((r) => ({ ...r, outcome: 'NO' }))
    return { newBetResult, otherBetResults }
}

const buyNoSharesInOtherAnswersThenYesInAnswer = (
    answers: Answer[],
    answerToBuy: Answer,
    unfilledBetsByAnswer: Dictionary<LimitBet[]>,
    balanceByUserId: { [userId: string]: number },
    betAmount: number,
    limitProb: number | undefined,
    noShares: number,
    collectedFees: Fees
) => {
    const otherAnswers = answers.filter((a) => a.id !== answerToBuy.id)
    const noAmounts = otherAnswers.map(({ id, poolYes, poolNo }) =>
        calculateAmountToBuySharesFixedP(
            { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
            noShares,
            'NO',
            unfilledBetsByAnswer[id] ?? [],
            balanceByUserId,
            true
        )
    )
    const totalNoAmount = sum(noAmounts)

    const noBetResults = noAmounts.map((noAmount, i) => {
        const answer = otherAnswers[i]
        const pool = { YES: answer.poolYes, NO: answer.poolNo }
        return {
            ...computeFills(
                { pool, p: 0.5, collectedFees },
                'NO',
                noAmount,
                undefined,
                unfilledBetsByAnswer[answer.id] ?? [],
                balanceByUserId,
                undefined,
                true
            ),
            answer,
        }
    })

    // Identity: No shares in all other answers is equal to noShares * (n-2) mana + yes shares in answerToBuy (quantity: noShares)
    const redeemedAmount = noShares * (answers.length - 2)
    const netNoAmount = totalNoAmount - redeemedAmount
    let yesBetAmount = betAmount - netNoAmount
    if (floatingArbitrageEqual(yesBetAmount, 0)) {
        yesBetAmount = 0
    }
    if (yesBetAmount < 0) {
        return undefined
    }

    for (const noBetResult of noBetResults) {
        const redemptionFill = {
            matchedBetId: null,
            amount: -sumBy(noBetResult.takers, 'amount'),
            shares: -sumBy(noBetResult.takers, 'shares'),
            timestamp: Date.now(),
            fees: noFees,
        }
        noBetResult.takers.push(redemptionFill)
    }

    const pool = { YES: answerToBuy.poolYes, NO: answerToBuy.poolNo }
    const yesBetResult = {
        ...computeFills(
            { pool, p: 0.5, collectedFees },
            'YES',
            yesBetAmount,
            limitProb,
            unfilledBetsByAnswer[answerToBuy.id] ?? [],
            balanceByUserId
        ),
        answer: answerToBuy,
    }

    // Redeem NO shares in other answers to YES shares in this answer.
    const redemptionFill = {
        matchedBetId: null,
        amount: netNoAmount,
        shares: noShares,
        timestamp: Date.now(),
        fees: noFees,
    }
    yesBetResult.takers.push(redemptionFill)

    return { noBetResults, yesBetResult }
}

function calculateCpmmMultiArbitrageBetNo(
    answers: Answer[],
    answerToBuy: Answer,
    betAmount: number,
    limitProb: number | undefined,
    unfilledBets: LimitBet[],
    balanceByUserId: { [userId: string]: number },
    collectedFees: Fees
) {
    const startTime = Date.now()
    const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)

    const yesSharePriceSum = sumBy(
        answers.filter((a) => a.id !== answerToBuy.id),
        'prob'
    )
    const maxYesShares = betAmount / yesSharePriceSum

    const yesShares = binarySearch(0, maxYesShares, (yesShares) => {
        const result = buyYesSharesInOtherAnswersThenNoInAnswer(
            answers,
            answerToBuy,
            unfilledBetsByAnswer,
            balanceByUserId,
            betAmount,
            limitProb,
            yesShares,
            collectedFees
        )
        if (!result) return 1
        const { yesBetResults, noBetResult } = result
        const newPools = [
            ...yesBetResults.map((r) => r.cpmmState.pool),
            noBetResult.cpmmState.pool,
        ]
        const diff = sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5)) - 1
        return diff
    })

    const result = buyYesSharesInOtherAnswersThenNoInAnswer(
        answers,
        answerToBuy,
        unfilledBetsByAnswer,
        balanceByUserId,
        betAmount,
        limitProb,
        yesShares,
        collectedFees
    )
    if (!result) {
        throw new Error('Invariant failed in calculateCpmmMultiArbitrageBetNo')
    }
    const { yesBetResults, noBetResult } = result

    if (DEBUG) {
        const endTime = Date.now()
        const newPools = [
            ...yesBetResults.map((r) => r.cpmmState.pool),
            noBetResult.cpmmState.pool,
        ]
        console.log('time', endTime - startTime, 'ms')
        console.log(
            'bet amount',
            betAmount,
            'yes bet amounts',
            yesBetResults.map((r) => r.takers.map((t) => t.amount)),
            'no bet amount',
            sumBy(noBetResult.takers, 'amount')
        )
        console.log(
            'getBinaryBuyNo after',
            newPools,
            newPools.map((pool) => getCpmmProbability(pool, 0.5)),
            'prob total',
            sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5))
        )
    }

    const newBetResult = { ...noBetResult, outcome: 'NO' }
    const otherBetResults = yesBetResults.map((r) => ({ ...r, outcome: 'YES' }))
    return { newBetResult, otherBetResults }
}

const buyYesSharesInOtherAnswersThenNoInAnswer = (
    answers: Answer[],
    answerToBuy: Answer,
    unfilledBetsByAnswer: Dictionary<LimitBet[]>,
    balanceByUserId: { [userId: string]: number },
    betAmount: number,
    limitProb: number | undefined,
    yesShares: number,
    collectedFees: Fees
) => {
    const otherAnswers = answers.filter((a) => a.id !== answerToBuy.id)
    const yesAmounts = otherAnswers.map(({ id, poolYes, poolNo }) =>
        calculateAmountToBuySharesFixedP(
            { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
            yesShares,
            'YES',
            unfilledBetsByAnswer[id] ?? [],
            balanceByUserId,
            true
        )
    )
    const totalYesAmount = sum(yesAmounts)

    const yesBetResults = yesAmounts.map((yesAmount, i) => {
        const answer = otherAnswers[i]
        const { poolYes, poolNo } = answer
        return {
            ...computeFills(
                { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
                'YES',
                yesAmount,
                undefined,
                unfilledBetsByAnswer[answer.id] ?? [],
                balanceByUserId,
                undefined,
                true
            ),
            answer,
        }
    })

    let noBetAmount = betAmount - totalYesAmount
    if (floatingArbitrageEqual(noBetAmount, 0)) {
        noBetAmount = 0
    }
    if (noBetAmount < 0) {
        return undefined
    }

    for (const yesBetResult of yesBetResults) {
        const redemptionFill = {
            matchedBetId: null,
            amount: -sumBy(yesBetResult.takers, 'amount'),
            shares: -sumBy(yesBetResult.takers, 'shares'),
            timestamp: Date.now(),
            fees: noFees,
        }
        yesBetResult.takers.push(redemptionFill)
    }

    const pool = { YES: answerToBuy.poolYes, NO: answerToBuy.poolNo }
    const noBetResult = {
        ...computeFills(
            { pool, p: 0.5, collectedFees },
            'NO',
            noBetAmount,
            limitProb,
            unfilledBetsByAnswer[answerToBuy.id] ?? [],
            balanceByUserId
        ),
        answer: answerToBuy,
    }
    // Redeem YES shares in other answers to NO shares in this answer.
    const redemptionFill = {
        matchedBetId: null,
        amount: totalYesAmount,
        shares: yesShares,
        timestamp: Date.now(),
        fees: noFees,
    }
    noBetResult.takers.push(redemptionFill)

    return { yesBetResults, noBetResult }
}

export const buyNoSharesUntilAnswersSumToOne = (
    answers: Answer[],
    unfilledBets: LimitBet[],
    balanceByUserId: { [userId: string]: number },
    collectedFees: Fees,
    answerIdsWithFees?: string[]
) => {
    const baseUnfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)

    let maxNoShares = 10
    do {
        const result = buyNoSharesInAnswers(
            answers,
            { ...baseUnfilledBetsByAnswer },
            { ...balanceByUserId },
            maxNoShares,
            collectedFees,
            answerIdsWithFees,
            false
        )
        const newPools = result.noBetResults.map((r) => r.cpmmState.pool)
        const probSum = sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5))
        if (probSum < 1) break
        maxNoShares *= 10
    } while (true)

    const noShares = binarySearch(0, maxNoShares, (noShares) => {
        const result = buyNoSharesInAnswers(
            answers,
            { ...baseUnfilledBetsByAnswer },
            { ...balanceByUserId },
            noShares,
            collectedFees,
            answerIdsWithFees,
            false
        )
        const newPools = result.noBetResults.map((r) => r.cpmmState.pool)
        const diff = 1 - sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5))
        return diff
    })

    return buyNoSharesInAnswers(
        answers,
        baseUnfilledBetsByAnswer,
        { ...balanceByUserId },
        noShares,
        collectedFees,
        answerIdsWithFees,
        true
    )
}

const buyNoSharesInAnswers = (
    answers: Answer[],
    unfilledBetsByAnswer: Dictionary<LimitBet[]>,
    balanceByUserId: { [userId: string]: number },
    noShares: number,
    collectedFees: Fees,
    answerIdsWithFees?: string[],
    updateOrders: boolean = true
) => {
    let totalNoAmount = 0
    const noBetResults: PreliminaryBetResults[] = []
    for (const answer of answers) {
        const { id, poolYes, poolNo } = answer
        const pool = { YES: poolYes, NO: poolNo }
        const noAmount = calculateAmountToBuySharesFixedP(
            { pool, p: 0.5, collectedFees },
            noShares,
            'NO',
            unfilledBetsByAnswer[id] ?? [],
            balanceByUserId,
            !answerIdsWithFees?.includes(id)
        )
        totalNoAmount += noAmount

        const res = {
            ...computeFills(
                { pool, p: 0.5, collectedFees },
                'NO',
                noAmount,
                undefined,
                unfilledBetsByAnswer[id] ?? [],
                balanceByUserId,
                undefined,
                !answerIdsWithFees?.includes(id)
            ),
            answer,
        }

        noBetResults.push(res)
    }
    // Identity: No shares in all other answers is equal to noShares * (n-1) mana
    const redeemedAmount = noShares * (answers.length - 1)
    const extraMana = redeemedAmount - totalNoAmount

    for (const noBetResult of noBetResults) {
        const redemptionFill = {
            matchedBetId: null,
            amount: -sumBy(noBetResult.takers, 'amount'),
            shares: -sumBy(noBetResult.takers, 'shares'),
            timestamp: Date.now(),
            fees: noBetResult.totalFees,
        }
        noBetResult.takers.push(redemptionFill)
    }

    return { noBetResults, extraMana }
}

export const combineBetsOnSameAnswers = (
    bets: PreliminaryBetResults[],
    outcome: 'YES' | 'NO',
    updatedAnswers: Answer[],
    collectedFees: Fees,
    fillsFollowingFirstAreFree?: boolean,
    extraFeesPerAnswer?: { [answerId: string]: Fees }
) => {
    return updatedAnswers.map((answer) => {
        const betsForAnswer = bets.filter((bet) => bet.answer.id === answer.id)
        const { poolYes, poolNo } = answer
        const bet = betsForAnswer[0]
        const extraFees = extraFeesPerAnswer?.[answer.id] ?? noFees
        const totalFees = betsForAnswer.reduce(
            (acc, b) => addObjects(acc, b.totalFees),
            extraFees
        )
        const takers = betsForAnswer.flatMap((r) => r.takers)
        const adjustedTakers = fillsFollowingFirstAreFree
            ? (() => {
                const cloned = takers.map((t) => ({ ...t }))
                let idx = 0
                for (const r of betsForAnswer) {
                    const count = r.takers.length
                    const slice = cloned.slice(idx, idx + count)
                    if ((r.iteration ?? 0) > 0) {
                        for (const t of slice) {
                            t.amount = 0
                            t.fees = noFees
                        }
                    }
                    idx += count
                }
                return cloned
            })()
            : takers
        return {
            ...bet,
            takers: adjustedTakers,
            makers: betsForAnswer.flatMap((r) => r.makers),
            ordersToCancel: betsForAnswer.flatMap((r) => r.ordersToCancel),
            outcome,
            cpmmState: { p: 0.5, pool: { YES: poolYes, NO: poolNo }, collectedFees },
            answer,
            totalFees,
        }
    })
}

export function floatingArbitrageEqual(a: number, b: number, epsilon = 0.001) {
    return Math.abs(a - b) < epsilon
}

// Export for selling
export function calculateCpmmMultiArbitrageSellYes(
    answers: Answer[],
    answerToSell: Answer,
    yesShares: number,
    limitProb: number | undefined,
    unfilledBets: LimitBet[],
    balanceByUserId: { [userId: string]: number },
    collectedFees: Fees
) {
    const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)
    const { id, poolYes, poolNo } = answerToSell
    const pool = { YES: poolYes, NO: poolNo }
    const answersWithoutAnswerToSell = answers.filter(
        (a) => a.id !== answerToSell.id
    )

    const noShares = binarySearch(0, yesShares, (noShares) => {
        const yesSharesInOtherAnswers = yesShares - noShares
        const noAmount = calculateAmountToBuySharesFixedP(
            { pool, p: 0.5, collectedFees },
            noShares,
            'NO',
            unfilledBetsByAnswer[id] ?? [],
            balanceByUserId
        )
        const yesAmounts = answersWithoutAnswerToSell.map(
            ({ id, poolYes, poolNo }) =>
                calculateAmountToBuySharesFixedP(
                    { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
                    yesSharesInOtherAnswers,
                    'YES',
                    unfilledBetsByAnswer[id] ?? [],
                    balanceByUserId,
                    true
                )
        )

        const noResult = computeFills(
            { pool, p: 0.5, collectedFees },
            'NO',
            noAmount,
            limitProb,
            unfilledBetsByAnswer[id] ?? [],
            balanceByUserId
        )
        const yesResults = answersWithoutAnswerToSell.map((answer, i) => {
            const yesAmount = yesAmounts[i]
            const pool = { YES: answer.poolYes, NO: answer.poolNo }
            return computeFills(
                { pool, p: 0.5, collectedFees },
                'YES',
                yesAmount,
                undefined,
                unfilledBetsByAnswer[answer.id] ?? [],
                balanceByUserId,
                undefined,
                true
            )
        })

        const newPools = [
            noResult.cpmmState.pool,
            ...yesResults.map((r) => r.cpmmState.pool),
        ]
        const diff = 1 - sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5))
        return diff
    })

    const yesSharesInOtherAnswers = yesShares - noShares
    const noAmount = calculateAmountToBuySharesFixedP(
        { pool, p: 0.5, collectedFees },
        noShares,
        'NO',
        unfilledBetsByAnswer[id] ?? [],
        balanceByUserId
    )
    const yesAmounts = answersWithoutAnswerToSell.map(({ id, poolYes, poolNo }) =>
        calculateAmountToBuySharesFixedP(
            { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
            yesSharesInOtherAnswers,
            'YES',
            unfilledBetsByAnswer[id] ?? [],
            balanceByUserId,
            true
        )
    )
    const noBetResult = computeFills(
        { pool, p: 0.5, collectedFees },
        'NO',
        noAmount,
        limitProb,
        unfilledBetsByAnswer[id] ?? [],
        balanceByUserId
    )
    const yesBetResults = answersWithoutAnswerToSell.map((answer, i) => {
        const yesAmount = yesAmounts[i]
        const pool = { YES: answer.poolYes, NO: answer.poolNo }
        return {
            ...computeFills(
                { pool, p: 0.5, collectedFees },
                'YES',
                yesAmount,
                undefined,
                unfilledBetsByAnswer[answer.id] ?? [],
                balanceByUserId,
                undefined,
                true
            ),
            answer,
        }
    })

    const totalYesAmount = sum(yesAmounts)
    const now = Date.now()

    for (const yesBetResult of yesBetResults) {
        const redemptionFill = {
            matchedBetId: null,
            amount: -sumBy(yesBetResult.takers, 'amount'),
            shares: -sumBy(yesBetResult.takers, 'shares'),
            timestamp: now,
            fees: noFees,
        }
        yesBetResult.takers.push(redemptionFill)
    }

    const arbitrageFee =
        yesSharesInOtherAnswers === 0
            ? 0
            : getTakerFee(
                yesSharesInOtherAnswers,
                totalYesAmount / yesSharesInOtherAnswers
            )
    const arbitrageFees = getFeesSplit(arbitrageFee)
    noBetResult.takers.push({
        matchedBetId: null,
        amount: totalYesAmount + arbitrageFee,
        shares: yesSharesInOtherAnswers,
        timestamp: now,
        fees: arbitrageFees,
    })
    noBetResult.totalFees = addObjects(noBetResult.totalFees, arbitrageFees)

    const newBetResult = { ...noBetResult, outcome: 'NO', answer: answerToSell }
    const otherBetResults = yesBetResults.map((r) => ({ ...r, outcome: 'YES' }))
    return { newBetResult, otherBetResults }
}

export function calculateCpmmMultiArbitrageSellNo(
    answers: Answer[],
    answerToSell: Answer,
    noShares: number,
    limitProb: number | undefined,
    unfilledBets: LimitBet[],
    balanceByUserId: { [userId: string]: number },
    collectedFees: Fees
) {
    const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)
    const { id, poolYes, poolNo } = answerToSell
    const pool = { YES: poolYes, NO: poolNo }
    const answersWithoutAnswerToSell = answers.filter(
        (a) => a.id !== answerToSell.id
    )

    const yesShares = binarySearch(0, noShares, (yesShares) => {
        const noSharesInOtherAnswers = noShares - yesShares
        const yesAmount = calculateAmountToBuySharesFixedP(
            { pool, p: 0.5, collectedFees },
            yesShares,
            'YES',
            unfilledBetsByAnswer[id] ?? [],
            balanceByUserId
        )
        const noAmounts = answersWithoutAnswerToSell.map(
            ({ id, poolYes, poolNo }) =>
                calculateAmountToBuySharesFixedP(
                    { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
                    noSharesInOtherAnswers,
                    'NO',
                    unfilledBetsByAnswer[id] ?? [],
                    balanceByUserId,
                    true
                )
        )

        const yesResult = computeFills(
            { pool, p: 0.5, collectedFees },
            'YES',
            yesAmount,
            limitProb,
            unfilledBetsByAnswer[id] ?? [],
            balanceByUserId
        )
        const noResults = answersWithoutAnswerToSell.map((answer, i) => {
            const noAmount = noAmounts[i]
            const pool = { YES: answer.poolYes, NO: answer.poolNo }
            return computeFills(
                { pool, p: 0.5, collectedFees },
                'NO',
                noAmount,
                undefined,
                unfilledBetsByAnswer[answer.id] ?? [],
                balanceByUserId,
                undefined,
                true
            )
        })

        const newPools = [
            yesResult.cpmmState.pool,
            ...noResults.map((r) => r.cpmmState.pool),
        ]
        const diff = sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5)) - 1
        return diff
    })

    const noSharesInOtherAnswers = noShares - yesShares
    const yesAmount = calculateAmountToBuySharesFixedP(
        { pool, p: 0.5, collectedFees },
        yesShares,
        'YES',
        unfilledBetsByAnswer[id] ?? [],
        balanceByUserId
    )
    const noAmounts = answersWithoutAnswerToSell.map(({ id, poolYes, poolNo }) =>
        calculateAmountToBuySharesFixedP(
            { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
            noSharesInOtherAnswers,
            'NO',
            unfilledBetsByAnswer[id] ?? [],
            balanceByUserId,
            true
        )
    )
    const yesBetResult = computeFills(
        { pool, p: 0.5, collectedFees },
        'YES',
        yesAmount,
        limitProb,
        unfilledBetsByAnswer[id] ?? [],
        balanceByUserId
    )
    const noBetResults = answersWithoutAnswerToSell.map((answer, i) => {
        const noAmount = noAmounts[i]
        const pool = { YES: answer.poolYes, NO: answer.poolNo }
        return {
            ...computeFills(
                { pool, p: 0.5, collectedFees },
                'NO',
                noAmount,
                undefined,
                unfilledBetsByAnswer[answer.id] ?? [],
                balanceByUserId,
                undefined,
                true
            ),
            answer,
        }
    })

    const redeemedMana = noSharesInOtherAnswers * (answers.length - 2)
    const netNoAmount = sum(noAmounts) - redeemedMana

    const now = Date.now()
    for (const noBetResult of noBetResults) {
        const redemptionFill = {
            matchedBetId: null,
            amount: -sumBy(noBetResult.takers, 'amount'),
            shares: -sumBy(noBetResult.takers, 'shares'),
            timestamp: now,
            fees: noFees,
        }
        noBetResult.takers.push(redemptionFill)
    }

    const arbitrageFee =
        noSharesInOtherAnswers === 0
            ? 0
            : getTakerFee(
                noSharesInOtherAnswers,
                netNoAmount / noSharesInOtherAnswers
            )
    const arbitrageFees = getFeesSplit(arbitrageFee)
    yesBetResult.takers.push({
        matchedBetId: null,
        amount: netNoAmount + arbitrageFee,
        shares: noSharesInOtherAnswers,
        timestamp: now,
        fees: arbitrageFees,
    })
    yesBetResult.totalFees = addObjects(yesBetResult.totalFees, arbitrageFees)

    const newBetResult = { ...yesBetResult, outcome: 'YES', answer: answerToSell }
    const otherBetResults = noBetResults.map((r) => ({ ...r, outcome: 'NO' }))
    return { newBetResult, otherBetResults }
}
