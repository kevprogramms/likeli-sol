// lib/graduation.ts
// Market graduation logic - handles phase transitions

// ============================================
// GRADUATION CONFIGURATION
// ============================================

/** Volume threshold to trigger graduation (in USD) */
export const GRADUATION_VOLUME_THRESHOLD = 1000;

/** Time in graduation phase before moving to main (in ms) */
export const GRADUATION_TIMER_MS = 5 * 60 * 1000; // 5 minutes

/** Maximum answers for multi-choice markets */
export const MAX_ANSWERS = 5;

/** Minimum ante for market creation */
export const MINIMUM_ANTE = 100;

// ============================================
// MARKET PHASES
// ============================================

export type MarketPhase = 'sandbox' | 'graduating' | 'main' | 'resolved';
export type OutcomeType = 'BINARY' | 'MULTIPLE_CHOICE';
export type Resolution = 'YES' | 'NO' | 'MKT' | 'CANCEL';

// ============================================
// ANSWER TYPE (for multi-choice markets)
// Define Pool locally to avoid circular dependency
// ============================================

export interface AnswerPool {
    YES: number;
    NO: number;
    [outcome: string]: number; // Index signature for Manifold compatibility
}

export interface Answer {
    id: string;
    text: string;
    pool: AnswerPool;
    prob: number;
    volume: number;
    resolution?: Resolution;
    index: number;
}

// ============================================
// GRADUATION FUNCTIONS
// ============================================

/**
 * Check if a market is eligible to START graduation
 * (Sandbox → Graduating)
 */
export function checkGraduationEligibility(
    phase: MarketPhase,
    volume: number
): boolean {
    return phase === 'sandbox' && volume >= GRADUATION_VOLUME_THRESHOLD;
}

/**
 * Check if a market's graduation timer is complete
 * (Graduating → Main)
 */
export function checkGraduationComplete(
    phase: MarketPhase,
    graduationStartTime?: number
): boolean {
    if (phase !== 'graduating') return false;
    if (!graduationStartTime) return false;
    return Date.now() - graduationStartTime >= GRADUATION_TIMER_MS;
}

/**
 * Get time remaining in graduation phase (in ms)
 */
export function getGraduationTimeRemaining(
    graduationStartTime?: number
): number {
    if (!graduationStartTime) return GRADUATION_TIMER_MS;
    const elapsed = Date.now() - graduationStartTime;
    return Math.max(0, GRADUATION_TIMER_MS - elapsed);
}

/**
 * Format time remaining as "X min Y sec"
 */
export function formatTimeRemaining(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
}

/**
 * Get graduation progress as percentage (0-100)
 */
export function getGraduationProgress(graduationStartTime?: number): number {
    if (!graduationStartTime) return 0;
    const elapsed = Date.now() - graduationStartTime;
    return Math.min(100, (elapsed / GRADUATION_TIMER_MS) * 100);
}

// ============================================
// MULTI-CHOICE HELPERS
// ============================================

/**
 * Generate a random ID (matching Manifold's format)
 */
export function generateId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 12; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}

/**
 * Generate URL-friendly slug from question
 */
export function generateSlug(question: string): string {
    return question
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50) + '-' + generateId().slice(0, 6);
}

/**
 * Validate answer count for multi-choice
 */
export function validateAnswers(answers: string[]): void {
    if (answers.length < 2) {
        throw new Error('Multi-choice markets need at least 2 answers');
    }
    if (answers.length > MAX_ANSWERS) {
        throw new Error(`Maximum ${MAX_ANSWERS} answers allowed`);
    }
}
