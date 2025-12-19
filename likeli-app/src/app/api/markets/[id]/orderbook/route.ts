import { NextResponse, NextRequest } from "next/server";
import { getOrderbook } from "@/lib/orderbook";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const data = getOrderbook(id);
        return NextResponse.json(data);
    } catch (err) {
        console.error("orderbook GET error", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR" },
            { status: 500 }
        );
    }
}
