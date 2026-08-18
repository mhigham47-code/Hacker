// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Hacker Token
 * @notice ERC-20 meme coin with buy/sell tax, anti-whale, and vesting for team tokens.
 *
 * Tokenomics (total supply = 1,000,000,000,000 HACK):
 *   - 50%  Liquidity Pool  (sent to owner at deploy; locked externally)
 *   - 20%  Marketing       (sent to marketingWallet at deploy)
 *   - 15%  Team            (vested linearly over 12 months via contract)
 *   - 10%  Burn            (sent to dead address at deploy)
 *   - 5%   Reserve         (sent to owner at deploy)
 *
 * Tax (applies to DEX swaps only — wallet-to-wallet transfers are tax-free):
 *   Buy tax  = 5%  (2% liquidity, 2% marketing, 1% burn)
 *   Sell tax = 8%  (3% liquidity, 3% marketing, 2% burn)
 *
 * Anti-whale:
 *   - Max wallet: 1% of total supply
 *   - Max single transaction: 0.5% of total supply
 *   Both limits can be raised/removed by owner after launch.
 */
contract Hacker is ERC20, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Constants ────────────────────────────────────────────────────────────
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000_000 * 10 ** 18;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // Allocation percentages (basis points out of 10_000)
    uint256 private constant LP_BPS       = 5000; // 50%
    uint256 private constant MARKETING_BPS = 2000; // 20%
    uint256 private constant TEAM_BPS      = 1500; // 15%
    uint256 private constant BURN_BPS      = 1000; // 10%
    uint256 private constant RESERVE_BPS   =  500; //  5%

    // Tax rates (basis points)
    uint256 public buyLiquidityBps   = 200;
    uint256 public buyMarketingBps   = 200;
    uint256 public buyBurnBps        = 100;

    uint256 public sellLiquidityBps  = 300;
    uint256 public sellMarketingBps  = 300;
    uint256 public sellBurnBps       = 200;

    // Anti-whale limits
    uint256 public maxWalletAmount;
    uint256 public maxTxAmount;

    // ── State ────────────────────────────────────────────────────────────────
    address public marketingWallet;
    address public liquidityWallet;

    /// @notice The DEX pair address — transfers to/from this address are taxed.
    address public dexPair;

    /// @notice Addresses excluded from tax (owner, this contract, wallets above).
    mapping(address => bool) public isExcludedFromTax;

    /// @notice Addresses excluded from anti-whale limits.
    mapping(address => bool) public isExcludedFromLimits;

    /// @notice Blacklisted addresses cannot transfer or receive tokens.
    mapping(address => bool) public isBlacklisted;

    /// @notice Greylisted addresses cannot trade against dexPair.
    mapping(address => bool) public isGreylisted;

    // ── Vesting ──────────────────────────────────────────────────────────────
    address public teamWallet;
    uint256 public vestingStart;
    uint256 public vestingDuration = 365 days;
    uint256 public teamAllocation;
    uint256 public teamClaimed;

    /// @notice LP lock metadata tracker (does not lock LP in this contract).
    uint256 public liquidityLockUntil;

    // ── Events ───────────────────────────────────────────────────────────────
    event DexPairUpdated(address indexed newPair);
    event MarketingWalletUpdated(address indexed newWallet);
    event LimitsUpdated(uint256 maxWallet, uint256 maxTx);
    event TaxUpdated(
        uint256 buyLiq, uint256 buyMkt, uint256 buyBurn,
        uint256 sellLiq, uint256 sellMkt, uint256 sellBurn
    );
    event TeamTokensClaimed(address indexed to, uint256 amount);
    event ExcludedFromTaxUpdated(address indexed account, bool excluded);
    event ExcludedFromLimitsUpdated(address indexed account, bool excluded);
    event BlacklistUpdated(address indexed account, bool blacklisted);
    event GreylistUpdated(address indexed account, bool greylisted);
    event EmergencyPaused(address indexed by);
    event EmergencyUnpaused(address indexed by);
    event LiquidityLockUpdated(uint256 unlockTimestamp);

    // ── Constructor ──────────────────────────────────────────────────────────
    constructor(
        address _marketingWallet,
        address _teamWallet,
        address _liquidityWallet
    ) ERC20("Hacker", "HACK") Ownable(msg.sender) {
        require(_marketingWallet != address(0), "Hacker: zero marketing wallet");
        require(_teamWallet      != address(0), "Hacker: zero team wallet");
        require(_liquidityWallet != address(0), "Hacker: zero liquidity wallet");

        marketingWallet = _marketingWallet;
        teamWallet      = _teamWallet;
        liquidityWallet = _liquidityWallet;

        // Anti-whale defaults
        maxWalletAmount = (TOTAL_SUPPLY * 100) / BPS_DENOMINATOR; // 1%
        maxTxAmount     = (TOTAL_SUPPLY *  50) / BPS_DENOMINATOR; // 0.5%

        // Exclusions
        isExcludedFromTax[msg.sender]       = true;
        isExcludedFromTax[address(this)]    = true;
        isExcludedFromTax[_marketingWallet] = true;
        isExcludedFromTax[_liquidityWallet] = true;
        isExcludedFromTax[DEAD]             = true;

        isExcludedFromLimits[msg.sender]       = true;
        isExcludedFromLimits[address(this)]    = true;
        isExcludedFromLimits[_marketingWallet] = true;
        isExcludedFromLimits[_liquidityWallet] = true;
        isExcludedFromLimits[DEAD]             = true;

        // Mint and distribute
        uint256 lpAmount        = (TOTAL_SUPPLY * LP_BPS)        / BPS_DENOMINATOR;
        uint256 marketingAmount = (TOTAL_SUPPLY * MARKETING_BPS) / BPS_DENOMINATOR;
        uint256 teamAmount      = (TOTAL_SUPPLY * TEAM_BPS)      / BPS_DENOMINATOR;
        uint256 burnAmount      = (TOTAL_SUPPLY * BURN_BPS)      / BPS_DENOMINATOR;
        uint256 reserveAmount   = (TOTAL_SUPPLY * RESERVE_BPS)   / BPS_DENOMINATOR;

        teamAllocation = teamAmount;
        vestingStart   = block.timestamp;

        _mint(_liquidityWallet, lpAmount);
        _mint(_marketingWallet, marketingAmount);
        _mint(address(this),    teamAmount);   // held in contract for vesting
        _mint(DEAD,             burnAmount);
        _mint(msg.sender,       reserveAmount);
    }

    // ── Tax & Transfer Logic ─────────────────────────────────────────────────

    /**
     * @dev Override ERC-20 transfer to apply tax and anti-whale checks.
     */
    function _update(address from, address to, uint256 amount) internal override whenNotPaused {
        // Mint/Burn paths (used by ERC20 internals) skip account checks.
        if (from != address(0) && to != address(0)) {
            require(!isBlacklisted[from] && !isBlacklisted[to], "Hacker: blacklisted");
        }

        if (dexPair != address(0)) {
            require(!(isGreylisted[from] && to == dexPair), "Hacker: greylisted sell blocked");
            require(!(isGreylisted[to] && from == dexPair), "Hacker: greylisted buy blocked");
        }

        // Anti-whale: skip for excluded addresses
        if (!isExcludedFromLimits[from] && !isExcludedFromLimits[to]) {
            require(amount <= maxTxAmount, "Hacker: exceeds max transaction");
            if (to != dexPair) {
                require(balanceOf(to) + amount <= maxWalletAmount, "Hacker: exceeds max wallet");
            }
        }

        // Tax logic: only on DEX swaps
        if (
            dexPair != address(0) &&
            !isExcludedFromTax[from] &&
            !isExcludedFromTax[to]
        ) {
            bool isBuy  = (from == dexPair);
            bool isSell = (to   == dexPair);

            if (isBuy || isSell) {
                uint256 liqBps     = isBuy ? buyLiquidityBps  : sellLiquidityBps;
                uint256 mktBps     = isBuy ? buyMarketingBps  : sellMarketingBps;
                uint256 burnBps_   = isBuy ? buyBurnBps       : sellBurnBps;
                uint256 totalBps   = liqBps + mktBps + burnBps_;

                if (totalBps == 0) {
                    super._update(from, to, amount);
                    return;
                }

                uint256 liqFee  = (amount * liqBps)   / BPS_DENOMINATOR;
                uint256 mktFee  = (amount * mktBps)   / BPS_DENOMINATOR;
                uint256 burnFee = (amount * burnBps_) / BPS_DENOMINATOR;
                uint256 totalFee = liqFee + mktFee + burnFee;

                uint256 netAmount;
                unchecked {
                    netAmount = amount - totalFee;
                }

                super._update(from, liquidityWallet, liqFee);
                super._update(from, marketingWallet, mktFee);
                super._update(from, DEAD,            burnFee);
                super._update(from, to,              netAmount);
                return;
            }
        }

        super._update(from, to, amount);
    }

    // ── Vesting ──────────────────────────────────────────────────────────────

    /**
     * @notice Claims vested team tokens. Anyone can call; tokens always go to teamWallet.
     */
    function claimTeamTokens() external nonReentrant whenNotPaused {
        uint256 claimable = vestedAmount() - teamClaimed;
        require(claimable > 0, "Hacker: nothing to claim");
        teamClaimed += claimable;
        _transfer(address(this), teamWallet, claimable);
        emit TeamTokensClaimed(teamWallet, claimable);
    }

    /**
     * @notice Returns the total amount of team tokens vested so far.
     */
    function vestedAmount() public view returns (uint256) {
        uint256 elapsed = block.timestamp - vestingStart;
        if (elapsed >= vestingDuration) return teamAllocation;
        return (teamAllocation * elapsed) / vestingDuration;
    }

    // ── Owner Configuration ──────────────────────────────────────────────────

    function setDexPair(address _pair) external onlyOwner {
        require(_pair != address(0), "Hacker: zero address");
        dexPair = _pair;
        isExcludedFromLimits[_pair] = true;
        emit DexPairUpdated(_pair);
    }

    function setMarketingWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "Hacker: zero address");
        marketingWallet = _wallet;
        emit MarketingWalletUpdated(_wallet);
    }

    function setLimits(uint256 _maxWallet, uint256 _maxTx) external onlyOwner {
        // Minimum 0.1% to prevent griefing
        require(_maxWallet >= TOTAL_SUPPLY / 1_000, "Hacker: maxWallet too low");
        require(_maxTx     >= TOTAL_SUPPLY / 1_000, "Hacker: maxTx too low");
        maxWalletAmount = _maxWallet;
        maxTxAmount     = _maxTx;
        emit LimitsUpdated(_maxWallet, _maxTx);
    }

    function setTax(
        uint256 _buyLiq, uint256 _buyMkt, uint256 _buyBurn,
        uint256 _sellLiq, uint256 _sellMkt, uint256 _sellBurn
    ) external onlyOwner {
        require(_buyLiq + _buyMkt + _buyBurn   <= 1000, "Hacker: buy tax > 10%");
        require(_sellLiq + _sellMkt + _sellBurn <= 1500, "Hacker: sell tax > 15%");
        buyLiquidityBps  = _buyLiq;
        buyMarketingBps  = _buyMkt;
        buyBurnBps       = _buyBurn;
        sellLiquidityBps = _sellLiq;
        sellMarketingBps = _sellMkt;
        sellBurnBps      = _sellBurn;
        emit TaxUpdated(_buyLiq, _buyMkt, _buyBurn, _sellLiq, _sellMkt, _sellBurn);
    }

    function setExcludedFromTax(address account, bool excluded) external onlyOwner {
        isExcludedFromTax[account] = excluded;
        emit ExcludedFromTaxUpdated(account, excluded);
    }

    function setExcludedFromLimits(address account, bool excluded) external onlyOwner {
        isExcludedFromLimits[account] = excluded;
        emit ExcludedFromLimitsUpdated(account, excluded);
    }

    /// @notice Removes wallet size and transaction limits permanently.
    function removeLimits() external onlyOwner {
        maxWalletAmount = TOTAL_SUPPLY;
        maxTxAmount     = TOTAL_SUPPLY;
        emit LimitsUpdated(TOTAL_SUPPLY, TOTAL_SUPPLY);
    }

    function pause() external onlyOwner {
        _pause();
        emit EmergencyPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit EmergencyUnpaused(msg.sender);
    }

    function setBlacklist(address account, bool blacklisted) external onlyOwner {
        isBlacklisted[account] = blacklisted;
        emit BlacklistUpdated(account, blacklisted);
    }

    function setGreylist(address account, bool greylisted) external onlyOwner {
        isGreylisted[account] = greylisted;
        emit GreylistUpdated(account, greylisted);
    }

    function setLiquidityLockUntil(uint256 unlockTimestamp) external onlyOwner {
        require(unlockTimestamp > block.timestamp, "Hacker: invalid unlock");
        require(unlockTimestamp >= liquidityLockUntil, "Hacker: cannot shorten lock");
        liquidityLockUntil = unlockTimestamp;
        emit LiquidityLockUpdated(unlockTimestamp);
    }

    function increaseAllowance(address spender, uint256 addedValue) external returns (bool) {
        _approve(msg.sender, spender, allowance(msg.sender, spender) + addedValue);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool) {
        uint256 currentAllowance = allowance(msg.sender, spender);
        require(currentAllowance >= subtractedValue, "Hacker: decreased allowance below zero");
        unchecked {
            _approve(msg.sender, spender, currentAllowance - subtractedValue);
        }
        return true;
    }

    /// @notice Rescue non-HACK tokens sent to this contract by mistake.
    function rescueForeignToken(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(token != address(this), "Hacker: cannot rescue HACK");
        require(to != address(0), "Hacker: zero address");
        IERC20(token).safeTransfer(to, amount);
    }
}
