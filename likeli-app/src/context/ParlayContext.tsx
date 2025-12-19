"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback } from "react";

// Maximum legs allowed in a parlay
export const MAX_PARLAY_LEGS = 5;
export const MIN_PARLAY_LEGS = 2;

export interface ParlayLegItem {
    marketId: string;
    marketQuestion: string;
    outcome: "YES" | "NO";
    // Price at time of adding (for display only - we use live price at bet time)
    displayPrice: number;
}

interface ParlayContextType {
    legs: ParlayLegItem[];
    isOpen: boolean;
    addLeg: (marketId: string, marketQuestion: string, outcome: "YES" | "NO", price: number) => void;
    removeLeg: (marketId: string) => void;
    clearParlay: () => void;
    toggleOpen: () => void;
    setOpen: (open: boolean) => void;
    hasMarket: (marketId: string) => boolean;
    canAddMore: boolean;
    canPlace: boolean;
}

const ParlayContext = createContext<ParlayContextType | undefined>(undefined);

export function ParlayProvider({ children }: { children: ReactNode }) {
    const [legs, setLegs] = useState<ParlayLegItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    const addLeg = useCallback((
        marketId: string,
        marketQuestion: string,
        outcome: "YES" | "NO",
        price: number
    ) => {
        setLegs(prev => {
            // Don't add if already at max
            if (prev.length >= MAX_PARLAY_LEGS) {
                return prev;
            }
            // Don't add if market already in parlay
            if (prev.some(l => l.marketId === marketId)) {
                return prev;
            }
            return [...prev, {
                marketId,
                marketQuestion,
                outcome,
                displayPrice: price,
            }];
        });
        // Auto-open the parlay slip
        setIsOpen(true);
    }, []);

    const removeLeg = useCallback((marketId: string) => {
        setLegs(prev => prev.filter(l => l.marketId !== marketId));
    }, []);

    const clearParlay = useCallback(() => {
        setLegs([]);
    }, []);

    const toggleOpen = useCallback(() => {
        setIsOpen(prev => !prev);
    }, []);

    const setOpen = useCallback((open: boolean) => {
        setIsOpen(open);
    }, []);

    const hasMarket = useCallback((marketId: string) => {
        return legs.some(l => l.marketId === marketId);
    }, [legs]);

    const canAddMore = legs.length < MAX_PARLAY_LEGS;
    const canPlace = legs.length >= MIN_PARLAY_LEGS;

    return (
        <ParlayContext.Provider
            value={{
                legs,
                isOpen,
                addLeg,
                removeLeg,
                clearParlay,
                toggleOpen,
                setOpen,
                hasMarket,
                canAddMore,
                canPlace,
            }}
        >
            {children}
        </ParlayContext.Provider>
    );
}

export function useParlay() {
    const context = useContext(ParlayContext);
    if (context === undefined) {
        throw new Error("useParlay must be used within a ParlayProvider");
    }
    return context;
}
