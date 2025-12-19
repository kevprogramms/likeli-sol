// app/api/manifold/limit-order/route.ts
// Limit Order API - Manifold Match

import { NextResponse } from "next/server";
import { placeLimitOrder, cancelUserOrder, getUserOpenOrders, getActiveLimitOrders, getOrderBookLevels } from "@/lib/manifold";

/**
 * POST /api/manifold/limit-order - Place a limit order
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { userId, contractId, amount, outcome, limitProb, answerId } = body;

        if (!userId || !contractId || !amount || !outcome || limitProb === undefined) {
            return NextResponse.json(
                { error: 'Missing required fields: userId, contractId, amount, outcome, limitProb' },
                { status: 400 }
            );
        }

        const result = placeLimitOrder({
            contractId,
            amount: Number(amount),
            outcome,
            limitProb: Number(limitProb),
            userId,
            answerId
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('POST /api/manifold/limit-order error:', error);
        return NextResponse.json({ error: 'Failed to place limit order' }, { status: 500 });
    }
}

/**
 * GET /api/manifold/limit-order?userId=xxx - Get user's open orders
 * GET /api/manifold/limit-order?contractId=xxx - Get active orders for contract
 */
export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const userId = url.searchParams.get('userId');
        const contractId = url.searchParams.get('contractId');

        if (contractId) {
            const orders = getActiveLimitOrders(contractId);
            const orderbook = getOrderBookLevels(contractId);
            return NextResponse.json({ orders, orderbook });
        }

        if (!userId) {
            return NextResponse.json({ error: 'userId required' }, { status: 400 });
        }

        const orders = getUserOpenOrders(userId);
        return NextResponse.json({ orders });
    } catch (error) {
        console.error('GET /api/manifold/limit-order error:', error);
        return NextResponse.json({ error: 'Failed to get orders' }, { status: 500 });
    }
}

/**
 * DELETE /api/manifold/limit-order - Cancel an order
 */
export async function DELETE(req: Request) {
    try {
        const body = await req.json();
        const { userId, orderId } = body;

        if (!userId || !orderId) {
            return NextResponse.json({ error: 'userId and orderId required' }, { status: 400 });
        }

        const result = cancelUserOrder(userId, orderId);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('DELETE /api/manifold/limit-order error:', error);
        return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 });
    }
}
