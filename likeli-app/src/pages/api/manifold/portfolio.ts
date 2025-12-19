// pages/api/manifold/portfolio.ts
// API route to get all positions for a user across all sandbox markets

import { NextApiRequest, NextApiResponse } from 'next';
import { sandboxMarkets, sandboxUsers, getProb } from '@/lib/sandbox';
import { calculateSandboxUserMetrics } from '@/lib/manifold/calculate-metrics';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId = 'demo-user' } = req.query;

    const user = sandboxUsers.get(userId as string);
    if (!user) {
        return res.status(200).json({
            positions: [],
            balance: 10000,
            history: [],
            stats: { pnl: 0, volume: 0, equity: 10000, winRate: 0 }
        });
    }

    // Build positions array from user.positions (Record<string, number>)
    // Keys are like "marketId-YES" or "marketId-answerId"
    const positions: any[] = [];
    let totalVolume = 0;

    for (const [key, shares] of Object.entries(user.positions)) {
        if (shares <= 0) continue;

        const parts = key.split('-');
        const marketId = parts[0];
        const outcome = parts.slice(1).join('-'); // Handle multi-part outcomes

        const market = sandboxMarkets.get(marketId);
        if (!market) continue;

        // Get current price
        let currentPrice = 0.5;
        let marketQuestion = 'Unknown Market';
        let answerId: string | undefined;

        if (market.outcomeType === 'BINARY') {
            currentPrice = outcome === 'YES'
                ? getProb(market.pool, market.p)
                : (1 - getProb(market.pool, market.p));
            marketQuestion = market.question;
        } else if (market.answers) {
            // Multi-choice - outcome is the answerId
            answerId = outcome;
            const answer = market.answers.find(a => a.id === outcome);
            if (answer) {
                currentPrice = answer.prob;
                marketQuestion = `${market.question} - ${answer.text}`;
            }
        }

        // TODO: Track actual avg price per position
        const avgPrice = 0.5;
        const currentValue = shares * currentPrice;
        const costBasis = shares * avgPrice;
        const pnl = currentValue - costBasis;

        positions.push({
            marketId,
            marketQuestion,
            outcome,
            answerId,
            shares,
            avgPrice,
            currentPrice,
            currentValue,
            pnl,
            phase: market.phase,
        });
    }

    // Use calculateSandboxUserMetrics for proper stats
    const metricsData = positions.map(p => ({
        shares: p.shares,
        avgPrice: p.avgPrice,
        currentPrice: p.currentPrice,
    }));

    const metrics = calculateSandboxUserMetrics(metricsData);

    // Get volume from all markets
    for (const [, market] of sandboxMarkets) {
        totalVolume += market.volume;
    }

    const winRate = metrics.positionCount > 0
        ? (metrics.winningPositions / metrics.positionCount) * 100
        : 0;

    return res.status(200).json({
        positions,
        balance: user.cash,
        totalEquity: user.cash + metrics.totalValue,
        stats: {
            pnl: metrics.unrealizedPnl,
            pnlPercent: metrics.unrealizedPnlPercent,
            volume: totalVolume,
            equity: user.cash + metrics.totalValue,
            normalBetsEquity: metrics.totalValue,
            winningPositions: metrics.winningPositions,
            losingPositions: metrics.losingPositions,
            winRate,
        }
    });
}

