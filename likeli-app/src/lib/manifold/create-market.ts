// lib/manifold/create-market.ts
// Market Creation Logic - 100% Manifold Match

import { Contract, Answer, MINIMUM_ANTE, LIQUIDITY_MULTIPLIER, MAX_ANSWERS } from './types';
import { createInitialPool, getCpmmProbability, generateId, generateSlug } from './cpmm';
import { saveContract, updateUserBalance, getOrCreateUser, addPricePoint } from './store';

// ============================================
// CREATE MARKET - MAIN FUNCTION
// ============================================

export interface CreateMarketParams {
    question: string;
    description?: string;
    closeTime?: number;
    initialProb?: number;  // 0-1, default 0.5
    ante: number;          // Initial liquidity
    outcomeType?: 'BINARY' | 'MULTIPLE_CHOICE';
    answers?: string[];    // For multiple choice
    shouldAnswersSumToOne?: boolean; // For multi-choice: true = dependent, false = independent
    category?: string;
    rules?: string;
    creatorId: string;
}

export interface CreateMarketResult {
    success: boolean;
    error?: string;
    contract?: Contract;
    newBalance?: number;
}

/**
 * Create a new prediction market
 */
export function createMarket(params: CreateMarketParams): CreateMarketResult {
    const {
        question,
        description,
        closeTime,
        initialProb = 0.5,
        ante,
        outcomeType = 'BINARY',
        answers: answerTexts,
        shouldAnswersSumToOne = true, // Default to dependent for multi-choice
        category = 'General',
        rules = '',
        creatorId
    } = params;

    // 1. Validate question
    if (!question || question.trim().length === 0) {
        return { success: false, error: 'Question is required' };
    }

    // 2. Validate ante
    if (ante < MINIMUM_ANTE) {
        return { success: false, error: `Minimum ante is $${MINIMUM_ANTE}` };
    }

    // 3. Check creator balance
    const user = getOrCreateUser(creatorId);
    if (user.balance < ante) {
        return { success: false, error: 'Insufficient balance for ante' };
    }

    // 4. Validate multi-choice answers
    if (outcomeType === 'MULTIPLE_CHOICE') {
        if (!answerTexts || answerTexts.length < 2) {
            return { success: false, error: 'Multi-choice needs at least 2 answers' };
        }
        if (answerTexts.length > MAX_ANSWERS) {
            return { success: false, error: `Maximum ${MAX_ANSWERS} answers allowed` };
        }
    }

    // 5. Create initial pool
    const pool = createInitialPool(ante, initialProb, LIQUIDITY_MULTIPLIER);
    const contractId = `sb_${generateId(8)}`;
    const slug = generateSlug(question);
    const now = Date.now();

    // 6. Create answers for multi-choice
    let answers: Answer[] | undefined;
    if (outcomeType === 'MULTIPLE_CHOICE' && answerTexts) {
        const perAnswerAnte = ante / answerTexts.length;
        const initialAnswerProb = 1 / answerTexts.length;

        answers = answerTexts.map((text, index) => {
            // Skew pool to match the initial probability (1/N)
            const answerPool = createInitialPool(perAnswerAnte, initialAnswerProb, LIQUIDITY_MULTIPLIER);
            return {
                id: generateId(),
                contractId,
                text,
                poolYes: answerPool.YES,
                poolNo: answerPool.NO,
                prob: initialAnswerProb,
                p: 0.5, // Standard p for answer pools
                totalLiquidity: perAnswerAnte * LIQUIDITY_MULTIPLIER,
                subsidyPool: 0,
                volume: 0,
                index,
                createdTime: now
            };
        });
    }

    // 7. Create contract
    const contract: Contract = {
        id: contractId,
        slug,
        question,
        creatorId,
        mechanism: outcomeType === 'MULTIPLE_CHOICE' ? 'cpmm-multi-1' : 'cpmm-1',
        outcomeType,
        shouldAnswersSumToOne: outcomeType === 'MULTIPLE_CHOICE' ? shouldAnswersSumToOne : undefined,
        pool,
        p: 0.5, // Constant parameter (skewed pools used for initialProb)
        totalLiquidity: ante * LIQUIDITY_MULTIPLIER,
        subsidyPool: 0,
        volume: 0,
        uniqueBettorCount: 0,
        createdTime: now,
        closeTime,
        lastUpdatedTime: now,
        answers,
        // Graduation support
        phase: 'sandbox',
        category: category || 'General'
    };

    // 8. Deduct ante from creator
    updateUserBalance(creatorId, -ante);

    // 9. Save contract
    saveContract(contract);

    // 10. Add initial price point
    addPricePoint(contractId, initialProb);

    return {
        success: true,
        contract,
        newBalance: user.balance - ante
    };
}

/**
 * Validate and sanitize answer texts
 */
export function validateAnswers(answers: string[]): string[] {
    return answers
        .map(a => a.trim())
        .filter(a => a.length > 0);
}
