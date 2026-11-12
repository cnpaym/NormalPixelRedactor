'use strict';
/* Выбор цвета. Три вида на выбор: квадрат (насыщенность × яркость),
   треугольник с кольцом оттенков и ползунки HSV/RGB.
   Внутри цвет хранится как HSV + альфа, чтобы оттенок не «прыгал» на серых. */
(function (NPR) {
  const S = NPR.state, U = NPR.util, { el } = U;
  const C = (NPR.color = { mode: 'square' });
  const KEY = 'npr.picker';
  const $ = (id) => document.getElementById(id);

  let h = 0, s = 0, v = 0, a = 255;
  let sv, svCtx, tri, triCtx, hue, alpha, hex;

  /* ---------- квадрат ---------- */
  function drawSquare() {
    const w = sv.width, ht = sv.height;
    const [r, g, b] = U.hsvToRgb(h, 1, 1);
    const g1 = svCtx.createLinearGradient(0, 0, w, 0);
    g1.addColorStop(0, '#fff'); g1.addColorStop(1, `rgb(${r},${g},${b})`);
    svCtx.fillStyle = g1; svCtx.fillRect(0, 0, w, ht);
    const g2 = svCtx.createLinearGradient(0, 0, 0, ht);
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, '#000');
    svCtx.fillStyle = g2; svCtx.fillRect(0, 0, w, ht);
    marker(svCtx, s * w, (1 - v) * ht, 4);
  }
  function marker(ctx, x, y, r) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000'; ctx.strokeRect(x - r, y - r, r * 2, r * 2);
    ctx.strokeStyle = '#fff'; ctx.strokeRect(x - r + 1, y - r + 1, r * 2 - 2, r * 2 - 2);
  }

  /* ---------- треугольник ----------
     Вершины: чистый оттенок (сверху), белый (слева внизу), чёрный (справа внизу).
     Точка внутри — смесь трёх вершин: c·оттенок + w·белый + k·чёрный, c + w + k = 1.
     Отсюда яркость v = c + w, насыщенность s = c / v. */
  const TW = 440, TH = 392, CX = 220, CY = 196, R_OUT = 190, R_IN = 160, R_T = 150;
  const AX = CX, AY = CY - R_T;
  const BX = CX - R_T * Math.cos(Math.PI / 6), BY = CY + R_T / 2;
  const KX = CX + R_T * Math.cos(Math.PI / 6), KY = BY;
  let ringCanvas = null, triCanvas = null, triHue = -1;

  function bary(x, y) {
    const d = (BY - KY) * (AX - KX) + (KX - BX) * (AY - KY);
    const c = ((BY - KY) * (x - KX) + (KX - BX) * (y - KY)) / d;
    const w = ((KY - AY) * (x - KX) + (AX - KX) * (y - KY)) / d;
    return [c, w, 1 - c - w];
  }
  function buildRing() {
    ringCanvas = document.createElement('canvas');
    ringCanvas.width = TW; ringCanvas.height = TH;
    const ctx = ringCanvas.getContext('2d'), id = ctx.createImageData(TW, TH), d = id.data;
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const dx = x + 0.5 - CX, dy = y + 0.5 - CY, r = Math.hypot(dx, dy);
      if (r < R_IN - 1 || r > R_OUT + 1) continue;
      const [cr, cg, cb] = U.hsvToRgb((Math.atan2(dy, dx) * 180) / Math.PI, 1, 1), i = (y * TW + x) * 4;
      d[i] = cr; d[i + 1] = cg; d[i + 2] = cb;
      d[i + 3] = 255 * U.clamp(Math.min(r - R_IN + 1, R_OUT + 1 - r), 0, 1); // сглаженный край
    }
    ctx.putImageData(id, 0, 0);
  }
  function buildTriangle() {
    if (!triCanvas) { triCanvas = document.createElement('canvas'); triCanvas.width = TW; triCanvas.height = TH; }
    const ctx = triCanvas.getContext('2d'), id = ctx.createImageData(TW, TH), d = id.data;
    const [hr, hg, hb] = U.hsvToRgb(h, 1, 1);
    const y0 = Math.floor(AY) - 1, y1 = Math.ceil(BY) + 1, x0 = Math.floor(BX) - 1, x1 = Math.ceil(KX) + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const [c, w, k] = bary(x + 0.5, y + 0.5), m = Math.min(c, w, k);
      if (m < -0.008) continue;
      const i = (y * TW + x) * 4, cc = Math.max(0, c), ww = Math.max(0, w);
      d[i] = Math.min(255, cc * hr + ww * 255); d[i + 1] = Math.min(255, cc * hg + ww * 255); d[i + 2] = Math.min(255, cc * hb + ww * 255);
      d[i + 3] = 255 * U.clamp((m + 0.008) / 0.008, 0, 1);
    }
    ctx.putImageData(id, 0, 0);
    triHue = h;
  }
  function drawTriangle() {
    if (!ringCanvas) buildRing();
    if (triHue !== h) buildTriangle();
    triCtx.clearRect(0, 0, TW, TH);
    triCtx.drawImage(ringCanvas, 0, 0);
    triCtx.drawImage(triCanvas, 0, 0);
    const ang = (h * Math.PI) / 180, rm = (R_IN + R_OUT) / 2;
    dot(CX + Math.cos(ang) * rm, CY + Math.sin(ang) * rm, 11);
    const c = s * v, w = v - c, k = 1 - v;
    dot(c * AX + w * BX + k * KX, c * AY + w * BY + k * KY, 9);
  }
  function dot(x, y, r) {
    triCtx.beginPath(); triCtx.arc(x, y, r, 0, Math.PI * 2);
    triCtx.lineWidth = 5; triCtx.strokeStyle = '#000'; triCtx.stroke();
    triCtx.lineWidth = 2.5; triCtx.strokeStyle = '#fff'; triCtx.stroke();
  }
  function triPoint(e) {
    const r = tri.getBoundingClientRect(), k = TW / r.width;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  }
  let triDrag = null;
  function triPick(e) {
    const [x, y] = triPoint(e);
    if (triDrag === 'ring') h = ((Math.atan2(y - CY, x - CX) * 180) / Math.PI + 360) % 360;
    else {
      let [c, w, k] = bary(x, y);
      c = Math.max(0, c); w = Math.max(0, w); k = Math.max(0, k);
      const sum = c + w + k || 1;
      c /= sum; w /= sum;
      v = c + w;
      if (v > 0) s = c / v;
    }
    fromPicker();
  }

  /* ---------- ползунки ---------- */
  const SLIDERS = [['H', 360], ['S', 100], ['V', 100], ['R', 255], ['G', 255], ['B', 255]];
  const sl = {};
  function buildSliders() {
    const box = $('sliders');
    for (const [name, max] of SLIDERS) {
      const input = el('input', { type: 'range', min: 0, max, step: 1, 'aria-label': name });
      const out = el('output');
      input.addEventListener('input', () => sliderInput(name));
      sl[name] = { input, out };
      box.append(el('label', null, el('span', null, name), input, out));
    }
  }
  function sliderInput(name) {
    const val = (n) => +sl[n].input.value;
    if ('HSV'.includes(name)) { h = val('H'); s = val('S') / 100; v = val('V') / 100; fromPicker(); }
    else NPR.setColor('primary', U.rgba(val('R'), val('G'), val('B'), a));
  }
  function drawSliders() {
    const c = S.primary, r = U.R(c), g = U.G(c), b = U.B(c);
    const set = (n, value, from, to) => {
      const x = sl[n];
      if (document.activeElement !== x.input) x.input.value = value;
      x.out.textContent = Math.round(value);
      x.input.style.background = n === 'H'
        ? 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'
        : `linear-gradient(90deg, rgb(${from}), rgb(${to}))`;
    };
    set('H', h);
    set('S', s * 100, U.hsvToRgb(h, 0, v), U.hsvToRgb(h, 1, v));
    set('V', v * 100, [0, 0, 0], U.hsvToRgb(h, s, 1));
    set('R', r, [0, g, b], [255, g, b]);
    set('G', g, [r, 0, b], [r, 255, b]);
    set('B', b, [r, g, 0], [r, g, 255]);
  }

  /* ---------- общее ---------- */
  function fromPicker() {
    const [r, g, b] = U.hsvToRgb(h, s, v);
    S.primary = U.rgba(r, g, b, a);
    NPR.palette.selected = -1;
    sync(true);
  }
  function sync(keepHSV) {
    const c = S.primary;
    if (!keepHSV) {
      const [nh, ns, nv] = U.rgbToHsv(U.R(c), U.G(c), U.B(c));
      if (ns > 0 && nv > 0) h = nh; // у серых оттенок не определён — оставляем прежний
      if (nv > 0) s = ns;
      v = nv; a = U.A(c);
    }
    hue.value = h; alpha.value = a;
    if (document.activeElement !== hex) hex.value = U.toHex(c);
    const [r, g, b] = U.hsvToRgb(h, s, v);
    alpha.style.setProperty('--c', `rgb(${r},${g},${b})`);
    $('colPrimary').style.setProperty('--c', U.toCss(c));
    $('colSecondary').style.setProperty('--c', U.toCss(S.secondary));
    if (C.mode === 'square') drawSquare();
    else if (C.mode === 'triangle') drawTriangle();
    else drawSliders();
    NPR.emit('color');
  }

  C.setMode = function (mode) {
    C.mode = mode;
    sv.hidden = hue.hidden = mode !== 'square';
    tri.hidden = mode !== 'triangle';
    $('sliders').hidden = mode !== 'sliders';
    for (const b of $('pickerModes').children) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    try { localStorage.setItem(KEY, mode); } catch (e) { /* хранилище недоступно */ }
    sync(true);
  };

  NPR.setColor = function (which, c) { S[which] = c >>> 0; sync(false); };
  NPR.swapColors = function () { [S.primary, S.secondary] = [S.secondary, S.primary]; sync(false); };

  const recent = [];
  function renderRecent() {
    $('recent').replaceChildren(...recent.map((c) => {
      const b = el('button', { type: 'button', class: 'swatch', title: U.toHex(c), 'aria-label': 'Недавний цвет ' + U.toHex(c) });
      b.style.setProperty('--c', U.toCss(c));
      b.addEventListener('click', () => NPR.setColor('primary', c));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); NPR.setColor('secondary', c); });
      return b;
    }));
  }

  C.init = function () {
    sv = $('svBox'); svCtx = sv.getContext('2d');
    tri = $('triBox'); tri.width = TW; tri.height = TH; triCtx = tri.getContext('2d');
    hue = $('hue'); alpha = $('alpha'); hex = $('hex');
    buildSliders();

    const pick = (e) => {
      const r = sv.getBoundingClientRect();
      s = U.clamp((e.clientX - r.left) / r.width, 0, 1);
      v = 1 - U.clamp((e.clientY - r.top) / r.height, 0, 1);
      fromPicker();
    };
    sv.addEventListener('pointerdown', (e) => { sv.setPointerCapture(e.pointerId); pick(e); });
    sv.addEventListener('pointermove', (e) => { if (sv.hasPointerCapture(e.pointerId)) pick(e); });

    tri.addEventListener('pointerdown', (e) => {
      const [x, y] = triPoint(e);
      triDrag = Math.hypot(x - CX, y - CY) > R_IN - 8 ? 'ring' : 'tri';
      tri.setPointerCapture(e.pointerId);
      triPick(e);
    });
    tri.addEventListener('pointermove', (e) => { if (triDrag && tri.hasPointerCapture(e.pointerId)) triPick(e); });
    const stop = () => { triDrag = null; };
    tri.addEventListener('pointerup', stop);
    tri.addEventListener('pointercancel', stop);

    hue.addEventListener('input', () => { h = +hue.value; fromPicker(); });
    alpha.addEventListener('input', () => { a = +alpha.value; fromPicker(); });
    hex.addEventListener('input', () => { const c = U.parseHex(hex.value); if (c !== null) NPR.setColor('primary', c); });
    hex.addEventListener('blur', () => { hex.value = U.toHex(S.primary); });
    hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') hex.blur(); });
    $('colSwap').addEventListener('click', NPR.swapColors);
    $('colSecondary').addEventListener('click', NPR.swapColors);
    for (const b of $('pickerModes').children) b.addEventListener('click', () => C.setMode(b.dataset.mode));

    NPR.on('colorUsed', (c) => {
      const i = recent.indexOf(c);
      if (i === 0) return;
      if (i > 0) recent.splice(i, 1);
      recent.unshift(c);
      if (recent.length > 12) recent.pop();
      renderRecent();
    });

    let mode = 'square';
    try { mode = localStorage.getItem(KEY) || mode; } catch (e) { /* по умолчанию */ }
    sync(false);
    C.setMode(['square', 'triangle', 'sliders'].includes(mode) ? mode : 'square');
  };
})(window.NPR);
