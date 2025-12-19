"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import styles from "./community.module.css";

interface PostComposerProps {
    userId?: string;
    userAvatar?: string;
    onPost: (content: string, linkedMarketId?: string) => Promise<void>;
    placeholder?: string;
}

export default function PostComposer({
    userId,
    userAvatar,
    onPost,
    placeholder = "What's your prediction?"
}: PostComposerProps) {
    const [content, setContent] = useState("");
    const [isPosting, setIsPosting] = useState(false);
    const [showMarketSearch, setShowMarketSearch] = useState(false);
    const [linkedMarketId, setLinkedMarketId] = useState<string | undefined>();
    const [linkedMarketName, setLinkedMarketName] = useState<string>("");

    const handlePost = async () => {
        if (!content.trim() || !userId) return;

        setIsPosting(true);
        try {
            await onPost(content.trim(), linkedMarketId);
            setContent("");
            setLinkedMarketId(undefined);
            setLinkedMarketName("");
        } catch (error) {
            console.error("Failed to post:", error);
        } finally {
            setIsPosting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            handlePost();
        }
    };

    const avatarLetter = userId ? userId.charAt(0).toUpperCase() : "?";

    return (
        <div className={styles.composer}>
            <div className={styles.composerAvatar}>
                {userAvatar ? (
                    <img src={userAvatar} alt="Avatar" />
                ) : (
                    <span>{avatarLetter}</span>
                )}
            </div>

            <div className={styles.composerInput}>
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className={styles.composerTextarea}
                    rows={2}
                    maxLength={500}
                    disabled={!userId}
                />

                {linkedMarketName && (
                    <div className={styles.linkedMarket}>
                        <span>📊 {linkedMarketName}</span>
                        <button
                            onClick={() => {
                                setLinkedMarketId(undefined);
                                setLinkedMarketName("");
                            }}
                            className={styles.removeMarketBtn}
                        >
                            ×
                        </button>
                    </div>
                )}

                <div className={styles.composerActions}>
                    <button
                        className={styles.linkMarketBtn}
                        onClick={() => setShowMarketSearch(!showMarketSearch)}
                        title="Link a market"
                    >
                        <Search size={16} />
                        Link Market
                    </button>

                    <div className={styles.composerRight}>
                        <span className={styles.charCount}>
                            {content.length}/500
                        </span>
                        <button
                            className={styles.postBtn}
                            onClick={handlePost}
                            disabled={!content.trim() || isPosting || !userId}
                        >
                            {isPosting ? "Posting..." : "Post"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
