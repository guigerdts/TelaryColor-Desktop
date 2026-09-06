'use strict';

const { contextBridge } = require('electron');

/**
 * Minimal preload bridge — read-only version/platform info.
 *
 * Fase 2 needs no IPC channels; this bridge exposes just enough for the
 * frontend to detect it is running inside Electron.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  version: process.versions.electron || 'dev',
  platform: process.platform,
  isElectron: true,
});
