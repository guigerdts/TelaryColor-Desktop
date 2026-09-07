'use strict';

/**
 * Unit tests for src/updater.js (design D5).
 *
 * Every test uses a fake `autoUpdater` injected via the `deps?` parameter
 * so the module runs without an Electron runtime or electron-updater.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { initUpdater } = require('../src/updater');

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function makeFakeAutoUpdater() {
  const emitter = new EventEmitter();
  const calls = [];

  const fake = {
    channel: 'latest',
    on: (event, cb) => emitter.on(event, cb),
    checkForUpdates: () => calls.push('checkForUpdates'),
    quitAndInstall: () => calls.push('quitAndInstall'),
    // Expose helpers for tests
    __emit: (event, data) => emitter.emit(event, data),
    __calls: () => calls,
    __reset: () => { calls.length = 0; },
  };

  return fake;
}

// -----------------------------------------------------------------------
// initUpdater — channel defaults
// -----------------------------------------------------------------------

test('initUpdater defaults channel to latest', () => {
  const au = makeFakeAutoUpdater();
  au.channel = undefined;
  initUpdater({}, { autoUpdater: au });

  assert.equal(au.channel, 'latest');
});

test('initUpdater preserves an explicit channel', () => {
  const au = makeFakeAutoUpdater();
  au.channel = 'beta';
  initUpdater({}, { autoUpdater: au });

  assert.equal(au.channel, 'beta');
});

// -----------------------------------------------------------------------
// initUpdater — checkForUpdates
// -----------------------------------------------------------------------

test('checkForUpdates calls autoUpdater.checkForUpdates once', () => {
  const au = makeFakeAutoUpdater();
  const { checkForUpdates } = initUpdater({}, { autoUpdater: au });

  checkForUpdates();
  checkForUpdates();

  const calls = au.__calls();
  const checkCalls = calls.filter((c) => c === 'checkForUpdates');
  assert.equal(checkCalls.length, 2);
});

// -----------------------------------------------------------------------
// initUpdater — onAvailable callback
// -----------------------------------------------------------------------

test('onAvailable fires with version when update-available is emitted', () => {
  const au = makeFakeAutoUpdater();
  const received = [];
  initUpdater({ onAvailable: (v) => received.push(v) }, { autoUpdater: au });

  au.__emit('update-available', { version: '2.1.0' });

  assert.deepEqual(received, ['2.1.0']);
});

test('onAvailable fires for each update-available event', () => {
  const au = makeFakeAutoUpdater();
  const received = [];
  initUpdater({ onAvailable: (v) => received.push(v) }, { autoUpdater: au });

  au.__emit('update-available', { version: '1.0.0' });
  au.__emit('update-available', { version: '1.1.0' });

  assert.deepEqual(received, ['1.0.0', '1.1.0']);
});

test('onAvailable defaults to no-op when not provided', () => {
  const au = makeFakeAutoUpdater();
  initUpdater({}, { autoUpdater: au });

  // Should not throw
  au.__emit('update-available', { version: '1.0.0' });
});

// -----------------------------------------------------------------------
// initUpdater — quitAndInstall
// -----------------------------------------------------------------------

test('quitAndInstall delegates to autoUpdater.quitAndInstall', () => {
  const au = makeFakeAutoUpdater();
  const { quitAndInstall } = initUpdater({}, { autoUpdater: au });

  quitAndInstall();

  assert.deepEqual(au.__calls(), ['quitAndInstall']);
});
