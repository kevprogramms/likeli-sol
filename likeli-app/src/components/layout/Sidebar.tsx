"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Vault,
  PieChart,
  History,
  Settings,
  Users
} from "lucide-react";
import styles from "./layout.module.css";
import clsx from "clsx";
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton";

const NAV_ITEMS = [
  { label: "Markets", href: "/", icon: LayoutGrid },
  { label: "Vaults", href: "/vaults", icon: Vault },
  { label: "Community", href: "/community", icon: Users },
  { label: "Portfolio", href: "/portfolio", icon: PieChart },
  { label: "History", href: "/history", icon: History },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <img
          src="/likeli-logo.png"
          alt="Likeli logo"
          className={styles.logoImage}
        />
        <span>Likeli</span>
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(styles.navItem, isActive && styles.navItemActive)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={styles.userSection}>
        <ConnectWalletButton className="wallet-adapter-dropup" />
      </div>
    </aside>
  );
}
