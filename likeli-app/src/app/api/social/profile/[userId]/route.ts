// app/api/social/profile/[userId]/route.ts
// Profile API - GET and PUT

import { NextResponse, NextRequest } from "next/server";
import { getOrCreateProfile, updateProfile, getPosts } from "@/lib/social/store";

/**
 * GET /api/social/profile/[userId] - Get user profile
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    try {
        const { userId } = await params;

        const profile = getOrCreateProfile(userId);
        const posts = getPosts({ userId, limit: 20 });

        return NextResponse.json({
            profile,
            postCount: posts.length
        });
    } catch (error) {
        console.error('GET /api/social/profile/[userId] error:', error);
        return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }
}

/**
 * PUT /api/social/profile/[userId] - Update profile
 * Body: { displayName?, bio?, avatar? }
 */
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    try {
        const { userId } = await params;
        const body = await req.json();
        const { displayName, bio, avatar } = body;

        // Validate displayName
        if (displayName !== undefined) {
            if (typeof displayName !== 'string' || displayName.trim().length === 0) {
                return NextResponse.json({ error: 'displayName must be non-empty' }, { status: 400 });
            }
            if (displayName.length > 50) {
                return NextResponse.json({ error: 'displayName too long (max 50)' }, { status: 400 });
            }
        }

        // Validate bio
        if (bio !== undefined && bio.length > 200) {
            return NextResponse.json({ error: 'bio too long (max 200)' }, { status: 400 });
        }

        const profile = updateProfile(userId, {
            displayName: displayName?.trim(),
            bio: bio?.trim(),
            avatar
        });

        return NextResponse.json({
            success: true,
            profile
        });
    } catch (error) {
        console.error('PUT /api/social/profile/[userId] error:', error);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }
}
