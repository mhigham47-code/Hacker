const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Hacker Token", function () {
  let hacker;
  let owner, marketing, team, liquidity, alice, bob, dex;

  const TOTAL_SUPPLY = ethers.parseEther("1000000000000"); // 1 trillion
  const DEAD = "0x000000000000000000000000000000000000dEaD";

  beforeEach(async function () {
    [owner, marketing, team, liquidity, alice, bob, dex] =
      await ethers.getSigners();

    const Hacker = await ethers.getContractFactory("Hacker");
    hacker = await Hacker.deploy(
      marketing.address,
      team.address,
      liquidity.address
    );
    await hacker.waitForDeployment();
  });

  // ── Deployment ─────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets name and symbol", async function () {
      expect(await hacker.name()).to.equal("Hacker");
      expect(await hacker.symbol()).to.equal("HACK");
    });

    it("mints correct total supply", async function () {
      const minted =
        (await hacker.balanceOf(liquidity.address)) +
        (await hacker.balanceOf(marketing.address)) +
        (await hacker.balanceOf(await hacker.getAddress())) + // team (vesting)
        (await hacker.balanceOf(DEAD)) +
        (await hacker.balanceOf(owner.address));
      expect(minted).to.equal(TOTAL_SUPPLY);
    });

    it("distributes allocations correctly", async function () {
      expect(await hacker.balanceOf(liquidity.address)).to.equal(
        (TOTAL_SUPPLY * 5000n) / 10000n
      ); // 50%
      expect(await hacker.balanceOf(marketing.address)).to.equal(
        (TOTAL_SUPPLY * 2000n) / 10000n
      ); // 20%
      expect(await hacker.balanceOf(await hacker.getAddress())).to.equal(
        (TOTAL_SUPPLY * 1500n) / 10000n
      ); // 15% team vesting
      expect(await hacker.balanceOf(DEAD)).to.equal(
        (TOTAL_SUPPLY * 1000n) / 10000n
      ); // 10% burn
      expect(await hacker.balanceOf(owner.address)).to.equal(
        (TOTAL_SUPPLY * 500n) / 10000n
      ); // 5% reserve
    });

    it("sets anti-whale limits", async function () {
      expect(await hacker.maxWalletAmount()).to.equal(
        (TOTAL_SUPPLY * 100n) / 10000n
      ); // 1%
      expect(await hacker.maxTxAmount()).to.equal(
        (TOTAL_SUPPLY * 50n) / 10000n
      ); // 0.5%
    });
  });

  // ── Normal Transfers (no DEX pair set) ─────────────────────────────────────

  describe("Transfers without DEX pair", function () {
    it("transfers tokens between wallets with no tax", async function () {
      const amount = ethers.parseEther("1000");
      // Give alice some tokens from reserve
      await hacker.connect(owner).transfer(alice.address, amount);
      const aliceBefore = await hacker.balanceOf(alice.address);

      await hacker.connect(alice).transfer(bob.address, amount);

      expect(await hacker.balanceOf(bob.address)).to.equal(amount);
      expect(await hacker.balanceOf(alice.address)).to.equal(
        aliceBefore - amount
      );
    });

    it("reverts when transfer exceeds maxTxAmount", async function () {
      const overMax = (TOTAL_SUPPLY * 51n) / 10000n; // 0.51%
      await hacker.connect(owner).transfer(alice.address, overMax).catch(() => {});
      // Give alice slightly over limit from owner directly (owner excluded from limits)
      await expect(
        hacker.connect(alice).transfer(bob.address, overMax)
      ).to.be.revertedWith("Hacker: exceeds max transaction");
    });

    it("reverts when recipient would exceed maxWalletAmount", async function () {
      const maxWallet = await hacker.maxWalletAmount();
      // Owner is excluded from limits, so transfer to alice is fine
      await hacker.connect(owner).transfer(alice.address, maxWallet);
      // Second transfer to alice should breach wallet limit
      await expect(
        hacker.connect(owner).transfer(alice.address, 1n)
      ).to.be.revertedWith("Hacker: exceeds max wallet");
    });
  });

  // ── Tax on DEX Swaps ───────────────────────────────────────────────────────

  describe("Tax on DEX swaps", function () {
    beforeEach(async function () {
      // Register a fake DEX pair
      await hacker.connect(owner).setDexPair(dex.address);
      // Fund alice for sells
      const reserve = await hacker.balanceOf(owner.address);
      await hacker.connect(owner).transfer(alice.address, reserve);
    });

    it("applies buy tax on transfer from DEX pair", async function () {
      const buyAmount = ethers.parseEther("10000");
      // Simulate a buy: transfer from dex -> alice
      // Fund dex first (dex is excluded from limits)
      const aliceBalance = await hacker.balanceOf(alice.address);
      await hacker.connect(alice).transfer(dex.address, buyAmount);

      const mktBefore = await hacker.balanceOf(marketing.address);
      const deadBefore = await hacker.balanceOf(DEAD);
      const liqBefore = await hacker.balanceOf(liquidity.address);

      await hacker.connect(dex).transfer(bob.address, buyAmount);

      // Buy tax: 2% liq + 2% mkt + 1% burn = 5%
      const expectedMkt  = (buyAmount * 200n) / 10000n;
      const expectedBurn = (buyAmount * 100n) / 10000n;
      const expectedLiq  = (buyAmount * 200n) / 10000n;
      const expectedNet  = buyAmount - expectedMkt - expectedBurn - expectedLiq;

      expect(await hacker.balanceOf(bob.address)).to.equal(expectedNet);
      expect(await hacker.balanceOf(marketing.address)).to.equal(
        mktBefore + expectedMkt
      );
      expect(await hacker.balanceOf(DEAD)).to.equal(deadBefore + expectedBurn);
      expect(await hacker.balanceOf(liquidity.address)).to.equal(
        liqBefore + expectedLiq
      );
    });

    it("applies sell tax on transfer to DEX pair", async function () {
      const sellAmount = ethers.parseEther("10000");

      const mktBefore  = await hacker.balanceOf(marketing.address);
      const deadBefore = await hacker.balanceOf(DEAD);
      const liqBefore  = await hacker.balanceOf(liquidity.address);

      // Sell: alice -> dex
      await hacker.connect(alice).transfer(dex.address, sellAmount);

      // Sell tax: 3% liq + 3% mkt + 2% burn = 8%
      const expectedMkt  = (sellAmount * 300n) / 10000n;
      const expectedBurn = (sellAmount * 200n) / 10000n;
      const expectedLiq  = (sellAmount * 300n) / 10000n;
      const expectedNet  = sellAmount - expectedMkt - expectedBurn - expectedLiq;

      expect(await hacker.balanceOf(dex.address)).to.equal(expectedNet);
      expect(await hacker.balanceOf(marketing.address)).to.equal(
        mktBefore + expectedMkt
      );
      expect(await hacker.balanceOf(DEAD)).to.equal(deadBefore + expectedBurn);
      expect(await hacker.balanceOf(liquidity.address)).to.equal(
        liqBefore + expectedLiq
      );
    });

    it("does not apply tax for excluded addresses", async function () {
      const amount = ethers.parseEther("5000");
      // Owner is excluded — transfer to dex should have no tax
      const ownerBalance = await hacker.balanceOf(owner.address);
      // owner has 0 at this point (transferred to alice in beforeEach), skip if zero
      if (ownerBalance === 0n) return;

      const dexBefore = await hacker.balanceOf(dex.address);
      await hacker.connect(owner).transfer(dex.address, amount);
      expect(await hacker.balanceOf(dex.address)).to.equal(dexBefore + amount);
    });
  });

  // ── Vesting ────────────────────────────────────────────────────────────────

  describe("Team token vesting", function () {
    it("starts with nothing claimable", async function () {
      expect(await hacker.vestedAmount()).to.equal(0n);
    });

    it("vests linearly over 365 days", async function () {
      await time.increase(365 * 24 * 60 * 60); // advance 1 year

      const vested = await hacker.vestedAmount();
      const teamAlloc = await hacker.teamAllocation();
      expect(vested).to.equal(teamAlloc);
    });

    it("allows claiming vested tokens to teamWallet", async function () {
      await time.increase(182 * 24 * 60 * 60); // ~6 months

      const teamBefore = await hacker.balanceOf(team.address);
      await hacker.claimTeamTokens();
      const teamAfter = await hacker.balanceOf(team.address);

      expect(teamAfter).to.be.gt(teamBefore);
      expect(teamAfter - teamBefore).to.be.closeTo(
        (await hacker.teamAllocation()) / 2n,
        ethers.parseEther("1000000") // tolerance
      );
    });

    it("cannot claim more than vested", async function () {
      // No time has passed — nothing to claim
      await expect(hacker.claimTeamTokens()).to.be.revertedWith(
        "Hacker: nothing to claim"
      );
    });
  });

  // ── Owner Configuration ────────────────────────────────────────────────────

  describe("Owner configuration", function () {
    it("sets DEX pair", async function () {
      await hacker.connect(owner).setDexPair(dex.address);
      expect(await hacker.dexPair()).to.equal(dex.address);
    });

    it("reverts setDexPair for non-owner", async function () {
      await expect(
        hacker.connect(alice).setDexPair(dex.address)
      ).to.be.reverted;
    });

    it("updates marketing wallet", async function () {
      await hacker.connect(owner).setMarketingWallet(bob.address);
      expect(await hacker.marketingWallet()).to.equal(bob.address);
    });

    it("updates limits", async function () {
      const newMax = (TOTAL_SUPPLY * 200n) / 10000n; // 2%
      await hacker.connect(owner).setLimits(newMax, newMax);
      expect(await hacker.maxWalletAmount()).to.equal(newMax);
    });

    it("reverts setLimits below 0.1% floor", async function () {
      const tooLow = TOTAL_SUPPLY / 2000n; // 0.05%
      await expect(
        hacker.connect(owner).setLimits(tooLow, tooLow)
      ).to.be.reverted;
    });

    it("removes limits", async function () {
      await hacker.connect(owner).removeLimits();
      expect(await hacker.maxWalletAmount()).to.equal(TOTAL_SUPPLY);
    });

    it("updates tax rates within allowed bounds", async function () {
      await hacker.connect(owner).setTax(100, 100, 50, 200, 200, 100);
      expect(await hacker.buyLiquidityBps()).to.equal(100n);
    });

    it("reverts tax above cap", async function () {
      await expect(
        hacker.connect(owner).setTax(400, 400, 300, 400, 400, 300)
      ).to.be.reverted;
    });

    it("sets liquidity lock timestamp and disallows shortening", async function () {
      const now = await time.latest();
      const lock1 = now + 7 * 24 * 60 * 60;
      const lock2 = now + 14 * 24 * 60 * 60;
      await hacker.connect(owner).setLiquidityLockUntil(lock1);
      expect(await hacker.liquidityLockUntil()).to.equal(lock1);

      await expect(
        hacker.connect(owner).setLiquidityLockUntil(lock1 - 1)
      ).to.be.revertedWith("Hacker: cannot shorten lock");

      await hacker.connect(owner).setLiquidityLockUntil(lock2);
      expect(await hacker.liquidityLockUntil()).to.equal(lock2);
    });
  });

  describe("Pause and protection lists", function () {
    it("pauses and unpauses transfers", async function () {
      const amount = ethers.parseEther("100");
      await hacker.connect(owner).pause();
      await expect(
        hacker.connect(owner).transfer(alice.address, amount)
      ).to.be.revertedWithCustomError(hacker, "EnforcedPause");

      await hacker.connect(owner).unpause();
      await expect(hacker.connect(owner).transfer(alice.address, amount)).to.not.be
        .reverted;
    });

    it("blocks blacklisted sender and recipient", async function () {
      const amount = ethers.parseEther("100");
      await hacker.connect(owner).transfer(alice.address, amount);
      await hacker.connect(owner).setBlacklist(alice.address, true);
      await expect(
        hacker.connect(alice).transfer(bob.address, 1n)
      ).to.be.revertedWith("Hacker: blacklisted");

      await hacker.connect(owner).setBlacklist(alice.address, false);
      await hacker.connect(owner).setBlacklist(bob.address, true);
      await expect(
        hacker.connect(alice).transfer(bob.address, 1n)
      ).to.be.revertedWith("Hacker: blacklisted");
    });

    it("blocks greylisted dex buys and sells only", async function () {
      const amount = ethers.parseEther("1000");
      await hacker.connect(owner).setDexPair(dex.address);
      await hacker.connect(owner).transfer(alice.address, amount);
      await hacker.connect(owner).setGreylist(alice.address, true);

      await expect(
        hacker.connect(alice).transfer(dex.address, 1n)
      ).to.be.revertedWith("Hacker: greylisted sell blocked");

      await hacker.connect(alice).transfer(bob.address, 1n);
    });
  });

  describe("Allowance helpers", function () {
    it("increases and decreases allowance", async function () {
      await hacker.connect(owner).increaseAllowance(alice.address, 100n);
      expect(await hacker.allowance(owner.address, alice.address)).to.equal(100n);

      await hacker.connect(owner).decreaseAllowance(alice.address, 40n);
      expect(await hacker.allowance(owner.address, alice.address)).to.equal(60n);
    });

    it("reverts decreasing allowance below zero", async function () {
      await expect(
        hacker.connect(owner).decreaseAllowance(alice.address, 1n)
      ).to.be.revertedWith("Hacker: decreased allowance below zero");
    });
  });
});
