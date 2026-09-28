/**
 * Across Stitch — Detached Window Client
 * Ultra-minimalist, high-performance, Always-On-Top floating view.
 */

const state = {
  project: null,
  pixelMatrix: [],
  completedSet: new Set(),
  completeStyle: {
    color: '#10b981',
    opacity: 0.7,
    mode: 'tint',
    hideCompleted: false,
  },
  backgroundColor: '#ffffff',
  activeTool: 'stitch',
  filterColor: null,
  showGrid: true,

  // Interactive Viewport
  zoom: 16,
  minZoom: 1,
  maxZoom: 64,
  panX: 0,
  panY: 0,
  isPanning: false,
  isDrawing: false,
  lastMouseX: 0,
  lastMouseY: 0,
  lastMarkedPixel: null,

  // Window properties
  opacityIndex: 0,
  opacityLevels: [1.0, 0.85, 0.65],
  barsHidden: false,
};

const dom = {};

window.addEventListener('DOMContentLoaded', () => {
  cacheDOM();
  setupCanvas();
  setupEvents();

  // Listen for state synchronization from main window via Electron
  if (window.electronAPI) {
    window.electronAPI.onStateUpdate((updatedState) => {
      applyStateFromMain(updatedState);
    });
  }

  // Also support window.opener message passing (for browser Document PiP or popup fallback)
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'SYNC_STATE') {
      applyStateFromMain(e.data.payload);
    }
  });

  // Notify opener / main process that detached view is ready
  if (window.opener) {
    window.opener.postMessage({ type: 'DETACHED_READY' }, '*');
  }
});

function cacheDOM() {
  dom.container = document.getElementById('detached-container');
  dom.projectTitle = document.getElementById('detached-project-title');
  dom.toolPill = document.getElementById('detached-tool-pill');
  dom.toolDot = document.getElementById('detached-tool-dot');
  dom.toolLabel = document.getElementById('detached-tool-label');

  dom.btnToggleBars = document.getElementById('btn-toggle-bars');
  dom.btnShowBars = document.getElementById('btn-show-bars');
  dom.btnOpacity = document.getElementById('btn-opacity');
  dom.opacityText = document.getElementById('opacity-text');
  dom.btnGrid = document.getElementById('btn-grid');
  dom.btnFit = document.getElementById('btn-fit');
  dom.btnMin = document.getElementById('btn-min');
  dom.btnClose = document.getElementById('btn-close');

  dom.viewport = document.getElementById('viewport');
  dom.canvas = document.getElementById('detached-canvas');
  dom.ctx = dom.canvas.getContext('2d');

  dom.statProgress = document.getElementById('stat-progress');
  dom.statCounts = document.getElementById('stat-counts');
  dom.statCoords = document.getElementById('stat-coords');
}

function setupCanvas() {
  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    renderCanvas();
  });
}

function resizeCanvas() {
  const rect = dom.viewport.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  dom.canvas.width = rect.width * dpr;
  dom.canvas.height = rect.height * dpr;
  dom.ctx.scale(dpr, dpr);
}

function toggleBarsVisibility() {
  state.barsHidden = !state.barsHidden;
  const container = dom.container || document.getElementById('detached-container') || document.querySelector('.detached-container');
  if (container) {
    container.classList.toggle('bars-hidden', state.barsHidden);
  }
  resizeCanvas();
  renderCanvas();
  requestAnimationFrame(() => {
    resizeCanvas();
    renderCanvas();
  });
  setTimeout(() => {
    resizeCanvas();
    renderCanvas();
  }, 30);
}

function setupEvents() {
  // Hide / Show Header & Bottom Bar
  if (dom.btnToggleBars) {
    dom.btnToggleBars.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBarsVisibility();
    });
  }
  if (dom.btnShowBars) {
    const handleRestoreBars = (e) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      toggleBarsVisibility();
    };
    dom.btnShowBars.addEventListener('pointerdown', (e) => e.stopPropagation());
    dom.btnShowBars.addEventListener('mousedown', (e) => e.stopPropagation());
    dom.btnShowBars.addEventListener('click', handleRestoreBars);
  }

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      toggleBarsVisibility();
    } else if (e.key === 'f' || e.key === 'F') {
      fitToScreen();
    } else if (e.key === 'g' || e.key === 'G') {
      state.showGrid = !state.showGrid;
      dom.btnGrid?.classList.toggle('active', state.showGrid);
      renderCanvas();
    }
  });

  // Opacity Cycling
  if (dom.btnOpacity) {
    dom.btnOpacity.addEventListener('click', async () => {
      state.opacityIndex = (state.opacityIndex + 1) % state.opacityLevels.length;
      const op = state.opacityLevels[state.opacityIndex];
      const pct = Math.round(op * 100);
      dom.opacityText.textContent = `${pct}%`;
      if (window.electronAPI) {
        await window.electronAPI.setWindowOpacity(op);
      }
    });
  }

  // Grid Lines Toggle
  if (dom.btnGrid) {
    dom.btnGrid.addEventListener('click', () => {
      state.showGrid = !state.showGrid;
      dom.btnGrid.classList.toggle('active', state.showGrid);
      renderCanvas();
    });
  }

  // Fit to screen
  if (dom.btnFit) {
    dom.btnFit.addEventListener('click', fitToScreen);
  }

  // Minimize Window
  if (dom.btnMin) {
    dom.btnMin.addEventListener('click', () => {
      if (window.electronAPI) {
        window.electronAPI.minimizeWindow();
      }
    });
  }

  // Close Window
  if (dom.btnClose) {
    dom.btnClose.addEventListener('click', () => {
      if (window.electronAPI) {
        window.electronAPI.closeWindow();
      } else {
        window.close();
      }
    });
  }

  // Canvas Interactions: Pan, Zoom, Drag-to-stitch, Right-click Pan
  bindCanvasInteractions();
}

function applyStateFromMain(data) {
  if (!data) return;

  const previousImg = state.project?.originalImage;
  const isNewProject = !state.project || state.project.id !== data.id || previousImg !== data.originalImage;

  state.project = {
    id: data.id,
    name: data.name,
    width: data.width,
    height: data.height,
    originalImage: data.originalImage,
    changedColors: data.changedColors || {},
  };

  state.completedSet = new Set(data.completedPixels || []);
  state.completeStyle = data.completeStyle || {
    color: '#10b981',
    opacity: 0.7,
    mode: 'tint',
    hideCompleted: false,
  };
  state.backgroundColor = data.backgroundColor || '#ffffff';
  state.activeTool = data.activeTool || 'stitch';
  state.filterColor = data.filterColor || null;

  // Update Header UI
  if (dom.projectTitle) dom.projectTitle.textContent = state.project.name || 'Untitled';
  if (dom.toolLabel) dom.toolLabel.textContent = capitalize(state.activeTool);
  if (dom.toolDot) dom.toolDot.style.backgroundColor = state.completeStyle.color || '#10b981';

  updateStatsUI();

  // If new project, extract pixels and fit to window
  if (isNewProject && state.project.originalImage) {
    extractPixelMatrix(state.project.originalImage, state.project.width, state.project.height, () => {
      fitToScreen();
      renderCanvas();
    });
  } else {
    renderCanvas();
  }
}

function updateStatsUI() {
  if (!state.project) return;
  const total = state.project.width * state.project.height;
  const done = state.completedSet.size;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  if (dom.statProgress) dom.statProgress.textContent = `${pct}%`;
  if (dom.statCounts) dom.statCounts.textContent = `${done} / ${total}`;
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Canvas Rendering Engine
 */
function renderCanvas() {
  if (!state.project || state.pixelMatrix.length === 0) return;

  const rect = dom.viewport.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const ctx = dom.ctx;

  // Clear
  ctx.save();
  ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // Apply pan and zoom
  ctx.translate(width / 2 + state.panX, height / 2 + state.panY);
  ctx.scale(state.zoom, state.zoom);

  const imgW = state.project.width;
  const imgH = state.project.height;
  const startX = -imgW / 2;
  const startY = -imgH / 2;

  // 1. Draw Fabric / Background
  const bg = state.backgroundColor || '#ffffff';
  if (bg === 'transparent') {
    drawCheckerboard(ctx, startX, startY, imgW, imgH);
  } else {
    ctx.fillStyle = bg;
    ctx.fillRect(startX, startY, imgW, imgH);
  }

  // 2. Draw Pixels
  const changedColors = state.project.changedColors || {};
  const isFiltering = !!state.filterColor;
  const targetFilterColor = state.filterColor ? state.filterColor.toLowerCase() : null;

  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const origHex = state.pixelMatrix[y]?.[x];
      if (!origHex) continue; // transparent pixel

      const effectiveHex = changedColors[origHex] || origHex;
      const pixelX = startX + x;
      const pixelY = startY + y;

      const matchesFilter = !isFiltering || origHex.toLowerCase() === targetFilterColor;
      ctx.fillStyle = effectiveHex;
      ctx.globalAlpha = matchesFilter ? 1.0 : 0.18;
      ctx.fillRect(pixelX, pixelY, 1, 1);
    }
  }

  // 3. Draw Completed Pixel Marks
  if (!state.completeStyle.hideCompleted && state.completedSet.size > 0) {
    const compColor = state.completeStyle.color || '#10b981';
    const compOpacity = state.completeStyle.opacity !== undefined ? state.completeStyle.opacity : 0.7;
    const mode = state.completeStyle.mode || 'tint';

    for (const key of state.completedSet) {
      const parts = key.split(',');
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      const origHex = state.pixelMatrix[y]?.[x];
      if (!origHex) continue;

      const pixelX = startX + x;
      const pixelY = startY + y;

      ctx.save();
      ctx.globalAlpha = compOpacity;

      if (mode === 'tint' || mode === 'solid') {
        ctx.fillStyle = compColor;
        ctx.fillRect(pixelX, pixelY, 1, 1);
      } else if (mode === 'cross') {
        ctx.strokeStyle = compColor;
        ctx.lineWidth = 0.16;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pixelX + 0.18, pixelY + 0.18);
        ctx.lineTo(pixelX + 0.82, pixelY + 0.82);
        ctx.moveTo(pixelX + 0.82, pixelY + 0.18);
        ctx.lineTo(pixelX + 0.18, pixelY + 0.82);
        ctx.stroke();
      } else if (mode === 'dot') {
        ctx.fillStyle = compColor;
        ctx.beginPath();
        ctx.arc(pixelX + 0.5, pixelY + 0.5, 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // 4. Grid Lines
  if (state.showGrid && state.zoom >= 4) {
    ctx.lineWidth = 1 / state.zoom;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    for (let x = 0; x <= imgW; x++) {
      ctx.moveTo(startX + x, startY);
      ctx.lineTo(startX + x, startY + imgH);
    }
    for (let y = 0; y <= imgH; y++) {
      ctx.moveTo(startX, startY + y);
      ctx.lineTo(startX + imgW, startY + y);
    }
    ctx.stroke();

    // Bold 10x10 cross-stitch grid lines
    ctx.lineWidth = 2 / state.zoom;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.beginPath();
    for (let x = 0; x <= imgW; x += 10) {
      ctx.moveTo(startX + x, startY);
      ctx.lineTo(startX + x, startY + imgH);
    }
    for (let y = 0; y <= imgH; y += 10) {
      ctx.moveTo(startX, startY + y);
      ctx.lineTo(startX + imgW, startY + y);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function drawCheckerboard(ctx, startX, startY, w, h) {
  ctx.save();
  ctx.fillStyle = '#18181b';
  ctx.fillRect(startX, startY, w, h);
  ctx.fillStyle = '#27272a';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x + y) % 2 === 0) {
        ctx.fillRect(startX + x, startY + y, 1, 1);
      }
    }
  }
  ctx.restore();
}

function fitToScreen() {
  if (!state.project) return;
  const rect = dom.viewport.getBoundingClientRect();
  const padding = 28;
  const availW = Math.max(50, rect.width - padding * 2);
  const availH = Math.max(50, rect.height - padding * 2);

  const scaleX = availW / state.project.width;
  const scaleY = availH / state.project.height;
  state.zoom = Math.max(state.minZoom, Math.min(state.maxZoom, Math.min(scaleX, scaleY)));
  state.panX = 0;
  state.panY = 0;
  renderCanvas();
}

function screenToPixel(screenX, screenY) {
  if (!state.project) return null;
  const rect = dom.viewport.getBoundingClientRect();
  const canvasX = screenX - rect.left;
  const canvasY = screenY - rect.top;

  const worldX = (canvasX - (rect.width / 2 + state.panX)) / state.zoom;
  const worldY = (canvasY - (rect.height / 2 + state.panY)) / state.zoom;

  const pixelX = Math.floor(worldX + state.project.width / 2);
  const pixelY = Math.floor(worldY + state.project.height / 2);

  if (pixelX >= 0 && pixelX < state.project.width && pixelY >= 0 && pixelY < state.project.height) {
    return { x: pixelX, y: pixelY };
  }
  return null;
}

function bindCanvasInteractions() {
  const vp = dom.viewport;

  // Prevent default context menu on right click so right-click drag pans smoothly
  vp.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  vp.addEventListener('pointerdown', (e) => {
    // If clicking on floating restore button or its descendants, ignore
    if (e.target.closest('#btn-show-bars') || e.target.closest('.floating-show-bars-btn')) {
      return;
    }

    // Right click (button === 2), Middle click (button === 1), or Pan Tool = Pan
    if (e.button === 2 || e.button === 1 || state.activeTool === 'pan') {
      state.isPanning = true;
      state.isDrawing = false;
      state.lastMouseX = e.clientX;
      state.lastMouseY = e.clientY;
      vp.style.cursor = 'grabbing';
      try {
        vp.setPointerCapture(e.pointerId);
      } catch (_) {}
      return;
    }

    // Left click = Stitch or Erase with drag support!
    if (e.button === 0) {
      const pixel = screenToPixel(e.clientX, e.clientY);
      if (pixel) {
        state.isDrawing = true;
        state.isPanning = false;
        state.lastMarkedPixel = pixel;
        applyStitchActionAt(pixel.x, pixel.y);
        try {
          vp.setPointerCapture(e.pointerId);
        } catch (_) {}
      } else {
        // If clicked outside art, pan
        state.isPanning = true;
        state.isDrawing = false;
        state.lastMouseX = e.clientX;
        state.lastMouseY = e.clientY;
        vp.style.cursor = 'grabbing';
        try {
          vp.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
    }
  });

  window.addEventListener('pointermove', (e) => {
    // Panning (with right-click or middle-click or pan tool)
    if (state.isPanning) {
      state.panX += e.clientX - state.lastMouseX;
      state.panY += e.clientY - state.lastMouseY;
      state.lastMouseX = e.clientX;
      state.lastMouseY = e.clientY;
      renderCanvas();
      return;
    }

    const pixel = screenToPixel(e.clientX, e.clientY);
    if (pixel) {
      if (dom.statCoords) dom.statCoords.textContent = `${pixel.x}, ${pixel.y}`;

      // Drag-to-stitch: when dragging cursor while holding left click, mark pixels along the stroke!
      if (state.isDrawing) {
        if (!state.lastMarkedPixel || state.lastMarkedPixel.x !== pixel.x || state.lastMarkedPixel.y !== pixel.y) {
          applyStitchActionAt(pixel.x, pixel.y);
          state.lastMarkedPixel = pixel;
        }
      }
    } else {
      if (dom.statCoords) dom.statCoords.textContent = '--:--';
    }
  });

  const stopInteractions = (e) => {
    if (e && e.pointerId) {
      try {
        vp.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
    state.isPanning = false;
    state.isDrawing = false;
    state.lastMarkedPixel = null;
    vp.style.cursor = state.activeTool === 'pan' ? 'grab' : 'crosshair';
  };

  window.addEventListener('pointerup', stopInteractions);
  window.addEventListener('pointercancel', stopInteractions);

  // Zoom with Wheel
  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.2 : 0.833;
    adjustZoom(factor, e.clientX, e.clientY);
  }, { passive: false });
}

function adjustZoom(factor, clientX, clientY) {
  const newZoom = Math.max(state.minZoom, Math.min(state.maxZoom, state.zoom * factor));
  if (newZoom === state.zoom) return;

  const rect = dom.viewport.getBoundingClientRect();
  const mouseX = clientX !== undefined ? clientX - rect.left : rect.width / 2;
  const mouseY = clientY !== undefined ? clientY - rect.top : rect.height / 2;

  const worldX = (mouseX - (rect.width / 2 + state.panX)) / state.zoom;
  const worldY = (mouseY - (rect.height / 2 + state.panY)) / state.zoom;

  state.zoom = newZoom;
  state.panX = mouseX - (rect.width / 2 + worldX * state.zoom);
  state.panY = mouseY - (rect.height / 2 + worldY * state.zoom);

  renderCanvas();
}

/**
 * Marks or erases a stitch at (x, y) following main page selections
 */
function applyStitchActionAt(x, y) {
  if (!state.project || !state.pixelMatrix.length) return;

  const origHex = state.pixelMatrix[y]?.[x];
  if (!origHex) return; // ignore transparent pixels

  // If a color filter is active on the main page, only allow stitching matching pixels!
  if (state.filterColor && origHex.toLowerCase() !== state.filterColor.toLowerCase()) {
    return;
  }

  const key = `${x},${y}`;
  const shouldComplete = state.activeTool !== 'erase';

  if (shouldComplete) {
    if (state.completedSet.has(key)) return; // already done
    state.completedSet.add(key);
  } else {
    if (!state.completedSet.has(key)) return; // already not done
    state.completedSet.delete(key);
  }

  // Update UI and re-render immediately for responsive feel
  updateStatsUI();
  renderCanvas();

  // Send action to main window to update stats, palette counters, and auto-save to Raspberry Pi!
  const action = {
    type: 'toggle_pixel',
    x,
    y,
    key,
    completed: shouldComplete,
  };

  if (window.electronAPI) {
    window.electronAPI.sendActionToMain(action);
  } else if (window.opener) {
    window.opener.postMessage({ type: 'DETACHED_ACTION', action }, '*');
  }
}

/**
 * Extracts 2D RGB Hex pixel matrix from the original image URL
 */
function extractPixelMatrix(dataUrl, width, height, callback) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0, width, height);

    const imgData = tempCtx.getImageData(0, 0, width, height).data;
    const matrix = [];

    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];
        const a = imgData[idx + 3];

        if (a < 20) {
          row.push(null);
        } else {
          row.push(rgbToHex(r, g, b));
        }
      }
      matrix.push(row);
    }

    state.pixelMatrix = matrix;
    if (callback) callback();
  };
  img.src = dataUrl;
}

function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
