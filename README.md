# Gasless DEX MVP

A full-stack gasless decentralized exchange for Sui Testnet. Users can swap USDC for WALRUS tokens and buy SUI gas even with **zero SUI balance**.

![Gasless DEX](https://img.shields.io/badge/Sui-Testnet-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## 🌟 Features

- **Gasless Swaps**: Swap tokens even with 0 SUI balance
- **Get Gas**: Buy SUI using USDC when you need gas
- **Sponsored Transactions**: Backend acts as gas station, paying fees in exchange for USDC
- **Modern UI**: Glassmorphism design with smooth animations
- **Real-time Prices**: CoinGecko integration for SUI/USDC rates

## 📁 Project Structure

```
├── contracts/          # Move smart contracts
│   ├── Move.toml
│   └── sources/
│       ├── usdc.move   # Test USDC token
│       └── walrus.move # WALRUS token
├── backend/            # Express + TypeScript API
│   ├── src/
│   │   ├── server.ts   # Main API endpoints
│   │   ├── config.ts   # Configuration
│   │   └── utils.ts    # Utility functions
│   └── package.json
└── frontend/           # Next.js 14 + Tailwind
    ├── src/
    │   ├── app/        # App router pages
    │   ├── components/ # React components
    │   ├── hooks/      # Custom React hooks
    │   └── lib/        # Utilities & config
    └── package.json
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Sui CLI installed ([Installation Guide](https://docs.sui.io/build/install))
- A Sui wallet with testnet SUI for the Pool Wallet

### Step 1: Deploy Smart Contracts

```bash
cd contracts

# Build and publish to testnet
sui client publish --gas-budget 100000000

# Note the Package ID from output (starts with 0x...)
```

After publishing:
1. Save the Package ID
2. Mint test tokens to your Pool Wallet using the `mint` functions

### Step 2: Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your values:
# - ADMIN_PRIVATE_KEY: Your Pool Wallet private key
# - USDC_TYPE: {PACKAGE_ID}::usdc::USDC
# - WALRUS_TYPE: {PACKAGE_ID}::walrus::WALRUS

# Start development server
npm run dev
```

Backend runs at `http://localhost:3001`

### Step 3: Setup Frontend

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local (optional, defaults work for local dev)
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > .env.local
echo "NEXT_PUBLIC_USDC_TYPE={PACKAGE_ID}::usdc::USDC" >> .env.local
echo "NEXT_PUBLIC_WALRUS_TYPE={PACKAGE_ID}::walrus::WALRUS" >> .env.local

# Start development server
npm run dev
```

Frontend runs at `http://localhost:3000`

## 🔧 API Endpoints

### GET `/api/health`
Health check with pool wallet balances.

### GET `/api/prices`
Current SUI price, exchange rates, and gas estimates.

### POST `/api/swap`
```json
{
  "userAddress": "0x...",
  "amountUsdc": 10,
  "isGasless": true
}
```
Returns sponsored transaction for user to sign.

### POST `/api/get-gas`
```json
{
  "userAddress": "0x..."
}
```
Returns sponsored transaction to buy 0.1 SUI with USDC.

## 🔐 How Sponsored Transactions Work

1. **User Request**: Frontend sends swap/get-gas request to backend
2. **PTB Construction**: Backend builds Programmable Transaction Block
3. **Gas Sponsorship**: Backend sets gas payment to admin's SUI coins
4. **Sponsor Signature**: Backend signs as gas owner (sponsor)
5. **User Signature**: Frontend prompts user to sign
6. **Execution**: Both signatures combined and transaction executed

```
┌─────────┐    Request    ┌─────────┐    PTB + Sig    ┌─────────┐
│ Frontend│ ────────────► │ Backend │ ────────────────►│  User   │
│         │               │ (Pool)  │                  │  Signs  │
└─────────┘               └─────────┘                  └────┬────┘
                                                            │
                                                            ▼
                                                    ┌───────────────┐
                                                    │ Execute with  │
                                                    │ Both Sigs     │
                                                    └───────────────┘
```

## ⚠️ Important Notes

1. **Test Tokens**: This uses custom test tokens. Deploy contracts first and update type tags.

2. **Pool Wallet Security**: The `ADMIN_PRIVATE_KEY` controls your liquidity. Never commit it to git.

3. **Testnet Only**: This is an MVP for hackathon demonstration. Not production-ready.

4. **Rate Limiting**: Consider adding rate limiting to backend for production use.

## 📝 Environment Variables

### Backend (`.env`)
| Variable | Description |
|----------|-------------|
| `ADMIN_PRIVATE_KEY` | Pool wallet private key (suiprivkey1...) |
| `RPC_URL` | Sui RPC endpoint |
| `USDC_TYPE` | USDC coin type tag |
| `WALRUS_TYPE` | WALRUS coin type tag |
| `PORT` | Server port (default: 3001) |

### Frontend (`.env.local`)
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL |
| `NEXT_PUBLIC_USDC_TYPE` | USDC coin type tag |
| `NEXT_PUBLIC_WALRUS_TYPE` | WALRUS coin type tag |

## 🤝 Contributing

This is a hackathon project. Feel free to fork and improve!

## 📄 License

MIT
