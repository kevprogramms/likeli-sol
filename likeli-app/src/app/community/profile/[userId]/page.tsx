"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar } from "lucide-react";
import PostCard from "@/components/community/PostCard";
import styles from "@/components/community/community.module.css";

interface Profile {
    userId: string;
    displayName: string;
    bio?: string;
    avatar?: string;
    createdAt: number;
    followerCount: number;
    followingCount: number;
}

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

export default function ProfilePage() {
    const params = useParams();
    const userId = params.userId as string;

    const [profile, setProfile] = useState<Profile | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);

    const currentUserId = "demo-user";

    useEffect(() => {
        const fetchProfileAndPosts = async () => {
            setLoading(true);
            try {
                const [profileRes, postsRes] = await Promise.all([
                    fetch(`/api/social/profile/${userId}`),
                    fetch(`/api/social/posts?userId=${userId}`)
                ]);

                const profileData = await profileRes.json();
                const postsData = await postsRes.json();

                setProfile(profileData.profile);
                setPosts(postsData.posts || []);
            } catch (error) {
                console.error("Failed to fetch profile:", error);
            } finally {
                setLoading(false);
            }
        };

        if (userId) {
            fetchProfileAndPosts();
        }
    }, [userId]);

    const handleLike = async (postId: string) => {
        try {
            const res = await fetch(`/api/social/posts/${postId}/like`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: currentUserId })
            });
            const data = await res.json();
            if (data.success) {
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

    if (loading) {
        return (
            <div style={{ padding: "var(--space-8)", textAlign: "center" }}>
                Loading profile...
            </div>
        );
    }

    if (!profile) {
        return (
            <div style={{ padding: "var(--space-8)", textAlign: "center" }}>
                Profile not found
            </div>
        );
    }

    const joinDate = new Date(profile.createdAt).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric"
    });

    const avatarLetter = profile.displayName.charAt(0).toUpperCase();

    return (
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
            {/* Header */}
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-4)",
                padding: "var(--space-4)",
                borderBottom: "1px solid var(--border-subtle)"
            }}>
                <Link href="/community" style={{ color: "var(--text-main)" }}>
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 style={{
                        fontSize: "var(--font-xl)",
                        fontWeight: 700,
                        color: "var(--text-main)"
                    }}>
                        {profile.displayName}
                    </h1>
                    <span style={{
                        fontSize: "var(--font-sm)",
                        color: "var(--text-muted)"
                    }}>
                        {posts.length} posts
                    </span>
                </div>
            </div>

            {/* Profile Info */}
            <div style={{ padding: "var(--space-4)" }}>
                <div style={{
                    width: 80,
                    height: 80,
                    borderRadius: "var(--radius-full)",
                    backgroundColor: "var(--bg-input)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "var(--font-2xl)",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: "var(--space-3)"
                }}>
                    {profile.avatar ? (
                        <img
                            src={profile.avatar}
                            alt={profile.displayName}
                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "var(--radius-full)" }}
                        />
                    ) : (
                        avatarLetter
                    )}
                </div>

                <h2 style={{
                    fontSize: "var(--font-xl)",
                    fontWeight: 700,
                    color: "var(--text-main)",
                    marginBottom: "var(--space-1)"
                }}>
                    {profile.displayName}
                </h2>

                <p style={{
                    fontSize: "var(--font-sm)",
                    color: "var(--text-muted)",
                    marginBottom: "var(--space-2)"
                }}>
                    @{profile.userId.slice(0, 10)}...
                </p>

                {profile.bio && (
                    <p style={{
                        fontSize: "var(--font-base)",
                        color: "var(--text-main)",
                        marginBottom: "var(--space-3)"
                    }}>
                        {profile.bio}
                    </p>
                )}

                <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-1)",
                    fontSize: "var(--font-sm)",
                    color: "var(--text-muted)",
                    marginBottom: "var(--space-3)"
                }}>
                    <Calendar size={14} />
                    Joined {joinDate}
                </div>

                <div style={{
                    display: "flex",
                    gap: "var(--space-4)",
                    fontSize: "var(--font-sm)"
                }}>
                    <span>
                        <strong style={{ color: "var(--text-main)" }}>{profile.followingCount}</strong>
                        <span style={{ color: "var(--text-muted)" }}> Following</span>
                    </span>
                    <span>
                        <strong style={{ color: "var(--text-main)" }}>{profile.followerCount}</strong>
                        <span style={{ color: "var(--text-muted)" }}> Followers</span>
                    </span>
                </div>
            </div>

            {/* Posts */}
            <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div style={{
                    padding: "var(--space-4)",
                    fontSize: "var(--font-base)",
                    fontWeight: 600,
                    color: "var(--text-main)",
                    borderBottom: "1px solid var(--border-subtle)"
                }}>
                    Posts
                </div>

                {posts.length === 0 ? (
                    <div style={{
                        padding: "var(--space-8)",
                        textAlign: "center",
                        color: "var(--text-muted)"
                    }}>
                        No posts yet
                    </div>
                ) : (
                    posts.map(post => (
                        <PostCard
                            key={post.id}
                            post={post}
                            currentUserId={currentUserId}
                            onLike={handleLike}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
