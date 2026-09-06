'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  backendExePath,
  deriveDataDir,
  portFile,
} = require('../src/paths');

test('dev backendExePath points at backend/entry.py in repo root', () => {
  const repoRoot = '/repo';
  const exe = backendExePath({
    resourcesPath: '/unused',
    repoRoot,
    isPackaged: false,
  });
  assert.equal(exe, path.join('/repo', 'backend', 'entry.py'));
});

test('packaged backendExePath points at resources/backend/telarycolor-server.exe', () => {
  const resourcesPath = '/app/resources';
  const exe = backendExePath({
    resourcesPath,
    repoRoot: '/unused',
    isPackaged: true,
  });
  assert.equal(
    exe,
    path.join('/app/resources', 'backend', 'telarycolor-server.exe')
  );
});

test('dev dataDir ends with backend/data', () => {
  const dir = deriveDataDir({ appData: '/unused', repoRoot: '/repo', isPackaged: false });
  assert.equal(dir, path.join('/repo', 'backend', 'data'));
});

test('packaged dataDir is appData/TelaryColor/data', () => {
  const dir = deriveDataDir({ appData: '/appdata', repoRoot: '/unused', isPackaged: true });
  assert.equal(dir, path.join('/appdata', 'TelaryColor', 'data'));
});

test('portFile lives at dataDir/.port with .port suffix', () => {
  const dataDir = '/appdata/TelaryColor/data';
  const pf = portFile(dataDir);
  assert.equal(pf, path.join('/appdata/TelaryColor/data', '.port'));
  assert.ok(pf.endsWith('.port'));
});

test('dev portFile derives from dev dataDir', () => {
  const dir = deriveDataDir({ appData: '/unused', repoRoot: '/repo', isPackaged: false });
  const pf = portFile(dir);
  assert.ok(pf.endsWith(path.join('backend', 'data', '.port')));
});
