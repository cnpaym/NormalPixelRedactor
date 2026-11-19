'use strict';
/* Окно просмотра: зум, пан, сетка. Два canvas друг над другом:
   нижний — картинка и сетка, верхний — курсор, выделение, плавающие пиксели.
   Движение мыши перерисовывает только верхний. */
(function (NPR) {
  const S = NPR.state;
  const ZOOMS = [0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64];

  const V = (NPR.view = {
    zoom: 8, ox: 0, oy: 0, vw: 1, vh: 1, dpr: 1,
    hover: null, // пиксель под курсором {x,y}
    guide: null, // прямоугольник предпросмотра выделения
    guidePath: null, // точки лассо
    needMain: true, needOver: true,
  });

  V.init = function (main, over, preview) {
    V.main = main; V.over = over; V.preview = preview;
    V.mctx = main.getContext('2d', { alpha: false });
    V.octx = over.getContext('2d');
    V.pctx = preview.getContext('2d');
    new ResizeObserver(V.resize).observe(main.parentElement);
    V.resize();
    const loop = () => {
      const doc = NPR.doc;
      if (doc) {
        if (doc.flush()) { V.needMain = true; V.needPrev = true; }
        if (V.needMain) { V.needMain = false; drawMain(doc); }
        if (V.needOver) { V.needOver = false; drawOver(doc); }
        if (V.needPrev) { V.needPrev = false; drawPreview(doc); }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  V.resize = function () {
    const box = V.main.parentElement.getBoundingClientRect();
    V.dpr = window.devicePixelRatio || 1;
    V.vw = Math.max(1, Math.floor(box.width));
    V.vh = Math.max(1, Math.floor(box.height));
    for (const c of [V.main, V.over]) {
      c.width = Math.round(V.vw * V.dpr);
      c.height = Math.round(V.vh * V.dpr);
      c.style.width = V.vw + 'px';
      c.style.height = V.vh + 'px';
    }
    V.needMain = V.needOver = true;
  };

  V.redraw = () => { V.needMain = V.needOver = true; };
  V.redrawOver = () => { V.needOver = true; };

  V.toDoc = (sx, sy) => ({ fx: (sx - V.ox) / V.zoom, fy: (sy - V.oy) / V.zoom });
  V.fit = function () {
    const d = NPR.doc;
    const z = Math.min(V.vw / d.width, V.vh / d.height) * 0.9;
    V.zoom = z >= 1 ? Math.floor(z) : [...ZOOMS].reverse().find((s) => s <= z) || ZOOMS[0];
    V.center();
  };
  V.center = function () {
    const d = NPR.doc;
    V.ox = Math.round((V.vw - d.width * V.zoom) / 2);
    V.oy = Math.round((V.vh - d.height * V.zoom) / 2);
    V.redraw();
    NPR.emit('view');
  };
  V.setZoom = function (z, sx, sy) {
    z = NPR.util.clamp(z, ZOOMS[0], ZOOMS[ZOOMS.length - 1]);
    if (sx === undefined) { sx = V.vw / 2; sy = V.vh / 2; }
    const p = V.toDoc(sx, sy);
    V.zoom = z;
    V.ox = Math.round(sx - p.fx * z);
    V.oy = Math.round(sy - p.fy * z);
    V.redraw();
    NPR.emit('view');
  };
  V.zoomStep = function (dir, sx, sy) {
    let z;
    if (dir > 0) z = ZOOMS.find((s) => s > V.zoom + 1e-6) || ZOOMS[ZOOMS.length - 1];
    else z = [...ZOOMS].reverse().find((s) => s < V.zoom - 1e-6) || ZOOMS[0];
    V.setZoom(z, sx, sy);
  };
  V.pan = function (dx, dy) { V.ox += dx; V.oy += dy; V.redraw(); };

  let checker = null;
  function checkerPattern(ctx) {
    if (checker) return checker;
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const x = c.getContext('2d');
    x.fillStyle = '#5c5c5c'; x.fillRect(0, 0, 16, 16);
    x.fillStyle = '#4b4b4b'; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8);
    return (checker = ctx.createPattern(c, 'repeat'));
  }

  V.checkerPattern = (ctx) => checkerPattern(ctx);
  function drawMain(doc) {
    const ctx = V.mctx, z = V.zoom, W = doc.width, H = doc.height;
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    ctx.fillStyle = '#151515';
    ctx.fillRect(0, 0, V.vw, V.vh);
    ctx.imageSmoothingEnabled = false;

    const txs = S.tile === 'all' ? [-1, 0, 1] : S.tile === 'right' ? [0, 1] : [0];
    const tys = S.tile === 'all' ? [-1, 0, 1] : S.tile === 'down' ? [0, 1] : [0];
    // видимая часть каждой копии холста
    const parts = [];
    for (const ty of tys) for (const tx of txs) {
      const ox = V.ox + tx * W * z, oy = V.oy + ty * H * z;
      const x0 = Math.max(0, Math.floor(-ox / z)), y0 = Math.max(0, Math.floor(-oy / z));
      const x1 = Math.min(W, Math.ceil((V.vw - ox) / z)), y1 = Math.min(H, Math.ceil((V.vh - oy) / z));
      if (x1 > x0 && y1 > y0) parts.push({ ox, oy, x0, y0, x1, y1, copy: tx !== 0 || ty !== 0 });
    }
    for (const p of parts) { // шахматка прозрачности
      ctx.save();
      ctx.translate(p.ox, p.oy);
      ctx.fillStyle = checkerPattern(ctx);
      ctx.fillRect(p.x0 * z, p.y0 * z, (p.x1 - p.x0) * z, (p.y1 - p.y0) * z);
      ctx.restore();
    }
    NPR.refs.draw(ctx, 'under');
    for (const p of parts) {
      if (p.copy) ctx.globalAlpha = 0.8;
      ctx.drawImage(doc.canvas, p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0, p.ox + p.x0 * z, p.oy + p.y0 * z, (p.x1 - p.x0) * z, (p.y1 - p.y0) * z);
      ctx.globalAlpha = 1;
    }
    NPR.frames.drawOnion(ctx);
    NPR.frames.drawDiff(ctx);
    NPR.refs.draw(ctx, 'over');

    // сетки рисуются только по основному холсту
    const x0 = Math.max(0, Math.floor(-V.ox / z)), y0 = Math.max(0, Math.floor(-V.oy / z));
    const x1 = Math.min(W, Math.ceil((V.vw - V.ox) / z)), y1 = Math.min(H, Math.ceil((V.vh - V.oy) / z));
    if (x1 > x0 && y1 > y0) {
      if (!S.hideGrids && S.grid && z >= 6) lines(ctx, x0, y0, x1, y1, 1, 1, 'rgba(0,0,0,0.22)');
      if (!S.hideGrids && S.customGrid && S.gridW * z >= 4 && S.gridH * z >= 4)
        lines(ctx, x0, y0, x1, y1, S.gridW, S.gridH, 'rgba(242,182,61,0.55)');
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(V.ox - 0.5, V.oy - 0.5, W * z + 1, H * z + 1);
    NPR.refs.draw(ctx, 'pin');
  }

  function lines(ctx, x0, y0, x1, y1, sx, sy, color) {
    const z = V.zoom;
    ctx.beginPath();
    for (let x = Math.ceil(x0 / sx) * sx; x <= x1; x += sx) {
      const px = Math.round(V.ox + x * z) + 0.5;
      ctx.moveTo(px, V.oy + y0 * z); ctx.lineTo(px, V.oy + y1 * z);
    }
    for (let y = Math.ceil(y0 / sy) * sy; y <= y1; y += sy) {
      const py = Math.round(V.oy + y * z) + 0.5;
      ctx.moveTo(V.ox + x0 * z, py); ctx.lineTo(V.ox + x1 * z, py);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function ants(ctx, r) {
    const z = V.zoom;
    const x = Math.round(V.ox + r.x * z) + 0.5, y = Math.round(V.oy + r.y * z) + 0.5;
    const w = Math.round(r.w * z) - 1, h = Math.round(r.h * z) - 1;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  /* Выделение произвольной формы: контур строится один раз и только масштабируется. */
  function drawSel(ctx, s) {
    const path = NPR.selection.outline(s);
    if (!path) return ants(ctx, s);
    const z = V.zoom;
    ctx.save();
    ctx.translate(V.ox + s.x * z, V.oy + s.y * z);
    ctx.scale(z, z);
    ctx.lineWidth = 1 / z;
    ctx.strokeStyle = '#000';
    ctx.stroke(path);
    ctx.setLineDash([4 / z, 4 / z]);
    ctx.strokeStyle = '#fff';
    ctx.stroke(path);
    ctx.restore();
  }

  function drawOver(doc) {
    const ctx = V.octx, z = V.zoom;
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    ctx.clearRect(0, 0, V.vw, V.vh);
    ctx.imageSmoothingEnabled = false;

    const f = doc.float;
    if (f) ctx.drawImage(f.canvas, V.ox + f.x * z, V.oy + f.y * z, f.w * z, f.h * z);

    // оси симметрии
    ctx.strokeStyle = 'rgba(102,204,255,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (S.symX) { const x = Math.round(V.ox + (doc.width / 2) * z) + 0.5; ctx.moveTo(x, V.oy); ctx.lineTo(x, V.oy + doc.height * z); }
    if (S.symY) { const y = Math.round(V.oy + (doc.height / 2) * z) + 0.5; ctx.moveTo(V.ox, y); ctx.lineTo(V.ox + doc.width * z, y); }
    ctx.stroke();

    if (doc.sel) drawSel(ctx, doc.sel);
    if (V.guide) ants(ctx, V.guide);
    if (V.guidePath && V.guidePath.length > 1) { // след лассо
      ctx.beginPath();
      V.guidePath.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](V.ox + (p.x + 0.5) * z, V.oy + (p.y + 0.5) * z));
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    }

    NPR.fx.drawOverlay(ctx);
    NPR.roblox.drawOverlay(ctx);
    NPR.text.drawOverlay(ctx);
    NPR.particles.drawOverlay(ctx);
    NPR.anim.smear.drawOverlay(ctx);
    NPR.cloth.drawOverlay(ctx);
    NPR.gradient.drawOverlay(ctx);
    NPR.refs.drawOverlay(ctx);

    // контур кисти под курсором
    const hv = V.hover, tool = NPR.tools && NPR.tools[S.tool];
    if (hv && tool && !NPR.input.panning && S.tool !== 'refs') {
      const cb = tool.usesBrush && S.tool !== 'light' ? NPR.brushes.current() : null;
      const n = tool.usesBrush ? S.brushSize : 1, bw = cb ? cb.w : n, bh = cb ? cb.h : n;
      const x = Math.round(V.ox + (hv.x - (bw >> 1)) * z) + 0.5, y = Math.round(V.oy + (hv.y - (bh >> 1)) * z) + 0.5;
      const s = Math.max(1, Math.round(bw * z) - 1), s2 = Math.max(1, Math.round(bh * z) - 1);
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeRect(x - 1, y - 1, s + 2, s2 + 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeRect(x, y, s, s2);
    }
  }

  /* Превью в натуральную величину (или вписанное, если не помещается). */
  function drawPreview(doc) {
    const c = V.preview, box = c.parentElement;
    if (!box.offsetParent) return; // панель скрыта
    const maxW = box.clientWidth || 200, maxH = 160;
    let s = Math.min(maxW / doc.width, maxH / doc.height);
    s = s >= 1 ? Math.min(4, Math.floor(s)) : s;
    const w = Math.max(1, Math.round(doc.width * s)), h = Math.max(1, Math.round(doc.height * s));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = V.pctx;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = s < 1;
    ctx.drawImage(doc.canvas, 0, 0, w, h);
  }
})(window.NPR);
