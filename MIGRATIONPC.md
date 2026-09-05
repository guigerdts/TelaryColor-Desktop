# Migración de TelaryColor a aplicación de PC (Windows)

**Documento de decisión** — Planes y opciones para convertir el gestor de
fórmulas de color (hoy web/PWA) en una aplicación de escritorio instalable.

---

## 1. Contexto del problema

### Situación actual

TelaryColors es una app web de dos piezas:

| Pieza | Stack | Rol |
|-------|-------|-----|
| **Backend** | FastAPI + SQLite + Alembic + bcrypt + JWT | API `/api/v1`, gestiona pantones, fórmulas, inventario, usuarios, uploads |
| **Frontend** | React 19 + Vite + Tailwind 4 (PWA) | Interfaz, búsqueda instantánea de Pantone, single-origin con el backend |

Actualmente para usarla en producción se necesita **un servidor** (VPS, Vercel,
una máquina con Python + Node, etc.) que levante el backend y sirva el frontend
buildado.

### El problema concreto

- **No hay dónde desplegar.** No se dispone de un servidor/VPS/cloud disponible
  para correr el backend de forma permanente.
- Se quiere que la app **se instale directamente en una PC (Windows)** como un
  programa normal.
- Que **todo viaje dentro del ejecutable**: backend + frontend + base de datos
  local + uploads de muestras. Sin servidor externo, sin internet, sin "estar
  desplegado en ningún lado".

### Conclusión: no es un problema de diseño, es un problema de empaquetado

El stack actual ya sirve el frontend desde el propio FastAPI (single-origin,
sin CORS, ADR-2). Por lo tanto **no se necesita reescribir nada de la lógica**.
La migración es: empaquetar el backend Python en un binario, adjuntar el
frontend buildado, y ofrecer una ventana nativa para abrirla como app de PC.

---

## 2. Decisión clave: ¿qué pasa con el backend?

Esta es la decisión que condiciona TODO el resto. Hay 3 arquitecturas posibles.

### Opción Backend A — Backend empaquetado con PyInstaller (recomendada)

El backend FastAPI se convierte en un ejecutable propio con **PyInstaller**.

- Cada PC corre su **propio uvicorn local** en `localhost:8000`.
- La base SQLite y los uploads viven en la carpeta de datos local del usuario
  (p. ej. `%APPDATA%\TelaryColor\`).
- Alembic migraciones ya empaquetadas se aplican al primer arranque.

**Ventajas:**
- Cero cambios en el código del backend. Tu `main.py`, routers, modelos, seed
  y migraciones se empaquetan tal cual.
- Cada máquina es independiente: datos locales, sin red.
- Es el patrón estándar para apps Python de escritorio locales-first.

**Desventajas:**
- El binario pesa bastante (100–400 MB) porque incluye el runtime de Python
  completo más dependencias (SQLAlchemy, alembic, JWT, bcrypt...).
- PyInstaller **no hace cross-compile**: el `.exe` se builda en Windows.

**Candidata principal.** Resuelve exactamente el problema ("no tengo dónde
desplegar el backend").

---

### Opción Backend B — Backend portable como sidecar (Tauri)

Similar a la A pero el binario Python se empaqueta como "sidecar" dentro de una
app Tauri.

**Ventajas:**
- Se puede incrustar dentro del ejecutable de Tauri (10–20 MB de app + binario
  de Python).
- La ventana nativa es liviana (vs. Electron).

**Desventajas:**
- Requiere instalar y aprender Rust.
- Build más complejo (dos toolchains: Rust + PyInstaller).
- Para una app interna de área de pintura, es sobre-ingeniería al inicio.

**Buena opción más adelante**, no para la primera versión.

---

### Opción Backend C — Backend OLVIDADO / solo frontend

Se descarta el backend local y el frontend habla con... nada. Solo tiene sentido
si la app fuera puramente de lectura con datos estáticos embebidos. **No aplica**
a TelaryColors, porque necesita login, persistencia e inventario reales.

**Descartada.**

---

### Tabla comparativa de backends

| Criterio | A · PyInstaller | B · Tauri sidecar | C · sin backend |
|----------|-----------------|-------------------|------------------|
| Cambios en backend | Ninguno | Ninguno | Descarta todo |
| Aprendizaje nuevo | Bajo | Medio-alto (Rust) | — |
| Tamaño ejecutable | 100–400 MB | ~20 MB | chico |
| Independencia de red | Total (local) | Total (local) | — |
| Esfuerzo primera versión | Bajo | Medio | — |
| Complejidad build | Baja | Media | — |

---

## 3. Decisión clave: ¿cómo se muestra la app?

El backend empaquetado sirve la web en `localhost:8000`. La pregunta es **cómo
abre esa página el usuario**.

### Opción Shell A — Abrir en el navegador del sistema (más simple)

El ejecutable hace 3 cosas:
1. Levanta uvicorn local en `localhost:8000`.
2. Abre el navegador por defecto (Edge/Chrome) en `http://localhost:8000`.
3. Espera a que el usuario cierre (tray icon) y apaga el backend.

**Ventajas:**
- **Cero frameworks nuevos.** Solo PyInstaller + un entry script.
- Mínimo esfuerzo; se puede tener la primera versión en menos de una hora.
- Tu PWA (manifest + iconos) ya existe: el usuario puede incluso "Agregar a
  pantalla de inicio".

**Desventajas:**
- No hay "ventana de app": se abre en una pestaña del navegador con la URL en
  la barra. Menos sensación de programa instalado.
- Si el usuario cierra el navegador, la app puede seguir corriendo en el tray.

**Ruta más rápida hacia un instalable .exe.**

---

### Opción Shell B — Ventana nativa con Electron

Un proceso Electron que, al abrirse, levanta el backend y carga la web en una
ventana propia (sin barra de URL, con tu icono y título).

**Ventajas:**
- Sensación completa de programa de escritorio.
- Control sobre tamaño de ventana, icono, siempre-al-frente, tray.
- El único framework nuevo es Electron (JS, ya conocés React → familiar).

**Desventajas:**
- El paquete del instalador crece (~100–200 MB extra por Electron).
- Más piezas que orquestar: Electron debe arrancar y apagar el backend Python
  empaquetado.
- Algo más de trabajo de setup/scripts.

**La vía "feeling nativo" con esfuerzo moderado.**

---

### Opción Shell C — Ventana nativa con Tauri

Igual que Electron pero con Rust de base.

**Ventajas:**
- Binario chico y rápido.
- Moderno, y encaja si más adelante se va con Backend B (cache de Rust).

**Desventajas:**
- Requiere instalar Rust (toolchain nueva).
- Build más complejo.
- Para la primera versión, añade fricción sin beneficio inmediato.

**Buena opción como evolución futura.**

---

### Tabla comparativa de shells

| Criterio | A · Navegador | B · Electron | C · Tauri |
|----------|--------------|--------------|-----------|
| Esfuerzo setup | Mínimo | Medio | Medio-alto |
| Sensación nativa | Baja | Alta | Alta |
| Tamaño extra | 0 | ~150 MB | ~10 MB |
| Nuevo lenguaje | ninguno | JS/TS | Rust |
| Instalable .exe | Sí | Sí (NSIS/Squirrel) | Sí (WiX) |

---

## 4. Cómo se arma el instalador

El objetivo final es: el usuario descarga un instalador de Windows, lo corre,
y la app queda instalada. Dos caminos:

| Camino | Qué genera | Herramienta | Complejidad |
|--------|------------|-------------|-------------|
| **a)** Manualmente en la máquina Windows | carpeta/distribución | `pyinstaller` + `npm run build` + zip o Inno Setup | Baja |
| **b)** Automático vía GitHub Actions (recomendado) | `.exe` instalable por release | workflow con runner `windows-latest` que buildea y sube un Release | Media |

**Camino a) — manual (para validar):**
1. En una PC Windows: clonar repo.
2. `cd backend && pip install -r requirements.txt pyinstaller && pyinstaller ...`
3. `cd frontend && npm install && npm run build` (genera `dist/`).
4. Empaquetar binario backend + `dist/` + scripts en un instalador (Inno Setup
   o simplemente un `.zip` portable).

**Camino b) — GitHub Actions (para producción):**
- Un workflow que corre en `windows-latest`, buildea el frontend y el backend
  con Nuitka (PyInstaller como fallback), arma el instalador, y lo anexa a un
  **GitHub Release**.
- Cada `git tag vX.Y.Z` → release automático con el `.exe` listo para bajar.
- **Sin necesidad de tocar una máquina Windows manualmente.**

**Recomendación:** usar el camino **a)** para validar la primera vez en la PC, y
luego automatizar con el **b)**.

---

## 5. Ruta recomendada (plan por fases)

### Fase 0 — Preparación (sin cambios de código)
- Crear el entry script Python que levanta uvicorn y maneja señales
  (arranque/apagado), usando rutas relativas al ejecutable.
- Resolver que la ruta a SQLite/uploads sea **portable** (relativa al ejecutable
  o a `%APPDATA%`), no fija de desarrollo.
- Verificar migraciones Alembic aplicables al primer arranque.

### Fase 1 — MVP: Caminso A/A (PyInstaller + navegador) — el más rápido
- Empaquetar el backend con PyInstaller (`--onedir`).
- Adjuntar el `frontend/dist` buildado (o embeberlo dentro del binario).
- Probar: doble click → backend corre → se abre el navegador local.
- Empacar como `.zip` portable o instalador Inno.

**Resultado:** un `.exe` que resuelve el problema de fondo ("no tengo dónde
desplegar"), con mínimo esfuerzo.

### Fase 2 — Ventana nativa (opcional, para el feeling de app de PC)
- Si el Navegador no convence: añadir **Electron** (Opción Shell B) que levanta
  el backend y abre ventana propia.
- Alternativa futura: Tauri para binario chico (Backend B + Shell C).

### Fase 3 — Entrega automática
- Workflow GitHub Actions `windows-latest` que buildea y sube el `.exe` a cada
  Release/tag.
- Documentar instalación en la PC del área de pintura.

---

## 6. Cosas a tener en cuenta (respetando el stack actual)

- **No se rompe el desarrollo.** El flujo actual (`python -m uvicorn` + `npm run
  dev`) debe seguir funcionando. El empaquetado es una capa adicional, no un
  reemplazo.
- **El lección de migraciones aplica igual:** en el empaquetado, aplicar
  `alembic upgrade head` antes de servir es OBLIGATORIO, igual que en cualquier
  deploy (ver nota del README).
- **Rutas de datos:** el binario debe apuntar a una carpeta de datos local
  (p. ej. `%APPDATA%\TelaryColor\`) y no a rutas hardcodeadas de desarrollo.
  Revisar cómo el código resuelve `data/`, config y uploads (probablemente ya
  hay algo en `app.core.config`).
- **Puerto:** reservar un puerto local (8000 o uno menos colisionable p. ej.
  8765) y detectar si ya está en uso.
- **PWA:** si bien la PWA sirve para la "instalación en pantalla de inicio",
  el objetivo de esta migración es la app de escritorio autocontenida; la PWA
  queda como complemento web.
- **Anti-malware de Windows:** los `.exe` de PyInstaller a veces dan falsos
  positivos en SmartScreen/Antivirus. Mitigación: código signado (firma de
  código) o documentar la excepción al instalarlo en la red interna.

---

## 7. Matriz de decisión final (esto es lo que hay que elegir)

| # | Pregunta | Opciones | Recomendación |
|---|----------|----------|---------------|
| 1 | **¿Cómo viaja el backend?** | A) PyInstaller · B) Tauri sidecar · C) sin backend | **A) PyInstaller** |
| 2 | **¿Cómo se muestra la app?** | A) Navegador del sistema · B) Electron · C) Tauri | **A) Navegador primero; B) si se quiere feeling nativo** |
| 3 | **¿Cómo se buildea el instalador?** | a) Manual en Windows · b) GitHub Actions | **a) manual para validar → b) automático** |
| 4 | **¿Ruta de datos local?** | Definir con el código actual | `%APPDATA%\TelaryColor\` |

### Combinaciones posibles

- **A + A + a** → `.exe` que abre el navegador. **El MVP recomendado.**
- **A + B + b** → instalador Electron con ventana nativa, build automático por
  release. **La "versión final" si se quiere feeling nativo.**
- **B + C + b** → la ruta "liviana" con Tauri (para más adelante).

---

## 8. Próximo paso

1. Confirmar las decisiones de la tabla (sobre todo la 1 y la 2).
2. Aplicar la **Fase 0** (entry script + rutas portables), sin tocar la
   arquitectura actual.
3. Correr la Fase 1 para tener el primer `.exe` que resuelve el problema de
   fondo.
4. (Opcional) Fase 2 y 3 para ventana nativa y entrega automática.