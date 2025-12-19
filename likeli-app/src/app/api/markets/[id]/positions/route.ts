import { NextResponse, NextRequest } from "next/server";
import { getUserPositions } from "@/lib/orderbook";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get("userId") ?? "demo-user";

        const positions = getUserPositions(userId, id);

        return NextResponse.json({ positions });
    } catch (err) {
        console.error("positions GET error", err);
        return NextResponse.json({ positions: [] }, { status: 500 });
    }
}
