const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function readFrontendEnv() {
  const envPath = path.join(__dirname, "..", "frontend", ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      `Missing frontend/.env at ${envPath}. Run deployment first (npm run deploy:localhost or npm run dev).`
    );
  }

  const text = fs.readFileSync(envPath, "utf8");
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
  }

  return env;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    to: null,
    eth: "10",
    token: "10000",
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];

    if (!a.startsWith("--") && !out.to) {
      out.to = a;
      continue;
    }

    if (a === "--to") {
      out.to = args[i + 1];
      i++;
      continue;
    }

    if (a === "--eth") {
      out.eth = args[i + 1];
      i++;
      continue;
    }

    if (a === "--token") {
      out.token = args[i + 1];
      i++;
      continue;
    }

    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
  }

  return out;
}

async function main() {
  const { to, eth, token, help } = parseArgs();

  // Hardhat's CLI doesn't reliably forward arbitrary script args.
  // Prefer env vars, but keep argv parsing for direct node usage.
  const resolvedTo = process.env.AIRDROP_TO || to;
  const resolvedEth = process.env.AIRDROP_ETH || eth;
  const resolvedToken = process.env.AIRDROP_TOKEN || token;

  if (help || !resolvedTo) {
    console.log(
      [
        "Airdrop ETH + both tokens to an address (local Hardhat)",
        "",
        "Recommended usage (PowerShell):",
        "  $env:AIRDROP_TO=\"0xYourAddress\"; npm run airdrop",
        "  $env:AIRDROP_TO=\"0xYourAddress\"; $env:AIRDROP_ETH=\"5\"; $env:AIRDROP_TOKEN=\"2500\"; npm run airdrop",
        "",
        "Defaults:",
        "  AIRDROP_ETH   = 10",
        "  AIRDROP_TOKEN = 10000",
      ].join("\n")
    );
    return;
  }

  const recipient = hre.ethers.getAddress(resolvedTo);
  const env = readFrontendEnv();

  const myTokenAddress = env.REACT_APP_MY_TOKEN_ADDRESS;
  const usdtAddress = env.REACT_APP_USDT_ADDRESS;

  if (!myTokenAddress || !usdtAddress) {
    throw new Error(
      "frontend/.env is missing REACT_APP_MY_TOKEN_ADDRESS or REACT_APP_USDT_ADDRESS. Re-run deploy."
    );
  }

  const network = await hre.ethers.provider.getNetwork();
  console.log(`Network chainId: ${Number(network.chainId)}`);

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Recipient: ${recipient}`);

  const ethWei = hre.ethers.parseEther(String(resolvedEth));
  const tokenWei = hre.ethers.parseEther(String(resolvedToken));

  if (ethWei > 0n) {
    console.log(`\nSending ${resolvedEth} ETH...`);
    const tx = await deployer.sendTransaction({ to: recipient, value: ethWei });
    await tx.wait();
    console.log(`- ETH tx: ${tx.hash}`);
  }

  const myToken = await hre.ethers.getContractAt("MyToken", myTokenAddress, deployer);
  const usdt = await hre.ethers.getContractAt("StableCoin", usdtAddress, deployer);

  console.log(`\nSending ${resolvedToken} MyToken...`);
  const tx1 = await myToken.transfer(recipient, tokenWei);
  await tx1.wait();
  console.log(`- MyToken tx: ${tx1.hash}`);

  console.log(`\nSending ${resolvedToken} USDT...`);
  const tx2 = await usdt.transfer(recipient, tokenWei);
  await tx2.wait();
  console.log(`- USDT tx: ${tx2.hash}`);

  console.log("\nDone. Reconnect wallet in the frontend and press Refresh.");
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exitCode = 1;
});
