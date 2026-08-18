const { run } = require("hardhat");

/**
 * Verify the Hacker token contract on Etherscan.
 *
 * Required environment variables (same as deploy.js):
 *   DEPLOYED_ADDRESS   – contract address to verify
 *   MARKETING_WALLET
 *   TEAM_WALLET
 *   LIQUIDITY_WALLET
 *   ETHERSCAN_API_KEY  – set in hardhat.config.js
 *
 * Usage:
 *   DEPLOYED_ADDRESS=0x... npx hardhat run scripts/verify.js --network sepolia
 */
async function main() {
  const contractAddress = process.env.DEPLOYED_ADDRESS;
  const marketingWallet = process.env.MARKETING_WALLET;
  const teamWallet = process.env.TEAM_WALLET;
  const liquidityWallet = process.env.LIQUIDITY_WALLET;

  if (!contractAddress) throw new Error("Set DEPLOYED_ADDRESS");
  if (!marketingWallet || !teamWallet || !liquidityWallet) {
    throw new Error("Set MARKETING_WALLET, TEAM_WALLET, LIQUIDITY_WALLET");
  }

  console.log("Verifying contract at", contractAddress, "...");

  await run("verify:verify", {
    address: contractAddress,
    constructorArguments: [marketingWallet, teamWallet, liquidityWallet],
  });

  console.log("Contract verified successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
