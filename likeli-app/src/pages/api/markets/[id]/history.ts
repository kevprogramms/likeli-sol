// pages/api/markets/[id]/history.ts
// Fetch price history for charts

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
    const { answer_index = '0', interval = '1h', limit = '100' } = req.query;

    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Market ID required' });
    }

    try {
        // Fetch price history
        const { data: prices, error } = await supabase
            .from('prices')
            .select('probability, timestamp')
            .eq('market_address', id)
            .eq('answer_index', parseInt(answer_index as string))
            .order('timestamp', { ascending: true })
            .limit(parseInt(limit as string));

        if (error) {
            console.error('Database error:', error);
            return res.status(500).json({ error: 'Failed to fetch history' });
        }

        // Transform for chart
        const history = prices?.map(p => ({
            timestamp: new Date(p.timestamp).getTime(),
            yesProb: p.probability,
            noProb: 1 - p.probability
        })) || [];

        return res.status(200).json({
            marketAddress: id,
            answerIndex: parseInt(answer_index as string),
            history
        });
    } catch (error) {
        console.error('Error fetching history:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
