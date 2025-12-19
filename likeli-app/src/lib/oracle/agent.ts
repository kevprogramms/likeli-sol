// lib/oracle/agent.ts
// Oracle agent - fetches data and proposes resolutions

import {
    ResolutionSource,
    OracleProposal,
    ProposalResult,
    CryptoPrice,
    ESPNScoreboard,
    ESPNEvent
} from './types';
import {
    COINGECKO_API,
    ESPN_API,
    SUPPORTED_LEAGUES,
    CHALLENGE_WINDOW_MS
} from './config';
import { Resolution } from '@/lib/manifold/types';

/**
 * Fetch current price from CoinGecko
 */
export async function fetchCryptoPrice(asset: string): Promise<number | null> {
    try {
        const url = `${COINGECKO_API}/simple/price?ids=${asset}&vs_currencies=usd`;
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`[Oracle] CoinGecko error: ${response.status}`);
            return null;
        }

        const data: CryptoPrice = await response.json();
        return data[asset]?.usd ?? null;
    } catch (error) {
        console.error('[Oracle] Failed to fetch price:', error);
        return null;
    }
}

/**
 * Fetch game data from ESPN
 */
export async function fetchESPNGame(
    league: string,
    gameDate?: string,
    homeTeam?: string,
    awayTeam?: string,
    gameId?: string
): Promise<ESPNEvent | null> {
    try {
        const leagueConfig = SUPPORTED_LEAGUES[league];
        if (!leagueConfig) {
            console.error(`[Oracle] Unsupported league: ${league}`);
            return null;
        }

        // Build URL with date if provided
        let url = `${ESPN_API}/${leagueConfig.path}/scoreboard`;
        if (gameDate) {
            // Format: YYYYMMDD
            const dateStr = gameDate.replace(/-/g, '');
            url += `?dates=${dateStr}`;
        }

        console.log(`[Oracle] Fetching ESPN: ${url}`);
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`[Oracle] ESPN error: ${response.status}`);
            return null;
        }

        const data: ESPNScoreboard = await response.json();

        if (!data.events || data.events.length === 0) {
            console.log('[Oracle] No games found');
            return null;
        }

        // If gameId provided, find exact match
        if (gameId) {
            return data.events.find(e => e.id === gameId) || null;
        }

        // Otherwise, find by team matchup
        if (homeTeam && awayTeam) {
            return data.events.find(event => {
                const competitors = event.competitions[0]?.competitors || [];
                const teams = competitors.map(c => c.team.abbreviation.toUpperCase());
                return teams.includes(homeTeam.toUpperCase()) &&
                    teams.includes(awayTeam.toUpperCase());
            }) || null;
        }

        // Return first game if no filters
        return data.events[0];
    } catch (error) {
        console.error('[Oracle] Failed to fetch ESPN:', error);
        return null;
    }
}

/**
 * Evaluate condition against a value
 */
function evaluateCondition(
    actualValue: number,
    targetValue: number,
    condition: 'gte' | 'lte' | 'gt' | 'lt' | 'eq'
): boolean {
    switch (condition) {
        case 'gte': return actualValue >= targetValue;
        case 'lte': return actualValue <= targetValue;
        case 'gt': return actualValue > targetValue;
        case 'lt': return actualValue < targetValue;
        case 'eq': return actualValue === targetValue;
        default: return false;
    }
}

/**
 * Create a proposal based on resolution source
 */
export async function createProposal(
    source: ResolutionSource
): Promise<ProposalResult> {
    // Handle crypto_price type
    if (source.type === 'crypto_price') {
        if (!source.asset || !source.targetPrice || !source.condition) {
            return {
                success: false,
                error: 'Invalid crypto_price source config'
            };
        }

        const price = await fetchCryptoPrice(source.asset);

        if (price === null) {
            return {
                success: false,
                error: 'Failed to fetch price data'
            };
        }

        const conditionMet = evaluateCondition(
            price,
            source.targetPrice,
            source.condition
        );

        const resolution: Resolution = conditionMet ? 'YES' : 'NO';
        const conditionStr = {
            'gte': '≥',
            'lte': '≤',
            'gt': '>',
            'lt': '<',
            'eq': '='
        }[source.condition];

        const proposal: OracleProposal = {
            resolution,
            proposedAt: Date.now(),
            proposedBy: 'AI',
            reasoning: `${source.asset.toUpperCase()} price is $${price.toLocaleString()}. ` +
                `Target: ${conditionStr} $${source.targetPrice.toLocaleString()}. ` +
                `Condition ${conditionMet ? 'MET' : 'NOT MET'} → Resolve ${resolution}`,
            sourceSnapshot: JSON.stringify({
                asset: source.asset,
                price,
                fetchedAt: new Date().toISOString()
            }),
            challengeWindowEnd: Date.now() + CHALLENGE_WINDOW_MS
        };

        console.log(`[Oracle] Proposal created: ${resolution} for ${source.asset}`);
        return { success: true, proposal };
    }

    // Handle sports_game type
    if (source.type === 'sports_game') {
        if (!source.league || !source.teamToWin) {
            return {
                success: false,
                error: 'Invalid sports_game source config - need league and teamToWin'
            };
        }

        const game = await fetchESPNGame(
            source.league,
            source.gameDate,
            source.homeTeam,
            source.awayTeam,
            source.gameId
        );

        if (!game) {
            return {
                success: false,
                error: 'Game not found in ESPN data'
            };
        }

        // Check if game is completed
        const isCompleted = game.status.type.completed;
        if (!isCompleted) {
            return {
                success: false,
                error: `Game not yet completed. Status: ${game.status.type.description}`
            };
        }

        // Find the winner
        const competitors = game.competitions[0]?.competitors || [];
        const winner = competitors.find(c => c.winner);

        if (!winner) {
            // Check by score
            const sorted = [...competitors].sort((a, b) =>
                parseInt(b.score) - parseInt(a.score)
            );
            if (sorted.length >= 2 && sorted[0].score !== sorted[1].score) {
                // Clear winner by score
                const winnerAbbr = sorted[0].team.abbreviation.toUpperCase();
                const teamToWinAbbr = source.teamToWin.toUpperCase();
                const teamWon = winnerAbbr === teamToWinAbbr;
                const resolution: Resolution = teamWon ? 'YES' : 'NO';

                const proposal: OracleProposal = {
                    resolution,
                    proposedAt: Date.now(),
                    proposedBy: 'AI',
                    reasoning: `Game: ${game.name}. Final Score: ${competitors.map(c =>
                        `${c.team.abbreviation} ${c.score}`).join(' - ')}. ` +
                        `${winnerAbbr} won. Bet was on ${teamToWinAbbr} → Resolve ${resolution}`,
                    sourceSnapshot: JSON.stringify({
                        gameId: game.id,
                        gameName: game.name,
                        scores: competitors.map(c => ({
                            team: c.team.abbreviation,
                            score: c.score
                        })),
                        winner: winnerAbbr,
                        fetchedAt: new Date().toISOString()
                    }),
                    challengeWindowEnd: Date.now() + CHALLENGE_WINDOW_MS
                };

                console.log(`[Oracle] Sports proposal: ${resolution} for ${source.teamToWin}`);
                return { success: true, proposal };
            }

            return {
                success: false,
                error: 'Could not determine winner - possible tie'
            };
        }

        // Winner is marked
        const winnerAbbr = winner.team.abbreviation.toUpperCase();
        const teamToWinAbbr = source.teamToWin.toUpperCase();
        const teamWon = winnerAbbr === teamToWinAbbr;
        const resolution: Resolution = teamWon ? 'YES' : 'NO';

        const proposal: OracleProposal = {
            resolution,
            proposedAt: Date.now(),
            proposedBy: 'AI',
            reasoning: `Game: ${game.name}. Final Score: ${competitors.map(c =>
                `${c.team.abbreviation} ${c.score}`).join(' - ')}. ` +
                `${winnerAbbr} won. Bet was on ${teamToWinAbbr} → Resolve ${resolution}`,
            sourceSnapshot: JSON.stringify({
                gameId: game.id,
                gameName: game.name,
                scores: competitors.map(c => ({
                    team: c.team.abbreviation,
                    score: c.score
                })),
                winner: winnerAbbr,
                fetchedAt: new Date().toISOString()
            }),
            challengeWindowEnd: Date.now() + CHALLENGE_WINDOW_MS
        };

        console.log(`[Oracle] Sports proposal: ${resolution} for ${source.teamToWin}`);
        return { success: true, proposal };
    }

    // Handle manual type
    if (source.type === 'manual') {
        return {
            success: false,
            error: 'Manual resolution required - no automated proposal'
        };
    }

    // Handle generic API type (future extension)
    if (source.type === 'api') {
        return {
            success: false,
            error: 'Generic API resolution not yet implemented'
        };
    }

    return {
        success: false,
        error: 'Unknown resolution source type'
    };
}

/**
 * Check if a market's deadline has passed
 */
export function isDeadlinePassed(deadline: number): boolean {
    return Date.now() >= deadline;
}

/**
 * Check if challenge window has expired
 */
export function isChallengeWindowExpired(challengeWindowEnd: number): boolean {
    return Date.now() >= challengeWindowEnd;
}

/**
 * Format time remaining in human readable format
 */
export function formatTimeRemaining(endTime: number): string {
    const remaining = endTime - Date.now();

    if (remaining <= 0) return 'Expired';

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

    if (hours > 0) {
        return `${hours}h ${minutes}m remaining`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s remaining`;
    } else {
        return `${seconds}s remaining`;
    }
}
