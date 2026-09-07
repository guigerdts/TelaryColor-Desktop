'use strict';

const path = require('node:path');

/**
 * System-tray quick-access module (design: "Tray Quick-Access").
 *
 * Creates a tray icon with two menu items:
 * - "Abrir TelaryColor" — show/hide toggle
 * - "Salir" — calls the onQuit callback
 *
 * Accepts optional `deps` for testability (design D4).
 *
 * @param {object} opts
 * @param {object} opts.mainWindow  - BrowserWindow instance
 * @param {Function} opts.onQuit    - called when "Salir" is clicked
 * @param {object} [deps]           - optional { Tray, Menu } mocks
 * @returns {object} Tray instance
 */
function createTray({ mainWindow, onQuit }, deps = {}) {
  const { Tray: TrayClass, Menu: MenuClass } = deps;

  // Use injected deps if available, otherwise require electron
  let ElectronTray, ElectronMenu;
  if (TrayClass && MenuClass) {
    ElectronTray = TrayClass;
    ElectronMenu = MenuClass;
  } else {
    const electron = require('electron');
    ElectronTray = electron.Tray;
    ElectronMenu = electron.Menu;
  }

  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  const tray = new ElectronTray(iconPath);

  const contextMenu = ElectronMenu.buildFromTemplate([
    {
      label: 'Abrir TelaryColor',
      click() {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click() {
        onQuit();
      },
    },
  ]);

  tray.setToolTip('TelaryColor');
  tray.setContextMenu(contextMenu);

  // Export tray so second-instance handler can use it
  module.exports._tray = tray;

  return tray;
}

module.exports = { createTray };
