'use strict';
/* Ткань: плащи, флаги, волосы, юбки, ленты.

   Как устроено.
   1. Область ткани — выделение (или весь рисунок слоя). Поверх неё кладётся сетка
      узлов с шагом в несколько пикселей; узлы связаны «пружинками» по сторонам
      клеток (и через одну — для жёсткости).
   2. Гвозди — узлы, которые не двигаются: плечи у плаща, древко у флага, макушка
      у волос, пояс у юбки. Ставятся сами по типу ткани, щелчком их можно менять.
   3. Физика — интегрирование Верле: тяжесть, ветер с волной и порывами, затухание.
      Все силы повторяются с периодом в N кадров; сначала ткань «раскачивается»
      несколько кругов, потом записывается один круг, а остаток шва
      растягивается по кадрам — цикл получается бесшовным.
   4. Рисунок деформируется по треугольникам сетки ближайшим соседом — пиксели
      остаются пикселями. По желанию добавляются тени складок: гребни волны
      светлее, впадины темнее (сдвиг тона, как у «Света»). */
(function (NPR) {
  const U = NPR.util, V = NPR.view, S = NPR.state, { el } = U;
  const $ = (id) => document.getElementById(id);
  const C = (NPR.cloth = { o: null, pins: null, frames: null, f: 0, timer: 0, sim: null });
  const KEY = 'npr.cloth';

  const TYPES = {
    cape: { name: 'Плащ', pin: 'top', g: 0.35, wind: 0.5, dir: 0, wave: 1, gust: 0.35, stiff: 0.9, strand: 1, sway: 0, amp: 1, flutter: 2.5 },
    flag: { name: 'Флаг', pin: 'left', g: 0.12, wind: 1.1, dir: 0, wave: 1, gust: 0.25, stiff: 0.85, strand: 1, sway: 0, amp: 1, flutter: 2.5 },
    banner: { name: 'Знамя / лента', pin: 'top', g: 0.3, wind: 0.6, dir: 0, wave: 1, gust: 0.4, stiff: 0.6, strand: 1, sway: 0, amp: 1, flutter: 2 },
    hair: { name: 'Волосы', pin: 'top', g: 0.4, wind: 0.45, dir: 0, wave: 1, gust: 0.5, stiff: 0.7, strand: 0.12, sway: 0, amp: 1, flutter: 1.2 },
    skirt: { name: 'Юбка / мантия', pin: 'top', g: 0.45, wind: 0.15, dir: 0, wave: 1, gust: 0.1, stiff: 0.9, strand: 1, sway: 1.2, amp: 1, flutter: 1.5 },
  };
  C.TYPES = TYPES;
  const DEF = { type: 'cape', frames: 8, fps: 10, step: 0, folds: true, foldK: 1, out: 'layer', ...TYPES.cape };

  /* ---------- сетка ---------- */
  function regionMask(doc, L) {
    const W = doc.width, H = doc.height, d = L.data, sel = doc.sel, m = new Uint8Array(W * H);
    let n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (d[i] >>> 24 && (!sel || NPR.selection.has(sel, x, y))) { m[i] = 1; n++; }
    }
    return n ? m : null;
  }
  C.build = function (doc, L, o, pinsIn) {
    const W = doc.width, H = doc.height, mask = regionMask(doc, L);
    if (!mask) return null;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0; i < mask.length; i++) if (mask[i]) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const s = o.step || U.clamp(Math.round(Math.min(bw, bh) / 8), 2, 6);
    const cols = Math.ceil(bw / s) + 1, rows = Math.ceil(bh / s) + 1;
    // узел жив, если рядом (в соседних клетках) есть ткань
    const cellHas = new Uint8Array((cols - 1) * (rows - 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mask[y * W + x]) cellHas[Math.floor((y - y0) / s) * (cols - 1) + Math.floor((x - x0) / s)] = 1;
    const alive = new Uint8Array(cols * rows);
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) if (cellHas[j * (cols - 1) + i]) alive[j * cols + i] = alive[j * cols + i + 1] = alive[(j + 1) * cols + i] = alive[(j + 1) * cols + i + 1] = 1;
    const n = cols * rows, rx = new Float32Array(n), ry = new Float32Array(n);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { rx[j * cols + i] = x0 + i * s; ry[j * cols + i] = y0 + j * s; }
    // гвозди
    let pins = new Uint8Array(n);
    if (pinsIn && pinsIn.length === n) pins = Uint8Array.from(pinsIn);
    else if (o.pin === 'top' || o.pin === 'bottom') for (let i = 0; i < cols; i++) {
      const rng = o.pin === 'top' ? [...Array(rows).keys()] : [...Array(rows).keys()].reverse();
      const j = rng.find((jj) => alive[jj * cols + i]);
      if (j !== undefined) pins[j * cols + i] = 1;
    } else for (let j = 0; j < rows; j++) {
      const rng = o.pin === 'left' ? [...Array(cols).keys()] : [...Array(cols).keys()].reverse();
      const i = rng.find((ii) => alive[j * cols + ii]);
      if (i !== undefined) pins[j * cols + i] = 1;
    }
    // связи: [a, b, длина, жёсткость]
    const links = [];
    const link = (a, b, k) => { if (alive[a] && alive[b]) links.push([a, b, Math.hypot(rx[a] - rx[b], ry[a] - ry[b]), k]); };
    const along = o.pin === 'left' || o.pin === 'right' ? 'h' : 'v'; // вдоль прядей — от гвоздей
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = j * cols + i;
      if (i + 1 < cols) link(a, a + 1, along === 'h' ? 1 : o.strand);
      if (j + 1 < rows) link(a, a + cols, along === 'v' ? 1 : o.strand);
      if (i + 1 < cols && j + 1 < rows) { link(a, a + cols + 1, 0.5 * o.strand); link(a + 1, a + cols, 0.5 * o.strand); }
      if (i + 2 < cols) link(a, a + 2, 0.4 * o.stiff * (along === 'h' ? 1 : o.strand)); // изгиб
      if (j + 2 < rows) link(a, a + 2 * cols, 0.4 * o.stiff * (along === 'v' ? 1 : o.strand));
    }
    return { W, H, mask, x0, y0, x1, y1, s, cols, rows, alive, pins, rx, ry, links, src: L.data };
  };

  /* ---------- физика ---------- */
  C.simulate = function (g, o) {
    const N = o.frames, n = g.cols * g.rows, SUB = 10, dt = 1;
    const x = Float32Array.from(g.rx), y = Float32Array.from(g.ry), px = Float32Array.from(g.rx), py = Float32Array.from(g.ry);
    const ang = (o.dir * Math.PI) / 180, wx = Math.cos(ang), wy = Math.sin(ang);
    const span = Math.max(1, (g.x1 - g.x0) * Math.abs(wx) + (g.y1 - g.y0) * Math.abs(wy) + g.s);
    const weight = 0.4 + o.g; // тяжёлая ткань меньше слушается ветра
    const scale = g.s / 3; // силы в пикселях на клетку
    const out = [];
    const total = (6 + 1) * N * SUB; // 6 кругов раскачки + 1 запись
    for (let step = 0; step < total; step++) {
      const t = (step / SUB) / N; // время в «кругах»
      const ph = t * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        if (!g.alive[k]) continue;
        if (g.pins[k]) {
          // гвозди юбки качаются из стороны в сторону, как при ходьбе
          const sw = o.sway ? Math.sin(ph) * o.sway * scale * 0.6 : 0;
          x[k] = g.rx[k] + sw; y[k] = g.ry[k]; px[k] = x[k]; py[k] = y[k];
          continue;
        }
        // ветер: основа + бегущая волна вдоль ткани + порывы (целые частоты — период ровно круг)
        const along = ((g.rx[k] - g.x0) * wx + (g.ry[k] - g.y0) * wy) / span;
        const gust = o.gust * (0.6 * Math.sin(ph * 2 + 1.3) + 0.4 * Math.sin(ph * 3 + along * 4));
        const w = (o.wind * (0.75 + 0.25 * Math.sin(ph * o.wave - along * Math.PI * 2 * o.wave)) + gust * o.wind) / weight;
        const perp = o.wind * 0.35 * Math.sin(ph * o.wave * 1 - along * Math.PI * 2 * o.wave) / weight; // хлопанье поперёк ветра
        const ax = (wx * w - wy * perp) * 0.06 * scale + (o.sway ? 0 : 0);
        const ay = (wy * w + wx * perp) * 0.06 * scale + o.g * 0.05 * scale;
        const vx = (x[k] - px[k]) * 0.96, vy = (y[k] - py[k]) * 0.96;
        px[k] = x[k]; py[k] = y[k];
        x[k] += vx + ax * dt; y[k] += vy + ay * dt;
      }
      for (let it = 0; it < 5; it++) for (const [a, b, len, kk] of g.links) {
        const dx = x[b] - x[a], dy = y[b] - y[a], d = Math.hypot(dx, dy) || 1e-6, diff = ((d - len) / d) * 0.5 * Math.min(1, kk);
        const pa = g.pins[a] ? 0 : 1, pb = g.pins[b] ? 0 : 1, sum = pa + pb;
        if (!sum) continue;
        const fx = dx * diff * 2 / sum, fy = dy * diff * 2 / sum;
        x[a] += fx * pa; y[a] += fy * pa; x[b] -= fx * pb; y[b] -= fy * pb;
      }
      if (step >= 6 * N * SUB && (step - 6 * N * SUB) % SUB === 0) out.push([Float32Array.from(x), Float32Array.from(y)]);
    }
    // шов цикла: разница между «после последнего» и первым кадром растягивается по кругу
    const endX = x, endY = y, [fx0, fy0] = out[0];
    for (let f = 0; f < N; f++) {
      const k = f / N, [X, Y] = out[f];
      for (let i = 0; i < n; i++) { X[i] -= (endX[i] - fx0[i]) * k; Y[i] -= (endY[i] - fy0[i]) * k; }
    }
    // размах: насколько сильно ткань уходит от рисунка
    for (const [X, Y] of out) for (let i = 0; i < n; i++) { X[i] = g.rx[i] + (X[i] - g.rx[i]) * o.amp; Y[i] = g.ry[i] + (Y[i] - g.ry[i]) * o.amp; }
    // трепет: волна бежит от гвоздей к свободному краю, поперёк ткани.
    // В плоском рисунке натянутая ткань сама почти не волнуется — волну задаём явно.
    const flutter = o.flutter ?? 0;
    if (flutter > 0) {
      const dist = new Float32Array(n).fill(Infinity), q = [];
      for (let i = 0; i < n; i++) if (g.alive[i] && g.pins[i]) { dist[i] = 0; q.push(i); }
      for (let h = 0; h < q.length; h++) { // обход в ширину по живым узлам
        const a = q[h], ai = a % g.cols, aj = (a / g.cols) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const bi = ai + di, bj = aj + dj, b = bj * g.cols + bi;
          if (bi < 0 || bj < 0 || bi >= g.cols || bj >= g.rows || !g.alive[b] || dist[b] <= dist[a] + 1) continue;
          dist[b] = dist[a] + 1; q.push(b);
        }
      }
      let maxD = 1;
      for (let i = 0; i < n; i++) if (Number.isFinite(dist[i]) && dist[i] > maxD) maxD = dist[i];
      // поперёк — перпендикулярно направлению от гвоздей
      const across = o.pin === 'left' || o.pin === 'right' ? [0, 1] : [1, 0];
      for (let f = 0; f < N; f++) {
        const ph = (f / N) * Math.PI * 2, gm = 1 + (o.gust || 0) * 0.6 * Math.sin(ph * 2 + 0.7), [X, Y] = out[f];
        for (let i = 0; i < n; i++) {
          if (!g.alive[i] || !Number.isFinite(dist[i]) || g.pins[i]) continue;
          const u = dist[i] / maxD, v = flutter * u * gm * Math.sin(ph - u * Math.PI * 2 * Math.max(0.5, o.wave));
          X[i] += across[0] * v; Y[i] += across[1] * v;
        }
      }
    }
    return out;
  };

  /* ---------- рисунок по сетке ---------- */
  C.renderFrame = function (g, pos, o) {
    const { W, H, mask, src, cols, rows, s } = g, [X, Y] = pos;
    const out = src.slice();
    for (let i = 0; i < mask.length; i++) if (mask[i]) out[i] = 0; // ткань рисуется заново
    const done = new Uint8Array(W * H);
    // тени складок: наклон смещения поперёк ткани
    const shadeAt = (i, j, fx, fy) => {
      if (!o.folds) return 0;
      const a = j * cols + i, b = j * cols + Math.min(cols - 1, i + 1), c = Math.min(rows - 1, j + 1) * cols + i;
      const ddx = (X[b] - g.rx[b]) - (X[a] - g.rx[a]), ddy = (Y[c] - g.ry[c]) - (Y[a] - g.ry[a]);
      const sx = (Y[b] - g.ry[b]) - (Y[a] - g.ry[a]), sy = (X[c] - g.rx[c]) - (X[a] - g.rx[a]);
      // сжатие — впадина (темнее), наклон к свету (сверху слева) — светлее
      const v = (ddx + ddy) / s * 1.1 - (sx + sy) / s * 1.0;
      return Math.max(-2, Math.min(2, Math.round(v * o.foldK)));
    };
    const tri = (ia, ib, ic, shade) => {
      const ax = X[ia], ay = Y[ia], bx = X[ib], by = Y[ib], cx = X[ic], cy = Y[ic];
      const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(det) < 1e-6) return;
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
        const qx = px + 0.5, qy = py + 0.5;
        const l1 = ((bx - qx) * (cy - qy) - (cx - qx) * (by - qy)) / det, l2 = ((cx - qx) * (ay - qy) - (ax - qx) * (cy - qy)) / det, l3 = 1 - l1 - l2;
        if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
        // точка в покое: узлы стоят в углах пикселей, поэтому без деформации это тот же пиксель
        const ux = Math.floor(l1 * g.rx[ia] + l2 * g.rx[ib] + l3 * g.rx[ic] + 1e-4), uy = Math.floor(l1 * g.ry[ia] + l2 * g.ry[ib] + l3 * g.ry[ic] + 1e-4);
        if (ux < 0 || uy < 0 || ux >= W || uy >= H) continue;
        const si = uy * W + ux;
        if (!mask[si]) continue;
        const di = py * W + px;
        if (done[di]) continue;
        done[di] = 1;
        let c = src[si];
        if (shade) c = NPR.fx.tone(c, shade, 'hsv');
        out[di] = c;
      }
    };
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      if (!(g.alive[a] && g.alive[b] && g.alive[c] && g.alive[d])) continue;
      const sh = shadeAt(i, j);
      tri(a, b, d, sh); tri(a, d, c, sh);
    }
    return out;
  };
  C.bakeFrames = function (doc, L, o, pins) {
    const g = C.build(doc, L, o, pins);
    if (!g) return null;
    NPR.fx.resetTone();
    const sim = C.simulate(g, o);
    return { g, frames: sim.map((p) => C.renderFrame(g, p, o)) };
  };

  /* ---------- заготовки: нарисовать основу ткани ---------- */
  C.template = function (type) {
    const doc = NPR.doc, W = doc.width, H = doc.height, d = new Uint32Array(W * H);
    const main = (S.primary | 0xff000000) >>> 0, dark = NPR.fx.tone(main, -1, 'hsv'), light = NPR.fx.tone(main, 1, 'hsv'), line = (S.secondary | 0xff000000) >>> 0;
    const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) d[y * W + x] = c; };
    const cx = W / 2, top = Math.round(H * 0.2), h = Math.round(H * 0.6), w = Math.round(W * 0.45);
    if (type === 'flag' || type === 'banner') {
      const px = Math.round(W * 0.25);
      if (type === 'flag') { for (let y = top - 2; y < top + h; y++) { put(px - 1, y, line); put(px - 2, y, line); } put(px - 1, top - 3, light); }
      const fw = type === 'flag' ? Math.round(W * 0.5) : Math.round(W * 0.3), fh = type === 'flag' ? Math.round(h * 0.5) : h;
      const fx0 = type === 'flag' ? px : Math.round(cx - fw / 2);
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        // ласточкин хвост у флага, острый низ у знамени
        if (type === 'flag' && x > fw * 0.8 && Math.abs(y - fh / 2) < (x - fw * 0.8) * 0.9) continue;
        if (type === 'banner' && y > fh * 0.85 && Math.abs(x - fw / 2) < (y - fh * 0.85) * 1.6) continue;
        put(fx0 + x, top + y, y < 1 || x < 1 ? light : y % 6 === 5 ? dark : main);
      }
    } else if (type === 'hair') {
      const n = Math.max(3, Math.round(w / 3));
      for (let k = 0; k < n; k++) {
        const x0 = cx - w / 2 + (k + 0.5) * (w / n), len = h * (0.7 + 0.3 * Math.sin(k * 2.1) ** 2);
        for (let y = 0; y < len; y++) {
          const th = Math.max(1, Math.round((w / n) * (1 - y / len) * 0.9));
          for (let t = 0; t < th; t++) put(x0 + t - th / 2 + Math.sin(y / 9 + k) * 1.2, top + y, t === 0 ? dark : t === th - 1 && th > 1 ? light : main);
        }
      }
    } else { // плащ и юбка: трапеция с подолом
      const flare = type === 'skirt' ? 0.75 : 0.35, hh = type === 'skirt' ? Math.round(h * 0.6) : h;
      for (let y = 0; y < hh; y++) {
        const half = (w / 2) * (1 - flare + flare * (y / hh) * 2 * (type === 'skirt' ? 0.8 : 1)) + (type === 'skirt' ? 0 : 0);
        const hem = type === 'skirt' ? Math.abs(Math.sin((y / hh) * 3)) : 0;
        for (let x = -half; x <= half; x++) {
          const fold = Math.sin((x / half) * Math.PI * (type === 'skirt' ? 3 : 2));
          put(cx + x, top + y, Math.abs(x) > half - 1 ? dark : fold > 0.6 ? light : fold < -0.6 ? dark : main);
        }
        if (y === hh - 1) for (let x = -half; x <= half; x++) if ((Math.round(x) & 3) === 0 && type === 'skirt') put(cx + x, top + y + 1, dark);
        void hem;
      }
    }
    NPR.ops.snap('Заготовка: ' + TYPES[type].name, (D) => {
      const L = D.newLayer(NPR.t(TYPES[type].name), d);
      D.addLayerRaw(L, D.indexOf(D.activeId) + 1);
      D.activeId = L.id;
    });
    NPR.doc.sel = null;
    C.pins = null;
    C.rebuild();
    NPR.toast(`Заготовка «${TYPES[type].name}» — новым слоем. Дорисуйте её или сразу запустите ▶`);
  };

  /* ---------- предпросмотр ---------- */
  let dirty = true, debounce = 0;
  C.rebuild = function () { dirty = true; clearTimeout(debounce); debounce = setTimeout(() => { if (S.tool === 'cloth') { compute(); V.redrawOver(); } }, 120); };
  function compute() {
    dirty = false;
    const doc = NPR.doc, L = doc.active;
    C.sim = null; C.frames = null;
    if (!L || L.particles) return;
    const r = C.bakeFrames(doc, L, C.o, C.pins);
    if (!r) return;
    C.sim = r.g;
    if (!C.pins || C.pins.length !== r.g.pins.length) C.pins = Array.from(r.g.pins);
    // предпросмотр — весь рисунок, где вместо этого слоя его ткань (иначе оригинал двоится)
    const comp = (fr) => {
      const out = new Uint32Array(fr.length);
      for (const X of doc.layers) {
        if (!X.visible || X.opacity <= 0) continue;
        const srcd = X === L ? fr : X.data;
        for (let i = 0; i < out.length; i++) { const c = srcd[i]; if (!(c >>> 24)) continue; out[i] = !(out[i] >>> 24) || c >>> 24 === 255 ? c : U.blend(out[i], c); }
      }
      return out;
    };
    C.frames = r.frames.map(comp).map((f) => { const c = document.createElement('canvas'); c.width = doc.width; c.height = doc.height; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(f.buffer.slice(0)), doc.width, doc.height), 0, 0); return c; });
    C.f %= C.frames.length;
    const info = $('clInfo');
    if (info) info.textContent = `сетка ${r.g.cols}×${r.g.rows}, шаг ${r.g.s} px, гвоздей ${C.pins.filter(Boolean).length}`;
  }
  function play(on) {
    clearInterval(C.timer); C.timer = 0;
    if (on) C.timer = setInterval(() => { if (dirty) compute(); if (C.frames) { C.f = (C.f + 1) % C.frames.length; V.redrawOver(); } }, 1000 / U.clamp(C.o.fps, 1, 30));
    const b = $('clPlay'); if (b) b.textContent = C.timer ? '❚❚' : '▶';
  }
  C.drawOverlay = function (ctx) {
    if (S.tool !== 'cloth') return;
    if (dirty) compute();
    const doc = NPR.doc, z = V.zoom, g = C.sim;
    if (C.frames && C.frames[C.f]) {
      ctx.save(); ctx.translate(V.ox, V.oy); ctx.fillStyle = V.checkerPattern(ctx); ctx.fillRect(0, 0, doc.width * z, doc.height * z); ctx.restore();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(C.frames[C.f], V.ox, V.oy, doc.width * z, doc.height * z);
    }
    if (!g) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let j = 0; j < g.rows; j++) for (let i = 0; i < g.cols; i++) {
      const a = j * g.cols + i;
      if (!g.alive[a]) continue;
      const X = V.ox + g.rx[a] * z, Y = V.oy + g.ry[a] * z;
      if (i + 1 < g.cols && g.alive[a + 1]) { ctx.moveTo(X, Y); ctx.lineTo(X + g.s * z, Y); }
      if (j + 1 < g.rows && g.alive[a + g.cols]) { ctx.moveTo(X, Y); ctx.lineTo(X, Y + g.s * z); }
    }
    ctx.stroke();
    for (let k = 0; k < g.pins.length; k++) {
      if (!C.pins || !C.pins[k]) continue;
      const X = V.ox + g.rx[k] * z, Y = V.oy + g.ry[k] * z;
      ctx.beginPath(); ctx.arc(X, Y, 4, 0, Math.PI * 2); ctx.fillStyle = '#ff5c5c'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke();
    }
  };
  /* Щелчок — поставить или убрать гвоздь у ближайшего узла. */
  NPR.tools.cloth = {
    down(p) {
      const g = C.sim;
      if (!g) { NPR.toast('Выделите ткань (плащ, флаг…) или нарисуйте заготовку — тогда появится сетка'); return false; }
      let best = -1, bd = Infinity;
      for (let k = 0; k < g.pins.length; k++) { if (!g.alive[k]) continue; const d = Math.hypot(g.rx[k] - p.x - 0.5, g.ry[k] - p.y - 0.5); if (d < bd) { bd = d; best = k; } }
      if (best < 0 || bd > g.s * 1.5) return false;
      C.pins[best] = C.pins[best] ? 0 : 1;
      C.rebuild();
      return false;
    },
    move() {}, up() {}, cancel() {},
  };

  /* ---------- запечь ---------- */
  C.bake = function () {
    const doc = NPR.doc, L = doc.active;
    if (!L) return;
    const r = C.bakeFrames(doc, L, C.o, C.pins);
    if (!r) return NPR.toast('Нет ткани: выделите её или нарисуйте заготовку', true);
    NPR.ops.snap('Ткань', (d) => {
      const T = d.getLayer(L.id);
      if (C.o.out === 'self') { T.frames = r.frames; T.frame = 0; T.data = r.frames[0]; T.depths = null; }
      else {
        const name = T.name + NPR.t(' — ткань'), old = d.layers.find((l) => l.name === name);
        if (old) d.layers.splice(d.indexOf(old.id), 1);
        const N = d.newLayer(name, r.frames[0]); N.frames = r.frames; N.frame = 0;
        d.addLayerRaw(N, d.indexOf(T.id) + 1);
        T.visible = false; // оригинал спрятан, но цел
        d.activeId = N.id;
      }
    });
    NPR.toast(`Ткань: ${r.frames.length} кадров, бесшовный цикл. Проиграть — в полосе кадров`);
  };

  /* ---------- панель ---------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify(C.o)); } catch (e) { /* не страшно */ } }
  function render() {
    const o = C.o, box = $('clOpts');
    const num = (k, lo, hi, step, lab, title) => {
      const i = el('input', { type: 'number', min: lo, max: hi, step, value: +(+o[k]).toFixed(3), inputmode: 'decimal' });
      i.addEventListener('input', () => { if (i.value === '' || Number.isNaN(+i.value)) return; o[k] = U.clamp(+i.value, lo, hi); save(); C.rebuild(); if (k === 'fps' && C.timer) play(true); });
      return el('label', { title: title || '' }, lab, i);
    };
    const chk = (k, lab, title) => { const c = el('input', { type: 'checkbox' }); c.checked = !!o[k]; c.addEventListener('change', () => { o[k] = c.checked; save(); C.rebuild(); }); return el('label', { class: 'chk', title: title || '' }, c, ' ' + lab); };
    const types = el('div', { class: 'pforms' }, Object.entries(TYPES).map(([k, t]) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(o.type === k) }, t.name);
      b.addEventListener('click', () => { Object.assign(o, TYPES[k], { type: k }); C.pins = null; save(); render(); C.rebuild(); });
      return b;
    }));
    const frames = el('select', { title: 'Длина цикла' }, [4, 6, 8, 12, 16].map((n) => el('option', { value: n, selected: n === +o.frames }, n + ' кадров')));
    frames.addEventListener('change', () => { o.frames = +frames.value; save(); C.rebuild(); });
    const pinSel = el('select', { title: 'Где гвозди по умолчанию' }, [['top', 'сверху'], ['left', 'слева'], ['right', 'справа'], ['bottom', 'снизу']].map(([v, t]) => el('option', { value: v, selected: o.pin === v }, t)));
    pinSel.addEventListener('change', () => { o.pin = pinSel.value; C.pins = null; save(); C.rebuild(); });
    const out = el('select', null, [['layer', 'новым слоем (оригинал спрячется)'], ['self', 'в этот слой']].map(([v, t]) => el('option', { value: v, selected: o.out === v }, t)));
    out.addEventListener('change', () => { o.out = out.value; save(); });
    const tpl = el('button', { type: 'button', title: 'Нарисовать основу выбранного типа основным цветом — потом дорисуйте' }, 'Нарисовать заготовку');
    tpl.addEventListener('click', () => C.template(o.type));
    const reset = el('button', { type: 'button', title: 'Гвозди снова по типу ткани' }, 'Гвозди по умолчанию');
    reset.addEventListener('click', () => { C.pins = null; C.rebuild(); });
    box.replaceChildren(
      el('h4', null, 'Тип'), types,
      el('div', { class: 'row' }, tpl),
      el('h4', null, 'Гвозди'),
      el('div', { class: 'row' }, el('label', null, 'где', pinSel), reset),
      el('p', { class: 'lbl' }, 'Щелчок по узлу сетки — поставить или убрать гвоздь (красные точки).'),
      el('h4', null, 'Ветер'),
      el('div', { class: 'row' }, num('wind', 0, 3, 0.05, 'сила'), num('dir', -180, 180, 5, 'направление°', '0 — вправо, 180 — влево, 90 — вниз')),
      el('div', { class: 'row' }, num('flutter', 0, 12, 0.5, 'трепет, px', 'Высота волны на свободном краю'), num('wave', 0.5, 4, 0.5, 'волн', 'Сколько волн помещается по длине ткани')),
      el('div', { class: 'row' }, num('gust', 0, 1, 0.05, 'порывы')),
      el('h4', null, 'Ткань'),
      el('div', { class: 'row' }, num('g', 0, 1.5, 0.05, 'тяжесть', 'Шёлк — 0.1, кожа и кольчуга — 1'), num('stiff', 0, 1, 0.05, 'жёсткость')),
      el('div', { class: 'row' }, num('strand', 0.02, 1, 0.02, 'сцепление прядей', 'Меньше — пряди волос и бахрома двигаются отдельно'), num('sway', 0, 3, 0.1, 'качание', 'Гвозди качаются из стороны в сторону — юбка при ходьбе')),
      el('div', { class: 'row' }, num('amp', 0.1, 3, 0.1, 'размах', 'Насколько сильно ткань отходит от рисунка'), num('step', 0, 12, 1, 'шаг сетки', '0 — сам; меньше — мягче ткань, но медленнее')),
      el('h4', null, 'Складки'),
      el('div', { class: 'row' }, chk('folds', 'тени складок', 'Гребни волн светлее, впадины темнее — сдвиг тона по палитре'), num('foldK', 0, 3, 0.1, 'сила')),
      el('h4', null, 'Результат'),
      el('div', { class: 'row' }, el('label', null, 'цикл', frames), num('fps', 1, 30, 1, 'к/с')),
      el('div', { class: 'row' }, el('label', null, 'куда', out)),
    );
  }
  C.show = function (on) {
    $('clPanel').hidden = !on;
    if (on) { render(); C.rebuild(); play(true); } else play(false);
    V.redrawOver();
  };
  C.init = function () {
    try { C.o = { ...DEF, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (e) { C.o = { ...DEF }; }
    $('clPlay').addEventListener('click', () => play(!C.timer));
    $('clBake').addEventListener('click', C.bake);
    for (const ev of ['layers', 'sel', 'docChanged', 'resized']) NPR.on(ev, () => { if (S.tool === 'cloth') { if (ev !== 'docChanged') C.pins = null; C.rebuild(); } });
  };
})(window.NPR);
