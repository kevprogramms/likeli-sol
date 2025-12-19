// pages/api/manifold/orders/[orderId].ts
// API route to cancel a limit order

import { NextApiRequest, NextApiResponse } from 'next';
import { sandboxMarkets, sandboxUsers, cancelLimitOrder as cancelOrder } from '@/lib/sandbox';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { orderId } = req.query;
    const { userId } = req.body;

    if (!orderId || typeof orderId !== 'string') {
        return res.status(400).json({ error: 'Missing orderId' });
    }

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }

    // Find the market containing this order
    let targetMarket = null;
    for (const [, market] of sandboxMarkets) {
        if (market.unfilledBets.some(b => b.id === orderId)) {
            targetMarket = market;
            break;
        }
    }

    if (!targetMarket) {
        return res.status(404).json({ error: 'Order not found' });
    }

    const user = sandboxUsers.get(userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    try {
        cancelOrder(targetMarket, user, orderId);
        return res.status(200).json({ success: true, newBalance: user.cash });
    } catch (e: any) {
        return res.status(400).json({ error: e.message });
    }
}
