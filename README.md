# Hacker (HACK)
> *The One who Finds*

Hacker is an EVM-based meme coin built on Ethereum. It features a deflationary tokenomics model with auto-burn on every swap, buy/sell taxes that fund liquidity and marketing, anti-whale protections, and a 12-month linear vesting schedule for team tokens.

---

## Tokenomics

| Allocation | % | Destination |
|---|---|---|
| Liquidity Pool | 50% | `LIQUIDITY_WALLET` (lock externally) |
| Marketing | 20% | `MARKETING_WALLET` |
| Team (vested) | 15% | Contract → `TEAM_WALLET` over 12 months |
| Burn | 10% | `0x000...dEaD` at deployment |
| Reserve | 5% | Deployer |

**Total Supply:** 1,000,000,000,000 HACK (1 trillion)  
**Decimals:** 18  
**Symbol:** HACK

### Tax Structure

Taxes apply **only to DEX swaps** (buy/sell). Wallet-to-wallet transfers are tax-free.

| | Liquidity | Marketing | Burn | Total |
|---|---|---|---|---|
| **Buy** | 2% | 2% | 1% | **5%** |
| **Sell** | 3% | 3% | 2% | **8%** |

Tax rates can be adjusted by the owner (capped at 10% buy / 15% sell) or zeroed out entirely.

### Anti-Whale Protections

- **Max wallet:** 1% of total supply per address
- **Max transaction:** 0.5% of total supply per transfer
- Both limits can be raised or removed by the owner after launch.

---

## Smart Contract

- **Solidity:** `^0.8.20`
- **Standard:** ERC-20 (OpenZeppelin)
- **Framework:** Hardhat
- **File:** [`contracts/Hacker.sol`](contracts/Hacker.sol)

### Key Functions

| Function | Who | Description |
|---|---|---|
| `setDexPair(address)` | Owner | Register the Uniswap/DEX pair to enable tax |
| `setTax(...)` | Owner | Adjust buy/sell tax breakdown |
| `setLimits(maxWallet, maxTx)` | Owner | Update anti-whale limits |
| `removeLimits()` | Owner | Permanently remove transaction/wallet limits |
| `pause()` / `unpause()` | Owner | Emergency transfer pause control |
| `setBlacklist(account,bool)` | Owner | Block compromised/bot addresses |
| `setGreylist(account,bool)` | Owner | Restrict DEX trading for suspicious addresses |
| `setLiquidityLockUntil(ts)` | Owner | Track LP lock timeline in contract state |
| `increaseAllowance()` / `decreaseAllowance()` | Holder | Safer allowance management helpers |
| `claimTeamTokens()` | Anyone | Release vested team tokens to `teamWallet` |
| `vestedAmount()` | View | Total team tokens vested so far |
| `renounceOwnership()` | Owner | Give up admin control (irreversible) |

---

## Development Setup

Full guides:
- [Setup & Sepolia deployment](docs/SETUP.md)
- [Tokenomics breakdown](docs/TOKENOMICS.md)
- [Marketing and launch plan](docs/MARKETING.md)

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install

```bash
npm install
```

### Configure

```bash
cp .env.example .env
# Edit .env with your private key, wallet addresses, and API keys
```

### Compile

```bash
npm run compile
```

### Test

```bash
npm test
```

### Coverage

```bash
npm run coverage
```

---

## Deployment

### 1. Deploy to Testnet (Sepolia)

```bash
npm run deploy_sepolia
```

### 2. Verify on Etherscan

```bash
DEPLOYED_ADDRESS=0x... npm run verify
```

### 3. Post-Deploy Checklist

- [ ] Call `setDexPair(<uniswap_pair_address>)` after creating the liquidity pool
- [ ] Lock LP tokens externally (e.g. [Unicrypt](https://unicrypt.network), [Team.Finance](https://team.finance))
- [ ] Submit for third-party audit
- [ ] Call `renounceOwnership()` when confident (irreversible)

### 4. Deploy to Mainnet

```bash
npm run deploy_mainnet
```

---

## Security Considerations

- **Audit required** before mainnet launch. Never deploy an unaudited token with real funds.
- Team tokens are held in the contract and released linearly over 365 days — they cannot be accessed early.
- The dead address receives 10% of supply at deployment, providing an immediate and permanent deflationary base.
- Tax rate changes are capped by the contract (≤10% buy, ≤15% sell) to protect holders.

---

## License

MIT
