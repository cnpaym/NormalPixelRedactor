'use strict';
/* Ввод: мышь, перо и пальцы через Pointer Events, колесо, клавиатура.
   Клавиши определяются по физическому положению (event.code),
   поэтому работают в любой раскладке. */
(function (NPR) {
  const S = NPR.state, V = NPR.view, T = NPR.tools, E = NPR.edit;
  const I = (NPR.input = { panning: false, busy: false, space: false });

  const PAINT = ['pencil', 'eraser', 'fill', 'line', 'rect', 'ellipse'];
  const SELECT = ['move', 'select', 'selectEllipse', 'lasso', 'wand'];
  const ptrs = new Map();
  let active = null, pan = null, gesture = null, press = null, el;

  function pos(ev) {
    const r = el.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top;
    const f = V.toDoc(sx, sy);
    return { x: Math.floor(f.fx), y: Math.floor(f.fy), sx, sy };
  }
  function setCursor() {
    el.style.cursor = pan ? 'grabbing' : I.space || S.tool === 'hand' ? 'grab' : S.tool === 'move' ? 'move' : 'crosshair';
  }
  I.setCursor = setCursor;

  /* Долгое нажатие пальцем — пипетка (начатый штрих отменяется). */
  function clearPress() { if (press) { clearTimeout(press.timer); press = null; } }
  function longPress() {
    const p = press;
    press = null;
    if (!p || !active || active.id !== p.id) return;
    endStroke(true);
    T.eyedropper.down(p.pos, { button: 0 });
    NPR.status.flash('Цвет взят пипеткой');
    if (navigator.vibrate) navigator.vibrate(15);
    V.redrawOver();
  }

  function endStroke(cancel, p, ev) {
    if (!active) return;
    if (cancel) active.tool.cancel(); else active.tool.up(p, ev);
    active = null;
    I.busy = false;
  }
  I.cancelStroke = function () { const had = !!active; endStroke(true); return had; };

  /* ---------- жесты двумя пальцами ---------- */
  function touchState() {
    const t = [...ptrs.values()].filter((p) => p.touch);
    const a = t[0], b = t[1];
    return { cx: (a.sx + b.sx) / 2, cy: (a.sy + b.sy) / 2, d: Math.hypot(a.sx - b.sx, a.sy - b.sy) };
  }
  function startGesture() {
    clearPress();
    endStroke(true); // палец, который начал рисовать, оказался началом щипка
    pan = null; I.panning = false;
    V.hover = null;
    gesture = { t0: performance.now(), n: ptrs.size, moved: 0, last: touchState() };
  }
  function updateGesture() {
    const touches = [...ptrs.values()].filter((p) => p.touch);
    if (touches.length < 2) return;
    const g = gesture, now = touchState();
    V.pan(now.cx - g.last.cx, now.cy - g.last.cy);
    if (g.last.d > 10 && now.d > 10) V.setZoom(V.zoom * (now.d / g.last.d), now.cx, now.cy);
    g.moved += Math.abs(now.cx - g.last.cx) + Math.abs(now.cy - g.last.cy) + Math.abs(now.d - g.last.d);
    g.last = now;
  }
  function endGesture() {
    const g = gesture;
    gesture = null;
    if (performance.now() - g.t0 < 350 && g.moved < 14) {
      if (g.n === 2) NPR.undo();
      else if (g.n === 3) NPR.redo();
    }
  }

  /* ---------- указатель ---------- */
  function onDown(ev) {
    NPR.closePopup();
    if (document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) document.activeElement.blur();
    const p = pos(ev), touch = ev.pointerType === 'touch';
    ptrs.set(ev.pointerId, { sx: p.sx, sy: p.sy, touch });
    try { el.setPointerCapture(ev.pointerId); } catch (e) { /* указатель уже отпущен */ }
    if (touch && ptrs.size >= 2) {
      if (gesture) gesture.n = Math.max(gesture.n, ptrs.size); else startGesture();
      return;
    }
    if (active || pan) return;
    if (ev.button === 1 || I.space || (S.tool === 'hand' && ev.button === 0) || (touch && S.penOnly)) {
      pan = { id: ev.pointerId, sx: p.sx, sy: p.sy };
      I.panning = true; setCursor(); V.redrawOver();
      ev.preventDefault();
      return;
    }
    const penEraser = ev.pointerType === 'pen' && (ev.button === 5 || ev.buttons & 32);
    if (ev.button !== 0 && ev.button !== 2 && !penEraser) return;
    let name = S.tool;
    if (penEraser) name = 'eraser';
    else if (ev.altKey && PAINT.includes(name)) name = 'eyedropper';
    const tool = T[name];
    NPR.frames.stop();
    if (name === 'gradient' || name === 'refs' || name === 'light') { /* сами решают, что закреплять */ }
    else if (!SELECT.includes(name)) E.commitFloat();
    V.hover = p;
    if (tool.down(p, ev) !== false) {
      active = { tool, id: ev.pointerId }; I.busy = true;
      if (touch && PAINT.includes(name)) press = { id: ev.pointerId, pos: p, timer: setTimeout(longPress, 550) };
    }
    V.redrawOver();
  }

  function onMove(ev) {
    const rec = ptrs.get(ev.pointerId), p = pos(ev);
    if (rec) { rec.sx = p.sx; rec.sy = p.sy; }
    if (gesture) { updateGesture(); return; }
    if (pan && pan.id === ev.pointerId) {
      V.pan(p.sx - pan.sx, p.sy - pan.sy);
      pan.sx = p.sx; pan.sy = p.sy;
      return;
    }
    if (press && press.id === ev.pointerId && Math.hypot(p.sx - press.pos.sx, p.sy - press.pos.sy) > 6) clearPress();
    V.hover = ev.pointerType === 'touch' && !active ? null : p;
    if (active && active.id === ev.pointerId) {
      const list = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [];
      if (list.length > 1) for (const e of list) active.tool.move(pos(e), ev);
      else active.tool.move(p, ev);
    }
    NPR.status.update(p);
    V.redrawOver();
  }

  function onUp(ev) {
    const cancel = ev.type === 'pointercancel';
    ptrs.delete(ev.pointerId);
    if (press && press.id === ev.pointerId) clearPress();
    if (gesture) { if (![...ptrs.values()].some((p) => p.touch)) endGesture(); return; }
    if (pan && pan.id === ev.pointerId) { pan = null; I.panning = false; setCursor(); V.redrawOver(); return; }
    if (active && active.id === ev.pointerId) endStroke(cancel, pos(ev), ev);
    if (ev.pointerType === 'touch') V.hover = null;
    V.redrawOver();
  }

  let wheelAcc = 0;
  function onWheel(ev) {
    ev.preventDefault();
    const p = pos(ev);
    if (ev.ctrlKey) { // щипок на тачпаде
      const d = Math.max(-30, Math.min(30, ev.deltaY));
      V.setZoom(V.zoom * Math.exp(-d * 0.02), p.sx, p.sy);
      return;
    }
    wheelAcc += ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY;
    if (Math.abs(wheelAcc) < 40) return;
    V.zoomStep(wheelAcc < 0 ? 1 : -1, p.sx, p.sy);
    wheelAcc = 0;
  }

  /* ---------- клавиатура ---------- */
  const TOOL_KEYS = { KeyB: 'pencil', KeyE: 'eraser', KeyG: 'fill', KeyI: 'eyedropper', KeyL: 'line', KeyU: 'rect', KeyO: 'ellipse', KeyM: 'select', KeyQ: 'lasso', KeyW: 'wand', KeyV: 'move', KeyH: 'hand', KeyD: 'gradient', KeyT: 'light', KeyR: 'refs' };
  I.TOOL_KEYS = TOOL_KEYS;

  function nudge(dx, dy) {
    const doc = NPR.doc;
    if (!doc.float && !(doc.sel && E.lift())) return false;
    const f = doc.float;
    f.x += dx; f.y += dy;
    if (!f.whole) doc.sel = E.floatSel(f);
    V.redrawOver();
    return true;
  }

  function onKeyDown(e) {
    const tag = e.target.tagName;
    if (NPR.dialogOpen()) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag) && !(e.target.type === 'range' || e.target.type === 'checkbox')) {
      // в числовых полях и списках Enter и Esc относятся к холсту: применить или отменить предпросмотр
      const pass = (e.code === 'Escape' && e.target.type !== 'text') || (e.code === 'Enter' && e.target.type === 'number');
      if (!pass) return;
      e.target.blur();
    }
    const c = e.code, ctrl = e.ctrlKey || e.metaKey;
    let used = true;
    if (ctrl) {
      if (c === 'KeyZ') e.shiftKey ? NPR.redo() : NPR.undo();
      else if (c === 'KeyY') NPR.redo();
      else if (c === 'KeyC') E.copy();
      else if (c === 'KeyX') E.cut();
      else if (c === 'KeyA') E.selectAll();
      else if (c === 'KeyD') E.deselect();
      else if (c === 'KeyS') NPR.io.saveProject(e.shiftKey);
      else if (c === 'KeyO') NPR.actions.open();
      else if (c === 'KeyI' && e.shiftKey) E.invert();
      else if (c === 'KeyE') NPR.actions.exportPNG();
      else used = false; // Ctrl+V обрабатывается событием paste
    } else if (e.altKey && c !== 'AltLeft' && c !== 'AltRight') used = false;
    else if (TOOL_KEYS[c] && !e.shiftKey) NPR.setTool(TOOL_KEYS[c]);
    else if (c === 'KeyG' && e.shiftKey) NPR.toggle('hideGrids');
    else if (c === 'KeyX') NPR.swapColors();
    else if (c === 'BracketLeft') NPR.setBrushSize(S.brushSize - 1);
    else if (c === 'BracketRight') NPR.setBrushSize(S.brushSize + 1);
    else if (c === 'Equal' || c === 'NumpadAdd') V.zoomStep(1);
    else if (c === 'Minus' || c === 'NumpadSubtract') V.zoomStep(-1);
    else if (c === 'Digit0') V.fit();
    else if (c === 'Digit1') V.setZoom(1);
    else if (c === 'Delete' || c === 'Backspace') { if (S.tool === 'refs' && NPR.refs.selected) NPR.refs.remove(NPR.refs.selected); else E.del(); }
    else if (c === 'Escape') {
      const had = I.cancelStroke();
      if (E.cancelSessions()) { /* предпросмотр убран */ }
      else if (!had) { if (NPR.doc.float) E.cancelFloat(); else E.deselect(); }
    }
    else if (c === 'Enter') E.commitFloat();
    else if (c === 'Tab') NPR.toggle('side');
    else if (c === 'Comma') NPR.frames.step(-1);
    else if (c === 'Period') NPR.frames.step(1);
    else if (c === 'Space') { I.space = true; setCursor(); }
    else if (c === 'AltLeft' || c === 'AltRight') { /* пипетка при зажатом Alt; не даём браузеру открыть меню */ }
    else if (c === 'ArrowLeft') used = nudge(-1, 0);
    else if (c === 'ArrowRight') used = nudge(1, 0);
    else if (c === 'ArrowUp') used = nudge(0, -1);
    else if (c === 'ArrowDown') used = nudge(0, 1);
    else used = false;
    if (used) e.preventDefault();
  }
  function onKeyUp(e) {
    if (e.code === 'Space') { I.space = false; setCursor(); }
    if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
  }

  async function onPaste(e) {
    if (NPR.dialogOpen() || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    e.preventDefault();
    const item = [...(e.clipboardData ? e.clipboardData.items : [])].find((i) => i.type.startsWith('image/'));
    if (item && !(E.sysOurs && E.clipboard)) {
      try {
        const img = await NPR.util.decodeImage(item.getAsFile());
        if (img.w > NPR.doc.width || img.h > NPR.doc.height) NPR.toast('Картинка больше холста: часть окажется за краем');
        E.paste({ w: img.w, h: img.h, data: img.data });
      } catch (err) { NPR.toast('Не удалось вставить картинку из буфера', true); }
    } else E.paste();
  }

  I.init = function (overCanvas) {
    el = overCanvas;
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', () => { if (!active) { V.hover = null; V.redrawOver(); } });
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('auxclick', (e) => e.preventDefault());
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('paste', onPaste);
    window.addEventListener('blur', () => { I.space = false; E.sysOurs = false; setCursor(); });
    // перетаскивание файла в окно
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) NPR.io.openFile(f);
    });
    setCursor();
  };
})(window.NPR);
