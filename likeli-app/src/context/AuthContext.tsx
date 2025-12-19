"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import UsernameModal from "@/components/auth/UsernameModal";
import WalletSelectModal from "@/components/auth/WalletSelectModal";


type WalletType = "metamask" | "phantom";

interface Account {
    walletAddress: string;
    walletType: WalletType;
    username: string;
}

interface AuthContextType {
    walletAddress: string | null;
    walletType: WalletType | null;
    username: string | null;
    isConnecting: boolean;
    connectMetamask: () => Promise<void>;
    connectPhantom: () => Promise<void>;
    disconnect: () => void;
    ensureUsername: () => Promise<void>;
    openWalletModal: () => void;
    closeWalletModal: () => void;
    accountId: string | null;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [walletType, setWalletType] = useState<WalletType | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);

    // Modal state
    const [showUsernameModal, setShowUsernameModal] = useState(false);
    const [showWalletModal, setShowWalletModal] = useState(false);
    const [usernameError, setUsernameError] = useState<string | null>(null);
    const [pendingAccount, setPendingAccount] = useState<{ address: string; type: WalletType } | null>(null);

    // Load session on mount
    useEffect(() => {
        const lastWallet = localStorage.getItem("likeli_last_wallet");
        if (lastWallet) {
            try {
                const { walletAddress, walletType } = JSON.parse(lastWallet);
                if (walletAddress && walletType) {
                    // Restore session from likeli_accounts
                    const accountsStr = localStorage.getItem("likeli_accounts");
                    const accounts: Account[] = accountsStr ? JSON.parse(accountsStr) : [];
                    const account = accounts.find(
                        (a) => a.walletAddress === walletAddress && a.walletType === walletType
                    );

                    if (account) {
                        setWalletAddress(account.walletAddress);
                        setWalletType(account.walletType);
                        setUsername(account.username);
                    }
                }
            } catch (e) {
                console.error("Failed to restore session", e);
            }
        }
    }, []);

    const connectMetamask = async () => {
        setIsConnecting(true);
        try {
            const ethereum = (window as any).ethereum;
            if (!ethereum) {
                alert("Metamask is not installed! Please install the MetaMask extension.");
                return;
            }

            const accounts = await ethereum.request({ method: "eth_requestAccounts" });
            if (!accounts || accounts.length === 0) {
                console.warn("No accounts returned from MetaMask");
                return;
            }
            const address = accounts[0].toLowerCase();

            setWalletAddress(address);
            setWalletType("metamask");

            await ensureUsername(address, "metamask");
            setShowWalletModal(false);
        } catch (error: any) {
            console.error("Metamask connection failed", error);
            // Handle user rejection or other errors gracefully
            if (error.code === 4001) {
                // User rejected the request
                console.log("User rejected MetaMask connection");
            } else {
                // Other errors - don't show alert for these, just log
                console.warn("MetaMask error (this is usually safe to ignore):", error.message);
            }
        } finally {
            setIsConnecting(false);
        }
    };

    const connectPhantom = async () => {
        setIsConnecting(true);
        try {
            const solana = (window as any).solana;
            if (!solana || !solana.isPhantom) {
                alert("Phantom wallet is not installed!");
                return;
            }

            const response = await solana.connect();
            const address = response.publicKey.toString();

            setWalletAddress(address);
            setWalletType("phantom");

            await ensureUsername(address, "phantom");
            setShowWalletModal(false);
        } catch (error) {
            console.error("Phantom connection failed", error);
        } finally {
            setIsConnecting(false);
        }
    };

    const ensureUsername = async (address: string, type: WalletType) => {
        const accountsStr = localStorage.getItem("likeli_accounts");
        const accounts: Account[] = accountsStr ? JSON.parse(accountsStr) : [];

        const existingAccount = accounts.find(
            (a) => a.walletAddress === address && a.walletType === type
        );

        if (existingAccount) {
            setUsername(existingAccount.username);
            localStorage.setItem("likeli_last_wallet", JSON.stringify({ walletAddress: address, walletType: type }));
        } else {
            // Need to create a username
            setPendingAccount({ address, type });
            setShowUsernameModal(true);
        }
    };

    const handleUsernameSubmit = (newUsername: string) => {
        if (!pendingAccount) return;

        // Validate format
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) {
            setUsernameError("Username must be 3-20 characters, alphanumeric or underscore.");
            return;
        }

        // Check uniqueness
        const accountsStr = localStorage.getItem("likeli_accounts");
        const accounts: Account[] = accountsStr ? JSON.parse(accountsStr) : [];

        if (accounts.some((a) => a.username.toLowerCase() === newUsername.toLowerCase())) {
            setUsernameError("Username is already taken.");
            return;
        }

        // Save new account
        const newAccount: Account = {
            walletAddress: pendingAccount.address,
            walletType: pendingAccount.type,
            username: newUsername,
        };

        accounts.push(newAccount);
        localStorage.setItem("likeli_accounts", JSON.stringify(accounts));
        localStorage.setItem("likeli_last_wallet", JSON.stringify({ walletAddress: pendingAccount.address, walletType: pendingAccount.type }));

        setUsername(newUsername);
        setShowUsernameModal(false);
        setPendingAccount(null);
        setUsernameError(null);
    };

    const disconnect = () => {
        setWalletAddress(null);
        setWalletType(null);
        setUsername(null);
        localStorage.removeItem("likeli_last_wallet");
    };

    const accountId = walletAddress && walletType ? `${walletType}:${walletAddress.toLowerCase()}` : null;
    const isAuthenticated = !!(accountId && username);

    return (
        <AuthContext.Provider
            value={{
                walletAddress,
                walletType,
                username,
                isConnecting,
                connectMetamask,
                connectPhantom,
                disconnect,
                ensureUsername: async () => { /* no-op, handled internally */ },
                openWalletModal: () => setShowWalletModal(true),
                closeWalletModal: () => setShowWalletModal(false),
                accountId,
                isAuthenticated,
            }}
        >
            {children}
            <WalletSelectModal
                isOpen={showWalletModal}
                onClose={() => setShowWalletModal(false)}
                onConnectMetamask={connectMetamask}
                onConnectPhantom={connectPhantom}
            />
            <UsernameModal
                isOpen={showUsernameModal}
                onSubmit={handleUsernameSubmit}
                onClose={() => {
                    setShowUsernameModal(false);
                    disconnect(); // If they cancel username creation, disconnect
                }}
                error={usernameError}
            />
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
