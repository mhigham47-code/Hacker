# 🚀 Hacker Token Deployment Checklist

## Pre-Deployment ✅

- [ ] **Setup .env file**
  ```bash
  cp .env.example .env
  ```
  Required variables:
  - `DEPLOYER_PRIVATE_KEY` - Your wallet private key (24+ hex chars, no leading 0x)
  - `SEPOLIA_RPC_URL` - Sepolia testnet RPC (Infura, Alchemy, etc.)
  - `MAINNET_RPC_URL` - Ethereum mainnet RPC (for future production)
  - `MARKETING_WALLET` - Address for 20% marketing allocation
  - `TEAM_WALLET` - Address for 15% vested team tokens
  - `LIQUIDITY_WALLET` - Address for 50% liquidity pool tokens
  - `ETHERSCAN_API_KEY` - For contract verification

- [ ] **Verify wallet has Sepolia ETH**
  - Need ~0.5-1 ETH for deployment + gas
  - Get free Sepolia ETH from faucets:
    - https://sepoliafaucet.com
    - https://faucets.chain.link/sepolia

- [ ] **Review contract and tokenomics**
  - Read `docs/TOKENOMICS.md` - Understand supply allocation
  - Read `docs/MARKETING.md` - Know your launch strategy
  - Review `contracts/Hacker.sol` - Verify tax rates and anti-whale limits

---

## Deployment Steps 🚀

### Step 1: Compile Contract
```bash
npm run compile
```
Expected output: No errors, contract compiles with 0.8.26

### Step 2: Deploy to Sepolia
```bash
DEPLOYER_PRIVATE_KEY=your_key \
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY \
MARKETING_WALLET=0x... \
TEAM_WALLET=0x... \
LIQUIDITY_WALLET=0x... \
npm run deploy_sepolia
```

**Output will show:**
- ✅ Hacker token contract address (save this!)
- ✅ Account balance and gas used
- ✅ All wallet allocations

### Step 3: Save Contract Address
```bash
# Add to .env for verification
DEPLOYED_ADDRESS=0x...  # From Step 2 output
```

### Step 4: Verify on Etherscan
```bash
DEPLOYED_ADDRESS=0x... \
ETHERSCAN_API_KEY=your_key \
npm run verify
```

Expected: Contract verified on Etherscan with full source code visible

---

## Post-Deployment 📋

### Create Uniswap LP

1. **Fill in LP variables in `.env`:**
   ```
   HACK_ADDRESS=0x<your_deployed_hack_address>
   HACK_LIQUIDITY=500000000000   # 500B HACK (50% of supply)
   ETH_LIQUIDITY=0.5             # 0.5 Sepolia ETH
   ```

2. **Run the LP deployment script:**
   ```bash
   npx hardhat run scripts/deployUniswapLP.js --network sepolia
   ```
   Expected output:
   ```
   Deployer:        0x...
   ETH balance:     1.23 ETH
   ✅ Results:
     Pair address (set as DEX pair):  0x<pair>
     LP token address:                0x<pair>
     Gas used: 200000
   Next step: register the pair with the contract:
     npx hardhat setDexPair --pair 0x<pair> --network sepolia
   ```

3. **Register the pair with your contract:**
   ```bash
   HACK_ADDRESS=0x<hack> npx hardhat setDexPair --pair 0x<pair> --network sepolia
   ```

4. **Verify the pair is set:**
   ```bash
   HACK_ADDRESS=0x<hack> npx hardhat testTax --network sepolia
   ```

### Set DEX Pair in Contract

After creating the LP pair manually (e.g. via Uniswap UI), you can also register it:
```bash
HACK_ADDRESS=0x<hack> npx hardhat setDexPair --pair 0x<uniswap_pair_address> --network sepolia
```

**Why?** The contract won't apply tax/limits until it knows the DEX pair address.

### Lock Liquidity (Optional but Recommended)

Use external locker like:
- **Unicrypt** (https://app.uncx.network/locks/uniswap_v2/create)
- **Team Finance** (https://www.teamfinance.io/)

### Renounce Ownership (Final Step)
```bash
npx hardhat --network sepolia \
  run -c "const h = await ethers.getContractAt('Hacker', '0x...'); \
  await h.renounceOwnership()"
```

**⚠️ WARNING:** This is irreversible! You lose all admin powers. Only do after confirming everything works.

---

## Running Test Scripts 🧪

### Full Feature Test (Sepolia)
```bash
HACK_ADDRESS=0x<hack> npx hardhat run scripts/testFeatures.js --network sepolia
```

Expected output example:
```
════════════════════════════════════════════════════════════
🧪  HACKER TOKEN — FEATURE TEST SUITE
════════════════════════════════════════════════════════════
  ✅ PASS  Name and symbol correct
  ✅ PASS  Total supply non-zero
  ✅ PASS  maxWalletAmount ≤ totalSupply
  ✅ PASS  Buy tax ≤ 10%
  ✅ PASS  Sell tax ≤ 15%
  ...
📊  RESULTS
  ✅ Passed: 14
  ❌ Failed: 0
🎉  All tests passed! Contract is ready for mainnet.
```

### Hardhat Tasks (Quick Commands)
```bash
# Set DEX pair after LP creation
HACK_ADDRESS=0x<hack> npx hardhat setDexPair --pair 0x<pair> --network sepolia

# Buy tokens via Uniswap router (0.01 ETH worth)
HACK_ADDRESS=0x<hack> npx hardhat buyTokens --amount 0.01 --network sepolia

# Check current tax configuration
HACK_ADDRESS=0x<hack> npx hardhat testTax --network sepolia

# Emergency pause all transfers (owner only)
HACK_ADDRESS=0x<hack> npx hardhat pauseToken --network sepolia

# Unpause transfers
HACK_ADDRESS=0x<hack> npx hardhat unpauseToken --network sepolia
```

### Unit / Integration Tests (local Hardhat node)
```bash
npm test
# or
npx hardhat test
```

Test suites include:
- **Deployment** — supply, allocation, limits
- **Transfers without DEX pair** — no tax, anti-whale enforcement
- **Tax on DEX swaps** — buy tax 5%, sell tax 8%, excluded addresses
- **Team token vesting** — linear release, claim, nothing-to-claim guard
- **Owner configuration** — setDexPair, setLimits, setTax, removeLimits
- **Tax calculation accuracy** — exact fee math, zero-burn case
- **Limit enforcement** — maxWallet breach, maxTx breach, DEX exclusion
- **Tax exclusion enforcement** — blacklist-like blocking, non-owner guards
- **Uniswap pair interaction** — events, exclusions, full buy-sell cycle

---

## Testing Before Mainnet

### 1. Test Tax Collection
- Buy 1000 HACK on Uniswap → Verify 5% buy tax applied
- Sell 1000 HACK on Uniswap → Verify 8% sell tax applied
- Direct transfer (wallet→wallet) → Verify NO tax
- Run: `HACK_ADDRESS=0x<hack> npx hardhat testTax --network sepolia`

### 2. Test Anti-Whale
- Try to buy more than 0.5% supply in one tx → Should fail
- Try to buy so wallet > 1% → Should fail
- Call `removeLimits()` as owner → Limits removed

### 3. Test Emergency Controls
- `HACK_ADDRESS=0x<hack> npx hardhat pauseToken --network sepolia` → All transfers blocked
- Try to transfer → Should fail
- `HACK_ADDRESS=0x<hack> npx hardhat unpauseToken --network sepolia` → Transfers work again

### 4. Test Vesting
- Wait for time to pass or use Hardhat time travel (`time.increase`)
- Call `claimTeamTokens()` → Vested portion unlocked

---

## Troubleshooting

### "Couldn't download compiler"
**Solution:** Make sure you're in an environment with internet access. Tests require network access to download Solidity compiler.

### "Failed to verify"
**Solution:** 
- Check Etherscan API key is valid
- Wait 30 seconds after deployment before verifying
- Ensure constructor args are correct in verify script

### "Insufficient gas"
**Solution:** Increase gas budget in `hardhat.config.js`:
```javascript
gasPrice: ethers.parseUnits("50", "gwei")
```

### "DEX pair not recognized"
**Solution:** Make sure Uniswap pair address is correct:
- Get from Uniswap UI or call `factory.getPair(HACK, WETH)`
- Verify it starts with `0x` and is 42 characters

### "Uniswap: INSUFFICIENT_OUTPUT_AMOUNT" (on buyTokens task)
**Solution:** Slippage is too tight. Add `--amount` with a larger ETH value, or ensure the LP has
enough liquidity. The `buyTokens` task uses `amountOutMin = 0` so this should not occur unless
the router itself reverts for another reason (e.g. pair not yet created).

### "deployUniswapLP.js: Insufficient HACK balance"
**Solution:** 
- The deployer address must hold HACK tokens. The `LIQUIDITY_WALLET` in the deploy script
  receives 50% of supply — use that wallet as deployer, or transfer tokens first.
- Lower `HACK_LIQUIDITY` in `.env` to match your available balance.

### "TRANSFER_FROM_FAILED" or "ERC20: transfer amount exceeds balance"
**Solution:** The wallet running the LP script doesn't have enough tokens.
Run `scripts/testFeatures.js` first to check balances.

---

## Mainnet Launch (Future)

When ready for mainnet:
1. Repeat all steps above on `--network mainnet`
2. Ensure you have real ETH (not Sepolia ETH)
3. Consider professional audit before mainnet
4. Have larger liquidity pool (~$10k+)

---

**Questions?** Check `docs/SETUP.md` or `docs/TOKENOMICS.md`

**Ready?** Let's go! 🚀
