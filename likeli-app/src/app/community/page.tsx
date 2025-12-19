"use client";

import { useEffect, useState, useCallback } from "react";
import IdeasSidebar from "@/components/community/IdeasSidebar";
import PostComposer from "@/components/community/PostComposer";
import PostCard from "@/components/community/PostCard";
import styles from "@/components/community/community.module.css";

type TimeFilter = "now" | "today" | "week" | "month";
type FeedTab = "ideas" | "trades";

interface Post {
    id: string;
    userId: string;
    content: string;
    createdAt: number;
    likes: string[];
    bookmarks: string[];
    replyCount: number;
    profile: {
        displayName: string;
        avatar?: string;
    };
    market?: {
        id: string;
        question: string;
        probability: number;
        volume?: number;
    };
}

export default function CommunityPage() {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [feedTab, setFeedTab] = useState<FeedTab>("ideas");
    const [timeFilter, setTimeFilter] = useState<TimeFilter>("today");

    // Demo user (in production, this would come from wallet connection)
    const currentUserId = "demo-user";

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/social/posts?timeFilter=${timeFilter}`);
            const data = await res.json();
            setPosts(data.posts || []);
        } catch (error) {
            console.error("Failed to fetch posts:", error);
        } finally {
            setLoading(false);
        }
    }, [timeFilter]);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    const handlePost = async (content: string, linkedMarketId?: string) => {
        try {
            const res = await fetch("/api/social/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: currentUserId,
                    content,
                    linkedMarketId
                })
            });
            const data = await res.json();
            if (data.success) {
                // Add new post to top of feed
                setPosts(prev => [data.post, ...prev]);
            }
        } catch (error) {
            console.error("Failed to create post:", error);
        }
    };

    const handleLike = async (postId: string) => {
        try {
            const res = await fetch(`/api/social/posts/${postId}/like`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: currentUserId })
            });
            const data = await res.json();
            if (data.success) {
                // Update post likes in state
                setPosts(prev => prev.map(p => {
                    if (p.id === postId) {
                        const likes = data.liked
                            ? [...p.likes, currentUserId]
                            : p.likes.filter(id => id !== currentUserId);
                        return { ...p, likes };
                    }
                    return p;
                }));
            }
        } catch (error) {
            console.error("Failed to toggle like:", error);
        }
    };

    const handleBookmark = async (postId: string) => {
        // For now, just toggle locally
        setPosts(prev => prev.map(p => {
            if (p.id === postId) {
                const isBookmarked = p.bookmarks.includes(currentUserId);
                const bookmarks = isBookmarked
                    ? p.bookmarks.filter(id => id !== currentUserId)
                    : [...p.bookmarks, currentUserId];
                return { ...p, bookmarks };
            }
            return p;
        }));
    };

    const handleShare = (postId: string) => {
        const url = `${window.location.origin}/community/post/${postId}`;
        navigator.clipboard.writeText(url);
        // TODO: Show toast notification
    };

    return (
        <div className={styles.feedContainer}>
            <IdeasSidebar
                userId={currentUserId}
                onPostClick={() => {
                    // Focus the composer
                    document.querySelector("textarea")?.focus();
                }}
            />

            <main className={styles.feedMain}>
                {/* Tab Bar */}
                <div className={styles.feedTabs}>
                    {(["ideas", "trades"] as FeedTab[]).map(tab => (
                        <button
                            key={tab}
                            className={`${styles.feedTab} ${feedTab === tab ? styles.feedTabActive : ""}`}
                            onClick={() => setFeedTab(tab)}
                        >
                            {tab === "ideas" ? "Ideas" : "Live trades"}
                        </button>
                    ))}
                </div>

                {/* Post Composer */}
                <PostComposer
                    userId={currentUserId}
                    onPost={handlePost}
                />

                {/* Time Filter Tabs */}
                <div className={styles.timeTabs}>
                    {(["now", "today", "week", "month"] as TimeFilter[]).map(filter => (
                        <button
                            key={filter}
                            className={`${styles.timeTab} ${timeFilter === filter ? styles.timeTabActive : ""}`}
                            onClick={() => setTimeFilter(filter)}
                        >
                            {filter === "now" ? "Now" :
                                filter === "today" ? "Today" :
                                    filter === "week" ? "This Week" : "This Month"}
                        </button>
                    ))}
                </div>

                {/* Feed */}
                <div className={styles.feedList}>
                    {loading ? (
                        <div className={styles.loadingFeed}>Loading posts...</div>
                    ) : posts.length === 0 ? (
                        <div className={styles.emptyFeed}>
                            No posts yet. Be the first to share your prediction!
                        </div>
                    ) : (
                        posts.map(post => (
                            <PostCard
                                key={post.id}
                                post={post}
                                currentUserId={currentUserId}
                                onLike={handleLike}
                                onBookmark={handleBookmark}
                                onShare={handleShare}
                            />
                        ))
                    )}
                </div>
            </main>
        </div>
    );
}
