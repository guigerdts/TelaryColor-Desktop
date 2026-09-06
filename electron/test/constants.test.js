'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BACKEND_PROBE_TIMEOUT_MS,
  SHUTDOWN_GRACE_TIMEOUT_MS,
  PORT_POLL_INTERVAL_MS,
  PORT_POLL_TIMEOUT_MS,
  HEALTH_GATE_TIMEOUT_MS,
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
