# TelaryColor Desktop — Release Notes

## Known Limitation: SmartScreen "Unknown publisher"

The TelaryColor installer is **not code-signed**. Windows SmartScreen may
display an "Unknown publisher" warning when a user downloads and runs the
installer for the first time. This is an **ACCEPTED limitation** for this
phase — no code-signing certificate is used.

To install despite the warning, click **More info** → **Run anyway**. The
warning appears only once per download because the filename and publisher
are not yet trusted on the local machine.

This limitation is shared with the automatic-update flow (Fase 3): the same
unsigned installer is offered through `electron-updater` from GitHub
Releases.

We intend to address code signing in a future phase (purchasing an
Authenticode certificate and adding a signing step to the release pipeline).
Until then, the installer ships unsigned.
