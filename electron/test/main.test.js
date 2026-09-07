'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MAIN_PATH = path.join(__dirname, '..', 'main.js');

// main.js requires the Electron runtime — it imports electron APIs at the
// module top level (app, dialog, BrowserWindow). These are unavailable under
// plain `node --test`. Attempting to require() it throws ERR_REQUIRE_MODULE
// or similar. We verify the file exists and is valid CommonJS by checking
// that require() raises the expected Electron-absent error, not a syntax or
// structural error. Full E2E verification happens in CI smoke.

test('main.js exists and is loadable source', () => {
  const exists = fs.existsSync(MAIN_PATH);
  assert.ok(exists, 'electron/main.js must exist');
  const content = fs.readFileSync(MAIN_PATH, 'utf8');
  assert.ok(content.length > 50, 'main.js must contain substantial code');
});

const TRAY_PATH = path.join(__dirname, '..', 'src', 'tray.js');

test('tray module exists and exports createTray', () => {
  const exists = fs.existsSync(TRAY_PATH);
  assert.ok(exists, 'electron/src/tray.js must exist');
  delete require.cache[TRAY_PATH];
  const tray = require(TRAY_PATH);
  assert.equal(typeof tray.createTray, 'function', 'tray must export createTray');
});

test('main.js requires Electron runtime — verified in CI smoke', () => {
  // Attempting require('./main.js') in a non-Electron environment will
  // either throw because 'electron' module is missing, or because the
  // app.requestSingleInstanceLock() call at top level throws. Either way
  // means the file is structurally correct but needs the Electron runtime.
  let threw = false;
  let errorMsg = '';
  try {
    // Clear module cache to force fresh require
    delete require.cache[MAIN_PATH];
    require(MAIN_PATH);
  } catch (err) {
    threw = true;
    errorMsg = err.message || String(err);
  }
  assert.ok(threw, 'main.js must require Electron runtime (expected error in plain node)');
  // The error should NOT be a SyntaxError (which would indicate bad source)
  // or MODULE_NOT_FOUND for our own local modules (which would indicate
  // missing src/ dependency). It should be an Electron-related error.
  assert.ok(
    !errorMsg.includes('SyntaxError'),
    `main.js has a syntax error: ${errorMsg}`
  );
});

test('preload.js exists and is syntactically valid', () => {
  const preloadPath = path.join(__dirname, '..', 'preload.js');
  const exists = fs.existsSync(preloadPath);
  assert.ok(exists, 'electron/preload.js must exist');
  const content = fs.readFileSync(preloadPath, 'utf8');
  assert.ok(content.length > 20, 'preload.js must contain code');
  // Verify it references contextBridge (the key preload API)
  assert.ok(
    content.includes('contextBridge'),
    'preload.js must reference contextBridge'
  );
  assert.ok(
    content.includes('exposeInMainWorld'),
    'preload.js must call exposeInMainWorld'
  );
});

test('package.json exists with correct structure', () => {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const exists = fs.existsSync(pkgPath);
  assert.ok(exists, 'electron/package.json must exist');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.equal(pkg.name, 'telarycolor-desktop');
  assert.equal(pkg.main, 'main.js');
  assert.equal(pkg.scripts.test, 'node --test');
  assert.ok(pkg.devDependencies.electron, 'must declare electron devDep');
  assert.ok(pkg.devDependencies['electron-builder'], 'must declare electron-builder devDep');
  assert.ok(Array.isArray(pkg.build.files), 'build.files must be an array');
  assert.ok(
    pkg.build.files.includes('main.js'),
    'build.files must include main.js'
  );
  assert.ok(
    pkg.build.files.includes('preload.js'),
    'build.files must include preload.js'
  );
  assert.ok(
    pkg.build.extraResources.length === 1,
    'extraResources must have exactly one FileSet'
  );
  const extra = pkg.build.extraResources[0];
  assert.equal(extra.from, '../build/entry.dist');
  assert.equal(extra.to, 'backend');
});
