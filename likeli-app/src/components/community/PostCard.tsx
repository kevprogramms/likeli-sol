"use client";

import Link from "next/link";
import { Heart, MessageCircle, Bookmark, Share2 } from "lucide-react";
import MarketEmbed from "./MarketEmbed";
import styles from "./community.module.css";

interface PostCardProps {
    post: {
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
    };
    currentUserId?: string;
    onLike?: (postId: string) => void;
    onBookmark?: (postId: string) => void;
    onShare?: (postId: string) => void;
}

export default function PostCard({
    post,
    currentUserId,
    onLike,
    onBookmark,
    onShare
}: PostCardProps) {
    const timeAgo = getTimeAgo(post.createdAt);
    const isLiked = currentUserId ? post.likes.includes(currentUserId) : false;
    const isBookmarked = currentUserId ? post.bookmarks.includes(currentUserId) : false;
    const avatarLetter = post.profile.displayName.charAt(0).toUpperCase();

    return (
        <div className={styles.postCard}>
            <div className={styles.postHeader}>
                <Link
                    href={`/community/profile/${post.userId}`}
                    className={styles.postAvatar}
                >
                    {post.profile.avatar ? (
                        <img src={post.profile.avatar} alt={post.profile.displayName} />
                    ) : (
                        <span>{avatarLetter}</span>
                    )}
                </Link>

                <div className={styles.postUserInfo}>
                    <Link
                        href={`/community/profile/${post.userId}`}
                        className={styles.postUserName}
                    >
                        {post.profile.displayName}
                    </Link>
                    <span className={styles.postTime}>{timeAgo}</span>
                </div>
            </div>

            <p className={styles.postContent}>{post.content}</p>

            {post.market && (
                <MarketEmbed market={post.market} />
            )}

            <div className={styles.postActions}>
                <button
                    className={styles.actionBtn}
                    onClick={() => {
                        // TODO: Open replies
                    }}
                >
                    <MessageCircle size={18} />
                    <span>{post.replyCount || ""}</span>
                </button>

                <button
                    className={`${styles.actionBtn} ${isLiked ? styles.actionBtnActive : ""}`}
                    onClick={() => onLike?.(post.id)}
                >
                    <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
                    <span>{post.likes.length || ""}</span>
                </button>

                <button
                    className={`${styles.actionBtn} ${isBookmarked ? styles.actionBtnActive : ""}`}
                    onClick={() => onBookmark?.(post.id)}
                >
                    <Bookmark size={18} fill={isBookmarked ? "currentColor" : "none"} />
                </button>

                <button
                    className={styles.actionBtn}
                    onClick={() => onShare?.(post.id)}
                >
                    <Share2 size={18} />
                </button>
            </div>
        </div>
    );
}

function getTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return "Now";
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;

    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
