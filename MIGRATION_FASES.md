# Migración TelaryColor a Aplicación de Escritorio — Plan Maestro

**Versión:** 1.0  
**Fecha:** 2026-09-04  
**Estado:** Plan aprobado — listo para ejecución  
**Objetivo:** Convertir TelaryColor (web/PWA) en una aplicación de escritorio
autocontenida para Windows, optimizada para uso diario en área de pintura.

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura actual (diagnóstico)](#2-arquitectura-actual)
3. [Producto final — especificaciones](#3-producto-final)
4. [Stack de empaquetado](#4-stack-de-empaquetado)
5. [Fase 0 — Preparación y configuración portable](#5-fase-0)
6. [Fase 1 — Empaquetado del backend (Nuitka)](#6-fase-1)
7. [Fase 2 — Integración del frontend](#7-fase-2)
8. [Fase 3 — Ventana nativa (Electron)](#8-fase-3)
9. [Fase 4 — Generación del instalador](#9-fase-4)
10. [Fase 5 — CI/CD automatizado](#10-fase-5)
11. [Fase 6 — Testing y QA](#11-fase-6)
12. [Fase 7 — Documentación y entrega](#12-fase-7)
13. [Rendimiento y optimización](#13-rendimiento)
14. [Seguridad](#14-seguridad)
15. [Backups y recuperación](#15-backups)
16. [Multi-usuario y concurrencia](#16-multi-usuario)
17. [Mecanismo de actualización](#17-actualizaciones)
18. [Monitoreo y logging](#18-monitoreo)
19. [Plan de contingencia](#19-contingencia)
20. [Apéndice técnico](#20-apendice)

---

## 1. Resumen ejecutivo

### El problema

TelaryColor es una app web funcional (FastAPI + React) que requiere un
servidor para funcionar. El área de pintura no tiene servidor disponible y
necesita una app que se instale directamente en una PC Windows como un
programa normal.

### La solución

Empaquetar todo (backend + frontend + SQLite + uploads) en un ejecutable
autocontenido que:
- Se instala con doble clic en Windows
- Corre localmente sin internet
- Abre una ventana nativa con la app
- Se actualiza automáticamente desde GitHub Releases

### Combinación elegida

| Decisión | Elección | Razón |
|----------|----------|-------|
| Backend | **Nuitka** (no PyInstaller) | Binarios más chicos, arranque rápido, menos falsos positivos |
| Shell | **Electron** | Feeling nativo, JS/TS conocido, control total de ventana |
| Instalador | **electron-builder (NSIS)** | Genera .exe instalable con auto-update |
| Build | **GitHub Actions** | .exe automático por tag/release |

### Métricas objetivo

| Métrica | Objetivo | Cómo se mide |
|---------|----------|--------------|
| Tiempo de arranque | < 3 segundos | Desde doble clic hasta ventana lista |
| Uso de RAM | < 300 MB | Promedio en uso diario |
| Uso de disco | < 500 MB | Instalación completa con datos |
| Tiempo de búsqueda | < 200 ms | Búsqueda de Pantone por código |
| Tiempo de carga de diseño | < 500 ms | Listado de diseños con colores |
| Disponibilidad | 99.9% local | Sin dependencia de red |

---

## 2. Arquitectura actual

### 2.1 Stack tecnológico

```
┌─────────────────────────────────────────────┐
│                  FRONTEND                    │
│  React 19 + Vite + Tailwind 4 (PWA)         │
│  API: /api/v1/* (relative, same-origin)      │
│  Auth: JWTBearer en cada request             │
│  State: React hooks, no Redux                │
│  Build: vite build → frontend/dist/          │
└──────────────────┬──────────────────────────┘
                   │ HTTP (same-origin)
┌──────────────────▼──────────────────────────┐
│                  BACKEND                     │
│  FastAPI + uvicorn                           │
│  Auth: bcrypt + JWT                          │
│  DB: SQLite via SQLAlchemy + Alembic         │
│  Modules:                                    │
│    - access_logs (audit trail)               │
│    - pantone_colors (CRUD + hex suggest)     │
│    - formulas (CRUD + ingredients)           │
│    - designs (CRUD + design_colors)          │
│    - formula_designs (cross-links)           │
│    - inventory (stock + transactions)        │
│    - samples (muestras)                      │
│    - users (CRUD + roles)                    │
│  Static: /uploads (sample photos)            │
│  SPA: frontend/dist served at /              │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│               DATA LAYER                     │
│  SQLite: backend/data/app.db                 │
│  Migrations: alembic/versions/               │
│  Uploads: backend/data/uploads/              │
│  Seed: backend/seed.py (pantone dataset)     │
└─────────────────────────────────────────────┘
```

### 2.2 Patrón actual

- **Single-origin**: FastAPI sirve el SPA desde `/` y la API desde `/api/v1/*`
- **Sin CORS**: todo corre del mismo proceso
- **JWT auth**: token en localStorage, `Authorization: Bearer <token>`
- **SQLite WAL**: modo Write-Ahead Logging para concurrencia de lectura
- **Alembic**: migraciones numeradas (0001-0006), downgrade seguro

### 2.3 Lo que NO cambia

- Ningún módulo del backend se modifica
- Ningún componente del frontend se reescribe
- La lógica de negocio permanece intacta
- El esquema de base de datos no cambia
- Las migraciones existentes se aplican igual

### 2.4 Lo que SÍ cambia

- **Rutas de datos**: de `backend/data/` a `%APPDATA%\TelaryColor\data\`
- **Puerto**: de hardcoded 8000 a dinámico o configurable
- **Entry point**: de `python -m uvicorn` a script de arranque propio
- **Distribución**: de `git push` a `.exe` instalable

---

## 3. Producto final — especificaciones

### 3.1 Nombre y branding

- **Nombre**: TelaryColor
- **Versión**: semver (1.0.0, 1.0.1, etc.)
- **Icono**: usar el existente de la PWA (maskable, 512x512)
- **Color de acento**: `#281c` (accent-281c del design system)

### 3.2 Experiencia de usuario

#### Instalación
1. Usuario descarga `TelaryColor-Setup-1.0.0.exe` desde un link o USB
2. Doble clic → asistente de instalación (idioma, carpeta, icono de escritorio)
3. Finaliza → icono en escritorio + menú Inicio
4. La app se abre automáticamente la primera vez

#### Uso diario
1. Doble clic en icono → la app arranca en < 3 segundos
2. Ventana nativa con el logo de TelaryColor (sin barra de URL)
3. Login con credenciales (admin/operador según rol)
4. Todas las funcionalidades disponibles: Pantone, Fórmulas, Diseños,
   Inventario, Muestras, Búsqueda
5. La app persiste en el system tray al cerrar la ventana
7. Click en tray → reabre la ventana
8. Click derecho en tray → opción de salir (apaga el backend)

#### Cierre
1. Click en X de la ventana → minimize a tray (no cierra)
2. Click derecho en tray → "Salir" → confirma → apaga backend → cierra

### 3.3 Características técnicas del ejecutable

| Característica | Especificación |
|----------------|---------------|
| Plataforma | Windows 10/11 (x64) |
| Runtime Python | embebido via Nuitka (no requiere Python instalado) |
| Frontend | build estático embebido en el binario |
| Base de datos | SQLite portable en `%APPDATA%\TelaryColor\data\` |
| Uploads | `%APPDATA%\TelaryColor\data\uploads\` |
| Logs | `%APPDATA%\TelaryColor\logs\` |
| Config | `%APPDATA%\TelaryColor\config.yaml` (opcional) |
| Puerto | dinámico (auto-detect) o configurable en config.yaml |
| Arranque | < 3 segundos (backend + frontend listos) |
| RAM promedio | < 300 MB (backend + Electron) |
| Disco instalación | < 500 MB (binario + dependencias) |
| Disco con datos | crece con uso (fotos de muestras) |

### 3.4 Funcionalidades incluidas

Todas las funcionalidades web actuales, sin excepción:

| Módulo | Funcionalidades | Estado |
|--------|----------------|--------|
| **Auth** | Login, JWT, roles (admin/operador) | ✅ existente |
| **Pantone** | CRUD, búsqueda por código, suggest hex, gamut C/TPX/U, paint_type | ✅ existente |
| **Fórmulas** | CRUD, ingredientes, link a Pantone, link a Diseños | ✅ existente |
| **Diseños** | CRUD, selección de colores por paint_type, 1-7 colores | ✅ existente |
| **Inventario** | Stock, transacciones (consumo/ingreso), alertas bajo umbral | ✅ existente |
| **Muestras** | Registro, foto, link a Pantone | ✅ existente |
| **Búsqueda** | Búsqueda global por código PMS, nombre, hex | ✅ existente |
| **Dashboard** | Resumen, acciones rápidas, alertas, recientes | ✅ existente |
| **Admin** | Gestión de usuarios | ✅ existente |

### 3.5 Funcionalidades NUEVAS para desktop

| Funcionalidad | Descripción | Prioridad |
|---------------|-------------|-----------|
| **System tray** | Minimizar a tray, cerrar a tray, menu de tray | P0 |
| **Auto-start** | Opción de iniciar con Windows (configurable) | P1 |
| **Auto-update** | Descargar e instalar actualizaciones desde GitHub | P1 |
| **Backup automático** | Copia diaria de la DB a `%APPDATA%\TelaryColor\backups\` | P0 |
| **Exportar datos** | Exportar pantones/fórmulas/diseños a CSV o Excel | P1 |
| **Notificaciones** | Alertas de stock bajo, muestras pendientes (Windows toast) | P2 |
| **Configuración** | Panel de settings: puerto, auto-start, backups, tema | P1 |
| **Atajos de teclado** | Ctrl+K búsqueda, Ctrl+N nuevo, Esc cerrar paneles | P1 |
| **Modo offline** | Indicatorio visual de que todo es local (sin dependencia) | P2 |
| **Logs** | Panel de logs para debug (solo admin) | P2 |

### 3.6 Rendimiento objetivo

#### Arranque
```
Doble clic → ventana lista: < 3 segundos
  ├─ Electron arranca: ~500ms
  ├─ Backend uvicorn start: ~1500ms
  ├─ Alembic check (no-op si al día): ~200ms
  ├─ Frontend load: ~300ms
  └─ Login screen visible: ~500ms
```

#### Operaciones típicas
```
Búsqueda Pantone por código:     < 100ms
Listado de diseños:              < 200ms
Detalle de diseño con colores:   < 300ms
Creación de fórmula:             < 200ms
Upload de foto de muestra:       < 1s (depende del tamaño)
Exportar a CSV:                  < 500ms
```

#### Memoria
```
Backend uvicorn (idle):          ~50-80 MB RAM
Backend uvicorn (carga pesada):  ~150 MB RAM
Electron ( ventana):          ~80-120 MB RAM
Electron (con pestañas):        ~200 MB RAM
Total promedio en uso diario:    ~200-300 MB RAM
```

#### Disco
```
Instalación limpia:              ~300-400 MB
  ├─ Binario backend:            ~150-250 MB (Nuitka)
  ├─ Frontend build:             ~1-2 MB (comprimido)
  ├─ Electron:                   ~150 MB
  └─ Dependencias:               ~10-20 MB

Con datos (1 año de uso):        ~500 MB - 1 GB
  ├─ Base de datos:              ~10-50 MB
  ├─ Fotos de muestras:          ~100-500 MB
  ├─ Backups:                    ~50-200 MB
  └─ Logs:                       ~10-50 MB
```

---

## 4. Stack de empaquetado

### 4.1 Por qué Nuitka (no PyInstaller)

| Criterio | PyInstaller | Nuitka |
|----------|-------------|---------|
| Tamaño binario | 200-400 MB | 50-150 MB |
| Arranque | lento (desempaqueta) | rápido (nativo) |
| Falsos positivos antivirus | frecuentes | raros |
| Cross-compile | no | no (pero CI lo resuelve) |
| Soporte Python 3.13 | sí | sí |
| Compilación a C | no | sí |
| Mantenimiento | activo | activo |

### 4.2 Dependencias de empaquetado

```
# Backend
pip install -r requirements-build.txt  # fallback: re-run con PyInstaller

# Frontend
npm install  # ya existente

# Electron
npm install electron electron-builder electron-updater

# Installer
# electron-builder genera NSIS (.exe instalable)
```

### 4.3 Estructura del ejecutable

```
TelaryColor-1.0.0.exe          # Electron + frontend embebido
├── resources/
│   ├── backend/                # Binario Nuitka del backend
│   │   ├── telarycolor-server.exe
│   │   ├── alembic/            # Migraciones
│   │   └── _internal/          # Runtime Python + dependencias
│   ├── frontend/               # Build de Vite (estático)
│   │   ├── index.html
│   │   ├── assets/
│   │   └── manifest.json
│   └── app.asar                # Código Electron (JS)
└── Uninstall TelaryColor.exe   # Generado por NSIS
```

### 4.4 Variables de entorno del ejecutable

```python
# El entry script detecta si corre como exe
import sys
import os

if getattr(sys, 'frozen', False):
    # Corriendo como exe (Nuitka/PyInstaller)
    BASE_DIR = os.path.dirname(sys.executable)
    DATA_DIR = os.path.join(os.environ['APPDATA'], 'TelaryColor', 'data')
    LOG_DIR = os.path.join(os.environ['APPDATA'], 'TelaryColor', 'logs')
    MIGRATIONS_DIR = os.path.join(BASE_DIR, 'alembic')
else:
    # Corriendo en desarrollo
    BASE_DIR = os.path.dirname(os.path.dirname(__file__))
    DATA_DIR = os.path.join(BASE_DIR, 'data')
    LOG_DIR = os.path.join(BASE_DIR, 'logs')
    MIGRATIONS_DIR = os.path.join(BASE_DIR, '..', 'alembic')
```

---

## 5. Fase 0 — Preparación y configuración portable

**Objetivo:** Preparar el código para que funcione tanto en desarrollo como
en el ejecutable empaquetado, sin romper nada existente.

**Duración estimada:** 2-3 días  
**Riesgo:** Bajo (solo se agregan paths, no se cambia lógica)

### 5.1 Tarea 0.1: Configuración de rutas portables

**Archivo a crear:** `backend/app/core/paths.py`

```python
"""Portable path resolution — works in dev and frozen exe."""
import os
import sys
from pathlib import Path


def is_frozen() -> bool:
    """True when running as a Nuitka/PyInstaller bundle."""
    return getattr(sys, 'frozen', False)


def app_base_dir() -> Path:
    """Base directory of the application (exe dir or repo root)."""
    if is_frozen():
        return Path(sys.executable).parent
    return Path(__file__).resolve().parents[3]


def app_data_dir() -> Path:
    """Persistent data directory (survives reinstalls)."""
    if is_frozen():
        data = Path(os.environ.get('APPDATA', '~')) / 'TelaryColor' / 'data'
    else:
        data = app_base_dir() / 'data'
    data.mkdir(parents=True, exist_ok=True)
    return data


def app_log_dir() -> Path:
    """Log directory."""
    if is_frozen():
        log = Path(os.environ.get('APPDATA', '~')) / 'TelaryColor' / 'logs'
    else:
        log = app_base_dir() / 'logs'
    log.mkdir(parents=True, exist_ok.0exist_ok=True)
    return log


def db_path() -> Path:
    """SQLite database file path."""
    return app_data_dir() / 'app.db'


def uploads_dir() -> Path:
    """Photo uploads directory."""
    d = app_data_dir() / 'uploads'
    d.mkdir(parents=True, exist_ok=True)
    return d


def migrations_dir() -> Path:
    """Alembic migrations directory."""
    if is_frozen():
        return app_base_dir() / 'alembic'
    return app_base_dir() / 'backend' / 'alembic'


def static_dir() -> Path:
    """Frontend static build directory."""
    if is_frozen():
        return app_base_dir().parent / 'frontend'
    return app_base_dir / 'frontend' / 'dist'
```

**Archivos a modificar:**
- `backend/app/core/config.py` → usar `db_path()` en vez de path hardcodeado
- `backend/app/main.py` → usar `static_dir()` para el SPA mount
- `backend/app/modules/inventory/router.py` → usar `uploads_dir()` para fotos
- `backend/alembic.ini` → usar `migrations_dir()` para la ruta de migraciones

### 5.2 Tarea 0.2: Configuración de puerto dinámico

**Archivo a crear:** `backend/app/core/port.py`

```python
"""Dynamic port selection — avoids conflicts with dev servers."""
import socket


def find_free_port(preferred: int = 8000) -> int:
    """Return preferred port if free, otherwise find a random free one."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('127.0.0.1', preferred))
            return preferred
        except OSError:
            s.bind(('127.0.0.1', 0))
            return s.getsockname()[1]
```

**Archivo a modificar:** `backend/app/main.py`

```python
# Agregar al final de main.py (solo para el exe)
if __name__ == '__main__':
    import uvicorn
    from app.core.port import find_free_port
    from app.core.paths import app_log_dir

    port = find_free_port(8000)
    log_file = app_log_dir() / 'uvicorn.log'

    uvicorn.run(
        'app.main:app',
        host='127.0.0.1',
        port=port,
        log_level='info',
        access_log=True,
    )
```

### 5.3 Tarea 0.3: Entry script para el exe

**Archivo a crear:** `backend/entry.py`

```python
"""Entry point for the frozen executable.

Responsibilities:
1. Resolve portable paths (data, logs, migrations)
2. Apply Alembic migrations (auto-upgrade on first run)
3. Start uvicorn on a free port
4. Write port to a file for Electron to discover
5. Handle graceful shutdown (SIGINT/SIGTERM)
"""
import sys
import os
import signal
import subprocess
import time
from pathlib import Path

from app.core.paths import app_data_dir, app_log_dir, migrations_dir, db_path
from app.core.port import find_free_port


def apply_migrations():
    """Run alembic upgrade head if migrations exist."""
    mig_dir = migrations_dir()
    ini_file = mig_dir.parent / 'alembic.ini'
    if not ini_file.exists():
        return

    # Use subprocess to run alembic in-process-compatible way
    env = os.environ.copy()
    env['DATABASE_URL'] = f'sqlite:///{db_path()}'

    result = subprocess.run(
        [sys.executable, '-m', 'alembic', '-c', str(ini_file), 'upgrade', 'head'],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        print(f'Migration warning: {result.stderr}', file=sys.stderr)


def write_port_file(port: int):
    """Write the active port to a temp file for Electron to read."""
    port_file = app_data_dir() / '.port'
    port_file.write_text(str(port))


def main():
    # 1. Apply migrations
    apply_migrations()

    # 2. Find free port
    port = find_free_port(8000)
    write_port_file(port)

    # 3. Start uvicorn
    import uvicorn

    def shutdown(signum, frame):
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print(f'TelaryColor backend starting on port {port}')
    uvicorn.run(
        'app.main:app',
        host='127.0.0.1',
        port=port,
        log_level='info',
    )


if __name__ == '__main__':
    main()
```

### 5.4 Tarea 0.4: Configuración YAML opcional

**Archivo a crear:** `backend/app/core/settings.py`

```python
"""Optional YAML configuration for the desktop app.

Config file location: %APPDATA%/TelaryColor/config.yaml
All settings have sensible defaults — the file is optional.
"""
import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class Settings:
    port: int = 8000
    auto_start: bool = False
    minimize_to_tray: bool = True
    backup_enabled: bool = True
    backup_interval_hours: int = 24
    backup_keep_days: int = 30
    log_level: str = 'info'
    theme: str = 'dark'

    @classmethod
    def load(cls, path: Path | None = None) -> 'Settings':
        if path is None:
            if os.name == 'nt':
                path = Path(os.environ.get('APPDATA', '~')) / 'TelaryColor' / 'config.yaml'
            else:
                path = Path('~') / '.config' / 'telarycolor' / 'config.yaml'

        if path.exists():
            with open(path) as f:
                data = yaml.safe_load(f) or {}
            return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
        return cls()
```

### 5.5 Tarea 0.5: Tests de paths portables

**Archivo a crear:** `backend/tests/test_paths.py`

```python
"""Tests for portable path resolution."""
import os
import sys
from pathlib import Path
from unittest.mock import patch

from app.core.paths import app_data_dir, db_path, is_frozen


def test_is_frozen_false_in_dev():
    assert is_frozen() is False


def test_app_data_dir_in_dev():
    with patch.object(sys, 'frozen', False):
        d = app_data_dir()
        assert d.exists()
        assert 'data' in str(d)


def test_db_path_in_dev():
    with patch.object(sys, 'frozen', False):
        p = db_path()
        assert p.name == 'app.db'


def test_app_data_dir_in_frozen():
    with patch.object(sys, 'frozen', True), \
         patch.object(sys, 'executable', '/tmp/TelaryColor/server.exe'), \
         patch.dict(os.environ, {'APPDATA': '/tmp/test_appdata'}):
        d = app_data_dir()
        assert 'TelaryColor' in str(d)
        assert 'data' in str(d)
```

### 5.6 Verificación de la Fase 0

- [ ] `python -m pytest backend/tests/test_paths.py` pasa
- [ ] `python -m uvicorn app.main:app` sigue funcionando igual
- [ ] `npm run build` + abrir `frontend/dist/index.html` funciona
- [ ] Todas las migraciones se aplican correctamente
- [ ] Rutas de uploads apuntan al directorio correcto
- [ ] Puerto dinámico funciona (8000 ocupado → usa otro)

---

## 6. Fase 1 — Empaquetado del backend (Nuitka)

**Objetivo:** Convertir el backend Python en un ejecutable Windows nativo.

**Duración estimada:** 2-3 días  
**Riesgo:** Medio ( puede fallar con dependencias C como bcrypt)

### 6.1 Tarea 1.1: Setup de Nuitka

**Archivo a crear:** `uitka-build/compile.py`

```python
"""Nuitka compilation script for TelaryColor backend."""
import subprocess
import sys
from pathlib import Path


def compile_backend():
    """Compile the backend to a standalone executable."""
    backend_dir = Path(__file__).parent.parent / 'backend'

    cmd = [
        sys.executable, '-m', 'nuitka',
        '--standalone',
        '--standalone',  # onefile SHALL NOT be used (exe-relative resources)
        '--output-dir=dist',
        '--output-filename=telarycolor-server',
        '--include-data-dir=alembic=alembic',  # include migrations
        '--include-package=app',
        '--include-package=sqlalchemy',
        '--include-package=fastapi',
        '--include-package=uvicorn',
        '--include-package=jwt',
        '--include-package=bcrypt',
        '--include-package=pydantic',
        '--include-package=email_validator',
        '--nofollow-import-to=tkinter',  # not needed
        '--nofollow-import-to=unittest',  # use pytest instead
        '--windows-console-mode=disable',  # no console window
        f'--output-path={backend_dir / "dist"}',
        str(backend_dir / 'entry.py'),
    ]

    print(f'Running: {" ".join(cmd)}')
    result = subprocess.run(cmd, cwd=backend_dir)
    return result.returncode


if __name__ == '__main__':
    sys.exit(compile_backend())
```

### 6.2 Tarea 1.2: Fallback PyInstaller

Si Nuitka falla con alguna dependencia:

**Archivo a crear:** `uitka-build/compile_pyinstaller.py`

```python
"""PyInstaller fallback compilation."""
import subprocess
import sys
from pathlib import Path


def compile_backend():
    backend_dir = Path(__file__).parent.parent / 'backend'

    cmd = [
        sys.executable, '-m', 'PyInstaller',
        '--onedir',
        '--name=telarycolor-server',
        '--distpath=dist',
        '--workpath=build',
        '--specpath=build',
        '--noconsole',
        '--add-data=alembic;alembic',
        '--hidden-import=app',
        '--hidden-import=sqlalchemy.dialects.sqlite',
        str(backend_dir / 'entry.py'),
    ]

    result = subprocess.run(cmd, cwd=backend_dir)
    return result.returncode


if __name__ == '__main__':
    sys.exit(compile_backend())
```

### 6.3 Tarea 1.3: Test del binario

**Script de verificación:** `uitka-build/test_binary.sh`

```bash
#!/bin/bash
# Test the compiled backend binary
set -e

BINARY="backend/dist/telarycolor-server"
if [ ! -f "$BINARY" ]; then
    echo "ERROR: Binary not found at $BINARY"
    exit 1
fi

echo "Binary size: $(du -h $BINARY | cut -f1)"
echo "Starting backend..."
$BINARY &
PID=$!
sleep 3

# Test health endpoint
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/health)
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Backend is healthy (HTTP $HTTP_CODE)"
else
    echo "❌ Backend health check failed (HTTP $HTTP_CODE)"
    kill $PID 2>/dev/null
    exit 1
fi

# Test SPA serving
SPA_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/)
if [ "$SPA_CODE" = "200" ]; then
    echo "✅ SPA is being served (HTTP $SPA_CODE)"
else
    echo "❌ SPA serving failed (HTTP $SPA_CODE)"
    kill $PID 2>/dev/null
    exit 1
fi

kill $PID 2>/dev/null
echo "✅ All tests passed"
```

### 6.4 Tarea 1.4: Optimización del binario

| Optimización | Comando Nuitka | Impacto |
|-------------|-----------------|---------|
| Strip symbols | (default desde Nuitka 4.x; `--strip` fue eliminado) | ya incluido |
| UPX compress | `--upx-dir=/path/to/upx` | -30-50% tamaño |
| Exclude unused | `--nofollow-import-to=` | -10-20% tamaño |
| One-file mode | `--onefile` (PROHIBIDO) | rompe recursos relativos al exe |
| One-dir mode | `--standalone` (default) | más rápido arranque, carpeta con archivos |

**Recomendación:** usar `--standalone` (no `--onefile`) para la primera
versión. El arranque es 2-3x más rápido. El instalador NSIS se encarga
de distribuir la carpeta.

### 6.5 Tarea 1.5: Manejo de dependencias problemáticas

Algunas dependencias pueden fallar con Nuitka:

| Dependencia | Problema conocido | Solución |
|-------------|-------------------|----------|
| `bcrypt` | usa C extension | `--include-module=bcrypt._bcrypt` |
| `sqlalchemy` | dialectos dinámicos | `--include-package=sqlalchemy.dialects` |
| `jwt` | imports dinámicos | `--include-module=jwt` |
| `pydantic` | V2 core | `--include-package=pydantic_core` |
| `fastapi` | includes dinámicos | `--include-package=fastapi` |

### 6.6 Verificación de la Fase 1

- [ ] Binario se compila sin errores
- [ ] Binario arranca y sirve la API en < 3 segundos
- [ ] Binario aplica migraciones automáticamente
- [ ] Binario detecta puerto libre
- [ ] Binario escribe archivo `.port`
- [ ] Binario maneja SIGINT/SIGTERM gracefully
- [ ] Tamaño del binario < 200 MB
- [ ] Binario funciona sin Python instalado en la PC

---

## 7. Fase 2 — Integración del frontend

**Objetivo:** Combinar el binario del backend con el build del frontend
en una estructura que Electron pueda servir.

**Duración estimada:** 1 día  
**Riesgo:** Bajo (el frontend ya sirve desde FastAPI)

### 7.1 Tarea 2.1: Build del frontend para producción

```bash
cd frontend
npm run build
# Genera frontend/dist/ con HTML, JS, CSS
```

### 7.2 Tarea 2.2: Estructura de distribución

```
TelaryColor-1.0.0-win32-x64/
├── TelaryColor.exe              # Electron (entry point)
├── resources/
│   ├── backend/
│   │   ├── telarycolor-server.exe
│   │   ├── alembic/
│   │   │   ├── env.py
│   │   │   └── versions/
│   │   │       ├── 0001_initial.py
│   │   │       ├── 0002_...
│   │   │       └── 0006_paint_type_unique.py
│   │   └── _internal/           # runtime Python + deps
│   └── frontend/
│       ├── index.html
│       └── assets/
│           ├── index-[hash].js
│           ├── index-[hash].css
│           └── ...
├── Uninstall TelaryColor.exe
└── TelaryColor.ico
```

### 7.3 Tarea 2.3: Script de empaquetado

**Archivo a crear:** `scripts/package.sh`

```bash
#!/bin/bash
# Package backend + frontend into Electron resources
set -e

VERSION=$(node -p "require('./package.json').version")
DIST="dist/TelaryColor-${VERSION}-win32-x64"

echo "📦 Packaging TelaryColor ${VERSION}..."

# Clean
rm -rf dist/
mkdir -p "${DIST}/resources/backend"
mkdir -p "${DIST}/resources/frontend"

# Copy backend binary
cp backend/dist/telarycolor-server.exe "${DIST}/resources/backend/"
cp -r backend/alembic "${DIST}/resources/backend/"

# Copy frontend build
cp -r frontend/dist/* "${DIST}/resources/frontend/"

echo "✅ Package ready at ${DIST}"
```

### 7.4 Verificación de la Fase 2

- [ ] Frontend build completo (sin warnings)
- [ ] Backend binario copiado correctamente
- [ ] Migraciones incluidas
- [ ] Estructura de directorios correcta
- [ ] La app funciona si se ejecuta directamente el exe de Electron

---

## 8. Fase 3 — Ventana nativa (Electron)

**Objetivo:** Crear el shell de Electron que levanta el backend y muestra
la app en una ventana nativa sin barra de URL.

**Duración estimada:** 3-4 días  
**Riesgo:** Bajo (Electron es bien documentado)

### 8.1 Tarea 3.1: Setup del proyecto Electron

**Archivo a crear:** `electron/package.json`

```json
{
  "name": "telarycolor",
  "version": "1.0.0",
  "description": "TelaryColor — Gestor de Fórmulas de Color",
  "main": "main.js",
  "author": "TelaryColor Team",
  "license": "MIT",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder --win",
    "build:dir": "electron-builder --win --dir"
  },
  "build": {
    "appId": "com.telarycolor.app",
    "productName": "TelaryColor",
    "win": {
      "target": "nsis",
      "icon": "assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "TelaryColor"
    },
    "files": [
      "main.js",
      "preload.js",
      "assets/**/*"
    ],
    "extraResources": [
      {
        "from": "../backend/dist/telarycolor-server.exe",
        "to": "backend/telarycolor-server.exe"
      },
      {
        "from": "../backend/alembic",
        "to": "backend/alembic"
      },
      {
        "from": "../frontend/dist",
        "to": "frontend"
      }
    ]
  },
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-builder": "^24.0.0"
  }
}
```

### 8.2 Tarea 3.2: Main process de Electron

**Archivo a crear:** `electron/main.js`

```javascript
// TelaryColor Electron main process
// Responsibilities:
// 1. Start backend process
// 2. Wait for backend to be ready (port file)
// 3. Create BrowserWindow pointing to localhost:PORT
// 4. Manage system tray
// 5. Handle graceful shutdown

const { app, BrowserWindow, Tray, Menu, nativeImage, dialog } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const net = require('net')

// ── Paths ──────────────────────────────────────────────────────────────

function getBackendPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'telarycolor-server.exe')
  }
  return path.join(__dirname, '..', 'backend', 'dist', 'telarycolor-server.exe')
}

function getPortFilePath() {
  const dataDir = path.join(app.getPath('appData'), 'TelaryColor', 'data')
  return path.join(dataDir, '.port')
}

// ── Backend management ─────────────────────────────────────────────────

let backendProcess = null
let backendPort = null

function startBackend() {
  return new Promise((resolve, reject) => {
    const backendPath = getBackendPath()

    if (!fs.existsSync(backendPath)) {
      reject(new Error(`Backend not found at ${backendPath}`))
      return
    }

    backendProcess = spawn(backendPath, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })

    backendProcess.stdout.on('data', (data) => {
      const output = data.toString()
      console.log('[backend]', output.trim())

      // Detect port from output
      const portMatch = output.match(/port (\d+)/)
      if (portMatch) {
        backendPort = parseInt(portMatch[1], 10)
        resolve(backendPort)
      }
    })

    backendProcess.stderr.on('data', (data) => {
      console.error('[backend:err]', data.toString().trim())
    })

    backendProcess.on('error', (err) => {
      console.error('[backend] Failed to start:', err)
      reject(err)
    })

    backendProcess.on('exit', (code) => {
      console.log(`[backend] Exited with code ${code}`)
      backendProcess = null
    })

    // Timeout: kill and reject if not ready in 10 seconds
    setTimeout(() => {
      if (!backendPort) {
        reject(new Error('Backend did not start within 10 seconds'))
      }
    }, 10000)
  })
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill('SIGTERM')
    backendProcess = null
  }
}

function waitForPort(host, port, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    function check() {
      const socket = new net.Socket()
      socket.setTimeout(200)
      socket.on('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.on('error', () => {
        socket.destroy()
        if (Date.now() - start > timeout) {
          reject(new Error(`Port ${port} not ready within ${timeout}ms`))
        } else {
          setTimeout(check, 100)
        }
      })
      socket.connect(port, host)
    }
    check()
  })
}

// ── Window ─────────────────────────────────────────────────────────────

let mainWindow = null
let tray = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'TelaryColor',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // show after ready
    backgroundColor: '#0f172a', // match dark theme
  })

  // Load the backend URL
  mainWindow.loadURL(`http://localhost:${backendPort}`)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── Tray ───────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir TelaryColor',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        app.isQuitting = true
        stopBackend()
        app.quit()
      },
    },
  ])

  tray.setToolTip('TelaryColor')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// ── App lifecycle ──────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    console.log('[electron] Starting TelaryColor...')
    console.log('[electron] Backend path:', getBackendPath())

    // Start backend
    const port = await startBackend()
    console.log(`[electron] Backend running on port ${port}`)

    // Wait for backend to be ready
    await waitForPort('127.0.0.1', port, 10000)
    console.log('[electron] Backend is ready')

    // Create window
    createWindow()
    createTray()

    console.log('[electron] TelaryColor is ready')
  } catch (err) {
    console.error('[electron] Failed to start:', err)
    dialog.showErrorBox(
      'TelaryColor — Error',
      `No se pudo iniciar el backend:\n${err.message}\n\nReinstalá la aplicación.`
    )
    app.quit()
  }
})

app.on('window-all-closed', () => {
  // Don't quit — keep tray alive
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  } else {
    mainWindow.show()
  }
})

app.on('before-quit', () => {
  app.isQuitting = true
  stopBackend()
})
```

### 8.3 Tarea 3.3: Preload script (seguridad)

**Archivo a crear:** `electron/preload.js`

```javascript
// Preload script — exposes safe APIs to the renderer
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('telarycolor', {
  version: process.env.npm_package_version || '1.0.0',
  platform: process.platform,
  isElectron: true,
})
```

### 8.4 Tarea 3.4: Iconos

**Archivos necesarios:**
- `electron/assets/icon.ico` — icono de la app (256x256, multi-resolución)
- `electron/assets/tray-icon.png` — icono del system tray (16x16)
- `electron/assets/icon.png` — icono para la ventana (512x512)

Generar desde el icono existente de la PWA usando `electron-icon-maker`
o similar.

### 8.5 Tarea 3.5: Dev mode para desarrollo

**Archivo a crear:** `electron/dev.js`

```javascript
// Development mode — no backend management, just open browser
const { app, BrowserWindow } = require('electron')

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { nodeIntegration: false },
  })

  // Point to dev server
  win.loadURL('http://localhost:5173')

  win.webContents.openDevTools()
})
```

### 8.6 Verificación de la Fase 3

- [ ] `npm run start` en `electron/` arranca la app
- [ ] Backend se inicia automáticamente
- [ ] Ventana se abre sin barra de URL
- [ ] System tray funciona (minimizar, abrir, salir)
- [ ] Click en X minimize a tray (no cierra)
- [ ] Click derecho en tray muestra menú
- [ ] "Salir" en tray apaga el backend y cierra la app
- [ ] La app se ve idéntica a la versión web
- [ ] Icono correcto en ventana y tray
- [ ] La app funciona sin conexión a internet

---

## 9. Fase 4 — Generación del instalador

**Objetivo:** Crear un `.exe` instalable que el usuario pueda ejecutar
para instalar TelaryColor en su PC.

**Duración estimada:** 1-2 días  
**Riesgo:** Bajo

### 9.1 Tarea 4.1: Configuración de electron-builder

La configuración ya está en `electron/package.json` (sección `build`).
Parámetros clave:

```json
{
  "build": {
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ],
      "icon": "assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "TelaryColor",
      "installerIcon": "assets/icon.ico",
      "uninstallerIcon": "assets/icon.ico",
      "installerHeaderIcon": "assets/icon.ico"
    }
  }
}
```

### 9.2 Tarea 4.2: Build del instalador

```bash
cd electron
npm run build
# Genera dist/TelaryColor-Setup-1.0.0.exe
```

### 9.3 Tarea 4.3: Test del instalador

1. Copiar `TelaryColor-Setup-1.0.0.exe` a una PC Windows limpia
2. Ejecutar el instalador
3. Verificar:
   - Se creó icono en escritorio
   - Se creó acceso en menú Inicio
   - La app arranca con doble clic
   - La app funciona correctamente
   - La desinstalación limpia todo

### 9.4 Tarea 4.4: Firma de código (opcional pero recomendado)

Para evitar falsos positivos de SmartScreen:

```bash
# Necesita un certificado de firma de código (~$200/año)
# O usar Let's Encrypt + signtool
signtool sign /f cert.pfx /p password /t http://timestamp.digicert.com dist/TelaryColor-Setup-1.0.0.exe
```

**Alternativa gratuita:** Documentar en el README cómo agregar una
excepción en SmartScreen/Defender para la app interna.

### 9.5 Verificación de la Fase 4

- [ ] El instalador se genera sin errores
- [ ] El instalador pesa < 500 MB
- [ ] La instalación funciona en Windows 10 y 11
- [ ] Se crean accesos directos (escritorio + menú)
- [ ] La app arranca post-instalación
- [ ] La desinstalación limpia archivos
- [ ] No hay falsos positivos de antivirus (o se documenta la excepción)

---

## 10. Fase 5 — CI/CD automatizado

**Objetivo:** Que cada tag/release genere automáticamente el `.exe`
instalable y lo suba a GitHub Releases.

**Duración estimada:** 1-2 días  
**Riesgo:** Bajo

### 10.1 Tarea 5.1: Workflow de GitHub Actions

**Archivo a crear:** `.github/workflows/release.yml`

```yaml
name: Build & Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: windows-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.13'

      - name: Install backend dependencies
        run: |
          cd backend
          pip install -r requirements.txt
          pip install -r requirements-build.txt

      - name: Compile backend
        run: |
          cd backend
          python -m nuitka --standalone --output-dir=dist entry.py

      - name: Build frontend
        run: |
          cd frontend
          npm ci
          npm run build

      - name: Setup Electron
        run: |
          cd electron
          npm ci

      - name: Build installer
        run: |
          cd electron
          npx electron-builder --win

      - name: Upload to Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            electron/dist/*.exe
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 10.2 Tarea 5.2: Workflow de PR (validación)

**Archivo a crear:** `.github/workflows/pr-check.yml`

```yaml
name: PR Check

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.13'

      - name: Install & test backend
        run: |
          cd backend
          pip install -r requirements.txt
          python -m pytest tests/ -v

      - name: Install & test frontend
        run: |
          cd frontend
          npm ci
          npx vitest run

      - name: Build frontend
        run: |
          cd frontend
          npm run build
```

### 10.3 Tarea 5.3: Release semántico

Usar `semantic-release` o manual para tags:

```bash
# Para crear un release:
git tag v1.0.0
git push origin v1.0.0
# GitHub Actions genera el .exe automáticamente
```

### 10.4 Verificación de la Fase 5

- [ ] Push de tag `v1.0.0` genera el `.exe` en GitHub Releases
- [ ] El `.exe` es descargable desde la página de Releases
- [ ] Los PRs ejecutan tests automáticamente
- [ ] El workflow no falla con dependencias

---

## 11. Fase 6 — Testing y QA

**Objetivo:** Asegurar que la app de escritorio funcione correctamente
en el entorno real de uso.

**Duración estimada:** 2-3 días  
**Riesgo:** Medio

### 11.1 Tarea 6.1: Tests automatizados

Ya existentes (se ejecutan en CI):
- Backend: 44 tests (pytest)
- Frontend: 27 tests (vitest)
- Paths portables: 4 tests (nuevos)

Nuevos tests para desktop:
- Electron main process: smoke test
- Backend binary: health check
- Migration auto-upgrade: test

### 11.2 Tarea 6.2: Tests manuales (checklist)

**En PC Windows real (no VM):**

| # | Test | Esperado | Pass |
|---|------|----------|------|
| 1 | Instalación desde .exe | Instala sin errores | |
| 2 | Arranque desde icono | Abre en < 3s | |
| 3 | Login con admin/admin | Entra al dashboard | |
| 4 | Crear Pantone 185 C | Se crea, aparece en listado | |
| 5 | Editar Pantone (hex) | Se guarda el cambio | |
| 6 | Crear Fórmula | Se crea con ingredientes | |
| 7 | Crear Diseño (3 colores) | Se crea, colores visibles | |
| 8 | Inventario: ingreso | Stock aumenta | |
| 9 | Inventario: consumo | Stock disminuye | |
| 10 | Alerta bajo umbral | Aparece en dashboard | |
| 11 | Muestra: registrar | Se crea con foto | |
| 12 | Búsqueda Ctrl+K | Encuentra Pantone por código | |
| 13 | Minimizar a tray | Ventana se oculta, tray visible | |
| 14 | Cerrar ventana | Minimiza a tray (no cierra) | |
| 15 | Salir desde tray | Cierra la app completamente | |
| 16 | Reiniciar la app | Los datos persisten | |
| 17 | Desinstalar | Limpia archivos | |

### 11.3 Tarea 6.3: Pruebas de estrés

| Escenario | Test | Objetivo |
|-----------|------|----------|
| 1000 Pantones | Crear 1000 colores seguidos | Sin lag en listado |
| 100 transacciones | Ingresos/consumos rápidos | Stock consistente |
| 50 fotos | Subir 50 fotos de muestras | < 2s por upload |
| Reinicio forzado | Matar el proceso | DB no se corrompe |
| Disco lleno | Llenar disco | Error gracefully |

### 11.4 Tarea 6.4: Compatibilidad

| SO | Estado | Notas |
|----|--------|-------|
| Windows 10 (21H2+) | ✅ Obligatorio | Target principal |
| Windows 11 | ✅ Obligatorio | Debe funcionar |
| Windows 7/8 | ❌ No soportado | Electron 30 no soporta |
| macOS | 🔮 Futuro | No incluido en v1 |
| Linux | 🔮 Futuro | No incluido en v1 |

### 11.5 Verificación de la Fase 6

- [ ] Todos los tests automatizados pasan
- [ ] Checklist manual completo (17/17)
- [ ] Pruebas de estrés pasan
- [ ] Funciona en Windows 10 y 11
- [ ] No hay memory leaks después de 1 hora de uso
- [ ] La DB no se corrompe tras reinicio forzado

---

## 12. Fase 7 — Documentación y entrega

**Objetivo:** Documentar todo para que el usuario final y los
desarrolladores puedan usar y mantener la app.

**Duración estimada:** 1 día  
**Riesgo:** Bajo

### 12.1 Tarea 7.1: README del escritorio

**Archivo a crear:** `DESKTOP_README.md`

```markdown
# TelaryColor — App de Escritorio

## Requisitos
- Windows 10 o 11 (64-bit)
- 4 GB de RAM mínimo
- 500 MB de espacio en disco

## Instalación
1. Descargá `TelaryColor-Setup-X.X.X.exe`
2. Doble clic para instalar
3. Seguí el asistente
4. Listo — la app se abre automáticamente

## Uso
- Doble clic en el icono del escritorio
- Iniciá sesión (admin/admin por defecto)
- Usá la app normalmente

## Actualizaciones
- La app busca actualizaciones automáticamente
- Si hay una nueva versión, te avisa
- Podés actualizar desde Help → Check for Updates

## Solución de problemas
- La app no arranca → reinstalá desde el instalador
- La app va lenta → cerrá otros programas
- La DB se corrompió → restaurá desde un backup automático

## Datos
Tu información está segura en:
- Base de datos: %APPDATA%\TelaryColor\data\app.db
- Backups: %APPDATA%\TelaryColor\data\backups\
- Config: %APPDATA%\TelaryColor\config.yaml
```

### 12.2 Tarea 7.2: CHANGELOG

**Archivo a crear:** `CHANGELOG.md`

```markdown
# Changelog

## [1.0.0] - 2026-XX-XX

### Added
- App de escritorio para Windows
- System tray (minimizar a tray)
- Auto-update desde GitHub Releases
- Backup automático diario
- Configuración opcional (config.yaml)
- Instalador NSIS con desinstalador

### Changed
- Backend empaquetado con Nuitka (sin dependencia de Python)
- Rutas de datos en %APPDATA% (portable)

### Fixed
- Dashboard colores resueltos desde lista pantone
- Scroll to top + focus después de crear Pantone
```

### 12.3 Tarea 7.3: Guía para el área de pintura

**Archivo a crear:** `docs/GUIA_USUARIO.md`

Guía paso a paso en español con:
- Screenshots de cada pantalla
- Cómo crear un Pantone
- Cómo crear una fórmula
- Cómo registrar una muestra
- Cómo usar el inventario
- Cómo buscar colores

### 12.4 Verificación de la Fase 7

- [ ] DESKTOP_README.md existe y es claro
- [ ] CHANGELOG.md documenta todos los cambios
- [ ] GUIA_USUARIO.md tiene screenshots y pasos claros
- [ ] El instalador incluye la documentación

---

## 13. Rendimiento y optimización

### 13.1 Optimizaciones del backend

| Área | Optimización | Impacto |
|------|-------------|---------|
| **Startup** | Cache de migraciones (skip si al día) | -500ms arranque |
| **Startup** | Lazy import de módulos pesados | -200ms arranque |
| **Query** | Índices en columnas de búsqueda | -50ms por query |
| **Query** | WAL mode ya activo | Lecturas concurrentes |
| **Memory** | Connection pooling (pool_size=5) | Memoria controlada |
| **Uploads** | Thumbnails automáticos (200px) | -80% tamaño disco |
| **Logs** | Rotación diaria, max 30 días | Disco controlado |

### 13.2 Optimizaciones del frontend

| Área | Optimización | Impacto |
|------|-------------|---------|
| **Bundle** | Code splitting por ruta | -30% carga inicial |
| **Assets** | Compresión gzip/brotli | -60% transfer |
| **Cache** | Service worker offline | Carga instantánea |
| **Images** | Lazy loading de fotos | -50% memoria |
| **Search** | Debounce 250ms (ya existe) | Sin requests extra |

### 13.3 Optimizaciones de Electron

| Área | Optimización | Impacto |
|------|-------------|---------|
| **Memoria** | `contextIsolation: true` | Seguridad + rendimiento |
| **Memoria** | `nodeIntegration: false` | Seguridad |
| **Render** | `backgroundThickness: '#0f172a'` | Sin flash blanco |
| **GPU** | `--disable-gpu-compositing` (si falla) | Compatibilidad |

### 13.4 Monitoreo de rendimiento

Agregar métricas internas (no visibles al usuario):

```python
# backend/app/core/metrics.py
import time
from functools import wraps

def track_performance(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = await func(*args, *kwargs)
        elapsed = time.perf_counter() - start
        if elapsed > 1.0:  # log slow queries
            print(f'SLOW {func.__name__}: {elapsed:.2f}s')
        return result
    return wrapper
```

---

## 14. Seguridad

### 14.1 Seguridad del ejecutable

| Medida | Implementación | Estado |
|--------|---------------|--------|
| **Credenciales por defecto** | admin/admin con强制 cambio en primer login | P0 |
| **JWT expiry** | Tokens expiran en 24h | ✅ existente |
| **bcrypt** | Passwords hasheados | ✅ existente |
| **SQL injection** | SQLAlchemy ORM (parameterized) | ✅ existente |
| **XSS** | React auto-escapes | ✅ existente |
| **CORS** | Same-origin (no CORS needed) | ✅ existente |
| **Localhost only** | Backend solo escucha 127.0.0.1 | ✅ nuevo |
| **File uploads** | Validación de tipo/tamaño | P0 |
| **Config file** | No passwords en texto plano | P1 |

### 14.2 Seguridad de la distribución

| Medida | Implementación |
|--------|---------------|
| **Firma de código** | Certificado EV o self-signed para uso interno |
| **Checksum** | SHA256 del .exe publicado en Release |
| **Auto-update** | Solo desde GitHub releases (HTTPS) |
| **Escaneo** | Verificar con VirusTotal antes de release |

### 14.3 Datos sensibles

| Dato | Dónde se guarda | Cifrado |
|------|----------------|---------|
| Passwords | SQLite (bcrypt hash) | ✅ hasheado |
| JWT secret | Generado al primer arranque | Persistido en config |
| Fotos de muestras | `%APPDATA%\TelaryColor\data\uploads\` | Sin cifrar (local) |
| Backups | `%APPDATA%\TelaryColor\data\backups\` | Sin cifrar (local) |
| Logs | `%APPDATA%\TelaryColor\logs\` | Sin cifrar (local) |

---

## 15. Backups y recuperación

### 15.1 Backup automático

```python
# backend/app/core/backup.py
import shutil
import schedule
from datetime import datetime
from pathlib import Path

from app.core.paths import app_data_dir, db_path


def create_backup():
    """Create a timestamped backup of the database."""
    backup_dir = app_data_dir() / 'backups'
    backup_dir.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_file = backup_dir / f'telarycolor_{timestamp}.db'

    shutil.copy2(db_path(), backup_file)

    # Cleanup old backups (keep last 30 days)
    cutoff = datetime.now() - timedelta(days=30)
    for f in backup_dir.glob('telarycolor_*.db'):
        if f.stat().st_mtime < cutoff.timestamp():
            f.unlink()

    return backup_file


def schedule_backups(interval_hours=24):
    """Schedule automatic backups."""
    schedule.every(interval_hours).hours.do(create_backup)
```

### 15.2 Restore manual

El usuario puede restaurar desde:
1. `%APPDATA%\TelaryColor\data\backups\` (copiar el .db)
2. O desde la UI (Help → Restore Backup → seleccionar archivo)

### 15.3 Recuperación de corrupción

Si la DB se corrompe:
1. La app detecta el error al arrancar
2. Ofrece restaurar desde el último backup
3. Si no hay backup, crea una DB limpia (loss de datos)

---

## 16. Multi-usuario y concurrencia

### 16.1 Modelo actual

- **Single-user por defecto**: cada PC tiene su propia DB
- **Multi-user opcional**: si se configura un servidor centralizado
- **SQLite WAL**: permite lecturas concurrentes (no escrituras)

### 16.2 Concurrencia en escritura

SQLite solo permite UNA escritura a la vez. Para el uso actual
(área de pintura, 1-3 usuarios en la misma PC) esto es suficiente.

Si se necesita multi-PC:
1. Migrar a PostgreSQL (cambio de `DATABASE_URL`)
2. O usar SQLite con `journal_mode=WAL` + reintentos

### 16.3 Locking strategy

```python
# Evitar errores de "database is locked"
import sqlalchemy as sa

engine = sa.create_engine(
    'sqlite:///app.db',
    connect_args={
        'timeout': 30,  # wait up to 30s for lock
        'journal_mode': 'WAL',
    },
    pool_size=5,
    max_overflow=10,
)
```

---

## 17. Mecanismo de actualización

### 17.1 Auto-update con electron-updater

```javascript
// electron/main.js (agregar)
const { autoUpdater } = require('electron-updater')

function setupAutoUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[update] Checking...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[update] Available:', info.version)
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualización disponible',
      message: `Nueva versión ${info.version} disponible.\nSe descargará automáticamente.`,
    })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualización lista',
      message: 'La actualización está lista. Se instalará al reiniciar.',
      buttons: ['Reiniciar ahora', 'Más tarde'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('[update] Error:', err)
  })

  // Check on startup
  autoUpdater.checkForUpdatesAndNotify()
}
```

### 17.2 Feed de actualizaciones

 electron-builder genera automáticamente un `latest.yml` en GitHub Releases.
 electron-updater lo consulta para saber si hay nueva versión.

### 17.3 Rollback

Si la nueva versión falla:
1. El usuario puede desinstalar y reinstalar la versión anterior
2. O copiar el backup de la DB anterior
3. Los datos no se pierden (están en `%APPDATA%`, no en la instalación)

---

## 18. Monitoreo y logging

### 18.1 Logging en el exe

```python
# backend/app/core/logging.py
import logging
from pathlib import Path
from logging.handlers import RotatingFileHandler

from app.core.paths import app_log_dir


def setup_logging(level='INFO'):
    log_dir = app_log_dir()
    log_file = log_dir / 'telarycolor.log'

    handler = RotatingFileHandler(
        log_file,
        maxBytes=5 * 1024 * 1024,  # 5 MB
        backupCount=5,
    )

    formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.setLevel(getattr(logging, level))
    root.addHandler(handler)
```

### 18.2 Panel de logs (admin only)

Opcional: en `Help → View Logs`, abrir el directorio de logs
en el explorador de Windows.

### 18.3 Métricas de uso (opt-in)

No incluido en v1. Futuro: contar operaciones por día para
entender patrones de uso.

---

## 19. Plan de contingencia

### 19.1 Si Nuitka falla

**Fallback:** PyInstaller (ya preparado en Tarea 1.2)
- Mismo entry script
- Mismo proceso de build
- Solo cambia el comando de compilación

### 19.2 si Electron falla

**Fallback:** Abrir en navegador del sistema
- El exe solo levanta el backend
- Abre `http://localhost:PORT` en el navegador por defecto
- Sin system tray, sin ventana nativa
- Funcional pero menos "app-like"

### 19.3 Si el instalador NSIS falla

**Fallback:** ZIP portable
- `TelaryColor-1.0.0.zip` con el exe y los archivos
- El usuario descomprime y ejecuta directamente
- Sin instalador, sin accesos directos automáticos

### 19.4 Si GitHub Actions falla

**Fallback:** Build manual en PC Windows
- Seguir los pasos de la Fase 1-4 manualmente
- Subir el .exe a GitHub Releases manualmente

---

## 20. Apéndice técnico

### 20.1 Dependencias del backend

```
# backend/requirements.txt (actual)
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
sqlalchemy>=2.0
alembic>=1.14
bcrypt>=4.2
pyjwt>=2.10
pydantic>=2.10
email-validator>=2.2
python-multipart>=0.0.18
```

### 20.2 Dependencias del frontend

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "vitest": "^3.0.0",
    "@testing-library/react": "^16.0.0"
  }
}
```

### 20.3 Dependencias de empaquetado

```
# Python
nuitka>=2.6
pyinstaller>=6.0  # fallback

# Node.js (electron/)
electron>=30.0.0
electron-builder>=24.0.0
electron-updater>=6.0.0
```

### 20.4 Comandos de build

```bash
# Backend
cd backend
pip install -r requirements.txt
python -m nuitka --standalone --output-dir=dist entry.py

# Frontend
cd frontend
npm ci
npm run build

# Electron + Installer
cd electron
npm ci
npx electron-builder --win
# Output: electron/dist/TelaryColor-Setup-X.X.X.exe
```

### 20.5 Estructura final del repo

```
TelaryColor/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py        # modificado: usa paths portables
│   │   │   ├── paths.py         # NUEVO: resolución de rutas
│   │   │   ├── port.py          # NUEVO: puerto dinámico
│   │   │   ├── settings.py      # NUEVO: config YAML
│   │   │   ├── backup.py        # NUEVO: backup automático
│   │   │   └── logging.py       # NUEVO: logging portátil
│   │   ├── modules/             # sin cambios
│   │   └── main.py              # modificado: entry point para exe
│   ├── alembic/                 # sin cambios
│   ├── tests/
│   │   ├── test_paths.py        # NUEVO
│   │   └── ...                  # existentes
│   ├── entry.py                 # NUEVO: entry point del exe
│   ├── requirements.txt         # sin cambios
│   └── dist/                    # NUEVO: binario compilado
├── frontend/
│   ├── src/                     # sin cambios
│   ├── dist/                    # build de producción
│   └── package.json             # sin cambios
├── electron/
│   ├── main.js                  # NUEVO: main process
│   ├── preload.js               # NUEVO: context bridge
│   ├── dev.js                   # NUEVO: dev mode
│   ├── assets/                  # NUEVO: iconos
│   ├── package.json             # NUEVO: config electron-builder
│   └── dist/                    # NUEVO: instalador generado
├── .github/
│   └── workflows/
│       ├── release.yml          # NUEVO: build + release
│       └── pr-check.yml         # NUEVO: PR validation
├── scripts/
│   └── package.sh               # NUEVO: script de empaquetado
├── docs/
│   └── GUIA_USUARIO.md          # NUEVO: guía para el usuario
├── MIGRATION_FASES.md           # ESTE ARCHIVO
├── DESKTOP_README.md            # NUEVO: readme de la app de escritorio
├── CHANGELOG.md                 # NUEVO: changelog
├── DESIGN.md                    # existente
└── README.md                    # existente
```

### 20.6 Cronograma estimado

| Fase | Días | Dependencias |
|------|------|-------------|
| Fase 0 — Preparación | 2-3 | Ninguna |
| Fase 1 — Backend empaquetado | 2-3 | Fase 0 |
| Fase 2 — Integración frontend | 1 | Fase 1 |
| Fase 3 — Electron | 3-4 | Fase 2 |
| Fase 4 — Instalador | 1-2 | Fase 3 |
| Fase 5 — CI/CD | 1-2 | Fase 4 |
| Fase 6 — Testing QA | 2-3 | Fase 5 |
| Fase 7 — Documentación | 1 | Fase 6 |
| **Total** | **13-19 días** | |

### 20.7 Criterios de aceptación final

La migración está completa cuando:

- [ ] El usuario descarga un .exe y lo instala con doble clic
- [ ] La app arranca en < 3 segundos
- [ ] Todas las funcionalidades web funcionan en la app de escritorio
- [ ] Los datos persisten entre reinicios
- [ ] El system tray funciona correctamente
- [ ] Los backups automáticos se crean
- [ ] Las actualizaciones se descargan desde GitHub
- [ ] La app funciona sin conexión a internet
- [ ] La app no consume más de 300 MB de RAM
- [ ] La desinstalación limpia todos los archivos
- [ ] La documentación está completa y clara

### 20.8 Próximos pasos después de v1.0

| Versión | Feature | Prioridad |
|---------|---------|-----------|
| 1.1 | Exportar a Excel | Alta |
| 1.1 | Notificaciones Windows toast | Media |
| 1.2 | Modo multi-usuario (red local) | Media |
| 1.2 | Tema claro/oscuro configurable | Baja |
| 2.0 | App para macOS | Futuro |
| 2.0 | App para Linux | Futuro |
| 2.0 | Sync con servidor centralizado | Futuro |

---

**Fin del documento.**

Este plan maestro cubre cada aspecto de la migración de TelaryColor a
aplicación de escritorio. Cada fase tiene tareas concretas, verificables,
y un criterio de aceptación claro. El documento está diseñado para ser
ejecutado secuencialmente, con cada fase construyendo sobre la anterior.
