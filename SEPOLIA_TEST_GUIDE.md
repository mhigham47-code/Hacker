# 🧪 Hacker Token - Sepolia Testnet Testing Guide

Complete step-by-step guide to test all Hacker token features on Sepolia before mainnet launch.

---

## **Phase 1: Pre-Deployment Setup** ⚙️

### Step 1.1: Get Sepolia ETH
You need ~1-2 Sepolia ETH for deployment + gas.

**Free Faucets:**
- [Sepolia Faucet](https://sepoliafaucet.com) - Get 0.05 ETH instantly
- [Chainlink Faucet](https://faucets.chain.link/sepolia) - Get 0.1 ETH
- [Alchemy Faucet](https://www.alchemy.com/faucets/ethereum-sepolia) - Requires signup

**Verify you have Sepolia ETH:**
```bash
# Replace YOUR_ADDRESS with your wallet address
curl -s https://sepolia.infura.io/v3/YOUR_INFURA_KEY \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"eth_getBalance",
    "params":["YOUR_ADDRESS","latest"],
    "id":1
  }' | jq .result
```

### Step 1.2: Setup .env File

```bash
# Copy template
cp .env.example .env

# Edit .env with these values:
DEPLOYER_PRIVATE_KEY=your_private_key_here        # No leading 0x
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
MARKETING_WALLET=0x...  # Your wallet or test wallet
TEAM_WALLET=0x...       # Your wallet or test wallet
LIQUIDITY_WALLET=0x...  # Your wallet or test wallet
ETHERSCAN_API_KEY=your_etherscan_api_key_here
WETH_SEPOLIA=0xfFf9976782d46CC05630D06953f7751f7DA935e0  # Sepolia WETH
UNISWAP_ROUTER_SEPOLIA=0xE592427A0AEce92De3Edee1F18E0157C05861564  # Uniswap V3 Router
```

**Important:** 
- Keep `.env` secure - never commit it
- Test wallets should have 0.5-1 Sepolia ETH each
- All wallets can be the same address for testing

### Step 1.3: Verify Setup

```bash
npm install
npm run compile
```

Expected: Contract compiles with 0 errors

---

## **Phase 2: Deploy Contract** 🚀

### Step 2.0: Verify Your Setup (Recommended)

Before deploying, confirm everything is configured correctly:

```bash
npm run verify-sepolia-setup
```

**Expected output (all green):**
```
✅  .env file found
✅  Deployer private key is set
✅  Sepolia RPC URL: https://...
✅  Marketing wallet: 0x...
✅  Team wallet: 0x...
✅  Liquidity wallet: 0x...
✅  RPC endpoint is reachable and on Sepolia (chain ID 0xaa36a7)
✅  Deployer 0x... has 0.123456 ETH (sufficient for deployment)

✅  All 4 checks passed – you are ready to deploy!
```

If any check fails, the script explains the fix inline.

### Step 2.1: Interactive Deployment (Recommended)

The interactive deployer guides you step-by-step, estimates gas costs, and asks for confirmation before spending any ETH:

```bash
npm run deploy-sepolia-interactive
```

**What it does:**
1. 📝 Prompts for any missing environment variables
2. 💰 Verifies deployer has sufficient Sepolia ETH
3. 📋 Shows deployment summary + estimated gas cost
4. ❓ Asks for confirmation before proceeding
5. 🔄 Deploys with real-time progress indicators
6. 💾 Saves deployment info to `deployments/sepolia_<timestamp>.json`
7. 📌 Displays transaction hash and next steps

**Sample output:**
```
╔══════════════════════════════════════════════════════════╗
║      🚀  Hacker Token – Sepolia Interactive Deployer     ║
╚══════════════════════════════════════════════════════════╝

📝  Step 1/5 – Environment Variables
✅  All environment variables collected.

💰  Step 2/5 – Wallet Balance Check
   Deployer address : 0xYourAddress
   Sepolia ETH      : 0.123456 ETH
✅  Balance is sufficient for deployment.

📋  Step 3/5 – Deployment Summary
   Contract        : Hacker (HACK) – 1 000 000 000 000 supply
   Network         : Sepolia Testnet
   Deployer        : 0xYourAddress
   Gas estimate    : 2,500,000 units
   Estimated cost  : ~0.005000 ETH (at current gas price)

❓  Deploy now? (yes/no): yes

🔄  Step 4/5 – Deploying Contract…
   Transaction hash: 0x...
   ⏳  Waiting for confirmation…
✅  Contract deployed!
   Contract address: 0x<CONTRACT_ADDRESS>
   Block number    : 12345678

💾  Step 5/5 – Saving Deployment Record…
   Saved to: deployments/sepolia_2024-01-01T00-00-00-000Z.json
```

**Deployment record (`deployments/sepolia_<timestamp>.json`):**
```json
{
  "network": "sepolia",
  "contractAddress": "0x<CONTRACT_ADDRESS>",
  "deployerAddress": "0x...",
  "marketingWallet": "0x...",
  "teamWallet": "0x...",
  "liquidityWallet": "0x...",
  "transactionHash": "0x...",
  "blockNumber": 12345678,
  "gasUsed": "2500000",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**View on Etherscan:**
```
https://sepolia.etherscan.io/tx/<TRANSACTION_HASH>
https://sepolia.etherscan.io/address/<CONTRACT_ADDRESS>
```

### Step 2.2: Standard Deployment (Alternative)

```bash
npm run deploy_sepolia
```

**Expected Output:**
```
Deploying with account: 0x...
Account balance: 0.xxxxx ETH
Hacker token deployed to: 0x<CONTRACT_ADDRESS>
Marketing wallet: 0x...
Team wallet: 0x...
Liquidity wallet: 0x...

Next steps:
  1. Verify: npx hardhat run scripts/verify.js --network sepolia
  2. Set the DEX pair: call setDexPair(<uniswap_pair_address>)
  3. Lock liquidity externally (e.g. Unicrypt)
  4. Renounce ownership when ready: call renounceOwnership()
```

**Save this:** `DEPLOYED_ADDRESS=0x<CONTRACT_ADDRESS>`

### Step 2.2: Verify on Etherscan

```bash
# Add to .env
DEPLOYED_ADDRESS=0x<CONTRACT_ADDRESS>

# Verify
npm run verify
```

Expected: Contract verified on Etherscan with full source code visible.

**Check:** Go to `https://sepolia.etherscan.io/address/0x<CONTRACT_ADDRESS>` and verify you can see the code.

---

## **Phase 3: Create Uniswap Liquidity Pool** 💧

### Step 3.1: Prepare Tokens

Your contract deployed with these allocations:
- 50% → Liquidity Wallet (500B HACK)
- 20% → Marketing Wallet (200B HACK)
- 15% → Contract (Team, locked)
- 10% → Burned
- 5% → Reserve (your wallet)

### Step 3.2: Create LP on Uniswap V2

**Go to:** https://app.uniswap.org/ (make sure network is Sepolia)

1. **Click "Add Liquidity"**
2. **Select Tokens:**
   - Token A: Your HACK address (`0x<CONTRACT_ADDRESS>`)
   - Token B: WETH (Sepolia) - `0xfFf9976782d46CC05630D06953f7751f7DA935e0`
3. **Add Amounts:**
   - HACK: 500,000,000,000 (from liquidity wallet, or smaller amount for testing)
   - WETH: ~5 WETH (or amount equivalent to your testing budget)
4. **Set Slippage:** 5-10%
5. **Create Pool & Approve**

**Save LP Token Address** - You'll need this for testing

### Step 3.3: Set DEX Pair in Contract

Once LP is created, get the pair address:

**Method 1: From Uniswap UI**
- After creating LP, Uniswap shows "Pool Created: 0x..."

**Method 2: Using Etherscan**
```bash
# Go to Uniswap V2 Factory on Sepolia
# https://sepolia.etherscan.io/address/0xB7dcEF7f67e640B58c49a5e9Ff3f7AC6c4B8fbb0#readContract

# Call getPair(HACK_ADDRESS, WETH_ADDRESS) to get pair address
```

**Set Pair in Contract:**

Using Etherscan write interface:
1. Go to `https://sepolia.etherscan.io/address/0x<CONTRACT_ADDRESS>#writeContract`
2. Connect your wallet
3. Find `setDexPair`
4. Enter pair address: `0x<UNISWAP_PAIR_ADDRESS>`
5. Click "Write"

**Verify:** Go to read contract, check `dexPair()` returns your LP address

---

## **Phase 4: Test All Features** 🧪

### Test 4.1: Tax Collection

**Buy Test (5% buy tax):**
```bash
# Buy 1000 HACK on Uniswap V2
# Expected: You receive ~950 HACK (50 HACK = 5% tax)
# Tax split:
#   - 20 HACK → Liquidity Wallet (2%)
#   - 20 HACK → Marketing Wallet (2%)
#   - 10 HACK → Burn Address (1%)
```

**Sell Test (8% sell tax):**
```bash
# Sell 1000 HACK on Uniswap V2
# Expected: You receive WETH for ~920 HACK (80 HACK = 8% tax)
# Tax split:
#   - 30 HACK → Liquidity Wallet (3%)
#   - 30 HACK → Marketing Wallet (3%)
#   - 20 HACK → Burn Address (2%)
```

**Wallet-to-Wallet Transfer (0% tax):**
```bash
# Send 1000 HACK from your wallet to another wallet
# Expected: Recipient receives 1000 HACK (no tax)
```

**Verify on Etherscan:**
- Go to token holders
- Check Marketing Wallet balance increased
- Check Liquidity Wallet balance increased
- Check Dead Address balance increased

### Test 4.2: Anti-Whale Limits

**Max Transaction (0.5% supply = 5B HACK):**
```bash
# Try to buy/sell more than 5,000,000,000 HACK in one transaction
# Expected: Transaction fails with "exceeds max transaction"
```

**Max Wallet (1% supply = 10B HACK):**
```bash
# Buy tokens until your wallet reaches 10B+ HACK
# Expected: Next buy fails with "exceeds max wallet"
```

**Test Removal:**
```bash
# Use Etherscan to call removeLimits()
# Try to buy more than 10B HACK
# Expected: Transaction succeeds (limits removed)
```

### Test 4.3: Emergency Pause

**Pause Token:**
```bash
# Use Etherscan to call pause()
# Try to transfer any HACK tokens
# Expected: "Transfer paused" or similar error
```

**Unpause Token:**
```bash
# Use Etherscan to call unpause()
# Try to transfer HACK tokens again
# Expected: Transfer succeeds
```

### Test 4.4: Blacklist Functionality

**Add Address to Blacklist:**
```bash
# Use Etherscan to call setBlacklist(ADDRESS, true)
# Try to transfer from/to that address
# Expected: "blacklisted" error
```

**Remove from Blacklist:**
```bash
# Use Etherscan to call setBlacklist(ADDRESS, false)
# Try to transfer from/to that address again
# Expected: Transfer succeeds
```

### Test 4.5: Greylist (DEX Restriction Only)

**Add Address to Greylist:**
```bash
# Use Etherscan to call setGreylist(ADDRESS, true)
# Try to SELL tokens on Uniswap (to DEX pair)
# Expected: "greylisted sell blocked" error
# 
# Try to TRANSFER to another wallet directly
# Expected: Transfer succeeds (not blocked)
```

### Test 4.6: Team Token Vesting

**Check Vested Amount:**
```bash
# Use Etherscan to call vestedAmount()
# 0 days: Returns 0
# 6 months: Returns ~7.5B HACK (50% vested)
# 12 months: Returns 150B HACK (100% vested - all team tokens)
```

**Claim Vested Tokens:**
```bash
# After 1 day, call claimTeamTokens()
# Expected: Small amount (~410M HACK) transferred to Team Wallet
# 
# After 12 months, call claimTeamTokens()
# Expected: Remaining tokens (~140B HACK) transferred to Team Wallet
```

### Test 4.7: Tax Rate Adjustments

**Modify Tax Rates:**
```bash
# Use Etherscan to call setTax(100, 100, 50, 200, 200, 100)
# Parameters: buyLiq, buyMkt, buyBurn, sellLiq, sellMkt, sellBurn
# Expected: Tax rates update, next trades use new rates
```

**Verify Tax Update:**
```bash
# Call buyLiquidityBps() → should return 100
# Call buyMarketingBps() → should return 100
# Call buyBurnBps() → should return 50
```

---

## **Phase 5: Generate Test Report** 📊

### Summary Checklist

After completing all tests, fill this out:

```markdown
## Sepolia Test Results

**Date:** [Today's Date]
**Contract Address:** 0x...
**LP Address:** 0x...

### Deployment
- [ ] Contract deployed
- [ ] Contract verified on Etherscan
- [ ] All wallets initialized correctly

### Tax Collection
- [ ] Buy tax (5%) working correctly
- [ ] Sell tax (8%) working correctly
- [ ] Wallet-to-wallet transfer (0% tax)
- [ ] Tax distributed to correct wallets

### Anti-Whale
- [ ] Max transaction limit enforced (0.5%)
- [ ] Max wallet limit enforced (1%)
- [ ] Limits removable by owner
- [ ] DEX pair excluded from wallet limit

### Emergency Controls
- [ ] Token can be paused
- [ ] Transfers blocked when paused
- [ ] Token can be unpaused
- [ ] Transfers work after unpause

### Blacklist/Greylist
- [ ] Blacklist blocks all transfers (sender & recipient)
- [ ] Greylist only blocks DEX trades
- [ ] Greylist allows wallet-to-wallet transfers

### Vesting
- [ ] Vesting accrues over time
- [ ] Team tokens can be claimed
- [ ] Claimed tokens sent to team wallet

### Tax Adjustments
- [ ] Tax rates can be modified
- [ ] New rates take effect immediately
- [ ] Tax caps enforced (10% buy, 15% sell)

### Ready for Mainnet
- [ ] All tests passed
- [ ] Contract behavior as expected
- [ ] No security issues found
- [ ] Documentation complete
```

---

## **Phase 6: Common Issues & Troubleshooting** 🔧

### Issue: "Insufficient gas"
**Solution:** Increase gas limit in transaction settings or wait for lower gas fees

### Issue: "Transaction reverted - HACK amount too high"
**Solution:** You hit anti-whale limit. Try smaller amount or remove limits.

### Issue: "Cannot set DEX pair to zero address"
**Solution:** Make sure pair address is correct and starts with `0x`

### Issue: "Etherscan says contract not verified"
**Solution:** Wait 30 seconds after deployment, then verify. Ensure constructor args match.

### Issue: "No LP pair showing on Uniswap"
**Solution:** 
- Verify you created it on Sepolia (not mainnet)
- Check both tokens are listed correctly
- Refresh Uniswap UI

### Issue: "Tax not being deducted"
**Solution:** 
- Check DEX pair is set correctly
- Verify tax rates are not 0
- Make sure you're doing DEX trade (buy/sell), not wallet transfer

---

## **Phase 7: Sign-Off & Mainnet Prep** ✅

Once all tests pass:

1. **Document Results**
   - Fill out test report above
   - Save screenshots of key transactions
   - Note any adjustments needed

2. **Prepare for Mainnet**
   - Audit contract code one more time
   - Decide on final tokenomics/tax rates
   - Plan liquidity pool size for mainnet
   - Set launch date & marketing plan

3. **Final Deployment**
   - Deploy to mainnet with same contracts
   - Create LP on mainnet Uniswap
   - Launch marketing campaign
   - Monitor contract closely first 24 hours

---

## **Useful Links**

- **Sepolia Etherscan:** https://sepolia.etherscan.io
- **Uniswap V2 Sepolia:** https://app.uniswap.org/
- **Sepolia Faucet:** https://sepoliafaucet.com
- **WETH Sepolia:** `0xfFf9976782d46CC05630D06953f7751f7DA935e0`
- **Uniswap V2 Factory Sepolia:** `0xB7dcEF7f67e640B58c49a5e9Ff3f7AC6c4B8fbb0`
- **Uniswap V2 Router Sepolia:** `0xeE567Fe1712216eF8592339f0B8D6329d7d92444`

---

**Good luck! Your meme coin is going to be amazing! 🚀**

Questions? Check `DEPLOYMENT_CHECKLIST.md` or `docs/SETUP.md`
