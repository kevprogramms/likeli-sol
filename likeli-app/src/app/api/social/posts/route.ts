// app/api/social/posts/route.ts
// Posts API - GET feed, POST new post

import { NextResponse, NextRequest } from "next/server";
import { createPost, getPosts, getOrCreateProfile } from "@/lib/social/store";
import { getContract } from "@/lib/manifold";

/**
 * GET /api/social/posts - Get posts feed
 * Query params: userId, timeFilter (now|today|week|month), limit
 */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const userId = url.searchParams.get('userId') || undefined;
        const timeFilter = url.searchParams.get('timeFilter') as 'now' | 'today' | 'week' | 'month' | undefined;
        const limit = parseInt(url.searchParams.get('limit') || '50');

        const posts = getPosts({ userId, timeFilter, limit });

        // Enrich posts with profile data and market data
        const enrichedPosts = posts.map(post => {
            const profile = getOrCreateProfile(post.userId);
            let market = undefined;
            if (post.linkedMarketId) {
                const contract = getContract(post.linkedMarketId);
                if (contract) {
                    market = {
                        id: contract.id,
                        question: contract.question,
                        probability: (contract as any).prob ?? (contract as any).p ?? 0.5,
                        volume: contract.volume
                    };
                }
            }
            return {
                ...post,
                profile: {
                    displayName: profile.displayName,
                    avatar: profile.avatar
                },
                market
            };
        });

        return NextResponse.json({ posts: enrichedPosts });
    } catch (error) {
        console.error('GET /api/social/posts error:', error);
        return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
    }
}

/**
 * POST /api/social/posts - Create new post
 * Body: { userId, content, linkedMarketId? }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userId, content, linkedMarketId, replyToId } = body;

        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }
        if (!content || content.trim().length === 0) {
            return NextResponse.json({ error: 'content is required' }, { status: 400 });
        }
        if (content.length > 500) {
            return NextResponse.json({ error: 'content too long (max 500 chars)' }, { status: 400 });
        }

        const post = createPost({
            userId,
            content: content.trim(),
            linkedMarketId,
            replyToId
        });

        const profile = getOrCreateProfile(userId);

        return NextResponse.json({
            success: true,
            post: {
                ...post,
                profile: {
                    displayName: profile.displayName,
                    avatar: profile.avatar
                }
            }
        });
    } catch (error) {
        console.error('POST /api/social/posts error:', error);
        return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
    }
}
