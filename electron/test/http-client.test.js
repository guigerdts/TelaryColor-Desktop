'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { probeHealth, requestShutdown } = require('../src/http-client');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('probeHealth returns true when /health answers 200', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"status":"ok"}');
  });
  const port = await listen(server);
  try {
    const healthy = await probeHealth(port);
    assert.equal(healthy, true);
  } finally {
    await close(server);
  }
});

test('probeHealth returns false within probe timeout when server never answers', async () => {
  const server = http.createServer(() => {
    // Never respond — simulate a hung/black-holed backend.
  });
  const port = await listen(server);
  const started = Date.now();
  try {
    const healthy = await probeHealth(port);
    assert.equal(healthy, false);
  } finally {
    await close(server);
  }
  // The probe must not hang longer than BACKEND_PROBE_TIMEOUT_MS (3000) plus slack.
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 5000, `probe took too long: ${elapsed}ms`);
});

test('probeHealth returns false when connection is refused', async () => {
  const server = http.createServer(() => {});
  const port = await listen(server);
  await close(server); // closed → ECONNREFUSED
  const healthy = await probeHealth(port);
  assert.equal(healthy, false);
});

test('requestShutdown POSTs /api/v1/system/shutdown and returns ok', async () => {
  let seenMethod = null;
  let seenUrl = null;
  const server = http.createServer((req, res) => {
    seenMethod = req.method;
    seenUrl = req.url;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"status":"shutting_down"}');
  });
  const port = await listen(server);
  try {
    const result = await requestShutdown(port);
    assert.equal(seenMethod, 'POST');
    assert.equal(seenUrl, '/api/v1/system/shutdown');
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
  } finally {
    await close(server);
  }
});
