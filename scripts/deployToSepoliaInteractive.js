/**
 * Interactive Sepolia Deployment Script
 *
 * Guides the user through deploying the Hacker token to Sepolia testnet step-by-step.
 * Prompts for missing environment variables, validates wallet balance, shows a
 * deployment summary, and saves the result to deployments/sepolia_<timestamp>.json.
 *
 * Usage:
 *   npm run deploy-sepolia-interactive
 *   OR
 *   node scripts/deployToSepoliaInteractive.js
 */

require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// ── helpers ─────────────────────────────────────────────────────────────────

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function isValidAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function isValidPrivateKey(key) {
  const stripped = key.startsWith("0x") ? key.slice(2) : key;
  return /^[0-9a-fA-F]{64}$/.test(stripped);
}

function separator() {
  console.log("\n" + "─".repeat(60) + "\n");
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║      🚀  Hacker Token – Sepolia Interactive Deployer     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  separator();

  // ── Step 1: Collect environment variables ─────────────────────────────────

  console.log("📝  Step 1/5 – Environment Variables\n");

  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.log(
      "⚠️  DEPLOYER_PRIVATE_KEY is not set. Enter it now (input is hidden in .env)."
    );
    const key = await prompt("   Deployer private key (no 0x prefix): ");
    if (!isValidPrivateKey(key)) {
      throw new Error("Invalid private key format – must be 64 hex characters.");
    }
    process.env.DEPLOYER_PRIVATE_KEY = key;
  }

  if (!process.env.SEPOLIA_RPC_URL) {
    console.log("\n⚠️  SEPOLIA_RPC_URL is not set.");
    console.log(
      "   Get a free endpoint at https://www.alchemy.com or https://infura.io"
    );
    const rpc = await prompt("   Sepolia RPC URL: ");
    if (!rpc.startsWith("http")) {
      throw new Error("RPC URL must start with http:// or https://");
    }
    process.env.SEPOLIA_RPC_URL = rpc;
  }

  for (const [envVar, label] of [
    ["MARKETING_WALLET", "Marketing wallet address"],
    ["TEAM_WALLET", "Team wallet address"],
    ["LIQUIDITY_WALLET", "Liquidity wallet address"],
  ]) {
    if (!process.env[envVar]) {
      console.log(`\n⚠️  ${envVar} is not set.`);
      const addr = await prompt(`   ${label}: `);
      if (!isValidAddress(addr)) {
        throw new Error(`Invalid Ethereum address for ${envVar}: ${addr}`);
      }
      process.env[envVar] = addr;
    } else if (!isValidAddress(process.env[envVar])) {
      throw new Error(
        `${envVar} in your .env is not a valid Ethereum address: ${process.env[envVar]}`
      );
    }
  }

  const marketingWallet = process.env.MARKETING_WALLET;
  const teamWallet = process.env.TEAM_WALLET;
  const liquidityWallet = process.env.LIQUIDITY_WALLET;

  console.log("\n✅  All environment variables collected.");

  // ── Step 2: Validate wallet balance ───────────────────────────────────────

  separator();
  console.log("💰  Step 2/5 – Wallet Balance Check\n");

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const balanceETH = parseFloat(ethers.formatEther(balance));

  console.log(`   Deployer address : ${deployer.address}`);
  console.log(`   Sepolia ETH      : ${balanceETH.toFixed(6)} ETH`);

  const MIN_ETH = 0.01;
  if (balanceETH < MIN_ETH) {
    console.log(
      `\n❌  Insufficient balance. You need at least ${MIN_ETH} ETH.`
    );
    console.log("   Free faucets:");
    console.log("     • https://sepoliafaucet.com");
    console.log("     • https://faucets.chain.link/sepolia");
    console.log("     • https://www.alchemy.com/faucets/ethereum-sepolia");
    throw new Error("Insufficient Sepolia ETH – add funds and try again.");
  }

  console.log(`\n✅  Balance is sufficient for deployment.`);

  // ── Step 3: Deployment summary ────────────────────────────────────────────

  separator();
  console.log("📋  Step 3/5 – Deployment Summary\n");

  // Estimate gas
  const Hacker = await ethers.getContractFactory("Hacker");
  const deployTx = await Hacker.getDeployTransaction(
    marketingWallet,
    teamWallet,
    liquidityWallet
  );
  const gasEstimate = await ethers.provider.estimateGas({
    ...deployTx,
    from: deployer.address,
  });
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
  const estimatedCostWei = gasEstimate * gasPrice;
  const estimatedCostETH = parseFloat(ethers.formatEther(estimatedCostWei));

  console.log("   Contract        : Hacker (HACK) – 1 000 000 000 000 supply");
  console.log(`   Network         : Sepolia Testnet`);
  console.log(`   Deployer        : ${deployer.address}`);
  console.log(`   Marketing wallet: ${marketingWallet}`);
  console.log(`   Team wallet     : ${teamWallet}`);
  console.log(`   Liquidity wallet: ${liquidityWallet}`);
  console.log(`   Gas estimate    : ${gasEstimate.toLocaleString()} units`);
  console.log(
    `   Estimated cost  : ~${estimatedCostETH.toFixed(6)} ETH (at current gas price)`
  );

  separator();
  const confirm = await prompt("❓  Deploy now? (yes/no): ");
  if (confirm.toLowerCase() !== "yes") {
    console.log("\n⛔  Deployment cancelled by user.");
    process.exit(0);
  }

  // ── Step 4: Deploy ────────────────────────────────────────────────────────

  separator();
  console.log("🔄  Step 4/5 – Deploying Contract…\n");

  const hacker = await Hacker.deploy(marketingWallet, teamWallet, liquidityWallet);

  console.log(`   Transaction hash: ${hacker.deploymentTransaction().hash}`);
  console.log(
    "   ⏳  Waiting for confirmation (this may take 15–60 seconds)…"
  );

  await hacker.waitForDeployment();

  const contractAddress = await hacker.getAddress();
  const receipt = await ethers.provider.getTransactionReceipt(
    hacker.deploymentTransaction().hash
  );

  console.log(`\n✅  Contract deployed!`);
  console.log(`   Contract address: ${contractAddress}`);
  console.log(`   Block number    : ${receipt.blockNumber}`);
  console.log(
    `   Gas used        : ${receipt.gasUsed.toLocaleString()} units`
  );
  console.log(
    `   Actual cost     : ${parseFloat(
      ethers.formatEther(receipt.gasUsed * receipt.gasPrice)
    ).toFixed(6)} ETH`
  );

  // ── Step 5: Save deployment record ───────────────────────────────────────

  separator();
  console.log("💾  Step 5/5 – Saving Deployment Record…\n");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const outputFile = path.join(deploymentsDir, `sepolia_${timestamp}.json`);

  const deploymentInfo = {
    network: "sepolia",
    contractAddress,
    deployerAddress: deployer.address,
    marketingWallet,
    teamWallet,
    liquidityWallet,
    transactionHash: hacker.deploymentTransaction().hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(outputFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`   Saved to: ${outputFile}`);

  // ── Next steps ────────────────────────────────────────────────────────────

  separator();
  console.log("🎉  Deployment Complete!\n");
  console.log("   Contract address: " + contractAddress);
  console.log(
    "   Etherscan      : https://sepolia.etherscan.io/address/" +
      contractAddress
  );
  console.log("\n📌  Next Steps:\n");
  console.log(
    "   1. Verify contract source code on Etherscan:\n" +
      "        npm run verify\n"
  );
  console.log(
    "   2. Create a Uniswap V2 LP at https://app.uniswap.org (Sepolia)\n" +
      "        Pair: HACK / WETH (0xfFf9976782d46CC05630D06953f7751f7DA935e0)\n"
  );
  console.log(
    "   3. Set the DEX pair address in the contract:\n" +
      "        Etherscan → Write Contract → setDexPair(<PAIR_ADDRESS>)\n"
  );
  console.log(
    "   4. Run the full test suite:\n" + "        npm test\n"
  );
  console.log(
    "   5. Follow SEPOLIA_TEST_GUIDE.md to verify all features."
  );
  separator();
}

main().catch((err) => {
  console.error("\n❌  Deployment failed:", err.message || err);
  process.exitCode = 1;
});
