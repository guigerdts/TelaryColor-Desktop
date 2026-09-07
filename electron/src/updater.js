'use strict';

/**
 * Auto-update module (design D5).
 *
 * Thin wrapper around electron-updater's `autoUpdater`. Everything is
 * injectable via `deps` so the module stays unit-testable without an
 * Electron runtime (same pattern as the other src/ modules).
 *
 * spec: Auto-Update Module
 */

const { UPDATE_CHECK_INTERVAL_MS } = require('./constants');

/**
 * Initialize the auto-updater.
 *
 * @param {{ onAvailable?: (version: string) => void }} opts
 * @param {{ autoUpdater?: object }} [deps] - injectable for testing
 * @returns {{ checkForUpdates: () => void, quitAndInstall: () => void }}
 */
function initUpdater({ onAvailable = () => {} } = {}, deps = {}) {
  const autoUpdater = deps.autoUpdater || require('electron-updater').autoUpdater;

  // Channel defaults to 'latest' (design D5).
  if (!autoUpdater.channel) {
    autoUpdater.channel = 'latest';
  }

  autoUpdater.on('update-available', (info) => {
    const version = info.version;
    onAvailable(version);
  });

  return {
    /**
     * Trigger a one-shot update check. Non-blocking — fires the
     * `onAvailable` callback when an update is found.
     */
    checkForUpdates() {
      autoUpdater.checkForUpdates();
    },

    /**
     * Quit the app and install the downloaded update.
     */
    quitAndInstall() {
      autoUpdater.quitAndInstall();
    },
  };
}

module.exports = { initUpdater };
