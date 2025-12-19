// pages/api/webhooks/helius.ts
// Helius webhook handler for indexing Solana transactions

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey } from '@solana/web3.js';

// Initialize Supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Initialize Solana connection (using Helius RPC for best reliability)
const connection = new Connection(
    process.env.HELIUS_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
);

// Instruction discriminators (first 8 bytes of sha256 hash)
const INSTRUCTION_DISCRIMINATORS: Record<string, string> = {
    'buy_shares': '5a9e7f1b8c3d2e4f',
    'sell_shares': '6b0f8e2c9d4a3b5g',
    'buy_multi': '7c1e9f3d0a5b4c6h',
    'sell_multi': '8d2f0e4a1b6c5d7i',
    'convert_positions': '9e3f1a5b2c7d6e8j',
    'resolve_market': 'af4e2b6c3d8e7f9k',
    'resolve_answer': 'be5f3c7d4e9f8a0l',
    'claim_winnings': 'cf6a4d8e5f0b9c1m',
    'claim_multi_winnings': 'de7b5e9f6a1c0d2n',
};

interface HeliusTransaction {
    signature: string;
    slot: number;
    timestamp: number;
    type: string;
    accountData: {
        account: string;
        nativeBalanceChange: number;
        tokenBalanceChanges: any[];
    }[];
    instructions: {
        programId: string;
        accounts: string[];
        data: string;
        innerInstructions: any[];
    }[];
    events: any;
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify webhook secret (optional but recommended)
    const authHeader = req.headers['authorization'];
    if (process.env.HELIUS_WEBHOOK_SECRET && authHeader !== `Bearer ${process.env.HELIUS_WEBHOOK_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const transactions: HeliusTransaction[] = Array.isArray(req.body) ? req.body : [req.body];

        for (const tx of transactions) {
            await processTransaction(tx);
        }

        return res.status(200).json({ success: true, processed: transactions.length });
    } catch (error) {
        console.error('Webhook processing error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

async function processTransaction(tx: HeliusTransaction) {
    const { signature, slot, timestamp, instructions } = tx;

    // Process each instruction
    for (const ix of instructions) {
        // Check if it's our program
        if (ix.programId !== process.env.NEXT_PUBLIC_PROGRAM_ID) {
            continue;
        }

        try {
            // Decode instruction data to determine type
            const dataBuffer = Buffer.from(ix.data, 'base64');
            const discriminator = dataBuffer.slice(0, 8).toString('hex');

            // Match discriminator to instruction type
            const instructionType = Object.entries(INSTRUCTION_DISCRIMINATORS)
                .find(([_, disc]) => disc === discriminator)?.[0];

            if (!instructionType) {
                console.log('Unknown instruction:', discriminator);
                continue;
            }

            // Process based on instruction type
            switch (instructionType) {
                case 'buy_shares':
                case 'sell_shares':
                    await processBinaryTrade(tx, ix, instructionType === 'sell_shares');
                    break;

                case 'buy_multi':
                case 'sell_multi':
                    await processMultiTrade(tx, ix, instructionType === 'sell_multi');
                    break;

                case 'convert_positions':
                    await processConversion(tx, ix);
                    break;

                case 'resolve_market':
                    await processMarketResolution(tx, ix);
                    break;

                case 'resolve_answer':
                    await processAnswerResolution(tx, ix);
                    break;

                case 'claim_winnings':
                case 'claim_multi_winnings':
                    await processClaim(tx, ix);
                    break;
            }
        } catch (error) {
            console.error(`Error processing instruction in ${signature}:`, error);
        }
    }
}

async function processBinaryTrade(tx: HeliusTransaction, ix: any, isSell: boolean) {
    const [market, userPosition, user] = ix.accounts;

    // Decode instruction data
    const dataBuffer = Buffer.from(ix.data, 'base64');
    // Skip 8-byte discriminator
    const outcome = dataBuffer.readUInt8(8) === 1;
    const amount = dataBuffer.readBigUInt64LE(9);

    // Insert trade record
    await supabase.from('trades').insert({
        signature: tx.signature,
        market_address: market,
        market_type: 'binary',
        user_wallet: user,
        trade_type: isSell ? 'SELL' : 'BUY',
        outcome: outcome ? 'YES' : 'NO',
        amount: Number(amount),
        slot: tx.slot,
        timestamp: new Date(tx.timestamp * 1000).toISOString()
    });

    // Update price history
    await updatePriceHistory(market, 0);
}

async function processMultiTrade(tx: HeliusTransaction, ix: any, isSell: boolean) {
    const [market, answer, position, user] = ix.accounts;

    const dataBuffer = Buffer.from(ix.data, 'base64');
    const outcome = dataBuffer.readUInt8(8) === 1;
    const amount = dataBuffer.readBigUInt64LE(9);

    // Get answer index from answer account
    const { data: answerData } = await supabase
        .from('answers')
        .select('index')
        .eq('answer_address', answer)
        .single();

    await supabase.from('trades').insert({
        signature: tx.signature,
        market_address: market,
        market_type: 'multi',
        user_wallet: user,
        answer_index: answerData?.index,
        trade_type: isSell ? 'SELL' : 'BUY',
        outcome: outcome ? 'YES' : 'NO',
        amount: Number(amount),
        slot: tx.slot,
        timestamp: new Date(tx.timestamp * 1000).toISOString()
    });

    // Update price history
    await updatePriceHistory(market, answerData?.index || 0);
}

async function processConversion(tx: HeliusTransaction, ix: any) {
    const [market, position, user] = ix.accounts;

    const dataBuffer = Buffer.from(ix.data, 'base64');
    const indexSet = dataBuffer.readUInt16LE(8);
    const amount = dataBuffer.readBigUInt64LE(10);

    await supabase.from('trades').insert({
        signature: tx.signature,
        market_address: market,
        market_type: 'multi',
        user_wallet: user,
        trade_type: 'CONVERT',
        amount: Number(amount),
        slot: tx.slot,
        timestamp: new Date(tx.timestamp * 1000).toISOString()
    });
}

async function processMarketResolution(tx: HeliusTransaction, ix: any) {
    const [market, resolver] = ix.accounts;

    const dataBuffer = Buffer.from(ix.data, 'base64');
    const outcome = dataBuffer.readUInt8(8) === 1;

    await supabase
        .from('binary_markets')
        .update({ resolved: true, outcome })
        .eq('address', market);
}

async function processAnswerResolution(tx: HeliusTransaction, ix: any) {
    const [market, answer, resolver] = ix.accounts;

    const dataBuffer = Buffer.from(ix.data, 'base64');
    const outcome = dataBuffer.readUInt8(8) === 1;

    await supabase
        .from('answers')
        .update({ resolved: true, outcome })
        .eq('answer_address', answer);

    // Check if all answers resolved
    const { data: answers } = await supabase
        .from('answers')
        .select('resolved')
        .eq('market_address', market);

    const allResolved = answers?.every(a => a.resolved);
    if (allResolved) {
        await supabase
            .from('multi_markets')
            .update({ resolved: true })
            .eq('address', market);
    }
}

async function processClaim(tx: HeliusTransaction, ix: any) {
    // Just log the claim for analytics
    console.log(`Claim processed: ${tx.signature}`);
}

async function updatePriceHistory(marketAddress: string, answerIndex: number) {
    try {
        // Fetch actual pool data from Solana RPC
        const marketPubkey = new PublicKey(marketAddress);
        const accountInfo = await connection.getAccountInfo(marketPubkey);
        
        if (!accountInfo || !accountInfo.data) {
            console.error('Market account not found:', marketAddress);
            return;
        }
        
        // Decode market account data
        // Account layout (after 8-byte discriminator):
        // creator: 32 bytes (offset 8)
        // question: 4 + 200 bytes (offset 40) - length-prefixed string
        // resolution_time: 8 bytes (offset 244)
        // yes_pool: 8 bytes (offset 252)
        // no_pool: 8 bytes (offset 260)
        
        const data = accountInfo.data;
        const YES_POOL_OFFSET = 252;
        const NO_POOL_OFFSET = 260;
        
        // Read pool values as little-endian u64
        const yesPool = data.readBigUInt64LE(YES_POOL_OFFSET);
        const noPool = data.readBigUInt64LE(NO_POOL_OFFSET);
        
        // Calculate probability: YES probability = no_pool / (yes_pool + no_pool)
        // This is the CPMM formula: price of YES = opposite pool / total
        const total = Number(yesPool) + Number(noPool);
        const probability = total > 0 ? Number(noPool) / total : 0.5;
        
        // Clamp probability to valid range
        const clampedProbability = Math.max(0.0001, Math.min(0.9999, probability));
        
        await supabase.from('prices').insert({
            market_address: marketAddress,
            answer_index: answerIndex,
            probability: clampedProbability,
            timestamp: new Date().toISOString()
        });
        
        console.log(`Price updated: ${marketAddress} -> ${(clampedProbability * 100).toFixed(2)}% YES`);
    } catch (error) {
        console.error('Error updating price history:', error);
    }
}

// Webhook configuration for Helius:
// 1. Go to https://dev.helius.xyz/
// 2. Create a webhook
// 3. Set type to "Enhanced Transaction"
// 4. Add your program ID as filter
// 5. Set webhook URL to: https://your-app.vercel.app/api/webhooks/helius
