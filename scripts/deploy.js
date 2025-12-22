const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFrontendEnv({ chainId, myToken, usdt, pool }) {
  const frontendEnvPath = path.join(__dirname, "..", "frontend", ".env");
  const port = process.env.FRONTEND_PORT || 3002;
  const content = [
    "# Public frontend config (safe to expose)",
    `PORT=${port}`,
    `REACT_APP_CHAIN_ID=${chainId}`,
    `REACT_APP_MY_TOKEN_ADDRESS=${myToken}`,
    `REACT_APP_USDT_ADDRESS=${usdt}`,
    `REACT_APP_POOL_ADDRESS=${pool}`,
    "",
  ].join("\n");

  fs.writeFileSync(frontendEnvPath, content, "utf8");
  console.log(`Wrote frontend env: ${frontendEnvPath}`);
}

function copyFrontendArtifacts() {
  const root = path.join(__dirname, "..");
  const outDir = path.join(root, "frontend", "src", "contracts");
  ensureDir(outDir);

  const artifacts = [
    {
      from: path.join(root, "artifacts", "contracts", "MyToken.sol", "MyToken.json"),
      to: path.join(outDir, "MyToken.json"),
    },
    {
      from: path.join(root, "artifacts", "contracts", "StableCoin.sol", "StableCoin.json"),
      to: path.join(outDir, "StableCoin.json"),
    },
    {
      from: path.join(root, "artifacts", "contracts", "SimplePool.sol", "SimplePool.json"),
      to: path.join(outDir, "SimplePool.json"),
    },
  ];

  for (const { from, to } of artifacts) {
    fs.copyFileSync(from, to);
  }

  console.log(`Copied artifacts to: ${outDir}`);
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying with:", deployer.address);

  const MyToken = await hre.ethers.getContractFactory("MyToken");
  const myToken = await MyToken.deploy(
    hre.ethers.parseEther("1000000")
  );
  await myToken.waitForDeployment();

  const StableCoin = await hre.ethers.getContractFactory("StableCoin");
  const usdt = await StableCoin.deploy(
    hre.ethers.parseEther("1000000")
  );
  await usdt.waitForDeployment();

  const SimplePool = await hre.ethers.getContractFactory("SimplePool");
  const pool = await SimplePool.deploy(
    myToken.target,
    usdt.target,
    30 // 0.30% swap fee
  );
  await pool.waitForDeployment();

  console.log("MyToken:", myToken.target);
  console.log("USDT:", usdt.target);
  console.log("Pool:", pool.target);

  const { chainId } = await hre.ethers.provider.getNetwork();
  writeFrontendEnv({
    chainId: Number(chainId),
    myToken: myToken.target,
    usdt: usdt.target,
    pool: pool.target,
  });

  copyFrontendArtifacts();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
