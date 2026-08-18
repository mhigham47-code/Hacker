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

1. **Go to Uniswap V2** (Sepolia): https://app.uniswap.org/
2. **Add Liquidity:**
   - Token A: HACK (your deployed address)
   - Token B: WETH (Sepolia wrapped ETH)
   - Amount: 50% of HACK + equivalent WETH
   - Set slippage: 5-10%
3. **Get LP Token Address** - Save this for next step

### Set DEX Pair in Contract

```bash
# Use Etherscan write interface or web3.py
npx hardhat --network sepolia \
  run -c "const h = await ethers.getContractAt('Hacker', '0x...'); \
  await h.setDexPair('0x<uniswap_pair_address>')"
```

**Why?** The contract won't apply tax/limits until it knows the DEX pair address.

### Lock Liquidity (Optional but Recommended)

Use external locker like:
- **Unicrypt** (https://app.uncx.network/locks/uniswap_v2/create)
- **Team Finance** (https://www.teamfinance.io/)

Then call:
```bash
npx hardhat --network sepolia \
  run -c "const h = await ethers.getContractAt('Hacker', '0x...'); \
  await h.setLiquidityLockUntil(Math.floor(Date.now()/1000) + 365*24*60*60)"
```

### Renounce Ownership (Final Step)
```bash
npx hardhat --network sepolia \
  run -c "const h = await ethers.getContractAt('Hacker', '0x...'); \
  await h.renounceOwnership()"
```

**⚠️ WARNING:** This is irreversible! You lose all admin powers. Only do after confirming everything works.

---

## Testing Before Mainnet

### 1. Test Tax Collection
- Buy 1000 HACK on Uniswap → Verify 5% buy tax applied
- Sell 1000 HACK on Uniswap → Verify 8% sell tax applied
- Direct transfer (wallet→wallet) → Verify NO tax

### 2. Test Anti-Whale
- Try to buy more than 0.5% supply in one tx → Should fail
- Try to buy so wallet > 1% → Should fail
- Call `removeLimits()` as owner → Limits removed

### 3. Test Emergency Controls
- Call `pause()` as owner → All transfers blocked
- Try to transfer → Should fail
- Call `unpause()` → Transfers work again

### 4. Test Vesting
- Wait for blocks to pass or use Hardhat time travel
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
