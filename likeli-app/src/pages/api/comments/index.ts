// pages/api/comments/index.ts
// Create a new comment

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
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { market_address, market_type, user_wallet, content, parent_id } = req.body;

    if (!market_address || !user_wallet || !content) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Ensure user exists
    await supabase.from('users').upsert({ wallet: user_wallet }, { onConflict: 'wallet' });

    // Create comment
    const { data, error } = await supabase
        .from('comments')
        .insert({
            market_address,
            market_type: market_type || 'binary',
            user_wallet,
            content,
            parent_id: parent_id || null
        })
        .select(`
            *,
            users:user_wallet (username, avatar)
        `)
        .single();

    if (error) {
        console.error('Comment creation error:', error);
        return res.status(500).json({ error: 'Failed to create comment' });
    }

    return res.status(201).json(data);
}
