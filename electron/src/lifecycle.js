'use strict';

const fs = require('node:fs');
const {
  BACKEND_PROBE_TIMEOUT_MS,
  PORT_POLL_TIMEOUT_MS,
  HEALTH_GATE_TIMEOUT_MS,
  SHUTDOWN_GRACE_TIMEOUT_MS,
} = require('./constants');
const { probeHealth, requestShutdown } = require('./http-client');
const {
  spawnBackend: defaultSpawnBackend,
  pollPortFile: defaultPollPortFile,
  waitHealth: defaultWaitHealth,
  waitExit: defaultWaitExit,
  hardKill: defaultHardKill,
} = require('./backend-process');

/**
 * Probe-or-spawn backend lifecycle orchestration.
 *
 * resolveBackend reads the .port file, probes /health to decide reuse
 * or spawn. shutdown orchestrates graceful shutdown with kill fallback.
 *
 * Both accept an optional `deps` parameter for testability (design D4):
 * production code never passes `deps`; tests inject mocks.
 */

/**
 * Resolve the backend: probe an existing .port, or spawn a new backend.
 *
 * @param {object} opts - exePath, dataDir, portFile, isPackaged
 * @param {object} [deps] - optional mocks for testing
 * @returns {Promise<{mode: 'reused'|'spawned', child: ChildProcess|null, port: number}>}
 */
async function resolveBackend({ exePath, dataDir, portFile, isPackaged }, deps = {}) {
  const {
    probeHealth: _probeHealth = probeHealth,
    spawnBackend: _spawnBackend = defaultSpawnBackend,
    pollPortFile: _pollPortFile = defaultPollPortFile,
    waitHealth: _waitHealth = defaultWaitHealth,
    _readFile = fs.readFileSync,
  } = deps;

  // Step 1: try to read .port file
  let existingPort = null;
  try {
    const content = _readFile(portFile, 'utf8').trim();
    const parsed = parseInt(content, 10);
    if (parsed > 0 && parsed <= 65535) {
      existingPort = parsed;
    }
  } catch {
    // .port missing or unreadable — proceed to spawn
  }

  // Step 2: if .port exists, probe health
  if (existingPort !== null) {
    const healthy = await _probeHealth(existingPort, BACKEND_PROBE_TIMEOUT_MS);
    if (healthy) {
      return { mode: 'reused', child: null, port: existingPort };
    }
  }

  // Step 3: dead/missing → spawn
  const child = _spawnBackend(exePath);
  const port = await _pollPortFile(portFile, PORT_POLL_TIMEOUT_MS);
  await _waitHealth(port, HEALTH_GATE_TIMEOUT_MS);
  return { mode: 'spawned', child, port };
}

/**
 * Shut down the backend gracefully.
 *
 * Design D3: kill only if WE spawned it. A reused backend is left running.
 *
 * @param {object} opts - mode, child, port
 * @param {object} [deps] - optional mocks for testing
 */
async function shutdown({ mode, child, port }, deps = {}) {
  const {
    requestShutdown: _requestShutdown = requestShutdown,
    waitExit: _waitExit = defaultWaitExit,
    hardKill: _hardKill = defaultHardKill,
  } = deps;

  // D3: no-op for reused backends
  if (mode === 'reused') return;

  // Spawned: graceful shutdown → wait grace → hard kill fallback
  await _requestShutdown(port);
  try {
    await _waitExit(child, SHUTDOWN_GRACE_TIMEOUT_MS);
  } catch {
    // Grace timeout — force kill the child tree
    _hardKill(child.pid);
  }
}

module.exports = {
  resolveBackend,
  shutdown,
};
