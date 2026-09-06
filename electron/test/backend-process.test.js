'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pollPortFile, waitHealth, waitExit, hardKill } = require('../src/backend-process');
const { PORT_POLL_TIMEOUT_MS, PORT_POLL_INTERVAL_MS, HEALTH_GATE_TIMEOUT_MS } = require('../src/constants');

function mkdtemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bp-test-'));
}

test('pollPortFile finds port written by child process', async () => {
  const dir = mkdtemp();
  const portFile = path.join(dir, '.port');
  try {
    // Child writes the port to the file
    const child = spawn(process.execPath, [
      '-e',
      `require('fs').writeFileSync('${portFile.replace(/\\/g, '\\\\')}', '9876')`,
    ], { stdio: 'ignore' });
    await new Promise((r) => child.on('exit', r));
    const port = await pollPortFile(portFile, 2000);
    assert.equal(port, 9876);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pollPortFile rejects on timeout when file never appears', async () => {
  const dir = mkdtemp();
  const portFile = path.join(dir, '.port');
  try {
    await assert.rejects(
      () => pollPortFile(portFile, 300),
      (err) => {
        assert.ok(err instanceof Error);
        return true;
      }
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('waitExit resolves when child exits', async () => {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  const result = await waitExit(child, 5000);
  assert.equal(result, 0);
});

test('waitExit rejects when child does not exit within timeout', async () => {
  // Child that sleeps forever
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  try {
    await assert.rejects(
      () => waitExit(child, 200),
      (err) => {
        assert.ok(err instanceof Error);
        return true;
      }
    );
  } finally {
    child.kill();
  }
});

test('hardKill sends SIGKILL on non-win32', async () => {
  if (process.platform === 'win32') {
    return; // skip on Windows — win32 branch uses taskkill
  }
  const child = spawn(process.execPath, [
    '-e',
    'setTimeout(() => {}, 60000)',
  ], { stdio: 'ignore' });
  // Wait for child to be alive
  await new Promise((r) => setTimeout(r, 50));
  hardKill(child.pid);
  const code = await new Promise((r) => child.on('exit', (c) => r(c)));
  assert.equal(code, null); // SIGKILL exits with signal, code=null
});
