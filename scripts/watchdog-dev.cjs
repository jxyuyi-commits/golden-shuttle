// PatternMaster Pro dev service watchdog (node, no encoding issues)
// Triggered by Windows Scheduled Task every 2 min: check 5173/3001, auto-restart if down
// Hosted by Task Scheduler service -> survives agent/terminal session endings
const { execSync, spawn } = require('child_process');
const net = require('net');
const fs = require('fs');

const WD = 'D:/dev/golden-shuttle';
const LOG = WD + '/_watchdog.log';

function log(m) {
  try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); } catch (e) {}
}

const portAlive = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});

const waitPortsAlive = async (tries, gapMs) => {
  for (let i = 0; i < tries; i++) {
    const a = await portAlive(5173);
    const b = await portAlive(3001);
    if (a && b) return true;
    await new Promise(r => setTimeout(r, gapMs));
  }
  return false;
};

(async () => {
  // fast path: services healthy -> exit
  if (await waitPortsAlive(1, 0)) process.exit(0);

  log('detected service down (5173/3001), restarting...');

  // kill leftover listeners on the two ports to avoid conflicts
  try {
    execSync('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173,3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"', { timeout: 15000 });
  } catch (e) { /* ignore */ }
  await new Promise(r => setTimeout(r, 1000));

  // detached + unref: child outlives parent
  const child = spawn('node', ['scripts/dev.cjs'], { cwd: WD, detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();

  // wait up to ~60s for both ports (dev cold start can be slow)
  const ok = await waitPortsAlive(12, 5000);
  log(ok ? 'restart OK' : 'restart FAILED, will retry next round');
})().catch(e => log('watchdog error: ' + e.message));
