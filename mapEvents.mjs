// Event wiring for map.html canvas interactions
// Exports initMapEvents which sets up mouse, touch, wheel, resize, and keyboard/button handlers

export function initMapEvents({
  canvas,
  windowObj,
  documentObj,
  vw,
  resize,
  draw,
  hoverAt,
  hitTest,
  fitView,
  exportPNG,
  exportRoads,
  cancelAnim,
  STATE,
  BEHAVIOR,
  showSiteDetails,
  hideSiteDetails,
  showLocationSites,
  // Optional: clamp viewport to content bounds
  clampViewport,
}) {
  // Local drag state
  let dragging = false;
  const last = { x: 0, y: 0 };

  // Mouse: pan + hover
  canvas.addEventListener("mousedown", (e) => {
    cancelAnim();
    dragging = true;
    last.x = e.clientX;
    last.y = e.clientY;
  });
  windowObj.addEventListener("mouseup", () => (dragging = false));
  windowObj.addEventListener("mousemove", (e) => {
    if (dragging) {
      vw.x += e.clientX - last.x;
      vw.y += e.clientY - last.y;
      last.x = e.clientX;
      last.y = e.clientY;
  // Keep viewport within bounds while panning
  clampViewport?.();
      draw();
    }
    hoverAt(e.clientX, e.clientY);
  });

  // Click/tap unified handler
  function handleTap(clientX, clientY) {
    const h = hitTest(clientX, clientY);
    if (h && h.type === "loc") {
  // Open the grouped-by-zone site list instead of expanding circles
  STATE.expandedLocId = h.data.id;
  showLocationSites?.(h.data);
    }
    if (h && h.type === "site") {
      showSiteDetails?.(h.data);
    }
    STATE.pinned = h || null;
    hoverAt(clientX, clientY);
  }
  canvas.addEventListener("click", (e) => handleTap(e.clientX, e.clientY));

  // Touch gestures: pan and pinch-zoom with tap detection
  let touchState = null; // { mode: 'pan'|'pinch', lastX, lastY, moved, cx, cy, d, wx, wy, startK }
  function distance(a, b) {
    const dx = b.clientX - a.clientX, dy = b.clientY - a.clientY; return Math.hypot(dx, dy);
  }
  function midpoint(a, b) {
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }
  canvas.addEventListener('touchstart', (e) => {
    if (!e.targetTouches || e.targetTouches.length === 0) return;
    cancelAnim();
    if (e.targetTouches.length === 1) {
      const t = e.targetTouches[0];
      touchState = { mode: 'pan', lastX: t.clientX, lastY: t.clientY, moved: false };
    } else if (e.targetTouches.length >= 2) {
      const a = e.targetTouches[0], b = e.targetTouches[1];
      const mp = midpoint(a, b);
      const rect = canvas.getBoundingClientRect();
      const mx = mp.x - rect.left, my = mp.y - rect.top;
      const wx = (mx - vw.x) / vw.k, wy = (my - vw.y) / vw.k;
      touchState = { mode: 'pinch', d: distance(a, b), cx: mx, cy: my, wx, wy, startK: vw.k };
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (!touchState) return;
    if (touchState.mode === 'pan' && e.targetTouches.length === 1) {
      const t = e.targetTouches[0];
      const dx = t.clientX - touchState.lastX;
      const dy = t.clientY - touchState.lastY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) touchState.moved = true;
      vw.x += dx; vw.y += dy;
      touchState.lastX = t.clientX; touchState.lastY = t.clientY;
  clampViewport?.();
      draw();
    } else if (e.targetTouches.length >= 2) {
      const a = e.targetTouches[0], b = e.targetTouches[1];
      const d2 = distance(a, b);
      const k = Math.min(3, Math.max(0.35, touchState.startK * (d2 / touchState.d)));
      vw.k = k;
      // Keep world point under pinch midpoint stable
      vw.x = touchState.cx - touchState.wx * vw.k;
      vw.y = touchState.cy - touchState.wy * vw.k;
  clampViewport?.();
      draw();
    }
    e.preventDefault();
  }, { passive: false });
  function endTouchBase() { touchState = null; }
  canvas.addEventListener('touchcancel', endTouchBase, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (!e.changedTouches || e.changedTouches.length !== 1) { touchState = null; return; }
    if (touchState && touchState.moved) { touchState = null; return; }
    const t = e.changedTouches[0];
    handleTap(t.clientX, t.clientY);
    touchState = null;
  }, { passive: true });

  // Wheel zoom
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      cancelAnim();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - vw.x) / vw.k,
            wy = (my - vw.y) / vw.k;
      const k = Math.exp(-e.deltaY * 0.001);
      vw.k = Math.min(3, Math.max(0.35, vw.k * k));
      vw.x = mx - wx * vw.k;
      vw.y = my - wy * vw.k;
  clampViewport?.();
      draw();
    },
    { passive: false }
  );

  // Buttons
  const fitBtn = documentObj.getElementById("fit");
  if (fitBtn) fitBtn.addEventListener("click", () => fitView({ animate: true }));
  const exportBtn = documentObj.getElementById("export");
  if (exportBtn) exportBtn.addEventListener("click", exportPNG);
  const exportRoadsBtn = documentObj.getElementById("exportRoads");
  if (exportRoadsBtn && typeof exportRoads === 'function') exportRoadsBtn.addEventListener("click", exportRoads);

  // Road ID toggle
  const roadIdsToggle = documentObj.getElementById('toggleRoadIds');
  function applyRoadIdsFromUI() {
    if (roadIdsToggle) BEHAVIOR.showRoadIds = !!roadIdsToggle.checked;
    draw();
  }
  roadIdsToggle?.addEventListener('change', applyRoadIdsFromUI);
  // Initialize from default UI state
  applyRoadIdsFromUI();

  // Fullscreen button
  const fsBtn = documentObj.getElementById('fullscreenBtn');
  function isFullscreen() {
    return !!(documentObj.fullscreenElement || documentObj.webkitFullscreenElement || documentObj.msFullscreenElement);
  }
  function requestFS(el) {
    const any = el;
    (any.requestFullscreen || any.webkitRequestFullscreen || any.msRequestFullscreen)?.call(el);
  }
  function exitFS(doc) {
    (doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen)?.call(doc);
  }
  function updateFSLabel() { if (fsBtn) fsBtn.textContent = isFullscreen() ? 'Exit Fullscreen' : 'Fullscreen'; }
  fsBtn?.addEventListener('click', () => {
    if (isFullscreen()) exitFS(documentObj);
    else requestFS(documentObj.documentElement);
  });
  documentObj.addEventListener('fullscreenchange', updateFSLabel);
  documentObj.addEventListener('webkitfullscreenchange', updateFSLabel);
  documentObj.addEventListener('MSFullscreenChange', updateFSLabel);
  updateFSLabel();

  // Filter toggles
  const npcToggle = documentObj.getElementById('toggleNPCs');
  const gateToggle = documentObj.getElementById('toggleGates');
  const scavToggle = documentObj.getElementById('toggleScavenges');
  function applyFilterFromUI() {
    if (npcToggle) STATE.filters.npc = !!npcToggle.checked;
    if (gateToggle) STATE.filters.gate = !!gateToggle.checked;
    if (scavToggle) STATE.filters.scavenge = !!scavToggle.checked;
    draw();
    // If a location list is open, refresh it to reflect filters
    if (STATE.expandedLocId) {
      showLocationSites?.();
    }
  }
  npcToggle?.addEventListener('change', applyFilterFromUI);
  gateToggle?.addEventListener('change', applyFilterFromUI);
  scavToggle?.addEventListener('change', applyFilterFromUI);
  // Initialize from default UI states
  applyFilterFromUI();

  // Keyboard shortcuts
  windowObj.addEventListener("keydown", (e) => {
    if (e.key === "f" || e.key === "F") fitView({ animate: true });
    if (e.key === "e" || e.key === "E") exportPNG();
  if (e.key === 'F11') { e.preventDefault(); fsBtn?.click(); }
  });

  // Resize
  windowObj.addEventListener("resize", resize);
}
