# Hacker (HACK) Tokenomics

Tagline: **The One who Finds**

## Supply

- **Total supply:** 1,000,000,000,000 HACK (1 trillion)
- **Decimals:** 18

## Initial Allocation

| Bucket | % | Tokens | Notes |
|---|---:|---:|---|
| Liquidity | 50% | 500,000,000,000 | Sent to `LIQUIDITY_WALLET` |
| Marketing | 20% | 200,000,000,000 | Sent to `MARKETING_WALLET` |
| Team (vested) | 15% | 150,000,000,000 | Held in contract; linear vesting |
| Burn (genesis) | 10% | 100,000,000,000 | Sent to dead address |
| Reserve | 5% | 50,000,000,000 | Sent to deployer |

## Tax Structure (DEX only)

Wallet-to-wallet transfers are untaxed. Buy/sell taxes apply when transfer interacts with configured `dexPair`.

| Side | Liquidity | Marketing | Burn | Total |
|---|---:|---:|---:|---:|
| Buy | 2% | 2% | 1% | 5% |
| Sell | 3% | 3% | 2% | 8% |

Governance limits:
- Max buy tax total: **10%**
- Max sell tax total: **15%**

## Anti-Whale Mechanics

- Max wallet: **1%** of total supply
- Max transaction: **0.5%** of total supply
- Owner can adjust or remove limits after launch

## Team Vesting

- Team allocation is locked in contract at deployment
- Vesting starts at deployment timestamp
- Linear release over **365 days**
- Claim function sends vested tokens to `TEAM_WALLET` only

## Emission Timeline

- TGE (deployment): 85% liquid/allocated immediately (LP, marketing, burn, reserve)
- Months 0–12: team tokens unlock linearly
- Month 12+: team vesting fully complete

## Utility & Use Cases

- Community-driven meme branding
- Liquidity-focused growth through LP allocation
- Treasury-backed marketing campaigns
- Token-gated community rewards, quests, and airdrops
