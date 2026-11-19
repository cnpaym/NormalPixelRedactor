'use strict';
/* Инструменты рисования и операции с выделением.
   Любой инструмент пишет в слой через транзакцию (NPR.Tx), поэтому
   отмена, симметрия, выделение и блокировка прозрачности работают везде одинаково. */
(function (NPR) {
  const S = NPR.state, U = NPR.util, V = NPR.view, Sel = NPR.selection;
  const T = (NPR.tools = {});
  const E = (NPR.edit = { clipboard: null, sysOurs: false });

  function editableLayer() {
    const L = NPR.doc.active;
    if (!L.visible) { NPR.toast('Слой скрыт. Включите видимость, чтобы рисовать'); return null; }
    if (L.locked) { NPR.toast('Слой заблокирован'); return null; }
    return L;
  }
  function clipRect(doc) {
    const s = doc.sel, W = doc.width, H = doc.height;
    if (!s) return { x0: 0, y0: 0, x1: W, y1: H };
    return { x0: Math.max(0, s.x), y0: Math.max(0, s.y), x1: Math.min(W, s.x + s.w), y1: Math.min(H, s.y + s.h) };
  }
  E.editableLayer = editableLayer;
  function finish(tx, label) {
    const cmd = tx.commit(label);
    if (cmd) { NPR.history.push(cmd); NPR.emit('docChanged'); }
    return cmd;
  }

  const brushCache = {};
  function brushOffsets(n, shape) {
    const key = n + shape;
    if (brushCache[key]) return brushCache[key];
    const out = [], o = (n / 2) | 0, c = (n - 1) / 2, r2 = (n / 2 - 0.25) ** 2;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
      if (shape === 'square' || n < 3 || (i - c) ** 2 + (j - c) ** 2 <= r2) out.push(i - o, j - o);
    return (brushCache[key] = out);
  }

  /* Возвращает функции рисования для текущей транзакции. */
  const DITHER = [0, 2, 3, 1]; // порядок включения пикселей в клетке 2×2
  function painter(tx, color, erase, shade) {
    const doc = tx.doc, L = tx.layer, d = L.data, W = doc.width, H = doc.height;
    const c = clipRect(doc), mask = tx.mask, alock = L.alphaLock, opaque = color >>> 24 === 255;
    const wrapX = S.tile === 'right' || S.tile === 'all', wrapY = S.tile === 'down' || S.tile === 'all', sx = S.symX, sy = S.symY;
    const custom = NPR.brushes.current(), dith = S.dither;
    const offs = custom ? null : brushOffsets(S.brushSize, S.brushShape);
    const sel = doc.sel, sm = sel && sel.mask;

    function index(x, y) {
      if (wrapX) x = ((x % W) + W) % W;
      if (wrapY) y = ((y % H) + H) % H;
      if (x < c.x0 || y < c.y0 || x >= c.x1 || y >= c.y1) return -1;
      if (sm && sm[(y - sel.y) * sel.w + (x - sel.x)] !== 1) return -1;
      return y * W + x;
    }
    /* col — свой цвет пикселя (у цветной кисти); без него берётся цвет штриха. */
    function plot(x, y, col) {
      if (dith && DITHER[(y & 1) * 2 + (x & 1)] >= dith) return;
      const i = index(x, y);
      if (i < 0) return;
      const old = d[i];
      if (erase) { if (old !== 0) tx.set(i, 0); return; }
      if (shade) { // сдвиг тона: один раз за штрих, только по закрашенному
        if (old >>> 24 === 0 || mask[i] === 1) return;
        const n = NPR.fx.tone(old, shade);
        if (n !== old) tx.set(i, n);
        return;
      }
      const cc = col === undefined ? color : col;
      if (alock) {
        if (old >>> 24 === 0 || mask[i] === 1) return;
        const n = U.blend(old, cc);
        tx.set(i, ((n & 0xffffff) | (old & 0xff000000)) >>> 0);
        return;
      }
      if (cc >>> 24 === 255) { if (old !== cc) tx.set(i, cc); return; }
      if (mask[i] === 1) return; // полупрозрачный цвет ложится один раз за штрих
      const n = U.blend(old, cc);
      if (n !== old) tx.set(i, n);
    }
    function sym(x, y, col) {
      plot(x, y, col);
      if (sx) plot(W - 1 - x, y, col);
      if (sy) plot(x, H - 1 - y, col);
      if (sx && sy) plot(W - 1 - x, H - 1 - y, col);
    }
    function un(x, y) { const i = index(x, y); if (i >= 0) tx.restore(i); }
    function unsym(x, y) {
      un(x, y);
      if (sx) un(W - 1 - x, y);
      if (sy) un(x, H - 1 - y);
      if (sx && sy) un(W - 1 - x, H - 1 - y);
    }
    function stamp(x, y) {
      if (!custom) { for (let k = 0; k < offs.length; k += 2) sym(x + offs[k], y + offs[k + 1]); return; }
      // своя кисть: отпечаток той формы, какой она нарисована
      const bw = custom.w, bh = custom.h, ox = bw >> 1, oy = bh >> 1, bd = custom.data, own = custom.colored && !erase && !shade;
      for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) { const v = bd[j * bw + i]; if (v >>> 24) sym(x + i - ox, y + j - oy, own ? v : undefined); }
    }
    return { plot, sym, stamp, unsym };
  }

  function line(x0, y0, x1, y1, fn) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      fn(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  NPR.plotLine = line;
  /* Эллипс, вписанный в прямоугольник (алгоритм Цингля). */
  function ellipse(x0, y0, x1, y1, fn) {
    let a = Math.abs(x1 - x0), b = Math.abs(y1 - y0), b1 = b & 1;
    let dx = 4 * (1 - a) * b * b, dy = 4 * (b1 + 1) * a * a, err = dx + dy + b1 * a * a, e2;
    if (x0 > x1) { x0 = x1; x1 += a; }
    if (y0 > y1) y0 = y1;
    y0 += (b + 1) >> 1; y1 = y0 - b1;
    a = 8 * a * a; b1 = 8 * b * b;
    do {
      fn(x1, y0); fn(x0, y0); fn(x0, y1); fn(x1, y1);
      e2 = 2 * err;
      if (e2 <= dy) { y0++; y1--; err += dy += a; }
      if (e2 >= dx || 2 * err > dy) { x0++; x1--; err += dx += b1; }
    } while (x0 <= x1);
    while (y0 - y1 <= b) { fn(x0 - 1, y0); fn(x1 + 1, y0++); fn(x0 - 1, y1); fn(x1 + 1, y1--); }
  }

  E.finish = finish;

  /* ---------- карандаш и ластик ---------- */
  function strokeTool(erase) {
    let tx = null, P, last, a, b, color, shading = false;
    function add(x, y) {
      if (b && b.x === x && b.y === y) return;
      if (S.pixelPerfect && S.brushSize === 1 && !NPR.brushes.current() && a && b &&
          (a.x === b.x || a.y === b.y) && (b.x === x || b.y === y) && a.x !== x && a.y !== y) {
        P.unsym(b.x, b.y); // убираем лишний пиксель в углу
        b = a;
      }
      P.stamp(x, y);
      a = b; b = { x, y };
    }
    return {
      usesBrush: true,
      down(p, ev) {
        const L = editableLayer();
        if (!L) return false;
        tx = new NPR.Tx(NPR.doc, L);
        color = erase ? 0 : ev.button === 2 ? S.secondary : S.primary;
        shading = !erase && S.shade;
        if (shading) NPR.fx.resetTone();
        P = painter(tx, color, erase, shading ? (ev.button === 2 ? -1 : 1) : 0);
        a = b = null;
        if (ev.shiftKey && T.lastPoint) line(T.lastPoint.x, T.lastPoint.y, p.x, p.y, add);
        else add(p.x, p.y);
        last = p;
        tx.sync();
      },
      move(p) {
        if (!tx || (p.x === last.x && p.y === last.y)) return;
        line(last.x, last.y, p.x, p.y, add);
        last = p;
        tx.sync();
      },
      up() {
        if (!tx) return;
        T.lastPoint = { x: last.x, y: last.y };
        if (finish(tx, erase ? 'Ластик' : shading ? 'Затенение' : 'Карандаш') && !erase && !shading) NPR.emit('colorUsed', color);
        tx = null;
      },
      cancel() { if (tx) { tx.revert(); tx = null; } },
    };
  }
  T.pencil = strokeTool(false);
  T.eraser = strokeTool(true);

  /* ---------- линия, прямоугольник, эллипс ---------- */
  function shapeTool(kind, label) {
    let tx = null, P, start, color;
    function draw(p, ev) {
      tx.revert();
      let x1 = p.x, y1 = p.y;
      const dx = x1 - start.x, dy = y1 - start.y, ax = Math.abs(dx), ay = Math.abs(dy);
      if (ev.shiftKey) {
        if (kind === 'line') {
          if (ax > 2 * ay) y1 = start.y;
          else if (ay > 2 * ax) x1 = start.x;
          else { const m = Math.max(ax, ay); x1 = start.x + Math.sign(dx) * m; y1 = start.y + Math.sign(dy) * m; }
        } else {
          const m = Math.max(ax, ay);
          x1 = start.x + (dx < 0 ? -m : m); y1 = start.y + (dy < 0 ? -m : m);
        }
      }
      const xa = Math.min(start.x, x1), xb = Math.max(start.x, x1), ya = Math.min(start.y, y1), yb = Math.max(start.y, y1);
      if (kind === 'line') line(start.x, start.y, x1, y1, P.stamp);
      else if (kind === 'rect') {
        if (S.filled) { for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) P.sym(x, y); }
        else {
          line(xa, ya, xb, ya, P.stamp); line(xa, yb, xb, yb, P.stamp);
          line(xa, ya, xa, yb, P.stamp); line(xb, ya, xb, yb, P.stamp);
        }
      } else if (xa === xb || ya === yb) line(xa, ya, xb, yb, P.stamp);
      else if (S.filled) {
        const lo = new Map(), hi = new Map();
        ellipse(xa, ya, xb, yb, (x, y) => {
          if (!lo.has(y) || x < lo.get(y)) lo.set(y, x);
          if (!hi.has(y) || x > hi.get(y)) hi.set(y, x);
        });
        for (const [y, l] of lo) for (let x = l; x <= hi.get(y); x++) P.sym(x, y);
      } else ellipse(xa, ya, xb, yb, P.stamp);
      tx.sync();
      NPR.status.extra = kind === 'line' ? `${Math.max(ax, ay) + 1} px` : `${xb - xa + 1}×${yb - ya + 1}`;
    }
    return {
      usesBrush: true,
      down(p, ev) {
        const L = editableLayer();
        if (!L) return false;
        tx = new NPR.Tx(NPR.doc, L);
        color = ev.button === 2 ? S.secondary : S.primary;
        P = painter(tx, color, false);
        start = p;
        draw(p, ev);
      },
      move(p, ev) { if (tx) draw(p, ev); },
      up() {
        if (!tx) return;
        if (finish(tx, label)) NPR.emit('colorUsed', color);
        tx = null;
        NPR.status.extra = '';
      },
      cancel() { if (tx) { tx.revert(); tx = null; NPR.status.extra = ''; } },
    };
  }
  T.line = shapeTool('line', 'Линия');
  T.rect = shapeTool('rect', 'Прямоугольник');
  T.ellipse = shapeTool('ellipse', 'Эллипс');

  /* ---------- заливка ---------- */
  /* Буфер, по которому ищутся похожие пиксели: активный слой или вся картинка. */
  function sampleSource(doc, L) {
    if (!S.sampleAll) return L.data;
    doc.flush();
    return doc.comp32;
  }
  T.fill = {
    down(p, ev) {
      const L = editableLayer();
      if (!L) return false;
      const doc = NPR.doc, W = doc.width, c = clipRect(doc);
      if (p.x < c.x0 || p.y < c.y0 || p.x >= c.x1 || p.y >= c.y1 || (doc.sel && !Sel.has(doc.sel, p.x, p.y))) return false;
      const r = Sel.region(sampleSource(doc, L), W, doc.height, p.x, p.y,
        { clip: c, sel: doc.sel, contiguous: S.contiguous, tolerance: S.tolerance });
      if (!r) return false;
      const tx = new NPR.Tx(doc, L), color = ev.button === 2 ? S.secondary : S.primary;
      const P = painter(tx, color, false);
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (r.full[y * W + x]) P.plot(x, y);
      if (finish(tx, 'Заливка')) { NPR.emit('colorUsed', color); NPR.emit('record', { t: 'fill', color: U.toHex(color, true) }); }
      return false; // действие мгновенное, тянуть нечего
    },
  };

  /* ---------- обводка ----------
     Щелчок по объекту обводит его; Shift+щелчок — все объекты слоя. ЛКМ основным цветом, ПКМ вторичным. */
  T.outline = {
    down(p, ev) {
      const L = editableLayer();
      if (!L) return false;
      const doc = NPR.doc;
      let region = null;
      if (!ev.shiftKey) {
        region = NPR.ops.componentAt(L.data, doc.width, doc.height, p.x, p.y);
        if (!region) { NPR.toast('Щёлкните по объекту. Shift+щелчок — обвести всё на слое'); return false; }
      }
      const color = ev.button === 2 ? S.secondary : S.primary;
      const n = NPR.ops.outline(color, S.outlineInside, S.outlineDiag, S.outlineWidth, region);
      if (n) NPR.emit('record', { t: 'outline', color: U.toHex(color, true), width: S.outlineWidth, inside: S.outlineInside, diag: S.outlineDiag });
      else NPR.toast('Обводить нечего: вокруг объекта нет свободных пикселей');
      return false;
    },
  };

  /* ---------- пипетка ---------- */
  T.eyedropper = {
    down(p, ev) { this.second = ev.button === 2; this.move(p); },
    move(p) {
      // сверху вниз: референсы поверх рисунка, сам рисунок, референсы под ним
      const doc = NPR.doc, hasPos = p.sx !== undefined;
      let { x, y } = p;
      if (S.tile === 'right' || S.tile === 'all') x = ((x % doc.width) + doc.width) % doc.width;
      if (S.tile === 'down' || S.tile === 'all') y = ((y % doc.height) + doc.height) % doc.height;
      let c = hasPos ? NPR.refs.sample(p, true) : 0;
      if (!c && x >= 0 && y >= 0 && x < doc.width && y < doc.height) { c = doc.comp32[y * doc.width + x]; if (c >>> 24 === 0) c = 0; }
      if (!c && hasPos) c = NPR.refs.sample(p, false);
      if (c) NPR.setColor(this.second ? 'secondary' : 'primary', c);
    },
    up() {}, cancel() {},
  };

  /* ---------- рука ---------- */
  T.hand = { down() {}, move() {}, up() {}, cancel() {}, isHand: true };

  /* ---------- выделение ---------- */
  /* Shift — добавить к выделению, Alt — вычесть из него. */
  const selMode = (ev) => (ev.shiftKey ? 'add' : ev.altKey ? 'sub' : null);
  function applySelection(ns, mode) {
    const doc = NPR.doc;
    if (mode && doc.sel) doc.sel = ns ? Sel.combine(doc.sel, ns, mode, doc.width, doc.height) : doc.sel;
    else if (mode === 'sub') { /* вычитать не из чего */ }
    else doc.sel = ns;
    V.guide = null; V.guidePath = null;
    NPR.status.extra = '';
    V.redrawOver();
    NPR.emit('sel');
  }
  const clampP = (p) => ({ x: U.clamp(p.x, 0, NPR.doc.width - 1), y: U.clamp(p.y, 0, NPR.doc.height - 1) });

  /* Общая часть: тянуть внутри выделения — значит двигать пиксели. */
  function selectTool(impl) {
    return Object.assign({
      down(p, ev) {
        this.op = selMode(ev);
        if (!this.op && Sel.has(NPR.doc.sel, p.x, p.y)) { this.mode = 'move'; return T.move.down(p, ev); }
        E.commitFloat();
        this.mode = 'new';
        return this.begin(p, ev);
      },
      move(p, ev) { return this.mode === 'move' ? T.move.move(p, ev) : this.drag(p, ev); },
      up(p, ev) { return this.mode === 'move' ? T.move.up(p, ev) : this.end(p, ev); },
      cancel() {
        if (this.mode === 'move') return T.move.cancel();
        V.guide = null; V.guidePath = null; NPR.status.extra = ''; V.redrawOver();
      },
    }, impl);
  }

  T.select = selectTool({
    begin(p) { this.start = clampP(p); this.moved = false; },
    drag(p) {
      const q = clampP(p), s = this.start;
      if (q.x !== s.x || q.y !== s.y) this.moved = true;
      if (!this.moved) return;
      V.guide = Sel.rect(Math.min(s.x, q.x), Math.min(s.y, q.y), Math.abs(q.x - s.x) + 1, Math.abs(q.y - s.y) + 1);
      NPR.status.extra = `${V.guide.w}×${V.guide.h}`;
      V.redrawOver();
    },
    end() { applySelection(this.moved ? V.guide : null, this.op); },
  });

  /* Выделение эллипсом: область строится тем же алгоритмом, что и фигура. */
  T.selectEllipse = selectTool({
    begin(p) { this.start = clampP(p); this.moved = false; },
    drag(p) {
      const q = clampP(p), s = this.start;
      if (q.x !== s.x || q.y !== s.y) this.moved = true;
      if (!this.moved) return;
      V.guide = Sel.rect(Math.min(s.x, q.x), Math.min(s.y, q.y), Math.abs(q.x - s.x) + 1, Math.abs(q.y - s.y) + 1);
      NPR.status.extra = `${V.guide.w}×${V.guide.h}`;
      V.redrawOver();
    },
    end() {
      const g = V.guide, doc = NPR.doc;
      if (!this.moved || !g) return applySelection(null, this.op);
      if (g.w < 3 || g.h < 3) return applySelection(g, this.op);
      const full = new Uint8Array(doc.width * doc.height), lo = new Map(), hi = new Map();
      ellipse(g.x, g.y, g.x + g.w - 1, g.y + g.h - 1, (x, y) => {
        if (!lo.has(y) || x < lo.get(y)) lo.set(y, x);
        if (!hi.has(y) || x > hi.get(y)) hi.set(y, x);
      });
      for (const [y, l] of lo) if (y >= 0 && y < doc.height) for (let x = Math.max(0, l); x <= Math.min(doc.width - 1, hi.get(y)); x++) full[y * doc.width + x] = 1;
      applySelection(Sel.fromFull(full, doc.width, doc.height), this.op);
    },
  });

  T.lasso = selectTool({
    begin(p) { this.pts = [clampP(p)]; V.guidePath = this.pts; },
    drag(p) {
      const q = clampP(p), l = this.pts[this.pts.length - 1];
      if (q.x === l.x && q.y === l.y) return;
      this.pts.push(q);
      V.redrawOver();
    },
    end() {
      const doc = NPR.doc;
      if (this.pts.length < 3) return applySelection(null, this.op);
      applySelection(Sel.fromFull(Sel.polygonFull(this.pts, doc.width, doc.height), doc.width, doc.height), this.op);
    },
  });

  T.wand = selectTool({
    begin(p) {
      const doc = NPR.doc, W = doc.width, H = doc.height;
      if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) { applySelection(null, this.op); return false; }
      const r = Sel.region(sampleSource(doc, doc.active), W, H, p.x, p.y,
        { clip: { x0: 0, y0: 0, x1: W, y1: H }, contiguous: S.contiguous, tolerance: S.tolerance });
      applySelection(r && Sel.fromFull(r.full, W, H), this.op);
      return false;
    },
    drag() {}, end() {},
  });

  /* ---------- перемещение ---------- */
  const floatSel = (f) => ({ x: f.x, y: f.y, w: f.w, h: f.h, mask: f.mask });
  E.floatSel = floatSel;
  T.move = {
    down(p) {
      const doc = NPR.doc;
      this.lifted = !doc.float;
      if (!doc.float && !E.lift()) return false;
      this.start = p;
      this.fx = doc.float.x; this.fy = doc.float.y;
    },
    move(p) {
      const f = NPR.doc.float;
      if (!f) return;
      f.x = this.fx + p.x - this.start.x;
      f.y = this.fy + p.y - this.start.y;
      if (!f.whole) NPR.doc.sel = floatSel(f);
      V.redrawOver();
    },
    up() { const f = NPR.doc.float; if (f && f.whole) E.commitFloat(); },
    cancel() {
      const f = NPR.doc.float;
      if (!f) return;
      if (this.lifted) return E.cancelFloat();
      f.x = this.fx; f.y = this.fy; // пиксели уже «в воздухе» — просто возвращаем на место
      if (!f.whole) NPR.doc.sel = floatSel(f);
      V.redrawOver();
    },
  };

  /* ---------- плавающие пиксели ---------- */
  function floatCanvas(f) {
    const c = f.canvas || document.createElement('canvas');
    c.width = f.w; c.height = f.h;
    const bytes = new Uint8ClampedArray(f.data.buffer.slice(0));
    c.getContext('2d').putImageData(new ImageData(bytes, f.w, f.h), 0, 0);
    f.canvas = c;
  }

  /* Вырезать выделенную область (или весь слой) в плавающий буфер. */
  E.lift = function () {
    E.commitSessions();
    const doc = NPR.doc, L = editableLayer();
    if (!L) return false;
    const c = clipRect(doc), w = c.x1 - c.x0, h = c.y1 - c.y0, sel = doc.sel;
    if (w <= 0 || h <= 0) return false;
    const tx = new NPR.Tx(doc, L), data = new Uint32Array(w * h), d = L.data, W = doc.width;
    const mask = sel && sel.mask ? new Uint8Array(w * h) : null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (mask) { if (!Sel.has(sel, c.x0 + x, c.y0 + y)) continue; mask[y * w + x] = 1; }
      const i = (c.y0 + y) * W + c.x0 + x, v = d[i];
      data[y * w + x] = v;
      if (v) tx.set(i, 0);
    }
    tx.sync();
    doc.float = { x: c.x0, y: c.y0, w, h, data, mask, tx, whole: !sel, label: 'Перемещение', origin: sel };
    if (sel) doc.sel = floatSel(doc.float);
    floatCanvas(doc.float);
    V.redrawOver();
    return true;
  };

  /* Инструменты с живым предпросмотром (градиент, свет и текстура). */
  E.sessions = () => [NPR.gradient, NPR.fx, NPR.text, NPR.anim && NPR.anim.smear].filter((m) => m && m.session);
  E.commitSessions = (except) => { for (const m of E.sessions()) if (m !== except) m.commit(); };
  E.cancelSessions = () => { const a = E.sessions(); for (const m of a) m.cancel(); return a.length > 0; };

  /* Закрепить всё незавершённое: предпросмотр градиента и плавающие пиксели. */
  E.commitFloat = function () {
    E.commitSessions();
    E.commitFloatOnly();
  };
  E.commitFloatOnly = function () {
    const doc = NPR.doc, f = doc && doc.float;
    if (!f) return;
    const tx = f.tx, d = tx.layer.data, W = doc.width, H = doc.height;
    for (let y = 0; y < f.h; y++) {
      const dy = f.y + y;
      if (dy < 0 || dy >= H) continue;
      for (let x = 0; x < f.w; x++) {
        const dx = f.x + x, v = f.data[y * f.w + x];
        if (!v || dx < 0 || dx >= W) continue;
        const i = dy * W + dx;
        tx.set(i, U.blend(d[i], v));
      }
    }
    doc.float = null;
    finish(tx, f.label);
    V.redrawOver();
  };

  E.cancelFloat = function () {
    const doc = NPR.doc, f = doc.float;
    if (!f) return;
    f.tx.revert();
    doc.float = null;
    doc.sel = f.whole || f.pasted ? null : f.origin || doc.sel;
    V.redrawOver();
  };

  function ensureFloat() {
    const doc = NPR.doc;
    if (doc.float) return true;
    if (!doc.sel) return false;
    return E.lift();
  }

  /* ---------- буфер обмена ---------- */
  E.copy = function () {
    const doc = NPR.doc, f = doc.float;
    if (f) E.clipboard = { w: f.w, h: f.h, data: f.data.slice(), x: f.x, y: f.y };
    else {
      const c = clipRect(doc), w = c.x1 - c.x0, h = c.y1 - c.y0, d = doc.active.data;
      if (w <= 0 || h <= 0) return false;
      const data = new Uint32Array(w * h);
      for (let y = 0; y < h; y++) data.set(d.subarray((c.y0 + y) * doc.width + c.x0, (c.y0 + y) * doc.width + c.x1), y * w);
      if (doc.sel && doc.sel.mask)
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!Sel.has(doc.sel, c.x0 + x, c.y0 + y)) data[y * w + x] = 0;
      E.clipboard = { w, h, data, x: c.x0, y: c.y0 };
    }
    // дублируем в системный буфер, чтобы вставлять в другие программы
    const cb = E.clipboard;
    E.sysOurs = false;
    if (navigator.clipboard && window.ClipboardItem) {
      U.makePNG(cb.w, cb.h, cb.data)
        .then((blob) => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]))
        .then(() => { E.sysOurs = true; })
        .catch(() => {});
    }
    return true;
  };

  E.paste = function (clip) {
    clip = clip || E.clipboard;
    if (!clip) { NPR.toast('Буфер обмена пуст'); return; }
    E.commitFloat();
    const doc = NPR.doc, L = editableLayer();
    if (!L) return;
    let x = clip.x, y = clip.y;
    if (x === undefined || x + clip.w > doc.width || y + clip.h > doc.height || x < 0 || y < 0) {
      x = Math.round((doc.width - clip.w) / 2);
      y = Math.round((doc.height - clip.h) / 2);
    }
    doc.float = { x, y, w: clip.w, h: clip.h, data: clip.data.slice(), mask: null, tx: new NPR.Tx(doc, L), whole: false, pasted: true, label: 'Вставка' };
    doc.sel = floatSel(doc.float);
    floatCanvas(doc.float);
    NPR.setTool('move');
    V.redrawOver();
  };

  E.del = function () {
    const doc = NPR.doc, f = doc.float;
    if (f) {
      doc.float = null;
      if (f.pasted) f.tx.revert(); else finish(f.tx, 'Удаление');
      V.redrawOver();
      return;
    }
    const L = editableLayer();
    if (!L) return;
    const c = clipRect(doc), tx = new NPR.Tx(doc, L), d = L.data;
    for (let y = c.y0; y < c.y1; y++) for (let x = c.x0; x < c.x1; x++) {
      const i = y * doc.width + x;
      if (d[i] && (!doc.sel || Sel.has(doc.sel, x, y))) tx.set(i, 0);
    }
    finish(tx, 'Удаление');
  };
  E.cut = function () { if (E.copy()) E.del(); };
  /* Поставить выделенное (или весь слой) по центру холста по видимым пикселям. axis: 'h' | 'v' | 'both' */
  E.center = function (axis) {
    const doc = NPR.doc;
    E.commitSessions();
    if (!doc.float && !E.lift()) return;
    const f = doc.float;
    let x0 = f.w, y0 = f.h, x1 = -1, y1 = -1;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.data[y * f.w + x] >>> 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { E.cancelFloat(); NPR.toast('Здесь нет закрашенных пикселей'); return; }
    if (axis !== 'v') f.x = Math.floor((doc.width - (x1 - x0 + 1)) / 2) - x0;
    if (axis !== 'h') f.y = Math.floor((doc.height - (y1 - y0 + 1)) / 2) - y0;
    if (!f.whole) doc.sel = floatSel(f);
    f.label = 'По центру';
    E.commitFloat();
  };
  E.selectAll = function () {
    E.commitFloat();
    NPR.doc.sel = Sel.rect(0, 0, NPR.doc.width, NPR.doc.height);
    V.redrawOver(); NPR.emit('sel');
  };
  E.invert = function () {
    E.commitFloat();
    const doc = NPR.doc;
    doc.sel = doc.sel ? Sel.invert(doc.sel, doc.width, doc.height) : Sel.rect(0, 0, doc.width, doc.height);
    V.redrawOver(); NPR.emit('sel');
  };
  E.deselect = function () {
    E.commitFloat();
    NPR.doc.sel = null;
    V.redrawOver(); NPR.emit('sel');
  };

  /* ---------- отражение и поворот ---------- */
  E.flip = function (horizontal) {
    const doc = NPR.doc;
    if (ensureFloat()) {
      const f = doc.float;
      const mirror = (src) => {
        const out = new src.constructor(f.w * f.h);
        for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++)
          out[y * f.w + x] = src[horizontal ? y * f.w + (f.w - 1 - x) : (f.h - 1 - y) * f.w + x];
        return out;
      };
      f.data = mirror(f.data);
      if (f.mask) { f.mask = mirror(f.mask); doc.sel = floatSel(f); }
      floatCanvas(f);
      V.redrawOver();
      return;
    }
    const L = editableLayer();
    if (!L) return;
    const W = doc.width, H = doc.height, src = L.data.slice(), tx = new NPR.Tx(doc, L), d = L.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = src[horizontal ? y * W + (W - 1 - x) : (H - 1 - y) * W + x], i = y * W + x;
      if (d[i] !== v) tx.set(i, v);
    }
    finish(tx, 'Отражение');
  };

  /* Поворот выделения на 90°. Без выделения поворачивается весь холст. */
  E.rotate = function (cw) {
    const doc = NPR.doc;
    if (!ensureFloat()) return NPR.ops.rotateCanvas(cw);
    const f = doc.float, r = rot90(f.data, f.w, f.h, cw);
    if (f.mask) f.mask = rot90(f.mask, f.w, f.h, cw);
    f.x += Math.round((f.w - f.h) / 2); f.y += Math.round((f.h - f.w) / 2);
    f.data = r; [f.w, f.h] = [f.h, f.w];
    doc.sel = floatSel(f);
    floatCanvas(f);
    V.redrawOver();
  };
  /* ---------- поворот на любой угол ----------
     Чтобы пиксель-арт не рассыпался, картинка сначала увеличивается в 8 раз
     алгоритмом Scale2x (он сохраняет форму линий), затем поворачивается и
     уменьшается обратно. Это упрощённый вариант RotSprite. */
  function scale2x(src, w, h) {
    const out = new Uint32Array(w * h * 4), W2 = w * 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = src[y * w + x], a = y > 0 ? src[(y - 1) * w + x] : p, b = x < w - 1 ? src[y * w + x + 1] : p, c = x > 0 ? src[y * w + x - 1] : p, d = y < h - 1 ? src[(y + 1) * w + x] : p;
      const o = y * 2 * W2 + x * 2;
      out[o] = c === a && c !== d && a !== b ? a : p;
      out[o + 1] = a === b && a !== c && b !== d ? b : p;
      out[o + W2] = d === c && d !== b && c !== a ? c : p;
      out[o + W2 + 1] = b === d && b !== a && d !== c ? d : p;
    }
    return out;
  }
  E.rotateAny = function (src, w, h, deg) {
    let big = src, k = 1;
    if (w * h <= 128 * 128) for (let i = 0; i < 3; i++) { big = scale2x(big, w * k, h * k); k *= 2; }
    const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    const ow = Math.max(1, Math.round(Math.abs(w * cos) + Math.abs(h * sin))), oh = Math.max(1, Math.round(Math.abs(w * sin) + Math.abs(h * cos)));
    const out = new Uint32Array(ow * oh), bw = w * k, bh = h * k;
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      const dx = x + 0.5 - ow / 2, dy = y + 0.5 - oh / 2;
      const sx = Math.floor((dx * cos + dy * sin + w / 2) * k), sy = Math.floor((-dx * sin + dy * cos + h / 2) * k);
      if (sx >= 0 && sy >= 0 && sx < bw && sy < bh) out[y * ow + x] = big[sy * bw + sx];
    }
    return { data: out, w: ow, h: oh };
  };
  /* Диалог с живым предпросмотром: крутит выделенное, а без выделения — весь слой. */
  E.rotateDialog = async function () {
    const doc = NPR.doc;
    if (!doc.float && !E.lift()) return;
    const f = doc.float, src = { data: f.data, w: f.w, h: f.h, x: f.x, y: f.y, mask: f.mask };
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    const apply = (deg) => {
      const r = deg % 360 === 0 ? { data: src.data, w: src.w, h: src.h } : E.rotateAny(src.data, src.w, src.h, deg);
      f.data = r.data; f.w = r.w; f.h = r.h; f.mask = deg % 360 === 0 ? src.mask : null;
      f.x = Math.round(cx - r.w / 2); f.y = Math.round(cy - r.h / 2);
      if (!f.whole) doc.sel = floatSel(f);
      floatCanvas(f);
      V.redrawOver();
    };
    const v = await NPR.dialog({
      title: 'Повернуть на угол', okLabel: 'Повернуть',
      fields: [
        { id: 'deg', label: 'Угол, градусов по часовой', type: 'number', value: 15, min: -360, max: 360 },
        { type: 'note', label: 'Результат виден на холсте сразу. После поворота пиксели остаются «в воздухе»: их можно подвинуть, Enter закрепляет.' },
      ],
      check: (x) => { if (Number.isFinite(x.deg)) apply(x.deg); return Number.isFinite(x.deg) ? null : { error: 'Введите число' }; },
    });
    if (!v) { apply(0); if (f.whole) E.cancelFloat(); }
    else { f.label = 'Поворот'; NPR.setTool('move'); }
  };

  function rot90(src, w, h, cw) {
    const out = new src.constructor(w * h); // новый размер: h×w
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const nx = cw ? h - 1 - y : y, ny = cw ? x : w - 1 - x;
      out[ny * h + nx] = src[y * w + x];
    }
    return out;
  }
  NPR.rot90 = rot90;
})(window.NPR);
