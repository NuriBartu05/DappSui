# Sui DEX Aggregator Backend API

A robust Node.js/Express backend for a Sui DEX Aggregator using the Aftermath Finance SDK on **Testnet only**.

## Features

- ✅ **Quote Endpoint**: Get best swap routes and estimated outputs
- ✅ **Standard Swap**: Build transactions where users pay gas in SUI
- ✅ **Sponsored Swap**: Backend pays SUI gas fees, user pays service fee in USDC/USDT
- ✅ **Gas Refuel Station**: Swap any token for exactly 1 or 5 SUI
- ✅ **Dust Sweeper**: Batch convert multiple small token balances to SUI/USDC
- ✅ **Testnet Only**: All operations on Sui Testnet
- ✅ **Gas Abstraction**: Backend sponsors gas fees for selected transactions
- ✅ **Error Handling**: Comprehensive error handling and validation

## Tech Stack

- **Framework**: Express.js with TypeScript
- **Blockchain**: Sui Network (Testnet)
- **DEX Aggregator**: Aftermath Finance SDK (af-sdk)
- **Libraries**: @mysten/sui, big.js for precise calculations

## Installation

### Prerequisites

- Node.js v18+ 
- pnpm (recommended) or npm
- Sui Testnet wallet with some SUI for gas sponsorship

### Setup

1. Clone and install dependencies:

```bash
pnpm install
```

2. Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:

```bash
# Sui Network Configuration
SUI_NODE_URL=https://fullnode.testnet.sui.io:443
NETWORK=testnet

# Sponsor wallet private key (base64 encoded)
SPONSOR_PRIVATE_KEY=your_base64_private_key

# Treasury address (receives service fees)
TREASURY_ADDRESS=0x_your_treasury_address

# Server configuration
PORT=3001
SERVICE_FEE_BPS=30  # 0.3% fee
```

### Getting Private Key

To get your sponsor private key in base64 format:

```typescript
// Using Sui CLI
sui keytool export --key-identity <your-address>

// Or in code:
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const keypair = Ed25519Keypair.generate();
const privateKeyBase64 = Buffer.from(keypair.export().privateKey).toString('base64');
console.log(privateKeyBase64);
```

## Development

Start development server with hot reload:

```bash
pnpm dev
```

Build for production:

```bash
pnpm build
pnpm start
```

## API Endpoints

### 1. GET `/api/quote`

Get the best swap route and estimated output.

**Query Parameters:**
- `tokenInType`: Source token type (e.g., `0x2::sui::SUI`)
- `tokenOutType`: Target token type
- `amount`: Amount to swap (in smallest units)

**Response:**
```json
{
  "estimatedAmountOut": "1000000",
  "route": {
    "path": ["Cetus", "Turbos"],
    "protocols": ["Cetus", "Turbos"],
    "estimatedGas": "1000000"
  },
  "priceImpact": "0.15"
}
```

### 2. POST `/api/swap/build`

Build a standard swap transaction (user pays gas in SUI).

**Request Body:**
```json
{
  "userAddress": "0x123...",
  "tokenInType": "0x2::sui::SUI",
  "tokenOutType": "0x..::usdc::USDC",
  "amount": "1000000000",
  "slippage": 50
}
```

**Response:**
```json
{
  "txBytes": "base64_encoded_transaction",
  "estimatedAmountOut": "950000",
  "route": {
    "path": ["Cetus"],
    "protocols": ["Cetus"],
    "estimatedGas": "1000000"
  }
}
```

### 3. POST `/api/swap/build-sponsored`

Build a sponsored swap where the backend pays SUI gas fees.

**Key Features:**
- User pays service fee + gas cost in USDC/USDT
- Backend sponsors actual SUI gas payment
- Transaction splits user's input: swap amount + fee to treasury

**Request Body:**
```json
{
  "userAddress": "0x123...",
  "tokenInType": "0x..::usdc::USDC",
  "tokenOutType": "0x2::sui::SUI",
  "amount": "1000000",
  "slippage": 50,
  "paymentTokenType": "0x..::usdc::USDC"
}
```

**Response:**
```json
{
  "txBytes": "base64_encoded_transaction",
  "sponsorSignature": "sponsor_signature",
  "estimatedAmountOut": "970000",
  "gasCostInPaymentToken": "0",
  "serviceFee": "3000",
  "totalCost": "3000"
}
```

**Transaction Flow:**
1. Split user's USDC input into: swap amount + service fee
2. Transfer service fee to treasury
3. Execute swap with remaining amount
4. Backend signs as gas owner (sponsor)
5. User signs as sender
6. Execute with dual signatures

### 4. POST `/api/refuel`

Swap any liquid token for exactly 1 or 5 SUI (Gas Station).

**Request Body:**
```json
{
  "userAddress": "0x123...",
  "tokenInType": "0x..::usdc::USDC",
  "amountOut": "1000000000",
  "slippage": 50
}
```

**Valid `amountOut` values:**
- `"1000000000"` = 1 SUI
- `"5000000000"` = 5 SUI

**Response:**
```json
{
  "txBytes": "base64_encoded_transaction",
  "estimatedAmountIn": "150000",
  "route": {
    "path": ["Cetus"],
    "protocols": ["Cetus"],
    "estimatedGas": "1000000"
  }
}
```

### 5. POST `/api/dust/sweep`

Convert multiple small token balances to SUI or USDC in one transaction.

**Request Body:**
```json
{
  "userAddress": "0x123...",
  "tokens": [
    {
      "tokenType": "0x..::token_a::TOKEN_A",
      "balance": "50000"
    },
    {
      "tokenType": "0x..::token_b::TOKEN_B",
      "balance": "30000"
    }
  ],
  "targetTokenType": "0x2::sui::SUI",
  "slippage": 100
}
```

**Response:**
```json
{
  "txBytes": "base64_encoded_transaction",
  "estimatedTotalOut": "980000",
  "swaps": [
    {
      "tokenIn": "0x..::token_a::TOKEN_A",
      "amountIn": "50000",
      "estimatedOut": "500000"
    },
    {
      "tokenIn": "0x..::token_b::TOKEN_B",
      "amountIn": "30000",
      "estimatedOut": "480000"
    }
  ]
}
```

## Frontend Integration

### Standard Swap Flow

```typescript
// 1. Get quote
const quote = await fetch('http://localhost:3001/api/quote?tokenInType=0x2::sui::SUI&tokenOutType=0x..::usdc::USDC&amount=1000000000');

// 2. Build transaction
const buildResponse = await fetch('http://localhost:3001/api/swap/build', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userAddress: '0x123...',
    tokenInType: '0x2::sui::SUI',
    tokenOutType: '0x..::usdc::USDC',
    amount: '1000000000',
    slippage: 50
  })
});

const { txBytes } = await buildResponse.json();

// 3. Sign and execute with user wallet
const txBytesArray = Uint8Array.from(Buffer.from(txBytes, 'base64'));
const signedTx = await wallet.signTransaction({ transaction: txBytesArray });
const result = await suiClient.executeTransactionBlock({
  transactionBlock: signedTx.transactionBlockBytes,
  signature: signedTx.signature
});
```

### Sponsored Swap Flow

```typescript
// 1. Build sponsored transaction
const buildResponse = await fetch('http://localhost:3001/api/swap/build-sponsored', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userAddress: '0x123...',
    tokenInType: '0x..::usdc::USDC',
    tokenOutType: '0x2::sui::SUI',
    amount: '1000000',
    slippage: 50
  })
});

const { txBytes, sponsorSignature } = await buildResponse.json();

// 2. User signs the transaction
const txBytesArray = Uint8Array.from(Buffer.from(txBytes, 'base64'));
const userSignature = await wallet.signTransaction({ transaction: txBytesArray });

// 3. Execute with both signatures
const result = await suiClient.executeTransactionBlock({
  transactionBlock: txBytes,
  signature: [userSignature.signature, sponsorSignature]
});
```

## Architecture

### Gas Sponsorship Model

The backend sponsors gas fees using a dedicated sponsor wallet:

1. **Sponsor Wallet**: Holds SUI to pay gas fees
2. **User Wallet**: Signs transaction as sender, pays service fee in USDC/USDT
3. **Transaction Structure**:
   - Sender: User address
   - Gas Owner: Sponsor address
   - Dual signatures required

### Fee Structure

- **Service Fee**: 0.3% (30 basis points) of swap amount
- **Gas Cost**: Paid by sponsor (backend)
- **Total User Cost**: Service fee only (in payment token)

### Route Optimization

Aftermath SDK automatically:
- Finds best routes across multiple DEXs
- Splits trades across protocols if beneficial
- Minimizes price impact
- Estimates gas costs

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "details": "Additional details",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/swap/build"
}
```

Common error codes:
- `400`: Bad request (validation error)
- `404`: No route found for token pair
- `500`: Internal server error

## Testing

Test with curl:

```bash
# Health check
curl http://localhost:3001/health

# Get quote
curl "http://localhost:3001/api/quote?tokenInType=0x2::sui::SUI&tokenOutType=0x..::usdc::USDC&amount=1000000000"

# Build swap
curl -X POST http://localhost:3001/api/swap/build \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x123...",
    "tokenInType": "0x2::sui::SUI",
    "tokenOutType": "0x..::usdc::USDC",
    "amount": "1000000000",
    "slippage": 50
  }'
```

## Production Deployment

1. Set `NODE_ENV=production` in `.env`
2. Build the application: `pnpm build`
3. Ensure sponsor wallet has sufficient SUI for gas
4. Set up monitoring for sponsor wallet balance
5. Configure rate limiting and security headers
6. Use a reverse proxy (nginx) for SSL termination

## Security Considerations

- Store `SPONSOR_PRIVATE_KEY` securely (use secret management)
- Monitor sponsor wallet balance to prevent depletion
- Implement rate limiting to prevent abuse
- Validate all user inputs
- Set appropriate CORS origins for production
- Use HTTPS in production

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
