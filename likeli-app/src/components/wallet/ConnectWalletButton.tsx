"use client";

import dynamic from "next/dynamic";

// Dynamically import to avoid SSR issues
const WalletMultiButton = dynamic(
    () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
    { ssr: false }
);

export default function ConnectWalletButton({ className }: { className?: string }) {
    return (
        <div className={className}>
            <WalletMultiButton
                style={{
                    backgroundColor: "var(--color-primary)",
                    borderRadius: "12px",
                    height: "40px",
                    fontSize: "14px",
                    fontWeight: 600,
                    width: "100%",
                }}
            />
        </div>
    );
}
