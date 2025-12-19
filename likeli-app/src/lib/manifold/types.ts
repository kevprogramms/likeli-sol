// lib/manifold/types.ts
// Complete Manifold Types - 100% Match

// ============================================
// CORE TYPES
// ============================================

export interface User {
    id: string;
    username: string;
    name: string;
    balance: number;
    totalDeposits: number;
    createdTime: number;
    // Betting streak tracking
    currentBettingStreak?: number;
    lastBetTime?: number;
}

export interface Pool {
    YES: number;
    NO: number;
    [outcome: string]: number;
}

export type Mechanism = 'cpmm-1' | 'cpmm-multi-1';
export type OutcomeType = 'BINARY' | 'MULTIPLE_CHOICE' | 'PSEUDO_NUMERIC';
export type Resolution = 'YES' | 'NO' | 'MKT' | 'CANCEL';
export type Phase = 'sandbox' | 'graduating' | 'main';

export interface Contract {
    id: string;
    slug: string;
    question: string;
    creatorId: string;
    mechanism: Mechanism;
    outcomeType: OutcomeType;

    // Pool state
    pool: Pool;
    p: number;  // Probability

    // Liquidity
    totalLiquidity: number;
    subsidyPool: number;

    // Stats
    volume: number;
    uniqueBettorCount: number;

    // Timestamps
    createdTime: number;
    closeTime?: number;
    resolutionTime?: number;
    lastBetTime?: number;
    lastUpdatedTime: number;

    // Resolution
    resolution?: Resolution;
    resolutionProbability?: number;

    // Multi-choice
    answers?: Answer[];
    shouldAnswersSumToOne?: boolean;

    // Graduation (Likeli-specific)
    phase: Phase;
    graduationStartTime?: number;
    category?: string;

    // ============================================
    // ORACLE FIELDS
    // ============================================

    // Resolution source configuration
    resolutionSource?: {
        type: 'crypto_price' | 'api' | 'manual';
        asset?: string;          // e.g., "bitcoin"
        targetPrice?: number;    // e.g., 100000
        condition?: 'gte' | 'lte' | 'gt' | 'lt' | 'eq';
        url?: string;            // For API type
        deadline: number;        // When to resolve
        description?: string;    // Human-readable criteria
    };

    // Oracle proposal
    oracleProposal?: {
        resolution: Resolution;
        proposedAt: number;
        proposedBy: 'AI' | string;
        reasoning: string;
        sourceSnapshot: string;
        challengeWindowEnd: number;
    };

    // Challenge against proposal
    oracleChallenge?: {
        challengerId: string;
        bondAmount: number;
        reason: string;
        challengedAt: number;
    };

    // Oracle status
    oracleStatus?: 'UNRESOLVED' | 'PENDING' | 'PROVISIONAL' | 'CHALLENGED' | 'FINALIZED';
}

export interface Answer {
    id: string;
    contractId: string;
    text: string;
    poolYes: number;
    poolNo: number;
    prob: number;
    p?: number; // Multi-choice answers may have independent p parameters
    totalLiquidity: number;
    subsidyPool: number;
    volume: number;
    resolution?: string;
    resolutionTime?: number;
    resolutionProbability?: number;
    index: number;
    createdTime: number;
}

export interface Bet {
    id: string;
    contractId: string;
    userId: string;
    answerId?: string;    // For multi-choice

    amount: number;       // Total bet size
    shares: number;       // Shares received
    outcome: 'YES' | 'NO';

    probBefore: number;
    probAfter: number;

    fees?: Fees;          // Trading fees
    isRedemption: boolean;
    isApi?: boolean;      // Via API?

    createdTime: number;
    updatedTime?: number;

    // LIMIT ORDER FIELDS
    limitProb?: number;       // Target probability (0-1)
    orderAmount?: number;     // Original order amount
    isFilled: boolean;        // All shares purchased?
    isCancelled: boolean;     // User cancelled?
    expiresAt?: number;       // Expiration timestamp (ms)
    fills?: Fill[];           // Individual fill transactions

    betGroupId?: string;      // Links related bets together
}

// Fee structure
export interface Fees {
    creatorFee: number;
    platformFee: number;
    liquidityFee: number;
}

export const noFees: Fees = {
    creatorFee: 0,
    platformFee: 0,
    liquidityFee: 0
};

export interface LimitBet extends Bet {
    limitProb: number;
    orderAmount: number;
    isFilled: boolean;
    isCancelled: boolean;
    fills: Fill[];
    expiresAt?: number;
    answerId?: string; // For multi-choice markets
}

/** Individual fill transaction when order is partially/fully matched */
export interface Fill {
    matchedBetId: string | null;  // ID of matched limit order, null if pool
    amount: number;               // Amount filled
    shares: number;               // Shares from this fill
    timestamp: number;
    fees: Fees;
    isSale?: boolean;             // Is this a sale fill?
}

/** A maker (limit order that got matched) */
export interface Maker {
    bet: LimitBet;
    amount: number;
    shares: number;
    timestamp: number;
}

export interface ContractMetric {
    id: string;
    userId: string;
    contractId: string;
    answerId?: string;    // NULL for summary, answerId for per-answer

    // Position tracking
    hasYesShares: boolean;
    hasNoShares: boolean;
    hasShares?: boolean;  // Convenience: hasYesShares || hasNoShares
    totalSharesYes: number;
    totalSharesNo: number;

    // Financial tracking
    invested: number;
    payout: number;
    profit: number;
}

export interface Transaction {
    id: string;
    fromId: string;
    fromType: 'USER' | 'CONTRACT' | 'BANK';
    toId: string;
    toType: 'USER' | 'CONTRACT' | 'BANK';
    amount: number;
    category: string;
    token: string;
    createdTime: number;
}

export interface CpmmState {
    pool: Pool;
    p: number;
}

export interface BuyResult {
    shares: number;
    newPool: Pool;
    probBefore: number;
    probAfter: number;
}

export interface SellResult {
    payout: number;
    newPool: Pool;
    probBefore: number;
    probAfter: number;
}

export interface PricePoint {
    timestamp: number;
    probability: number;
}

// ============================================
// CONFIGURATION CONSTANTS
// ============================================

/** Minimum ante required to create a market */
export const MINIMUM_ANTE = 100;

/** Multiplier applied to ante when creating initial pool */
export const LIQUIDITY_MULTIPLIER = 50;

/** Minimum pool quantity - prevents pool draining */
export const CPMM_MIN_POOL_QTY = 0.01;

/** Fee per trade (0 to 0.1 recommended) */
export const TRADING_FEE = 0;

/** Maximum answers for multi-choice */
export const MAX_ANSWERS = 20;

/** Maximum probability for CPMM */
export const MAX_CPMM_PROB = 0.99;

/** Minimum probability for CPMM */
export const MIN_CPMM_PROB = 0.01;
