'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BACKEND_PROBE_TIMEOUT_MS,
  SHUTDOWN_GRACE_TIMEOUT_MS,
  PORT_POLL_INTERVAL_MS,
  PORT_POLL_TIMEOUT_MS,
  HEALTH_GATE_TIMEOUT_MS,
  RETRY_MAX_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  PORT_PROBE_TIMEOUT_MS,
  APP_USER_MODEL_ID,
  UPDATE_CHECK_INTERVAL_MS,
} = require('../src/constants');

test('frozen timing constants match the spec contract (D5)', () => {
  assert.equal(BACKEND_PROBE_TIMEOUT_MS, 3000);
  assert.equal(SHUTDOWN_GRACE_TIMEOUT_MS, 5000);
  assert.equal(PORT_POLL_INTERVAL_MS, 100);
  assert.equal(PORT_POLL_TIMEOUT_MS, 10000);
  assert.equal(HEALTH_GATE_TIMEOUT_MS, 5000);
});

test('constants object is frozen', () => {
  const constants = require('../src/constants');
  assert.ok(Object.isFrozen(constants));
});

test('mutating a constant throws in strict mode', () => {
  const constants = require('../src/constants');
  assert.throws(() => {
    constants.BACKEND_PROBE_TIMEOUT_MS = 1;
  }, TypeError);
});

test('fase 3 retry/update constants match the PR-1 contract', () => {
  assert.equal(RETRY_MAX_ATTEMPTS, 3);
  assert.equal(RETRY_BASE_DELAY_MS, 1000);
  assert.equal(PORT_PROBE_TIMEOUT_MS, 3000);
  assert.equal(APP_USER_MODEL_ID, 'com.telarycolor.app');
  assert.equal(UPDATE_CHECK_INTERVAL_MS, 4 * 60 * 60 * 1000);
});
