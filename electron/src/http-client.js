'use strict';

const { BACKEND_PROBE_TIMEOUT_MS, SHUTDOWN_GRACE_TIMEOUT_MS } = require('./constants');

const BASE_URL = (port) => `http://127.0.0.1:${port}`;

/**
 * Probe a backend's /health endpoint to decide whether to reuse it.
 *
 * GET /health on http://127.0.0.1:{port}, aborting after
 * BACKEND_PROBE_TIMEOUT_MS. Returns `true` on HTTP 200, `false` on any
 * error, non-200 status, or timeout. Never throws.
 */
async function probeHealth(port, timeoutMs = BACKEND_PROBE_TIMEOUT_MS) {
  try {
    const response = await fetch(`${BASE_URL(port)}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Ask a backend to shut down gracefully via POST /api/v1/system/shutdown.
 *
 * Returns the raw fetch Response (caller reads `.ok` / `.status`). Aborts
 * after the graceful-shutdown window as a defensive bound.
 */
async function requestShutdown(port, timeoutMs = SHUTDOWN_GRACE_TIMEOUT_MS) {
  try {
    return await fetch(`${BASE_URL(port)}/api/v1/system/shutdown`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Synthesized failure response so the caller always gets .ok/.status.
    return {
      ok: false,
      status: 0,
    };
  }
}

module.exports = {
  probeHealth,
  requestShutdown,
};
