'use strict';

/**
 * Structural approval tests for the electron packaging configuration
 * (task 1.3, release-pipeline spec "Build-Before-Publish Ordering Guarantee"
 * and "Installer Artifact Naming").
 *
 * These pin the three publish-safety facts of electron/package.json:
 *   1. `npm run dist` never publishes (local/CI packaging).
 *   2. `npm run release` publishes always (tag workflow, PR 2).
 *   3. The NSIS installer filename is TelaryColor-Setup-${version}.${ext}.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'electron',
  'package.json'
);
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

test('dist script targets NSIS win x64 with --publish never', () => {
  assert.ok(pkg.scripts.dist, 'dist script is present');
  assert.ok(
    pkg.scripts.dist.includes('electron-builder') &&
      pkg.scripts.dist.includes('--win') &&
      pkg.scripts.dist.includes('--x64'),
    `dist should invoke electron-builder --win --x64, got: ${pkg.scripts.dist}`
  );
  assert.ok(
    pkg.scripts.dist.endsWith('--publish never'),
    `dist must end with --publish never, got: ${pkg.scripts.dist}`
  );
});

test('release script targets NSIS win x64 with --publish always', () => {
  assert.equal(pkg.scripts.release, 'electron-builder --win --x64 --publish always');
});

test('win artifactName pins TelaryColor-Setup-${version}.${ext}', () => {
  assert.equal(pkg.build.win.artifactName, 'TelaryColor-Setup-${version}.${ext}');
});