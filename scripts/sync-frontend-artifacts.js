const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "frontend", "src", "contracts");

const artifacts = [
  {
    name: "MyToken.json",
    from: path.join(root, "artifacts", "contracts", "MyToken.sol", "MyToken.json"),
  },
  {
    name: "StableCoin.json",
    from: path.join(root, "artifacts", "contracts", "StableCoin.sol", "StableCoin.json"),
  },
  {
    name: "SimplePool.json",
    from: path.join(root, "artifacts", "contracts", "SimplePool.sol", "SimplePool.json"),
  },
];

function main() {
  if (!fs.existsSync(path.join(root, "artifacts"))) {
    throw new Error("Missing ./artifacts. Run: npx hardhat compile");
  }

  fs.mkdirSync(outDir, { recursive: true });

  for (const a of artifacts) {
    if (!fs.existsSync(a.from)) {
      throw new Error(`Missing artifact: ${a.from}\nRun: npx hardhat compile`);
    }
    fs.copyFileSync(a.from, path.join(outDir, a.name));
    console.log(`Copied ${a.name}`);
  }

  console.log(`Done. ABIs available in: ${outDir}`);
}

main();