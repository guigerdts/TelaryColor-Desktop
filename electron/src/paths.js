'use strict';

const path = require('node:path');

const BACKEND_EXE_NAME = 'telarycolor-server.exe';
const BACKEND_DIR_NAME = 'backend';

/**
 * Path derivation for the backend + data directories (design module
 * structure, spec "Data Path Derivation").
 *
 * These are PURE functions: they take their inputs as parameters so the
 * module can be imported and tested under node:test WITHOUT the Electron
 * runtime. main.js (the composition root) is the only place that wires in
 * Electron APIs like process.resourcesPath and app.getPath('appData').
 */

/**
 * Absolute path to the backend executable/entry.
 *
 * Packaged: <resourcesPath>/backend/telarycolor-server.exe
 * Dev:      <repoRoot>/backend/entry.py
 */
function backendExePath({ resourcesPath, repoRoot, isPackaged }) {
  if (isPackaged) {
    return path.join(resourcesPath, BACKEND_DIR_NAME, BACKEND_EXE_NAME);
  }
  return path.join(repoRoot, BACKEND_DIR_NAME, 'entry.py');
}

/**
 * Absolute path to the data directory.
 *
 * Packaged: <appData>/TelaryColor/data  (mirrors backend %APPDATA%/TelaryColor)
 * Dev:      <repoRoot>/backend/data      (mirrors the dev backend/data dir)
 */
function deriveDataDir({ appData, repoRoot, isPackaged }) {
  if (isPackaged) {
    return path.join(appData, 'TelaryColor', 'data');
  }
  return path.join(repoRoot, BACKEND_DIR_NAME, 'data');
}

/**
 * Absolute path to the canonical .port file inside a data dir.
 * `.port` is the primary port-discovery contract, never stdout parsing.
 */
function portFile(dataDir) {
  return path.join(dataDir, '.port');
}

module.exports = {
  backendExePath,
  deriveDataDir,
  portFile,
};
