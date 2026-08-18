/**
 * Sepolia Quick Setup Verification Script
 *
 * Checks that everything is ready before deploying the Hacker token to Sepolia:
 *   - .env file exists and contains all required variables
 *   - RPC endpoint is reachable and points to Sepolia (chain ID 11155111)
 *   - Deployer wallet has enough Sepolia ETH
 *
 * Usage:
 *   npm run verify-sepolia-setup
 *   OR
 *   node scripts/verifySepoliaSetup.js
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// ── helpers ─────────────────────────────────────────────────────────────────

function ok(msg) {
  console.log(`  ✅  ${msg}`);
}

function warn(msg) {
  console.log(`  ⚠️   ${msg}`);
}

function fail(msg) {
  console.log(`  ❌  ${msg}`);
}

function info(msg) {
  console.log(`       ${msg}`);
}

function separator() {
  console.log("\n" + "─".repeat(60) + "\n");
}

function isValidAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function isValidPrivateKey(key) {
  const stripped = key.startsWith("0x") ? key.slice(2) : key;
  return /^[0-9a-fA-F]{64}$/.test(stripped);
}

/** Simple JSON-RPC call over HTTP/HTTPS without any npm dependencies. */
function rpcCall(rpcUrl, method, params = []) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    });

    const url = new URL(rpcUrl);
    const lib = url.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error("Invalid JSON response from RPC"));
          }
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error("RPC request timed out after 10 s"));
    });
    req.write(body);
    req.end();
  });
}

// ── checks ──────────────────────────────────────────────────────────────────

function checkEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    ok(".env file found");
    return true;
  }
  fail(".env file not found");
  info("Fix: run  cp .env.example .env  then fill in your values");
  return false;
}

function checkEnvVariables() {
  const required = [
    {
      key: "DEPLOYER_PRIVATE_KEY",
      label: "Deployer private key",
      validate: isValidPrivateKey,
      hint: "64 hex characters (no 0x prefix)",
    },
    {
      key: "SEPOLIA_RPC_URL",
      label: "Sepolia RPC URL",
      validate: (v) => v.startsWith("http"),
      hint: "Get a free key at https://www.alchemy.com or https://infura.io",
    },
    {
      key: "MARKETING_WALLET",
      label: "Marketing wallet",
      validate: isValidAddress,
      hint: "Must be a valid 0x... Ethereum address",
    },
    {
      key: "TEAM_WALLET",
      label: "Team wallet",
      validate: isValidAddress,
      hint: "Must be a valid 0x... Ethereum address",
    },
    {
      key: "LIQUIDITY_WALLET",
      label: "Liquidity wallet",
      validate: isValidAddress,
      hint: "Must be a valid 0x... Ethereum address",
    },
  ];

  const optional = [
    { key: "ETHERSCAN_API_KEY", label: "Etherscan API key (for verification)" },
  ];

  let allOk = true;

  for (const { key, label, validate, hint } of required) {
    const value = process.env[key];
    if (!value || value.includes("your_") || value.includes("YOUR_")) {
      fail(`${label} (${key}) is not set`);
      info(`Fix: ${hint}`);
      allOk = false;
    } else if (validate && !validate(value)) {
      fail(`${label} (${key}) has an invalid format`);
      info(`Fix: ${hint}`);
      allOk = false;
    } else {
      const display =
        key === "DEPLOYER_PRIVATE_KEY" ? "****…****" : value;
      ok(`${label}: ${display}`);
    }
  }

  for (const { key, label } of optional) {
    const value = process.env[key];
    if (!value || value.includes("your_") || value.includes("YOUR_")) {
      warn(`${label} (${key}) is not set – contract verification will fail`);
      info("Fix: get a free key at https://etherscan.io/register");
    } else {
      ok(`${label} is set`);
    }
  }

  return allOk;
}

async function checkRpcEndpoint(rpcUrl) {
  const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111 in hex

  let result;
  try {
    result = await rpcCall(rpcUrl, "eth_chainId");
  } catch (err) {
    fail(`RPC endpoint unreachable: ${rpcUrl}`);
    info(`Error: ${err.message}`);
    info("Fix: check your SEPOLIA_RPC_URL and internet connection");
    return false;
  }

  if (result.error) {
    fail(`RPC returned an error: ${result.error.message}`);
    return false;
  }

  const chainId = result.result;
  if (chainId !== SEPOLIA_CHAIN_ID) {
    fail(
      `RPC is NOT Sepolia – chain ID ${chainId} (expected ${SEPOLIA_CHAIN_ID})`
    );
    info(
      "Fix: use a Sepolia-specific URL, e.g. https://sepolia.infura.io/v3/YOUR_KEY"
    );
    return false;
  }

  ok(`RPC endpoint is reachable and on Sepolia (chain ID ${chainId})`);
  return true;
}

async function checkWalletBalance(rpcUrl, privateKey) {
  // Derive public address from private key (secp256k1)
  // We use a lightweight approach: call eth_accounts won't work on public nodes,
  // so we compute the address ourselves.
  let address;
  try {
    // Node.js built-in crypto for secp256k1 is available from v15 via subtle API,
    // but ethers is already a project dependency – we import it dynamically.
    const { ethers } = require("ethers");
    const stripped = privateKey.startsWith("0x") ? privateKey : "0x" + privateKey;
    const wallet = new ethers.Wallet(stripped);
    address = wallet.address;
  } catch {
    warn("Could not derive address from DEPLOYER_PRIVATE_KEY – skipping balance check");
    return true;
  }

  let result;
  try {
    result = await rpcCall(rpcUrl, "eth_getBalance", [address, "latest"]);
  } catch (err) {
    warn(`Balance check failed: ${err.message}`);
    return true; // non-fatal – RPC check already passed
  }

  if (result.error) {
    warn(`Balance RPC error: ${result.error.message}`);
    return true;
  }

  const balanceWei = BigInt(result.result);
  const balanceETH = Number(balanceWei) / 1e18;
  const MIN_ETH = 0.01;

  if (balanceETH < MIN_ETH) {
    fail(
      `Deployer ${address} has only ${balanceETH.toFixed(6)} ETH ` +
        `(minimum ${MIN_ETH} ETH required)`
    );
    info("Fix: get free Sepolia ETH from:");
    info("  • https://sepoliafaucet.com");
    info("  • https://faucets.chain.link/sepolia");
    info("  • https://www.alchemy.com/faucets/ethereum-sepolia");
    return false;
  }

  ok(
    `Deployer ${address} has ${balanceETH.toFixed(6)} ETH ` +
      "(sufficient for deployment)"
  );
  return true;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       🔍  Hacker Token – Sepolia Setup Verifier          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  separator();

  const results = [];

  // 1. .env file
  console.log("📄  Check 1/4 – .env File\n");
  results.push(checkEnvFile());

  // 2. Environment variables
  separator();
  console.log("🔑  Check 2/4 – Environment Variables\n");
  results.push(checkEnvVariables());

  // 3. RPC endpoint
  separator();
  console.log("🌐  Check 3/4 – RPC Endpoint\n");
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (rpcUrl && !rpcUrl.includes("YOUR_")) {
    results.push(await checkRpcEndpoint(rpcUrl));
  } else {
    fail("SEPOLIA_RPC_URL is not set – skipping RPC check");
    results.push(false);
  }

  // 4. Wallet balance
  separator();
  console.log("💰  Check 4/4 – Wallet Balance\n");
  const privKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (
    privKey &&
    !privKey.includes("your_") &&
    rpcUrl &&
    !rpcUrl.includes("YOUR_")
  ) {
    results.push(await checkWalletBalance(rpcUrl, privKey));
  } else {
    warn("Skipping balance check – DEPLOYER_PRIVATE_KEY or SEPOLIA_RPC_URL not set");
    results.push(true);
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  separator();
  const passed = results.filter(Boolean).length;
  const total = results.length;

  if (passed === total) {
    console.log(`✅  All ${total} checks passed – you are ready to deploy!\n`);
    console.log("   Run:  npm run deploy-sepolia-interactive");
  } else {
    console.log(
      `⚠️   ${passed}/${total} checks passed – fix the issues above then re-run:\n`
    );
    console.log("   npm run verify-sepolia-setup");
  }
  separator();

  process.exitCode = passed === total ? 0 : 1;
}

main().catch((err) => {
  console.error("\n❌  Verifier failed:", err.message || err);
  process.exitCode = 1;
});
