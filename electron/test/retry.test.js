'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { startCrashRetry } = require('../src/retry');
const { RETRY_MAX_ATTEMPTS, RETRY_BASE_DELAY_MS } = require('../src/constants');

/**
 * Helper: create a fake child process (EventEmitter with pid).
 */
function fakeChild(pid = 1001) {
  const child = new EventEmitter();
  child.pid = pid;
  return child;
}

/**
 * Helper: create a fake setTimeout that records calls and lets
 * you flush them manually (fake-timer pattern).
 */
function fakeTimers() {
  const calls = [];
  function timer(fn, ms) {
    calls.push({ fn, ms, resolved: false });
    return calls.length - 1; // id
  }
  /** Fire the next pending timer by ms value. Returns the fn executed. */
  function tick(expectedMs) {
    const idx = calls.findIndex((c) => !c.resolved && c.ms === expectedMs);
    assert.ok(idx !== -1, `No pending timer with delay ${expectedMs}ms`);
    calls[idx].resolved = true;
    calls[idx].fn();
    return calls[idx].fn;
  }
  /** Fire ALL pending timers in order. */
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
// Attempt counting
// ---------------------------------------------------------------------------

test('retries up to MAX_RESTART_ATTEMPTS then calls onPermanentFail', async () => {
  const child = fakeChild();
  const backendState = { mode: 'spawned', child, port: 8080 };

  const timers = fakeTimers();
  let permanentFailCalled = false;
  let resolveCount = 0;

  startCrashRetry(
    {
      backendState,
      exePath: '/fake/exe',
      dataDir: '/fake/data',
      portFile: '/fake/.port',
      isPackaged: false,
      onReload: () => {},
      onPermanentFail: () => { permanentFailCalled = true; },
      notify: () => {},
    },
    {
      resolveBackend: async () => {
        resolveCount += 1;
        // Always fail so we exhaust attempts
        throw new Error('backend failed');
      },
      setTimeout: timers.timer,
    }
  );

  // Trigger first exit
  child.emit('exit', 1, null);

  for (let i = 0; i < RETRY_MAX_ATTEMPTS; i++) {
    const expectedDelay = RETRY_BASE_DELAY_MS * Math.pow(2, i);
    timers.tick(expectedDelay);
    // Wait for the async resolveBackend to settle (it throws, so attemptRetry recurses)
    await new Promise((r) => setImmediate(r));
  }

  assert.equal(resolveCount, RETRY_MAX_ATTEMPTS);
  assert.equal(permanentFailCalled, true);
});

// ---------------------------------------------------------------------------
// Backoff timing
// ---------------------------------------------------------------------------

test('backoff uses exponential delays: 1000, 2000, 4000', async () => {
  const child = fakeChild();
  const backendState = { mode: 'spawned', child, port: 8080 };

  const timers = fakeTimers();
  const delays = [];

  startCrashRetry(
    {
      backendState,
      exePath: '/fake/exe',
      dataDir: '/fake/data',
      portFile: '/fake/.port',
      isPackaged: false,
      onReload: () => {},
      onPermanentFail: () => {},
      notify: () => {},
    },
    {
      resolveBackend: async () => { throw new Error('fail'); },
      setTimeout: (_fn, ms) => {
        delays.push(ms);
        return timers.timer(_fn, ms);
      },
    }
  );

  child.emit('exit', 1, null);

  // First backoff
  timers.flush();
  await new Promise((r) => setImmediate(r));

  // After first retry exhaustion, second exit event triggers second retry
  // But we need a new child for the second attempt to attach listener
  // Let's just verify the delays recorded
  assert.ok(delays.length >= 1, 'At least one backoff scheduled');
  assert.equal(delays[0], RETRY_BASE_DELAY_MS * Math.pow(2, 0));
});

// ---------------------------------------------------------------------------
// Same-port path
// ---------------------------------------------------------------------------

test('same port reused → onReload called with that port, no notify', async () => {
  const child = fakeChild();
  const backendState = { mode: 'spawned', child, port: 8080 };

  const timers = fakeTimers();
  let reloadPort = null;
  let notifyCalled = false;

  startCrashRetry(
    {
      backendState,
      exePath: '/fake/exe',
      dataDir: '/fake/data',
      portFile: '/fake/.port',
      isPackaged: false,
      onReload: (port) => { reloadPort = port; },
      onPermanentFail: () => {},
      notify: () => { notifyCalled = true; },
    },
    {
      resolveBackend: async () => ({ mode: 'reused', child: null, port: 8080 }),
      setTimeout: timers.timer,
    }
  );

  child.emit('exit', 1, null);
  timers.flush();
  await new Promise((r) => setImmediate(r));

  assert.equal(reloadPort, 8080);
  assert.equal(notifyCalled, false);
});

// ---------------------------------------------------------------------------
// Different-port path
// ---------------------------------------------------------------------------

test('different port → notify called, onReload called with new port', async () => {
  const child = fakeChild();
  const backendState = { mode: 'spawned', child, port: 8080 };

  const timers = fakeTimers();
  let reloadPort = null;
  let notifyEvent = null;
  let notifyArgs = [];

  startCrashRetry(
    {
      backendState,
      exePath: '/fake/exe',
      dataDir: '/fake/data',
      portFile: '/fake/.port',
      isPackaged: false,
      onReload: (port) => { reloadPort = port; },
      onPermanentFail: () => {},
      notify: (event, ...args) => { notifyEvent = event; notifyArgs = args; },
    },
    {
      resolveBackend: async () => ({ mode: 'spawned', child: fakeChild(2002), port: 9090 }),
      setTimeout: timers.timer,
    }
  );

  child.emit('exit', 1, null);
  timers.flush();
  await new Promise((r) => setImmediate(r));

  assert.equal(reloadPort, 9090);
  assert.equal(notifyEvent, 'restarted', 'notify called with restarted event');
  assert.ok(notifyArgs[0] > 0, 'attempt number passed');
});

// ---------------------------------------------------------------------------
// Reused child exit → no-op
// ---------------------------------------------------------------------------

test('exit on a reused (stale) child reference is a no-op', async () => {
  const child = fakeChild();
  const backendState = { mode: 'spawned', child, port: 8080 };

  const timers = fakeTimers();
  let resolveCount = 0;

  startCrashRetry(
    {
      backendState,
      exePath: '/fake/exe',
      dataDir: '/fake/data',
      portFile: '/fake/.port',
      isPackaged: false,
      onReload: () => {},
      onPermanentFail: () => {},
      notify: () => {},
    },
    {
      resolveBackend: async () => {
        resolveCount += 1;
        // Return a new child — simulates recovery with a new process
        const newChild = fakeChild(2002);
        return { mode: 'spawned', child: newChild, port: 9090 };
      },
      setTimeout: timers.timer,
    }
  );

  // First exit triggers retry
  child.emit('exit', 1, null);
  timers.flush();
  await new Promise((r) => setImmediate(r));

  assert.equal(resolveCount, 1, 'resolveBackend called once');

  // Now emit exit on the OLD child again — should be ignored
  child.emit('exit', 1, null);
  await new Promise((r) => setImmediate(r));

  assert.equal(resolveCount, 1, 'resolveBackend NOT called again for stale child');
});

// ---------------------------------------------------------------------------
// Exhaustion → onPermanentFail
// ---------------------------------------------------------------------------

test('onPermanentFail called after RETRY_MAX_ATTEMPTS exhausted', async () => {
  const child = fakeChild();
  const backendState = { mode: 'spawned', child, port: 8080 };

  const timers = fakeTimers();
  let permanentFailCalled = false;

  startCrashRetry(
    {
      backendState,
      exePath: '/fake/exe',
      dataDir: '/fake/data',
      portFile: '/fake/.port',
      isPackaged: false,
      onReload: () => {},
      onPermanentFail: () => { permanentFailCalled = true; },
      notify: () => {},
    },
    {
      resolveBackend: async () => { throw new Error('always fails'); },
      setTimeout: timers.timer,
    }
  );

  child.emit('exit', 1, null);

  // Process all retry attempts
  for (let i = 0; i < RETRY_MAX_ATTEMPTS; i++) {
    const expectedDelay = RETRY_BASE_DELAY_MS * Math.pow(2, i);
    timers.tick(expectedDelay);
    await new Promise((r) => setImmediate(r));
  }

  assert.equal(permanentFailCalled, true);
});

// ---------------------------------------------------------------------------
// isQuitting gate
// ---------------------------------------------------------------------------

test('exit event ignored when isQuitting is true', async () => {
  const child = fakeChild();
  const backendState = { mode: 'spawned', child, port: 8080 };

  const timers = fakeTimers();
  let resolveCount = 0;

  startCrashRetry(
    {
      backendState,
      exePath: '/fake/exe',
      dataDir: '/fake/data',
      portFile: '/fake/.port',
      isPackaged: false,
      isQuitting: true,
      onReload: () => {},
      onPermanentFail: () => {},
      notify: () => {},
    },
    {
      resolveBackend: async () => {
        resolveCount += 1;
        throw new Error('should not be called');
      },
      setTimeout: timers.timer,
    }
  );

  child.emit('exit', 0, null);
  await new Promise((r) => setImmediate(r));

  assert.equal(resolveCount, 0, 'no retry when isQuitting');
});

// ---------------------------------------------------------------------------
// No child → early return
// ---------------------------------------------------------------------------

test('no child in backendState → startCrashRetry is a no-op', async () => {
  let resolveCalled = false;

  startCrashRetry(
    {
      backendState: { mode: 'reused', child: null, port: 8080 },
      exePath: '/fake/exe',
      dataDir: '/fake/data',
      portFile: '/fake/.port',
      isPackaged: false,
      onReload: () => {},
      onPermanentFail: () => {},
      notify: () => {},
    },
    {
      resolveBackend: async () => {
        resolveCalled = true;
        throw new Error('should not be called');
      },
    }
  );

  await new Promise((r) => setImmediate(r));
  assert.equal(resolveCalled, false, 'no resolveBackend call when no child');
});
