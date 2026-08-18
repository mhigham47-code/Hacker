const { ethers } = require("hardhat");

/**
 * Deploy Hacker token to a network.
 *
 * Required environment variables:
 *   MARKETING_WALLET  – address receiving the marketing allocation
 *   TEAM_WALLET       – address that will receive vested team tokens
 *   LIQUIDITY_WALLET  – address receiving the LP allocation (lock externally after deploy)
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network sepolia
 *   npx hardhat run scripts/deploy.js --network mainnet
 */
async function main() {
  const marketingWallet = process.env.MARKETING_WALLET;
  const teamWallet = process.env.TEAM_WALLET;
  const liquidityWallet = process.env.LIQUIDITY_WALLET;

  if (!marketingWallet || !teamWallet || !liquidityWallet) {
    throw new Error(
      "Set MARKETING_WALLET, TEAM_WALLET, and LIQUIDITY_WALLET in your .env file"
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log(
    "Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  const Hacker = await ethers.getContractFactory("Hacker");
  const hacker = await Hacker.deploy(marketingWallet, teamWallet, liquidityWallet);
  await hacker.waitForDeployment();

  const address = await hacker.getAddress();
  console.log("Hacker token deployed to:", address);
  console.log("Marketing wallet:", marketingWallet);
  console.log("Team wallet:", teamWallet);
  console.log("Liquidity wallet:", liquidityWallet);

  console.log("\nNext steps:");
  console.log("  1. Verify: npx hardhat run scripts/verify.js --network <network>");
  console.log("  2. Set the DEX pair: call setDexPair(<uniswap_pair_address>)");
  console.log("  3. Lock liquidity externally (e.g. Unicrypt)");
  console.log("  4. Renounce ownership when ready: call renounceOwnership()");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
