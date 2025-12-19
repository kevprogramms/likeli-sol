// pages/api/users/[wallet].ts
// User profile API

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
    const { wallet } = req.query;

    if (!wallet || typeof wallet !== 'string') {
        return res.status(400).json({ error: 'Wallet address required' });
    }

    if (req.method === 'GET') {
        // Get user profile
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('wallet', wallet)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = row not found
            return res.status(500).json({ error: 'Database error' });
        }

        // If user doesn't exist, return default
        if (!user) {
            return res.status(200).json({
                wallet,
                username: null,
                avatar: null,
                bio: null,
                exists: false
            });
        }

        return res.status(200).json({ ...user, exists: true });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
        // Update/create user profile
        const { username, avatar, bio } = req.body;

        // Upsert user
        const { data, error } = await supabase
            .from('users')
            .upsert({
                wallet,
                username,
                avatar,
                bio,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // Unique constraint violation
                return res.status(409).json({ error: 'Username already taken' });
            }
            return res.status(500).json({ error: 'Failed to update profile' });
        }

        return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
