/**
 * deployUniswapLP.js
 *
 * Deploys a Uniswap V2 liquidity pool for the Hacker token on Sepolia.
 *
 * Required environment variables:
 *   HACK_ADDRESS       – Deployed Hacker token address
 *   WETH_SEPOLIA       – Wrapped ETH address on Sepolia (default provided)
 *   UNISWAP_ROUTER     – Uniswap V2 Router02 address (default provided)
 *   HACK_LIQUIDITY     – Amount of HACK tokens to add (in full tokens, e.g. "500000000000")
 *   ETH_LIQUIDITY      – Amount of ETH to add (in ether, e.g. "0.5")
 *
 * Usage:
 *   npx hardhat run scripts/deployUniswapLP.js --network sepolia
 */
const { ethers } = require("hardhat");

// Sepolia defaults
const WETH_SEPOLIA_DEFAULT    = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
const UNISWAP_ROUTER_DEFAULT  = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008"; // Uniswap V2 Router02 Sepolia

// Minimal ABI slices we need
const ROUTER_ABI = [
  "function factory() external pure returns (address)",
  "function WETH() external pure returns (address)",
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)",
];

const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
  "function createPair(address tokenA, address tokenB) external returns (address pair)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const hackAddress    = process.env.HACK_ADDRESS;
  const wethAddress    = process.env.WETH_SEPOLIA    || WETH_SEPOLIA_DEFAULT;
  const routerAddress  = process.env.UNISWAP_ROUTER  || UNISWAP_ROUTER_DEFAULT;
  const hackLiquidity  = process.env.HACK_LIQUIDITY;
  const ethLiquidity   = process.env.ETH_LIQUIDITY;

  if (!hackAddress)   throw new Error("Set HACK_ADDRESS in your .env file");
  if (!hackLiquidity) throw new Error("Set HACK_LIQUIDITY in your .env file (e.g. 500000000000)");
  if (!ethLiquidity)  throw new Error("Set ETH_LIQUIDITY in your .env file (e.g. 0.5)");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:       ", deployer.address);
  console.log("ETH balance:    ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("HACK address:   ", hackAddress);
  console.log("WETH address:   ", wethAddress);
  console.log("Router address: ", routerAddress);
  console.log("HACK liquidity: ", hackLiquidity, "tokens");
  console.log("ETH liquidity:  ", ethLiquidity, "ETH\n");

  const hack    = new ethers.Contract(hackAddress, ERC20_ABI, deployer);
  const router  = new ethers.Contract(routerAddress, ROUTER_ABI, deployer);
  const factory = new ethers.Contract(await router.factory(), FACTORY_ABI, deployer);

  const decimals    = await hack.decimals();
  const hackAmount  = ethers.parseUnits(hackLiquidity, decimals);
  const ethAmount   = ethers.parseEther(ethLiquidity);

  // --- Balance checks ---
  const hackBalance = await hack.balanceOf(deployer.address);
  if (hackBalance < hackAmount) {
    throw new Error(
      `Insufficient HACK balance. Have ${ethers.formatUnits(hackBalance, decimals)}, need ${hackLiquidity}`
    );
  }
  const ethBalance = await ethers.provider.getBalance(deployer.address);
  if (ethBalance < ethAmount) {
    throw new Error(
      `Insufficient ETH balance. Have ${ethers.formatEther(ethBalance)}, need ${ethLiquidity}`
    );
  }

  // --- Approve router to spend HACK ---
  console.log("Approving Router to spend HACK…");
  const approveTx = await hack.approve(routerAddress, hackAmount);
  await approveTx.wait();
  console.log("  Approved. TX:", approveTx.hash);

  // --- Add liquidity ---
  const deadline = Math.floor(Date.now() / 1000) + 30 * 60; // 30 min
  // Accept up to 5% slippage
  const hackAmountMin = (hackAmount * 95n) / 100n;
  const ethAmountMin  = (ethAmount  * 95n) / 100n;

  console.log("\nAdding liquidity…");
  const addLiqTx = await router.addLiquidityETH(
    hackAddress,
    hackAmount,
    hackAmountMin,
    ethAmountMin,
    deployer.address,
    deadline,
    { value: ethAmount }
  );
  const receipt = await addLiqTx.wait();
  console.log("  Liquidity added. TX:", addLiqTx.hash);

  // --- Pair address ---
  const pairAddress = await factory.getPair(hackAddress, wethAddress);
  console.log("\n✅ Results:");
  console.log("  Pair address (set as DEX pair): ", pairAddress);
  console.log("  LP token address:               ", pairAddress, "(same as pair for Uni V2)");
  console.log("  Gas used:", receipt.gasUsed.toString());

  // --- Token balances after ---
  console.log("\nPost-liquidity balances:");
  console.log("  Deployer HACK:", ethers.formatUnits(await hack.balanceOf(deployer.address), decimals));
  console.log("  Deployer ETH: ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  console.log("\nNext step: register the pair with the contract:");
  console.log(`  npx hardhat setDexPair --pair ${pairAddress} --network sepolia`);
  console.log("  Or call: hacker.setDexPair('" + pairAddress + "')");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
