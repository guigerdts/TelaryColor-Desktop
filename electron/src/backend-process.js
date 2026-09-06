'use strict';

const fs = require('node:fs');
const { spawn, execSync } = require('node:child_process');
const { PORT_POLL_INTERVAL_MS, PORT_POLL_TIMEOUT_MS, HEALTH_GATE_TIMEOUT_MS } = require('./constants');
const { probeHealth } = require('./http-client');

/**
 * Spawn the backend executable as a child process.
 *
 * detached:false → child dies with parent (design D3 ownership).
 * windowsHide:true → no console flash on Windows (spec: Console Hidden).
 * stdio:'ignore' → no pipe overhead; errors come via 'error' event.
 */
function spawnBackend(exePath) {
  const child = spawn(exePath, [], {
    detached: false,
    windowsHide: true,
    stdio: 'ignore',
  });
  // Emit 'error' event if spawn fails (exe missing, permission denied, etc.)
  return child;
}

/**
 * Poll the .port file until it contains a valid port number, or timeout.
 *
 * Uses fs.watch + interval-based fallback for reliability across platforms.
 */
function pollPortFile(portFile, timeoutMs = PORT_POLL_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        clearInterval(interval);
        try { watcher.close(); } catch {}
        reject(new Error(`Timed out waiting for port file: ${portFile}`));
      }
    }, timeoutMs);

    const interval = setInterval(() => {
      try {
        const content = fs.readFileSync(portFile, 'utf8').trim();
        const port = parseInt(content, 10);
        if (port > 0 && port <= 65535) {
          if (!settled) {
            settled = true;
            clearInterval(interval);
            clearTimeout(timer);
            try { watcher.close(); } catch {}
            resolve(port);
          }
        }
      } catch {}
    }, PORT_POLL_INTERVAL_MS);

    // Also try immediately
    try {
      const content = fs.readFileSync(portFile, 'utf8').trim();
      const port = parseInt(content, 10);
      if (port > 0 && port <= 65535) {
        if (!settled) {
          settled = true;
          clearInterval(interval);
          clearTimeout(timer);
          resolve(port);
          return;
        }
      }
    } catch {}

    let watcher;
    try {
      watcher = fs.watch(portFile, () => {
        if (settled) return;
        try {
          const content = fs.readFileSync(portFile, 'utf8').trim();
          const port = parseInt(content, 10);
          if (port > 0 && port <= 65535) {
            if (!settled) {
              settled = true;
              clearInterval(interval);
              clearTimeout(timer);
              try { watcher.close(); } catch {}
              resolve(port);
            }
          }
        } catch {}
      });
    } catch {
      // File doesn't exist yet — watcher can't be created; interval will pick it up
    }
  });
}

/**
 * Poll the backend's /health endpoint until it returns 200, or timeout.
 *
 * Runs probeHealth() every 200ms up to HEALTH_GATE_TIMEOUT_MS.
 */
async function waitHealth(port, timeoutMs = HEALTH_GATE_TIMEOUT_MS) {
  const interval = 200;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const healthy = await probeHealth(port, 1000);
    if (healthy) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Health gate timed out after ${timeoutMs}ms for port ${port}`);
}

/**
 * Wait for a child process to exit, with timeout.
 *
 * Returns the exit code on success. Throws if the child does not exit
 * within timeoutMs. Used during the shutdown grace window.
 */
function waitExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.removeAllListeners('exit');
      reject(new Error(`Child did not exit within ${timeoutMs}ms`));
    }, timeoutMs);

    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

/**
 * Force-kill a process by PID.
 *
 * Windows: taskkill /F /T /PID (kills the process tree).
 * Others: process.kill(pid, 'SIGKILL').
 * Wraps in try/catch — process may already be dead.
 */
function hardKill(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch {
    // Process may already be dead — this is expected during shutdown
  }
}

module.exports = {
  spawnBackend,
  pollPortFile,
  waitHealth,
  waitExit,
  hardKill,
};
