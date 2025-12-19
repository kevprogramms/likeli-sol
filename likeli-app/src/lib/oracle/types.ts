// lib/oracle/types.ts
// Oracle-related type definitions

import { Resolution } from "@/lib/manifold/types";

// Resolution source configuration
export interface ResolutionSource {
    type: 'crypto_price' | 'sports_game' | 'api' | 'manual';

    // For crypto_price type
    asset?: string;          // e.g., "bitcoin", "ethereum"
    targetPrice?: number;    // e.g., 100000
    condition?: 'gte' | 'lte' | 'gt' | 'lt' | 'eq';  // >= <= > < ==

    // For sports_game type
    league?: string;         // e.g., "nba", "nfl", "mlb", "nhl"
    teamToWin?: string;      // Team abbreviation that must win for YES
    gameId?: string;         // ESPN game ID (optional, auto-detected from teams + date)
    homeTeam?: string;       // Home team abbreviation
    awayTeam?: string;       // Away team abbreviation
    gameDate?: string;       // Game date (YYYY-MM-DD)

    // For api type
    url?: string;            // API endpoint
    jsonPath?: string;       // JSONPath to value

    // Common
    deadline: number;        // Unix timestamp when to check
    description?: string;    // Human-readable criteria
}

// Proposal from the oracle
export interface OracleProposal {
    resolution: Resolution;       // YES | NO | MKT
    proposedAt: number;           // Timestamp
    proposedBy: 'AI' | string;    // 'AI' or user ID for manual
    reasoning: string;            // Why this resolution
    sourceSnapshot: string;       // What data was seen
    challengeWindowEnd: number;   // When window closes
}

// Challenge against a proposal
export interface OracleChallenge {
    challengerId: string;
    bondAmount: number;
    reason: string;
    challengedAt: number;
}

// Resolution status
export type OracleStatus =
    | 'UNRESOLVED'      // Waiting for deadline
    | 'PENDING'         // Deadline passed, waiting for proposal
    | 'PROVISIONAL'     // Proposed, in challenge window
    | 'CHALLENGED'      // Someone challenged
    | 'FINALIZED';      // Done, winners paid

// Result from proposal
export interface ProposalResult {
    success: boolean;
    error?: string;
    proposal?: OracleProposal;
}

// Result from challenge
export interface ChallengeResult {
    success: boolean;
    error?: string;
}

// Result from finalization
export interface FinalizeResult {
    success: boolean;
    error?: string;
    resolution?: Resolution;
    payoutsCount?: number;
}

// Crypto price response from CoinGecko
export interface CryptoPrice {
    [asset: string]: {
        usd: number;
    };
}

// ESPN API response types
export interface ESPNScoreboard {
    events: ESPNEvent[];
}

export interface ESPNEvent {
    id: string;
    name: string;          // "Lakers at Warriors"
    date: string;          // ISO date
    status: {
        type: {
            completed: boolean;
            description: string;  // "Final", "In Progress", "Scheduled"
        };
    };
    competitions: ESPNCompetition[];
}

export interface ESPNCompetition {
    id: string;
    competitors: ESPNCompetitor[];
}

export interface ESPNCompetitor {
    id: string;
    team: {
        id: string;
        abbreviation: string;  // "LAL", "GSW"
        displayName: string;   // "Los Angeles Lakers"
    };
    score: string;
    homeAway: 'home' | 'away';
    winner?: boolean;
}

// Sports league configuration
export type SportsLeague = 'nba' | 'nfl' | 'mlb' | 'nhl' | 'mls';

