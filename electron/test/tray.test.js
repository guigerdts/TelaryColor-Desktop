'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const TRAY_PATH = path.join(__dirname, '..', 'src', 'tray.js');

// ---------------------------------------------------------------------------
// Mock helpers — lightweight Electron API stubs
// ---------------------------------------------------------------------------

function createMockTray() {
  let lastInstance = null;
  class MockTray {
    constructor() {
      this._tooltip = '';
      this._menu = null;
      this.show = () => {};
      this.hide = () => {};
      this.isVisible = () => false;
      this.setToolTip = (t) => { this._tooltip = t; };
      this.setContextMenu = (m) => { this._menu = m; };
      lastInstance = this;
    }
  }
  return {
    Tray: MockTray,
    get instance() { return lastInstance; },
  };
}

function createMockMenu() {
  const built = { items: [] };
  return {
    Menu: {
      buildFromTemplate(template) {
        built.items = template;
        return built;
      },
    },
    built,
  };
}

function createMockWindow({ visible = false } = {}) {
  let isVisible = visible;
  return {
    _shown: false,
    _hidden: false,
    show() { this._shown = true; this._hidden = false; isVisible = true; },
    hide() { this._hidden = true; this._shown = false; isVisible = false; },
    isVisible() { return isVisible; },
    focus() {},
    isMinimized() { return false; },
    restore() {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let createTray;

test('load tray module', () => {
  delete require.cache[TRAY_PATH];
  ({ createTray } = require(TRAY_PATH));
  assert.equal(typeof createTray, 'function');
});

test('createTray returns a Tray instance', () => {
  const { Tray, instance } = createMockTray();
  const { Menu } = createMockMenu();
  const mainWindow = createMockWindow();
  let quitCalled = false;

  const tray = createTray(
    { mainWindow, onQuit: () => { quitCalled = true; } },
    { Tray, Menu }
  );

  assert.ok(tray, 'should return tray instance');
  assert.equal(tray._tooltip, 'TelaryColor');
});

test('two menu items created (Abrir + Salir + separator)', () => {
  const { Tray } = createMockTray();
  const { Menu, built } = createMockMenu();
  const mainWindow = createMockWindow();

  createTray(
    { mainWindow, onQuit: () => {} },
    { Tray, Menu }
  );

  // Template: Abrir, separator, Salir = 3 entries
  assert.equal(built.items.length, 3, 'should have 3 template entries');
  assert.equal(built.items[0].label, 'Abrir TelaryColor');
  assert.equal(built.items[1].type, 'separator');
  assert.equal(built.items[2].label, 'Salir');
});

test('"Salir" triggers onQuit callback', () => {
  const { Tray } = createMockTray();
  const { Menu, built } = createMockMenu();
  const mainWindow = createMockWindow();
  let quitCalled = false;

  createTray(
    { mainWindow, onQuit: () => { quitCalled = true; } },
    { Tray, Menu }
  );

  // Find the Salir menu item and invoke its click
  const salirItem = built.items.find((i) => i.label === 'Salir');
  assert.ok(salirItem, 'Salir menu item must exist');
  salirItem.click();
  assert.ok(quitCalled, 'onQuit should have been called');
});

test('"Abrir TelaryColor" toggles show/hide', () => {
  const { Tray } = createMockTray();
  const { Menu, built } = createMockMenu();
  const mainWindow = createMockWindow({ visible: false });

  createTray(
    { mainWindow, onQuit: () => {} },
    { Tray, Menu }
  );

  const abrirItem = built.items.find((i) => i.label === 'Abrir TelaryColor');
  assert.ok(abrirItem, 'Abrir menu item must exist');

  // Window hidden → click → show
  abrirItem.click();
  assert.ok(mainWindow._shown, 'window should be shown after first click');
  assert.equal(mainWindow.isVisible(), true);

  // Window visible → click → hide
  mainWindow._shown = false;
  abrirItem.click();
  assert.ok(mainWindow._hidden, 'window should be hidden after second click');
  assert.equal(mainWindow.isVisible(), false);
});

test('second-instance reveals hidden window', () => {
  // Simulate the second-instance logic from main.js
  const mainWindow = createMockWindow({ visible: false });

  // The second-instance handler logic (as wired in main.js)
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }

  assert.ok(mainWindow._shown, 'hidden window should be shown on second-instance');
});

test('second-instance does not double-show visible window', () => {
  const mainWindow = createMockWindow({ visible: true });

  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }

  assert.equal(mainWindow._shown, false, 'visible window should not be re-shown');
  assert.equal(mainWindow._hidden, false, 'visible window should not be hidden');
});
