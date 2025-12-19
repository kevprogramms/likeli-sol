// pages/api/leaderboard.ts
// Leaderboard API

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { limit = '50', sort = 'volume' } = req.query;

    try {
        // Use the leaderboard view or direct aggregation
        const { data, error } = await supabase
            .from('leaderboard')
            .select('*')
            .limit(parseInt(limit as string));

        if (error) {
            // Fallback to direct query if view doesn't exist
            const { data: trades, error: tradeError } = await supabase
                .from('trades')
                .select('user_wallet, amount')
                .order('timestamp', { ascending: false })
                .limit(1000);

            if (tradeError) {
                return res.status(500).json({ error: 'Database error' });
            }

            // Aggregate manually
            const leaderboard = new Map<string, { volume: number; trades: number }>();
            trades?.forEach(t => {
                const current = leaderboard.get(t.user_wallet) || { volume: 0, trades: 0 };
                current.volume += t.amount;
                current.trades += 1;
                leaderboard.set(t.user_wallet, current);
            });

            const sorted = Array.from(leaderboard.entries())
                .map(([wallet, stats]) => ({ wallet, ...stats }))
                .sort((a, b) => b.volume - a.volume)
                .slice(0, parseInt(limit as string));

            return res.status(200).json({ leaderboard: sorted });
        }

        return res.status(200).json({ leaderboard: data || [] });
    } catch (error) {
        console.error('Leaderboard error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
