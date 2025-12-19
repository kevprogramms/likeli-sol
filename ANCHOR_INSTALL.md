# Anchor CLI Installation Guide (Windows)

## Option 1: Using Anchor Version Manager (Recommended)

```bash
# 1. Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.4/install)"

# 3. Install AVM (Anchor Version Manager)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

# 4. Install latest Anchor via AVM
avm install latest
avm use latest

# 5. Verify installation
anchor --version
```

## Option 2: Direct Installation (Windows Native)

1. **Install Rust**
   - Download from: https://www.rust-lang.org/tools/install
   - Run `rustup-init.exe`

2. **Install Solana CLI**
   - Download installer from: https://docs.solana.com/cli/install-solana-cli-tools

3. **Install Anchor**
```powershell
cargo install --git https://github.com/coral-xyz/anchor --tag v0.29.0 anchor-cli --locked
```

## After Installation

1. **Navigate to contracts folder**
```bash
cd C:\Users\bread\Desktop\likeli-sol-main\likeli-sol-main\likeli-contracts
```

2. **Build program**
```bash
anchor build
```

3. **Deploy to devnet**
```bash
solana config set --url devnet
anchor deploy
```

4. **Copy updated IDL**
```bash
cp target/idl/likeli_contracts.json ../likeli-app/src/idl/
```

## Troubleshooting

- **"anchor not found"**: Restart your terminal after installation
- **Build errors**: Make sure Rust is up to date with `rustup update`
- **Solana errors**: Check internet connection and devnet status

## Links
- Anchor Docs: https://www.anchor-lang.com/
- Solana Docs: https://docs.solana.com/
- Rust Install: https://www.rust-lang.org/tools/install
