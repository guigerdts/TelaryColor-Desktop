'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { resolveBackend, shutdown } = require('../src/lifecycle');

function mkdtemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lc-test-'));
}

test('resolveBackend: healthy portFile → mode=reused, child=null', async () => {
  const dir = mkdtemp();
  const portFile = path.join(dir, '.port');
  fs.writeFileSync(portFile, '4321');
  let spawnCalled = false;
  try {
    const result = await resolveBackend(
      { exePath: '/fake/exe', dataDir: dir, portFile, isPackaged: false },
      {
        probeHealth: async () => true,
        spawnBackend: () => { spawnCalled = true; return {}; },
      }
    );
    assert.equal(result.mode, 'reused');
    assert.equal(result.child, null);
    assert.equal(result.port, 4321);
    assert.equal(spawnCalled, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveBackend: dead portFile → mode=spawned, child returned', async () => {
  const dir = mkdtemp();
  const portFile = path.join(dir, '.port');
  // .port exists but health probe fails
  fs.writeFileSync(portFile, '5555');
  const fakeChild = new EventEmitter();
  let spawnCalled = false;
  try {
    const result = await resolveBackend(
      { exePath: '/fake/exe', dataDir: dir, portFile, isPackaged: false },
      {
        probeHealth: async () => false,
        spawnBackend: (exe) => { spawnCalled = true; return fakeChild; },
        pollPortFile: async () => 5556,
        waitHealth: async () => true,
      }
    );
    assert.equal(result.mode, 'spawned');
    assert.equal(result.child, fakeChild);
    assert.equal(result.port, 5556);
    assert.equal(spawnCalled, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveBackend: no .port file → mode=spawned, child returned', async () => {
  const dir = mkdtemp();
  const portFile = path.join(dir, '.port');
  const fakeChild = new EventEmitter();
  try {
    const result = await resolveBackend(
      { exePath: '/fake/exe', dataDir: dir, portFile, isPackaged: false },
      {
        probeHealth: async () => true,
        spawnBackend: () => fakeChild,
        pollPortFile: async () => 7777,
        waitHealth: async () => true,
      }
    );
    assert.equal(result.mode, 'spawned');
    assert.equal(result.child, fakeChild);
    assert.equal(result.port, 7777);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('shutdown: reused mode → no-op, no hardKill', async () => {
  let hardKillCalled = false;
  await shutdown(
    { mode: 'reused', child: null, port: 4321 },
    {
      requestShutdown: async () => { throw new Error('should not be called'); },
      hardKill: () => { hardKillCalled = true; },
    }
  );
  assert.equal(hardKillCalled, false);
});

test('shutdown: spawned mode, child exits within grace → no hardKill', async () => {
  let hardKillCalled = false;
  const fakeChild = new EventEmitter();
  fakeChild.pid = 99999;
  // Simulate exit after shutdown request
  setTimeout(() => fakeChild.emit('exit', 0, null), 50);
  await shutdown(
    { mode: 'spawned', child: fakeChild, port: 8080 },
    {
      requestShutdown: async () => ({ ok: true, status: 200 }),
      waitExit: async () => 0,
      hardKill: () => { hardKillCalled = true; },
    }
  );
  assert.equal(hardKillCalled, false);
});

test('shutdown: spawned mode, timeout → hardKill invoked', async () => {
  let hardKillCalled = false;
  let hardKillPid = null;
  const fakeChild = new EventEmitter();
  fakeChild.pid = 12345;
  await shutdown(
    { mode: 'spawned', child: fakeChild, port: 8080 },
    {
      requestShutdown: async () => ({ ok: true, status: 200 }),
      waitExit: async () => { throw new Error('timeout'); },
      hardKill: (pid) => { hardKillCalled = true; hardKillPid = pid; },
    }
  );
  assert.equal(hardKillCalled, true);
  assert.equal(hardKillPid, 12345);
});

test('shutdown: spawned mode, requestShutdown fails → still attempts hardKill on timeout', async () => {
  let hardKillCalled = false;
  const fakeChild = new EventEmitter();
  fakeChild.pid = 11111;
  await shutdown(
    { mode: 'spawned', child: fakeChild, port: 8080 },
    {
      requestShutdown: async () => ({ ok: false, status: 0 }),
      waitExit: async () => { throw new Error('timeout'); },
      hardKill: () => { hardKillCalled = true; },
    }
  );
  assert.equal(hardKillCalled, true);
});
