# 🧵 Across Stitch

A simple, clean, modern, and neutral-looking Pixel Art & Cross Stitch application designed for **PC** and **Android**.

Import any pixel art image, zoom and inspect with pixel-sharp rendering, replace colors (saved separately without mutating the original image), mark stitches as completed with dynamically configurable colors and opacities, and sync projects to a lightweight Bun server.

---

## ✨ Features

- **Pixel-Sharp Canvas Engine**:
  - Smooth pan & zoom from 100% to 6400% with crisp nearest-neighbor rendering (`ctx.imageSmoothingEnabled = false`).
  - Adaptive stitch grid overlay with 5×5 and 10×10 counting guidelines.
  - Interactive HUD showing cursor coordinates `(X, Y)`, current and original color, and stitch status.
  - Multi-touch pinch-to-zoom and two-finger pan for Android / touchscreens.

- **Non-Destructive Color Replacements**:
  - Original image is preserved and never modified.
  - Color replacements are stored separately in the project data.
  - Click any color in the Palette panel to replace it project-wide or revert back to the original color.
  - Isolate / highlight single thread colors to focus on stitching one color at a time.

- **Dynamic Completed Pixels**:
  - Mark or erase completed stitches using click or continuous drag.
  - **Dynamic Styling**: Adjust completion color, opacity (10%–100%), and style (`Translucent Tint`, `Cross Stitch ✕`, `Solid Fill`, `Center Dot`).
  - **Instant Reactivity**: Changing the completion color, opacity, or style immediately updates all marked pixels in real time!
  - **Hide Completed Toggle**: Quickly hide completed markers with one click or keyboard shortcut `H` to admire the clean art underneath.

- **Versatile Export Options**:
  - **Export Edited Image**: Crisp pixel art with your changed colors applied (no stitch marks).
  - **Export Progress Image**: Image with completed stitch indicators.
  - **Export Printable Cross-Stitch Chart**: Grid chart with symbol keys and color legend table.
  - Multi-scale export: 1× (native pixel size), 4×, 8×, 16×, 32× (sharp nearest-neighbor).

- **High-Performance Bun Server & SQLite**:
  - Zero-dependency Bun HTTP server (`Bun.serve`) with built-in SQLite persistence (`bun:sqlite`).
  - REST API for listing, creating, updating, duplicating, and deleting projects.
  - Automatic seed projects (Classic Heart, Health Potion, Ginger Kitty) for instant first-run experience.

- **Cross-Platform Clients (PC & Android)**:
  - **PC Client**: Modern neutral dark/light theme, keyboard shortcuts, floating toolbars.
  - **Android Client**:
    - Responsive mobile web / PWA with touch gestures.
    - Android Studio project (`android/`) with Jetpack Compose edge-to-edge WebView client and server IP address configurator dialog.

---

## 🚀 Getting Started

### 1. Start the Bun Server

```bash
# Start server with Bun
bun run server.ts

# Or in watch mode for development
bun run dev
```

The server will print the available access URLs:
```
🧵 Across Stitch Server active on port 3000
🖥️  PC Web Client:       http://localhost:3000
📱 Android / LAN Client: http://<your-pc-ip>:3000
🤖 Android Emulator:     http://10.0.2.2:3000
```

### 2. Open on PC

Open your browser to:
```
http://localhost:3000
```

### 3. Open on Android

- **Via Mobile Browser**: Connect your Android phone to the same Wi-Fi network and open `http://<your-pc-ip>:3000` (e.g. `http://192.168.1.172:3000`).
- **Via Android Studio App**: Open the `android/` folder in Android Studio and run on an Android Device or Emulator. The app includes a "Server" button in the top bar to set the server address (defaulting to `http://10.0.2.2:3000` for emulator or custom LAN IP).

---

## ⌨️ PC Keyboard Shortcuts

| Key | Action |
|---|---|
| `M` | Stitch / Mark Complete Tool |
| `E` | Erase / Unstitch Tool |
| `P` | Pan / Hand Tool |
| `I` | Eyedropper / Color Picker Tool |
| `H` | Toggle Hide/Show Completed Pixels |
| `G` | Toggle Stitch Grid Lines |
| `F` | Fit Canvas to Screen |
| `+` / `-` | Zoom In / Out |
| `Space` + Drag | Pan Canvas |
| `Ctrl + S` / `Cmd + S` | Save Project to Server |

---

## 📁 Project Structure

```
across_stich/
├── server.ts            # Bun HTTP server & REST API
├── db.ts                # SQLite database using bun:sqlite
├── samples.ts           # Built-in starter pixel art generators
├── public/              # Web application client
│   ├── index.html       # Semantic HTML5 layout
│   ├── styles.css       # Vanilla CSS design system (neutral slate/zinc)
│   ├── app.js           # Interactive canvas engine & state management
│   ├── manifest.json    # Android PWA manifest
│   └── icon.svg         # Cross-stitch app icon
├── data/
│   └── projects.db      # SQLite database file (auto-created)
└── android/             # Android Studio Jetpack Compose project
    └── app/src/main/
        ├── AndroidManifest.xml
        └── java/com/redystum/acrossstich/MainActivity.kt
```
