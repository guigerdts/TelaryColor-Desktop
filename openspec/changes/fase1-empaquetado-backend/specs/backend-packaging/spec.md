# Backend Packaging Specification

## Purpose

Ship the FastAPI backend as a self-contained Windows binary (no Python install needed): Nuitka primary (`python -m nuitka --standalone`), PyInstaller fallback (`--onedir`). Covers build scripts, staging layout, smoke verification, size/time gates, and Windows CI validation.

## Requirements

### Requirement: Dual-Freezer Build Tooling

The system MUST provide build scripts under `uitka-build/` for both freezers: primary `python -m nuitka --standalone`, fallback PyInstaller `--onedir`. Onefile mode SHALL NOT be used. Both MUST include `app`, `bcrypt._bcrypt`, `pydantic_core`, `python_multipart`, and the SQLite dialect; MUST exclude `pytest`, `httpx`, `tkinter`, `unittest`, `setuptools`, `distutils`. Output MUST be `telarycolor-server` (`.exe` on Windows).

#### Scenario: Nuitka standalone build

- GIVEN Nuitka is installed
- WHEN the Nuitka script runs
- THEN a standalone folder with `telarycolor-server` is produced

#### Scenario: PyInstaller fallback build

- GIVEN PyInstaller is installed
- WHEN the fallback script runs
- THEN an onedir folder with `telarycolor-server` is produced

#### Scenario: Onefile mode forbidden

- GIVEN backend packaging is configured
- WHEN onefile mode is proposed
- THEN it SHALL NOT be used — exe-relative resources would break

### Requirement: Build Dependency Isolation

Build-only deps (`nuitka`, `pyinstaller`) MUST live in `backend/requirements-build.txt`; installing them MUST NOT alter runtime `backend/requirements.txt`.

#### Scenario: Runtime deps unchanged

- GIVEN `requirements-build.txt` is installed
- WHEN `requirements.txt` is inspected
- THEN its content is identical to before

### Requirement: Dist Staging Layout

The system MUST provide a staging script that assembles the distributable folder — binary plus `alembic/`, `alembic.ini`, `frontend/dist` beside the exe — runnable without Python installed.

#### Scenario: Staged folder complete

- GIVEN a successful build
- WHEN the staging script runs
- THEN binary, `alembic/`, `alembic.ini`, and `frontend/dist` exist beside each other

### Requirement: Binary Smoke Verification

The system MUST provide `uitka-build/test_binary.sh` booting the staged binary to verify: migrations apply, `.port` + `PORT:` line appear, `/health` returns 200, multipart upload returns 200, SPA `GET /` returns 200 when `frontend/dist` is staged.

#### Scenario: Boot chain verified

- GIVEN a staged binary launched
- WHEN the smoke script runs
- THEN migrations apply, `.port` is written, and health returns 200

#### Scenario: Multipart upload verified

- GIVEN a staged binary running
- WHEN a multipart file upload is posted
- THEN it returns 200, proving `python-multipart` is bundled

#### Scenario: SPA served when staged

- GIVEN `frontend/dist` staged beside the binary
- WHEN `GET /` is requested
- THEN it returns 200 with the SPA

### Requirement: Size and Start-Time Gates

The staged distributable MUST be under 200 MB and first serve `/health` 200 in under 3 seconds; the smoke script MUST measure both and fail when exceeded.

#### Scenario: Size gate

- GIVEN a staged folder
- WHEN total size is measured
- THEN it is under 200 MB

#### Scenario: Start-time gate

- GIVEN a cold start
- WHEN health first returns 200
- THEN under 3 seconds have elapsed

### Requirement: Windows CI Build and Validation

The system MUST provide a GitHub Actions `windows-latest` job on Python 3.13.x building with Nuitka (MSVC, preinstalled on CI), staging the dist, and validating migrations → `.port` → health, verifying cp313 dependency wheels.

#### Scenario: Windows artifact built and validated

- GIVEN the workflow runs on `windows-latest` with Python 3.13.x
- WHEN the job completes
- THEN a validated `telarycolor-server.exe` is produced and uploaded as an artifact

### Requirement: Hard Termination Tolerance

On Windows, hard termination (Electron kill / TerminateProcess) MUST NOT corrupt the SQLite database (WAL). The next boot MUST re-apply migrations idempotently and serve health 200. On POSIX, SIGINT/SIGTERM SHOULD shut down gracefully.

#### Scenario: Hard kill then clean restart

- GIVEN a running staged binary
- WHEN it is force-terminated and relaunched
- THEN the database is uncorrupted and health returns 200

#### Scenario: Graceful shutdown on POSIX

- GIVEN a running binary on POSIX
- WHEN SIGTERM is received
- THEN the server shuts down gracefully

### Requirement: Toolchain Version Consistency

Build scripts, CI, and docs MUST target Python 3.13.x (confirmed default); 3.12 references MUST be corrected.

#### Scenario: Version pinned across toolchain

- GIVEN build scripts, CI workflow, and docs
- WHEN Python version references are inspected
- THEN all resolve to 3.13.x