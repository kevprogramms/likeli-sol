// pages/api/markets/[id]/trades.ts
// Fetch trade history for a market

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

    const { id } = req.query;
    const { limit = '50', offset = '0' } = req.query;

    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Market ID required' });
    }

    try {
        const { data: trades, error, count } = await supabase
            .from('trades')
            .select('*', { count: 'exact' })
            .eq('market_address', id)
            .order('timestamp', { ascending: false })
            .range(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string) - 1);

        if (error) {
            console.error('Database error:', error);
            return res.status(500).json({ error: 'Failed to fetch trades' });
        }

        return res.status(200).json({
            trades: trades || [],
            total: count || 0,
            limit: parseInt(limit as string),
            offset: parseInt(offset as string)
        });
    } catch (error) {
        console.error('Error fetching trades:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
