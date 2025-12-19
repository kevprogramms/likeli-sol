use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};

declare_id!("8nuTp2x4c8bF668xLkg51TncSYPGcnyWMQczH8AmVfwJ");

/// Burn address for NO tokens - they must never be redeemable
pub const NO_TOKEN_BURN_SEED: &[u8] = b"no_token_burn";
pub const VAULT_SEED: &[u8] = b"vault";
pub const FEE_VAULT_SEED: &[u8] = b"fee_vault";

#[program]
pub mod likeli_contracts {
    use super::*;

    // ============== BINARY MARKET INSTRUCTIONS ==============

    /// Create a new binary prediction market
    pub fn create_market(
        ctx: Context<CreateMarket>,
        question: String,
        resolution_time: i64,
        initial_liquidity: u64,
        group_id: Option<String>,
        answer_label: Option<String>,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let clock = Clock::get()?;

        require!(question.len() <= 200, LikeliError::QuestionTooLong);
        require!(resolution_time > clock.unix_timestamp, LikeliError::InvalidResolutionTime);
        require!(initial_liquidity >= 100, LikeliError::InsufficientLiquidity);

        market.creator = ctx.accounts.creator.key();
        market.question = question;
        market.resolution_time = resolution_time;
        market.yes_pool = initial_liquidity;
        market.no_pool = initial_liquidity;
        market.total_volume = 0;
        market.resolved = false;
        market.outcome = false;
        market.created_at = clock.unix_timestamp;
        market.bump = ctx.bumps.market;
        
        // Multi-choice support (for legacy binary that belongs to a group)
        market.group_id = group_id;
        market.answer_label = answer_label;

        // Fee infrastructure (default to 0)
        market.fee_bps = 0;
        market.creator_fee_bps = 0;
        market.platform_fee_bps = 0;
        market.liquidity_fee_bps = 0;
        market.collected_fees = 0;

        msg!("Market created: {}", market.question);
        Ok(())
    }

    /// Initialize orderbook for a market
    pub fn create_orderbook(ctx: Context<CreateOrderbook>) -> Result<()> {
        let orderbook = &mut ctx.accounts.orderbook;
        orderbook.market = ctx.accounts.market.key();
        orderbook.yes_buy_orders = Vec::new();
        orderbook.yes_sell_orders = Vec::new();
        orderbook.no_buy_orders = Vec::new();
        orderbook.no_sell_orders = Vec::new();
        
        msg!("Orderbook created for market: {}", orderbook.market);
        Ok(())
    }

    /// Buy shares in a binary market with slippage protection
    pub fn buy_shares(
        ctx: Context<BuyShares>,
        outcome: bool,
        amount: u64,
        min_shares_out: u64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let user_position = &mut ctx.accounts.user_position;
        let orderbook = &ctx.accounts.orderbook;
        let remaining_accounts = ctx.remaining_accounts;
        
        require!(!market.resolved, LikeliError::MarketResolved);
        require!(amount > 0, LikeliError::InvalidAmount);

        // Calculate fees
        let fee = calculate_fee(amount, market.fee_bps);
        let amount_after_fee = amount.checked_sub(fee).unwrap();
        market.collected_fees = market.collected_fees.checked_add(fee).unwrap();

        let total_pool = market.yes_pool.checked_add(market.no_pool).unwrap();
        let cpmm_price = if outcome {
            (market.no_pool as u128 * 10000 / total_pool as u128) as u64
        } else {
            (market.yes_pool as u128 * 10000 / total_pool as u128) as u64
        };

        let match_result = try_match_against_orderbook(
            orderbook, 
            remaining_accounts, 
            None,
            outcome, 
            true, // is_buy
            cpmm_price, 
            amount_after_fee
        )?;

        let mut total_shares = 0;
        
        // Handle matched portion (Direct swaps would go here, simplified for now: matches act as liquidity)
        if match_result.filled_amount > 0 {
            // For now, we simulate matching by giving shares at the matched price
            // In a full implementation, we'd transfer from limit order owners
            let matched_shares = (match_result.filled_amount as u128 * 10000 / cpmm_price.max(1) as u128) as u64;
            total_shares += matched_shares;
        }

        // 2. CPMM for the remainder
        if match_result.remaining_amount > 0 {
            let shares = if outcome {
                calculate_shares_out(market.yes_pool, market.no_pool, match_result.remaining_amount, true)
            } else {
                calculate_shares_out(market.yes_pool, market.no_pool, match_result.remaining_amount, false)
            };
            
            if outcome {
                // Buy YES: add to NO pool to increase price
                market.no_pool = market.no_pool.checked_add(match_result.remaining_amount).unwrap();
            } else {
                // Buy NO: add to YES pool to increase price
                market.yes_pool = market.yes_pool.checked_add(match_result.remaining_amount).unwrap();
            }
            total_shares += shares;
        }

        // Slippage check
        require!(total_shares >= min_shares_out, LikeliError::SlippageExceeded);

        if outcome {
            user_position.yes_shares = user_position.yes_shares.checked_add(total_shares).unwrap();
        } else {
            user_position.no_shares = user_position.no_shares.checked_add(total_shares).unwrap();
        }

        user_position.owner = ctx.accounts.buyer.key();
        user_position.market = market.key();
        market.total_volume = market.total_volume.checked_add(amount).unwrap();

        msg!(
            "Bought {} shares ({} matched) of {} for {} (min: {})",
            total_shares,
            match_result.filled_amount,
            if outcome { "YES" } else { "NO" },
            amount,
            min_shares_out
        );

        Ok(())
    }

    /// Sell shares in a binary market with slippage protection
    pub fn sell_shares(
        ctx: Context<BuyShares>,
        outcome: bool,
        shares_to_sell: u64,
        min_payout: u64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let user_position = &mut ctx.accounts.user_position;
        let orderbook = &ctx.accounts.orderbook;
        
        require!(!market.resolved, LikeliError::MarketResolved);
        require!(shares_to_sell > 0, LikeliError::InvalidAmount);

        // Verify user has enough shares
        if outcome {
            require!(user_position.yes_shares >= shares_to_sell, LikeliError::InsufficientShares);
        } else {
            require!(user_position.no_shares >= shares_to_sell, LikeliError::InsufficientShares);
        }

        // 1. Try to match against orderbook bids
        let total_pool = market.yes_pool.checked_add(market.no_pool).unwrap();
        let cpmm_price = if outcome {
            (market.no_pool as u128 * 10000 / total_pool as u128) as u64
        } else {
            (market.yes_pool as u128 * 10000 / total_pool as u128) as u64
        };

        let match_result = try_match_against_orderbook(
            orderbook, 
            ctx.remaining_accounts, 
            None,
            outcome, 
            false, // is_buy = false (Selling)
            cpmm_price, 
            shares_to_sell
        )?;

        let mut total_payout = 0;

        if match_result.filled_amount > 0 {
            let matched_payout = (match_result.filled_amount as u128 * cpmm_price as u128 / 10000) as u64;
            total_payout += matched_payout;
        }

        if match_result.remaining_amount > 0 {
            // Sell YES for collateral: payout = shares * no_pool / (yes_pool + shares)
            let payout = if outcome {
                (match_result.remaining_amount as u128)
                    .checked_mul(market.no_pool as u128).unwrap()
                    .checked_div((market.yes_pool as u128).checked_add(match_result.remaining_amount as u128).unwrap()).unwrap() as u64
            } else {
                (match_result.remaining_amount as u128)
                    .checked_mul(market.yes_pool as u128).unwrap()
                    .checked_div((market.no_pool as u128).checked_add(match_result.remaining_amount as u128).unwrap()).unwrap() as u64
            };
            
            if outcome {
                // Sell YES: remove from NO pool (collateral)
                market.no_pool = market.no_pool.checked_sub(payout).unwrap();
            } else {
                // Sell NO: remove from YES pool (collateral)
                market.yes_pool = market.yes_pool.checked_sub(payout).unwrap();
            }
            total_payout += payout;
        }

        // Apply fees to total payout
        let fee = calculate_fee(total_payout, market.fee_bps);
        let final_payout = total_payout.checked_sub(fee).unwrap();
        market.collected_fees = market.collected_fees.checked_add(fee).unwrap();

        require!(final_payout >= min_payout, LikeliError::SlippageExceeded);

        if outcome {
            user_position.yes_shares = user_position.yes_shares.checked_sub(shares_to_sell).unwrap();
        } else {
            user_position.no_shares = user_position.no_shares.checked_sub(shares_to_sell).unwrap();
        }

        market.total_volume = market.total_volume.checked_add(final_payout).unwrap();

        msg!(
            "Sold {} shares ({} matched) of {} for {} (min: {})",
            shares_to_sell,
            match_result.filled_amount,
            if outcome { "YES" } else { "NO" },
            final_payout,
            min_payout
        );

        Ok(())
    }

    /// Claim winnings after market resolution (legacy - no token transfer)
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let market = &ctx.accounts.market;
        let user_position = &mut ctx.accounts.user_position;
        
        require!(market.resolved, LikeliError::MarketNotResolved);
        
        let winning_shares = if market.outcome {
            user_position.yes_shares
        } else {
            user_position.no_shares
        };
        
        require!(winning_shares > 0, LikeliError::NoWinningShares);
        
        let payout = winning_shares;
        
        // Zero out position
        user_position.yes_shares = 0;
        user_position.no_shares = 0;
        
        msg!("Claimed {} winnings from market {} (legacy)", payout, market.key());
        Ok(())
    }

    /// Claim winnings with actual token transfer from vault
    pub fn claim_winnings_with_vault(ctx: Context<ClaimWinningsWithVault>) -> Result<()> {
        let market = &ctx.accounts.market;
        let user_position = &mut ctx.accounts.user_position;
        
        require!(market.resolved, LikeliError::MarketNotResolved);
        
        let winning_shares = if market.outcome {
            user_position.yes_shares
        } else {
            user_position.no_shares
        };
        
        require!(winning_shares > 0, LikeliError::NoWinningShares);
        
        // Calculate payout: winning shares = collateral at 1:1
        let payout = winning_shares;
        
        // Zero out position before transfer (reentrancy protection)
        user_position.yes_shares = 0;
        user_position.no_shares = 0;
        
        // Transfer tokens from vault to user
        let market_key = market.key();
        let seeds = &[
            VAULT_SEED,
            market_key.as_ref(),
            &[ctx.bumps.vault_authority],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_ata.to_account_info(),
            to: ctx.accounts.claimer_ata.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer,
            ),
            payout,
        )?;
        
        msg!("Claimed {} tokens from market {}", payout, market.key());
        Ok(())
    }

    /// Resolve a binary market
    pub fn resolve_market(
        ctx: Context<ResolveMarket>,
        outcome: bool,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let clock = Clock::get()?;

        require!(!market.resolved, LikeliError::MarketResolved);
        require!(ctx.accounts.resolver.key() == market.creator, LikeliError::Unauthorized);
        require!(clock.unix_timestamp >= market.resolution_time, LikeliError::TooEarlyToResolve);

        market.resolved = true;
        market.outcome = outcome;

        msg!("Market resolved: {} -> {}", market.question, if outcome { "YES" } else { "NO" });
        Ok(())
    }

    // ============== MULTI-CHOICE MARKET INSTRUCTIONS ==============

    /// Create a new multi-choice market
    pub fn create_multi_market(
        ctx: Context<CreateMultiMarket>,
        question_hash: [u8; 32],
        answer_count: u8,
        is_one_winner: bool,
        initial_liquidity: u64,
        fee_bps: u16,
        resolution_time: i64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let clock = Clock::get()?;

        require!(answer_count >= 2 && answer_count <= 10, LikeliError::InvalidAnswerCount);
        require!(resolution_time > clock.unix_timestamp, LikeliError::InvalidResolutionTime);
        require!(initial_liquidity >= 100, LikeliError::InsufficientLiquidity);
        require!(fee_bps <= 1000, LikeliError::FeesTooHigh);

        market.creator = ctx.accounts.creator.key();
        market.question_hash = question_hash;
        market.answer_count = answer_count;
        market.is_one_winner = is_one_winner;
        market.volume = 0;
        market.fee_bps = fee_bps;
        market.resolution_time = resolution_time;
        market.resolved = false;
        market.created_at = clock.unix_timestamp;
        market.bump = ctx.bumps.market;
        market.answers_resolved = 0;

        msg!("Multi-choice market created: {} answers, one_winner={}", answer_count, is_one_winner);
        Ok(())
    }

    /// Initialize the collateral vault for a multi-choice market
    /// Must be called after create_multi_market and before any trading
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        msg!(
            "Vault initialized for market {}. Vault authority: {}",
            ctx.accounts.market.key(),
            ctx.accounts.vault_authority.key()
        );
        Ok(())
    }

    /// Add an answer to a multi-choice market
    pub fn add_answer(
        ctx: Context<AddAnswer>,
        index: u8,
        label_hash: [u8; 32],
        initial_liquidity: u64,
    ) -> Result<()> {
        let market = &ctx.accounts.market;
        let answer = &mut ctx.accounts.answer;

        require!(index < market.answer_count, LikeliError::InvalidAnswerIndex);
        require!(initial_liquidity >= 100, LikeliError::InsufficientLiquidity);

        answer.market = market.key();
        answer.index = index;
        answer.label_hash = label_hash;
        
        // Correct NegRisk initialization: starting price should be 1 / answer_count
        // Price P = no_pool / (yes_pool + no_pool)
        // Set no_pool = liquidity, yes_pool = (N-1) * liquidity
        answer.no_pool = initial_liquidity;
        answer.yes_pool = initial_liquidity.checked_mul(market.answer_count as u64 - 1).unwrap();
        
        answer.volume = 0;
        answer.resolved = false;
        answer.outcome = None;

        msg!("Answer {} added to market", index);
        Ok(())
    }

    /// Buy shares in a multi-choice answer
    pub fn buy_multi(
        ctx: Context<BuyMulti>,
        outcome: bool,
        amount: u64,
        min_shares_out: u64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let answer = &mut ctx.accounts.answer;
        let position = &mut ctx.accounts.position;
        let orderbook = &ctx.accounts.orderbook;
        let remaining_accounts = ctx.remaining_accounts;

        require!(!market.resolved, LikeliError::MarketResolved);
        require!(amount > 0, LikeliError::InvalidAmount);

        // Security: Max trade size = 25% of pool to prevent manipulation
        let total_pool = answer.yes_pool.checked_add(answer.no_pool).unwrap();
        let max_trade = total_pool / 4;
        require!(amount <= max_trade, LikeliError::TradeTooLarge);

        let fee = calculate_fee(amount, market.fee_bps);
        let amount_after_fee = amount.checked_sub(fee).unwrap();

        msg!("BuyMulti: is_one_winner={}, outcome={}, amount={}, answer={}", market.is_one_winner, outcome, amount, answer.index);

        // 1. Try to match against orderbook
        let total_pool = answer.yes_pool.checked_add(answer.no_pool).unwrap();
        let cpmm_price = if outcome {
            (answer.no_pool as u128 * 10000 / total_pool as u128) as u64
        } else {
            (answer.yes_pool as u128 * 10000 / total_pool as u128) as u64
        };

        let match_result = try_match_against_orderbook(
            orderbook, 
            remaining_accounts, 
            Some(answer.index),
            outcome, 
            true, // is_buy
            cpmm_price, 
            amount_after_fee
        )?;

        let mut total_shares = 0;

        if match_result.filled_amount > 0 {
            let matched_shares = (match_result.filled_amount as u128 * 10000 / cpmm_price.max(1) as u128) as u64;
            total_shares += matched_shares;
        }

        if match_result.remaining_amount > 0 {
            let shares = calculate_shares_out(answer.yes_pool, answer.no_pool, match_result.remaining_amount, outcome);
            
            if outcome {
                // Buy YES: add to NO pool to increase price
                answer.no_pool = answer.no_pool.checked_add(match_result.remaining_amount).unwrap();
            } else {
                // Buy NO: add to YES pool to increase price
                answer.yes_pool = answer.yes_pool.checked_add(match_result.remaining_amount).unwrap();
            }
            total_shares += shares;
        }

        // 3. NegRisk Rebalancing if enabled
        if market.is_one_winner {
            let total = answer.yes_pool.checked_add(answer.no_pool).unwrap();
            let new_price = if outcome {
                (answer.no_pool as u128 * 10000 / total as u128) as u64
            } else {
                (answer.yes_pool as u128 * 10000 / total as u128) as u64
            };
            sync_sibling_pools(answer.key(), new_price, market.key(), market.answer_count - 1, remaining_accounts)?;
        }

        require!(total_shares >= min_shares_out, LikeliError::SlippageExceeded);

        let idx = answer.index as usize;
        if outcome {
            position.yes_shares[idx] = position.yes_shares[idx].checked_add(total_shares).unwrap();
        } else {
            position.no_shares[idx] = position.no_shares[idx].checked_add(total_shares).unwrap();
        }

        position.owner = ctx.accounts.buyer.key();
        position.market = market.key();
        answer.volume = answer.volume.checked_add(amount).unwrap();
        market.volume = market.volume.checked_add(amount).unwrap();

        msg!("Bought {} shares ({} matched) of {} on answer {}. New Pools: Y={}, N={}", 
             total_shares, match_result.filled_amount, if outcome { "YES" } else { "NO" }, answer.index, answer.yes_pool, answer.no_pool);
        Ok(())
    }

    /// Rebalance all pools in a NegRisk market to ensure sum(P) = 1
    pub fn rebalance_market(ctx: Context<BuyMulti>) -> Result<()> {
        let market = &ctx.accounts.market;
        let answer = &ctx.accounts.answer;
        let _orderbook = &ctx.accounts.orderbook;
        let remaining_accounts = ctx.remaining_accounts;

        require!(market.is_one_winner, LikeliError::NotOneWinnerMarket);
        
        let total = answer.yes_pool.checked_add(answer.no_pool).unwrap();
        let current_price = (answer.no_pool as u128 * 10000 / total as u128) as u64;
        
        sync_sibling_pools(answer.key(), current_price, market.key(), market.answer_count - 1, remaining_accounts)?;
        
        msg!("Market {} rebalanced manually using answer {}", market.key(), answer.index);
        Ok(())
    }

    /// Set config for multi-choice market
    pub fn set_multi_market_config(
        ctx: Context<SetMultiMarketConfig>,
        is_one_winner: bool,
        fee_bps: u16,
        resolution_time: i64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(ctx.accounts.creator.key() == market.creator, LikeliError::Unauthorized);
        
        market.is_one_winner = is_one_winner;
        market.fee_bps = fee_bps;
        market.resolution_time = resolution_time;
        
        msg!("Multi-market config updated for {}", market.key());
        Ok(())
    }

    /// Sell shares in a multi-choice answer
    pub fn sell_multi(
        ctx: Context<BuyMulti>,
        outcome: bool,
        shares_to_sell: u64,
        min_payout: u64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let answer = &mut ctx.accounts.answer;
        let position = &mut ctx.accounts.position;
        let orderbook = &ctx.accounts.orderbook;
        let remaining_accounts = ctx.remaining_accounts;

        require!(!market.resolved, LikeliError::MarketResolved);
        require!(shares_to_sell > 0, LikeliError::InvalidAmount);

        let idx = answer.index as usize;
        if outcome {
            require!(position.yes_shares[idx] >= shares_to_sell, LikeliError::InsufficientShares);
        } else {
            require!(position.no_shares[idx] >= shares_to_sell, LikeliError::InsufficientShares);
        }

        // 1. Try to match against orderbook bids
        let total_pool = answer.yes_pool.checked_add(answer.no_pool).unwrap();
        let cpmm_price = if outcome {
            (answer.no_pool as u128 * 10000 / total_pool as u128) as u64
        } else {
            (answer.yes_pool as u128 * 10000 / total_pool as u128) as u64
        };

        let match_result = try_match_against_orderbook(
            orderbook, 
            ctx.remaining_accounts, 
            Some(answer.index),
            outcome, 
            false, // is_buy = false (Selling)
            cpmm_price, 
            shares_to_sell
        )?;

        let mut total_payout = 0;

        if match_result.filled_amount > 0 {
            let matched_payout = (match_result.filled_amount as u128 * cpmm_price as u128 / 10000) as u64;
            total_payout += matched_payout;
        }

        if match_result.remaining_amount > 0 {
            // Sell YES for collateral: use discrete payout formula
            // Payout = shares * no_pool / (yes_pool + shares)
            let payout = if outcome {
                (match_result.remaining_amount as u128)
                    .checked_mul(answer.no_pool as u128).unwrap()
                    .checked_div((answer.yes_pool as u128).checked_add(match_result.remaining_amount as u128).unwrap()).unwrap() as u64
            } else {
                (match_result.remaining_amount as u128)
                    .checked_mul(answer.yes_pool as u128).unwrap()
                    .checked_div((answer.no_pool as u128).checked_add(match_result.remaining_amount as u128).unwrap()).unwrap() as u64
            };
            
            if outcome {
                // Sell YES: remove from NO pool (collateral)
                answer.no_pool = answer.no_pool.checked_sub(payout).unwrap();
            } else {
                // Sell NO: remove from YES pool (collateral)
                answer.yes_pool = answer.yes_pool.checked_sub(payout).unwrap();
            }
            total_payout += payout;
        }

        // 3. NegRisk Rebalancing if enabled
        if market.is_one_winner {
            let total = answer.yes_pool.checked_add(answer.no_pool).unwrap();
            let new_price = if outcome {
                (answer.no_pool as u128 * 10000 / total as u128) as u64
            } else {
                (answer.yes_pool as u128 * 10000 / total as u128) as u64
            };
            sync_sibling_pools(answer.key(), new_price, market.key(), market.answer_count - 1, remaining_accounts)?;
        }

        let fee = calculate_fee(total_payout, market.fee_bps);
        let final_payout = total_payout.checked_sub(fee).unwrap();
        // market.collected_fees = market.collected_fees.checked_add(fee).unwrap(); // MultiMarket doesn't have collected_fees yet in this version?

        require!(final_payout >= min_payout, LikeliError::SlippageExceeded);

        if outcome {
            position.yes_shares[idx] = position.yes_shares[idx].checked_sub(shares_to_sell).unwrap();
        } else {
            position.no_shares[idx] = position.no_shares[idx].checked_sub(shares_to_sell).unwrap();
        }

        answer.volume = answer.volume.checked_add(final_payout).unwrap();
        market.volume = market.volume.checked_add(final_payout).unwrap();

        msg!("Sold {} shares ({} matched) of {} on answer {}", 
             shares_to_sell, match_result.filled_amount, if outcome { "YES" } else { "NO" }, answer.index);
        Ok(())
    }

    // ============== NEGATIVE RISK (ONE WINNER ONLY) ==============

    /// Convert NO positions to YES + collateral (Polymarket-style NegRisk)
    /// Only works for is_one_winner = true markets
    /// 
    /// Formula: If you hold m NO tokens across different answers, you can convert to:
    /// - (m-1) × amount collateral returned
    /// - amount YES tokens for each complementary answer
    /// 
    /// The NO tokens are burned (cannot be redeemed)
    pub fn convert_positions(
        ctx: Context<ConvertPositionsWithVault>,
        index_set: u16,
        amount: u64,
    ) -> Result<()> {
        let market = &ctx.accounts.market;
        let market_key = market.key();
        let position = &mut ctx.accounts.position;

        require!(market.is_one_winner, LikeliError::NotOneWinnerMarket);
        require!(!market.resolved, LikeliError::MarketResolved);
        require!(index_set > 0, LikeliError::InvalidIndexSet);
        require!((index_set >> market.answer_count) == 0, LikeliError::InvalidIndexSet);

        if amount == 0 {
            return Ok(());
        }

        let question_count = market.answer_count as u16;
        let no_count = index_set.count_ones() as u64;
        let yes_count = question_count as u64 - no_count;

        require!(no_count >= 1, LikeliError::NoConvertiblePositions);

        // Verify user has the NO shares for each position in index_set
        for i in 0..question_count {
            if (index_set & (1 << i)) > 0 {
                require!(
                    position.no_shares[i as usize] >= amount,
                    LikeliError::InsufficientShares
                );
            }
        }

        // Calculate fee
        let fee = calculate_fee(amount, market.fee_bps);
        let amount_after_fee = amount.checked_sub(fee).unwrap();

        // BURN NO shares (these are gone forever, like Polymarket's burn address)
        for i in 0..question_count {
            if (index_set & (1 << i)) > 0 {
                position.no_shares[i as usize] = position.no_shares[i as usize]
                    .checked_sub(amount).unwrap();
            }
        }

        // MINT YES shares for complementary positions
        for i in 0..question_count {
            if (index_set & (1 << i)) == 0 {
                position.yes_shares[i as usize] = position.yes_shares[i as usize]
                    .checked_add(amount_after_fee).unwrap();
            }
        }

        // Collateral out: (no_count - 1) × amount_after_fee
        let collateral_out = (no_count - 1).checked_mul(amount_after_fee).unwrap();

        // Transfer fees to fee vault (if any)
        if fee > 0 {
            let fee_multiplier = no_count.checked_sub(1).unwrap_or(0);
            let total_fee = fee.checked_mul(fee_multiplier).unwrap_or(0);
            if total_fee > 0 {
                let cpi_accounts = Transfer {
                    from: ctx.accounts.vault_ata.to_account_info(),
                    to: ctx.accounts.fee_vault_ata.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                };
                let seeds = &[
                    VAULT_SEED,
                    market_key.as_ref(),
                    &[ctx.bumps.vault_authority],
                ];
                let signer = &[&seeds[..]];
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        cpi_accounts,
                        signer,
                    ),
                    total_fee,
                )?;
            }
        }

        // Transfer collateral_out from vault to user
        if collateral_out > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.vault_ata.to_account_info(),
                to: ctx.accounts.user_ata.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            };
            let seeds = &[
                VAULT_SEED,
                market_key.as_ref(),
                &[ctx.bumps.vault_authority],
            ];
            let signer = &[&seeds[..]];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signer,
                ),
                collateral_out,
            )?;
        }

        msg!(
            "Converted {} NO positions. Collateral out: {}, YES shares to {} answers, Fee: {}",
            no_count,
            collateral_out,
            yes_count,
            fee
        );

        Ok(())
    }

    /// Split collateral into YES + NO tokens for an answer
    /// User deposits collateral and receives equal YES + NO shares
    pub fn split_position(
        ctx: Context<SplitPositionWithVault>,
        amount: u64,
    ) -> Result<()> {
        let answer = &ctx.accounts.answer;
        let position = &mut ctx.accounts.position;

        require!(amount > 0, LikeliError::InvalidAmount);

        // Transfer collateral FROM user TO vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_ata.to_account_info(),
            to: ctx.accounts.vault_ata.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
            ),
            amount,
        )?;

        // Give user YES + NO shares
        let idx = answer.index as usize;
        position.yes_shares[idx] = position.yes_shares[idx].checked_add(amount).unwrap();
        position.no_shares[idx] = position.no_shares[idx].checked_add(amount).unwrap();

        msg!("Split {} collateral into YES+NO for answer {}", amount, answer.index);
        Ok(())
    }

    /// Merge YES + NO tokens back to collateral
    /// User burns equal YES + NO shares and receives collateral
    pub fn merge_positions(
        ctx: Context<SplitPositionWithVault>,
        amount: u64,
    ) -> Result<()> {
        let market = &ctx.accounts.market;
        let market_key = market.key();
        let answer = &ctx.accounts.answer;
        let position = &mut ctx.accounts.position;

        require!(amount > 0, LikeliError::InvalidAmount);

        let idx = answer.index as usize;
        require!(position.yes_shares[idx] >= amount, LikeliError::InsufficientShares);
        require!(position.no_shares[idx] >= amount, LikeliError::InsufficientShares);

        // Burn YES + NO shares
        position.yes_shares[idx] = position.yes_shares[idx].checked_sub(amount).unwrap();
        position.no_shares[idx] = position.no_shares[idx].checked_sub(amount).unwrap();

        // Transfer collateral FROM vault TO user
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_ata.to_account_info(),
            to: ctx.accounts.user_ata.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let seeds = &[
            VAULT_SEED,
            market_key.as_ref(),
            &[ctx.bumps.vault_authority],
        ];
        let signer = &[&seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer,
            ),
            amount,
        )?;

        msg!("Merged {} YES+NO into collateral for answer {}", amount, answer.index);
        Ok(())
    }

    /// Resolve an answer in a multi-choice market
    pub fn resolve_answer(
        ctx: Context<ResolveAnswer>,
        outcome: bool,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let answer = &mut ctx.accounts.answer;
        let clock = Clock::get()?;

        require!(!answer.resolved, LikeliError::AnswerAlreadyResolved);
        require!(ctx.accounts.resolver.key() == market.creator, LikeliError::Unauthorized);
        require!(clock.unix_timestamp >= market.resolution_time, LikeliError::TooEarlyToResolve);

        // For one-winner markets: if one answer is YES, no other can be YES
        if market.is_one_winner && outcome {
            require!(market.answers_resolved == 0 || !has_winner(market), LikeliError::WinnerAlreadyDeclared);
        }

        answer.resolved = true;
        answer.outcome = Some(outcome);
        market.answers_resolved = market.answers_resolved.checked_add(1).unwrap();

        // Check if all answers resolved
        if market.answers_resolved == market.answer_count {
            market.resolved = true;
        }

        msg!("Answer {} resolved: {}", answer.index, if outcome { "YES" } else { "NO" });
        Ok(())
    }

    /// Claim winnings from multi-choice market (legacy - no token transfer)
    pub fn claim_multi_winnings(ctx: Context<ClaimMultiWinnings>) -> Result<()> {
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;

        require!(market.resolved, LikeliError::MarketNotResolved);

        let mut total_payout: u64 = 0;

        // Zero out position
        for i in 0..10 {
            total_payout = total_payout.checked_add(position.yes_shares[i]).unwrap_or(total_payout);
            position.yes_shares[i] = 0;
            position.no_shares[i] = 0;
        }

        msg!("Claimed {} winnings from multi-choice market (legacy)", total_payout);
        Ok(())
    }

    /// Claim winnings from multi-choice market with actual token transfer
    pub fn claim_multi_winnings_with_vault(ctx: Context<ClaimMultiWinningsWithVault>) -> Result<()> {
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;

        require!(market.resolved, LikeliError::MarketNotResolved);

        // Calculate total winnings across all answers
        // For one-winner: only winning answer's YES shares pay out
        // For multi-winner: each answer that resolved YES pays out
        let mut total_payout: u64 = 0;

        // Sum up all YES shares as payout (1:1 with collateral)
        // In production, check which answers resolved YES via remaining_accounts
        for i in 0..10 {
            total_payout = total_payout.checked_add(position.yes_shares[i]).unwrap_or(total_payout);
            position.yes_shares[i] = 0;
            position.no_shares[i] = 0;
        }

        require!(total_payout > 0, LikeliError::NoWinningShares);

        // Transfer tokens from vault to user
        let market_key = market.key();
        let seeds = &[
            VAULT_SEED,
            market_key.as_ref(),
            &[ctx.bumps.vault_authority],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_ata.to_account_info(),
            to: ctx.accounts.claimer_ata.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer,
            ),
            total_payout,
        )?;

        msg!("Claimed {} tokens from multi-choice market {}", total_payout, market.key());
        Ok(())
    }

    // ============== LIMIT ORDERS ==============

    /// Place a limit order for a binary market
    pub fn place_order(
        ctx: Context<PlaceOrder>,
        answer_index: Option<u8>,
        price: u64,
        qty: u64,
        is_yes: bool,
        is_bid: bool,
        expires_in: Option<i64>,
    ) -> Result<()> {
        let order = &mut ctx.accounts.order;
        let market = &ctx.accounts.market;
        let orderbook = &mut ctx.accounts.orderbook;
        let clock = Clock::get()?;

        require!(!market.resolved, LikeliError::MarketResolved);
        require!(qty > 0, LikeliError::InvalidAmount);
        require!(price > 0 && price < 10000, LikeliError::InvalidPrice);

        // Try to match against book first
        let match_result = find_matching_orders(
            orderbook, 
            ctx.remaining_accounts,
            answer_index,
            is_yes,
            is_bid,
            price,
            qty
        )?;

        order.owner = ctx.accounts.owner.key();
        order.market = market.key();
        order.answer_index = answer_index;
        order.price = price;
        order.qty = qty;
        order.filled_qty = match_result.filled_amount;
        order.is_yes = is_yes;
        order.is_bid = is_bid;
        order.created_at = clock.unix_timestamp;
        order.expires_at = expires_in.map(|ei| clock.unix_timestamp + ei);

        // Only add to book if not fully filled
        if order.filled_qty < order.qty {
            let order_key = order.key();
            let bucket = match (is_yes, is_bid) {
                (true, true) => &mut orderbook.yes_buy_orders,
                (true, false) => &mut orderbook.yes_sell_orders,
                (false, true) => &mut orderbook.no_buy_orders,
                (false, false) => &mut orderbook.no_sell_orders,
            };

            require!(bucket.len() < 100, LikeliError::OrderbookFull);
            bucket.push(order_key);
        }

        msg!("Order placed (matched {}): {}", match_result.filled_amount, order.key());
        Ok(())
    }

    /// Place a limit order for a multi-choice market
    pub fn place_multi_order(
        ctx: Context<PlaceMultiOrder>,
        answer_index: u8,
        price: u64,
        qty: u64,
        is_yes: bool,
        is_bid: bool,
        expires_in: Option<i64>,
    ) -> Result<()> {
        let order = &mut ctx.accounts.order;
        let market = &ctx.accounts.market;
        let orderbook = &mut ctx.accounts.orderbook;
        let clock = Clock::get()?;

        require!(!market.resolved, LikeliError::MarketResolved);
        require!(qty > 0, LikeliError::InvalidAmount);
        require!(price > 0 && price < 10000, LikeliError::InvalidPrice);
        
        // Verify answer index is within bounds
        require!(answer_index < market.answer_count, LikeliError::InvalidAnswerIndex);

        // Try to match against book first
        let match_result = find_matching_orders(
            orderbook, 
            ctx.remaining_accounts,
            Some(answer_index),
            is_yes,
            is_bid,
            price,
            qty
        )?;

        order.owner = ctx.accounts.owner.key();
        order.market = market.key();
        order.answer_index = Some(answer_index);
        order.price = price;
        order.qty = qty;
        order.filled_qty = match_result.filled_amount;
        order.is_yes = is_yes;
        order.is_bid = is_bid;
        order.created_at = clock.unix_timestamp;
        order.expires_at = expires_in.map(|ei| clock.unix_timestamp + ei);

        // Only add to book if not fully filled
        if order.filled_qty < order.qty {
            let order_key = order.key();
            let bucket = match (is_yes, is_bid) {
                (true, true) => &mut orderbook.yes_buy_orders,
                (true, false) => &mut orderbook.yes_sell_orders,
                (false, true) => &mut orderbook.no_buy_orders,
                (false, false) => &mut orderbook.no_sell_orders,
            };

            require!(bucket.len() < 100, LikeliError::OrderbookFull);
            bucket.push(order_key);
        }

        msg!("Multi-choice order placed (matched {}): {}", match_result.filled_amount, order.key());
        Ok(())
    }
    
    /// Cancel an order
    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        let orderbook = &mut ctx.accounts.orderbook;
        let order = &ctx.accounts.order;
        let order_pubkey = order.key();
        
        let removed = remove_order_from_book(orderbook, order_pubkey, order.is_yes, order.is_bid)?;
        require!(removed, LikeliError::OrderNotFound);
        
        msg!("Order cancelled: {}", order_pubkey);
        Ok(())
    }

    // ============== UTILITY INSTRUCTIONS ==============

    /// Set fees for a market
    pub fn set_market_fees(
        ctx: Context<SetMarketFees>,
        fee_bps: u16,
        creator_fee_bps: u16,
        platform_fee_bps: u16,
        liquidity_fee_bps: u16,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        
        require!(ctx.accounts.creator.key() == market.creator, LikeliError::Unauthorized);
        
        let total_fees = fee_bps as u32 + creator_fee_bps as u32 + platform_fee_bps as u32 + liquidity_fee_bps as u32;
        require!(total_fees <= 1000, LikeliError::FeesTooHigh);
        
        market.fee_bps = fee_bps;
        market.creator_fee_bps = creator_fee_bps;
        market.platform_fee_bps = platform_fee_bps;
        market.liquidity_fee_bps = liquidity_fee_bps;
        
        msg!("Fees updated: {}bps total", market.fee_bps);
        Ok(())
    }

    /// Get market price info
    pub fn get_market_price(ctx: Context<GetMarketPrice>) -> Result<()> {
        let market = &ctx.accounts.market;
        
        let total_pool = market.yes_pool.checked_add(market.no_pool).unwrap();
        let yes_prob = (market.no_pool as u128)
            .checked_mul(10000).unwrap()
            .checked_div(total_pool as u128).unwrap() as u64;

        msg!(
            "Market: {} | YES: {}% | NO: {}% | Volume: {}",
            market.question,
            yes_prob / 100,
            100 - (yes_prob / 100),
            market.total_volume
        );

        Ok(())
    }
}

// ============== HELPER FUNCTIONS ==============

fn calculate_fee(amount: u64, fee_bps: u16) -> u64 {
    if fee_bps == 0 {
        return 0;
    }
    (amount as u128 * fee_bps as u128 / 10000) as u64
}

fn calculate_shares_out(yes_pool: u64, no_pool: u64, amount: u64, is_yes: bool) -> u64 {
    let y = yes_pool as u128;
    let n = no_pool as u128;
    let a = amount as u128;

    if is_yes {
        // Buy YES with amount A:
        // New N' = N + A. Shares obtained: A * (1 + Y / (N + A))
        (a + (a * y / (n + a).max(1))) as u64
    } else {
        // Buy NO with amount A:
        // New Y' = Y + A. Shares obtained: A * (1 + N / (Y + A))
        (a + (a * n / (y + a).max(1))) as u64
    }
}

fn sync_sibling_pools<'info>(
    current_answer_key: Pubkey,
    new_price: u64, // bps
    market_key: Pubkey,
    expected_sibling_count: u8,
    remaining_accounts: &[AccountInfo<'info>],
) -> Result<()> {
    // Security: Validate that enough sibling accounts are passed
    require!(
        remaining_accounts.len() >= expected_sibling_count as usize,
        LikeliError::MissingSiblings
    );

    msg!("Syncing siblings for answer {}. New price: {}bps. Siblings passed: {}", current_answer_key, new_price, remaining_accounts.len());
    let mut other_answers = Vec::new();
    let mut others_old_prob_sum: u128 = 0;

    for info in remaining_accounts {
        if info.key() == current_answer_key {
            continue;
        }
        if info.owner != &crate::ID {
            continue;
        }

        let mut data: &[u8] = &info.try_borrow_data()?;
        if let Ok(sibling) = Answer::try_deserialize(&mut data) {
            if sibling.market == market_key {
                let total = sibling.yes_pool.checked_add(sibling.no_pool).unwrap();
                if total > 0 {
                    let p = (sibling.no_pool as u128 * 10000 / total as u128);
                    others_old_prob_sum += p;
                    other_answers.push((info, sibling, total, p));
                }
            }
        }
    }

    if other_answers.is_empty() {
        return Ok(());
    }

    let target_others_prob_sum = 10000u32.saturating_sub(new_price as u32) as u128;

    // Track actual sum for rounding error compensation
    let mut actual_prob_sum: u128 = 0;
    let mut last_sibling_info: Option<AccountInfo> = None;
    let mut last_sibling: Option<Answer> = None;
    let mut last_total: u64 = 0;

    for (info, mut sibling, total, old_p) in other_answers {
        let new_p = if others_old_prob_sum > 0 {
            old_p.checked_mul(target_others_prob_sum).unwrap()
                .checked_div(others_old_prob_sum).unwrap()
        } else {
            target_others_prob_sum.checked_div(1).unwrap()
        };

        sibling.no_pool = (total as u128 * new_p / 10000) as u64;
        sibling.yes_pool = total.checked_sub(sibling.no_pool).unwrap();
        
        // Track probability for rounding compensation
        let sibling_total = sibling.yes_pool.checked_add(sibling.no_pool).unwrap() as u128;
        if sibling_total > 0 {
            actual_prob_sum += sibling.no_pool as u128 * 10000 / sibling_total;
        }
        
        // Store last sibling for rounding adjustment
        last_sibling_info = Some(info.clone());
        last_sibling = Some(sibling.clone());
        last_total = total;
        
        let mut data = info.try_borrow_mut_data()?;
        sibling.try_serialize(&mut *data)?;
    }

    // Fix 1: Rounding error compensation - adjust last sibling to ensure sum = 100%
    if let (Some(info), Some(mut sibling)) = (last_sibling_info, last_sibling) {
        let rounding_error = target_others_prob_sum as i128 - actual_prob_sum as i128;
        if rounding_error.abs() > 0 && rounding_error.abs() < 100 {
            // Adjust no_pool by the rounding error
            let adjustment = (last_total as i128 * rounding_error / 10000) as i64;
            sibling.no_pool = (sibling.no_pool as i64 + adjustment).max(0) as u64;
            sibling.yes_pool = last_total.saturating_sub(sibling.no_pool);
            
            let mut data = info.try_borrow_mut_data()?;
            sibling.try_serialize(&mut *data)?;
        }
    }

    Ok(())
}

fn remove_order_from_book(
    orderbook: &mut Orderbook,
    order_pubkey: Pubkey,
    is_yes: bool,
    is_bid: bool,
) -> Result<bool> {
    let order_list = match (is_yes, is_bid) {
        (true, true) => &mut orderbook.yes_buy_orders,
        (true, false) => &mut orderbook.yes_sell_orders,
        (false, true) => &mut orderbook.no_buy_orders,
        (false, false) => &mut orderbook.no_sell_orders,
    };
    
    if let Some(pos) = order_list.iter().position(|&k| k == order_pubkey) {
        order_list.remove(pos);
        Ok(true)
    } else {
        Ok(false)
    }
}

fn has_winner(_market: &MultiMarket) -> bool {
    // Simplified - in production check if any answer resolved YES
    false
}

/// Result of order matching attempt
#[derive(Clone, Copy, Debug)]
pub struct MatchResult {
    pub filled_amount: u64,
    pub remaining_amount: u64,
    pub matched_price: u64,
}

/// Find matching orders in the orderbook
/// Returns the amount that can be filled at the limit price
/// 
/// Matching logic:
/// - Buy orders match against sell orders at price <= buy_price
/// - Sell orders match against buy orders at price >= sell_price
/// - Orders are matched in price-time priority
fn find_matching_orders<'info>(
    orderbook: &Orderbook,
    opposing_accounts: &[AccountInfo<'info>],
    answer_index: Option<u8>,
    is_yes: bool,
    is_buy: bool,
    limit_price: u64,
    amount: u64,
) -> Result<MatchResult> {
    let mut filled_amount = 0;
    let mut remaining_amount = amount;
    
    for account_info in opposing_accounts {
        if remaining_amount == 0 { break; }
        
        if account_info.owner != &crate::ID { continue; }
        let mut order_data = account_info.try_borrow_mut_data()?;
        if order_data.len() < 8 { continue; }
        
        let mut data_ptr: &[u8] = &order_data;
        let mut order = if let Ok(o) = LimitOrder::try_deserialize(&mut data_ptr) {
            o
        } else {
            continue;
        };
        
        // Match validation: same market, same answer (if multi), opposite side
        if order.market != orderbook.market || 
           order.answer_index != answer_index ||
           order.is_yes == is_yes || 
           order.is_bid == is_buy {
            continue; 
        }
        if order.qty <= order.filled_qty { continue; }
        
        let price_compatible = if is_buy {
            order.price <= limit_price
        } else {
            order.price >= limit_price
        };
        
        if price_compatible {
            let available = order.qty - order.filled_qty;
            let to_fill = remaining_amount.min(available);
            
            order.filled_qty += to_fill;
            filled_amount += to_fill;
            remaining_amount -= to_fill;
            
            let mut writer = &mut order_data[8..];
            order.serialize(&mut writer)?;
        }
    }
    
    Ok(MatchResult {
        filled_amount,
        remaining_amount,
        matched_price: limit_price,
    })
}

fn try_match_against_orderbook<'info>(
    orderbook: &Orderbook,
    remaining_accounts: &[AccountInfo<'info>],
    answer_index: Option<u8>,
    is_yes: bool,
    is_buy: bool,
    cpmm_price: u64,
    amount: u64,
) -> Result<MatchResult> {
    find_matching_orders(orderbook, remaining_accounts, answer_index, is_yes, is_buy, cpmm_price, amount)
}

// ============== ACCOUNT CONTEXTS ==============

#[derive(Accounts)]
#[instruction(question: String, resolution_time: i64, initial_liquidity: u64, group_id: Option<String>, answer_label: Option<String>)]
pub struct CreateMarket<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + Market::INIT_SPACE,
        seeds = [
            b"market".as_ref(), 
            creator.key().as_ref(), 
            &question.as_bytes()[..15.min(question.len())],
            match &answer_label {
                Some(a) => &a.as_bytes()[..15.min(a.len())],
                None => &b"binary"[..]
            }
        ],
        bump
    )]
    pub market: Account<'info, Market>,
    
    #[account(mut)]
    pub creator: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateOrderbook<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + Orderbook::INIT_SPACE,
        seeds = [b"orderbook", market.key().as_ref()],
        bump
    )]
    pub orderbook: Account<'info, Orderbook>,
    
    #[account(mut)]
    pub market: Account<'info, Market>,
    
    #[account(mut)]
    pub creator: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyShares<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    
    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + Orderbook::INIT_SPACE,
        seeds = [b"orderbook", market.key().as_ref()],
        bump
    )]
    pub orderbook: Account<'info, Orderbook>,

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"position", market.key().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(mut)]
    pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(constraint = market.resolved @ LikeliError::MarketNotResolved)]
    pub market: Account<'info, Market>,
    
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), claimer.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,

    pub claimer: Signer<'info>,
}

/// Claim winnings with actual token transfer
#[derive(Accounts)]
pub struct ClaimWinningsWithVault<'info> {
    #[account(constraint = market.resolved @ LikeliError::MarketNotResolved)]
    pub market: Account<'info, Market>,
    
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), claimer.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,

    /// Vault authority PDA
    /// CHECK: This is a PDA controlled by the program
    #[account(
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    
    /// Vault's token account holding collateral
    #[account(
        mut,
        constraint = vault_ata.owner == vault_authority.key()
    )]
    pub vault_ata: Account<'info, TokenAccount>,
    
    /// Claimer's token account to receive payout
    #[account(
        mut,
        constraint = claimer_ata.owner == claimer.key()
    )]
    pub claimer_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub claimer: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(question_hash: [u8; 32], answer_count: u8)]
pub struct CreateMultiMarket<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + MultiMarket::INIT_SPACE,
        seeds = [b"multi_market", creator.key().as_ref(), question_hash.as_ref()],
        bump
    )]
    pub market: Account<'info, MultiMarket>,
    
    #[account(mut)]
    pub creator: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetMultiMarketConfig<'info> {
    #[account(mut)]
    pub market: Account<'info, MultiMarket>,
    
    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    pub market: Account<'info, MultiMarket>,
    
    /// Vault authority PDA
    /// CHECK: This is a PDA controlled by the program
    #[account(
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    
    /// Vault's token account for holding collateral
    #[account(
        init,
        payer = payer,
        token::mint = collateral_mint,
        token::authority = vault_authority,
        seeds = [b"vault_ata", market.key().as_ref()],
        bump
    )]
    pub vault_ata: Account<'info, TokenAccount>,
    
    /// Collateral token mint (e.g., USDC)
    pub collateral_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct AddAnswer<'info> {
    #[account(
        constraint = creator.key() == market.creator @ LikeliError::Unauthorized
    )]
    pub market: Account<'info, MultiMarket>,
    
    #[account(
        init,
        payer = creator,
        space = 8 + Answer::INIT_SPACE,
        seeds = [b"answer", market.key().as_ref(), &[index]],
        bump
    )]
    pub answer: Account<'info, Answer>,
    
    #[account(mut)]
    pub creator: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyMulti<'info> {
    #[account(mut)]
    pub market: Account<'info, MultiMarket>,
    
    #[account(mut, constraint = answer.market == market.key())]
    pub answer: Account<'info, Answer>,

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + Orderbook::INIT_SPACE,
        seeds = [b"orderbook", market.key().as_ref()],
        bump
    )]
    pub orderbook: Account<'info, Orderbook>,
    
    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + MultiPosition::INIT_SPACE,
        seeds = [b"multi_position", market.key().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub position: Account<'info, MultiPosition>,

    #[account(mut)]
    pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ConvertPositionsWithVault<'info> {
    pub market: Account<'info, MultiMarket>,
    
    #[account(
        mut,
        seeds = [b"multi_position", market.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub position: Account<'info, MultiPosition>,

    /// Vault authority PDA (signs for vault transfers)
    /// CHECK: Vault authority is a PDA
    #[account(
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    
    /// Vault's token account holding collateral
    #[account(
        mut,
        constraint = vault_ata.owner == vault_authority.key()
    )]
    pub vault_ata: Account<'info, TokenAccount>,
    
    /// User's token account to receive collateral
    #[account(
        mut,
        constraint = user_ata.owner == owner.key()
    )]
    pub user_ata: Account<'info, TokenAccount>,
    
    /// Fee vault's token account
    #[account(
        mut,
        seeds = [FEE_VAULT_SEED],
        bump
    )]
    pub fee_vault_ata: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SplitPositionWithVault<'info> {
    pub market: Account<'info, MultiMarket>,
    
    pub answer: Account<'info, Answer>,
    
    #[account(
        mut,
        seeds = [b"multi_position", market.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub position: Account<'info, MultiPosition>,

    /// Vault authority PDA (signs for vault transfers)
    /// CHECK: Vault authority is a PDA
    #[account(
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    
    /// Vault's token account holding collateral
    #[account(
        mut,
        constraint = vault_ata.owner == vault_authority.key()
    )]
    pub vault_ata: Account<'info, TokenAccount>,
    
    /// User's token account
    #[account(
        mut,
        constraint = user_ata.owner == owner.key()
    )]
    pub user_ata: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

// Keep old contexts for backwards compatibility
#[derive(Accounts)]
pub struct ConvertPositions<'info> {
    pub market: Account<'info, MultiMarket>,
    
    #[account(
        mut,
        seeds = [b"multi_position", market.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub position: Account<'info, MultiPosition>,

    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct SplitPosition<'info> {
    pub market: Account<'info, MultiMarket>,
    
    pub answer: Account<'info, Answer>,
    
    #[account(
        mut,
        seeds = [b"multi_position", market.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub position: Account<'info, MultiPosition>,

    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveAnswer<'info> {
    #[account(mut)]
    pub market: Account<'info, MultiMarket>,
    
    #[account(mut, constraint = answer.market == market.key())]
    pub answer: Account<'info, Answer>,
    
    pub resolver: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimMultiWinnings<'info> {
    #[account(constraint = market.resolved @ LikeliError::MarketNotResolved)]
    pub market: Account<'info, MultiMarket>,
    
    #[account(
        mut,
        seeds = [b"multi_position", market.key().as_ref(), claimer.key().as_ref()],
        bump
    )]
    pub position: Account<'info, MultiPosition>,

    pub claimer: Signer<'info>,
}

/// Claim multi-choice winnings with actual token transfer
#[derive(Accounts)]
pub struct ClaimMultiWinningsWithVault<'info> {
    #[account(constraint = market.resolved @ LikeliError::MarketNotResolved)]
    pub market: Account<'info, MultiMarket>,
    
    #[account(
        mut,
        seeds = [b"multi_position", market.key().as_ref(), claimer.key().as_ref()],
        bump
    )]
    pub position: Account<'info, MultiPosition>,

    /// Vault authority PDA
    /// CHECK: This is a PDA controlled by the program
    #[account(
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    
    /// Vault's token account holding collateral
    #[account(
        mut,
        constraint = vault_ata.owner == vault_authority.key()
    )]
    pub vault_ata: Account<'info, TokenAccount>,
    
    /// Claimer's token account to receive payout
    #[account(
        mut,
        constraint = claimer_ata.owner == claimer.key()
    )]
    pub claimer_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub claimer: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct PlaceOrder<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Orderbook::INIT_SPACE,
        seeds = [b"orderbook", market.key().as_ref()],
        bump
    )]
    pub orderbook: Account<'info, Orderbook>,
    
    #[account(
        init,
        payer = owner,
        space = 8 + LimitOrder::INIT_SPACE,
    )]
    pub order: Account<'info, LimitOrder>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceMultiOrder<'info> {
    #[account(mut)]
    pub market: Account<'info, MultiMarket>,
    
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Orderbook::INIT_SPACE,
        seeds = [b"orderbook", market.key().as_ref()],
        bump
    )]
    pub orderbook: Account<'info, Orderbook>,
    
    #[account(
        init,
        payer = owner,
        space = 8 + LimitOrder::INIT_SPACE,
    )]
    pub order: Account<'info, LimitOrder>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    #[account(
        mut,
        close = owner,
        constraint = order.owner == owner.key() @ LikeliError::Unauthorized
    )]
    pub order: Account<'info, LimitOrder>,
    
    #[account(
        mut,
        seeds = [b"orderbook", order.market.as_ref()],
        bump
    )]
    pub orderbook: Account<'info, Orderbook>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    
    pub resolver: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetMarketPrice<'info> {
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct SetMarketFees<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    
    pub creator: Signer<'info>,
}

// ============== STATE ACCOUNTS ==============

/// Binary market (YES/NO)
#[account]
#[derive(InitSpace)]
pub struct Market {
    pub creator: Pubkey,
    #[max_len(200)]
    pub question: String,
    pub resolution_time: i64,
    pub yes_pool: u64,
    pub no_pool: u64,
    pub total_volume: u64,
    pub resolved: bool,
    pub outcome: bool,
    pub created_at: i64,
    pub bump: u8,
    // Multi-choice group support
    #[max_len(50)]
    pub group_id: Option<String>,
    #[max_len(100)]
    pub answer_label: Option<String>,
    // Fee infrastructure
    pub fee_bps: u16,
    pub creator_fee_bps: u16,
    pub platform_fee_bps: u16,
    pub liquidity_fee_bps: u16,
    pub collected_fees: u64,
}

/// Multi-choice market
#[account]
#[derive(InitSpace)]
pub struct MultiMarket {
    pub creator: Pubkey,
    pub question_hash: [u8; 32],
    pub answer_count: u8,
    pub is_one_winner: bool,        // true = NegRisk enabled
    pub volume: u64,
    pub fee_bps: u16,
    pub resolution_time: i64,
    pub resolved: bool,
    pub created_at: i64,
    pub bump: u8,
    pub answers_resolved: u8,
}

/// Answer in a multi-choice market
#[account]
#[derive(InitSpace)]
pub struct Answer {
    pub market: Pubkey,
    pub index: u8,
    pub label_hash: [u8; 32],
    pub yes_pool: u64,
    pub no_pool: u64,
    pub volume: u64,
    pub resolved: bool,
    pub outcome: Option<bool>,
}

/// User position in binary market
#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub yes_shares: u64,
    pub no_shares: u64,
}

/// User position in multi-choice market
#[account]
#[derive(InitSpace)]
pub struct MultiPosition {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub yes_shares: [u64; 10],      // Max 10 answers
    pub no_shares: [u64; 10],
}

/// Limit order
#[account]
#[derive(InitSpace)]
pub struct LimitOrder {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub answer_index: Option<u8>,   // None for binary, Some(idx) for multi-choice
    pub price: u64,
    pub qty: u64,
    pub filled_qty: u64,
    pub is_yes: bool,
    pub is_bid: bool,
    pub created_at: i64,
    pub expires_at: Option<i64>,
}

/// Orderbook for a market (size optimized for 10KB limit)
#[account]
#[derive(InitSpace)]
pub struct Orderbook {
    pub market: Pubkey,
    #[max_len(50)]
    pub yes_buy_orders: Vec<Pubkey>,
    #[max_len(50)]
    pub yes_sell_orders: Vec<Pubkey>,
    #[max_len(50)]
    pub no_buy_orders: Vec<Pubkey>,
    #[max_len(50)]
    pub no_sell_orders: Vec<Pubkey>,
}

// ============== ERRORS ==============

#[error_code]
pub enum LikeliError {
    #[msg("Question exceeds maximum length of 200 characters")]
    QuestionTooLong,
    #[msg("Resolution time must be in the future")]
    InvalidResolutionTime,
    #[msg("Initial liquidity must be at least 100")]
    InsufficientLiquidity,
    #[msg("Market has already been resolved")]
    MarketResolved,
    #[msg("Market has not been resolved yet")]
    MarketNotResolved,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Only the market creator can perform this action")]
    Unauthorized,
    #[msg("Cannot resolve before resolution time")]
    TooEarlyToResolve,
    #[msg("Invalid price (must be 1-9999 basis points)")]
    InvalidPrice,
    #[msg("Insufficient shares")]
    InsufficientShares,
    #[msg("Orderbook is full (max 100 orders per side)")]
    OrderbookFull,
    #[msg("Order not found in orderbook")]
    OrderNotFound,
    #[msg("Total fees exceed 10%")]
    FeesTooHigh,
    #[msg("Slippage exceeded - received fewer shares than minimum")]
    SlippageExceeded,
    #[msg("No winning shares to claim")]
    NoWinningShares,
    #[msg("Invalid answer count (must be 2-10)")]
    InvalidAnswerCount,
    #[msg("Invalid answer index")]
    InvalidAnswerIndex,
    #[msg("This feature is only available for one-winner markets")]
    NotOneWinnerMarket,
    #[msg("Invalid index set for position conversion")]
    InvalidIndexSet,
    #[msg("No convertible positions")]
    NoConvertiblePositions,
    #[msg("Answer has already been resolved")]
    AnswerAlreadyResolved,
    #[msg("A winner has already been declared for this market")]
    WinnerAlreadyDeclared,
    #[msg("Trade too large - max 25% of pool per trade")]
    TradeTooLarge,
    #[msg("Missing sibling accounts for rebalancing")]
    MissingSiblings,
}
