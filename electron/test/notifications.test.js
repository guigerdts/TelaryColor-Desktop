'use strict';

/**
 * Unit tests for src/notifications.js (design D6).
 *
 * Every test uses a fake `Notification` constructor + fake `app` injected
 * via the `deps?` parameter so the module runs without an Electron runtime.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  COPY,
  notify,
  notifyBackendStarted,
  notifyBackendRestarted,
  notifyBackendFailed,
  notifyUpdateAvailable,
  initNotifications,
} = require('../src/notifications');

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function makeFakeNotification() {
  const shown = [];

  function FakeNotification({ title, body }) {
    this.title = title;
    this.body = body;
  }

  FakeNotification.prototype.show = function show() {
    shown.push({ title: this.title, body: this.body });
  };

  FakeNotification.isSupported = () => true;

  /** Snapshot of every notification that was shown. */
  FakeNotification.__shown = () => shown;
  FakeNotification.__reset = () => { shown.length = 0; };

  return FakeNotification;
}

function makeFakeApp() {
  const calls = [];
  return {
    setAppUserModelId: (id) => calls.push(id),
    __calls: () => calls,
    __reset: () => { calls.length = 0; },
  };
}

// -----------------------------------------------------------------------
// notify() — core dispatcher
// -----------------------------------------------------------------------

test('notify constructs the Notification with correct title and body', () => {
  const Notification = makeFakeNotification();
  notify({ title: 'TelaryColor', body: 'Backend iniciado' }, { Notification });

  const records = Notification.__shown();
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], { title: 'TelaryColor', body: 'Backend iniciado' });
});

test('notify falls back to log when Notification is not supported', () => {
  const Notification = makeFakeNotification();
  Notification.isSupported = () => false;

  const logs = [];
  notify({ title: 'T', body: 'B' }, { Notification, log: (msg) => logs.push(msg) });

  assert.equal(logs.length, 1);
  assert.match(logs[0], /not supported/);
  assert.equal(Notification.__shown().length, 0);
});

test('notify falls back to log when showing throws (permission denied)', () => {
  const Notification = makeFakeNotification();
  Notification.prototype.show = function show() {
    throw new Error('permission denied');
  };

  const logs = [];
  notify({ title: 'T', body: 'B' }, { Notification, log: (msg) => logs.push(msg) });

  assert.equal(logs.length, 1);
  assert.match(logs[0], /permission denied/);
});

// -----------------------------------------------------------------------
// Convenience helpers — Spanish copy contracts
// -----------------------------------------------------------------------

test('notifyBackendStarted uses the BACKEND_STARTED Spanish copy', () => {
  const Notification = makeFakeNotification();
  notifyBackendStarted({ Notification });

  const [record] = Notification.__shown();
  assert.equal(record.body, COPY.BACKEND_STARTED);
  assert.equal(record.title, COPY.TITLE);
});

test('notifyBackendRestarted embeds the attempt number', () => {
  const Notification = makeFakeNotification();
  notifyBackendRestarted(2, { Notification });

  const [record] = Notification.__shown();
  assert.equal(record.body, COPY.BACKEND_RESTARTED(2));
  assert.match(record.body, /intento 2/);
});

test('notifyBackendFailed uses the BACKEND_FAILED Spanish copy', () => {
  const Notification = makeFakeNotification();
  notifyBackendFailed({ Notification });

  const [record] = Notification.__shown();
  assert.equal(record.body, COPY.BACKEND_FAILED);
});

test('notifyUpdateAvailable includes the version string', () => {
  const Notification = makeFakeNotification();
  notifyUpdateAvailable('1.2.3', { Notification });

  const [record] = Notification.__shown();
  assert.equal(record.body, COPY.UPDATE_AVAILABLE('1.2.3'));
  assert.match(record.body, /1\.2\.3/);
});

// -----------------------------------------------------------------------
// initNotifications — AppUserModelID
// -----------------------------------------------------------------------

test('initNotifications sets the default APP_USER_MODEL_ID from constants', () => {
  const app = makeFakeApp();
  initNotifications({}, { app });

  assert.deepEqual(app.__calls(), ['com.telarycolor.app']);
});

test('initNotifications accepts an explicit appUserModelId override', () => {
  const app = makeFakeApp();
  initNotifications({ appUserModelId: 'com.custom.id' }, { app });

  assert.deepEqual(app.__calls(), ['com.custom.id']);
});

// -----------------------------------------------------------------------
// COPY constant object
// -----------------------------------------------------------------------

test('COPY is frozen', () => {
  assert.ok(Object.isFrozen(COPY));
});

test('COPY.BACKEND_RESTARTED interpolates the attempt parameter', () => {
  assert.equal(COPY.BACKEND_RESTARTED(0), 'Reiniciando backend (intento 0)');
  assert.equal(COPY.BACKEND_RESTARTED(3), 'Reiniciando backend (intento 3)');
});

test('COPY.UPDATE_AVAILABLE interpolates the version parameter', () => {
  assert.equal(
    COPY.UPDATE_AVAILABLE('2.0.0'),
    'Actualización disponible (versión 2.0.0)',
  );
});
