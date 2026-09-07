'use strict';

/**
 * Main-process status notifications (design D6).
 *
 * Thin wrapper around Electron's main-process `Notification` API plus
 * convenience helpers for the fase 3 lifecycle events. Everything is
 * injectable via `deps` so the module stays unit-testable without an
 * Electron runtime (same pattern as the other src/ modules).
 *
 * spec: Main-Process Status Notifications
 */

const { APP_USER_MODEL_ID } = require('./constants');

/**
 * Spanish copy constants (neutral/professional). Exported so main.js or
 * tests can reference them in one place. Functions are used for copy that
 * requires parameter interpolation.
 */
const COPY = Object.freeze({
  /** Notification title used for all status messages. */
  TITLE: 'TelaryColor',

  /** Shown once the backend resolves successfully on first launch. */
  BACKEND_STARTED: 'Backend iniciado',

  /** Shown when a crash triggers restart attempt `attempt`. */
  BACKEND_RESTARTED: (attempt) => `Reiniciando backend (intento ${attempt})`,

  /** Shown after all retry attempts are exhausted. */
  BACKEND_FAILED: 'Backend fallido',

  /** Shown when a newer release is available. */
  UPDATE_AVAILABLE: (version) => `Actualización disponible (versión ${version})`,
});

/**
 * Core notification dispatcher — wraps `Notification` with support for
 * environments where `Notification` is not available or permission is
 * denied; those paths fall back to `console.log` without throwing.
 *
 * @param {{ title: string, body: string }} props
 * @param {{ Notification?: typeof Notification, log?: (...args: any[]) => void }} [deps]
 */
function notify({ title, body }, deps = {}) {
  const Notification = deps.Notification || require('electron').Notification;
  const log = deps.log || console.log;

  if (!Notification.isSupported()) {
    log(`[notifications] ${title}: ${body} (not supported, skipped)`);
    return;
  }

  try {
    new Notification({ title, body }).show();
  } catch (error) {
    // Permission denied / platform errors must never take down the shell.
    log(`[notifications] fallback (${error.message}): ${title}: ${body}`);
  }
}

// Convenience helpers — public API consumed by main.js and retry.js

function notifyBackendStarted(deps) {
  notify({ title: COPY.TITLE, body: COPY.BACKEND_STARTED }, deps);
}

function notifyBackendRestarted(attempt, deps) {
  notify(
    { title: COPY.TITLE, body: COPY.BACKEND_RESTARTED(attempt) },
    deps,
  );
}

function notifyBackendFailed(deps) {
  notify({ title: COPY.TITLE, body: COPY.BACKEND_FAILED }, deps);
}

function notifyUpdateAvailable(version, deps) {
  notify(
    { title: COPY.TITLE, body: COPY.UPDATE_AVAILABLE(version) },
    deps,
  );
}

/**
 * Call once on `app.on('ready')` to register the Windows
 * AppUserModelID (required for notification grouping on Windows).
 *
 * @param {{ appUserModelId?: string }} [opts]
 * @param {{ app?: { setAppUserModelId: (id: string) => void } }} [deps]
 */
function initNotifications({ appUserModelId = APP_USER_MODEL_ID } = {}, deps = {}) {
  const app = deps.app || require('electron').app;
  app.setAppUserModelId(appUserModelId);
}

module.exports = {
  COPY,
  notify,
  notifyBackendStarted,
  notifyBackendRestarted,
  notifyBackendFailed,
  notifyUpdateAvailable,
  initNotifications,
};
