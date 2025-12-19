-- Likeli PostgreSQL Schema
-- Database: Supabase (free tier) or Neon

-- ============================================
-- TABLES
-- ============================================

-- User profiles
CREATE TABLE IF NOT EXISTS users (
    wallet VARCHAR(44) PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    avatar TEXT,
    bio TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Binary markets (metadata)
CREATE TABLE IF NOT EXISTS binary_markets (
    address VARCHAR(44) PRIMARY KEY,
    creator VARCHAR(44) REFERENCES users(wallet),
    question TEXT NOT NULL,
    description TEXT,
    category VARCHAR(50),
    image_url TEXT,
    resolution_time TIMESTAMP NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    outcome BOOLEAN,
    yes_pool BIGINT DEFAULT 0,
    no_pool BIGINT DEFAULT 0,
    volume BIGINT DEFAULT 0,
    fee_bps INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    indexed_at TIMESTAMP DEFAULT NOW()
);

-- Multi-choice markets (metadata)
CREATE TABLE IF NOT EXISTS multi_markets (
    address VARCHAR(44) PRIMARY KEY,
    creator VARCHAR(44) REFERENCES users(wallet),
    question TEXT NOT NULL,
    question_hash VARCHAR(64),
    description TEXT,
    category VARCHAR(50),
    image_url TEXT,
    answer_count SMALLINT NOT NULL,
    is_one_winner BOOLEAN DEFAULT TRUE,
    resolution_time TIMESTAMP NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    volume BIGINT DEFAULT 0,
    fee_bps INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    indexed_at TIMESTAMP DEFAULT NOW()
);

-- Answers for multi-choice markets
CREATE TABLE IF NOT EXISTS answers (
    id SERIAL PRIMARY KEY,
    market_address VARCHAR(44) REFERENCES multi_markets(address) ON DELETE CASCADE,
    answer_address VARCHAR(44) UNIQUE,
    index SMALLINT NOT NULL,
    label TEXT NOT NULL,
    label_hash VARCHAR(64),
    yes_pool BIGINT DEFAULT 0,
    no_pool BIGINT DEFAULT 0,
    volume BIGINT DEFAULT 0,
    resolved BOOLEAN DEFAULT FALSE,
    outcome BOOLEAN,
    UNIQUE(market_address, index)
);

-- Trades
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    signature VARCHAR(88) UNIQUE NOT NULL,
    market_address VARCHAR(44) NOT NULL,
    market_type VARCHAR(10) NOT NULL CHECK (market_type IN ('binary', 'multi')),
    user_wallet VARCHAR(44) NOT NULL,
    answer_index SMALLINT,
    trade_type VARCHAR(10) NOT NULL CHECK (trade_type IN ('BUY', 'SELL', 'CONVERT', 'SPLIT', 'MERGE')),
    outcome VARCHAR(5) CHECK (outcome IN ('YES', 'NO')),
    amount BIGINT NOT NULL,
    shares BIGINT,
    price DECIMAL(10,6),
    fee BIGINT DEFAULT 0,
    slot BIGINT,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Price history (for charts)
CREATE TABLE IF NOT EXISTS prices (
    id SERIAL PRIMARY KEY,
    market_address VARCHAR(44) NOT NULL,
    answer_index SMALLINT DEFAULT 0,
    probability DECIMAL(5,4) NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_prices_market_time ON prices(market_address, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trades_market ON trades(market_address);
CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_wallet);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    market_address VARCHAR(44) NOT NULL,
    market_type VARCHAR(10) NOT NULL,
    user_wallet VARCHAR(44) REFERENCES users(wallet),
    parent_id INTEGER REFERENCES comments(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Market followers
CREATE TABLE IF NOT EXISTS market_follows (
    user_wallet VARCHAR(44) REFERENCES users(wallet),
    market_address VARCHAR(44) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_wallet, market_address)
);

-- User follows
CREATE TABLE IF NOT EXISTS user_follows (
    follower VARCHAR(44) REFERENCES users(wallet),
    following VARCHAR(44) REFERENCES users(wallet),
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (follower, following)
);

-- ============================================
-- VIEWS
-- ============================================

-- Leaderboard
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
    user_wallet,
    COUNT(*) as trade_count,
    SUM(amount) as total_volume,
    SUM(CASE WHEN trade_type = 'BUY' THEN amount ELSE 0 END) as buy_volume,
    SUM(CASE WHEN trade_type = 'SELL' THEN amount ELSE 0 END) as sell_volume
FROM trades
GROUP BY user_wallet
ORDER BY total_volume DESC;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Update timestamp on row update
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS (Row Level Security) for Supabase
-- ============================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Users can read all, update own
CREATE POLICY "Users are viewable by everyone" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (wallet = current_setting('app.current_user_wallet', true));

-- Comments are public, can insert if authenticated
CREATE POLICY "Comments are viewable by everyone" ON comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment" ON comments FOR INSERT WITH CHECK (true);
