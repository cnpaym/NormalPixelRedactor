'use strict';
/* Свет и текстура — один инструмент с живым предпросмотром.

   Работает только по закрашенным пикселям активного слоя: внутри выделения,
   а без выделения — по всему объекту. Цвет пикселя не смешивается с чёрным
   или белым, а сдвигается на несколько тонов (по палитре или по яркости).

   Откуда берётся сдвиг тона:
   - свет: по карте высот считается наклон поверхности; склоны к свету
     светлеют, от света — темнеют;
   - карта высот = объём от края фигуры + нарисованная глубина
     (выпуклое, ровное, три уровня углубления);
   - текстура: серый 128 ничего не меняет, светлее — осветляет, темнее — затемняет;
     с галочкой «рельеф» текстура ещё и добавляется к высоте, и на ней появляются блики;
   - «свечение»: такие пиксели не затеняются, становятся светлее и подсвечивают соседей. */
(function (NPR) {
  const S = NPR.state, U = NPR.util, V = NPR.view, Sel = NPR.selection, { el } = U;
  const $ = (id) => document.getElementById(id);
  const X = (NPR.fx = { session: null, textures: [], tex: null, brush: 0 });
  const KEY = 'npr.textures', OPT = 'npr.fx';

  /* Настройки инструмента. */
  const P = (X.params = {
    light: true, angle: 225, strength: 60, // angle — с какой стороны свет (225° = сверху слева)
    bevel: true, bevelW: 3,
    steps: 2, mode: 'hsv', // hsv | ramp (по палитре)
    texScale: 1, texStrength: 50, texRelief: false,
    glow: 2,
  });
  /* Уровни глубины. h — высота в пикселях, amb — затемнение дна. */
  const LEVELS = [
    null,
    { name: 'Выпуклое', h: 2, amb: 0, color: [255, 220, 80] },
    { name: 'Ровное', h: 0, amb: 0, color: [150, 150, 150] },
    { name: 'Углубление: небольшое', h: -1, amb: 0, color: [90, 170, 255] },
    { name: 'Углубление: среднее', h: -2, amb: 1, color: [50, 100, 230] },
    { name: 'Углубление: глубокое', h: -3, amb: 2, color: [40, 40, 160] },
    { name: 'Свечение', h: 0, amb: 0, color: [255, 60, 220] },
  ];
  const GLOW = 6;

  /* ---------- сдвиг тона ---------- */
  const luma = (c) => (c & 255) * 0.299 + ((c >>> 8) & 255) * 0.587 + ((c >>> 16) & 255) * 0.114;
  let toneCache = new Map(), ramp = null;
  function hsvTone(c, n) {
    let [h, s, v] = U.rgbToHsv(c & 255, (c >>> 8) & 255, (c >>> 16) & 255);
    v = U.clamp(v + n * 0.11, 0.02, 1);
    s = U.clamp(s - n * 0.07, 0, 1);
    if (s > 0.02) { // свет уходит в тёплый, тень — в холодный оттенок
      const target = n > 0 ? 55 : 245, d = ((target - h + 540) % 360) - 180;
      h += Math.sign(d) * Math.min(Math.abs(d), Math.abs(n) * 5);
    }
    const [r, g, b] = U.hsvToRgb(h, s, v);
    return U.rgba(r, g, b, c >>> 24);
  }
  function rampTone(c, n) {
    if (!ramp) ramp = NPR.palette.current().colors.map(U.parseHex).filter((p) => p !== null && p >>> 24 === 255).map((p) => ({ c: p, l: luma(p) }));
    let cur = (c | 0xff000000) >>> 0;
    for (let k = 0; k < Math.abs(n); k++) {
      const l = luma(cur), dirn = Math.sign(n);
      let best = null, bd = Infinity;
      for (const p of ramp) {
        if ((p.l - l) * dirn < 6) continue; // нужен заметно более светлый (или тёмный) цвет
        const dr = (p.c & 255) - (cur & 255), dg = ((p.c >>> 8) & 255) - ((cur >>> 8) & 255), db = ((p.c >>> 16) & 255) - ((cur >>> 16) & 255);
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = p.c; }
      }
      if (best === null) return k === 0 ? hsvTone(c, n) : ((cur & 0xffffff) | (c & 0xff000000)) >>> 0; // в палитре нет подходящего тона
      cur = best;
    }
    return ((cur & 0xffffff) | (c & 0xff000000)) >>> 0;
  }
  function tone(c, n) {
    if (n === 0) return c;
    const key = c * 16 + (n + 8);
    let v = toneCache.get(key);
    if (v === undefined) { v = P.mode === 'ramp' ? rampTone(c, n) : hsvTone(c, n); toneCache.set(key, v); }
    return v;
  }

  X.tone = tone;
  X.resetTone = () => { toneCache = new Map(); ramp = null; };

  /* ---------- карта глубины ----------
     У обычного слоя карта одна, у спрайтшита — отдельная на каждый кадр. */
  X.depthOf = function (L, create) {
    const n = NPR.doc.width * NPR.doc.height;
    if (L.frames) {
      if (!L.depths) { if (!create) return null; L.depths = []; }
      let d = L.depths[L.frame];
      if ((!d || d.length !== n) && create) d = L.depths[L.frame] = new Uint8Array(n);
      return d && d.length === n ? d : null;
    }
    if ((!L.depth || L.depth.length !== n) && create) L.depth = new Uint8Array(n);
    return L.depth && L.depth.length === n ? L.depth : null;
  };
  /* Команда отмены для правки карты: индексы и значения «до/после». */
  function depthCmd(L, changes, label) {
    const n = changes.size, idx = new Uint32Array(n), before = new Uint8Array(n), after = new Uint8Array(n), cur = X.depthOf(L, true);
    let k = 0;
    for (const [i, old] of changes) { idx[k] = i; before[k] = old; after[k] = cur[i]; k++; }
    const layerId = L.id, frame = L.frames ? L.frame : -1;
    const apply = (doc, vals) => {
      const T = doc.getLayer(layerId);
      if (!T) return;
      if (T.frames && frame >= 0 && frame < T.frames.length && T.frame !== frame) { T.frame = frame; T.data = T.frames[frame]; doc.markAllDirty(); }
      const d = X.depthOf(T, true);
      for (let j = 0; j < n; j++) d[idx[j]] = vals[j];
      depthDirty = true;
      schedule(); V.redrawOver();
    };
    return { label, isDepth: true, bytes: n * 6 + 64, undo: (doc) => apply(doc, before), redo: (doc) => apply(doc, after) };
  }

  /* ---------- текстуры ----------
     Текстура — серая картинка {name, w, h, g: Uint8Array}, повторяется плиткой. */
  function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /* Бесшовный шум: случайная решётка n×n, сглаженная и замкнутая по краям. */
  function noise(size, cell, seed) {
    const n = size / cell, r = rng(seed), grid = Float32Array.from({ length: n * n }, r), out = new Float32Array(size * size);
    const sm = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = sm(gx - x0), fy = sm(gy - y0);
      const at = (i, j) => grid[(j % n) * n + (i % n)];
      out[y * size + x] = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
    }
    return out;
  }
  /* Привести к среднему 128 и растянуть контраст. */
  function normalize(f) {
    let mean = 0;
    for (const v of f) mean += v;
    mean /= f.length;
    let dev = 1e-6;
    for (const v of f) dev = Math.max(dev, Math.abs(v - mean));
    return Uint8Array.from(f, (v) => Math.round(128 + ((v - mean) / dev) * 120));
  }
  function builtins() {
    const N = 32, make = (name, fn, w = N, h = N) => { const f = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = fn(x, y); return { name, w, h, g: normalize(f), builtin: true }; };
    const n8 = noise(N, 8, 11), n4 = noise(N, 4, 23), n2 = noise(N, 2, 37), n16 = noise(N, 16, 5);
    const fbm = (x, y) => n8[y * N + x] * 0.55 + n4[y * N + x] * 0.3 + n2[y * N + x] * 0.15;
    const r = rng(77), pts = Array.from({ length: 16 }, (_, i) => [(i % 4) * 8 + r() * 8, Math.floor(i / 4) * 8 + r() * 8]);
    const worley = (x, y) => {
      let a = 1e9, b = 1e9;
      for (const [px, py] of pts) {
        let dx = Math.abs(x - px), dy = Math.abs(y - py);
        dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy);
        const d = Math.hypot(dx, dy);
        if (d < a) { b = a; a = d; } else if (d < b) b = d;
      }
      return b - a;
    };
    return [
      make('Шум', (x, y) => fbm(x, y)),
      make('Камень', (x, y) => Math.min(1, worley(x, y) / 3) * 0.7 + fbm(x, y) * 0.5),
      make('Дерево', (x, y) => Math.sin(((y + n16[y * N + x] * 10 + n8[y * N + x] * 3) / N) * Math.PI * 2 * 5) * 0.5 + n2[y * N + x] * 0.25),
      make('Кирпич', (x, y) => { const row = y >> 3, bx = (x + (row & 1) * 8) % 16; return (y % 8 === 7 || bx === 15 ? -1 : 0.25) + n4[y * N + x] * 0.35; }),
      make('Ткань', (x, y) => (((x >> 1) + (y >> 1)) & 1 ? (x & 1 ? 0.6 : 0.2) : (y & 1 ? -0.6 : -0.2)), 8, 8),
      make('Чешуя', (x, y) => { const row = Math.floor(y / 8), cx = ((x + (row & 1) * 8) % 16) - 7.5, cy = (y % 8) - 1; const d = Math.hypot(cx, cy * 1.6); return d < 8 ? 1 - d / 8 : -1; }),
    ];
  }
  /* Случайная бесшовная текстура 32×32: смесь двух узоров, выбранных по зерну. */
  X.randomTexture = function (seed) {
    const N = 32, r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)];
    function layer() {
      const kind = Math.floor(r() * 5);
      if (kind === 0) { // облака
        const a = noise(N, pick([8, 16]), (r() * 1e9) | 0), b = noise(N, 4, (r() * 1e9) | 0), c = noise(N, 2, (r() * 1e9) | 0), w = 0.3 + r() * 0.5;
        return (x, y) => a[y * N + x] * w + b[y * N + x] * (1 - w) * 0.7 + c[y * N + x] * (1 - w) * 0.3;
      }
      if (kind === 1) { // ячейки и трещины
        const n = pick([2, 4, 4, 8]), cell = N / n, pts = [], edges = r() < 0.6;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push([(i + r()) * cell, (j + r()) * cell]);
        return (x, y) => {
          let a = 1e9, b = 1e9;
          for (const [px, py] of pts) { let dx = Math.abs(x - px), dy = Math.abs(y - py); dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy); const d = Math.hypot(dx, dy); if (d < a) { b = a; a = d; } else if (d < b) b = d; }
          return edges ? Math.min(1, (b - a) / 3) : 1 - a / cell;
        };
      }
      if (kind === 2) { // волнистые полосы
        const warp = noise(N, pick([8, 16]), (r() * 1e9) | 0), k = pick([2, 3, 4, 6, 8]), amp = r() * 10, axis = pick(['x', 'y', 'd']);
        return (x, y) => Math.sin((((axis === 'x' ? x : axis === 'y' ? y : x + y) + warp[y * N + x] * amp) / N) * Math.PI * 2 * k);
      }
      if (kind === 3) { // плитка или точки
        const sz = pick([4, 8, 16]), round = r() < 0.5, shift = r() < 0.5;
        return (x, y) => { const row = Math.floor(y / sz), cx = ((x + (shift && row & 1 ? sz / 2 : 0)) % sz) - (sz - 1) / 2, cy = (y % sz) - (sz - 1) / 2; const d = round ? Math.hypot(cx, cy) : Math.max(Math.abs(cx), Math.abs(cy)); return 1 - d / (sz / 2); };
      }
      const a = noise(N, pick([4, 8]), (r() * 1e9) | 0), b = noise(N, 2, (r() * 1e9) | 0); // прожилки
      return (x, y) => -Math.abs(a[y * N + x] * 0.7 + b[y * N + x] * 0.3 - 0.5);
    }
    const A = layer(), B = layer(), mix = 0.25 + r() * 0.5, f = new Float32Array(N * N), fa = new Float32Array(N * N), fb = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { fa[y * N + x] = A(x, y); fb[y * N + x] = B(x, y); }
    const na = normalize(fa), nb = normalize(fb);
    for (let i = 0; i < f.length; i++) f[i] = na[i] * mix + nb[i] * (1 - mix);
    return { name: 'Случайная', w: N, h: N, g: normalize(f), random: true };
  };

  /* Сделать бесшовной: края заменяются серединой той же картинки, сдвинутой на пол-размера. */
  X.seamless = function (g, w, h) {
    const out = new Uint8Array(w * h), hw = w >> 1, hh = h >> 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = 1 - Math.abs((2 * (x + 0.5)) / w - 1), dy = 1 - Math.abs((2 * (y + 0.5)) / h - 1);
      let t = Math.min(dx, dy) * 2.5; t = t > 1 ? 1 : t; t = t * t * (3 - 2 * t);
      out[y * w + x] = Math.round(g[y * w + x] * t + g[((y + hh) % h) * w + ((x + hw) % w)] * (1 - t));
    }
    return out;
  };
  /* Любая картинка → серая текстура. */
  X.fromPixels = function (data, w, h, maxSide, seamless) {
    const k = Math.min(1, maxSide / Math.max(w, h)), nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k));
    const f = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) { // усреднение блока при уменьшении
      const x0 = Math.floor(x / k), y0 = Math.floor(y / k), x1 = Math.max(x0 + 1, Math.floor((x + 1) / k)), y1 = Math.max(y0 + 1, Math.floor((y + 1) / k));
      let sum = 0, cnt = 0;
      for (let yy = y0; yy < y1 && yy < h; yy++) for (let xx = x0; xx < x1 && xx < w; xx++) { const c = data[yy * w + xx]; if (c >>> 24) { sum += luma(c); cnt++; } }
      f[y * nw + x] = cnt ? sum / cnt : NaN;
    }
    let mean = 0, n = 0;
    for (const v of f) if (!Number.isNaN(v)) { mean += v; n++; }
    mean = n ? mean / n : 128;
    for (let i = 0; i < f.length; i++) if (Number.isNaN(f[i])) f[i] = mean; // прозрачное — нейтральный серый
    let g = normalize(f);
    if (seamless) g = X.seamless(g, nw, nh);
    return { w: nw, h: nh, g };
  };
  function saveTextures() {
    try { localStorage.setItem(KEY, JSON.stringify(X.textures.filter((t) => !t.builtin && !t.random).map((t) => ({ name: t.name, w: t.w, h: t.h, g: U.toBase64(t.g) })))); }
    catch (e) { NPR.toast('Не хватило места в браузере, чтобы сохранить текстуру', true); }
  }
  function loadTextures() {
    X.textures = builtins();
    try {
      for (const t of JSON.parse(localStorage.getItem(KEY)) || []) {
        const g = U.fromBase64(t.g);
        if (g.length === t.w * t.h) X.textures.push({ name: t.name, w: t.w, h: t.h, g });
      }
    } catch (e) { /* только встроенные */ }
  }
  async function addTexture(src, defName) {
    const v = await NPR.dialog({
      title: 'Новая текстура', okLabel: 'Добавить',
      fields: [
        { id: 'name', label: 'Название', value: defName },
        { id: 'size', label: 'Размер, не больше', type: 'select', value: 64, options: [16, 32, 64, 128].map((n) => [n, n + ' px']) },
        { id: 'seam', label: 'Сделать бесшовной', type: 'checkbox', value: true },
        { type: 'note', label: 'Картинка станет чёрно-белой: серый не меняет цвет, светлое осветляет, тёмное затемняет.' },
      ],
    });
    if (!v) return;
    const t = X.fromPixels(src.data, src.w, src.h, +v.size, v.seam);
    t.name = v.name.trim() || 'Текстура';
    X.textures.push(t);
    X.tex = t;
    saveTextures(); renderTextures(); changed();
  }

  /* ---------- расчёт ---------- */
  function ensure() {
    if (X.session) return true;
    NPR.edit.commitSessions(X);
    NPR.edit.commitFloatOnly();
    const doc = NPR.doc, L = NPR.edit.editableLayer();
    if (!L) return false;
    const W = doc.width, H = doc.height, d = L.data, sel = doc.sel, mask = new Uint8Array(W * H);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (d[i] >>> 24 === 0 || (sel && !Sel.has(sel, x, y))) continue;
      mask[i] = 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 < 0) { NPR.toast(sel ? 'В выделении нет закрашенных пикселей' : 'На слое нет закрашенных пикселей: свет ложится только на рисунок'); return false; }
    X.session = { tx: new NPR.Tx(doc, L), mask, x0, y0, x1, y1 };
    syncButtons();
    return true;
  }
  function render() {
    const s = X.session;
    if (!s) return;
    const { tx, mask, x0, y0, x1, y1 } = s, doc = NPR.doc, W = doc.width, H = doc.height, L = tx.layer;
    tx.revert();
    const d = L.data, depth = X.depthOf(L), steps = P.steps;
    const tex = X.tex, ts = P.texScale;
    const texAt = (x, y) => tex.g[(Math.floor(y / ts) % tex.h) * tex.w + (Math.floor(x / ts) % tex.w)];

    // расстояние до края фигуры (в два прохода), не больше ширины объёма
    const R = P.bevel ? P.bevelW : 0, dist = new Uint8Array(W * H);
    if (R) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (mask[i]) dist[i] = Math.min(R, 1 + Math.min(x > 0 ? dist[i - 1] : 0, y > 0 ? dist[i - W] : 0));
      }
      for (let y = y1; y >= y0; y--) for (let x = x1; x >= x0; x--) {
        const i = y * W + x;
        if (mask[i]) dist[i] = Math.min(dist[i], 1 + Math.min(x < W - 1 ? dist[i + 1] : 0, y < H - 1 ? dist[i + W] : 0));
      }
    }
    // карта высот
    const hgt = new Float32Array(W * H);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      const lv = depth ? depth[i] : 0;
      let h = lv ? R + LEVELS[lv].h : dist[i];
      if (tex && P.texRelief) h += ((texAt(x, y) - 128) / 128) * 0.8;
      hgt[i] = h;
    }
    const a = (P.angle * Math.PI) / 180, lx = Math.cos(a), ly = Math.sin(a), lz = 0.8, ll = Math.hypot(lx, ly, lz), flat = lz / ll;
    const kLight = (P.strength / 50) * steps * 1.8, kTex = (P.texStrength / 50) * steps;
    const glow = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      const lv = depth ? depth[i] : 0, c = d[i];
      if (lv === GLOW) { glow.push(i); continue; }
      let idx = 0;
      if (P.light) {
        const h = hgt[i];
        // за краем фигуры: у нарисованной глубины высота та же (обрыва нет), у объёма — ноль
        const at = (j, inside) => (inside && mask[j] ? hgt[j] : lv ? h : 0);
        const gx = (at(i + 1, x < W - 1) - at(i - 1, x > 0)) / 2, gy = (at(i + W, y < H - 1) - at(i - W, y > 0)) / 2;
        const lit = (-gx * lx - gy * ly + lz) / Math.hypot(gx, gy, 1) / ll - flat;
        idx += Math.round(lit * kLight);
        if (lv) idx -= Math.min(steps, LEVELS[lv].amb);
      }
      if (tex) idx += Math.round(((texAt(x, y) - 128) / 127) * kTex);
      idx = idx < -steps ? -steps : idx > steps ? steps : idx;
      const n = tone(c, idx);
      if (n !== c) tx.set(i, n);
    }
    // свечение: сами пиксели светлеют, соседи окрашиваются их цветом
    const gr = P.glow;
    for (const i of glow) {
      const c = tone(d[i], steps);
      if (gr > 0) {
        const gx = i % W, gy = (i / W) | 0;
        for (let yy = Math.max(y0, gy - gr); yy <= Math.min(y1, gy + gr); yy++) for (let xx = Math.max(x0, gx - gr); xx <= Math.min(x1, gx + gr); xx++) {
          const j = yy * W + xx, dd = Math.hypot(xx - gx, yy - gy);
          if (j === i || !mask[j] || dd > gr + 0.5 || (depth && depth[j] === GLOW)) continue;
          const k = Math.round(150 * (1 - dd / (gr + 1))), cur = d[j];
          const mixed = U.blend((cur | 0xff000000) >>> 0, ((c & 0xffffff) | (k << 24)) >>> 0);
          tx.set(j, ((mixed & 0xffffff) | (cur & 0xff000000)) >>> 0);
        }
      }
      tx.set(i, c);
    }
    tx.sync();
  }
  let raf = 0;
  function schedule() { if (!raf && X.session) raf = requestAnimationFrame(() => { raf = 0; render(); V.redrawOver(); }); }
  function flush() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  /* Параметр изменился: начать предпросмотр (если ещё нет) и пересчитать. */
  function changed() {
    toneCache = new Map(); ramp = null;
    try { localStorage.setItem(OPT, JSON.stringify(P)); } catch (e) { /* не страшно */ }
    if (S.tool === 'light' && ensure()) schedule();
  }
  X.commit = function () {
    const s = X.session;
    if (!s) return;
    flush(); render();
    X.session = null;
    NPR.edit.finish(s.tx, X.tex && !P.light ? 'Текстура' : 'Свет и текстура');
    syncButtons(); V.redrawOver();
  };
  X.cancel = function () {
    const s = X.session;
    if (!s) return;
    flush(); s.tx.revert();
    X.session = null;
    syncButtons(); V.redrawOver();
  };
  function syncButtons() { $('fxApply').disabled = $('fxCancel').disabled = !X.session; }

  /* ---------- инструмент: направление света и кисть глубины ---------- */
  let last = null, depthCanvas = null, depthDirty = true, stroke = null;
  function paintDepth(p) {
    const doc = NPR.doc, L = doc.active, W = doc.width, H = doc.height, map = X.depthOf(L, true);
    if (!stroke) stroke = new Map(); // что было под кистью — для отмены
    const n = S.brushSize, o = (n / 2) | 0, val = X.brush === 7 ? 0 : X.brush;
    const dot = (cx, cy) => { for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = cx + i - o, y = cy + j - o; if (x < 0 || y < 0 || x >= W || y >= H) continue; const k = y * W + x; if (map[k] === val) continue; if (!stroke.has(k)) stroke.set(k, map[k]); map[k] = val; } };
    if (last) NPR.plotLine(last.x, last.y, p.x, p.y, dot); else dot(p.x, p.y);
    last = { x: p.x, y: p.y };
    depthDirty = true;
  }
  function aim(p) {
    const s = X.session;
    const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
    if (p.x === Math.round(cx) && p.y === Math.round(cy)) return;
    P.angle = (Math.round((Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI) + 360) % 360;
    $('fxAngle').value = P.angle;
  }
  NPR.tools.light = {
    usesBrush: true,
    down(p) {
      if (!ensure()) return false;
      last = null;
      if (X.brush) paintDepth(p); else aim(p);
      changed();
    },
    move(p) {
      if (!X.session) return;
      if (X.brush) paintDepth(p); else aim(p);
      schedule();
    },
    up() {
      last = null;
      if (stroke && stroke.size) { NPR.history.push(depthCmd(NPR.doc.active, stroke, 'Глубина')); NPR.emit('docChanged'); }
      stroke = null;
      changed();
    },
    cancel() { last = null; stroke = null; },
  };
  /* Поверх холста: карта глубины и значок источника света. */
  X.drawOverlay = function (ctx) {
    if (S.tool !== 'light') return;
    const doc = NPR.doc, L = doc.active, W = doc.width, H = doc.height, z = V.zoom;
    const map = X.depthOf(L);
    if (map && $('fxShowDepth').checked) {
      if (!depthCanvas) depthCanvas = document.createElement('canvas');
      if (depthDirty || depthCanvas.width !== W || depthCanvas.height !== H || depthCanvas._src !== map) {
        depthCanvas.width = W; depthCanvas.height = H;
        const id = new ImageData(W, H), o = new Uint32Array(id.data.buffer);
        for (let i = 0; i < o.length; i++) { const lv = map[i]; if (lv) { const [r, g, b] = LEVELS[lv].color; o[i] = U.rgba(r, g, b, 150); } }
        depthCanvas.getContext('2d').putImageData(id, 0, 0);
        depthCanvas._src = map; depthDirty = false;
      }
      ctx.drawImage(depthCanvas, V.ox, V.oy, W * z, H * z);
    }
    const s = X.session;
    if (s && P.light) {
      const cx = V.ox + ((s.x0 + s.x1 + 1) / 2) * z, cy = V.oy + ((s.y0 + s.y1 + 1) / 2) * z;
      const r = Math.max(40, (Math.max(s.x1 - s.x0, s.y1 - s.y0) * z) / 2 + 26), a = (P.angle * Math.PI) / 180;
      const sx = cx + Math.cos(a) * r, sy = cy + Math.sin(a) * r;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22));
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffe27a'; ctx.stroke();
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fillStyle = '#ffe27a'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#000'; ctx.stroke();
    }
  };

  /* ---------- панель ---------- */
  function texThumb(t) {
    const c = el('canvas', { width: 32, height: 32 }), ctx = c.getContext('2d'), id = ctx.createImageData(32, 32), o = new Uint32Array(id.data.buffer);
    if (t) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const v = t.g[(y % t.h) * t.w + (x % t.w)]; o[y * 32 + x] = U.rgba(v, v, v); }
    ctx.putImageData(id, 0, 0);
    return c;
  }
  function renderTextures() {
    const mk = (t) => {
      const b = el('button', { type: 'button', class: 'tex', 'aria-pressed': String(X.tex === t), title: t ? `${t.name} (${t.w}×${t.h})` : 'Без текстуры', 'aria-label': t ? 'Текстура ' + t.name : 'Без текстуры' }, t ? texThumb(t) : el('span', null, 'нет'));
      b.addEventListener('click', () => { X.tex = t; renderTextures(); changed(); });
      return b;
    };
    $('fxTextures').replaceChildren(mk(null), ...X.textures.map(mk));
    $('fxTexDel').disabled = !X.tex || X.tex.builtin;
    $('fxTexKeep').disabled = !X.tex || !X.tex.random;
  }
  function renderBrushes() {
    const names = ['Свет', ...LEVELS.slice(1).map((l) => l.name), 'Стереть'];
    $('fxBrushes').replaceChildren(...names.map((name, i) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(X.brush === i), title: i === 0 ? 'Тянуть по холсту — задавать, откуда свет' : i === 7 ? 'Стирать нарисованную глубину' : 'Рисовать на холсте: ' + name.toLowerCase() }, name.replace('Углубление: ', '↓ '));
      if (i > 0 && i < 7) b.style.setProperty('--c', `rgb(${LEVELS[i].color.join(',')})`);
      b.addEventListener('click', () => { X.brush = i; renderBrushes(); V.redrawOver(); });
      return b;
    }));
  }
  X.show = function (on) { $('fxPanel').hidden = !on; document.body.classList.toggle('fx-on', on); V.redrawOver(); };

  X.init = function () {
    try { Object.assign(P, JSON.parse(localStorage.getItem(OPT)) || {}); } catch (e) { /* по умолчанию */ }
    loadTextures();
    const num = (id, key, lo, hi) => { $(id).value = P[key]; $(id).addEventListener('input', (e) => { if (e.target.value === '') return; P[key] = U.clamp(Math.round(+e.target.value) || 0, lo, hi); changed(); }); };
    const chk = (id, key) => { $(id).checked = P[key]; $(id).addEventListener('change', (e) => { P[key] = e.target.checked; changed(); }); };
    chk('fxLight', 'light'); num('fxAngle', 'angle', 0, 359); num('fxStrength', 'strength', 0, 100);
    chk('fxBevel', 'bevel'); num('fxBevelW', 'bevelW', 1, 32);
    num('fxSteps', 'steps', 1, 4);
    $('fxMode').value = P.mode; $('fxMode').addEventListener('change', (e) => { P.mode = e.target.value; changed(); });
    num('fxTexScale', 'texScale', 1, 16); num('fxTexStrength', 'texStrength', 0, 100); chk('fxTexRelief', 'texRelief');
    num('fxGlow', 'glow', 0, 6);
    $('fxShowDepth').addEventListener('change', () => V.redrawOver());
    $('fxApply').addEventListener('click', X.commit);
    $('fxCancel').addEventListener('click', X.cancel);
    $('fxDepthClear').addEventListener('click', () => {
      const L = NPR.doc.active, map = X.depthOf(L);
      if (!map) return;
      const was = new Map();
      for (let i = 0; i < map.length; i++) if (map[i]) { was.set(i, map[i]); map[i] = 0; }
      if (was.size) NPR.history.push(depthCmd(L, was, 'Очистка глубины'));
      depthDirty = true; changed(); V.redrawOver(); NPR.emit('docChanged');
    });
    $('fxTexRandom').addEventListener('click', () => {
      const t = X.randomTexture((Math.random() * 1e9) | 0);
      const i = X.textures.findIndex((x) => x.random);
      if (i >= 0) X.textures[i] = t; else X.textures.push(t);
      X.tex = t;
      renderTextures(); changed();
    });
    $('fxTexKeep').addEventListener('click', () => {
      const t = X.tex;
      if (!t || !t.random) return;
      delete t.random;
      t.name = 'Случайная ' + (X.textures.filter((x) => !x.builtin).length);
      saveTextures(); renderTextures();
      NPR.toast('Текстура сохранена в набор');
    });
    $('fxTexImport').addEventListener('click', async () => {
      const f = await U.pickFile('image/*');
      if (!f) return;
      try { addTexture(await U.decodeImage(f), f.name.replace(/\.[^.]+$/, '')); } catch (e) { NPR.toast('Не удалось прочитать картинку', true); }
    });
    $('fxTexCanvas').addEventListener('click', () => {
      X.cancel(); NPR.edit.commitFloat();
      const doc = NPR.doc;
      doc.flush();
      let src = { data: doc.comp32, w: doc.width, h: doc.height };
      const s = doc.sel;
      if (s) { // только выделенный прямоугольник
        const ax = Math.max(0, s.x), ay = Math.max(0, s.y), bx = Math.min(doc.width, s.x + s.w), by = Math.min(doc.height, s.y + s.h), w = bx - ax, h = by - ay;
        if (w > 0 && h > 0) { const data = new Uint32Array(w * h); for (let y = 0; y < h; y++) data.set(doc.comp32.subarray((ay + y) * doc.width + ax, (ay + y) * doc.width + bx), y * w); src = { data, w, h }; }
      }
      addTexture(src, doc.name);
    });
    $('fxTexDel').addEventListener('click', () => {
      if (!X.tex || X.tex.builtin) return;
      X.textures.splice(X.textures.indexOf(X.tex), 1);
      X.tex = null;
      saveTextures(); renderTextures(); changed();
    });
    renderTextures(); renderBrushes(); syncButtons();
  };
})(window.NPR);
