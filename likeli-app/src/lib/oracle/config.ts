// lib/oracle/config.ts
// Oracle configuration constants

// Challenge window duration (2 hours in production, 2 minutes for testing)
export const CHALLENGE_WINDOW_MS = 2 * 60 * 1000;  // 2 minutes for easy testing
// export const CHALLENGE_WINDOW_MS = 2 * 60 * 60 * 1000;  // 2 hours for production

// Bond required to challenge
export const CHALLENGE_BOND = 100;  // $100 bond

// Bonus ratio for successful challenger (50% of bond)
export const CHALLENGER_REWARD_RATIO = 0.5;

// CoinGecko API (free, no key needed)
export const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// ESPN API (unofficial, free, no key needed)
export const ESPN_API = 'https://site.api.espn.com/apis/site/v2/sports';

// Supported crypto assets for rule-based resolution
export const SUPPORTED_ASSETS: Record<string, string> = {
    'bitcoin': 'BTC',
    'ethereum': 'ETH',
    'solana': 'SOL',
    'dogecoin': 'DOGE',
    'cardano': 'ADA',
    'ripple': 'XRP',
    'polkadot': 'DOT',
};

// Supported sports leagues
export const SUPPORTED_LEAGUES: Record<string, { name: string; sport: string; path: string }> = {
    'nba': { name: 'NBA Basketball', sport: 'basketball', path: 'basketball/nba' },
    'nfl': { name: 'NFL Football', sport: 'football', path: 'football/nfl' },
    'mlb': { name: 'MLB Baseball', sport: 'baseball', path: 'baseball/mlb' },
    'nhl': { name: 'NHL Hockey', sport: 'hockey', path: 'hockey/nhl' },
    'mls': { name: 'MLS Soccer', sport: 'soccer', path: 'soccer/usa.1' },
    'epl': { name: 'English Premier League', sport: 'soccer', path: 'soccer/eng.1' },
};

// Condition operators
export const CONDITION_LABELS: Record<string, string> = {
    'gte': '≥ (greater than or equal)',
    'lte': '≤ (less than or equal)',
    'gt': '> (greater than)',
    'lt': '< (less than)',
    'eq': '= (equal to)',
};

