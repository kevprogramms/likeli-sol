// pages/api/comments/[market].ts
// Comments for a market

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
    const { market } = req.query;

    if (!market || typeof market !== 'string') {
        return res.status(400).json({ error: 'Market address required' });
    }

    if (req.method === 'GET') {
        // Get comments for market
        const { data: comments, error } = await supabase
            .from('comments')
            .select(`
                *,
                users:user_wallet (username, avatar)
            `)
            .eq('market_address', market)
            .order('created_at', { ascending: true });

        if (error) {
            return res.status(500).json({ error: 'Failed to fetch comments' });
        }

        // Build comment tree (for replies)
        const commentMap = new Map<number, any>();
        const rootComments: any[] = [];

        comments?.forEach(comment => {
            commentMap.set(comment.id, { ...comment, replies: [] });
        });

        comments?.forEach(comment => {
            const c = commentMap.get(comment.id);
            if (comment.parent_id) {
                const parent = commentMap.get(comment.parent_id);
                if (parent) {
                    parent.replies.push(c);
                }
            } else {
                rootComments.push(c);
            }
        });

        return res.status(200).json({ comments: rootComments });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
