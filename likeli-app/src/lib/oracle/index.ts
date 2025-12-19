// lib/oracle/index.ts
// Oracle module exports

export * from './types';
export * from './config';
export {
    fetchCryptoPrice,
    createProposal,
    isDeadlinePassed,
    isChallengeWindowExpired,
    formatTimeRemaining
} from './agent';
export {
    submitChallenge,
    resolveDispute,
    didChallengerWin
} from './challenge';
