'use strict';
/* Выделение: прямоугольник границ {x, y, w, h} и необязательная маска
   (Uint8Array w×h внутри границ). Без маски выделен весь прямоугольник.
   Объект выделения не изменяется после создания — меняется целиком. */
(function (NPR) {
  const Sel = (NPR.selection = {});

  Sel.rect = (x, y, w, h) => ({ x, y, w, h, mask: null });
  Sel.has = (s, x, y) =>
    !!s && x >= s.x && y >= s.y && x < s.x + s.w && y < s.y + s.h &&
    (!s.mask || s.mask[(y - s.y) * s.w + (x - s.x)] === 1);
  Sel.at = (s, x, y) => ({ x, y, w: s.w, h: s.h, mask: s.mask });

  /* Маска на весь холст (W×H) → выделение, обрезанное по занятой области. */
  Sel.fromFull = function (full, W, H) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) if (full[row + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
    if (x1 < 0) return null;
    const w = x1 - x0 + 1, h = y1 - y0 + 1, mask = new Uint8Array(w * h);
    let all = true;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = full[(y0 + y) * W + x0 + x] ? 1 : 0;
      mask[y * w + x] = v;
      if (!v) all = false;
    }
    return { x: x0, y: y0, w, h, mask: all ? null : mask };
  };
  Sel.toFull = function (s, W, H, out) {
    out = out || new Uint8Array(W * H);
    if (!s) return out;
    const x0 = Math.max(0, s.x), y0 = Math.max(0, s.y), x1 = Math.min(W, s.x + s.w), y1 = Math.min(H, s.y + s.h);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++)
      if (!s.mask || s.mask[(y - s.y) * s.w + (x - s.x)]) out[y * W + x] = 1;
    return out;
  };
  /* mode: 'add' — объединить, 'sub' — вычесть b из a. */
  Sel.combine = function (a, b, mode, W, H) {
    const full = Sel.toFull(a, W, H);
    if (mode === 'add') Sel.toFull(b, W, H, full);
    else {
      const cut = Sel.toFull(b, W, H);
      for (let i = 0; i < full.length; i++) if (cut[i]) full[i] = 0;
    }
    return Sel.fromFull(full, W, H);
  };
  Sel.invert = function (s, W, H) {
    const full = Sel.toFull(s, W, H);
    for (let i = 0; i < full.length; i++) full[i] ^= 1;
    return Sel.fromFull(full, W, H);
  };

  /* Многоугольник лассо → маска на весь холст. Точки — координаты пикселей. */
  Sel.polygonFull = function (pts, W, H) {
    const full = new Uint8Array(W * H), n = pts.length;
    let ymin = Infinity, ymax = -Infinity;
    for (const p of pts) { if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
    ymin = Math.max(0, ymin); ymax = Math.min(H - 1, ymax);
    const xs = [];
    for (let y = ymin; y <= ymax; y++) {
      xs.length = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const l = Math.max(0, Math.round(xs[k])), r = Math.min(W - 1, Math.round(xs[k + 1]));
        for (let x = l; x <= r; x++) full[y * W + x] = 1;
      }
    }
    // контур входит в выделение целиком
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      NPR.plotLine(a.x, a.y, b.x, b.y, (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) full[y * W + x] = 1; });
    }
    return full;
  };

  /* Область пикселей, похожих на пиксель (px, py) в буфере src.
     Возвращает маску на весь холст и её границы, либо null. */
  Sel.region = function (src, W, H, px, py, opt) {
    const clip = opt.clip, sel = opt.sel, tol = opt.tolerance | 0, target = src[py * W + px];
    const tr = target & 255, tg = (target >>> 8) & 255, tb = (target >>> 16) & 255, ta = target >>> 24;
    const like = tol === 0
      ? (v) => v === target || (ta === 0 && v >>> 24 === 0)
      : (v) => {
        const a = v >>> 24;
        if (a === 0 && ta === 0) return true;
        return Math.abs(a - ta) <= tol && Math.abs((v & 255) - tr) <= tol &&
          Math.abs(((v >>> 8) & 255) - tg) <= tol && Math.abs(((v >>> 16) & 255) - tb) <= tol;
      };
    const allowed = sel && sel.mask ? (x, y) => sel.mask[(y - sel.y) * sel.w + (x - sel.x)] === 1 : null;
    const full = new Uint8Array(W * H);
    let x0 = W, y0 = H, x1 = -1, y1 = -1, count = 0;
    const mark = (x, y) => {
      full[y * W + x] = 1; count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    };
    if (!opt.contiguous) {
      for (let y = clip.y0; y < clip.y1; y++) for (let x = clip.x0; x < clip.x1; x++)
        if (like(src[y * W + x]) && (!allowed || allowed(x, y))) mark(x, y);
    } else {
      const ok = (x, y) => { const i = y * W + x; return !full[i] && like(src[i]) && (!allowed || allowed(x, y)); };
      const stack = [px, py];
      while (stack.length) {
        const y = stack.pop(), x = stack.pop();
        if (!ok(x, y)) continue;
        let l = x, r = x;
        while (l > clip.x0 && ok(l - 1, y)) l--;
        while (r < clip.x1 - 1 && ok(r + 1, y)) r++;
        for (let k = l; k <= r; k++) mark(k, y);
        for (const ny of [y - 1, y + 1]) {
          if (ny < clip.y0 || ny >= clip.y1) continue;
          let run = false;
          for (let k = l; k <= r; k++) {
            if (ok(k, ny)) { if (!run) { stack.push(k, ny); run = true; } } else run = false;
          }
        }
      }
    }
    return count ? { full, x0, y0, x1, y1, count } : null;
  };

  /* Контур маски как Path2D в координатах выделения (кешируется по маске). */
  const paths = new WeakMap();
  Sel.outline = function (s) {
    if (!s.mask) return null;
    let p = paths.get(s.mask);
    if (p) return p;
    p = new Path2D();
    const { w, h, mask } = s;
    const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
    for (let y = 0; y <= h; y++) { // горизонтальные рёбра
      let start = -1;
      for (let x = 0; x <= w; x++) {
        const edge = x < w && at(x, y - 1) !== at(x, y);
        if (edge && start < 0) start = x;
        if (!edge && start >= 0) { p.moveTo(start, y); p.lineTo(x, y); start = -1; }
      }
    }
    for (let x = 0; x <= w; x++) { // вертикальные рёбра
      let start = -1;
      for (let y = 0; y <= h; y++) {
        const edge = y < h && at(x - 1, y) !== at(x, y);
        if (edge && start < 0) start = y;
        if (!edge && start >= 0) { p.moveTo(x, start); p.lineTo(x, y); start = -1; }
      }
    }
    paths.set(s.mask, p);
    return p;
  };
})(window.NPR);
