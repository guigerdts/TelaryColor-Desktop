'use strict';

/**
 * Electron composition root — Electron APIs only.
 *
 * Business logic lives in src/ (lifecycle, http-client, backend-process).
 * This file wires Electron APIs: app lifecycle, BrowserWindow, security,
 * and the single-instance lock. See design.md "Main-Process Lifecycle
 * State Machine" for the full flow.
 */

const path = require('node:path');
const { app, dialog, BrowserWindow, ipcMain } = require('electron');

const { backendExePath, deriveDataDir, portFile } = require('./src/paths');
const { resolveBackend, shutdown } = require('./src/lifecycle');

// ---------------------------------------------------------------------------
// Single-instance lock (design D2)
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  // Second instance — quit immediately. The 'second-instance' handler on
  // the first instance will focus its window.
  app.quit();
} else {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let mainWindow = null;
  let backendState = null; // { mode, child, port } from resolveBackend
  let shuttingDown = false;

  // ---------------------------------------------------------------------------
  // Derive paths (design D6: same shell for dev and packaged)
  // ---------------------------------------------------------------------------
  const isPackaged = app.isPackaged;
  const resourcesPath = process.resourcesPath; // __dirname's parent when packaged
  const appData = app.getPath('appData');
  const repoRoot = path.join(__dirname, '..');

  const exePath = backendExePath({ resourcesPath, repoRoot, isPackaged });
  const dataDir = deriveDataDir({ appData, repoRoot, isPackaged });
  const portFilePath = portFile(dataDir);

  // ---------------------------------------------------------------------------
  // Second-instance focus (design D2: 2nd instance quits, 1st gets focus)
  // ---------------------------------------------------------------------------
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // ---------------------------------------------------------------------------
  // App ready — resolve backend then create window
  // ---------------------------------------------------------------------------
  app.whenReady().then(async () => {
    try {
      backendState = await resolveBackend({ exePath, dataDir, portFile: portFilePath, isPackaged });
    } catch (err) {
      dialog.showErrorBox(
        'Backend Error',
        `Failed to start the backend server:\n\n${err.message || err}`
      );
      app.quit();
      return;
    }

    const port = backendState.port;

    // Create the browser window (security: design "Security" section)
    mainWindow = new BrowserWindow({
      show: false,
      backgroundColor: '#0f172a',
      width: 1280,
      height: 800,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    // Show only after content is painted (no white flash)
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    // Security: deny navigation away from the backend origin
    mainWindow.webContents.on('will-navigate', (event, url) => {
      const allowed = `http://127.0.0.1:${port}`;
      if (!url.startsWith(allowed)) {
        event.preventDefault();
      }
    });

    // Security: deny all new-window / external navigation
    mainWindow.webContents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });

    // Load the backend UI
    mainWindow.loadURL(`http://127.0.0.1:${port}`);

    // Detect unexpected child exit while window is open (design: "Unexpected
    // child exit while window open → ERROR_DIALOG + QUIT")
    if (backendState.child) {
      backendState.child.on('exit', (code, signal) => {
        if (shuttingDown) return; // expected during normal shutdown
        const reason = signal
          ? `killed by signal ${signal}`
          : `exited with code ${code}`;
        dialog.showErrorBox(
          'Backend Crashed',
          `The backend server ${reason} unexpectedly.\n\nThe application will now close.`
        );
        app.quit();
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Shutdown (design D3: kill only if WE spawned)
  // ---------------------------------------------------------------------------
  app.on('before-quit', async (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    shuttingDown = true;

    if (backendState) {
      try {
        await shutdown(backendState);
      } catch {
        // Best-effort — if shutdown itself throws, just exit
      }
    }

    app.quit();
  });

  // ---------------------------------------------------------------------------
  // Activate — no-op for Windows (design: "app.on('activate') → no-op")
  // ---------------------------------------------------------------------------
  app.on('activate', () => {
    // No-op: Windows does not use dock-based activation
  });
}
