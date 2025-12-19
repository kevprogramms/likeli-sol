// app/api/social/posts/[id]/like/route.ts
// Like toggle API

import { NextResponse, NextRequest } from "next/server";
import { toggleLike, getPost } from "@/lib/social/store";

/**
 * POST /api/social/posts/[id]/like - Toggle like on a post
 * Body: { userId }
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: postId } = await params;
        const body = await req.json();
        const { userId } = body;

        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }

        const post = getPost(postId);
        if (!post) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        const result = toggleLike(postId, userId);

        return NextResponse.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('POST /api/social/posts/[id]/like error:', error);
        return NextResponse.json({ error: 'Failed to toggle like' }, { status: 500 });
    }
}
