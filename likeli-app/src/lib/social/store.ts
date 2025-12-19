// lib/social/store.ts
// In-memory store for social layer (posts, profiles, likes)

declare global {
    var socialPosts: Map<string, Post> | undefined;
    var socialProfiles: Map<string, Profile> | undefined;
}

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface Post {
    id: string;
    userId: string;           // Wallet address or demo user
    content: string;          // Post text
    linkedMarketId?: string;  // Optional market link
    createdAt: number;
    likes: string[];          // Array of userIds who liked
    bookmarks: string[];      // Array of userIds who bookmarked
    replyToId?: string;       // If this is a reply
    replyCount: number;
}

export interface Profile {
    userId: string;           // Wallet address
    displayName: string;      // User-chosen name
    avatar?: string;          // Optional avatar URL
    bio?: string;
    createdAt: number;
    followerCount: number;
    followingCount: number;
}

// ============================================
// STORES (Persist across hot reloads)
// ============================================

const posts = globalThis.socialPosts ?? new Map<string, Post>();
globalThis.socialPosts = posts;

const profiles = globalThis.socialProfiles ?? new Map<string, Profile>();
globalThis.socialProfiles = profiles;

// ============================================
// HELPER FUNCTIONS
// ============================================

export function generateId(): string {
    return `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getShortAddress(address: string): string {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ============================================
// PROFILE OPERATIONS
// ============================================

export function getOrCreateProfile(userId: string): Profile {
    let profile = profiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            displayName: getShortAddress(userId),
            createdAt: Date.now(),
            followerCount: 0,
            followingCount: 0
        };
        profiles.set(userId, profile);
    }
    return profile;
}

export function updateProfile(userId: string, updates: Partial<Pick<Profile, 'displayName' | 'bio' | 'avatar'>>): Profile {
    const profile = getOrCreateProfile(userId);
    if (updates.displayName) profile.displayName = updates.displayName;
    if (updates.bio !== undefined) profile.bio = updates.bio;
    if (updates.avatar !== undefined) profile.avatar = updates.avatar;
    return profile;
}

export function getProfile(userId: string): Profile | undefined {
    return profiles.get(userId);
}

// ============================================
// POST OPERATIONS
// ============================================

export function createPost(params: {
    userId: string;
    content: string;
    linkedMarketId?: string;
    replyToId?: string;
}): Post {
    const { userId, content, linkedMarketId, replyToId } = params;

    // Ensure profile exists
    getOrCreateProfile(userId);

    const post: Post = {
        id: generateId(),
        userId,
        content,
        linkedMarketId,
        replyToId,
        createdAt: Date.now(),
        likes: [],
        bookmarks: [],
        replyCount: 0
    };

    posts.set(post.id, post);

    // If this is a reply, increment parent's reply count
    if (replyToId) {
        const parent = posts.get(replyToId);
        if (parent) {
            parent.replyCount++;
        }
    }

    console.log(`[Social] Created post ${post.id} by ${userId}`);
    return post;
}

export function getPost(postId: string): Post | undefined {
    return posts.get(postId);
}

export function getPosts(options?: {
    userId?: string;
    timeFilter?: 'now' | 'today' | 'week' | 'month';
    limit?: number;
    replyToId?: string;
}): Post[] {
    const { userId, timeFilter, limit = 50, replyToId } = options ?? {};

    let allPosts = Array.from(posts.values());

    // Filter by user
    if (userId) {
        allPosts = allPosts.filter(p => p.userId === userId);
    }

    // Filter by replyToId (for replies to a specific post)
    if (replyToId !== undefined) {
        allPosts = allPosts.filter(p => p.replyToId === replyToId);
    } else {
        // By default, only show top-level posts (not replies)
        allPosts = allPosts.filter(p => !p.replyToId);
    }

    // Filter by time
    if (timeFilter) {
        const now = Date.now();
        let cutoff = 0;
        switch (timeFilter) {
            case 'now': cutoff = now - 60 * 60 * 1000; break; // 1 hour
            case 'today': cutoff = now - 24 * 60 * 60 * 1000; break;
            case 'week': cutoff = now - 7 * 24 * 60 * 60 * 1000; break;
            case 'month': cutoff = now - 30 * 24 * 60 * 60 * 1000; break;
        }
        allPosts = allPosts.filter(p => p.createdAt >= cutoff);
    }

    // Sort by creation time (newest first)
    allPosts.sort((a, b) => b.createdAt - a.createdAt);

    // Limit
    return allPosts.slice(0, limit);
}

export function toggleLike(postId: string, userId: string): { liked: boolean; likeCount: number } {
    const post = posts.get(postId);
    if (!post) {
        throw new Error('Post not found');
    }

    const idx = post.likes.indexOf(userId);
    if (idx >= 0) {
        post.likes.splice(idx, 1);
        return { liked: false, likeCount: post.likes.length };
    } else {
        post.likes.push(userId);
        return { liked: true, likeCount: post.likes.length };
    }
}

export function toggleBookmark(postId: string, userId: string): { bookmarked: boolean } {
    const post = posts.get(postId);
    if (!post) {
        throw new Error('Post not found');
    }

    const idx = post.bookmarks.indexOf(userId);
    if (idx >= 0) {
        post.bookmarks.splice(idx, 1);
        return { bookmarked: false };
    } else {
        post.bookmarks.push(userId);
        return { bookmarked: true };
    }
}

export function getBookmarkedPosts(userId: string): Post[] {
    return Array.from(posts.values())
        .filter(p => p.bookmarks.includes(userId))
        .sort((a, b) => b.createdAt - a.createdAt);
}

export function deletePost(postId: string, userId: string): boolean {
    const post = posts.get(postId);
    if (!post || post.userId !== userId) {
        return false;
    }
    posts.delete(postId);
    return true;
}

// ============================================
// SEED DATA (for demo)
// ============================================

export function seedDemoData() {
    if (posts.size > 0) return; // Already seeded

    // Create demo profiles
    const users = [
        { userId: 'demo-alice', displayName: 'Alice Trader', bio: 'Full-time crypto trader' },
        { userId: 'demo-bob', displayName: 'Bob Markets', bio: 'Prediction market enthusiast' },
        { userId: 'demo-carol', displayName: 'Carol DeFi', bio: 'DeFi degen since 2020' },
    ];

    users.forEach(u => {
        const profile = getOrCreateProfile(u.userId);
        profile.displayName = u.displayName;
        profile.bio = u.bio;
    });

    // Create demo posts
    const demoPosts = [
        {
            userId: 'demo-alice',
            content: 'Bitcoin breaking $100k seems inevitable given the current macro environment. The institutional flows are just getting started.',
            createdAt: Date.now() - 2 * 60 * 60 * 1000
        },
        {
            userId: 'demo-bob',
            content: 'Interesting to see the prediction markets converging on the election outcome. The wisdom of the crowd is powerful.',
            createdAt: Date.now() - 4 * 60 * 60 * 1000
        },
        {
            userId: 'demo-carol',
            content: 'New market alert! 🚀 Check out the latest crypto prediction markets.',
            createdAt: Date.now() - 6 * 60 * 60 * 1000
        },
    ];

    demoPosts.forEach(p => {
        const post = createPost({
            userId: p.userId,
            content: p.content
        });
        // Backdate the post
        post.createdAt = p.createdAt;
        // Add some demo likes
        post.likes = ['demo-user', 'demo-alice', 'demo-bob'].slice(0, Math.floor(Math.random() * 4));
    });

    console.log('[Social] Seeded demo data');
}

// Auto-seed on first load
seedDemoData();
