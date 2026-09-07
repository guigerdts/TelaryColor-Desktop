'use strict';

/**
 * Integration tests for crash retry + notification wiring.
 *
 * Verifies the end-to-end flow from backend child exit through retry
 * resolution, window reload, notification dispatch, and permanent-fail
 * dialog. Uses mock Electron APIs + fake backend process (no real Electron
 * runtime needed).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { startCrashRetry } = require('../src/retry');
const { RETRY_MAX_ATTEMPTS, RETRY_BASE_DELAY_MS } = require('../src/constants');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeChild(pid = 1001) {
  const child = new EventEmitter();
  child.pid = pid;
  return child;
}

function fakeTimers() {
  const calls = [];
  function timer(fn, ms) {
    calls.push({ fn, ms, resolved: false });
    return calls.length - 1;
  }
  function tick(expectedMs) {
    const idx = calls.findIndex((c) => !c.resolved && c.ms === expectedMs);
    assert.ok(idx !== -1, `No pending timer with delay ${expectedMs}ms`);
    calls[idx].resolved = true;
    calls[idx].fn();
    return calls[idx].fn;
  }
  function flush() {
    for (const c of calls) {
      if (!c.resolved) {
        c.resolved = true;
        c.fn();
      }
    }
  }
  return { timer, tick, flush, calls };
}

// ---------------------------------------------------------------------------
// 1. Retry → reload → window flow
// ---------------------------------------------------------------------------

test('integration: crash triggers retry → onReload called with new port', async () => {
  const child = fakeChild();
  const backendState = { mode: 'spawned', child, port: 8080 };
  const timers = fakeTimers();

  const loadURLCalls = [];
  const mockMainWindow = {
    webContents: {
      on: () => {},
    },
    loadURL: (url) => { loadURLCalls.push(url); },
  };

  let reloadPort = null;

  startCrashRetry(
    {
      backendState,
      exePath: '/fake/exe',
      dataDir: '/fake/data',
      portFile: '/fake/.port',
      isPackaged: false,
      onReload: (port) => {
        reloadPort = port;
        // Simulate what main.js onReload does
        mockMainWindow.loadURL(`http://127.0.0.1:${port}`);
      },
      onPermanentFail: () => {},
      notify: () => {},
    },
    {
      resolveBackend: async () => ({ mode: 'spawned', child: fakeChild(2002), port: 9090 }),
      setTimeout: timers.timer,
    }
  );

  // Trigger crash
  child.emit('exit', 1, null);
  timers.flush();
  await new Promise((r) => setImmediate(r));

  assert.equal(reloadPort, 9090, 'onReload called with new port');
  assert.equal(loadURLCalls.length, 1, 'loadURL called once after reload');
  assert.ok(
    loadURLCalls[0].includes('9090'),
    `loadURL should target new port, got: ${loadURLCalls[0]}`
  );
});

// ---------------------------------------------------------------------------
// 2. Port-change → re-login notification
// ---------------------------------------------------------------------------

test('integration: port change triggers re-login notification via notify', async () => {
  const child = fakeChild();
  const backendState = { mode: 'spawned', child, port: 8080 };
  const timers = fakeTimers();

  const notifyCalls = [];

  startCrashRetry(
    {
      backendState,
      exePath: '/fake/exe',
      dataDir: '/fake/data',
      portFile: '/fake/.port',
      isPackaged: false,
      onReload: () => {},
      onPermanentFail: () => {},
      notify: (event, ...args) => { notifyCalls.push({ event, args }); },
    },
    {
      resolveBackend: async () => ({ mode: 'spawned', child: fakeChild(2002), port: 9090 }),
      setTimeout: timers.timer,
    }
  );

  // Trigger crash
  child.emit('exit', 1, null);
  timers.flush();
  await new Promise((r) => setImmediate(r));

  // retry.js calls notify('restarted', attempt) on port change
  assert.ok(notifyCalls.length > 0, 'notify was called');
  assert.equal(
    notifyCalls[0].event,
    'restarted',
    'notify called with restarted event'
  );
});

// ---------------------------------------------------------------------------
// 3. Permanent-fail → dialog + quit
// ---------------------------------------------------------------------------

test('integration: exhausted retries triggers onPermanentFail', async () => {
  const child = fakeChild();
  const backendState = { mode: 'spawned', child, port: 8080 };
  const timers = fakeTimers();

  let permanentFailCalled = false;
  let dialogShown = false;
  let appQuit = false;

  startCrashRetry(
    {
      backendState,
      exePath: '/fake/exe',
      dataDir: '/fake/data',
      portFile: '/fake/.port',
      isPackaged: false,
      onReload: () => {},
      onPermanentFail: () => {
        permanentFailCalled = true;
        // Simulate what main.js onPermanentFail does
        dialogShown = true;
        appQuit = true;
      },
      notify: () => {},
    },
    {
      resolveBackend: async () => { throw new Error('always fails'); },
      setTimeout: timers.timer,
    }
  );

  // Trigger crash
  child.emit('exit', 1, null);

  // Exhaust all retry attempts
  for (let i = 0; i < RETRY_MAX_ATTEMPTS; i++) {
    const expectedDelay = RETRY_BASE_DELAY_MS * Math.pow(2, i);
    timers.tick(expectedDelay);
    await new Promise((r) => setImmediate(r));
  }

  assert.equal(permanentFailCalled, true, 'onPermanentFail called after exhaustion');
  assert.equal(dialogShown, true, 'error dialog shown');
  assert.equal(appQuit, true, 'app.quit() called');
});

// ---------------------------------------------------------------------------
// 4. Notification wiring: same-port path skips notification
// ---------------------------------------------------------------------------

test('integration: same port recovery does NOT trigger re-login notification', async () => {
  const child = fakeChild();
  const backendState = { mode: 'spawned', child, port: 8080 };
  const timers = fakeTimers();

  let notifyCalls = [];

  startCrashRetry(
    {
      backendState,
      exePath: '/fake/exe',
      dataDir: '/fake/data',
      portFile: '/fake/.port',
      isPackaged: false,
      onReload: () => {},
      onPermanentFail: () => {},
      notify: (event, ...args) => { notifyCalls.push({ event, args }); },
    },
    {
      resolveBackend: async () => ({ mode: 'reused', child: null, port: 8080 }),
      setTimeout: timers.timer,
    }
  );

  // Trigger crash
  child.emit('exit', 1, null);
  timers.flush();
  await new Promise((r) => setImmediate(r));

  assert.equal(notifyCalls.length, 0, 'no notification on same-port recovery');
});

// ---------------------------------------------------------------------------
// 5. Multiple crash-recovery cycles with port changes
// ---------------------------------------------------------------------------

test('integration: sequential crashes with different ports trigger notifications each time', async () => {
  const child = fakeChild();
  const backendState = { mode: 'spawned', child, port: 8080 };
  const timers = fakeTimers();

  let reloadPorts = [];
  let notifyCalls = [];
  // Track children returned by resolveBackend so we can emit exit on them
  const returnedChildren = [];

  startCrashRetry(
    {
      backendState,
      exePath: '/fake/exe',
      dataDir: '/fake/data',
      portFile: '/fake/.port',
      isPackaged: false,
      onReload: (port) => { reloadPorts.push(port); },
      onPermanentFail: () => {},
      notify: (event, ...args) => { notifyCalls.push({ event, args }); },
    },
    {
      resolveBackend: async () => {
        const nextPort = reloadPorts.length === 0 ? 9090 : 9091;
        const newChild = fakeChild(2000 + reloadPorts.length);
        returnedChildren.push(newChild);
        return { mode: 'spawned', child: newChild, port: nextPort };
      },
      setTimeout: timers.timer,
    }
  );

  // First crash
  child.emit('exit', 1, null);
  timers.flush();
  await new Promise((r) => setImmediate(r));

  assert.equal(reloadPorts.length, 1, 'first reload');
  assert.equal(reloadPorts[0], 9090);
  assert.equal(notifyCalls.length, 1, 'first notification');

  // Second crash — emit on the child returned by resolveBackend
  // (startCrashRetry attaches the exit listener to result.child internally)
  returnedChildren[0].emit('exit', 1, null);
  timers.flush();
  await new Promise((r) => setImmediate(r));

  assert.equal(reloadPorts.length, 2, 'second reload');
  assert.equal(reloadPorts[1], 9091);
  assert.equal(notifyCalls.length, 2, 'second notification');
});

// ---------------------------------------------------------------------------
// 6. No child → startCrashRetry is a no-op
// ---------------------------------------------------------------------------

test('integration: no child in backendState → retry wiring is inert', async () => {
  let onReloadCalled = false;
  let onPermanentFailCalled = false;
  let notifyCalled = false;

  startCrashRetry(
    {
      backendState: { mode: 'reused', child: null, port: 8080 },
      exePath: '/fake/exe',
      dataDir: '/fake/data',
      portFile: '/fake/.port',
      isPackaged: false,
      onReload: () => { onReloadCalled = true; },
      onPermanentFail: () => { onPermanentFailCalled = true; },
      notify: () => { notifyCalled = true; },
    },
    {
      resolveBackend: async () => { throw new Error('should not be called'); },
    }
  );

  await new Promise((r) => setImmediate(r));

  assert.equal(onReloadCalled, false, 'onReload not called');
  assert.equal(onPermanentFailCalled, false, 'onPermanentFail not called');
  assert.equal(notifyCalled, false, 'notify not called');
});
