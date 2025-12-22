# DeFi ERC20 + Liquidity Pool (Sepolia)

A simple DeFi demo on **Sepolia**:
- Custom **ERC-20 token (MTK)**
- Mock **USDT-like stable token**
- **Liquidity pool** (AMM style) for MTK/USDT
- Users can **add/remove liquidity (stake LP)**, **swap**, and **claim rewards**
- **Swap fees** are collected and distributed to liquidity providers as rewards

## Features
- ✅ ERC-20 MTK token
- ✅ ERC-20 stable token (mock USDT for testnet)
- ✅ Liquidity pool with reserves + swaps
- ✅ Swap fee (basis points) distributed to LPs
- ✅ Frontend: connect MetaMask, show balances, swap, stake, remove, claim rewards
- ✅ Loading states + error handling in UI

## Repo Structure
- `contracts/` Solidity contracts
- `scripts/` deployment + utility scripts
- `frontend/` React UI (MetaMask)

## Prerequisites
- Node.js (LTS recommended)
- MetaMask
- Sepolia ETH for gas

## Setup

### 1) Install dependencies
From repo root:
```bash
npm install
npm --prefix frontend install
```

### 2) Configure environment
Create a root `.env` (DO NOT COMMIT IT):
- Copy `.env.example` → `.env`
- Fill in:
  - `SEPOLIA_RPC_URL`
  - `PRIVATE_KEY` (test wallet only)

### 3) Deploy to Sepolia
```bash
npx hardhat run scripts/deploy.js --network sepolia
```

This writes:
- `frontend/.env` with deployed addresses
- `frontend/src/contracts` ABIs/artifacts needed by the UI

### 4) Run the frontend
```bash
npm --prefix frontend start
```

Open http://localhost:3000

## How rewards work
Each swap charges a fee (bps). Fees are accumulated and distributed to liquidity providers proportionally to their LP shares:
- MTK→USDT swaps generate rewards in MTK
- USDT→MTK swaps generate rewards in USDT

Users can claim rewards from the UI.

## Security Notes
- Never commit `.env` or private keys.
- If you accidentally exposed a private key, rotate it immediately and treat it as compromised.

## License
MIT

