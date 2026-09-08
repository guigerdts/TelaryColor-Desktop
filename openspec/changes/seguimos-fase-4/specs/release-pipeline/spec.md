# Release Pipeline Specification

## Purpose

Tag-triggered release pipeline for the TelaryColor desktop installer. A single `v*` tag workflow builds the Nuitka backend and the frontend first, stages `entry.dist`, packages the NSIS installer, and publishes to GitHub Releases only after both builds succeed. CI-only and local packaging never publish.

## Requirements

### Requirement: Consolidated Tag-Triggered Build-to-Publish Workflow

The system MUST provide ONE tag-triggered workflow (`.github/workflows/release-desktop.yml`) that on a `v*` tag push builds the backend with Nuitka and the frontend with Vite, stages `entry.dist` (backend binary + `alembic/` + `alembic.ini` + `frontend/dist`), smoke-tests the staged binary, and runs `electron-builder --publish always` (NSIS x64, `GH_TOKEN`). The workflow MUST publish only after both builds succeed.

#### Scenario: Tag push publishes a complete installer

- GIVEN a `v*` tag is pushed
- WHEN the workflow runs on `windows-latest`
- THEN it builds backend and frontend first, then stages and smoke-tests `entry.dist`
- AND only then publishes the NSIS installer to GitHub Releases

#### Scenario: Failed build never publishes

- GIVEN the Nuitka backend or frontend build fails
- WHEN the workflow reaches the failure
- THEN the run fails and no installer is published to GitHub Releases

### Requirement: Build-Before-Publish Ordering Guarantee

The publish step MUST NOT run unless backend build, frontend build, staging, and smoke test all succeeded. Non-tag packaging (`npm run dist` locally or CI-only runs) MUST use `--publish never`.

#### Scenario: Local packaging does not publish

- GIVEN a developer runs `npm run dist` locally
- WHEN electron-builder finishes
- THEN the installer is written to `electron/dist` only and nothing is uploaded

### Requirement: Installer Artifact Naming

The NSIS installer MUST be named `TelaryColor-Setup-${version}.exe`. A `v1.2.3` tag MUST produce `TelaryColor-Setup-1.2.3.exe`, referenced by `latest.yml`.

#### Scenario: Versioned installer filename

- GIVEN a `v1.2.3` tag triggers the workflow
- WHEN electron-builder packages the NSIS target
- THEN the release asset is named `TelaryColor-Setup-1.2.3.exe`

### Requirement: Multi-Resolution Application Icon

The system MUST use the user-provided real logo `electron/assets/icon.ico` — already a multi-resolution icon including 256×256 — as the installer and application icon without regeneration from PWA sources. The system MUST resize `electron/assets/tray-icon.png` from its real 1254×1254 dimensions to tray-appropriate size (Windows 16×16 / 32×32, a few KB) before packaging.

#### Scenario: Real logo icon used at 256×256

- GIVEN `electron/assets/icon.ico` is the user-provided real logo (256×256)
- WHEN electron-builder packages the NSIS target
- THEN the icon is used as-is and no PWA source (`frontend/public/icons/icon-512.png`) is required

#### Scenario: Tray icon resized from source

- GIVEN `electron/assets/tray-icon.png` is the user-provided 1254×1254 image
- WHEN the package is assembled
- THEN the tray icon is resized to 16×16 / 32×32 (a few KB) before inclusion

### Requirement: No Code Signing

The pipeline MUST NOT sign the installer. SmartScreen "Unknown publisher" MUST be documented as an ACCEPTED limitation (same criterion as Fase 3 auto-update).

#### Scenario: Unsigned installer documented

- GIVEN an unsigned installer is published
- WHEN a user installs on Windows
- THEN SmartScreen may warn "Unknown publisher"
- AND the limitation is documented in the release notes

### Requirement: Installer Size Gate

The published installer MUST be ≤ 500 MB. Nuitka backend size (~150–250 MB) is ACCEPTED as-is; no size-optimization work is in scope.

#### Scenario: Installer within plan gate

- GIVEN a completed package
- WHEN the installer size is measured
- THEN it is ≤ 500 MB

### Requirement: Test-Tag End-to-End Gate

Before change close, tag `v0.1.0-test` MUST run the full pipeline (build → package → publish) and leave the installer asset in GitHub Releases.

#### Scenario: Test tag publishes an asset

- GIVEN tag `v0.1.0-test` is pushed
- WHEN the workflow completes successfully
- THEN the asset `TelaryColor-Setup-0.1.0-test.exe` is present in GitHub Releases