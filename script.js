(function () {
  const landing = document.getElementById('landing');
  const app = document.getElementById('app');
  const startBtn = document.getElementById('startBtn');
  const backBtn = document.getElementById('backBtn');
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  const stage = document.getElementById('stage');
  const controlRow = document.getElementById('controlRow');
  const video = document.getElementById('video');
  const canvas = document.getElementById('output');
  const ctx = canvas.getContext('2d');
  const colorToolbar = document.getElementById('colorToolbar');
  const actionToolbar = document.getElementById('actionToolbar');
  const brushToolbar = document.getElementById('brushToolbar');
  const bgToolbar = document.getElementById('bgToolbar');
  const sidePanel = document.getElementById('sidePanel');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  const customColorBtn = document.getElementById('customColorBtn');
  const colorInput = document.getElementById('colorInput');
  const mirrorBtn = document.getElementById('mirrorBtn');
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toastText');
  const toastAction = document.getElementById('toastAction');

  const inkCanvas = document.createElement('canvas');
  const inkCtx = inkCanvas.getContext('2d');

  const INTERNAL_W = 1280, INTERNAL_H = 960;
  canvas.width = INTERNAL_W; canvas.height = INTERNAL_H;
  inkCanvas.width = INTERNAL_W; inkCanvas.height = INTERNAL_H;

  const PEN_SIZES = { S: 3.5, M: 7, L: 13 };
  const ERASER_SIZES = { S: 20, M: 34, L: 52 };

  let currentColor = '#ffffff';
  let currentTool = 'pen';
  let currentSize = 'M';
  let mirrorMode = false;
  let currentBackground = 'camera';
  let bgPatternCache = { key: null, canvas: null };
  let strokes = [];
  let redoStack = [];
  let currentStroke = null;
  let lastMoveTime = null;
  let lastDrawFrameTime = 0;
  let smoothedSpeed = 0;
  let camera = null;
  let mouseDrawing = false;
  let appOpen = false;
  let cursorTrail = [];

  function OneEuroFilter(mincutoff, beta) {
    this.mincutoff = mincutoff; this.beta = beta; this.dcutoff = 1.0;
    this.xPrev = null; this.dxPrev = 0; this.tPrev = null;
  }
  OneEuroFilter.prototype.alpha = function (cutoff, dt) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  };
  OneEuroFilter.prototype.filter = function (x, t) {
    if (this.tPrev === null) { this.xPrev = x; this.dxPrev = 0; this.tPrev = t; return x; }
    let dt = (t - this.tPrev) / 1000;
    if (dt <= 0) dt = 1 / 30;
    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dcutoff, dt);
    const edx = this.dxPrev + aD * (dx - this.dxPrev);
    this.dxPrev = edx;
    const cutoff = this.mincutoff + this.beta * Math.abs(edx);
    const a = this.alpha(cutoff, dt);
    const filtered = this.xPrev + a * (x - this.xPrev);
    this.xPrev = filtered; this.tPrev = t;
    return filtered;
  };
  OneEuroFilter.prototype.reset = function () { this.xPrev = null; this.dxPrev = 0; this.tPrev = null; };

  const filterX = new OneEuroFilter(0.35, 0.7);
  const filterY = new OneEuroFilter(0.35, 0.7);

  let toastTimer = null;
  function showToast(msg, actionLabel, actionFn, autoHideMs) {
    toastText.textContent = msg;
    if (actionLabel) { toastAction.textContent = actionLabel; toastAction.style.display = 'inline'; toastAction.onclick = () => { hideToast(); if (actionFn) actionFn(); }; }
    else { toastAction.style.display = 'none'; }
    toast.classList.add('show');
    clearTimeout(toastTimer);
    if (autoHideMs) toastTimer = setTimeout(hideToast, autoHideMs);
  }
  function hideToast() { toast.classList.remove('show'); }

  function setActiveColorButton(btn) {
    colorToolbar.querySelectorAll('.tool-btn[data-color]').forEach(b => b.classList.remove('active'));
    customColorBtn.classList.remove('active');
    if (btn) btn.classList.add('active');
  }
  function setActiveSizeButton(btn) {
    brushToolbar.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  function setActiveEraser(on) {
    const eraserBtn = brushToolbar.querySelector('[data-tool="eraser"]');
    eraserBtn.classList.toggle('active', on);
    if (on) setActiveColorButton(null);
  }

  function selectColor(hex, btn) {
    currentColor = hex;
    currentTool = 'pen';
    setActiveEraser(false);
    setActiveColorButton(btn || null);
  }

  function toggleMirror() {
    mirrorMode = !mirrorMode;
    mirrorBtn.classList.toggle('active', mirrorMode);
    showToast(mirrorMode ? 'Mirror symmetry on' : 'Mirror symmetry off', null, null, 1400);
  }

  function setActiveBg(btn) {
    bgToolbar.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  function selectBackground(key, btn) {
    currentBackground = key;
    if (btn) setActiveBg(btn);
    else { const match = bgToolbar.querySelector('[data-bg="' + key + '"]'); if (match) setActiveBg(match); }
    persistBackground();
  }

  function getBgPattern(key) {
    if (bgPatternCache.key === key && bgPatternCache.canvas) return bgPatternCache.canvas;
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    const pctx = c.getContext('2d');
    pctx.fillStyle = '#101219';
    pctx.fillRect(0, 0, c.width, c.height);
    if (key === 'grid') {
      pctx.strokeStyle = 'rgba(255,255,255,0.12)';
      pctx.lineWidth = 1;
      const step = 44;
      for (let x = 0; x <= c.width; x += step) { pctx.beginPath(); pctx.moveTo(x + 0.5, 0); pctx.lineTo(x + 0.5, c.height); pctx.stroke(); }
      for (let y = 0; y <= c.height; y += step) { pctx.beginPath(); pctx.moveTo(0, y + 0.5); pctx.lineTo(c.width, y + 0.5); pctx.stroke(); }
    } else if (key === 'dots') {
      pctx.fillStyle = 'rgba(255,255,255,0.22)';
      const step = 36;
      for (let x = step / 2; x < c.width; x += step) {
        for (let y = step / 2; y < c.height; y += step) {
          pctx.beginPath(); pctx.arc(x, y, 1.8, 0, Math.PI * 2); pctx.fill();
        }
      }
    }
    bgPatternCache = { key, canvas: c };
    return c;
  }

  function drawBackground(targetCtx, videoImage) {
    if (currentBackground === 'camera') {
      targetCtx.save();
      targetCtx.translate(canvas.width, 0);
      targetCtx.scale(-1, 1);
      if (videoImage) targetCtx.drawImage(videoImage, 0, 0, canvas.width, canvas.height);
      targetCtx.restore();
      return;
    }
    if (currentBackground === 'black' || currentBackground === 'white') {
      targetCtx.fillStyle = currentBackground === 'black' ? '#0a0a0f' : '#f7f5ef';
      targetCtx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    targetCtx.drawImage(getBgPattern(currentBackground), 0, 0);
  }

  function selectFromButton(btn) {
    if (btn.id === 'customColorBtn') {
      showToast('Tap the rainbow swatch with your mouse to pick a custom color', null, null, 2200);
      return;
    }
    if (btn.dataset.color) {
      selectColor(btn.dataset.color, btn);
    } else if (btn.dataset.tool === 'eraser') {
      currentTool = 'eraser';
      setActiveEraser(true);
    } else if (btn.dataset.size) {
      currentSize = btn.dataset.size;
      setActiveSizeButton(btn);
    } else if (btn.dataset.action === 'undo') {
      undo();
    } else if (btn.dataset.action === 'redo') {
      redo();
    } else if (btn.dataset.action === 'clear') {
      clearCanvas();
    } else if (btn.dataset.action === 'save') {
      saveDrawing();
    } else if (btn.dataset.action === 'mirror') {
      toggleMirror();
    } else if (btn.dataset.bg) {
      selectBackground(btn.dataset.bg, btn);
    }
  }

  document.querySelectorAll('#colorToolbar .tool-btn[data-color], #brushToolbar .tool-btn, #actionToolbar .tool-btn, #bgToolbar .tool-btn').forEach(btn => {
    btn.addEventListener('click', () => selectFromButton(btn));
  });
  customColorBtn.addEventListener('click', () => colorInput.click());
  colorInput.addEventListener('input', () => selectColor(colorInput.value, null));
  mirrorBtn.addEventListener('click', () => toggleMirror());

  function undo() {
    if (strokes.length === 0) return;
    redoStack.push(strokes.pop());
    redrawInk();
    persistStrokes();
  }
  function redo() {
    if (redoStack.length === 0) return;
    strokes.push(redoStack.pop());
    redrawInk();
    persistStrokes();
  }

  function clearCanvas() {
    strokes = [];
    redoStack = [];
    currentStroke = null;
    inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
    persistStrokes();
  }

  function saveDrawing() {
    const out = document.createElement('canvas');
    out.width = inkCanvas.width; out.height = inkCanvas.height;
    const octx = out.getContext('2d');
    if (currentBackground === 'white') {
      octx.fillStyle = '#f7f5ef';
      octx.fillRect(0, 0, out.width, out.height);
    } else if (currentBackground === 'grid' || currentBackground === 'dots') {
      octx.drawImage(getBgPattern(currentBackground), 0, 0);
    } else {
      octx.fillStyle = '#0a0a10';
      octx.fillRect(0, 0, out.width, out.height);
    }
    octx.drawImage(inkCanvas, 0, 0);
    const link = document.createElement('a');
    link.download = 'air-notepad-drawing.png';
    link.href = out.toDataURL('image/png');
    link.click();
    showToast('Drawing saved as PNG', null, null, 1600);
  }

  function midPoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  function strokeSegment(targetCtx, color, tool, p0, p1, p2) {
    targetCtx.save();
    targetCtx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    targetCtx.strokeStyle = color;
    targetCtx.lineWidth = p1.w;
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    const start = midPoint(p0, p1);
    const end = midPoint(p1, p2);
    targetCtx.beginPath();
    targetCtx.moveTo(start.x, start.y);
    targetCtx.quadraticCurveTo(p1.x, p1.y, end.x, end.y);
    targetCtx.stroke();
    targetCtx.restore();
  }

  function drawDot(targetCtx, color, tool, p) {
    targetCtx.save();
    targetCtx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    targetCtx.fillStyle = color;
    targetCtx.beginPath();
    targetCtx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.restore();
  }

  function redrawInk() {
    inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
    strokes.forEach(stroke => {
      renderPointsArray(inkCtx, stroke.points, stroke.color, stroke.tool);
      if (stroke.mpoints) renderPointsArray(inkCtx, stroke.mpoints, stroke.color, stroke.tool);
    });
  }

  function renderPointsArray(targetCtx, pts, color, tool) {
    if (!pts || pts.length === 0) return;
    if (pts.length === 1) { drawDot(targetCtx, color, tool, pts[0]); return; }
    if (pts.length === 2) {
      targetCtx.save();
      targetCtx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      targetCtx.strokeStyle = color; targetCtx.lineWidth = pts[1].w;
      targetCtx.lineCap = 'round'; targetCtx.lineJoin = 'round';
      targetCtx.beginPath(); targetCtx.moveTo(pts[0].x, pts[0].y); targetCtx.lineTo(pts[1].x, pts[1].y); targetCtx.stroke();
      targetCtx.restore();
      return;
    }
    for (let i = 1; i < pts.length - 1; i++) {
      strokeSegment(targetCtx, color, tool, pts[i - 1], pts[i], pts[i + 1]);
    }
  }

  const BASE_MOVE_INTERP_PX = 26;

  function widthForSpeed(speedPxPerMs, baseWidth) {
    const w = baseWidth * 1.35 - speedPxPerMs * 9;
    return Math.max(baseWidth * 0.45, Math.min(baseWidth * 1.35, w));
  }

  function newStroke(tool, color, withMirror) {
    return { tool, color, points: [], mpoints: withMirror ? [] : null };
  }

  function pushToPath(pts, color, tool, x, y, w, targetCtx) {
    pts.push({ x, y, w });
    if (pts.length === 1) { drawDot(targetCtx, color, tool, pts[0]); return; }
    if (pts.length === 2) {
      targetCtx.save();
      targetCtx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      targetCtx.strokeStyle = color; targetCtx.lineWidth = pts[1].w;
      targetCtx.lineCap = 'round'; targetCtx.lineJoin = 'round';
      targetCtx.beginPath(); targetCtx.moveTo(pts[0].x, pts[0].y); targetCtx.lineTo(pts[1].x, pts[1].y); targetCtx.stroke();
      targetCtx.restore();
      return;
    }
    const n = pts.length;
    strokeSegment(targetCtx, color, tool, pts[n - 3], pts[n - 2], pts[n - 1]);
  }

  function addRawPoint(x, y, timestamp) {
    const baseWidth = (currentTool === 'eraser' ? ERASER_SIZES : PEN_SIZES)[currentSize];
    let rawSpeed = 0;
    if (lastMoveTime !== null && currentStroke && currentStroke.points.length) {
      const last = currentStroke.points[currentStroke.points.length - 1];
      const dt = Math.max(1, timestamp - lastMoveTime);
      const dist = Math.hypot(x - last.x, y - last.y);
      rawSpeed = dist / dt;
      // Smooth the speed itself (not just the position) — otherwise the stroke's
      // width flickers thick/thin frame to frame even when the centerline is smooth.
      smoothedSpeed = smoothedSpeed + (rawSpeed - smoothedSpeed) * 0.35;
      if (dist > BASE_MOVE_INTERP_PX) {
        const steps = Math.min(8, Math.ceil(dist / BASE_MOVE_INTERP_PX));
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const ix = last.x + (x - last.x) * t;
          const iy = last.y + (y - last.y) * t;
          const w = widthForSpeed(smoothedSpeed, baseWidth);
          pushToPath(currentStroke.points, currentStroke.color, currentStroke.tool, ix, iy, w, inkCtx);
          if (currentStroke.mpoints) pushToPath(currentStroke.mpoints, currentStroke.color, currentStroke.tool, inkCanvas.width - ix, iy, w, inkCtx);
        }
      }
    } else {
      smoothedSpeed = 0;
    }
    lastMoveTime = timestamp;
    const w = widthForSpeed(smoothedSpeed, baseWidth);
    if (!currentStroke) currentStroke = newStroke(currentTool, currentColor, mirrorMode);
    pushToPath(currentStroke.points, currentStroke.color, currentStroke.tool, x, y, w, inkCtx);
    if (currentStroke.mpoints) pushToPath(currentStroke.mpoints, currentStroke.color, currentStroke.tool, inkCanvas.width - x, y, w, inkCtx);
  }

  function endStroke() {
    if (currentStroke && currentStroke.points.length) {
      strokes.push(currentStroke);
      redoStack = [];
      persistStrokes();
    }
    currentStroke = null;
    lastMoveTime = null;
    smoothedSpeed = 0;
    filterX.reset(); filterY.reset();
  }

  const STORAGE_KEY = 'air-notepad-strokes-v1';
  const BG_STORAGE_KEY = 'air-notepad-bg-v1';
  let saveTimer = null;

  function persistBackground() {
    try { localStorage.setItem(BG_STORAGE_KEY, currentBackground); } catch (e) { }
  }
  function loadPersistedBackground() {
    try {
      const saved = localStorage.getItem(BG_STORAGE_KEY);
      if (saved && ['camera', 'black', 'white', 'grid', 'dots'].includes(saved)) {
        selectBackground(saved);
      }
    } catch (e) { }
  }
  function persistStrokes() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        if (strokes.length === 0) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, JSON.stringify(strokes));
      } catch (e) { }
    }, 400);
  }
  let pendingRestoreToast = false;
  function loadPersistedStrokes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        strokes = parsed;
        redrawInk();
        pendingRestoreToast = true;
      }
    } catch (e) { }
  }
  function announceRestoreIfNeeded() {
    if (!pendingRestoreToast) return;
    pendingRestoreToast = false;
    showToast('Restored your last drawing', 'Discard', () => { clearCanvas(); }, 5000);
  }

  function canvasPointFromEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    const x = ((clientX - rect.left) / rect.width) * inkCanvas.width;
    const y = ((clientY - rect.top) / rect.height) * inkCanvas.height;
    return { x, y };
  }

  canvas.addEventListener('pointerdown', (e) => {
    mouseDrawing = true;
    const p = canvasPointFromEvent(e);
    addRawPoint(p.x, p.y, performance.now());
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!mouseDrawing) return;
    const p = canvasPointFromEvent(e);
    addRawPoint(p.x, p.y, performance.now());
  });
  window.addEventListener('pointerup', () => {
    if (mouseDrawing) { mouseDrawing = false; endStroke(); }
  });

  window.addEventListener('keydown', (e) => {
    if (!appOpen) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveDrawing(); return; }
    if (e.key === '[') { cycleSize(-1); return; }
    if (e.key === ']') { cycleSize(1); return; }
    if (e.key.toLowerCase() === 'e') { currentTool = 'eraser'; setActiveEraser(true); return; }
    if (e.key.toLowerCase() === 'c' && !mod) { clearCanvas(); return; }
    if (e.key.toLowerCase() === 'm') { mirrorBtn.click(); return; }
    if (e.key.toLowerCase() === 'b') { cycleBackground(); return; }
    const idx = parseInt(e.key, 10);
    const colorBtns = [...colorToolbar.querySelectorAll('[data-color]')];
    if (idx >= 1 && idx <= colorBtns.length) { colorBtns[idx - 1].click(); }
  });

  function cycleSize(dir) {
    const order = ['S', 'M', 'L'];
    let i = order.indexOf(currentSize);
    i = Math.max(0, Math.min(order.length - 1, i + dir));
    currentSize = order[i];
    setActiveSizeButton(brushToolbar.querySelector('[data-size="' + currentSize + '"]'));
  }

  function cycleBackground() {
    const order = ['camera', 'black', 'white', 'grid', 'dots'];
    const i = (order.indexOf(currentBackground) + 1) % order.length;
    selectBackground(order[i]);
  }

  // Hysteresis on finger-up detection: without it, a finger sitting right on the
  // threshold flickers between "up"/"down" every frame from tracking noise alone,
  // which was the main cause of choppy strokes — each flicker into "select" pose
  // (index+middle) would immediately cut the current stroke. Requiring a bigger gap
  // to register as newly "up" than to drop back to "down" removes that flicker.
  const fingerHyst = { index: false, middle: false, ring: false, pinky: false };
  function fingerUp(name, landmarks, tipIdx, pipIdx) {
    const gap = landmarks[pipIdx].y - landmarks[tipIdx].y;
    if (fingerHyst[name]) {
      if (gap < 0.012) fingerHyst[name] = false;
    } else {
      if (gap > 0.045) fingerHyst[name] = true;
    }
    return fingerHyst[name];
  }

  let hoverBtn = null, hoverStart = 0, hoverLocked = false;
  const DWELL_MS = 650;

  function updateStatus(mode) {
    statusPill.classList.remove('tracking', 'selecting', 'error');
    if (mode === 'draw') { statusText.textContent = 'Drawing'; statusPill.classList.add('tracking'); }
    else if (mode === 'select') { statusText.textContent = 'Selecting tool'; statusPill.classList.add('selecting'); }
    else if (mode === 'idle-hand') { statusText.textContent = 'Pen up'; }
    else if (mode === 'searching') { statusText.textContent = 'Looking for your hand…'; }
    else if (mode === 'error') { statusText.textContent = 'Hand tracking unavailable'; statusPill.classList.add('error'); }
  }

  function allToolButtons() {
    return [...colorToolbar.querySelectorAll('.tool-btn'), ...brushToolbar.querySelectorAll('.tool-btn'), ...actionToolbar.querySelectorAll('.tool-btn'), ...bgToolbar.querySelectorAll('.tool-btn')];
  }

  function clearHoverStates() {
    hoverBtn = null;
    hoverLocked = false;
    allToolButtons().forEach(b => { b.classList.remove('hovering'); b.style.setProperty('--progress', 0); });
  }

  function handleSelectMode(pageX, pageY) {
    endStroke();
    let found = null;
    allToolButtons().forEach(btn => {
      const r = btn.getBoundingClientRect();
      const within = pageX >= r.left - 6 && pageX <= r.right + 6 && pageY >= r.top - 6 && pageY <= r.bottom + 6;
      if (within) found = btn;
      if (btn !== found) { btn.classList.remove('hovering'); btn.style.setProperty('--progress', 0); }
    });

    if (found) {
      found.classList.add('hovering');
      if (hoverBtn !== found) { hoverBtn = found; hoverStart = performance.now(); hoverLocked = false; }
      const elapsed = performance.now() - hoverStart;
      const pct = hoverLocked ? 100 : Math.min(100, (elapsed / DWELL_MS) * 100);
      found.style.setProperty('--progress', pct);
      if (!hoverLocked && elapsed > DWELL_MS) {
        hoverLocked = true;
        selectFromButton(found);
      }
    } else {
      clearHoverStates();
    }
  }

  function onResults(results) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(ctx, results.image);
    ctx.drawImage(inkCanvas, 0, 0);

    const stageRect = stage.getBoundingClientRect();
    const landmarksList = results.multiHandLandmarks;
    const now = performance.now();

    if (!landmarksList || landmarksList.length === 0) {
      updateStatus('searching');
      sidePanel.classList.remove('active-select');
      endStroke();
      clearHoverStates();
      cursorTrail = [];
      fingerHyst.index = fingerHyst.middle = fingerHyst.ring = fingerHyst.pinky = false;
      lastDrawFrameTime = 0;
      return;
    }

    const lm = landmarksList[0];
    const indexUp = fingerUp('index', lm, 8, 6);
    const middleUp = fingerUp('middle', lm, 12, 10);
    const ringUp = fingerUp('ring', lm, 16, 14);
    const pinkyUp = fingerUp('pinky', lm, 20, 18);

    const rawX = (1 - lm[8].x) * inkCanvas.width;
    const rawY = lm[8].y * inkCanvas.height;
    const smoothX = filterX.filter(rawX, now);
    const smoothY = filterY.filter(rawY, now);
    const pageX = stageRect.left + (smoothX / inkCanvas.width) * stageRect.width;
    const pageY = stageRect.top + (smoothY / inkCanvas.height) * stageRect.height;

    if (indexUp && middleUp) {
      updateStatus('select');
      sidePanel.classList.add('active-select');
      handleSelectMode(pageX, pageY);
      cursorTrail = [];
    } else if (indexUp && !ringUp && !pinkyUp) {
      updateStatus('draw');
      sidePanel.classList.remove('active-select');
      clearHoverStates();
      addRawPoint(smoothX, smoothY, now);
      cursorTrail.push({ x: smoothX, y: smoothY, t: now });
      lastDrawFrameTime = now;
    } else {
      updateStatus('idle-hand');
      sidePanel.classList.remove('active-select');
      // A single misread frame (finger tracking briefly flickering) shouldn't cut the
      // stroke in half — only actually lift the pen once we've been out of the drawing
      // pose for a bit. If the draw pose comes back within that window, addRawPoint's
      // own gap-interpolation smoothly bridges the missed frames.
      if (now - lastDrawFrameTime > 120) {
        endStroke();
        cursorTrail = [];
      }
    }

    cursorTrail = cursorTrail.filter(p => now - p.t < 220);
    ctx.save();
    for (let i = 0; i < cursorTrail.length; i++) {
      const p = cursorTrail[i];
      const age = (now - p.t) / 220;
      ctx.globalAlpha = (1 - age) * 0.35;
      ctx.fillStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.shadowColor = currentTool === 'eraser' ? 'rgba(255,255,255,0.9)' : currentColor;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(smoothX, smoothY, 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  async function startHandTracking() {
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });
    hands.onResults(onResults);

    camera = new Camera(video, {
      onFrame: async () => { await hands.send({ image: video }); },
      width: INTERNAL_W,
      height: INTERNAL_H,
    });

    await camera.start();
    loadingOverlay.style.display = 'none';
    announceRestoreIfNeeded();
  }

  async function openApp() {
    landing.style.display = 'none';
    app.style.display = 'flex';
    appOpen = true;
    loadingOverlay.style.display = 'flex';
    loadingText.textContent = 'Starting camera…';
    updateStatus('searching');
    try {
      await startHandTracking();
    } catch (err) {
      console.error(err);
      loadingText.textContent = 'Camera or hand tracking unavailable — you can still draw with your mouse or finger.';
      updateStatus('error');
      setTimeout(() => { loadingOverlay.style.display = 'none'; announceRestoreIfNeeded(); }, 2200);
    }
  }

  startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    startBtn.textContent = 'Starting…';
    openApp().finally(() => {
      startBtn.disabled = false;
      startBtn.textContent = '📷 Open Camera';
    });
  });

  backBtn.addEventListener('click', () => {
    if (camera) { try { camera.stop(); } catch (e) {} }
    app.style.display = 'none';
    appOpen = false;
    landing.style.display = 'flex';
  });

  loadPersistedStrokes();
  loadPersistedBackground();
})();
