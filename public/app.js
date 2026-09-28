/**
 * Across Stitch — Web Application Client
 * Modern, neutral, high-performance pixel art & cross-stitch companion.
 */

// ============================================================================
// State Management
// ============================================================================

const state = {
  currentProject: null, // ProjectDTO
  pixelMatrix: [], // 2D array of original hex colors [y][x]
  palette: [], // Array of { originalHex, currentHex, count, completedCount, isModified }
  
  // Interactive Viewport
  zoom: 16, // scale factor (e.g. 16x = 1600%)
  minZoom: 1,
  maxZoom: 64,
  panX: 0,
  panY: 0,
  isPanning: false,
  isDrawing: false,
  lastMouseX: 0,
  lastMouseY: 0,
  spacePressed: false,

  // Touch Support
  touchStartDist: 0,
  touchStartZoom: 16,
  touchStartPanX: 0,
  touchStartPanY: 0,
  touchStartMidX: 0,
  touchStartMidY: 0,
  isMultiTouch: false,

  // Tool & Filter
  activeTool: (typeof window !== 'undefined' && (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches))) ? 'pan' : 'stitch', // 'stitch' on PC, 'pan' on touch
  showGrid: true,
  filterColor: null, // when set, isolate only pixels of this originalHex
  hoverPixel: null, // { x, y }

  // Sync & Status
  unsavedChanges: false,
  autoSaveTimer: null,
  serverOnline: true,
  networkInfo: null,

  // Import temporary state
  importData: null, // { name, width, height, dataUrl, imgElement }
  importBgColor: '#ffffff',
  
  // Export modal state
  exportType: 'edited', // 'edited' | 'completed' | 'pattern'
  exportScale: 16,
  exportIncludeGrid: false,
  
  // Color replace dialog state
  activeReplaceOriginalHex: null,

  // Detached Window State
  pipWindow: null,
  popupWindow: null,
  isDetached: false,
};

// ============================================================================
// Server Connection & API Client (Raspberry Pi & LAN support)
// ============================================================================

function getApiBaseUrl() {
  const custom = localStorage.getItem('across_stitch_server_url');
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }
  return '';
}

function setApiBaseUrl(url) {
  if (url && url.trim()) {
    localStorage.setItem('across_stitch_server_url', url.trim().replace(/\/+$/, ''));
  } else {
    localStorage.removeItem('across_stitch_server_url');
  }
}

async function apiFetch(path, options = {}) {
  const base = getApiBaseUrl();
  const url = base ? `${base}${path.startsWith('/') ? path : '/' + path}` : path;
  return fetch(url, options);
}

// DOM Element References Cache
const dom = {};

// ============================================================================
// Initialization
// ============================================================================

window.addEventListener('DOMContentLoaded', async () => {
  cacheDOMElements();
  initTheme();
  setupEventListeners();
  switchTool(state.activeTool);
  setupCanvas();
  await fetchNetworkInfo();
  await loadInitialProject();
});

function cacheDOMElements() {
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isMobile = isAndroid || /iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window && !window.electronAPI);
  if (isAndroid) document.body.classList.add('is-android');
  if (isMobile) document.body.classList.add('is-mobile');

  dom.app = document.getElementById('app');
  dom.projectNameInput = document.getElementById('project-name-input');
  dom.saveStatusBadge = document.getElementById('save-status-badge');
  dom.btnSave = document.getElementById('btn-save');
  dom.btnProjects = document.getElementById('btn-projects');
  dom.btnNewProject = document.getElementById('btn-new-project');
  dom.btnExport = document.getElementById('btn-export');
  dom.btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  dom.btnThemeToggle = document.getElementById('btn-theme-toggle');
  
  dom.headerProgressBar = document.getElementById('header-progress-bar');
  dom.headerProgressText = document.getElementById('header-progress-text');
  
  // Tools & Bottom Toolbar
  dom.toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
  dom.btnToggleHide = document.getElementById('btn-toggle-hide');
  dom.iconEye = dom.btnToggleHide?.querySelector('.icon-eye');
  dom.iconEyeOff = dom.btnToggleHide?.querySelector('.icon-eye-off');
  dom.completeColorPicker = document.getElementById('complete-color-picker');
  dom.completeColorPreview = document.getElementById('complete-color-preview');
  dom.completeColorValue = document.getElementById('complete-color-value');
  dom.completeSwatches = document.getElementById('complete-swatches');
  dom.completeOpacitySlider = document.getElementById('complete-opacity-slider');
  dom.completeOpacityValue = document.getElementById('complete-opacity-value');
  dom.completeModeSelect = document.getElementById('complete-mode-select');
  dom.btnToggleGrid = document.getElementById('btn-toggle-grid');

  // Done Settings Popover
  dom.btnToggleDoneSettings = document.getElementById('btn-toggle-done-settings');
  dom.doneSettingsPopover = document.getElementById('done-settings-popover');
  dom.btnCloseDoneSettings = document.getElementById('btn-close-done-settings');
  dom.btnDoneColorDot = document.getElementById('btn-done-color-dot');
  dom.projectBgColorPicker = document.getElementById('project-bg-color-picker');
  dom.projectBgColorPreview = document.getElementById('project-bg-color-preview');
  dom.projectBgColorValue = document.getElementById('project-bg-color-value');
  dom.projectBgSwatches = document.getElementById('project-bg-swatches');

  // Detach Canvas Button
  dom.btnDetachCanvas = document.getElementById('btn-detach-canvas');

  // Server Connection Controls (Raspberry Pi)
  dom.btnServerConnect = document.getElementById('btn-server-connect');
  dom.headerServerDot = document.getElementById('header-server-dot');
  dom.modalServer = document.getElementById('modal-server');
  dom.inputServerUrl = document.getElementById('input-server-url');
  dom.serverStatusMessage = document.getElementById('server-status-message');
  dom.lanIpChips = document.getElementById('lan-ip-chips');
  dom.btnTestServerConnection = document.getElementById('btn-test-server-connection');
  dom.btnSaveServerConnection = document.getElementById('btn-save-server-connection');

  // Canvas
  dom.canvasViewport = document.getElementById('canvas-viewport');
  dom.canvas = document.getElementById('main-canvas');
  dom.ctx = dom.canvas.getContext('2d');
  
  // Zoom Controls
  dom.btnZoomIn = document.getElementById('btn-zoom-in');
  dom.btnZoomOut = document.getElementById('btn-zoom-out');
  dom.btnZoomLevel = document.getElementById('btn-zoom-level');
  dom.zoomPercentageText = document.getElementById('zoom-percentage-text');
  dom.btnFitScreen = document.getElementById('btn-fit-screen');
  
  // HUD
  dom.pixelHud = document.getElementById('pixel-inspector-hud');
  dom.hudCoordText = document.getElementById('hud-coord-text');
  dom.hudColorSwatch = document.getElementById('hud-color-swatch');
  dom.hudColorText = document.getElementById('hud-color-text');
  dom.hudStatusText = document.getElementById('hud-status-text');

  // Sidebar & Drawers
  dom.sidebarPanel = document.getElementById('sidebar-panel');
  dom.sidebarBackdrop = document.getElementById('sidebar-backdrop');
  dom.btnCloseSidebar = document.getElementById('btn-close-sidebar');
  dom.btnBottomPalette = document.getElementById('btn-bottom-palette');
  dom.sidebarProgressBar = document.getElementById('sidebar-progress-bar');
  dom.sidebarProgressPercentage = document.getElementById('sidebar-progress-percentage');
  dom.statCompletedCount = document.getElementById('stat-completed-count');
  dom.statRemainingCount = document.getElementById('stat-remaining-count');
  dom.statTotalCount = document.getElementById('stat-total-count');
  dom.paletteList = document.getElementById('palette-list');
  dom.btnResetAllColors = document.getElementById('btn-reset-all-colors');
  dom.colorFilterNotice = document.getElementById('color-filter-notice');
  dom.filteredColorBadge = document.getElementById('filtered-color-badge');
  dom.btnClearFilter = document.getElementById('btn-clear-filter');

  dom.infoDimensions = document.getElementById('info-dimensions');
  dom.infoColorsCount = document.getElementById('info-colors-count');
  dom.infoOverridesCount = document.getElementById('info-overrides-count');
  dom.infoLastSaved = document.getElementById('info-last-saved');

  // Footer (optional)
  dom.footerCoords = document.getElementById('footer-coords');
  dom.footerDimensions = document.getElementById('footer-dimensions');
  dom.footerServerStatus = document.getElementById('footer-server-status');
  dom.footerLanIp = document.getElementById('footer-lan-ip');

  // Modals
  dom.modalProjects = document.getElementById('modal-projects');
  dom.modalProjectsGrid = document.getElementById('modal-projects-grid');
  dom.modalProjectsCount = document.getElementById('modal-projects-count');
  dom.btnModalNewProj = document.getElementById('btn-modal-new-proj');

  dom.modalNewProject = document.getElementById('modal-new-project');
  dom.formNewProject = document.getElementById('form-new-project');
  dom.newProjectName = document.getElementById('new-project-name');
  dom.imageDropzone = document.getElementById('image-dropzone');
  dom.fileInputImage = document.getElementById('file-input-image');
  dom.imageImportPreviewBox = document.getElementById('image-import-preview-box');
  dom.importPreviewCanvas = document.getElementById('import-preview-canvas');
  dom.previewMetaDims = document.getElementById('preview-meta-dims');
  dom.checkDownsample = document.getElementById('check-downsample');
  dom.selectDownsampleSize = document.getElementById('select-downsample-size');
  dom.importBgColorPicker = document.getElementById('import-bg-color-picker');
  dom.importBgColorPreview = document.getElementById('import-bg-color-preview');
  dom.importBgColorValue = document.getElementById('import-bg-color-value');
  dom.importBgSwatches = document.getElementById('import-bg-swatches');
  dom.starterTemplatesRow = document.getElementById('starter-templates-row');
  dom.btnSubmitNewProject = document.getElementById('btn-submit-new-project');

  dom.modalExport = document.getElementById('modal-export');
  dom.exportPreviewCanvas = document.getElementById('export-preview-canvas');
  dom.exportScaleSelect = document.getElementById('export-scale-select');
  dom.exportIncludeGrid = document.getElementById('export-include-grid');
  dom.btnDoExportDownload = document.getElementById('btn-do-export-download');

  dom.modalColorReplace = document.getElementById('modal-color-replace');
  dom.replaceOrigSwatch = document.getElementById('replace-orig-swatch');
  dom.replaceOrigHex = document.getElementById('replace-orig-hex');
  dom.replaceNewSwatch = document.getElementById('replace-new-swatch');
  dom.replaceNewHex = document.getElementById('replace-new-hex');
  dom.replaceColorNativeInput = document.getElementById('replace-color-native-input');
  dom.replaceColorTextInput = document.getElementById('replace-color-text-input');
  dom.replaceSwatchesRow = document.getElementById('replace-swatches-row');
  dom.btnRevertSingleColor = document.getElementById('btn-revert-single-color');
  dom.btnApplyReplaceColor = document.getElementById('btn-apply-replace-color');

  dom.toastContainer = document.getElementById('toast-container');
}

// ============================================================================
// Theme Management
// ============================================================================

function initTheme() {
  const saved = localStorage.getItem('across_stitch_theme') || 'dark';
  setTheme(saved);
}

function setTheme(theme) {
  if (theme === 'light') {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
  } else {
    document.body.classList.remove('theme-light');
    document.body.classList.add('theme-dark');
  }
  localStorage.setItem('across_stitch_theme', theme);
  renderCanvas();
}

function toggleTheme() {
  const isLight = document.body.classList.contains('theme-light');
  setTheme(isLight ? 'dark' : 'light');
}

// ============================================================================
// Network Info & Android LAN Sync
// ============================================================================

async function fetchNetworkInfo() {
  try {
    const res = await apiFetch('/api/network-info');
    if (res.ok) {
      const data = await res.json();
      state.networkInfo = data;
      if (dom.footerLanIp) {
        const ips = data.lanIps || data.localIps || [];
        if (ips.length > 0) {
          dom.footerLanIp.textContent = `Pi/LAN: http://${ips[0]}:${data.port}`;
          dom.footerLanIp.title = `Access from Raspberry Pi, PC, or Android:\n${data.urls ? data.urls.join('\n') : ips.join('\n')}`;
        } else {
          dom.footerLanIp.textContent = `http://localhost:${data.port}`;
        }
      }
      setServerStatus(true);
    }
  } catch (e) {
    setServerStatus(false);
  }
}

function setServerStatus(online) {
  state.serverOnline = online;
  if (dom.headerServerDot) {
    dom.headerServerDot.className = online ? 'server-status-dot online' : 'server-status-dot offline';
  }
  if (dom.footerServerStatus) {
    if (online) {
      dom.footerServerStatus.textContent = 'Server Connected';
      dom.footerServerStatus.className = 'footer-item online';
    } else {
      dom.footerServerStatus.textContent = 'Server Offline (Local Cache)';
      dom.footerServerStatus.className = 'footer-item offline';
    }
  }
}

function openServerModal() {
  const currentUrl = getApiBaseUrl() || window.location.origin;
  if (dom.inputServerUrl) dom.inputServerUrl.value = getApiBaseUrl() || '';
  if (dom.serverStatusMessage) dom.serverStatusMessage.textContent = `Current: ${currentUrl}`;

  // Populate LAN chips
  if (dom.lanIpChips) {
    dom.lanIpChips.innerHTML = '';
    const ips = state.networkInfo?.lanIps || state.networkInfo?.localIps || [];
    const port = state.networkInfo?.port || 3000;
    
    // Add localhost chip
    const localChip = document.createElement('button');
    localChip.type = 'button';
    localChip.className = 'lan-ip-chip';
    localChip.textContent = `http://localhost:${port}`;
    localChip.addEventListener('click', () => {
      dom.inputServerUrl.value = `http://localhost:${port}`;
    });
    dom.lanIpChips.appendChild(localChip);

    // Add hostname / Pi chip
    const piChip = document.createElement('button');
    piChip.type = 'button';
    piChip.className = 'lan-ip-chip';
    piChip.textContent = `http://raspberrypi.local:${port}`;
    piChip.addEventListener('click', () => {
      dom.inputServerUrl.value = `http://raspberrypi.local:${port}`;
    });
    dom.lanIpChips.appendChild(piChip);

    ips.forEach(ip => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'lan-ip-chip';
      chip.textContent = `http://${ip}:${port}`;
      chip.addEventListener('click', () => {
        dom.inputServerUrl.value = `http://${ip}:${port}`;
      });
      dom.lanIpChips.appendChild(chip);
    });
  }

  openModal('modal-server');
}

async function testServerConnection() {
  const url = dom.inputServerUrl?.value.trim();
  const testUrl = url ? `${url.replace(/\/+$/, '')}/api/network-info` : '/api/network-info';
  
  if (dom.serverStatusMessage) {
    dom.serverStatusMessage.textContent = 'Testing connection...';
    dom.serverStatusMessage.style.color = 'var(--text-secondary)';
  }

  try {
    const res = await fetch(testUrl, { method: 'GET', signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      if (dom.serverStatusMessage) {
        dom.serverStatusMessage.textContent = '✓ Successfully connected to Raspberry Pi server!';
        dom.serverStatusMessage.style.color = 'var(--accent-success)';
      }
      showToast('Connected to server successfully', 'success');
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    if (dom.serverStatusMessage) {
      dom.serverStatusMessage.textContent = `✗ Connection failed: ${e.message}`;
      dom.serverStatusMessage.style.color = 'var(--accent-danger)';
    }
    showToast(`Connection failed: ${e.message}`, 'error');
  }
}

async function saveServerConnection() {
  const url = dom.inputServerUrl?.value.trim();
  setApiBaseUrl(url);
  closeModal('modal-server');
  showToast(`Server URL set to: ${url || 'Local origin'}`, 'success');
  await fetchNetworkInfo();
  await loadInitialProject();
}

// ============================================================================
// Canvas Setup & Rendering Engine
// ============================================================================

function setupCanvas() {
  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    renderCanvas();
  });
}

function resizeCanvas() {
  const rect = dom.canvasViewport.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  dom.canvas.width = rect.width * dpr;
  dom.canvas.height = rect.height * dpr;
  dom.ctx.scale(dpr, dpr);
}

/**
 * Main Render Loop
 */
function renderCanvas() {
  if (!state.currentProject || state.pixelMatrix.length === 0) return;

  const rect = dom.canvasViewport.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const ctx = dom.ctx;

  // Reset transform and clear
  ctx.save();
  ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // Apply pan and zoom
  ctx.translate(width / 2 + state.panX, height / 2 + state.panY);
  ctx.scale(state.zoom, state.zoom);

  // Center art at (0,0)
  const imgW = state.currentProject.width;
  const imgH = state.currentProject.height;
  const startX = -imgW / 2;
  const startY = -imgH / 2;

  // 1. Draw Subtle Background / Fabric Card for the art
  const bgColor = state.currentProject.backgroundColor || '#ffffff';
  if (bgColor === 'transparent') {
    drawCheckerboard(ctx, startX, startY, imgW, imgH);
  } else {
    ctx.fillStyle = bgColor;
    ctx.fillRect(startX, startY, imgW, imgH);
  }

  // 2. Draw Pixels
  const changedColors = state.currentProject.changedColors || {};
  const completedSet = state.completedSet || new Set(state.currentProject.completedPixels || []);
  const completeStyle = state.currentProject.completeStyle || {
    color: '#10b981',
    opacity: 0.7,
    mode: 'tint',
    hideCompleted: false
  };

  const isFiltering = !!state.filterColor;
  const targetFilterColor = state.filterColor ? state.filterColor.toLowerCase() : null;

  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const origHex = state.pixelMatrix[y]?.[x];
      if (!origHex) continue; // transparent pixel

      // Effective color (with overrides applied)
      const effectiveHex = changedColors[origHex] || origHex;
      const pixelX = startX + x;
      const pixelY = startY + y;

      // Color isolation / highlight filter
      const matchesFilter = !isFiltering || origHex.toLowerCase() === targetFilterColor;

      ctx.fillStyle = effectiveHex;
      if (matchesFilter) {
        ctx.globalAlpha = 1.0;
      } else {
        ctx.globalAlpha = 0.18; // dimmed when filtering another color
      }

      ctx.fillRect(pixelX, pixelY, 1, 1);
    }
  }

  // 3. Draw Completed Pixels Overlay (if not hidden!)
  if (!completeStyle.hideCompleted && completedSet.size > 0) {
    const compColor = completeStyle.color || '#10b981';
    const compOpacity = completeStyle.opacity !== undefined ? completeStyle.opacity : 0.7;
    const mode = completeStyle.mode || 'tint';

    for (let y = 0; y < imgH; y++) {
      for (let x = 0; x < imgW; x++) {
        const key = `${x},${y}`;
        if (!completedSet.has(key)) continue;

        const origHex = state.pixelMatrix[y]?.[x];
        if (!origHex) continue;

        const pixelX = startX + x;
        const pixelY = startY + y;

        ctx.save();
        ctx.globalAlpha = compOpacity;

        if (mode === 'tint') {
          // Translucent color tint over pixel
          ctx.fillStyle = compColor;
          ctx.fillRect(pixelX, pixelY, 1, 1);
        } else if (mode === 'solid') {
          // Solid opaque color
          ctx.fillStyle = compColor;
          ctx.fillRect(pixelX, pixelY, 1, 1);
        } else if (mode === 'cross') {
          // Authentic Cross-Stitch X
          ctx.strokeStyle = compColor;
          ctx.lineWidth = 0.16; // proportional to 1x1 pixel size
          ctx.lineCap = 'round';

          ctx.beginPath();
          ctx.moveTo(pixelX + 0.18, pixelY + 0.18);
          ctx.lineTo(pixelX + 0.82, pixelY + 0.82);
          ctx.moveTo(pixelX + 0.82, pixelY + 0.18);
          ctx.lineTo(pixelX + 0.18, pixelY + 0.82);
          ctx.stroke();
        } else if (mode === 'dot') {
          // Centered stitch dot
          ctx.fillStyle = compColor;
          ctx.beginPath();
          ctx.arc(pixelX + 0.5, pixelY + 0.5, 0.28, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }
  }

  // 4. Draw Pixel Grid Lines (When zoomed in >= 4x)
  if (state.showGrid && state.zoom >= 4) {
    ctx.save();
    const isLight = document.body.classList.contains('theme-light');
    const baseGridColor = isLight ? 'rgba(0, 0, 0, 0.10)' : 'rgba(255, 255, 255, 0.10)';
    const accentGridColor = isLight ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.35)';

    ctx.lineWidth = 1 / state.zoom;

    // Vertical lines
    for (let x = 0; x <= imgW; x++) {
      ctx.beginPath();
      ctx.strokeStyle = (x % 5 === 0) ? accentGridColor : baseGridColor;
      ctx.moveTo(startX + x, startY);
      ctx.lineTo(startX + x, startY + imgH);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = 0; y <= imgH; y++) {
      ctx.beginPath();
      ctx.strokeStyle = (y % 5 === 0) ? accentGridColor : baseGridColor;
      ctx.moveTo(startX, startY + y);
      ctx.lineTo(startX + imgW, startY + y);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 5. Draw Hover Pixel Highlight
  if (state.hoverPixel) {
    const { x, y } = state.hoverPixel;
    if (x >= 0 && x < imgW && y >= 0 && y < imgH) {
      ctx.save();
      const pixelX = startX + x;
      const pixelY = startY + y;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / state.zoom;
      ctx.strokeRect(pixelX, pixelY, 1, 1);
      ctx.restore();
    }
  }

  ctx.restore();
}

/**
 * Draws pixel checkerboard for transparent canvas/fabric background
 */
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

/**
 * Screen Coordinate -> Pixel Coordinate Converter
 */
function screenToPixel(screenX, screenY) {
  if (!state.currentProject) return null;
  const rect = dom.canvasViewport.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  const canvasX = screenX - rect.left;
  const canvasY = screenY - rect.top;

  // Undo translate and scale
  const imgW = state.currentProject.width;
  const imgH = state.currentProject.height;

  const worldX = (canvasX - (width / 2 + state.panX)) / state.zoom;
  const worldY = (canvasY - (height / 2 + state.panY)) / state.zoom;

  const pixelX = Math.floor(worldX + imgW / 2);
  const pixelY = Math.floor(worldY + imgH / 2);

  if (pixelX >= 0 && pixelX < imgW && pixelY >= 0 && pixelY < imgH) {
    return { x: pixelX, y: pixelY };
  }
  return null;
}

function fitToScreen() {
  if (!state.currentProject) return;
  const rect = dom.canvasViewport.getBoundingClientRect();
  const padding = 60;
  const availW = rect.width - padding;
  const availH = rect.height - padding;

  const scaleX = availW / state.currentProject.width;
  const scaleY = availH / state.currentProject.height;
  const fitZoom = Math.max(1, Math.min(64, Math.floor(Math.min(scaleX, scaleY))));

  state.zoom = fitZoom;
  state.panX = 0;
  state.panY = 0;
  updateZoomUI();
  renderCanvas();
}

function updateZoomUI() {
  dom.zoomPercentageText.textContent = `${Math.round(state.zoom * 100)}%`;
}

// ============================================================================
// Project Loading & Palette Extraction
// ============================================================================

async function loadInitialProject() {
  try {
    const res = await apiFetch('/api/projects');
    if (res.ok) {
      const list = await res.json();
      if (list.length > 0) {
        // Load first project
        await openProject(list[0].id);
        return;
      }
    }
  } catch (e) {
    console.error('Error loading projects list:', e);
  }
}

async function openProject(projectId) {
  try {
    showToast('Loading project...', 'info');
    const res = await apiFetch(`/api/projects/${projectId}`);
    if (!res.ok) throw new Error('Project not found');

    const project = await res.json();
    setProject(project);
    fitToScreen();
    showToast(`Loaded "${project.name}"`, 'success');
  } catch (err) {
    showToast(`Failed to load project: ${err.message}`, 'error');
  }
}

function setProject(project) {
  state.currentProject = project;
  state.completedSet = new Set(project.completedPixels || []);
  state.unsavedChanges = false;
  state.filterColor = null;

  // Ensure completeStyle defaults
  if (!project.completeStyle) {
    project.completeStyle = {
      color: '#10b981',
      opacity: 0.7,
      mode: 'tint',
      hideCompleted: false
    };
  }

  // Ensure backgroundColor default
  if (!project.backgroundColor) {
    project.backgroundColor = '#ffffff';
  }

  // Update UI Inputs
  dom.projectNameInput.value = project.name;
  updateSaveBadge(false);

  // Sync completion controls & background UI
  syncCompletionControlsUI();
  syncProjectBackgroundUI();

  // Extract pixel colors from original image
  extractPixelMatrix(project.originalImage, project.width, project.height, () => {
    rebuildPalette();
    updateProgressUI();
    renderCanvas();
    broadcastStateToDetached();
  });
}

function syncCompletionControlsUI() {
  const cs = state.currentProject.completeStyle;
  dom.completeColorPicker.value = cs.color;
  dom.completeColorPreview.style.backgroundColor = cs.color;
  dom.completeColorValue.textContent = cs.color;
  if (dom.btnDoneColorDot) {
    dom.btnDoneColorDot.style.backgroundColor = cs.color;
  }

  const pct = Math.round((cs.opacity !== undefined ? cs.opacity : 0.7) * 100);
  dom.completeOpacitySlider.value = pct;
  dom.completeOpacityValue.textContent = `${pct}%`;

  // Mode segmented control
  dom.completeModeSelect.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === cs.mode);
  });

  // Hide completed icon
  if (cs.hideCompleted) {
    dom.iconEye.classList.add('hidden');
    dom.iconEyeOff.classList.remove('hidden');
    dom.btnToggleHide.classList.add('active');
  } else {
    dom.iconEye.classList.remove('hidden');
    dom.iconEyeOff.classList.add('hidden');
    dom.btnToggleHide.classList.remove('active');
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
          row.push(null); // transparent
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

// ============================================================================
// Palette & Color Replacement Engine
// ============================================================================

function rebuildPalette() {
  if (!state.currentProject || state.pixelMatrix.length === 0) return;

  const counts = {};
  const completedCounts = {};
  const changedColors = state.currentProject.changedColors || {};
  const completedSet = state.completedSet || new Set();

  const imgW = state.currentProject.width;
  const imgH = state.currentProject.height;

  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const origHex = state.pixelMatrix[y]?.[x];
      if (!origHex) continue;

      counts[origHex] = (counts[origHex] || 0) + 1;

      if (completedSet.has(`${x},${y}`)) {
        completedCounts[origHex] = (completedCounts[origHex] || 0) + 1;
      }
    }
  }

  // Sort by count descending
  const sortedColors = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  state.palette = sortedColors.map(hex => ({
    originalHex: hex,
    currentHex: changedColors[hex] || hex,
    isModified: !!changedColors[hex],
    count: counts[hex],
    completedCount: completedCounts[hex] || 0,
  }));

  renderPaletteUI();
  updateProjectMetaUI();
}

function renderPaletteUI() {
  dom.paletteList.innerHTML = '';

  state.palette.forEach(item => {
    const el = document.createElement('div');
    el.className = `palette-item ${state.filterColor === item.originalHex ? 'filtered' : ''}`;
    el.dataset.origHex = item.originalHex;

    const isFiltered = state.filterColor === item.originalHex;

    el.innerHTML = `
      <div class="palette-swatches" title="Click to replace this color">
        <div class="palette-swatch-main" style="background-color: ${item.currentHex};"></div>
        ${item.isModified ? `<div class="palette-swatch-orig-pip" style="background-color: ${item.originalHex};" title="Original: ${item.originalHex}"></div>` : ''}
      </div>
      <div class="palette-info">
        <div class="palette-color-row">
          <span class="palette-hex">${item.currentHex}</span>
          ${item.isModified ? `<span class="badge-modified">Modified</span>` : ''}
        </div>
        <div class="palette-stats">
          <span>${item.completedCount}/${item.count} done</span>
          <span>(${Math.round((item.completedCount / item.count) * 100)}%)</span>
        </div>
      </div>
      <div class="palette-actions">
        <!-- Highlight / Isolate Color button -->
        <button class="btn-icon-tiny ${isFiltered ? 'active' : ''}" data-action="isolate" title="${isFiltered ? 'Clear isolation' : 'Highlight only this color'}">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
        </button>
        <!-- Change Color button -->
        <button class="btn-icon-tiny" data-action="replace" title="Replace color across project">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
        <!-- Mark all of this color -->
        <button class="btn-icon-tiny" data-action="mark-all" title="Mark all pixels of this color as done">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      </div>
    `;

    // Click on swatch or replace button -> open color replacement
    el.querySelector('.palette-swatches').addEventListener('click', () => openColorReplaceModal(item.originalHex));
    el.querySelector('[data-action="replace"]').addEventListener('click', () => openColorReplaceModal(item.originalHex));

    // Isolate / filter color
    el.querySelector('[data-action="isolate"]').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleColorFilter(item.originalHex);
    });

    // Mark all pixels of this color
    el.querySelector('[data-action="mark-all"]').addEventListener('click', (e) => {
      e.stopPropagation();
      markAllOfColor(item.originalHex);
    });

    dom.paletteList.appendChild(el);
  });
}

function toggleColorFilter(originalHex) {
  if (state.filterColor === originalHex) {
    state.filterColor = null;
    dom.colorFilterNotice.classList.add('hidden');
  } else {
    state.filterColor = originalHex;
    dom.colorFilterNotice.classList.remove('hidden');
    dom.filteredColorBadge.textContent = originalHex;
    dom.filteredColorBadge.style.color = state.currentProject.changedColors[originalHex] || originalHex;
  }
  rebuildPalette();
  renderCanvas();
  broadcastStateToDetached();
}

function markAllOfColor(originalHex) {
  if (!state.currentProject) return;
  const imgW = state.currentProject.width;
  const imgH = state.currentProject.height;

  let added = 0;
  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      if (state.pixelMatrix[y]?.[x] === originalHex) {
        state.completedSet.add(`${x},${y}`);
        added++;
      }
    }
  }

  syncCompletedPixelsState();
  rebuildPalette();
  updateProgressUI();
  renderCanvas();
  showToast(`Marked ${added} stitches completed`, 'success');
}

// ============================================================================
// Color Replacement Modal Logic
// ============================================================================

function openColorReplaceModal(originalHex) {
  state.activeReplaceOriginalHex = originalHex;
  const currentHex = state.currentProject.changedColors[originalHex] || originalHex;

  dom.replaceOrigSwatch.style.backgroundColor = originalHex;
  dom.replaceOrigHex.textContent = originalHex;

  dom.replaceNewSwatch.style.backgroundColor = currentHex;
  dom.replaceNewHex.textContent = currentHex;
  dom.replaceColorNativeInput.value = currentHex;
  dom.replaceColorTextInput.value = currentHex;

  // Swatches presets
  dom.replaceSwatchesRow.innerHTML = '';
  const presets = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff', '#18181b'];
  presets.forEach(color => {
    const btn = document.createElement('button');
    btn.className = 'swatch-btn';
    btn.style.setProperty('--c', color);
    btn.addEventListener('click', () => {
      setReplaceModalColor(color);
    });
    dom.replaceSwatchesRow.appendChild(btn);
  });

  openModal('modal-color-replace');
}

function setReplaceModalColor(hex) {
  dom.replaceNewSwatch.style.backgroundColor = hex;
  dom.replaceNewHex.textContent = hex;
  dom.replaceColorNativeInput.value = hex;
  dom.replaceColorTextInput.value = hex;
}

function applyColorReplacement() {
  if (!state.activeReplaceOriginalHex || !state.currentProject) return;

  const origHex = state.activeReplaceOriginalHex;
  const newHex = dom.replaceColorTextInput.value.trim();

  if (newHex.toLowerCase() === origHex.toLowerCase()) {
    // Reverted to original
    delete state.currentProject.changedColors[origHex];
  } else {
    state.currentProject.changedColors[origHex] = newHex;
  }

  closeModal('modal-color-replace');
  markUnsaved();
  rebuildPalette();
  renderCanvas();
  showToast(`Updated color replacement for ${origHex}`, 'success');
}

function revertSingleColorReplacement() {
  if (!state.activeReplaceOriginalHex || !state.currentProject) return;

  delete state.currentProject.changedColors[state.activeReplaceOriginalHex];
  closeModal('modal-color-replace');
  markUnsaved();
  rebuildPalette();
  renderCanvas();
  showToast(`Reverted ${state.activeReplaceOriginalHex} to original color`, 'success');
}

function resetAllColorsToOriginal() {
  if (!state.currentProject) return;
  if (confirm('Reset all modified colors back to the original image?')) {
    state.currentProject.changedColors = {};
    markUnsaved();
    rebuildPalette();
    renderCanvas();
    showToast('All colors reset to original', 'info');
  }
}

// ============================================================================
// Progress & Project Stats UI
// ============================================================================

function updateProgressUI() {
  if (!state.currentProject) return;

  // Calculate total non-transparent pixels
  let totalStitches = 0;
  let doneStitches = 0;
  const completedSet = state.completedSet || new Set();

  const imgW = state.currentProject.width;
  const imgH = state.currentProject.height;

  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      if (state.pixelMatrix[y]?.[x]) {
        totalStitches++;
        if (completedSet.has(`${x},${y}`)) {
          doneStitches++;
        }
      }
    }
  }

  const percentage = totalStitches > 0 ? Math.round((doneStitches / totalStitches) * 100) : 0;

  // Update header progress
  dom.headerProgressBar.style.width = `${percentage}%`;
  dom.headerProgressText.textContent = `${percentage}%`;

  // Update sidebar progress
  dom.sidebarProgressBar.style.width = `${percentage}%`;
  dom.sidebarProgressPercentage.textContent = `${percentage}%`;
  dom.statCompletedCount.textContent = doneStitches;
  dom.statRemainingCount.textContent = totalStitches - doneStitches;
  dom.statTotalCount.textContent = totalStitches;
}

function updateProjectMetaUI() {
  if (!state.currentProject) return;
  dom.infoDimensions.textContent = `${state.currentProject.width} × ${state.currentProject.height} px`;
  dom.infoColorsCount.textContent = `${state.palette.length} colors`;
  const overrides = Object.keys(state.currentProject.changedColors || {}).length;
  dom.infoOverridesCount.textContent = `${overrides} modified`;

  const dateStr = state.currentProject.updatedAt ? new Date(state.currentProject.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
  dom.infoLastSaved.textContent = dateStr;

  if (dom.footerDimensions) {
    dom.footerDimensions.textContent = `${state.currentProject.width} × ${state.currentProject.height} px`;
  }
}

// ============================================================================
// Interaction & Drawing Engine
// ============================================================================

function setupEventListeners() {
  // Theme Toggle
  dom.btnThemeToggle.addEventListener('click', toggleTheme);

  // Projects Modal
  dom.btnProjects.addEventListener('click', openProjectsModal);
  dom.btnModalNewProj.addEventListener('click', () => {
    closeModal('modal-projects');
    openNewProjectModal();
  });

  // New Project Button
  dom.btnNewProject.addEventListener('click', openNewProjectModal);

  // Export Button
  dom.btnExport.addEventListener('click', openExportModal);

  // Toggle Sidebar Drawer (Mobile & Desktop)
  const updateMainCanvasLayout = () => {
    resizeCanvas();
    renderCanvas();
    requestAnimationFrame(() => {
      resizeCanvas();
      renderCanvas();
    });
    setTimeout(() => {
      resizeCanvas();
      renderCanvas();
    }, 60);
  };

  const toggleSidebar = () => {
    if (window.innerWidth <= 900) {
      const isOpen = dom.sidebarPanel?.classList.toggle('open');
      if (dom.sidebarBackdrop) {
        dom.sidebarBackdrop.classList.toggle('hidden', !isOpen);
      }
    } else {
      const isCollapsed = dom.sidebarPanel?.classList.toggle('collapsed');
      dom.btnToggleSidebar?.classList.toggle('active', !isCollapsed);
      updateMainCanvasLayout();
    }
  };
  const closeSidebar = () => {
    if (window.innerWidth <= 900) {
      dom.sidebarPanel?.classList.remove('open');
      dom.sidebarBackdrop?.classList.add('hidden');
    } else {
      dom.sidebarPanel?.classList.add('collapsed');
      dom.btnToggleSidebar?.classList.remove('active');
      updateMainCanvasLayout();
    }
  };

  dom.btnToggleSidebar?.addEventListener('click', toggleSidebar);
  dom.btnBottomPalette?.addEventListener('click', toggleSidebar);
  dom.btnCloseSidebar?.addEventListener('click', closeSidebar);
  dom.sidebarBackdrop?.addEventListener('click', closeSidebar);

  // Done Settings Popover Toggle
  dom.btnToggleDoneSettings?.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.doneSettingsPopover?.classList.toggle('hidden');
  });
  dom.btnCloseDoneSettings?.addEventListener('click', () => {
    dom.doneSettingsPopover?.classList.add('hidden');
  });

  // Close popover when tapping outside
  document.addEventListener('pointerdown', (e) => {
    if (dom.doneSettingsPopover && !dom.doneSettingsPopover.classList.contains('hidden')) {
      if (!dom.doneSettingsPopover.contains(e.target) && !dom.btnToggleDoneSettings?.contains(e.target)) {
        dom.doneSettingsPopover.classList.add('hidden');
      }
    }
  });

  // Canvas Fabric / Background Color Controls (in Popover)
  if (dom.projectBgColorPicker) {
    dom.projectBgColorPicker.addEventListener('input', (e) => {
      setProjectBackgroundColor(e.target.value);
    });
  }

  if (dom.projectBgSwatches) {
    dom.projectBgSwatches.querySelectorAll('.swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setProjectBackgroundColor(btn.dataset.bg);
      });
    });
  }

  // PNG Import Background Color Controls (in New Project Modal)
  if (dom.importBgColorPicker) {
    dom.importBgColorPicker.addEventListener('input', (e) => {
      setImportBackgroundColor(e.target.value);
    });
  }

  if (dom.importBgSwatches) {
    dom.importBgSwatches.querySelectorAll('.swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setImportBackgroundColor(btn.dataset.bg);
      });
    });
  }

  // Save Button
  dom.btnSave.addEventListener('click', saveProjectToServer);

  // Project Rename
  dom.projectNameInput.addEventListener('change', () => {
    if (state.currentProject && dom.projectNameInput.value.trim()) {
      state.currentProject.name = dom.projectNameInput.value.trim();
      markUnsaved();
    }
  });

  // Tool Switching
  dom.toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dom.toolBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeTool = btn.dataset.tool;
      updateCursorStyle();
    });
  });

  // Hide/Show Completed Pixels Toggle (H)
  dom.btnToggleHide.addEventListener('click', toggleHideCompleted);

  // Completion Styling Reactivity:
  // Color Picker
  dom.completeColorPicker.addEventListener('input', (e) => {
    setCompletionColor(e.target.value);
  });

  // Color Swatches
  dom.completeSwatches.querySelectorAll('.swatch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setCompletionColor(btn.dataset.color);
    });
  });

  // Opacity Slider
  dom.completeOpacitySlider.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    dom.completeOpacityValue.textContent = `${val}%`;
    if (state.currentProject) {
      state.currentProject.completeStyle.opacity = val / 100;
      markUnsaved();
      renderCanvas();
    }
  });

  // Mode Select (Tint / Cross / Solid / Dot)
  dom.completeModeSelect.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dom.completeModeSelect.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (state.currentProject) {
        state.currentProject.completeStyle.mode = btn.dataset.mode;
        markUnsaved();
        renderCanvas();
      }
    });
  });

  // Grid Lines Toggle (G)
  dom.btnToggleGrid.addEventListener('click', () => {
    state.showGrid = !state.showGrid;
    dom.btnToggleGrid.classList.toggle('btn-secondary', state.showGrid);
    renderCanvas();
  });

  // Zoom Buttons
  dom.btnZoomIn.addEventListener('click', () => adjustZoom(1.25));
  dom.btnZoomOut.addEventListener('click', () => adjustZoom(0.8));
  dom.btnZoomLevel.addEventListener('click', () => {
    state.zoom = 10;
    state.panX = 0;
    state.panY = 0;
    updateZoomUI();
    renderCanvas();
  });
  dom.btnFitScreen.addEventListener('click', fitToScreen);

  // Clear Filter
  dom.btnClearFilter.addEventListener('click', () => {
    state.filterColor = null;
    dom.colorFilterNotice.classList.add('hidden');
    rebuildPalette();
    renderCanvas();
    broadcastStateToDetached();
  });

  // Server Connection Settings Modal
  dom.btnServerConnect?.addEventListener('click', openServerModal);
  dom.btnTestServerConnection?.addEventListener('click', testServerConnection);
  dom.btnSaveServerConnection?.addEventListener('click', saveServerConnection);

  // Detach Canvas Button (Always on Top)
  dom.btnDetachCanvas?.addEventListener('click', openDetachedWindow);

  // Detached Window Sync Listeners (Electron IPC & Browser Messages)
  if (window.electronAPI) {
    window.electronAPI.onActionFromDetached((action) => {
      handleDetachedAction(action);
    });
  }

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'DETACHED_ACTION') {
      handleDetachedAction(e.data.action);
    } else if (e.data && e.data.type === 'DETACHED_READY') {
      broadcastStateToDetached();
    }
  });

  // Reset All Colors
  dom.btnResetAllColors.addEventListener('click', resetAllColorsToOriginal);

  // Canvas Mouse & Touch Interaction
  bindCanvasEvents();

  // Keyboard Shortcuts
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  // Color Replace Dialog bindings
  dom.replaceColorNativeInput.addEventListener('input', (e) => setReplaceModalColor(e.target.value));
  dom.replaceColorTextInput.addEventListener('input', (e) => {
    if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
      setReplaceModalColor(e.target.value);
    }
  });
  dom.btnApplyReplaceColor.addEventListener('click', applyColorReplacement);
  dom.btnRevertSingleColor.addEventListener('click', revertSingleColorReplacement);

  // Modal Close buttons
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.closeModal);
    });
  });

  // Export Dialog bindings
  document.querySelectorAll('.export-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.export-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.exportType = tab.dataset.exportType;
      renderExportPreview();
    });
  });

  dom.exportScaleSelect.addEventListener('change', (e) => {
    state.exportScale = Number(e.target.value);
    renderExportPreview();
  });

  dom.exportIncludeGrid.addEventListener('change', (e) => {
    state.exportIncludeGrid = e.target.checked;
    renderExportPreview();
  });

  dom.btnDoExportDownload.addEventListener('click', downloadExportedImage);

  // Image Dropzone & File Input
  if (dom.imageDropzone) {
    dom.imageDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.imageDropzone.classList.add('dragover');
    });

    dom.imageDropzone.addEventListener('dragleave', () => {
      dom.imageDropzone.classList.remove('dragover');
    });

    dom.imageDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.imageDropzone.classList.remove('dragover');
      if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
        handleImportFile(e.dataTransfer.files[0]);
      }
    });

    dom.imageDropzone.addEventListener('click', (e) => {
      if (e.target !== dom.fileInputImage) {
        dom.fileInputImage?.click();
      }
    });
  }

  if (dom.fileInputImage) {
    dom.fileInputImage.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImportFile(e.target.files[0]);
      }
    });
  }

  if (dom.checkDownsample) {
    dom.checkDownsample.addEventListener('change', () => {
      if (dom.selectDownsampleSize) {
        dom.selectDownsampleSize.disabled = !dom.checkDownsample.checked;
      }
      updateImportPreview();
    });
  }

  if (dom.selectDownsampleSize) {
    dom.selectDownsampleSize.addEventListener('change', () => {
      updateImportPreview();
    });
  }

  if (dom.formNewProject) {
    dom.formNewProject.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleCreateNewProject();
    });
  }

  if (dom.btnSubmitNewProject) {
    dom.btnSubmitNewProject.addEventListener('click', async (e) => {
      if (dom.formNewProject && dom.formNewProject.checkValidity && !dom.formNewProject.checkValidity()) {
        dom.formNewProject.reportValidity();
        return;
      }
      e.preventDefault();
      await handleCreateNewProject();
    });
  }
}

function toggleHideCompleted() {
  if (!state.currentProject) return;
  state.currentProject.completeStyle.hideCompleted = !state.currentProject.completeStyle.hideCompleted;
  syncCompletionControlsUI();
  markUnsaved();
  renderCanvas();
  broadcastStateToDetached();
  showToast(state.currentProject.completeStyle.hideCompleted ? 'Completed pixels hidden' : 'Completed pixels visible', 'info');
}

function setCompletionColor(hex) {
  if (!state.currentProject) return;
  state.currentProject.completeStyle.color = hex;
  dom.completeColorPicker.value = hex;
  dom.completeColorPreview.style.backgroundColor = hex;
  dom.completeColorValue.textContent = hex;
  if (dom.btnDoneColorDot) {
    dom.btnDoneColorDot.style.backgroundColor = hex;
  }
  markUnsaved();
  renderCanvas();
  broadcastStateToDetached();
}

function setProjectBackgroundColor(hex) {
  if (!state.currentProject) return;
  state.currentProject.backgroundColor = hex;
  syncProjectBackgroundUI();
  markUnsaved();
  renderCanvas();
  broadcastStateToDetached();
}

function syncProjectBackgroundUI() {
  if (!state.currentProject) return;
  const bg = state.currentProject.backgroundColor || '#ffffff';
  if (dom.projectBgColorPicker && bg !== 'transparent') {
    dom.projectBgColorPicker.value = bg;
  }
  if (dom.projectBgColorPreview) {
    if (bg === 'transparent') {
      dom.projectBgColorPreview.style.backgroundColor = 'transparent';
      dom.projectBgColorPreview.style.backgroundImage = 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%)';
      dom.projectBgColorPreview.style.backgroundSize = '8px 8px';
    } else {
      dom.projectBgColorPreview.style.backgroundColor = bg;
      dom.projectBgColorPreview.style.backgroundImage = 'none';
    }
  }
  if (dom.projectBgColorValue) {
    dom.projectBgColorValue.textContent = bg === 'transparent' ? 'Transp.' : bg;
  }
  if (dom.projectBgSwatches) {
    dom.projectBgSwatches.querySelectorAll('.swatch-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.bg?.toLowerCase() === bg.toLowerCase());
    });
  }
}

function setImportBackgroundColor(hex) {
  state.importBgColor = hex;
  syncImportBackgroundUI();
  updateImportPreview();
}

function syncImportBackgroundUI() {
  const bg = state.importBgColor || '#ffffff';
  if (dom.importBgColorPicker && bg !== 'transparent') {
    dom.importBgColorPicker.value = bg;
  }
  if (dom.importBgColorPreview) {
    if (bg === 'transparent') {
      dom.importBgColorPreview.style.backgroundColor = 'transparent';
      dom.importBgColorPreview.style.backgroundImage = 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%)';
      dom.importBgColorPreview.style.backgroundSize = '8px 8px';
    } else {
      dom.importBgColorPreview.style.backgroundColor = bg;
      dom.importBgColorPreview.style.backgroundImage = 'none';
    }
  }
  if (dom.importBgColorValue) {
    dom.importBgColorValue.textContent = bg === 'transparent' ? 'Transp.' : bg;
  }
  if (dom.importBgSwatches) {
    dom.importBgSwatches.querySelectorAll('.swatch-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.bg?.toLowerCase() === bg.toLowerCase());
    });
  }
  if (dom.importPreviewCanvas) {
    dom.importPreviewCanvas.style.backgroundColor = bg === 'transparent' ? 'transparent' : bg;
  }
}

function updateCursorStyle() {
  if (state.spacePressed || state.activeTool === 'pan') {
    dom.canvasViewport.style.cursor = 'grab';
  } else if (state.activeTool === 'eyedropper') {
    dom.canvasViewport.style.cursor = 'crosshair';
  } else {
    dom.canvasViewport.style.cursor = 'crosshair';
  }
}

function handleKeyDown(e) {
  // If user is typing in an input field, ignore single-letter shortcuts
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.code === 'Space' && !state.spacePressed) {
    state.spacePressed = true;
    updateCursorStyle();
    e.preventDefault();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveProjectToServer();
  } else if (e.key.toLowerCase() === 'm') {
    switchTool('stitch');
  } else if (e.key.toLowerCase() === 'e') {
    switchTool('erase');
  } else if (e.key.toLowerCase() === 'p') {
    switchTool('pan');
  } else if (e.key.toLowerCase() === 'i') {
    switchTool('eyedropper');
  } else if (e.key.toLowerCase() === 'h') {
    toggleHideCompleted();
  } else if (e.key.toLowerCase() === 'g') {
    dom.btnToggleGrid.click();
  } else if (e.key.toLowerCase() === 'f') {
    fitToScreen();
  } else if (e.key === '+' || e.key === '=') {
    adjustZoom(1.25);
  } else if (e.key === '-') {
    adjustZoom(0.8);
  }
}

function handleKeyUp(e) {
  if (e.code === 'Space') {
    state.spacePressed = false;
    updateCursorStyle();
  }
}

function switchTool(tool) {
  state.activeTool = tool;
  dom.toolBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.tool === tool);
  });
  updateCursorStyle();
  broadcastStateToDetached();
}

function adjustZoom(factor) {
  const newZoom = Math.max(state.minZoom, Math.min(state.maxZoom, state.zoom * factor));
  state.zoom = Math.round(newZoom * 10) / 10;
  updateZoomUI();
  renderCanvas();
}

// ============================================================================
// Canvas Pointer & Multi-Touch Gestures (PC and Android Touch Support)
// ============================================================================

function bindCanvasEvents() {
  const vp = dom.canvasViewport;

  let isPointerDown = false;
  let pointerType = 'mouse';
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerLastX = 0;
  let pointerLastY = 0;
  let pointerHasDragged = false;
  let lastDrawPixel = null;

  // Prevent right-click context menu so right-click can pan on PC
  vp.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // Pointer Down (Mouse or Touch)
  vp.addEventListener('pointerdown', (e) => {
    // Only primary button (left = 0, touch = 0), middle click (1), or right click (2)
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    if (state.isMultiTouch) return;

    try {
      vp.setPointerCapture(e.pointerId);
    } catch (_) {}

    isPointerDown = true;
    pointerType = e.pointerType || 'mouse';
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    pointerLastX = e.clientX;
    pointerLastY = e.clientY;
    pointerHasDragged = false;
    lastDrawPixel = null;

    const isTouch = pointerType === 'touch';

    if (!isTouch) {
      // -------------------------------------------------------------
      // PC / MOUSE BEHAVIOR
      // -------------------------------------------------------------
      // Pan with: Middle click (1), Right click (2), Spacebar held, or Move tool ('pan')
      if (e.button === 1 || e.button === 2 || state.spacePressed || state.activeTool === 'pan') {
        state.isPanning = true;
        state.isDrawing = false;
        vp.style.cursor = 'grabbing';
      } else if (e.button === 0) {
        // Left click on PC: mark, erase, or inspect immediately!
        if (state.activeTool === 'stitch' || state.activeTool === 'erase') {
          state.isPanning = false;
          state.isDrawing = true;
          const pixel = screenToPixel(e.clientX, e.clientY);
          if (pixel) {
            lastDrawPixel = pixel;
            applyToolToPixel(pixel);
          }
        } else if (state.activeTool === 'eyedropper') {
          state.isPanning = false;
          state.isDrawing = false;
          const pixel = screenToPixel(e.clientX, e.clientY);
          if (pixel) handleEyedropper(pixel);
        }
      }
    } else {
      // -------------------------------------------------------------
      // MOBILE TOUCH BEHAVIOR
      // -------------------------------------------------------------
      // On phone, single touch starts moving on drag.
      // Marking is deferred until stationary tap on pointerup.
      state.isPanning = false;
      state.isDrawing = false;
    }
  });

  // Pointer Move
  vp.addEventListener('pointermove', (e) => {
    if (state.isMultiTouch) return;

    const pixel = screenToPixel(e.clientX, e.clientY);
    state.hoverPixel = pixel;

    // Only update HUD on desktop mouse
    if (e.pointerType !== 'touch') {
      updateHUD(pixel);
    }

    if (!isPointerDown) return;

    const dx = e.clientX - pointerLastX;
    const dy = e.clientY - pointerLastY;
    const totalDist = Math.hypot(e.clientX - pointerStartX, e.clientY - pointerStartY);
    const isTouch = (e.pointerType || pointerType) === 'touch';

    if (isTouch) {
      // -------------------------------------------------------------
      // MOBILE TOUCH: Dragging ALWAYS moves / pans the canvas
      // -------------------------------------------------------------
      if (totalDist > 5) {
        pointerHasDragged = true;
        state.isPanning = true;
      }

      if (state.isPanning) {
        state.panX += dx;
        state.panY += dy;
        pointerLastX = e.clientX;
        pointerLastY = e.clientY;
        renderCanvas();
      }
    } else {
      // -------------------------------------------------------------
      // PC MOUSE: Dragging marks/erases continuously or pans!
      // -------------------------------------------------------------
      if (state.isPanning) {
        state.panX += dx;
        state.panY += dy;
        pointerLastX = e.clientX;
        pointerLastY = e.clientY;
        renderCanvas();
      } else if (state.isDrawing) {
        // Continuous marking as the mouse cursor moves while clicking!
        pointerLastX = e.clientX;
        pointerLastY = e.clientY;
        if (pixel) {
          if (!lastDrawPixel || lastDrawPixel.x !== pixel.x || lastDrawPixel.y !== pixel.y) {
            applyToolLine(lastDrawPixel || pixel, pixel);
            lastDrawPixel = pixel;
          }
        }
      }
    }
  });

  // Pointer Up / Cancel
  const handlePointerUp = (e) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    try {
      vp.releasePointerCapture(e.pointerId);
    } catch (_) {}

    const wasPanning = state.isPanning;
    const didDrag = pointerHasDragged;
    const isTouch = (e.pointerType || pointerType) === 'touch';

    state.isPanning = false;
    state.isDrawing = false;
    lastDrawPixel = null;
    updateCursorStyle();

    // On PC, continuous drawing is already completed during down and move
    if (!isTouch) {
      return;
    }

    // ---------------------------------------------------------------
    // ON MOBILE TOUCH:
    // If the finger dragged/moved (>5px), DO NOT mark any pixels!
    // ---------------------------------------------------------------
    if (didDrag || wasPanning) {
      return;
    }

    // Deliberate stationary TAP on touch screen
    const pixel = screenToPixel(pointerStartX, pointerStartY);
    if (!pixel) return;

    if (state.activeTool === 'eyedropper') {
      handleEyedropper(pixel);
      return;
    }

    if (state.activeTool === 'stitch' || state.activeTool === 'erase') {
      applyToolToPixel(pixel);
    }
  };

  vp.addEventListener('pointerup', handlePointerUp);
  vp.addEventListener('pointercancel', handlePointerUp);
  vp.addEventListener('mouseleave', () => {
    state.hoverPixel = null;
    dom.pixelHud?.classList.add('hidden');
    renderCanvas();
  });

  // Mouse Wheel Zoom (Centered at Cursor)
  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = vp.getBoundingClientRect();
    const cursorX = e.clientX - rect.left - (rect.width / 2 + state.panX);
    const cursorY = e.clientY - rect.top - (rect.height / 2 + state.panY);

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const oldZoom = state.zoom;
    const newZoom = Math.max(state.minZoom, Math.min(state.maxZoom, oldZoom * zoomFactor));

    if (newZoom !== oldZoom) {
      state.panX -= cursorX * (newZoom / oldZoom - 1);
      state.panY -= cursorY * (newZoom / oldZoom - 1);
      state.zoom = Math.round(newZoom * 10) / 10;
      updateZoomUI();
      renderCanvas();
    }
  }, { passive: false });

  // Android Native Touch Gestures: Pinch to Zoom and Two-Finger Pan
  vp.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      state.isMultiTouch = true;
      state.isDrawing = false;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      state.touchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      state.touchStartZoom = state.zoom;
      state.touchStartMidX = (t1.clientX + t2.clientX) / 2;
      state.touchStartMidY = (t1.clientY + t2.clientY) / 2;
      state.touchStartPanX = state.panX;
      state.touchStartPanY = state.panY;
    }
  }, { passive: true });

  vp.addEventListener('touchmove', (e) => {
    if (state.isMultiTouch && e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      // Pinch zoom
      if (state.touchStartDist > 0) {
        const factor = dist / state.touchStartDist;
        state.zoom = Math.max(state.minZoom, Math.min(state.maxZoom, state.touchStartZoom * factor));
      }

      // Two-finger pan
      state.panX = state.touchStartPanX + (midX - state.touchStartMidX);
      state.panY = state.touchStartPanY + (midY - state.touchStartMidY);

      updateZoomUI();
      renderCanvas();
    }
  }, { passive: false });

  vp.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      state.isMultiTouch = false;
    }
  }, { passive: true });
}

function applyToolLine(p1, p2) {
  if (!state.currentProject) return;
  if (!p1 && !p2) return;
  if (!p1) { applyToolToPixel(p2); return; }
  if (!p2) { applyToolToPixel(p1); return; }

  let x0 = p1.x;
  let y0 = p1.y;
  const x1 = p2.x;
  const y1 = p2.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let anyChanged = false;

  while (true) {
    if (x0 >= 0 && x0 < state.currentProject.width && y0 >= 0 && y0 < state.currentProject.height) {
      const origHex = state.pixelMatrix[y0]?.[x0];
      if (origHex) {
        const matchFilter = !state.filterColor || (origHex.toLowerCase() === state.filterColor.toLowerCase());
        if (matchFilter) {
          const key = `${x0},${y0}`;
          if (state.activeTool === 'stitch') {
            if (!state.completedSet.has(key)) {
              state.completedSet.add(key);
              anyChanged = true;
            }
          } else if (state.activeTool === 'erase') {
            if (state.completedSet.has(key)) {
              state.completedSet.delete(key);
              anyChanged = true;
            }
          }
        }
      }
    }

    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  if (anyChanged) {
    syncCompletedPixelsState();
    rebuildPalette();
    updateProgressUI();
    renderCanvas();
    markUnsaved();
  }
}

function applyToolToPixel(pixel) {
  if (!state.currentProject) return;
  const origHex = state.pixelMatrix[pixel.y]?.[pixel.x];
  if (!origHex) return; // ignore transparent pixels

  if (state.filterColor && origHex.toLowerCase() !== state.filterColor.toLowerCase()) {
    return;
  }

  const key = `${pixel.x},${pixel.y}`;
  let changed = false;

  if (state.activeTool === 'stitch') {
    if (!state.completedSet.has(key)) {
      state.completedSet.add(key);
      changed = true;
    }
  } else if (state.activeTool === 'erase') {
    if (state.completedSet.has(key)) {
      state.completedSet.delete(key);
      changed = true;
    }
  }

  if (changed) {
    syncCompletedPixelsState();
    rebuildPalette();
    updateProgressUI();
    renderCanvas();
    markUnsaved();
  }
}

function handleEyedropper(pixel) {
  const origHex = state.pixelMatrix[pixel.y]?.[pixel.x];
  if (!origHex) return;

  const currentHex = state.currentProject.changedColors[origHex] || origHex;
  toggleColorFilter(origHex);
  showToast(`Selected color ${currentHex}`, 'info');
}

function syncCompletedPixelsState() {
  state.currentProject.completedPixels = Array.from(state.completedSet);
  broadcastStateToDetached();
}

function updateHUD(pixel) {
  if (!pixel || !state.currentProject) {
    dom.pixelHud?.classList.add('hidden');
    if (dom.footerCoords) dom.footerCoords.textContent = 'X: --, Y: --';
    return;
  }

  dom.pixelHud?.classList.remove('hidden');
  if (dom.hudCoordText) dom.hudCoordText.textContent = `X: ${pixel.x}, Y: ${pixel.y}`;
  if (dom.footerCoords) dom.footerCoords.textContent = `X: ${pixel.x}, Y: ${pixel.y}`;

  const origHex = state.pixelMatrix[pixel.y]?.[pixel.x];
  if (origHex) {
    const currentHex = state.currentProject.changedColors[origHex] || origHex;
    if (dom.hudColorSwatch) dom.hudColorSwatch.style.backgroundColor = currentHex;
    if (dom.hudColorText) dom.hudColorText.textContent = currentHex;

    const isDone = state.completedSet.has(`${pixel.x},${pixel.y}`);
    if (dom.hudStatusText) {
      dom.hudStatusText.textContent = isDone ? 'Stitched ✓' : 'Unstitched';
      dom.hudStatusText.style.color = isDone ? 'var(--accent-success)' : 'var(--text-tertiary)';
    }
  } else {
    if (dom.hudColorSwatch) dom.hudColorSwatch.style.backgroundColor = 'transparent';
    if (dom.hudColorText) dom.hudColorText.textContent = 'Transparent';
    if (dom.hudStatusText) dom.hudStatusText.textContent = '--';
  }
}

// ============================================================================
// Server Sync & Auto-Save (Bun REST API)
// ============================================================================

function markUnsaved() {
  state.unsavedChanges = true;
  updateSaveBadge(true);

  // Debounced auto-save (5 seconds)
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(() => {
    saveProjectToServer();
  }, 5000);
}

function updateSaveBadge(unsaved) {
  if (unsaved) {
    dom.saveStatusBadge.className = 'save-status-badge unsaved';
    dom.saveStatusBadge.querySelector('.status-label').textContent = 'Unsaved';
  } else {
    dom.saveStatusBadge.className = 'save-status-badge saved';
    dom.saveStatusBadge.querySelector('.status-label').textContent = 'Saved';
  }
}

async function saveProjectToServer() {
  if (!state.currentProject) return;

  dom.saveStatusBadge.className = 'save-status-badge saving';
  dom.saveStatusBadge.querySelector('.status-label').textContent = 'Saving...';

  try {
    const payload = {
      name: state.currentProject.name,
      changedColors: state.currentProject.changedColors,
      completedPixels: Array.from(state.completedSet),
      completeStyle: state.currentProject.completeStyle,
      backgroundColor: state.currentProject.backgroundColor || '#ffffff',
    };

    const res = await apiFetch(`/api/projects/${state.currentProject.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Save failed');

    const updated = await res.json();
    state.currentProject.updatedAt = updated.updatedAt;
    state.unsavedChanges = false;
    updateSaveBadge(false);
    updateProjectMetaUI();
    showToast('Saved to server', 'success');
  } catch (err) {
    updateSaveBadge(true);
    showToast(`Error saving: ${err.message}`, 'error');
  }
}

// ============================================================================
// Projects Gallery & Modal
// ============================================================================

async function openProjectsModal() {
  openModal('modal-projects');
  dom.modalProjectsGrid.innerHTML = '<div style="color:var(--text-tertiary);padding:20px;">Loading projects...</div>';

  try {
    const res = await apiFetch('/api/projects');
    if (!res.ok) throw new Error('Failed to fetch projects');
    const projects = await res.json();

    dom.modalProjectsCount.textContent = `${projects.length} projects saved`;
    dom.modalProjectsGrid.innerHTML = '';

    projects.forEach(p => {
      const card = document.createElement('div');
      card.className = `project-card ${state.currentProject?.id === p.id ? 'active' : ''}`;

      const pct = p.totalPixels > 0 ? Math.round((p.completedCount / p.totalPixels) * 100) : 0;
      const dateStr = new Date(p.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' });

      card.innerHTML = `
        <div class="project-card-thumb-wrap">
          <img src="${p.originalImage}" class="project-card-thumb" alt="${p.name}">
        </div>
        <div class="project-card-body">
          <div class="project-card-title">${p.name}</div>
          <div class="project-card-meta">
            <span>${p.width} × ${p.height} px</span>
            <span>${dateStr}</span>
          </div>
          <div class="project-card-progress">
            <div class="progress-bar-track" style="height: 5px;">
              <div class="progress-bar-fill" style="width: ${pct}%;"></div>
            </div>
            <span style="font-size:11px;font-family:var(--font-mono);">${pct}%</span>
          </div>
          <div class="project-card-actions">
            <button class="btn btn-xs btn-ghost" data-action="duplicate" title="Duplicate Project">Copy</button>
            <button class="btn btn-xs btn-ghost" data-action="delete" title="Delete Project" style="color:var(--accent-danger);">Delete</button>
          </div>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.dataset.action) return;
        closeModal('modal-projects');
        openProject(p.id);
      });

      card.querySelector('[data-action="duplicate"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        await duplicateProject(p.id);
      });

      card.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete "${p.name}"?`)) {
          await deleteProject(p.id);
        }
      });

      dom.modalProjectsGrid.appendChild(card);
    });
  } catch (err) {
    dom.modalProjectsGrid.innerHTML = `<div style="color:var(--accent-danger);padding:20px;">${err.message}</div>`;
  }
}

async function duplicateProject(projectId) {
  try {
    const res = await apiFetch(`/api/projects/${projectId}/duplicate`, { method: 'POST' });
    if (!res.ok) throw new Error('Duplicate failed');
    const copy = await res.json();
    showToast(`Duplicated as "${copy.name}"`, 'success');
    openProjectsModal(); // refresh list
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteProject(projectId) {
  try {
    const res = await apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    showToast('Project deleted', 'info');

    if (state.currentProject?.id === projectId) {
      await loadInitialProject();
    }
    openProjectsModal(); // refresh list
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============================================================================
// New Project & Image Import
// ============================================================================

async function openNewProjectModal() {
  state.importData = null;
  state.importBgColor = '#ffffff';
  syncImportBackgroundUI();
  if (dom.newProjectName) dom.newProjectName.value = '';
  if (dom.fileInputImage) dom.fileInputImage.value = '';
  if (dom.imageImportPreviewBox) dom.imageImportPreviewBox.classList.add('hidden');
  if (dom.btnSubmitNewProject) dom.btnSubmitNewProject.disabled = true;
  if (dom.checkDownsample) dom.checkDownsample.checked = false;
  if (dom.selectDownsampleSize) dom.selectDownsampleSize.disabled = true;

  // Load starter templates
  await loadStarterTemplates();

  openModal('modal-new-project');
}

async function loadStarterTemplates() {
  if (!dom.starterTemplatesRow) return;
  dom.starterTemplatesRow.innerHTML = '';
  try {
    const res = await apiFetch('/api/samples');
    if (res.ok) {
      const data = await res.json();
      data.samples.forEach(sample => {
        const card = document.createElement('div');
        card.className = 'starter-card';
        card.innerHTML = `
          <img src="${sample.originalImage}" class="starter-thumb" alt="${sample.name}">
          <span class="starter-name">${sample.name}</span>
        `;
        card.addEventListener('click', () => {
          selectStarterTemplate(sample);
        });
        dom.starterTemplatesRow.appendChild(card);
      });
    }
  } catch (e) {
    console.error('Failed to load starter templates:', e);
  }
}

function selectStarterTemplate(sample) {
  if (dom.newProjectName) dom.newProjectName.value = sample.name;

  const img = new Image();
  img.onload = () => {
    state.importData = {
      name: sample.name,
      width: sample.width,
      height: sample.height,
      dataUrl: sample.originalImage,
      imgElement: img,
    };

    if (dom.checkDownsample) dom.checkDownsample.checked = false;
    if (dom.selectDownsampleSize) dom.selectDownsampleSize.disabled = true;

    updateImportPreview();
    if (dom.btnSubmitNewProject) dom.btnSubmitNewProject.disabled = false;
  };
  img.src = sample.originalImage;
}

function handleImportFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Please select a valid image file', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      const defaultName = file.name.replace(/\.[^/.]+$/, '');
      if (dom.newProjectName && !dom.newProjectName.value) {
        dom.newProjectName.value = defaultName;
      }

      state.importData = {
        name: defaultName,
        width: img.width,
        height: img.height,
        dataUrl,
        imgElement: img,
      };

      // If dimensions are large (> 64px), automatically suggest downsampling
      if (img.width > 64 || img.height > 64) {
        if (dom.checkDownsample) dom.checkDownsample.checked = true;
        if (dom.selectDownsampleSize) dom.selectDownsampleSize.disabled = false;
      } else {
        if (dom.checkDownsample) dom.checkDownsample.checked = false;
        if (dom.selectDownsampleSize) dom.selectDownsampleSize.disabled = true;
      }

      updateImportPreview();
      if (dom.btnSubmitNewProject) dom.btnSubmitNewProject.disabled = false;
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

function updateImportPreview() {
  if (!state.importData || !state.importData.imgElement) return;

  if (dom.imageImportPreviewBox) dom.imageImportPreviewBox.classList.remove('hidden');
  const canvas = dom.importPreviewCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let targetW = state.importData.width;
  let targetH = state.importData.height;

  if (dom.checkDownsample && dom.checkDownsample.checked && dom.selectDownsampleSize) {
    const targetDim = Number(dom.selectDownsampleSize.value);
    const aspect = state.importData.width / state.importData.height;
    if (aspect >= 1) {
      targetW = targetDim;
      targetH = Math.max(1, Math.round(targetDim / aspect));
    } else {
      targetH = targetDim;
      targetW = Math.max(1, Math.round(targetDim * aspect));
    }
  }

  canvas.width = targetW;
  canvas.height = targetH;
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(state.importData.imgElement, 0, 0, targetW, targetH);

  // Update canvas preview CSS background
  const bg = state.importBgColor || '#ffffff';
  canvas.style.backgroundColor = bg === 'transparent' ? 'transparent' : bg;

  if (dom.previewMetaDims) {
    dom.previewMetaDims.textContent = `${targetW} × ${targetH} px`;
  }
}

async function handleCreateNewProject() {
  if (!state.importData) {
    showToast('Please select or drop an image first', 'error');
    return;
  }

  const name = dom.newProjectName?.value.trim() || state.importData.name || 'Untitled Project';
  const canvas = dom.importPreviewCanvas;
  if (!canvas) return;
  const targetDataUrl = canvas.toDataURL('image/png');

  try {
    const payload = {
      name,
      width: canvas.width,
      height: canvas.height,
      originalImage: targetDataUrl,
      changedColors: {},
      completedPixels: [],
      completeStyle: {
        color: '#71717a',
        opacity: 0.7,
        mode: 'tint',
        hideCompleted: false,
      },
      backgroundColor: state.importBgColor || '#ffffff',
    };

    const res = await apiFetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Creation failed');

    const created = await res.json();
    closeModal('modal-new-project');
    setProject(created);
    fitToScreen();
    showToast(`Created project "${name}"`, 'success');
  } catch (err) {
    showToast(`Error creating project: ${err.message}`, 'error');
  }
}

// ============================================================================
// Export Engine (Edited, Progress, Printable Chart)
// ============================================================================

function openExportModal() {
  if (!state.currentProject) return;
  openModal('modal-export');
  renderExportPreview();
}

function renderExportPreview() {
  if (!state.currentProject) return;

  const canvas = dom.exportPreviewCanvas;
  const ctx = canvas.getContext('2d');
  const imgW = state.currentProject.width;
  const imgH = state.currentProject.height;
  const scale = state.exportScale;
  const changedColors = state.currentProject.changedColors || {};
  const completedSet = state.completedSet || new Set();
  const cs = state.currentProject.completeStyle || { color: '#10b981', opacity: 0.7, mode: 'tint' };

  if (state.exportType === 'pattern') {
    // Generate Printable Cross Stitch Chart with symbols & DMC legend
    renderCrossStitchChart(canvas, ctx);
    return;
  }

  // Standard Export (Edited or Completed)
  canvas.width = imgW * scale;
  canvas.height = imgH * scale;
  ctx.imageSmoothingEnabled = false;

  // Clear / Background
  const exportBg = state.currentProject.backgroundColor || '#ffffff';
  if (exportBg === 'transparent') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = exportBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Draw Pixels
  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const origHex = state.pixelMatrix[y]?.[x];
      if (!origHex) continue;

      const effectiveHex = changedColors[origHex] || origHex;
      ctx.fillStyle = effectiveHex;
      ctx.fillRect(x * scale, y * scale, scale, scale);

      // If exporting with completed marks
      if (state.exportType === 'completed' && completedSet.has(`${x},${y}`)) {
        ctx.save();
        ctx.globalAlpha = cs.opacity !== undefined ? cs.opacity : 0.7;

        if (cs.mode === 'tint' || cs.mode === 'solid') {
          ctx.fillStyle = cs.color;
          ctx.fillRect(x * scale, y * scale, scale, scale);
        } else if (cs.mode === 'cross') {
          ctx.strokeStyle = cs.color;
          ctx.lineWidth = Math.max(1.5, scale * 0.16);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x * scale + scale * 0.18, y * scale + scale * 0.18);
          ctx.lineTo(x * scale + scale * 0.82, y * scale + scale * 0.82);
          ctx.moveTo(x * scale + scale * 0.82, y * scale + scale * 0.18);
          ctx.lineTo(x * scale + scale * 0.18, y * scale + scale * 0.82);
          ctx.stroke();
        } else if (cs.mode === 'dot') {
          ctx.fillStyle = cs.color;
          ctx.beginPath();
          ctx.arc(x * scale + scale * 0.5, y * scale + scale * 0.5, scale * 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  // Optional Grid
  if (state.exportIncludeGrid && scale >= 4) {
    ctx.lineWidth = 1;
    for (let x = 0; x <= imgW; x++) {
      ctx.strokeStyle = (x % 5 === 0) ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.15)';
      ctx.beginPath();
      ctx.moveTo(x * scale, 0);
      ctx.lineTo(x * scale, imgH * scale);
      ctx.stroke();
    }
    for (let y = 0; y <= imgH; y++) {
      ctx.strokeStyle = (y % 5 === 0) ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.15)';
      ctx.beginPath();
      ctx.moveTo(0, y * scale);
      ctx.lineTo(imgW * scale, y * scale);
      ctx.stroke();
    }
  }
}

/**
 * Generates a clean printable Cross Stitch Chart with stitch symbols and legend table
 */
function renderCrossStitchChart(canvas, ctx) {
  const imgW = state.currentProject.width;
  const imgH = state.currentProject.height;

  const cellSize = 16;
  const gridW = imgW * cellSize;
  const gridH = imgH * cellSize;
  const margin = 40;
  const legendH = Math.max(120, state.palette.length * 24 + 40);

  canvas.width = gridW + margin * 2;
  canvas.height = gridH + margin * 2 + legendH;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Title
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(state.currentProject.name, margin, margin - 15);

  // Symbol Map for colors
  const symbols = ['●', '▲', '■', '✦', '◆', '✕', '✚', '★', '○', '△', '□', '◇', '✿', '✧', '♠', '♥'];
  const colorSymbols = {};
  state.palette.forEach((p, idx) => {
    colorSymbols[p.originalHex] = symbols[idx % symbols.length];
  });

  // Draw Chart Grid
  ctx.save();
  ctx.translate(margin, margin);

  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const origHex = state.pixelMatrix[y]?.[x];
      const px = x * cellSize;
      const py = y * cellSize;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px, py, cellSize, cellSize);

      if (origHex) {
        // Draw subtle color wash
        ctx.fillStyle = state.currentProject.changedColors[origHex] || origHex;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(px, py, cellSize, cellSize);
        ctx.globalAlpha = 1.0;

        // Draw symbol
        ctx.fillStyle = '#000000';
        ctx.font = `${Math.floor(cellSize * 0.65)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(colorSymbols[origHex] || '●', px + cellSize / 2, py + cellSize / 2);
      }
    }
  }

  // Grid lines
  for (let x = 0; x <= imgW; x++) {
    ctx.strokeStyle = (x % 5 === 0) ? '#000000' : '#cbd5e1';
    ctx.lineWidth = (x % 5 === 0) ? 1.5 : 0.8;
    ctx.beginPath();
    ctx.moveTo(x * cellSize, 0);
    ctx.lineTo(x * cellSize, gridH);
    ctx.stroke();
  }
  for (let y = 0; y <= imgH; y++) {
    ctx.strokeStyle = (y % 5 === 0) ? '#000000' : '#cbd5e1';
    ctx.lineWidth = (y % 5 === 0) ? 1.5 : 0.8;
    ctx.beginPath();
    ctx.moveTo(0, y * cellSize);
    ctx.lineTo(gridW, y * cellSize);
    ctx.stroke();
  }
  ctx.restore();

  // Draw Legend Table below grid
  const legendY = gridH + margin * 1.5;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('Color & Symbol Legend', margin, legendY);

  state.palette.forEach((p, idx) => {
    const colY = legendY + 20 + idx * 22;
    const symbol = colorSymbols[p.originalHex] || '●';
    const colorHex = p.currentHex;

    // Symbol Box
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(margin, colY - 14, 20, 20);
    ctx.strokeRect(margin, colY - 14, 20, 20);

    ctx.fillStyle = '#000000';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(symbol, margin + 10, colY);

    // Color Swatch
    ctx.fillStyle = colorHex;
    ctx.fillRect(margin + 28, colY - 14, 20, 20);
    ctx.strokeRect(margin + 28, colY - 14, 20, 20);

    // Color Details
    ctx.textAlign = 'left';
    ctx.fillStyle = '#334155';
    ctx.font = '12px monospace';
    const label = `${colorHex} • ${p.count} stitches ${p.isModified ? '(Replaced)' : ''}`;
    ctx.fillText(label, margin + 56, colY);
  });
}

function downloadExportedImage() {
  const canvas = dom.exportPreviewCanvas;
  const link = document.createElement('a');
  const safeName = (state.currentProject?.name || 'cross-stitch').replace(/[^a-z0-9_-]/gi, '_');
  link.download = `${safeName}-${state.exportType}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Image downloaded', 'success');
}

// ============================================================================
// Modal Utilities
// ============================================================================

function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('hidden');
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('hidden');
  }
}

// ============================================================================
// Toast Notifications
// ============================================================================

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  dom.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 2400);
}

// ============================================================================
// Detached Always-On-Top Window Engine (Electron & Browser PiP)
// ============================================================================

function getDetachedState() {
  if (!state.currentProject) return null;
  return {
    id: state.currentProject.id,
    name: state.currentProject.name,
    width: state.currentProject.width,
    height: state.currentProject.height,
    originalImage: state.currentProject.originalImage,
    changedColors: state.currentProject.changedColors || {},
    completedPixels: Array.from(state.completedSet || []),
    completeStyle: state.currentProject.completeStyle || {
      color: '#10b981',
      opacity: 0.7,
      mode: 'tint',
      hideCompleted: false,
    },
    backgroundColor: state.currentProject.backgroundColor || '#ffffff',
    activeTool: state.activeTool,
    filterColor: state.filterColor,
  };
}

function broadcastStateToDetached() {
  const ds = getDetachedState();
  if (!ds) return;

  // 1. Electron Desktop IPC
  if (window.electronAPI) {
    window.electronAPI.sendStateToDetached(ds);
  }

  // 2. Browser Document Picture-in-Picture
  if (state.pipWindow && !state.pipWindow.closed) {
    state.pipWindow.postMessage({ type: 'SYNC_STATE', payload: ds }, '*');
    if (typeof state.pipUpdateCanvas === 'function') {
      state.pipUpdateCanvas(ds);
    }
  }

  // 3. Browser Popup Window fallback
  if (state.popupWindow && !state.popupWindow.closed) {
    state.popupWindow.postMessage({ type: 'SYNC_STATE', payload: ds }, '*');
  }
}

function handleDetachedAction(action) {
  if (!action || action.type !== 'toggle_pixel') return;
  if (!state.currentProject) return;

  const key = action.key || `${action.x},${action.y}`;
  if (action.completed) {
    state.completedSet.add(key);
  } else {
    state.completedSet.delete(key);
  }

  syncCompletedPixelsState();
  rebuildPalette();
  updateProgressUI();
  renderCanvas();
  markUnsaved();
  broadcastStateToDetached();
}

async function openDetachedWindow() {
  if (!state.currentProject) {
    showToast('Open a project first before detaching', 'info');
    return;
  }

  const ds = getDetachedState();

  // Mode 1: Electron PC Desktop App (Native Always-on-Top BrowserWindow)
  if (window.electronAPI) {
    try {
      await window.electronAPI.openDetachedWindow(ds);
      dom.btnDetachCanvas?.classList.add('active');
      showToast('Image detached to Always-On-Top window', 'success');
      return;
    } catch (e) {
      console.warn('Electron detach failed, falling back:', e);
    }
  }

  // Mode 2: Modern Browser Document Picture-in-Picture API (Always-on-Top in Chrome/Edge!)
  if ('documentPictureInPicture' in window) {
    try {
      if (state.pipWindow && !state.pipWindow.closed) {
        state.pipWindow.focus();
        return;
      }

      const pip = await window.documentPictureInPicture.requestWindow({
        width: 480,
        height: 520,
      });
      state.pipWindow = pip;
      dom.btnDetachCanvas?.classList.add('active');

      setupBrowserPiPWindow(pip);
      showToast('Detached to Always-On-Top floating window', 'success');
      return;
    } catch (e) {
      console.warn('Document Picture-in-Picture error:', e);
    }
  }

  // Mode 3: Browser Popup Window fallback
  const w = 480;
  const h = 520;
  const left = window.screen.width - w - 40;
  const top = 100;
  state.popupWindow = window.open(
    '/detached.html',
    'AcrossStitchDetached',
    `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
  );
  dom.btnDetachCanvas?.classList.add('active');
  showToast('Detached into floating window', 'info');
}

function setupBrowserPiPWindow(pipWin) {
  // Copy styles
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((styleSheet) => {
    pipWin.document.head.appendChild(styleSheet.cloneNode(true));
  });

  const link = pipWin.document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/detached.css';
  pipWin.document.head.appendChild(link);

  pipWin.document.body.className = document.body.className || 'theme-dark';
  pipWin.document.body.innerHTML = `
    <div class="detached-container">
      <header class="detached-header">
        <div class="drag-region">
          <span class="app-icon">🧵</span>
          <span class="project-title" id="pip-project-title">${state.currentProject?.name || 'Detached View'}</span>
          <div class="tool-pill" id="pip-tool-pill">
            <span class="tool-dot" id="pip-tool-dot" style="background-color: ${state.currentProject?.completeStyle?.color || '#10b981'};"></span>
            <span class="tool-label" id="pip-tool-label">${capitalize(state.activeTool)}</span>
          </div>
        </div>
        <div class="window-controls no-drag">
          <button class="win-btn" id="pip-btn-toggle-bars" title="Hide Bars for Pure Canvas (Tab or H)">
            <svg class="icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 14 10 14 10 20"></polyline>
              <polyline points="20 10 14 10 14 4"></polyline>
              <line x1="14" y1="10" x2="21" y2="3"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </button>
          <button class="win-btn" id="pip-btn-grid" title="Toggle Grid Lines">
            <svg class="icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18"></path>
            </svg>
          </button>
          <button class="win-btn" id="pip-btn-fit" title="Fit to Window">
            <svg class="icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
          </button>
          <button class="win-btn close" id="pip-btn-close" title="Close">
            <svg class="icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </header>
      <main class="detached-viewport" id="pip-viewport">
        <canvas id="pip-canvas"></canvas>
        <button class="floating-show-bars-btn" id="pip-btn-show-bars" title="Show Bars (Tab or H)">
          <svg class="icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        </button>
      </main>
      <footer class="detached-footer">
        <div class="footer-left">
          <span class="stat-progress" id="pip-stat-progress">0%</span>
          <span class="stat-counts" id="pip-stat-counts">0 / 0</span>
        </div>
        <div class="footer-right">
          <span class="stat-coords" id="pip-stat-coords">--:--</span>
          <span class="stat-hint">R-Click: Pan | L-Click: Stitch</span>
        </div>
      </footer>
    </div>
  `;

  bindPiPCanvas(pipWin);

  pipWin.addEventListener('pagehide', () => {
    state.pipWindow = null;
    dom.btnDetachCanvas?.classList.remove('active');
  });
}

function bindPiPCanvas(pipWin) {
  const canvas = pipWin.document.getElementById('pip-canvas');
  const viewport = pipWin.document.getElementById('pip-viewport');
  const title = pipWin.document.getElementById('pip-project-title');
  const toolLabel = pipWin.document.getElementById('pip-tool-label');
  const toolDot = pipWin.document.getElementById('pip-tool-dot');
  const statProgress = pipWin.document.getElementById('pip-stat-progress');
  const statCounts = pipWin.document.getElementById('pip-stat-counts');
  const statCoords = pipWin.document.getElementById('pip-stat-coords');

  if (!canvas || !viewport) return;
  const ctx = canvas.getContext('2d');

  let pZoom = 16;
  let pPanX = 0;
  let pPanY = 0;
  let pIsPanning = false;
  let pIsDrawing = false;
  let pLastMouseX = 0;
  let pLastMouseY = 0;
  let pLastMarked = null;

  function resizePiPCanvas() {
    const rect = viewport.getBoundingClientRect();
    const dpr = pipWin.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  function fitPiP() {
    if (!state.currentProject) return;
    const rect = viewport.getBoundingClientRect();
    const pad = 24;
    const availW = Math.max(50, rect.width - pad * 2);
    const availH = Math.max(50, rect.height - pad * 2);
    pZoom = Math.max(1, Math.min(64, Math.min(availW / state.currentProject.width, availH / state.currentProject.height)));
    pPanX = 0;
    pPanY = 0;
    drawPiPCanvas();
  }

  function drawPiPCanvas() {
    if (!state.currentProject || !state.pixelMatrix.length) return;
    const rect = viewport.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.save();
    ctx.setTransform(pipWin.devicePixelRatio || 1, 0, 0, pipWin.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.translate(w / 2 + pPanX, h / 2 + pPanY);
    ctx.scale(pZoom, pZoom);

    const imgW = state.currentProject.width;
    const imgH = state.currentProject.height;
    const sX = -imgW / 2;
    const sY = -imgH / 2;

    // Background
    const bg = state.currentProject.backgroundColor || '#ffffff';
    if (bg === 'transparent') {
      drawCheckerboard(ctx, sX, sY, imgW, imgH);
    } else {
      ctx.fillStyle = bg;
      ctx.fillRect(sX, sY, imgW, imgH);
    }

    // Pixels
    const changedColors = state.currentProject.changedColors || {};
    const isFiltering = !!state.filterColor;
    const targetFilter = state.filterColor ? state.filterColor.toLowerCase() : null;

    for (let y = 0; y < imgH; y++) {
      for (let x = 0; x < imgW; x++) {
        const origHex = state.pixelMatrix[y]?.[x];
        if (!origHex) continue;

        const effectiveHex = changedColors[origHex] || origHex;
        const matches = !isFiltering || origHex.toLowerCase() === targetFilter;
        ctx.fillStyle = effectiveHex;
        ctx.globalAlpha = matches ? 1.0 : 0.18;
        ctx.fillRect(sX + x, sY + y, 1, 1);
      }
    }

    // Completed marks
    const cs = state.currentProject.completeStyle || { color: '#10b981', opacity: 0.7, mode: 'tint' };
    if (!cs.hideCompleted && state.completedSet.size > 0) {
      for (const key of state.completedSet) {
        const parts = key.split(',');
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (!state.pixelMatrix[y]?.[x]) continue;

        const pixelX = sX + x;
        const pixelY = sY + y;

        ctx.save();
        ctx.globalAlpha = cs.opacity !== undefined ? cs.opacity : 0.7;
        ctx.fillStyle = cs.color;
        if (cs.mode === 'tint' || cs.mode === 'solid') {
          ctx.fillRect(pixelX, pixelY, 1, 1);
        } else if (cs.mode === 'cross') {
          ctx.strokeStyle = cs.color;
          ctx.lineWidth = 0.16;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(pixelX + 0.18, pixelY + 0.18);
          ctx.lineTo(pixelX + 0.82, pixelY + 0.82);
          ctx.moveTo(pixelX + 0.82, pixelY + 0.18);
          ctx.lineTo(pixelX + 0.18, pixelY + 0.82);
          ctx.stroke();
        } else if (cs.mode === 'dot') {
          ctx.beginPath();
          ctx.arc(pixelX + 0.5, pixelY + 0.5, 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Grid lines
    if (state.showGrid && pZoom >= 4) {
      ctx.lineWidth = 1 / pZoom;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      for (let x = 0; x <= imgW; x++) {
        ctx.moveTo(sX + x, sY);
        ctx.lineTo(sX + x, sY + imgH);
      }
      for (let y = 0; y <= imgH; y++) {
        ctx.moveTo(sX, sY + y);
        ctx.lineTo(sX + imgW, sY + y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function piPScreenToPixel(sx, sy) {
    if (!state.currentProject) return null;
    const rect = viewport.getBoundingClientRect();
    const cx = sx - rect.left;
    const cy = sy - rect.top;
    const wx = (cx - (rect.width / 2 + pPanX)) / pZoom;
    const wy = (cy - (rect.height / 2 + pPanY)) / pZoom;
    const px = Math.floor(wx + state.currentProject.width / 2);
    const py = Math.floor(wy + state.currentProject.height / 2);
    if (px >= 0 && px < state.currentProject.width && py >= 0 && py < state.currentProject.height) {
      return { x: px, y: py };
    }
    return null;
  }

  function applyPiPStitch(px, py) {
    if (!state.currentProject || !state.pixelMatrix.length) return;
    const origHex = state.pixelMatrix[py]?.[px];
    if (!origHex) return;
    if (state.filterColor && origHex.toLowerCase() !== state.filterColor.toLowerCase()) return;

    const key = `${px},${py}`;
    const shouldComplete = state.activeTool !== 'erase';
    handleDetachedAction({ type: 'toggle_pixel', x: px, y: py, key, completed: shouldComplete });
    drawPiPCanvas();
  }

  // Prevent right-click context menu so right-click can pan
  viewport.addEventListener('contextmenu', (e) => e.preventDefault());
  pipWin.addEventListener('contextmenu', (e) => e.preventDefault());

  // Pointer events on PiP
  viewport.addEventListener('pointerdown', (e) => {
    // Right click (2), Middle click (1), or pan tool = Pan
    if (e.button === 2 || e.button === 1 || state.activeTool === 'pan') {
      pIsPanning = true;
      pIsDrawing = false;
      pLastMouseX = e.clientX;
      pLastMouseY = e.clientY;
      viewport.style.cursor = 'grabbing';
      return;
    }
    if (e.button === 0) {
      const p = piPScreenToPixel(e.clientX, e.clientY);
      if (p) {
        pIsDrawing = true;
        pIsPanning = false;
        pLastMarked = p;
        applyPiPStitch(p.x, p.y);
      } else {
        pIsPanning = true;
        pIsDrawing = false;
        pLastMouseX = e.clientX;
        pLastMouseY = e.clientY;
        viewport.style.cursor = 'grabbing';
      }
    }
  });

  pipWin.addEventListener('pointermove', (e) => {
    if (pIsPanning) {
      pPanX += e.clientX - pLastMouseX;
      pPanY += e.clientY - pLastMouseY;
      pLastMouseX = e.clientX;
      pLastMouseY = e.clientY;
      drawPiPCanvas();
      return;
    }
    const p = piPScreenToPixel(e.clientX, e.clientY);
    if (p) {
      if (statCoords) statCoords.textContent = `${p.x}, ${p.y}`;
      if (pIsDrawing && (!pLastMarked || pLastMarked.x !== p.x || pLastMarked.y !== p.y)) {
        applyPiPStitch(p.x, p.y);
        pLastMarked = p;
      }
    }
  });

  const stopPiP = () => {
    pIsPanning = false;
    pIsDrawing = false;
    pLastMarked = null;
    viewport.style.cursor = 'crosshair';
  };
  pipWin.addEventListener('pointerup', stopPiP);
  pipWin.addEventListener('pointercancel', stopPiP);

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.2 : 0.833;
    pZoom = Math.max(1, Math.min(64, pZoom * factor));
    drawPiPCanvas();
  }, { passive: false });

  // Bars toggle in PiP
  const pipContainer = pipWin.document.querySelector('.detached-container');
  const togglePiPBars = () => {
    pipContainer?.classList.toggle('bars-hidden');
    setTimeout(() => {
      resizePiPCanvas();
      drawPiPCanvas();
    }, 10);
  };
  pipWin.document.getElementById('pip-btn-toggle-bars')?.addEventListener('click', togglePiPBars);
  pipWin.document.getElementById('pip-btn-show-bars')?.addEventListener('click', togglePiPBars);

  pipWin.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      togglePiPBars();
    } else if (e.key === 'f' || e.key === 'F') {
      fitPiP();
    }
  });

  pipWin.document.getElementById('pip-btn-fit')?.addEventListener('click', fitPiP);
  pipWin.document.getElementById('pip-btn-grid')?.addEventListener('click', () => {
    state.showGrid = !state.showGrid;
    drawPiPCanvas();
  });
  pipWin.document.getElementById('pip-btn-close')?.addEventListener('click', () => pipWin.close());

  // Function called on main window state changes
  state.pipUpdateCanvas = (ds) => {
    if (title) title.textContent = ds.name || 'Detached View';
    if (toolLabel) toolLabel.textContent = capitalize(ds.activeTool);
    if (toolDot) toolDot.style.backgroundColor = ds.completeStyle.color;
    if (statProgress && state.currentProject) {
      const tot = state.currentProject.width * state.currentProject.height;
      const done = state.completedSet.size;
      statProgress.textContent = `${tot > 0 ? Math.round((done / tot) * 100) : 0}%`;
      statCounts.textContent = `${done} / ${tot}`;
    }
    drawPiPCanvas();
  };

  resizePiPCanvas();
  pipWin.addEventListener('resize', () => {
    resizePiPCanvas();
    drawPiPCanvas();
  });
  fitPiP();
}

