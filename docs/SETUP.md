# Hacker Setup & Sepolia Deployment

## 1) Prerequisites

- Node.js 18+
- npm 9+
- A wallet funded with Sepolia ETH
- RPC provider account (Alchemy/Infura/QuickNode/Ankr)
- Etherscan API key (for verification)

## 2) Install

```bash
npm install
```

## 3) Configure environment

```bash
cp .env.example .env
```

Fill `.env`:

- `DEPLOYER_PRIVATE_KEY`: deployer private key without `0x`
- `MARKETING_WALLET`, `TEAM_WALLET`, `LIQUIDITY_WALLET`: destination wallets
- `SEPOLIA_RPC_URL`: Sepolia endpoint (recommended from Alchemy/Infura/QuickNode/Ankr)
- `ETHERSCAN_API_KEY`: for `verify` script
- `DEPLOYED_ADDRESS`: set after deploy for verify script

## 4) Compile and test

```bash
npm run compile
npm test
```

## 5) Deploy to Sepolia

```bash
npm run deploy_sepolia
```

The deploy script prints the contract address and wallet config.

## 6) Verify on Etherscan

```bash
DEPLOYED_ADDRESS=0xYourContractAddress npm run verify
```

## 7) Post-deploy checklist

1. Set DEX pair with `setDexPair(pairAddress)`
2. Track LP lock timeline in contract with `setLiquidityLockUntil(unlockTimestamp)`
3. Lock LP tokens using external locker (Unicrypt/Team Finance/etc.)
4. Configure taxes and limits for launch conditions
5. Optionally pause/unpause during incidents
