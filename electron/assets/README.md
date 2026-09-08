# Electron Assets — Delivered Icons

This directory is the home for Windows icons consumed by Electron and
`electron-builder`. The `build.win.icon` field in `package.json` points
to `assets/icon.ico`.

## Files

| File | Size | Used by | Status |
|------|------|---------|--------|
| `icon.ico` | 48 KB — multi-resolution 16/24/32/48/64/128/256 | Window icon + `electron-builder` NSIS installer | **Delivered** — real user logo (256×256 frame) |
| `tray-icon.png` | 924 B — 32×32 RGBA | System tray on Windows (`src/tray.js`) | **Delivered** — resized from the real 1254×1254 user image |

Both files derive from the user-provided real logo (delivered 2026-09-08).
No PWA source is required; the previously documented
`frontend/public/icon-512.png` source path is stale and no longer used.

## How to regenerate

Regeneration runs once at development time and the resulting binaries are
committed. The scripts require Python 3 with Pillow:

```bash
python3 -c "import PIL"   # requires: pip install pillow
```

### icon.ico — multi-resolution from the 256×256 logo frame

```python
from PIL import Image

base = Image.open('electron/assets/icon.ico').convert('RGBA')  # 256×256 frame
assert base.size == (256, 256)
sizes = [16, 24, 32, 48, 64, 128, 256]
base.save('electron/assets/icon.ico', format='ICO', sizes=[(s, s) for s in sizes])
```

### tray-icon.png — tray size from the 1254×1254 source image

```python
from PIL import Image

tray = Image.open('electron/assets/tray-icon.png').convert('RGBA')
tray = tray.resize((32, 32), Image.LANCZOS)
tray.save('electron/assets/tray-icon.png', format='PNG', optimize=True)
```

## CI note

`electron-builder` will **fail** if `assets/icon.ico` is absent. Both icons
are committed with this repository, so `npm run dist` and the release
workflow (`.github/workflows/release-desktop.yml`) find them without any
generation step.