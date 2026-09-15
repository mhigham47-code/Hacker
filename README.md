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
| `claimTeamTokens()` | Anyone | Release vested team tokens to `teamWallet` |
| `vestedAmount()` | View | Total team tokens vested so far |
| `renounceOwnership()` | Owner | Give up admin control (irreversible) |

---

## Development Setup

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

## Scalping Bot (BTC/ETH)

`scripts/scalping-bot.js` is a simple EMA-crossover scalping bot for `BTC/USD` and
`ETH/USD`, built on the same Alpaca API used by `scripts/alpaca-buy.js`.

**Strategy:** polls 1-minute bars on an interval and computes a fast (5) and slow
(20) EMA per symbol. A bullish crossover opens a position sized at
`SCALPER_POSITION_USD`; the position is closed on whichever comes first: a
take-profit (`SCALPER_TAKE_PROFIT_PCT`), a stop-loss (`SCALPER_STOP_LOSS_PCT`), or
the fast EMA crossing back below the slow EMA.

### Run it

```bash
cp .env.example .env
# fill in ALPACA_API_KEY_ID / ALPACA_API_SECRET_KEY (paper keys from alpaca.markets)

npm run scalp:once   # single poll, useful for testing your config
npm run scalp        # runs continuously until Ctrl-C
```

### Safety

- **Defaults to Alpaca's paper endpoint.** The bot refuses to place real orders
  unless `ALPACA_BASE_URL` points at the live API **and** `ALLOW_LIVE_TRADING=true`
  is set explicitly in `.env`.
- This is a basic, educational strategy — it is not risk-managed for real capital.
  Backtest and paper-trade extensively before ever considering live use, and only
  ever risk money you can afford to lose.
- Tune position size, take-profit/stop-loss, and poll interval via the
  `SCALPER_*` environment variables (see `.env.example`).

---

## Security Considerations

- **Audit required** before mainnet launch. Never deploy an unaudited token with real funds.
- Team tokens are held in the contract and released linearly over 365 days — they cannot be accessed early.
- The dead address receives 10% of supply at deployment, providing an immediate and permanent deflationary base.
- Tax rate changes are capped by the contract (≤10% buy, ≤15% sell) to protect holders.

---

## License

MIT
