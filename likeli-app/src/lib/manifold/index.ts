// lib/manifold/index.ts
// Main export file for Manifold backend

// Types
export * from './types';

// Fees
export type { Fees } from './fees';
export { noFees, getTakerFee, getFeesSplit, getFeeTotal, sumAllFees } from './fees';

// Utilities
export { binarySearch } from './util/algos';
export { EPSILON, floatingEqual, floatingGreater, floatingGreaterEqual, floatingLesserEqual } from './util/math';
export { addObjects } from './util/object';

// NEW: Calculate CPMM (exact Manifold)
export type { CpmmState } from './calculate-cpmm';
export {
    getCpmmProbability,
    calculateCpmmShares,
    getCpmmFees,
    calculateCpmmSharesAfterFee,
    calculateCpmmPurchase,
    calculateCpmmAmountToProb,
    calculateCpmmAmountToProbIncludingFees,
    calculateCpmmAmountToBuySharesFixedP,
    computeFills,
    calculateAmountToBuySharesFixedP,
    calculateAmountToBuyShares,
    calculateCpmmSale,
    getCpmmProbabilityAfterSale,
    getCpmmLiquidity,
    getMultiCpmmLiquidity,
    addCpmmLiquidity,
    addCpmmLiquidityFixedP,
    MINIMUM_LIQUIDITY,
    removeCpmmLiquidity,
    maximumRemovableLiquidity,
    getLiquidity,
    MAX_CPMM_PROB,
    MIN_CPMM_PROB,
} from './calculate-cpmm';

// NEW: Calculate CPMM Arbitrage (exact Manifold for sum-to-one)
export {
    calculateCpmmMultiArbitrageBet,
    calculateCpmmMultiArbitrageSellYes,
    calculateCpmmMultiArbitrageSellNo,
    buyNoSharesUntilAnswersSumToOne,
    combineBetsOnSameAnswers,
    floatingArbitrageEqual,
} from './calculate-cpmm-arbitrage';
export type { ArbitrageBetArray, PreliminaryBetResults } from './calculate-cpmm-arbitrage';

// CPMM Core (legacy - kept for backward compatibility)
export {
    getK,
    calculateCpmmAmountForShares,
    addLiquidity,
    createInitialPool,
    calculateElasticity,
    estimatePriceImpact,
    validateTrade,
    createMultiChoicePools,
    generateId,
    generateSlug
} from './cpmm';

// Store (internal use)
export {
    contracts,
    users,
    getOrCreateUser,
    updateUserBalance,
    getUserBalance,
    saveContract,
    getContract,
    getAllContracts,
    addBet,
    getBets,
    getOrCreateMetric,
    updateMetric,
    getMetricsForContract,
    getUserMetrics,
    addPricePoint
} from './store';

// Place Bet
export { placeBet, placeAnswerBet } from './place-bet';
export type { PlaceBetParams, PlaceBetResult } from './place-bet';

// Sell Shares
export { sellShares, getSellableShares } from './sell-shares';
export type { SellSharesParams, SellSharesResult } from './sell-shares';

// Create Market
export { createMarket, validateAnswers } from './create-market';
export type { CreateMarketParams, CreateMarketResult } from './create-market';

// Resolve Market
export { resolveMarket, canResolve } from './resolve-market';
export type { ResolveMarketParams, ResolveMarketResult, Payout } from './resolve-market';

// Price History
export {
    getPriceHistory,
    downsamplePoints,
    getBetHistory,
    getPriceAtTime,
    getFullPriceHistory,
    getMultiChoiceChartData,
    formatChartResponse
} from './price-history';
export type { BetPoint } from './price-history';

// Limit Orders
export {
    matchLimitOrders,
    placeLimitOrder,
    checkAndFillLimitOrders,
    getLimitOrders,
    addLimitOrder,
    cancelLimitOrder,
    cancelUserOrder,
    getUserOpenOrders,
    expireLimitOrders,
    getActiveLimitOrders,
    getOrderBookLevels
} from './limit-orders';
export type { PlaceLimitOrderParams, PlaceLimitOrderResult, ExpireLimitOrdersResult } from './limit-orders';

// Redemption System
export {
    getBinaryRedeemableAmountFromContractMetric,
    getBinaryRedeemableAmount,
    getRedemptionBets,
    createRedemptionBets,
    redeemShares,
    executeRedemption,
    redeemSharesForUsers
} from './redeem';
export type { RedeemResult } from './redeem';

// Bonus Systems
export {
    checkAndPayUniqueBettorBonus,
    checkAndUpdateBettingStreak,
    UNIQUE_BETTOR_BONUS_AMOUNT,
    STREAK_BONUS_AMOUNTS
} from './bonuses';
export type { UniqueBettorBonusResult, StreakResult } from './bonuses';

// Legacy Arbitrage (kept for backward compatibility)
export {
    calculateArbitrageBuyYes,
    calculateArbitrageBuyNo,
    placeArbitrageBet
} from './arbitrage';
export type { ArbitrageBetResult, MultiArbitrageResult } from './arbitrage';

// Multi-Bet Operations
export {
    placeMultiBet,
    multiSell
} from './multi-bet';
export type { PlaceMultiBetParams, PlaceMultiBetResult, MultiSellParams, MultiSellResult } from './multi-bet';
