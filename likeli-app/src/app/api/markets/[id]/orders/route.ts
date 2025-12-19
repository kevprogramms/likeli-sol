import { NextResponse, NextRequest } from "next/server";
import {
    submitLimitOrder,
    Outcome,
    Side,
} from "@/lib/orderbook";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await req.json();
        console.log("POST /orders body:", body);

        const { userId, tab, outcome, price, qty } = body ?? {};

        if (!userId || !tab || !outcome || price === undefined || qty === undefined) {
            console.log("Missing fields in:", body);
            return NextResponse.json(
                { ok: false, error: "MISSING_FIELDS" },
                { status: 400 }
            );
        }

        const side: Side = tab === "buy" ? "buy" : "sell";
        const outcomeTyped: Outcome =
            outcome === "no" ? "no" : "yes";

        const result = submitLimitOrder({
            marketId: id,
            userId,
            outcome: outcomeTyped,
            side,
            price: Number(price),
            qty: Number(qty),
        });

        if (!result.ok) {
            console.log("submitLimitOrder failed:", result.error);
            const status =
                result.error === "INSUFFICIENT_SHARES" ? 400 : 400;
            return NextResponse.json(
                { ok: false, error: result.error },
                { status }
            );
        }

        return NextResponse.json({
            ok: true,
            order: result.order,
            trades: result.trades,
        });
    } catch (err) {
        console.error("orders POST error", err);
        return NextResponse.json(
            { ok: false, error: "INTERNAL_ERROR" },
            { status: 500 }
        );
    }
}
