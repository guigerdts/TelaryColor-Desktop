'use strict';

/**
 * Centralized timing constants for the Electron shell (design D5).
 *
 * All timeout/cadence values live here — never inlined in main.js or the
 * src/ modules. Test suites import these to assert the contract and inject
 * shorter values for speed where a module accepts overrides.
 */
module.exports = Object.freeze({
  // Reuse probe: a live backend's /health must answer within this window.
  // 3000 chosen over 2000 — CI smoke measured ~1.6s cold-start after
  // kill/relaunch, and office PCs are slower (design D5 comment).
  BACKEND_PROBE_TIMEOUT_MS: 3000,

  // Spec-mandated grace window: wait for the backend to exit after the
  // shutdown call before falling back to taskkill /F /T.
  SHUTDOWN_GRACE_TIMEOUT_MS: 5000,

  // .port file poll cadence while waiting for the spawn to boot.
  PORT_POLL_INTERVAL_MS: 100,

  // Spawn -> .port write deadline.
  PORT_POLL_TIMEOUT_MS: 10000,

  // /health readiness gate before loading the window.
  HEALTH_GATE_TIMEOUT_MS: 5000,

  // ------------------------------------------------------------------
  // Fase 3 retry / update constants (design D1, D5).
  // ------------------------------------------------------------------

  // Max restart attempts after an unexpected backend child exit. After the
  // 3rd failed attempt the shell shows the error dialog and quits.
  RETRY_MAX_ATTEMPTS: 3,

  // Exponential backoff base: delay = 1000 * 2^attempt (1s, 2s, 4s).
  RETRY_BASE_DELAY_MS: 1000,

  // Time budget to probe whether the previous backend port is reusable
  // after a crash. Same value as BACKEND_PROBE_TIMEOUT_MS (a live /health
  // must answer within this window) under a retry-specific name.
  PORT_PROBE_TIMEOUT_MS: 3000,

  // Windows AppUserModelID — groups all notifications under one app
  // identity (required for reliable notification delivery on Windows).
  APP_USER_MODEL_ID: 'com.telarycolor.app',

  // Auto-update check cadence: every 4 hours, non-blocking (design D5).
  UPDATE_CHECK_INTERVAL_MS: 4 * 60 * 60 * 1000,
});
