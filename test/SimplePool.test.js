const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DeFi Liquidity Pool", function () {
  let myToken, usdt, pool;
  let owner, user;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    const MyToken = await ethers.getContractFactory("MyToken");
    myToken = await MyToken.deploy(
      ethers.parseEther("1000000")
    );

    const StableCoin = await ethers.getContractFactory("StableCoin");
    usdt = await StableCoin.deploy(
      ethers.parseEther("1000000")
    );

    const SimplePool = await ethers.getContractFactory("SimplePool");
    pool = await SimplePool.deploy(
      myToken.target,
      usdt.target,
      30 // 0.30%
    );

    // Give user tokens
    await myToken.transfer(user.address, ethers.parseEther("1000"));
    await usdt.transfer(user.address, ethers.parseEther("1000"));
  });

  it("Should allow adding liquidity", async function () {
    await myToken.approve(pool.target, ethers.parseEther("100"));
    await usdt.approve(pool.target, ethers.parseEther("100"));

    await pool.addLiquidity(
      ethers.parseEther("100"),
      ethers.parseEther("100")
    );

    expect(await pool.totalLiquidity()).to.be.gt(0);
  });

  it("Should perform swap and generate rewards", async function () {
    await myToken.approve(pool.target, ethers.parseEther("100"));
    await usdt.approve(pool.target, ethers.parseEther("100"));
    await pool.addLiquidity(
      ethers.parseEther("100"),
      ethers.parseEther("100")
    );

    await myToken
      .connect(user)
      .approve(pool.target, ethers.parseEther("10"));

    await pool
      .connect(user)
      .swapMyTokenForUSDT(ethers.parseEther("10"));

    const [pendingMyToken, pendingUSDT] = await pool.pendingRewards(owner.address);
    // swapping MTK -> USDT generates fee in MTK, so MTK rewards should accrue
    expect(pendingMyToken).to.be.gt(0);
    expect(pendingUSDT).to.equal(0);
  });

  it("Should allow claiming rewards", async function () {
    await myToken.approve(pool.target, ethers.parseEther("100"));
    await usdt.approve(pool.target, ethers.parseEther("100"));
    await pool.addLiquidity(
      ethers.parseEther("100"),
      ethers.parseEther("100")
    );

    await myToken
      .connect(user)
      .approve(pool.target, ethers.parseEther("10"));
    await pool
      .connect(user)
      .swapMyTokenForUSDT(ethers.parseEther("10"));

    const beforeMtk = await myToken.balanceOf(owner.address);
    const beforeUsdt = await usdt.balanceOf(owner.address);

    await pool.claimRewards();

    const afterMtk = await myToken.balanceOf(owner.address);
    const afterUsdt = await usdt.balanceOf(owner.address);

    // rewards from MTK->USDT swap are paid in MTK
    expect(afterMtk).to.be.gt(beforeMtk);
    expect(afterUsdt).to.equal(beforeUsdt);
  });

  it("Should allow removing liquidity", async function () {
    await myToken.approve(pool.target, ethers.parseEther("100"));
    await usdt.approve(pool.target, ethers.parseEther("100"));
    await pool.addLiquidity(
      ethers.parseEther("100"),
      ethers.parseEther("100")
    );

    const { shares } = await pool.users(owner.address);
    await pool.removeLiquidity(shares);

    expect(await pool.totalLiquidity()).to.equal(0);
  });
});
