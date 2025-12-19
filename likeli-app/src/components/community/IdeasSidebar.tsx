"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
    Home,
    MessageCircle,
    Bookmark,
    User,
    FileText,
    HelpCircle,
    LifeBuoy,
    PenSquare
} from "lucide-react";
import styles from "./community.module.css";

interface IdeasSidebarProps {
    onPostClick?: () => void;
    userId?: string;
}

const NAV_ITEMS = [
    { label: "Home", href: "/community", icon: Home },
    { label: "Replies", href: "/community?view=replies", icon: MessageCircle },
    { label: "Bookmarks", href: "/community?view=bookmarks", icon: Bookmark },
    { label: "Profile", href: "/community/profile", icon: User, requiresAuth: true },
];

const FOOTER_ITEMS = [
    { label: "Community guidelines", href: "/community/guidelines", icon: FileText },
    { label: "Support", href: "/support", icon: LifeBuoy },
    { label: "FAQs", href: "/faqs", icon: HelpCircle },
];

export default function IdeasSidebar({ onPostClick, userId }: IdeasSidebarProps) {
    const pathname = usePathname();

    return (
        <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
                <h2 className={styles.sidebarTitle}>Ideas</h2>
                <p className={styles.sidebarSubtitle}>Serving public conversation</p>
            </div>

            <nav className={styles.sidebarNav}>
                {NAV_ITEMS.map((item) => {
                    // For profile, link to user's own profile
                    const href = item.label === "Profile" && userId
                        ? `/community/profile/${userId}`
                        : item.href;

                    const isActive = pathname === href ||
                        (item.href.includes("?") && pathname === "/community" && item.href.includes(pathname));

                    return (
                        <Link
                            key={item.label}
                            href={href}
                            className={clsx(styles.navItem, isActive && styles.navItemActive)}
                        >
                            <item.icon size={20} />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className={styles.sidebarDivider} />

            <nav className={styles.sidebarFooterNav}>
                {FOOTER_ITEMS.map((item) => (
                    <Link
                        key={item.label}
                        href={item.href}
                        className={styles.footerNavItem}
                    >
                        <item.icon size={16} />
                        <span>{item.label}</span>
                    </Link>
                ))}
            </nav>

            <button
                className={styles.postButton}
                onClick={onPostClick}
            >
                <PenSquare size={18} />
                Post
            </button>
        </aside>
    );
}
