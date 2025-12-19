import { NextResponse, NextRequest } from "next/server";
import { getPriceHistory } from "@/lib/orderbook";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const points = getPriceHistory(id);
        const payload = points.map((p) => ({
            t: Math.floor(p.timestamp / 1000),
            yesProb: p.yesProb,
            noProb: p.noProb,
        }));
        return NextResponse.json({ points: payload });
    } catch (err) {
        console.error("price-history GET error", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR" },
            { status: 500 }
        );
    }
}
