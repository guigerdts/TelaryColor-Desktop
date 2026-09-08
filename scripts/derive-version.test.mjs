'use strict';

/**
 * Adversarial tests for the tag-to-version derivation used by the release
 * pipeline (design D3/D4, release-pipeline spec "Installer Artifact Naming").
 *
 * The git tag name (github.ref_name) is attacker-influenced input that is
 * written verbatim into electron/package.json before packaging. A hostile tag
 * must therefore be rejected at the derive gate so it can never reach the JSON
 * writer or the installer filename.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveVersion, writeVersion } from './derive-version.mjs';

const scriptPath = fileURLToPath(new URL('./derive-version.mjs', import.meta.url));

// ---------------------------------------------------------------------------
// deriveVersion — pure function
// ---------------------------------------------------------------------------

test('deriveVersion strips a leading v from a semver tag', () => {
  assert.equal(deriveVersion('v1.2.3'), '1.2.3');
});

test('deriveVersion keeps a ref without a leading v', () => {
  assert.equal(deriveVersion('1.2.3'), '1.2.3');
});

test('deriveVersion accepts the phased test tag v0.1.0-test', () => {
  assert.equal(deriveVersion('v0.1.0-test'), '0.1.0-test');
});

test('deriveVersion rejects path traversal values', () => {
  assert.equal(deriveVersion('../../x'), null);
});

test('deriveVersion rejects values containing whitespace', () => {
  assert.equal(deriveVersion('a b'), null);
});

test('deriveVersion rejects values containing command separators', () => {
  assert.equal(deriveVersion('x;rm'), null);
});

test('deriveVersion rejects Windows-style absolute path values', () => {
  assert.equal(deriveVersion('C:\\bad'), null);
});

test('deriveVersion rejects consecutive dots', () => {
  assert.equal(deriveVersion('1..2'), null);
});

test('deriveVersion rejects a ref that does not start with a letter or digit', () => {
  assert.equal(deriveVersion('-1.2'), null);
  assert.equal(deriveVersion('.hidden'), null);
});

test('deriveVersion rejects an empty ref', () => {
  assert.equal(deriveVersion(''), null);
});

test('deriveVersion rejects non-string input', () => {
  assert.equal(deriveVersion(undefined), null);
  assert.equal(deriveVersion(null), null);
});

// ---------------------------------------------------------------------------
// writeVersion — JSON round-trip against a temp fixture (no real repo mutation)
// ---------------------------------------------------------------------------

test('writeVersion updates the version field and preserves JSON structure', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'derive-version-'));
  try {
    const pkgPath = path.join(dir, 'package.json');
    writeFileSync(
      pkgPath,
      JSON.stringify({ name: 'fixture', version: '1.0.0', scripts: { dist: 'x' } }, null, 2),
      'utf8'
    );
    writeVersion(pkgPath, '1.2.3');
    const updated = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.equal(updated.version, '1.2.3');
    assert.equal(updated.name, 'fixture');
    assert.equal(updated.scripts.dist, 'x');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// CLI contract — exit codes and side effects
// ---------------------------------------------------------------------------

test('CLI writes the derived version and exits 0 for a valid tag', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'derive-version-cli-'));
  try {
    const pkgPath = path.join(dir, 'package.json');
    writeFileSync(pkgPath, JSON.stringify({ version: '1.0.0' }), 'utf8');
    const res = spawnSync(process.execPath, [scriptPath, 'v1.2.3', pkgPath], {
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    assert.equal(res.stdout.trim(), '1.2.3');
    assert.equal(JSON.parse(readFileSync(pkgPath, 'utf8')).version, '1.2.3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI exits non-zero and writes nothing for a hostile tag', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'derive-version-cli-'));
  try {
    const pkgPath = path.join(dir, 'package.json');
    writeFileSync(pkgPath, JSON.stringify({ version: '1.0.0' }), 'utf8');
    const res = spawnSync(process.execPath, [scriptPath, '../../x', pkgPath], {
      encoding: 'utf8',
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /invalid/i);
    assert.equal(JSON.parse(readFileSync(pkgPath, 'utf8')).version, '1.0.0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI exits non-zero when no ref argument is provided', () => {
  const res = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /missing/i);
});