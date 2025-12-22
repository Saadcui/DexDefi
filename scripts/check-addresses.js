require('dotenv').config();
const { ethers } = require('ethers');

const SIMPLE_POOL_ABI = [
  'function myToken() view returns (address)',
  'function usdt() view returns (address)',
  'function reserveMyToken() view returns (uint256)',
  'function reserveUSDT() view returns (uint256)',
  'function totalLiquidity() view returns (uint256)',
];

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

function assertEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function norm(addr) {
  return ethers.getAddress(addr);
}

async function main() {
  const rpcUrl = assertEnv('SEPOLIA_RPC_URL');
  const poolAddress = norm(assertEnv('POOL_ADDRESS'));
  const myTokenAddress = norm(assertEnv('MY_TOKEN_ADDRESS'));
  const usdtAddress = norm(assertEnv('USDT_ADDRESS'));

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();

  console.log(`Network: ${network.name} (chainId ${network.chainId})`);
  console.log(`POOL_ADDRESS:     ${poolAddress}`);
  console.log(`MY_TOKEN_ADDRESS: ${myTokenAddress}`);
  console.log(`USDT_ADDRESS:     ${usdtAddress}`);

  const [poolCode, mtkCode, usdtCode] = await Promise.all([
    provider.getCode(poolAddress),
    provider.getCode(myTokenAddress),
    provider.getCode(usdtAddress),
  ]);

  const missing = [];
  if (poolCode === '0x') missing.push('POOL_ADDRESS');
  if (mtkCode === '0x') missing.push('MY_TOKEN_ADDRESS');
  if (usdtCode === '0x') missing.push('USDT_ADDRESS');

  if (missing.length) {
    console.log('\n❌ Not deployed on this network (no bytecode):');
    for (const m of missing) console.log(`- ${m}`);
    process.exitCode = 2;
    return;
  }

  console.log('\n✅ Bytecode present for all 3 addresses.');

  const pool = new ethers.Contract(poolAddress, SIMPLE_POOL_ABI, provider);
  const [poolMyToken, poolUsdt] = await Promise.all([pool.myToken(), pool.usdt()]);

  console.log('\nPool points to:');
  console.log(`- myToken(): ${norm(poolMyToken)}`);
  console.log(`- usdt():    ${norm(poolUsdt)}`);

  const mismatch = [];
  if (norm(poolMyToken) !== myTokenAddress) mismatch.push('myToken() != MY_TOKEN_ADDRESS');
  if (norm(poolUsdt) !== usdtAddress) mismatch.push('usdt() != USDT_ADDRESS');

  if (mismatch.length) {
    console.log('\n❌ Address mismatch (frontend/.env not in sync with deployed pool):');
    for (const m of mismatch) console.log(`- ${m}`);
    process.exitCode = 3;
  } else {
    console.log('\n✅ Pool addresses match your .env tokens.');
  }

  const myToken = new ethers.Contract(myTokenAddress, ERC20_ABI, provider);
  const usdt = new ethers.Contract(usdtAddress, ERC20_ABI, provider);

  const [
    mName,
    mSymbol,
    mDecimals,
    uName,
    uSymbol,
    uDecimals,
    reserveM,
    reserveU,
    totalL,
  ] = await Promise.all([
    myToken.name(),
    myToken.symbol(),
    myToken.decimals(),
    usdt.name(),
    usdt.symbol(),
    usdt.decimals(),
    pool.reserveMyToken(),
    pool.reserveUSDT(),
    pool.totalLiquidity(),
  ]);

  console.log('\nToken metadata:');
  console.log(`- MyToken: ${mName} (${mSymbol}), decimals=${mDecimals}`);
  console.log(`- USDT:    ${uName} (${uSymbol}), decimals=${uDecimals}`);

  console.log('\nPool state:');
  console.log(`- reserveMyToken:  ${ethers.formatUnits(reserveM, mDecimals)} ${mSymbol}`);
  console.log(`- reserveUSDT:     ${ethers.formatUnits(reserveU, uDecimals)} ${uSymbol}`);
  console.log(`- totalLiquidity:  ${ethers.formatUnits(totalL, 18)} (shares)`);

  console.log('\nIf MetaMask is on a different chain than the above chainId, the frontend will throw CALL_EXCEPTION / missing revert data.');
}

main().catch((e) => {
  console.error('\nFatal:', e);
  process.exitCode = 1;
});
