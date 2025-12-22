const net = require('net');
const { spawn } = require('child_process');

const HOST = '127.0.0.1';
const PORT = Number(process.env.HARDHAT_PORT || 8545);

function isPortOpen(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const done = (result) => {
      try {
        socket.destroy();
      } catch (_) {
        // ignore
      }
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));

    socket.connect(port, host);
  });
}

async function main() {
  const alreadyRunning = await isPortOpen(HOST, PORT);

  if (alreadyRunning) {
    console.log(`[dev-node] Hardhat RPC already running at http://${HOST}:${PORT}`);
    console.log('[dev-node] Reusing existing node (leave it running).');

    // Keep this process alive so `concurrently` doesn't treat it as finished.
    setInterval(() => {}, 60_000);
    return;
  }

  console.log(`[dev-node] Starting Hardhat node at http://${HOST}:${PORT} ...`);

  const child = spawn('npx', ['hardhat', 'node'], {
    stdio: 'inherit',
    shell: true,
  });

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[dev-node] Fatal:', err);
  process.exit(1);
});
