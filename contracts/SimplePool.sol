// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SimplePool is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable myToken; // tokenA (your custom token)
    IERC20 public immutable usdt; // tokenB (stable token)

    uint256 public reserveMyToken;
    uint256 public reserveUSDT;

    uint256 public totalLiquidity; // LP shares

    // fee in basis points (e.g. 30 = 0.30%)
    uint256 public swapFeeBps;
    uint256 public constant FEE_DENOM = 10_000;

    uint256 public constant PRECISION = 1e24;

    struct UserInfo {
        uint256 shares;
        uint256 rewardDebtMyToken;
        uint256 rewardDebtUSDT;
    }

    mapping(address => UserInfo) public users;

    uint256 public accRewardPerShareMyToken;
    uint256 public accRewardPerShareUSDT;

    uint256 public feePoolMyToken;
    uint256 public feePoolUSDT;

    event LiquidityAdded(address indexed user, uint256 amountMyToken, uint256 amountUSDT, uint256 sharesMinted);
    event LiquidityRemoved(address indexed user, uint256 amountMyToken, uint256 amountUSDT, uint256 sharesBurned);
    event SwapMyTokenForUSDT(address indexed user, uint256 amountIn, uint256 amountOut, uint256 fee);
    event SwapUSDTForMyToken(address indexed user, uint256 amountIn, uint256 amountOut, uint256 fee);
    event RewardsClaimed(address indexed user, uint256 myTokenAmount, uint256 usdtAmount);
    event SwapFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    constructor(address _myToken, address _usdt, uint256 _swapFeeBps) {
        require(_myToken != address(0) && _usdt != address(0), "Invalid token");
        require(_swapFeeBps <= 1000, "Fee too high"); // max 10%

        myToken = IERC20(_myToken);
        usdt = IERC20(_usdt);
        swapFeeBps = _swapFeeBps;
    }

    function setSwapFeeBps(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "Fee too high");
        uint256 old = swapFeeBps;
        swapFeeBps = newFeeBps;
        emit SwapFeeUpdated(old, newFeeBps);
    }

    function addLiquidity(uint256 tokenAmount, uint256 usdtAmount) external nonReentrant {
        require(tokenAmount > 0 && usdtAmount > 0, "Invalid amounts");

        _updateRewards();
        _settleRewards(msg.sender);

        myToken.safeTransferFrom(msg.sender, address(this), tokenAmount);
        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);

        uint256 shares;
        if (totalLiquidity == 0) {
            shares = _sqrt(tokenAmount * usdtAmount);
        } else {
            shares = _min((tokenAmount * totalLiquidity) / reserveMyToken, (usdtAmount * totalLiquidity) / reserveUSDT);
        }
        require(shares > 0, "Zero shares");

        totalLiquidity += shares;
        users[msg.sender].shares += shares;

        reserveMyToken += tokenAmount;
        reserveUSDT += usdtAmount;

        users[msg.sender].rewardDebtMyToken = (users[msg.sender].shares * accRewardPerShareMyToken) / PRECISION;
        users[msg.sender].rewardDebtUSDT = (users[msg.sender].shares * accRewardPerShareUSDT) / PRECISION;

        emit LiquidityAdded(msg.sender, tokenAmount, usdtAmount, shares);
    }

    function removeLiquidity(uint256 shares) external nonReentrant {
        require(shares > 0, "Invalid amount");
        UserInfo storage u = users[msg.sender];
        require(u.shares >= shares, "Not enough liquidity");

        _updateRewards();
        _settleRewards(msg.sender);

        uint256 percent = (shares * 1e18) / totalLiquidity;
        uint256 tokenOut = (reserveMyToken * percent) / 1e18;
        uint256 usdtOut = (reserveUSDT * percent) / 1e18;

        reserveMyToken -= tokenOut;
        reserveUSDT -= usdtOut;

        totalLiquidity -= shares;
        u.shares -= shares;

        u.rewardDebtMyToken = (u.shares * accRewardPerShareMyToken) / PRECISION;
        u.rewardDebtUSDT = (u.shares * accRewardPerShareUSDT) / PRECISION;

        myToken.safeTransfer(msg.sender, tokenOut);
        usdt.safeTransfer(msg.sender, usdtOut);

        emit LiquidityRemoved(msg.sender, tokenOut, usdtOut, shares);
    }

    function swapMyTokenForUSDT(uint256 amountIn) external nonReentrant {
        require(amountIn > 0, "Invalid amount");
        require(reserveMyToken > 0 && reserveUSDT > 0, "No liquidity");

        myToken.safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 fee = (amountIn * swapFeeBps) / FEE_DENOM;
        uint256 amt = amountIn - fee;

        // collect fee for LP rewards (in myToken)
        feePoolMyToken += fee;
        _updateRewards();

        uint256 usdtOut = (reserveUSDT * amt) / (reserveMyToken + amt);
        require(usdtOut > 0 && usdtOut < reserveUSDT, "Insufficient output");

        reserveMyToken += amt;
        reserveUSDT -= usdtOut;

        usdt.safeTransfer(msg.sender, usdtOut);
        emit SwapMyTokenForUSDT(msg.sender, amountIn, usdtOut, fee);
    }

    function swapUSDTForMyToken(uint256 amountIn) external nonReentrant {
        require(amountIn > 0, "Invalid amount");
        require(reserveMyToken > 0 && reserveUSDT > 0, "No liquidity");

        usdt.safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 fee = (amountIn * swapFeeBps) / FEE_DENOM;
        uint256 amt = amountIn - fee;

        // collect fee for LP rewards (in usdt)
        feePoolUSDT += fee;
        _updateRewards();

        uint256 tokenOut = (reserveMyToken * amt) / (reserveUSDT + amt);
        require(tokenOut > 0 && tokenOut < reserveMyToken, "Insufficient output");

        reserveUSDT += amt;
        reserveMyToken -= tokenOut;

        myToken.safeTransfer(msg.sender, tokenOut);
        emit SwapUSDTForMyToken(msg.sender, amountIn, tokenOut, fee);
    }

    function claimRewards() external {
        withdrawRewards();
    }

    function withdrawRewards() public nonReentrant {
        _updateRewards();
        _settleRewards(msg.sender);
    }

    function pendingRewards(address user) external view returns (uint256 pendingMyToken, uint256 pendingUSDT) {
        return (_pendingMyToken(user), _pendingUSDT(user));
    }

    function pendingMyTokenRewards(address user) external view returns (uint256) {
        return _pendingMyToken(user);
    }

    function pendingUSDTRewards(address user) external view returns (uint256) {
        return _pendingUSDT(user);
    }

    function _updateRewards() internal {
        if (totalLiquidity == 0) return;

        if (feePoolMyToken > 0) {
            accRewardPerShareMyToken += (feePoolMyToken * PRECISION) / totalLiquidity;
            feePoolMyToken = 0;
        }
        if (feePoolUSDT > 0) {
            accRewardPerShareUSDT += (feePoolUSDT * PRECISION) / totalLiquidity;
            feePoolUSDT = 0;
        }
    }

    function _pendingMyToken(address user) internal view returns (uint256) {
        UserInfo storage u = users[user];
        uint256 accumulated = (u.shares * accRewardPerShareMyToken) / PRECISION;
        return accumulated - u.rewardDebtMyToken;
    }

    function _pendingUSDT(address user) internal view returns (uint256) {
        UserInfo storage u = users[user];
        uint256 accumulated = (u.shares * accRewardPerShareUSDT) / PRECISION;
        return accumulated - u.rewardDebtUSDT;
    }

    function _settleRewards(address user) internal {
        UserInfo storage u = users[user];
        uint256 pendingMyToken = _pendingMyToken(user);
        uint256 pendingUSDT = _pendingUSDT(user);

        if (pendingMyToken > 0) {
            myToken.safeTransfer(user, pendingMyToken);
        }
        if (pendingUSDT > 0) {
            usdt.safeTransfer(user, pendingUSDT);
        }

        u.rewardDebtMyToken = (u.shares * accRewardPerShareMyToken) / PRECISION;
        u.rewardDebtUSDT = (u.shares * accRewardPerShareUSDT) / PRECISION;

        if (pendingMyToken > 0 || pendingUSDT > 0) {
            emit RewardsClaimed(user, pendingMyToken, pendingUSDT);
        }
    }

    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}