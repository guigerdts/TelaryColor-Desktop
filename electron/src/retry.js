'use strict';

const { RETRY_MAX_ATTEMPTS, RETRY_BASE_DELAY_MS } = require('./constants');
const { resolveBackend: defaultResolveBackend } = require('./lifecycle');

/**
 * Crash retry state machine for the backend child process.
 *
 * Monitors the spawned backend via `backendState.child` exit events and
 * retries up to RETRY_MAX_ATTEMPTS with exponential backoff. The caller
 * supplies callbacks so the module stays pure / testable (design D4).
 *
 * State flow: idle → detecting → waiting_backoff → retrying → success | failed
 *
 * @param {object}   opts
 * @param {object}   opts.backendState   - { mode, child, port } from resolveBackend
 * @param {string}   opts.exePath        - backend executable path
 * @param {string}   opts.dataDir        - backend data directory
 * @param {string}   opts.portFile       - path to the .port file
 * @param {boolean}  opts.isPackaged     - true in production build
 * @param {function} opts.onReload       - (port: number) => void — called on success
 * @param {function} opts.onPermanentFail- () => void — called after max attempts exhausted
 * @param {function} opts.notify         - (message: string) => void — user-facing notification (e.g. re-login)
 * @param {boolean}  [opts.isQuitting]   - when true, exit events are ignored (no retry)
 * @param {object}   [deps]              - injectable dependencies for testing
 * @param {function} [deps.resolveBackend] - override resolveBackend from lifecycle.js
 * @param {function} [deps.setTimeout]     - override setTimeout for fake timers
 */
function startCrashRetry(opts, deps = {}) {
  const {
    backendState,
    exePath,
    dataDir,
    portFile,
    isPackaged,
    onReload,
    onPermanentFail,
    notify,
    isQuitting = false,
  } = opts;

  const {
    resolveBackend: _resolveBackend = defaultResolveBackend,
    setTimeout: _setTimeout = setTimeout,
  } = deps;

  let attempt = 0;
  let currentChild = backendState.child;
  let lastKnownPort = backendState.port;
  let active = true; // guards against reused-child exit no-op

  if (!currentChild) {
    // No child process to monitor — nothing to do
    return;
  }

  /**
   * Exit handler attached to the current child process.
   *
   * Skips retry when isQuitting is true (normal shutdown path).
   * Skips when the child reference has changed (reused-child exit).
   */
  function onChildExit() {
    if (isQuitting || !active) return;

    // Save the last known port before attempting recovery
    lastKnownPort = backendState.port;

    attemptRetry();
  }

  /**
   * Schedule the next retry attempt with exponential backoff.
   */
  function attemptRetry() {
    if (attempt >= RETRY_MAX_ATTEMPTS) {
      onPermanentFail();
      return;
    }

    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
    attempt += 1;

    _setTimeout(async () => {
      if (!active) return;

      try {
        const result = await _resolveBackend({ exePath, dataDir, portFile, isPackaged });

        if (result.port === lastKnownPort) {
          // Same port reused — backend recovered on the same port
          onReload(result.port);
        } else {
          // Different port — user needs to re-login
          notify('restarted', attempt);
          onReload(result.port);
        }

        // Update backendState for future exit events
        backendState.mode = result.mode;
        backendState.child = result.child;
        backendState.port = result.port;

        if (result.child && result.child !== currentChild) {
          // Detach old listener, attach to new child
          if (currentChild) {
            currentChild.removeListener('exit', onChildExit);
          }
          currentChild = result.child;
          lastKnownPort = result.port;
          currentChild.on('exit', onChildExit);
        }
      } catch {
        // resolveBackend failed — try again
        attemptRetry();
      }
    }, delay);
  }

  currentChild.on('exit', onChildExit);
}

module.exports = {
  startCrashRetry,
};
