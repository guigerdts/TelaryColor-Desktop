# Delta for portable-startup

## ADDED Requirements

### Requirement: Shutdown Endpoint

The system MUST expose `POST /api/v1/system/shutdown` bound to `127.0.0.1`, unauthenticated (same trust as `/health`), registered BEFORE the SPA catch-all route. On call it MUST set `server.should_exit = True`, triggering uvicorn graceful drain.

#### Scenario: Graceful stop

- GIVEN the backend runs on `127.0.0.1`
- WHEN `POST /api/v1/system/shutdown` is called
- THEN `server.should_exit = True` and uvicorn drains and exits

#### Scenario: Registered before the catch-all

- GIVEN the SPA catch-all is mounted at `/`
- WHEN the shutdown request is received
- THEN it reaches the endpoint, not the `index.html` fallback

#### Scenario: Loopback-only and unauthenticated

- GIVEN a loopback client without an Authorization header
- WHEN `POST /api/v1/system/shutdown` is sent
- THEN it succeeds (same trust model as `/health`), and non-loopback callers cannot reach the bound port

### Requirement: Reuse-Alive Probe Contract

The `.port` file plus `GET /health` MUST together provide the discovery + liveness contract consumed by the Electron reuse-alive probe: a probe-verified live backend is reused, and the shell MUST NOT spawn a second backend while one is live.

#### Scenario: Live backend is reused

- GIVEN `.port` exists and `/health` answers 200
- WHEN the shell probes before spawning
- THEN the shell reuses the backend and spawns nothing

#### Scenario: Orphan is not trusted

- GIVEN `.port` exists but `/health` does not respond within the probe timeout
- WHEN the shell probes
- THEN the backend is treated as dead, a fresh one is spawned, and it overwrites the stale `.port`

## MODIFIED Requirements

### Requirement: Port Discovery Contract

The system MUST write the selected port to a `.port` file in `app_data_dir()` (`%APPDATA%/TelaryColor/data/` frozen, `backend/data/` dev) and log it to stdout as `PORT:<port>`. The `.port` file MUST be overwritten on each boot. This contract enables Electron (Fase 1+) to discover the backend port and — combined with `GET /health` — to determine whether the backend is alive for reuse.
(Previously: `.port` written to the app base directory and only described as a discovery signal.)

#### Scenario: Port file written

- GIVEN the app has selected a port
- WHEN the boot completes
- THEN `<app_data_dir>/.port` contains the port number as plain text

#### Scenario: Stdout port log

- GIVEN the app has selected port 8001
- WHEN the boot completes
- THEN stdout contains a line matching `PORT:8001`

#### Scenario: Stale .port overwritten on reboots

- GIVEN a stale `.port` from a crashed process exists
- WHEN a fresh backend boots
- THEN the file is overwritten with the new port