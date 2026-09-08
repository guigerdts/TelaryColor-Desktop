'use strict';

/**
 * derive-version.mjs — tag-to-installer-version derivation for the release
 * pipeline (design D3/D4).
 *
 * Reads the git tag ref name (github.ref_name), strips a single leading "v",
 * validates the remainder against a strict safe charset, and writes the
 * resulting version into electron/package.json so electron-builder names the
 * installer and latest.yml feed consistently:
 *   TelaryColor-Setup-${version}.${ext}
 *
 * The tag is attacker-influenced input that lands in package.json and the
 * installer filename; the validation gate (design threat matrix) rejects any
 * value that could inject JSON structure or shell syntax. No shell is
 * involved — this is a plain node script.
 *
 * Usage (workflow, PR 2):
 *   node scripts/derive-version.mjs ${{ github.ref_name }}
 *
 * Usage (tests / manual):
 *   node scripts/derive-version.mjs <ref-name> [target-package.json]
 *
 * Exit 0 + stdout "version" on success; exit 1 on violation (workflow aborts
 * before packaging).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Safe version charset: start with letter/digit, then letters, digits, dots,
// and hyphens only. Slash, backslash, whitespace, semicolons, quotes, and any
// other character are rejected (design interface contract).
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.\-]*$/;

const ELECTRON_PACKAGE_JSON = ['..', 'electron', 'package.json'];

/**
 * Derive the installer version from a git tag ref name.
 *
 * @param {string} refName - github.ref_name, e.g. "v1.2.3" or "v0.1.0-test".
 * @returns {string|null} sanitized version, or null when the ref is invalid.
 */
export function deriveVersion(refName) {
  if (typeof refName !== 'string') return null;
  const candidate = refName.startsWith('v') ? refName.slice(1) : refName;
  if (!VERSION_PATTERN.test(candidate)) return null;
  if (candidate.includes('..')) return null; // consecutive dots rejected
  return candidate;
}

/**
 * Write the derived version into a package.json, preserving all other fields.
 *
 * @param {string} pkgPath - absolute path to package.json.
 * @param {string} version - validated version string.
 */
export function writeVersion(pkgPath, version) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

function main() {
  const refName = process.argv[2];
  if (!refName) {
    process.stderr.write('derive-version: missing github.ref_name argument\n');
    process.exit(1);
  }

  const version = deriveVersion(refName);
  if (version === null) {
    process.stderr.write(
      `derive-version: invalid version ref ${JSON.stringify(refName)}; ` +
        'expected a tag like v1.2.3 (letters, digits, dots, single hyphens only)\n'
    );
    process.exit(1);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const target = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(scriptDir, ...ELECTRON_PACKAGE_JSON);

  try {
    writeVersion(target, version);
  } catch (err) {
    process.stderr.write(`derive-version: failed to write ${target}: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`${version}\n`);
}

// Run the CLI only when executed directly, not when imported by tests.
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) main();