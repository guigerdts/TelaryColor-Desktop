# Delta for Electron Shell

## MODIFIED Requirements

### Requirement: Auto-Update via electron-updater

The system MUST add `electron-updater` and configure `publish: { provider: github }` on the NSIS target, defaulting to the `latest` channel. A tag-triggered `.github/workflows/release-desktop.yml` on `v*` tags MUST build the Nuitka backend and the frontend first and then run `electron-builder --publish always` with `contents: write` and `GH_TOKEN`; it MUST NOT publish unless both builds succeeded. The NSIS installer MUST be named `TelaryColor-Setup-${version}.exe`. Auto-update MUST be checked on app start (non-blocking). One app update atomically replaces backend + SPA. Code signing is a known limitation: unsigned installers trigger SmartScreen "Unknown publisher", accepted for this phase.
(Previously: the release workflow ran `electron-builder --publish always` directly without building the backend/frontend `extraResources` referenced by `../build/entry.dist`, and the installer had no fixed artifact name.)

#### Scenario: Tag publishes installer after builds succeed

- GIVEN a `v*` tag is pushed with `GH_TOKEN` set
- WHEN the release workflow runs
- THEN it builds the Nuitka backend and the frontend first
- AND only after both builds succeed publishes the NSIS installer to GitHub Releases with `latest` channel metadata

#### Scenario: Failed build skips publication

- GIVEN the backend or frontend build fails
- WHEN the workflow reaches the failure
- THEN the workflow fails and no installer is published

#### Scenario: Installed build updates

- GIVEN an installed build from a prior release
- WHEN a newer release exists and the app checks for updates
- THEN `electron-updater` downloads and installs on quit, replacing backend + SPA atomically