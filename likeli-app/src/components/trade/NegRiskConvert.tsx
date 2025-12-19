"use client";

import { useState } from "react";
import { useLikeliProgram, MultiPositionAccount } from "@/hooks/useLikeliProgram";
import { PublicKey } from "@solana/web3.js";
import { ArrowRightLeft, Check, X } from "lucide-react";

interface NegRiskConvertProps {
    marketPDA: PublicKey;
    answerCount: number;
    answerLabels: string[];
    position: MultiPositionAccount | null;
    onSuccess?: () => void;
}

/**
 * NegRisk Conversion Component
 * Allows users to convert NO positions to YES + collateral (Polymarket-style)
 * Only works for is_one_winner = true markets
 */
export default function NegRiskConvert({
    marketPDA,
    answerCount,
    answerLabels,
    position,
    onSuccess
}: NegRiskConvertProps) {
    const { convertPositions } = useLikeliProgram();

    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [amount, setAmount] = useState("");
    const [converting, setConverting] = useState(false);
    const [error, setError] = useState("");

    // Build index set from selected indices
    const buildIndexSet = (): number => {
        let indexSet = 0;
        selectedIndices.forEach(idx => {
            indexSet |= (1 << idx);
        });
        return indexSet;
    };

    // Calculate outputs
    const calculateOutputs = () => {
        const noCount = selectedIndices.size;
        const amountNum = parseFloat(amount) || 0;

        if (noCount < 1 || amountNum <= 0) {
            return { collateralOut: 0, yesPositions: [] };
        }

        const collateralOut = (noCount - 1) * amountNum;
        const yesPositions = Array.from({ length: answerCount }, (_, i) => i)
            .filter(i => !selectedIndices.has(i));

        return { collateralOut, yesPositions };
    };

    const toggleAnswer = (idx: number) => {
        const newSet = new Set(selectedIndices);
        if (newSet.has(idx)) {
            newSet.delete(idx);
        } else {
            newSet.add(idx);
        }
        setSelectedIndices(newSet);
    };

    const handleConvert = async () => {
        if (selectedIndices.size < 1) {
            setError("Select at least one NO position to convert");
            return;
        }

        const amountNum = parseFloat(amount);
        if (!amountNum || amountNum <= 0) {
            setError("Enter a valid amount");
            return;
        }

        try {
            setConverting(true);
            setError("");

            const indexSet = buildIndexSet();
            await convertPositions(marketPDA, indexSet, amountNum);

            if (onSuccess) onSuccess();
            setSelectedIndices(new Set());
            setAmount("");
        } catch (e: any) {
            setError(e.message || "Conversion failed");
        } finally {
            setConverting(false);
        }
    };

    const { collateralOut, yesPositions } = calculateOutputs();
    const noShares = position?.noShares || [];

    return (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-2 mb-4">
                <ArrowRightLeft size={20} className="text-purple-400" />
                <h3 className="font-semibold text-white">Convert NO → YES + Cash</h3>
            </div>

            <p className="text-xs text-slate-400 mb-4">
                Convert your NO positions into YES positions for other answers plus collateral.
                This is the NegRisk feature (like Polymarket).
            </p>

            {/* Answer Selection */}
            <div className="space-y-2 mb-4">
                <label className="text-xs text-slate-400">Select NO positions to convert:</label>
                <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: answerCount }, (_, i) => {
                        const shares = noShares[i] ? Number(noShares[i]) : 0;
                        const isSelected = selectedIndices.has(i);

                        return (
                            <button
                                key={i}
                                onClick={() => toggleAnswer(i)}
                                disabled={shares === 0}
                                className={`
                                    p-3 rounded-lg border text-left transition-all
                                    ${isSelected
                                        ? 'border-purple-500 bg-purple-500/20'
                                        : 'border-slate-600 hover:border-slate-500'
                                    }
                                    ${shares === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                `}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-white font-medium">
                                        {answerLabels[i] || `Answer ${i + 1}`}
                                    </span>
                                    {isSelected && <Check size={16} className="text-purple-400" />}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    NO: {shares.toLocaleString()} shares
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Amount Input */}
            <div className="mb-4">
                <label className="text-xs text-slate-400 block mb-1">Amount per position:</label>
                <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                />
            </div>

            {/* Preview */}
            {selectedIndices.size > 0 && parseFloat(amount) > 0 && (
                <div className="bg-slate-900/50 rounded-lg p-3 mb-4">
                    <div className="text-xs text-slate-400 mb-2">You will receive:</div>

                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-green-400 font-mono">
                            ${collateralOut.toLocaleString()}
                        </span>
                        <span className="text-slate-400">collateral</span>
                    </div>

                    {yesPositions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            <span className="text-xs text-slate-400">YES shares in:</span>
                            {yesPositions.map(idx => (
                                <span
                                    key={idx}
                                    className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded"
                                >
                                    {answerLabels[idx] || `Answer ${idx + 1}`}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="text-red-400 text-xs mb-4 flex items-center gap-1">
                    <X size={14} /> {error}
                </div>
            )}

            {/* Action Button */}
            <button
                onClick={handleConvert}
                disabled={converting || selectedIndices.size < 1 || !amount}
                className={`
                    w-full py-3 rounded-lg font-semibold transition-all
                    ${converting || selectedIndices.size < 1 || !amount
                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-500 text-white'
                    }
                `}
            >
                {converting ? "Converting..." : "Convert Positions"}
            </button>
        </div>
    );
}
