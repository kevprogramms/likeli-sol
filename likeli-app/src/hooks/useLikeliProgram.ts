import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, Transaction } from "@solana/web3.js";
import { useMemo, useCallback } from "react";

// Import the IDL
import idl from "../idl/likeli_contracts.json";

// Program ID from deployment
export const PROGRAM_ID = new PublicKey("8nuTp2x4c8bF668xLkg51TncSYPGcnyWMQczH8AmVfwJ");

// ============== TYPE DEFINITIONS ==============

export interface MarketAccount {
    creator: PublicKey;
    question: string;
    resolutionTime: BN;
    yesPool: BN;
    noPool: BN;
    totalVolume: BN;
    resolved: boolean;
    outcome: boolean;
    createdAt: BN;
    bump: number;
    groupId?: string;
    answerLabel?: string;
    yesPrice?: number;
    noPrice?: number;
    feeBps?: number;
    creatorFeeBps?: number;
    platformFeeBps?: number;
    liquidityFeeBps?: number;
    collectedFees?: BN;
}

export interface MultiMarketAccount {
    creator: PublicKey;
    questionHash: number[];
    answerCount: number;
    isOneWinner: boolean;
    volume: BN;
    feeBps: number;
    resolutionTime: BN;
    resolved: boolean;
    createdAt: BN;
    bump: number;
    answersResolved: number;
}

export interface AnswerAccount {
    market: PublicKey;
    index: number;
    labelHash: number[];
    yesPool: BN;
    noPool: BN;
    volume: BN;
    resolved: boolean;
    outcome: boolean | null;
    yesPrice?: number;
    noPrice?: number;
}

export interface UserPositionAccount {
    owner: PublicKey;
    market: PublicKey;
    yesShares: BN;
    noShares: BN;
}

export interface MultiPositionAccount {
    owner: PublicKey;
    market: PublicKey;
    yesShares: BN[];
    noShares: BN[];
}

export interface LimitOrderAccount {
    owner: PublicKey;
    market: PublicKey;
    price: BN;
    qty: BN;
    filledQty?: BN;
    isYes: boolean;
    isBid: boolean;
    createdAt: BN;
    expiresAt?: BN | null;
    publicKey: PublicKey;
}

export interface OrderbookAccount {
    market: PublicKey;
    yesBuyOrders: PublicKey[];
    yesSellOrders: PublicKey[];
    noBuyOrders: PublicKey[];
    noSellOrders: PublicKey[];
}

// ============== MAIN HOOK ==============

export function useLikeliProgram() {
    const { connection } = useConnection();
    const wallet = useWallet();

    const provider = useMemo(() => {
        if (!wallet.publicKey || !wallet.signTransaction) return null;

        return new AnchorProvider(
            connection,
            wallet as any,
            { commitment: "confirmed" }
        );
    }, [connection, wallet]);

    const program = useMemo(() => {
        if (!provider) return null;
        return new Program(idl as Idl, provider);
    }, [provider]);

    // ============== PDA DERIVATION ==============

    const getMarketPDA = useCallback((creator: PublicKey, question: string, answerLabel?: string) => {
        const allBytes = Buffer.from(question);
        const questionBytes = allBytes.subarray(0, Math.min(15, allBytes.length));
        const answerBytes = answerLabel
            ? Buffer.from(answerLabel).subarray(0, Math.min(15, Buffer.from(answerLabel).length))
            : Buffer.from("binary");

        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("market"), creator.toBuffer(), questionBytes, answerBytes],
            PROGRAM_ID
        );
        return pda;
    }, []);

    const getMultiMarketPDA = useCallback((creator: PublicKey, questionHash: Uint8Array) => {
        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("multi_market"), creator.toBuffer(), Buffer.from(questionHash)],
            PROGRAM_ID
        );
        return pda;
    }, []);

    const getAnswerPDA = useCallback((market: PublicKey, index: number) => {
        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("answer"), market.toBuffer(), Buffer.from([index])],
            PROGRAM_ID
        );
        return pda;
    }, []);

    const getOrderbookPDA = useCallback((market: PublicKey) => {
        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("orderbook"), market.toBuffer()],
            PROGRAM_ID
        );
        return pda;
    }, []);

    const getUserPositionPDA = useCallback((market: PublicKey, user: PublicKey) => {
        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), market.toBuffer(), user.toBuffer()],
            PROGRAM_ID
        );
        return pda;
    }, []);

    const getMultiPositionPDA = useCallback((market: PublicKey, user: PublicKey) => {
        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("multi_position"), market.toBuffer(), user.toBuffer()],
            PROGRAM_ID
        );
        return pda;
    }, []);

    // ============== BINARY MARKET FUNCTIONS ==============

    const createMarket = useCallback(async (
        question: string,
        resolutionTime: number,
        initialLiquidity: number,
        groupId?: string,
        answerLabel?: string
    ) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        const marketPDA = getMarketPDA(wallet.publicKey, question, answerLabel);

        const tx = await program.methods
            .createMarket(
                question,
                new BN(resolutionTime),
                new BN(initialLiquidity),
                groupId || null,
                answerLabel || null
            )
            .accounts({
                market: marketPDA,
                creator: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        return { tx, marketPDA };
    }, [program, wallet.publicKey, getMarketPDA]);

    const buyShares = useCallback(async (
        marketPDA: PublicKey,
        outcome: boolean,
        amount: number,
        minSharesOut: number = 0,
        remainingAccounts: { pubkey: PublicKey, isWritable: boolean, isSigner: boolean }[] = []
    ) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        const userPositionPDA = getUserPositionPDA(marketPDA, wallet.publicKey);
        const orderbookPDA = getOrderbookPDA(marketPDA);

        const tx = await program.methods
            .buyShares(outcome, new BN(amount), new BN(minSharesOut))
            .accounts({
                market: marketPDA,
                orderbook: orderbookPDA,
                userPosition: userPositionPDA,
                buyer: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .remainingAccounts(remainingAccounts)
            .rpc();

        console.log("Shares bought:", tx);
        return tx;
    }, [program, wallet.publicKey, getUserPositionPDA, getOrderbookPDA]);

    const sellShares = useCallback(async (
        marketPDA: PublicKey,
        outcome: boolean,
        sharesQty: number,
        minPayout: number = 0,
        remainingAccounts: { pubkey: PublicKey, isWritable: boolean, isSigner: boolean }[] = []
    ) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        const userPositionPDA = getUserPositionPDA(marketPDA, wallet.publicKey);
        const orderbookPDA = getOrderbookPDA(marketPDA);

        const tx = await program.methods
            .sellShares(outcome, new BN(sharesQty), new BN(minPayout))
            .accounts({
                market: marketPDA,
                orderbook: orderbookPDA,
                userPosition: userPositionPDA,
                buyer: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .remainingAccounts(remainingAccounts)
            .rpc();

        console.log("Shares sold:", tx);
        return tx;
    }, [program, wallet.publicKey, getUserPositionPDA, getOrderbookPDA]);

    const claimWinnings = useCallback(async (marketPDA: PublicKey) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        const userPositionPDA = getUserPositionPDA(marketPDA, wallet.publicKey);

        const tx = await program.methods
            .claimWinnings()
            .accounts({
                market: marketPDA,
                userPosition: userPositionPDA,
                claimer: wallet.publicKey,
            })
            .rpc();

        console.log("Winnings claimed:", tx);
        return tx;
    }, [program, wallet.publicKey, getUserPositionPDA]);

    const resolveMarket = useCallback(async (
        marketPDA: PublicKey,
        outcome: boolean
    ) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        const tx = await program.methods
            .resolveMarket(outcome)
            .accounts({
                market: marketPDA,
                resolver: wallet.publicKey,
            })
            .rpc();

        console.log("Market resolved:", tx);
        return tx;
    }, [program, wallet.publicKey]);

    // ============== MULTI-CHOICE MARKET FUNCTIONS ==============

    const createMultiMarket = useCallback(async (
        question: string,
        answerCount: number,
        isOneWinner: boolean,
        initialLiquidityPerAnswer: number,
        feeBps: number,
        resolutionTime: number
    ) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        // Create question hash
        const encoder = new TextEncoder();
        const data = encoder.encode(question);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data as any);
        const questionHash = new Uint8Array(hashBuffer);

        const marketPDA = getMultiMarketPDA(wallet.publicKey, questionHash);

        const tx = await program.methods
            .createMultiMarket(
                Array.from(questionHash),
                answerCount,
                isOneWinner,
                new BN(initialLiquidityPerAnswer),
                feeBps,
                new BN(resolutionTime)
            )
            .accounts({
                market: marketPDA,
                creator: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log("Multi-choice market created:", tx);
        return { tx, marketPDA, questionHash };
    }, [program, wallet.publicKey, getMultiMarketPDA]);

    const addAnswer = useCallback(async (
        marketPDA: PublicKey,
        index: number,
        label: string,
        initialLiquidity: number
    ) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        // Create label hash
        const encoder = new TextEncoder();
        const data = encoder.encode(label);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data as any);
        const labelHash = Array.from(new Uint8Array(hashBuffer));

        const answerPDA = getAnswerPDA(marketPDA, index);

        const tx = await program.methods
            .addAnswer(index, labelHash, new BN(initialLiquidity))
            .accounts({
                market: marketPDA,
                answer: answerPDA,
                creator: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log("Answer added:", tx);
        return { tx, answerPDA };
    }, [program, wallet.publicKey, getAnswerPDA]);

    const buyMulti = useCallback(async (
        marketPDA: PublicKey,
        answerIndex: number,
        outcome: boolean,
        amount: number,
        minSharesOut: number = 0,
        remainingAccounts: { pubkey: PublicKey, isWritable: boolean, isSigner: boolean }[] = []
    ) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        const answerPDA = getAnswerPDA(marketPDA, answerIndex);
        const positionPDA = getMultiPositionPDA(marketPDA, wallet.publicKey);
        const orderbookPDA = getOrderbookPDA(marketPDA);

        // Note: Orderbook uses init_if_needed in the contract, no manual creation needed
        const tx = await program.methods
            .buyMulti(outcome, new BN(amount), new BN(minSharesOut))
            .accounts({
                market: marketPDA,
                answer: answerPDA,
                orderbook: orderbookPDA,
                position: positionPDA,
                buyer: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .remainingAccounts(remainingAccounts)
            .rpc();

        console.log("Multi shares bought:", tx);
        return tx;
    }, [program, wallet.publicKey, getAnswerPDA, getMultiPositionPDA, getOrderbookPDA]);

    const sellMulti = useCallback(async (
        marketPDA: PublicKey,
        answerIndex: number,
        outcome: boolean,
        shares: number,
        minPayout: number = 0,
        remainingAccounts: { pubkey: PublicKey, isWritable: boolean, isSigner: boolean }[] = []
    ) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        const answerPDA = getAnswerPDA(marketPDA, answerIndex);
        const positionPDA = getMultiPositionPDA(marketPDA, wallet.publicKey);
        const orderbookPDA = getOrderbookPDA(marketPDA);

        // Note: Orderbook uses init_if_needed in the contract, no manual creation needed
        const tx = await program.methods
            .sellMulti(outcome, new BN(shares), new BN(minPayout))
            .accounts({
                market: marketPDA,
                answer: answerPDA,
                orderbook: orderbookPDA,
                position: positionPDA,
                buyer: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .remainingAccounts(remainingAccounts)
            .rpc();

        console.log("Multi shares sold:", tx);
        return tx;
    }, [program, wallet.publicKey, getAnswerPDA, getMultiPositionPDA, getOrderbookPDA]);

    // ============== NEGATIVE RISK FUNCTIONS ==============

    const convertPositions = useCallback(async (
        marketPDA: PublicKey,
        indexSet: number, // Bitmask: which NO positions to convert
        amount: number
    ) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        const positionPDA = getMultiPositionPDA(marketPDA, wallet.publicKey);

        const tx = await program.methods
            .convertPositions(indexSet, new BN(amount))
            .accounts({
                market: marketPDA,
                position: positionPDA,
                owner: wallet.publicKey,
            })
            .rpc();

        console.log("Positions converted:", tx);
        return tx;
    }, [program, wallet.publicKey, getMultiPositionPDA]);

    const rebalanceMarket = useCallback(async (
        marketPDA: PublicKey,
        answerIndex: number,
        remainingAccounts: { pubkey: PublicKey, isWritable: boolean, isSigner: boolean }[] = []
    ) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        const answerPDA = getAnswerPDA(marketPDA, answerIndex);
        const orderbookPDA = getOrderbookPDA(marketPDA);
        const positionPDA = getMultiPositionPDA(marketPDA, wallet.publicKey);

        const tx = await program.methods
            .rebalanceMarket()
            .accounts({
                market: marketPDA,
                answer: answerPDA,
                orderbook: orderbookPDA,
                position: positionPDA,
                buyer: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .remainingAccounts(remainingAccounts)
            .rpc();

        console.log("Market rebalanced:", tx);
        return tx;
    }, [program, wallet.publicKey, getAnswerPDA, getOrderbookPDA, getMultiPositionPDA]);

    const setMultiMarketConfig = useCallback(async (
        marketPDA: PublicKey,
        isOneWinner: boolean,
        feeBps: number,
        resolutionTime: number
    ) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        const tx = await program.methods
            .setMultiMarketConfig(isOneWinner, feeBps, new BN(resolutionTime))
            .accounts({
                market: marketPDA,
                creator: wallet.publicKey,
            })
            .rpc();

        console.log("Multi-market config updated:", tx);
        return tx;
    }, [program, wallet.publicKey]);

    const splitPosition = useCallback(async (
        marketPDA: PublicKey,
        answerIndex: number,
        amount: number
    ) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        const answerPDA = getAnswerPDA(marketPDA, answerIndex);
        const positionPDA = getMultiPositionPDA(marketPDA, wallet.publicKey);

        const tx = await program.methods
            .splitPosition(new BN(amount))
            .accounts({
                market: marketPDA,
                answer: answerPDA,
                position: positionPDA,
                owner: wallet.publicKey,
            })
            .rpc();

        console.log("Position split:", tx);
        return tx;
    }, [program, wallet.publicKey, getAnswerPDA, getMultiPositionPDA]);

    const mergePositions = useCallback(async (
        marketPDA: PublicKey,
        answerIndex: number,
        amount: number
    ) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        const answerPDA = getAnswerPDA(marketPDA, answerIndex);
        const positionPDA = getMultiPositionPDA(marketPDA, wallet.publicKey);

        const tx = await program.methods
            .mergePositions(new BN(amount))
            .accounts({
                market: marketPDA,
                answer: answerPDA,
                position: positionPDA,
                owner: wallet.publicKey,
            })
            .rpc();

        console.log("Positions merged:", tx);
        return tx;
    }, [program, wallet.publicKey, getAnswerPDA, getMultiPositionPDA]);

    const resolveAnswer = useCallback(async (
        marketPDA: PublicKey,
        answerIndex: number,
        outcome: boolean
    ) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        const answerPDA = getAnswerPDA(marketPDA, answerIndex);

        const tx = await program.methods
            .resolveAnswer(outcome)
            .accounts({
                market: marketPDA,
                answer: answerPDA,
                resolver: wallet.publicKey,
            })
            .rpc();

        console.log("Answer resolved:", tx);
        return tx;
    }, [program, wallet.publicKey, getAnswerPDA]);

    const claimMultiWinnings = useCallback(async (marketPDA: PublicKey) => {
        if (!program || !wallet.publicKey) {
            throw new Error("Wallet not connected");
        }

        const positionPDA = getMultiPositionPDA(marketPDA, wallet.publicKey);

        const tx = await program.methods
            .claimMultiWinnings()
            .accounts({
                market: marketPDA,
                position: positionPDA,
                claimer: wallet.publicKey,
            })
            .rpc();

        console.log("Multi winnings claimed:", tx);
        return tx;
    }, [program, wallet.publicKey, getMultiPositionPDA]);

    // ============== LIMIT ORDER FUNCTIONS ==============

    const placeOrder = useCallback(async (
        marketPDA: PublicKey,
        price: number,
        qty: number,
        isYes: boolean,
        isBid: boolean,
        expiresIn?: number,
        remainingAccounts: { pubkey: PublicKey, isWritable: boolean, isSigner: boolean }[] = []
    ) => {
        if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

        const orderKeypair = Keypair.generate();
        const priceBps = Math.floor(price * 10000);
        const orderbookPDA = getOrderbookPDA(marketPDA);

        // Ensure orderbook exists
        try {
            // @ts-ignore
            await program.account.orderbook.fetch(orderbookPDA);
        } catch {
            await program.methods
                .createOrderbook()
                .accounts({
                    orderbook: orderbookPDA,
                    market: marketPDA,
                    creator: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        }

        const tx = await program.methods
            .placeOrder(
                null, // answer_index is None for binary
                new BN(priceBps),
                new BN(qty),
                isYes,
                isBid,
                expiresIn ? new BN(expiresIn) : null
            )
            .accounts({
                market: marketPDA,
                orderbook: orderbookPDA,
                order: orderKeypair.publicKey,
                owner: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .remainingAccounts(remainingAccounts)
            .signers([orderKeypair])
            .rpc();

        console.log("Order placed:", tx);
        return { tx, orderPDA: orderKeypair.publicKey };
    }, [program, wallet.publicKey, getOrderbookPDA]);

    const placeMultiOrder = useCallback(async (
        marketPDA: PublicKey,
        answerIndex: number,
        price: number,
        qty: number,
        isYes: boolean,
        isBid: boolean,
        expiresIn?: number,
        remainingAccounts: { pubkey: PublicKey, isWritable: boolean, isSigner: boolean }[] = []
    ) => {
        if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

        const orderKeypair = Keypair.generate();
        const priceBps = Math.floor(price * 10000);
        const orderbookPDA = getOrderbookPDA(marketPDA);

        // Ensure orderbook exists
        try {
            // @ts-ignore
            await program.account.orderbook.fetch(orderbookPDA);
        } catch {
            await program.methods
                .createOrderbook()
                .accounts({
                    orderbook: orderbookPDA,
                    market: marketPDA,
                    creator: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        }

        const tx = await program.methods
            .placeMultiOrder(
                answerIndex,
                new BN(priceBps),
                new BN(qty),
                isYes,
                isBid,
                expiresIn ? new BN(expiresIn) : null
            )
            .accounts({
                market: marketPDA,
                orderbook: orderbookPDA,
                order: orderKeypair.publicKey,
                owner: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .remainingAccounts(remainingAccounts)
            .signers([orderKeypair])
            .rpc();

        console.log("Multi order placed:", tx);
        return { tx, orderPDA: orderKeypair.publicKey };
    }, [program, wallet.publicKey, getOrderbookPDA]);

    const cancelOrder = useCallback(async (orderPDA: PublicKey) => {
        if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

        // @ts-ignore
        const order = await program.account.limitOrder.fetch(orderPDA);
        const orderbookPDA = getOrderbookPDA(order.market);

        const tx = await program.methods
            .cancelOrder()
            .accounts({
                order: orderPDA,
                orderbook: orderbookPDA,
                owner: wallet.publicKey,
            })
            .rpc();

        console.log("Order cancelled:", tx);
        return tx;
    }, [program, wallet.publicKey, getOrderbookPDA]);

    // ============== FETCH FUNCTIONS ==============

    const calculatePrices = (yesPool: number, noPool: number) => {
        if (yesPool + noPool === 0) return { yesPrice: 0.5, noPrice: 0.5 };
        // CPMM: P(YES) = noPool / (yesPool + noPool)
        // When noPool is high relative to yesPool, YES is more expensive (higher probability)
        const yesPrice = noPool / (yesPool + noPool);
        const noPrice = yesPool / (yesPool + noPool);
        return { yesPrice, noPrice };
    };

    const fetchMarket = useCallback(async (marketPDA: PublicKey): Promise<MarketAccount | null> => {
        if (!program) return null;

        try {
            // @ts-ignore
            const account = await program.account.market.fetch(marketPDA);
            const prices = calculatePrices(
                account.yesPool.toNumber(),
                account.noPool.toNumber()
            );
            return {
                ...account,
                yesPrice: prices.yesPrice,
                noPrice: prices.noPrice
            } as unknown as MarketAccount;
        } catch (error) {
            console.error("Failed to fetch market:", error);
            return null;
        }
    }, [program]);

    const fetchMultiMarket = useCallback(async (marketPDA: PublicKey): Promise<MultiMarketAccount | null> => {
        if (!program) return null;

        try {
            // @ts-ignore
            const account = await program.account.multiMarket.fetch(marketPDA);
            return account as unknown as MultiMarketAccount;
        } catch {
            // Silently return null - discriminator mismatches are expected when probing account types
            return null;
        }
    }, [program]);

    const fetchAnswer = useCallback(async (answerPDA: PublicKey): Promise<AnswerAccount | null> => {
        if (!program) return null;

        try {
            // @ts-ignore
            const account = await program.account.answer.fetch(answerPDA);
            const prices = calculatePrices(
                account.yesPool.toNumber(),
                account.noPool.toNumber()
            );
            return {
                ...account,
                yesPrice: prices.yesPrice,
                noPrice: prices.noPrice
            } as unknown as AnswerAccount;
        } catch (error) {
            console.error("Failed to fetch answer:", error);
            return null;
        }
    }, [program]);

    const fetchAllAnswers = useCallback(async (marketPDA: PublicKey, answerCount: number): Promise<{ publicKey: PublicKey, account: AnswerAccount }[]> => {
        if (!program) return [];

        const answers: { publicKey: PublicKey, account: AnswerAccount }[] = [];
        for (let i = 0; i < answerCount; i++) {
            const answerPDA = getAnswerPDA(marketPDA, i);
            const answer = await fetchAnswer(answerPDA);
            if (answer) {
                answers.push({
                    publicKey: answerPDA,
                    account: answer
                });
            }
        }
        return answers;
    }, [program, getAnswerPDA, fetchAnswer]);

    const fetchUserPosition = useCallback(async (marketPDA: PublicKey): Promise<UserPositionAccount | null> => {
        if (!program || !wallet.publicKey) return null;
        const pda = getUserPositionPDA(marketPDA, wallet.publicKey);
        try {
            // @ts-ignore
            const acct = await program.account.userPosition.fetch(pda);
            return acct as unknown as UserPositionAccount;
        } catch {
            return null;
        }
    }, [program, wallet.publicKey, getUserPositionPDA]);

    const fetchMultiPosition = useCallback(async (marketPDA: PublicKey): Promise<MultiPositionAccount | null> => {
        if (!program || !wallet.publicKey) return null;
        const pda = getMultiPositionPDA(marketPDA, wallet.publicKey);
        try {
            // @ts-ignore
            const acct = await program.account.multiPosition.fetch(pda);
            return acct as unknown as MultiPositionAccount;
        } catch {
            return null;
        }
    }, [program, wallet.publicKey, getMultiPositionPDA]);

    const fetchOpenOrders = useCallback(async (marketPDA: PublicKey): Promise<LimitOrderAccount[]> => {
        if (!program) return [];
        try {
            // @ts-ignore
            if (!program.account.limitOrder) return [];
            // @ts-ignore
            const orders = await program.account.limitOrder.all([
                {
                    memcmp: {
                        offset: 8 + 32,
                        bytes: marketPDA.toBase58()
                    }
                }
            ]);

            return orders.map((o: any) => ({
                ...o.account,
                publicKey: o.publicKey
            })) as LimitOrderAccount[];
        } catch {
            return [];
        }
    }, [program]);

    const fetchAllMarkets = useCallback(async () => {
        if (!program) return [];

        try {
            // @ts-ignore
            const accounts = await program.account.market.all();
            return accounts.map((acc: any) => {
                const prices = calculatePrices(
                    acc.account.yesPool.toNumber(),
                    acc.account.noPool.toNumber()
                );
                return {
                    publicKey: acc.publicKey,
                    account: {
                        ...acc.account,
                        yesPrice: prices.yesPrice,
                        noPrice: prices.noPrice
                    } as unknown as MarketAccount,
                };
            });
        } catch (error) {
            console.error("Failed to fetch markets:", error);
            return [];
        }
    }, [program]);

    const fetchAllMultiMarkets = useCallback(async () => {
        if (!program) return [];

        try {
            // @ts-ignore
            const accounts = await program.account.multiMarket.all();
            return accounts.map((acc: any) => ({
                publicKey: acc.publicKey,
                account: acc.account as unknown as MultiMarketAccount,
            }));
        } catch (error) {
            console.error("Failed to fetch multi-markets:", error);
            return [];
        }
    }, [program]);

    const fetchAllGlobalAnswers = useCallback(async () => {
        if (!program) return [];

        try {
            // @ts-ignore
            const accounts = await program.account.answer.all();
            return accounts.map((acc: any) => ({
                publicKey: acc.publicKey,
                account: acc.account as unknown as AnswerAccount,
            }));
        } catch (error) {
            console.error("Failed to fetch all answers:", error);
            return [];
        }
    }, [program]);

    // ============== RETURN ==============

    return {
        program,
        provider,
        wallet,
        connected: wallet.connected,
        publicKey: wallet.publicKey,

        // PDAs
        getMarketPDA,
        getMultiMarketPDA,
        getAnswerPDA,
        getOrderbookPDA,
        getUserPositionPDA,
        getMultiPositionPDA,

        // Binary market
        createMarket,
        buyShares,
        sellShares,
        claimWinnings,
        resolveMarket,

        // Multi-choice market
        createMultiMarket,
        addAnswer,
        buyMulti,
        sellMulti,
        resolveAnswer,
        claimMultiWinnings,

        // NegRisk
        convertPositions,
        splitPosition,
        mergePositions,
        rebalanceMarket,
        setMultiMarketConfig,

        // Limit orders
        placeOrder,
        placeMultiOrder,
        cancelOrder,

        // Fetch
        fetchMarket,
        fetchMultiMarket,
        fetchAnswer,
        fetchAllAnswers,
        fetchAllGlobalAnswers,
        fetchUserPosition,
        fetchMultiPosition,
        fetchOpenOrders,
        fetchAllMarkets,
        fetchAllMultiMarkets,
    };
}
