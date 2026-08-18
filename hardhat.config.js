require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const {
  DEPLOYER_PRIVATE_KEY,
  SEPOLIA_RPC_URL,
  MAINNET_RPC_URL,
  ETHERSCAN_API_KEY,
  COINMARKETCAP_API_KEY,
} = process.env;

// ── Hardhat Tasks ──────────────────────────────────────────────────────────

task("setDexPair", "Register the Uniswap pair address with the Hacker contract")
  .addParam("pair", "Uniswap V2 pair address (0x...)")
  .setAction(async ({ pair }, hre) => {
    const hackAddress = process.env.HACK_ADDRESS;
    if (!hackAddress) throw new Error("Set HACK_ADDRESS in your .env file");
    const hacker = await hre.ethers.getContractAt("Hacker", hackAddress);
    const tx = await hacker.setDexPair(pair);
    await tx.wait();
    console.log(`✅ DEX pair set to ${pair}  (tx: ${tx.hash})`);
  });

task("buyTokens", "Buy HACK tokens via the Uniswap V2 Router (ETH → HACK)")
  .addParam("amount", "Amount of ETH to spend (in ether, e.g. 0.01)")
  .setAction(async ({ amount }, hre) => {
    const hackAddress    = process.env.HACK_ADDRESS;
    const routerAddress  = process.env.UNISWAP_ROUTER || "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";
    const wethAddress    = process.env.WETH_SEPOLIA    || "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
    if (!hackAddress) throw new Error("Set HACK_ADDRESS in your .env file");

    const [signer] = await hre.ethers.getSigners();
    const router = new hre.ethers.Contract(routerAddress, [
      "function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) external payable returns (uint[] amounts)",
    ], signer);

    const ethAmount = hre.ethers.parseEther(amount);
    const deadline  = Math.floor(Date.now() / 1000) + 30 * 60;
    const path      = [wethAddress, hackAddress];

    const hackBefore = await (new hre.ethers.Contract(hackAddress, [
      "function balanceOf(address) view returns (uint256)",
    ], signer)).balanceOf(signer.address);

    const tx = await router.swapExactETHForTokens(0, path, signer.address, deadline, { value: ethAmount });
    await tx.wait();

    const hackAfter = await (new hre.ethers.Contract(hackAddress, [
      "function balanceOf(address) view returns (uint256)",
    ], signer)).balanceOf(signer.address);

    console.log(`✅ Bought ${hre.ethers.formatEther(hackAfter - hackBefore)} HACK for ${amount} ETH (tx: ${tx.hash})`);
  });

task("testTax", "Quick tax sanity check — reads current tax rates from the contract")
  .setAction(async (_args, hre) => {
    const hackAddress = process.env.HACK_ADDRESS;
    if (!hackAddress) throw new Error("Set HACK_ADDRESS in your .env file");
    const hacker = await hre.ethers.getContractAt("Hacker", hackAddress);
    const [buyLiq, buyMkt, buyBurn, sellLiq, sellMkt, sellBurn, dexPair] = await Promise.all([
      hacker.buyLiquidityBps(),
      hacker.buyMarketingBps(),
      hacker.buyBurnBps(),
      hacker.sellLiquidityBps(),
      hacker.sellMarketingBps(),
      hacker.sellBurnBps(),
      hacker.dexPair(),
    ]);
    const totalBuy  = buyLiq  + buyMkt  + buyBurn;
    const totalSell = sellLiq + sellMkt + sellBurn;
    console.log(`DEX pair:  ${dexPair}`);
    console.log(`Buy  tax:  ${totalBuy} bps  (liq=${buyLiq}  mkt=${buyMkt}  burn=${buyBurn})`);
    console.log(`Sell tax:  ${totalSell} bps  (liq=${sellLiq}  mkt=${sellMkt}  burn=${sellBurn})`);
    console.log(totalBuy <= 1000n && totalSell <= 1500n ? "✅ Tax rates within expected bounds" : "⚠️  Tax rates out of expected bounds");
  });

task("pauseToken", "Emergency-pause all HACK transfers (owner only)")
  .setAction(async (_args, hre) => {
    const hackAddress = process.env.HACK_ADDRESS;
    if (!hackAddress) throw new Error("Set HACK_ADDRESS in your .env file");
    const hacker = await hre.ethers.getContractAt("Hacker", hackAddress);
    if (typeof hacker.pause !== "function") {
      console.log("⚠️  This contract version does not have a pause() function.");
      return;
    }
    const tx = await hacker.pause();
    await tx.wait();
    console.log(`✅ Token paused (tx: ${tx.hash})`);
  });

task("unpauseToken", "Unpause HACK transfers (owner only)")
  .setAction(async (_args, hre) => {
    const hackAddress = process.env.HACK_ADDRESS;
    if (!hackAddress) throw new Error("Set HACK_ADDRESS in your .env file");
    const hacker = await hre.ethers.getContractAt("Hacker", hackAddress);
    if (typeof hacker.unpause !== "function") {
      console.log("⚠️  This contract version does not have an unpause() function.");
      return;
    }
    const tx = await hacker.unpause();
    await tx.wait();
    console.log(`✅ Token unpaused (tx: ${tx.hash})`);
  });

// Use a dummy key if not set (allows compiling without a .env file)
const accounts = DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: SEPOLIA_RPC_URL || "",
      accounts,
    },
    mainnet: {
      url: MAINNET_RPC_URL || "",
      accounts,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    coinmarketcap: COINMARKETCAP_API_KEY || "",
  },
};
