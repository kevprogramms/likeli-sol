// pages/api/manifold/orders.ts
// API route to fetch user's limit orders for a market

import { NextApiRequest, NextApiResponse } from 'next';
import { sandboxMarkets } from '@/lib/sandbox';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { contractId, userId } = req.query;

    if (!contractId || typeof contractId !== 'string') {
        return res.status(400).json({ error: 'Missing contractId' });
    }

    const market = sandboxMarkets.get(contractId);
    if (!market) {
        return res.status(404).json({ error: 'Market not found' });
    }

    // Filter orders for this user
    const userOrders = market.unfilledBets.filter(
        bet => bet.userId === userId && !bet.isFilled && !bet.isCancelled
    );

    // Transform to match frontend expectations
    const orders = userOrders.map(bet => ({
        id: bet.id,
        outcome: bet.outcome,
        limitProb: bet.limitProb,
        orderAmount: bet.orderAmount,
        amount: bet.amount,
        shares: bet.shares,
        isFilled: bet.isFilled,
        isCancelled: bet.isCancelled,
        createdTime: bet.createdTime,
        expiresAt: bet.expiresAt,
        fills: bet.fills,
    }));

    return res.status(200).json({ orders });
}
