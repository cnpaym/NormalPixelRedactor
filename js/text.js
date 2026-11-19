'use strict';
/* Инструмент «Текст».

   Щелчок по холсту ставит текст, его можно тянуть мышью, пока он не применён.
   Внешний вид задаёт стиль — список шагов, которые выполняются по порядку
   над готовыми буквами: цвет, градиент, свет и текстура, обводка, свечение, тень.
   Стиль можно собрать кнопкой «+ шаг» или записать: включить запись и просто
   поработать заливкой, градиентом, светом и обводкой — каждый применённый
   инструмент добавится шагом со своими настройками.
   Текст ложится на новый слой и помнит свои настройки: его можно изменить потом. */
(function (NPR) {
  const S = NPR.state, U = NPR.util, V = NPR.view, TF = NPR.textfont, { el } = U;
  const $ = (id) => document.getElementById(id);
  const T = (NPR.text = { session: null, recipe: [], styleName: '', recording: false });
  const KEY = 'npr.text', STYLES_KEY = 'npr.textStyles';

  const P = (T.params = { text: 'Текст', font: 'b:inscription', size: 16, bold: false, italic: false, smallCaps: false, kern: 50, smooth: false, spacing: 0, line: 100, align: 'left', newLayer: true });

  /* ---------- готовые стили ---------- */
  const fxBase = { light: true, outsideShadow: false, facetDir: 180, facetTilt: 45, bevel: true, bevelW: 2, steps: 2, mode: 'hsv', texScale: 1, texStrength: 50, texRelief: false, glow: 2 };
  const BUILTIN = [
    { name: 'Без эффектов', steps: [] },
    { name: 'Золото — Скайрим', steps: [
      { t: 'grad', stops: [[0, '#fff4c8'], [0.38, '#f0c35e'], [0.66, '#b5752a'], [1, '#5c3110']], type: 'linear', angle: 90, steps: 0, dither: false },
      { t: 'fx', params: { ...fxBase, lights: [{ on: true, angle: 225, elev: 40, strength: 65, color: '#ffe6a8' }] }, tex: null },
      { t: 'outline', color: '#2a1505', width: 1, inside: false, diag: true },
      { t: 'glow', color: '#ff9a2e', radius: 4, alpha: 150 },
    ] },
    { name: 'Сталь — рок', steps: [
      { t: 'grad', stops: [[0, '#ffffff'], [0.45, '#c3ccd8'], [0.5, '#3e4652'], [0.72, '#8f9aa8'], [1, '#e6ecf3']], type: 'linear', angle: 90, steps: 0, dither: false },
      { t: 'fx', params: { ...fxBase, bevelW: 1, lights: [{ on: true, angle: 225, elev: 35, strength: 55, color: '#ffffff' }, { on: true, angle: 20, elev: 20, strength: 40, color: '#6fb6ff' }] }, tex: null },
      { t: 'outline', color: '#0a0d12', width: 1, inside: false, diag: true },
      { t: 'shadow', color: '#000000', dx: 2, dy: 2, alpha: 170 },
    ] },
    { name: 'Камень с рунами', steps: [
      { t: 'fill', color: '#8b909a' },
      { t: 'fx', params: { ...fxBase, bevelW: 2, texStrength: 45, texRelief: true, lights: [{ on: true, angle: 225, elev: 40, strength: 60, color: '#ffffff' }] }, tex: 'Камень' },
      { t: 'outline', color: '#1b1d22', width: 1, inside: false, diag: false },
      { t: 'shadow', color: '#000000', dx: 1, dy: 2, alpha: 140 },
    ] },
    { name: 'Резной камень', steps: [
      { t: 'grad', stops: [[0, '#f4e8d0'], [0.55, '#c8b291'], [1, '#7b6750']], type: 'linear', angle: 90, steps: 0, dither: false },
      { t: 'fx', params: { ...fxBase, bevelW: 1, texStrength: 22, lights: [{ on: true, angle: 225, elev: 45, strength: 55, color: '#fff3dc' }] }, tex: 'Камень' },
      { t: 'outline', color: '#2a2017', width: 1, inside: false, diag: true },
    ] },
    { name: 'Кровь', steps: [
      { t: 'grad', stops: [[0, '#ff5a44'], [0.5, '#b3121c'], [1, '#4a0308']], type: 'linear', angle: 90, steps: 3, dither: true },
      { t: 'outline', color: '#160102', width: 1, inside: false, diag: true },
      { t: 'glow', color: '#c0141c', radius: 3, alpha: 130 },
    ] },
    { name: 'Лёд', steps: [
      { t: 'grad', stops: [[0, '#f2fdff'], [0.5, '#8fd8ff'], [1, '#2a6fb8']], type: 'linear', angle: 90, steps: 0, dither: false },
      { t: 'fx', params: { ...fxBase, bevelW: 1, lights: [{ on: true, angle: 230, elev: 45, strength: 50, color: '#ffffff' }] }, tex: null },
      { t: 'outline', color: '#0b2442', width: 1, inside: false, diag: true },
      { t: 'glow', color: '#7fd0ff', radius: 3, alpha: 120 },
    ] },
  ];
  let mine = [];
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* ---------- шаги стиля над буфером ---------- */
  const STEP_NAMES = { fill: 'Цвет', grad: 'Градиент', fx: 'Свет и текстура', outline: 'Обводка', glow: 'Свечение', shadow: 'Тень' };
  const hexA = (hex, alpha) => { const c = U.parseHex(hex) || 0xff000000; return alpha === undefined ? c : (((c & 0xffffff) | (U.clamp(alpha, 0, 255) << 24)) >>> 0); };
  function opaqueBox(d, W, H) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    const mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[y * W + x] >>> 24) {
      mask[y * W + x] = 1;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return x1 < 0 ? null : { mask, x0, y0, x1, y1 };
  }
  T.applyStep = function (d, W, H, st) {
    const box = opaqueBox(d, W, H);
    if (!box) return;
    if (st.t === 'fill') {
      const c = hexA(st.color);
      for (let i = 0; i < d.length; i++) if (box.mask[i]) d[i] = (((c & 0xffffff) | ((((d[i] >>> 24) * (c >>> 24)) / 255) << 24)) >>> 0);
    } else if (st.t === 'grad') {
      const type = st.type || 'linear', [p0, p1] = NPR.gradient.vectorFor(box, type, st.angle || 0);
      NPR.gradient.paint({ d, W, region: { full: box.mask, ...box }, p0, p1, table: NPR.gradient.lutFor(st.stops), type, steps: st.steps, dither: st.dither,
        blend: false, alock: true, set: (i, c) => { d[i] = c; } });
    } else if (st.t === 'fx') {
      NPR.fx.resetTone();
      NPR.fx.shade({ d, W, H, mask: box.mask, x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1, depth: null, inSel: null,
        P: { ...fxBase, ...st.params }, tex: NPR.fx.findTexture(st.tex), set: (i, c) => { d[i] = c; } });
    } else if (st.t === 'outline') {
      const c = hexA(st.color);
      for (const i of NPR.ops.outlinePixels(d, W, H, { inside: st.inside, diag: st.diag, width: st.width })) d[i] = c;
    } else if (st.t === 'glow') {
      const r = U.clamp(st.radius | 0, 1, 12), base = hexA(st.color), a0 = st.alpha ?? 150, out = [];
      for (let y = Math.max(0, box.y0 - r); y <= Math.min(H - 1, box.y1 + r); y++) for (let x = Math.max(0, box.x0 - r); x <= Math.min(W - 1, box.x1 + r); x++) {
        const i = y * W + x;
        if (d[i] >>> 24) continue;
        let best = Infinity;
        for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) {
          if (!box.mask[yy * W + xx]) continue;
          const dd = (xx - x) * (xx - x) + (yy - y) * (yy - y);
          if (dd < best) best = dd;
        }
        if (best > r * r) continue;
        const f = 1 - (Math.sqrt(best) - 1) / r, q = Math.ceil(f * 4) / 4; // ступени по четверти — в духе пиксель-арта
        if (q > 0) out.push(i, Math.round(a0 * q));
      }
      for (let k = 0; k < out.length; k += 2) d[out[k]] = (((base & 0xffffff) | (out[k + 1] << 24)) >>> 0);
    } else if (st.t === 'shadow') {
      const c = hexA(st.color, st.alpha ?? 160), dx = st.dx | 0, dy = st.dy | 0, src = d.slice();
      for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
        if (!box.mask[y * W + x]) continue;
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const j = Y * W + X;
        if (src[j] >>> 24 === 0) d[j] = c; // тень только под буквами, не поверх
        else if (src[j] >>> 24 < 255) d[j] = U.blend(c, src[j]);
      }
    }
  };
  /* Запас по краям под эффекты. */
  function margin(steps) {
    let m = 2;
    for (const st of steps) {
      if (st.t === 'outline') m += st.width | 0;
      else if (st.t === 'glow') m += st.radius | 0;
      else if (st.t === 'shadow') m += Math.max(Math.abs(st.dx | 0), Math.abs(st.dy | 0));
    }
    return m;
  }

  /* ---------- предпросмотр ---------- */
  function build(params, recipe, color) {
    const r = TF.render(params.text, params), m = margin(recipe);
    const W = r.w + m * 2, H = r.h + m * 2, d = new Uint32Array(W * H), rgb = color & 0xffffff, ca = color >>> 24;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const a = r.a[y * r.w + x];
      if (a) d[(y + m) * W + x + m] = (rgb | (Math.round((a * ca) / 255) << 24)) >>> 0;
    }
    for (const st of recipe) T.applyStep(d, W, H, st);
    return { d, W, H, ax: r.ax + m, ay: r.ay + m };
  }
  T.build = build;
  function render() {
    const s = T.session;
    if (!s) return;
    let b;
    try { b = build(P, T.recipe, S.primary); }
    catch (e) { NPR.toast(e.message, true); return; }
    s.buf = b;
    const c = s.canvas || (s.canvas = document.createElement('canvas'));
    c.width = b.W; c.height = b.H;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(b.d.buffer.slice(0)), b.W, b.H), 0, 0);
    V.redrawOver();
  }
  let raf = 0;
  function schedule() { if (!raf && T.session) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
  const origin = (s) => ({ x: s.x - s.buf.ax, y: s.y - s.buf.ay }); // левый верхний угол буфера на холсте

  /* ---------- сеанс ---------- */
  function start(x, y, editLayer) {
    NPR.edit.commitSessions(T);
    NPR.edit.commitFloatOnly();
    T.session = { x, y, editId: editLayer ? editLayer.id : null };
    if (editLayer) { editLayer.visible = false; NPR.doc.markAllDirty(); NPR.emit('layers'); }
    render();
    syncButtons();
    // фокус в поле текста — после того как браузер обработает щелчок по холсту
    setTimeout(() => { const ta = $('txtText'); ta.focus(); ta.select(); }, 0);
  }
  function endEdit(s) {
    if (!s.editId) return;
    const L = NPR.doc.getLayer(s.editId);
    if (L) { L.visible = true; NPR.doc.markAllDirty(); }
  }
  T.commit = function () {
    const s = T.session;
    if (!s) return;
    if (raf) { cancelAnimationFrame(raf); raf = 0; render(); }
    T.session = null;
    endEdit(s);
    syncButtons();
    V.redrawOver();
    if (!s.buf || !P.text.trim()) { NPR.emit('layers'); return; }
    const doc = NPR.doc, W = doc.width, H = doc.height, o = origin(s), b = s.buf;
    const meta = { params: clone(P), recipe: clone(T.recipe), style: T.styleName, x: s.x, y: s.y, color: U.toHex(S.primary, true) };
    const blit = (target) => {
      for (let y = 0; y < b.H; y++) {
        const Y = o.y + y;
        if (Y < 0 || Y >= H) continue;
        for (let x = 0; x < b.W; x++) {
          const X = o.x + x, v = b.d[y * b.W + x];
          if (X >= 0 && X < W && v >>> 24) target(Y * W + X, v);
        }
      }
    };
    const name = 'Текст: ' + P.text.trim().split('\n')[0].slice(0, 18);
    if (s.editId && doc.getLayer(s.editId)) {
      NPR.ops.snap('Изменение текста', (d) => {
        const L = d.getLayer(s.editId), data = new Uint32Array(W * H);
        blit((i, v) => { data[i] = v; });
        L.data = data; L.text = meta; L.name = name;
      });
    } else if (P.newLayer) {
      NPR.ops.snap('Текст', (d) => {
        const data = new Uint32Array(W * H);
        blit((i, v) => { data[i] = v; });
        const L = d.newLayer(name, data);
        L.text = meta;
        d.addLayerRaw(L, d.indexOf(d.activeId) + 1);
      });
    } else {
      const L = NPR.edit.editableLayer();
      if (!L) return;
      const tx = new NPR.Tx(doc, L);
      blit((i, v) => tx.set(i, U.blend(L.data[i], v)));
      NPR.edit.finish(tx, 'Текст');
    }
    NPR.emit('layers');
  };
  T.cancel = function () {
    const s = T.session;
    if (!s) return;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    T.session = null;
    endEdit(s);
    NPR.emit('layers');
    syncButtons();
    V.redrawOver();
  };
  /* Открыть текстовый слой для правки. */
  T.editLayer = function (L) {
    L = L || NPR.doc.active;
    if (!L || !L.text) return NPR.toast('Этот слой не текстовый');
    const m = L.text;
    // слои, сделанные до кернинга и строчных, открываются как были
    Object.assign(P, { italic: false, kern: 0, smallCaps: true }, m.params);
    T.recipe = clone(m.recipe || []);
    T.styleName = m.style || '';
    if (m.color) NPR.setColor('primary', U.parseHex(m.color));
    if (S.tool !== 'text') NPR.setTool('text');
    syncFields(); renderSteps(); renderStyles();
    start(m.x, m.y, L);
  };
  /* Поставить текст по центру холста по видимым пикселям. */
  T.center = function (axis) {
    const s = T.session;
    if (!s) return NPR.edit.center(axis); // без предпросмотра — двигаем выделенное или слой
    if (!s.buf) return;
    const b = s.buf, box = opaqueBox(b.d, b.W, b.H);
    if (!box) return;
    const o = origin(s), doc = NPR.doc;
    if (axis !== 'v') s.x += Math.floor((doc.width - (box.x1 - box.x0 + 1)) / 2) - (o.x + box.x0);
    if (axis !== 'h') s.y += Math.floor((doc.height - (box.y1 - box.y0 + 1)) / 2) - (o.y + box.y0);
    V.redrawOver();
  };

  /* ---------- инструмент ---------- */
  let drag = null;
  function inside(p) {
    const s = T.session;
    if (!s || !s.buf) return false;
    const o = origin(s);
    return p.x >= o.x && p.y >= o.y && p.x < o.x + s.buf.W && p.y < o.y + s.buf.H;
  }
  NPR.tools.text = {
    down(p) {
      if (inside(p)) { drag = { sx: p.x, sy: p.y, x: T.session.x, y: T.session.y }; return; }
      if (T.session) T.commit();
      start(p.x, p.y, null);
      return false;
    },
    move(p) {
      if (!drag) return;
      T.session.x = drag.x + p.x - drag.sx; T.session.y = drag.y + p.y - drag.sy;
      V.redrawOver();
    },
    up() { drag = null; },
    cancel() { if (drag) { T.session.x = drag.x; T.session.y = drag.y; drag = null; V.redrawOver(); } },
  };
  T.drawOverlay = function (ctx) {
    const s = T.session;
    if (!s || !s.buf || !s.canvas) return;
    const z = V.zoom, o = origin(s), x = V.ox + o.x * z, y = V.oy + o.y * z, w = s.buf.W * z, h = s.buf.H * z;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.canvas, x, y, w, h);
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#000'; ctx.strokeRect(Math.round(x) - 0.5, Math.round(y) - 0.5, Math.round(w) + 1, Math.round(h) + 1);
    ctx.strokeStyle = '#f2b63d'; ctx.lineDashOffset = 4; ctx.strokeRect(Math.round(x) - 0.5, Math.round(y) - 0.5, Math.round(w) + 1, Math.round(h) + 1);
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    const ax = V.ox + s.x * z, ay = V.oy + s.y * z;
    ctx.fillStyle = '#f2b63d'; ctx.fillRect(Math.round(ax) - 3, Math.round(ay) - 3, 6, 6);
    ctx.strokeStyle = '#000'; ctx.strokeRect(Math.round(ax) - 3.5, Math.round(ay) - 3.5, 7, 7);
  };

  /* ---------- запись шагов ---------- */
  NPR.on('record', (st) => {
    if (!T.recording) return;
    T.recipe.push(clone(st));
    T.styleName = '';
    renderSteps(); renderStyles(); saveState();
    NPR.toast('Записан шаг: ' + STEP_NAMES[st.t]);
  });

  /* ---------- панель ---------- */
  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify({ params: P, recipe: T.recipe, style: T.styleName })); } catch (e) { /* не страшно */ }
  }
  function changed() { saveState(); schedule(); }
  function syncButtons() {
    $('txtApply').disabled = $('txtCancel').disabled = !T.session;
    const L = NPR.doc && NPR.doc.active;
    $('txtEdit').disabled = !!T.session || !(L && L.text);
  }
  T.syncButtons = syncButtons;
  function fontOptions() {
    const sel = $('txtFont'), groups = [];
    groups.push(el('optgroup', { label: 'Встроенные: латиница и кириллица' }, Object.entries(TF.STYLES).map(([k, v]) => el('option', { value: 'b:' + k }, v.name))));
    if (TF.custom.length) groups.push(el('optgroup', { label: 'Мои шрифты' }, TF.custom.map((f) => el('option', { value: 'f:' + f.name }, f.name))));
    const sys = TF.SYSTEM.filter((n) => TF.available(n));
    if (sys.length) groups.push(el('optgroup', { label: 'Шрифты компьютера' }, sys.map((n) => el('option', { value: 's:' + n }, n))));
    sel.replaceChildren(...groups);
    if (![...sel.options].some((o) => o.value === P.font)) P.font = 'b:inscription';
    sel.value = P.font;
    $('txtFontDel').disabled = !P.font.startsWith('f:');
    $('txtSizeLabel').textContent = TF.isBuiltin(P.font) ? 'Высота букв' : 'Размер';
    $('txtCapsRow').hidden = !TF.isBuiltin(P.font);
  }
  function syncFields() {
    $('txtText').value = P.text;
    $('txtSize').value = P.size; $('txtBold').checked = P.bold; $('txtSmooth').checked = P.smooth;
    $('txtItalic').checked = !!P.italic; $('txtCaps').checked = !!P.smallCaps; $('txtKern').value = P.kern ?? 50; $('txtKernVal').textContent = (P.kern ?? 50) + '%';
    $('txtSpacing').value = P.spacing; $('txtLine').value = P.line; $('txtNewLayer').checked = P.newLayer;
    for (const b of document.querySelectorAll('[data-align]')) b.setAttribute('aria-pressed', String(b.dataset.align === P.align));
    fontOptions();
  }
  function renderStyles() {
    const sel = $('txtStyle');
    const opt = (st, group) => el('option', { value: group + ':' + st.name }, st.name);
    sel.replaceChildren(
      el('option', { value: '', disabled: true }, T.styleName ? '' : 'Свой набор шагов'),
      el('optgroup', { label: 'Готовые' }, BUILTIN.map((s) => opt(s, 'b'))),
      ...(mine.length ? [el('optgroup', { label: 'Мои стили' }, mine.map((s) => opt(s, 'm')))] : []));
    sel.value = T.styleName || '';
    $('txtStyleDel').disabled = !T.styleName.startsWith('m:');
  }
  function stepEditor(st) {
    const color = (key, alphaKey) => {
      const inp = el('input', { type: 'color', value: (st[key] || '#000000').slice(0, 7), title: 'Цвет' });
      inp.addEventListener('input', () => { st[key] = inp.value; touched(); });
      const out = [inp];
      if (alphaKey) {
        const r = el('input', { type: 'range', min: 20, max: 255, value: st[alphaKey] ?? 160, title: 'Непрозрачность' });
        r.addEventListener('input', () => { st[alphaKey] = +r.value; touched(); });
        out.push(r);
      }
      return out;
    };
    const num = (key, lo, hi, title, suffix) => {
      const inp = el('input', { type: 'number', min: lo, max: hi, value: st[key], title, inputmode: 'numeric' });
      inp.addEventListener('input', () => { if (inp.value === '') return; st[key] = U.clamp(Math.round(+inp.value) || 0, lo, hi); touched(); });
      return el('label', { title }, inp, suffix || '');
    };
    if (st.t === 'fill') return color('color');
    if (st.t === 'grad') {
      const strip = el('span', { class: 'gstrip', title: 'Градиент шага' });
      strip.style.background = 'linear-gradient(90deg,' + st.stops.map(([p, h]) => `${h} ${p * 100}%`).join(',') + ')';
      const take = el('button', { type: 'button', title: 'Взять текущий градиент' }, '↻');
      take.addEventListener('click', () => { const g = NPR.gradient.current; st.stops = g.stops.map((s) => [+s.p.toFixed(4), U.toHex(s.c, true)]); renderSteps(); touched(); });
      return [strip, num('angle', 0, 359, 'Угол градиента: 90° — сверху вниз, 0° — слева направо', '°'), take];
    }
    if (st.t === 'fx') {
      const n = (st.params.lights || []).filter((l) => l.on).length;
      const take = el('button', { type: 'button', title: 'Взять текущие настройки инструмента «Свет и текстура»' }, '↻');
      take.addEventListener('click', () => { Object.assign(st, NPR.fx.recordStep()); renderSteps(); touched(); });
      return [el('span', { class: 'desc' }, `${st.params.light ? n + ' ист.' : 'без света'}${st.tex ? ', ' + st.tex : ''}`), take];
    }
    if (st.t === 'outline') {
      const where = el('select', { title: 'Где' }, el('option', { value: 'out' }, 'снаружи'), el('option', { value: 'in' }, 'внутри'));
      where.value = st.inside ? 'in' : 'out';
      where.addEventListener('change', () => { st.inside = where.value === 'in'; touched(); });
      return [...color('color'), num('width', 1, 8, 'Толщина', 'px'), where];
    }
    if (st.t === 'glow') return [...color('color', 'alpha'), num('radius', 1, 12, 'Радиус', 'px')];
    if (st.t === 'shadow') return [...color('color', 'alpha'), num('dx', -16, 16, 'Сдвиг вправо', ''), num('dy', -16, 16, 'Сдвиг вниз', '')];
    return [];
  }
  function touched() { T.styleName = ''; renderStyles(); changed(); }
  function renderSteps() {
    const list = $('txtSteps');
    list.replaceChildren(...T.recipe.map((st, i) => {
      const up = el('button', { type: 'button', class: 'ico', title: 'Выше', 'aria-label': 'Шаг выше', disabled: i === 0 }, '↑');
      up.addEventListener('click', () => { [T.recipe[i - 1], T.recipe[i]] = [T.recipe[i], T.recipe[i - 1]]; renderSteps(); touched(); });
      const del = el('button', { type: 'button', class: 'ico', title: 'Убрать шаг', 'aria-label': 'Убрать шаг' }, '✕');
      del.addEventListener('click', () => { T.recipe.splice(i, 1); renderSteps(); touched(); });
      return el('li', null, el('span', { class: 'n' }, `${i + 1}. ${STEP_NAMES[st.t]}`), el('span', { class: 'ed' }, stepEditor(st)), up, del);
    }));
    if (!T.recipe.length) list.append(el('li', { class: 'empty' }, 'Шагов нет: текст рисуется основным цветом.'));
  }
  function addStepMenu(anchor) {
    const add = (st) => { T.recipe.push(st); renderSteps(); touched(); };
    const g = NPR.gradient.current;
    NPR.popup(anchor, [
      { label: 'Цвет (основной цвет)', action: () => add({ t: 'fill', color: U.toHex(S.primary) }) },
      { label: 'Градиент (текущий, сверху вниз)', action: () => add({ t: 'grad', stops: g.stops.map((s) => [+s.p.toFixed(4), U.toHex(s.c, true)]), type: S.gradType, angle: 90, steps: S.gradSteps, dither: S.gradDither }) },
      { label: 'Свет и текстура (текущие настройки)', action: () => add(NPR.fx.recordStep()) },
      { label: 'Обводка', action: () => add({ t: 'outline', color: U.toHex(S.secondary), width: 1, inside: false, diag: true }) },
      { label: 'Свечение', action: () => add({ t: 'glow', color: '#ff9a2e', radius: 3, alpha: 150 }) },
      { label: 'Тень', action: () => add({ t: 'shadow', color: '#000000', dx: 1, dy: 2, alpha: 160 }) },
    ]);
  }
  function chooseStyle(value) {
    const [g, ...rest] = value.split(':'), name = rest.join(':'), st = (g === 'b' ? BUILTIN : mine).find((s) => s.name === name);
    if (!st) return;
    T.recipe = clone(st.steps);
    T.styleName = value;
    renderSteps(); renderStyles(); changed();
  }
  async function saveStyle() {
    if (!T.recipe.length) return NPR.toast('В стиле нет шагов');
    const v = await NPR.dialog({ title: 'Сохранить стиль текста', okLabel: 'Сохранить', fields: [{ id: 'name', label: 'Название', value: 'Мой стиль ' + (mine.length + 1) }] });
    if (!v) return;
    const name = v.name.trim() || 'Мой стиль', i = mine.findIndex((s) => s.name === name), st = { name, steps: clone(T.recipe) };
    if (i >= 0) mine[i] = st; else mine.push(st);
    try { localStorage.setItem(STYLES_KEY, JSON.stringify(mine)); } catch (e) { NPR.toast('Не хватило места в браузере', true); }
    T.styleName = 'm:' + name;
    renderStyles(); saveState();
    NPR.toast('Стиль сохранён');
  }
  function setRecording(on) {
    T.recording = on;
    const b = $('txtRec');
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? '■ Остановить запись' : '● Записывать шаги';
    $('txtRecHint').hidden = !on;
    if (on && !T.recipe.length) NPR.toast('Запись идёт: применяйте заливку, градиент, свет и обводку — они станут шагами стиля');
  }
  T.setRecording = setRecording;
  T.show = function (on) {
    $('textPanel').hidden = !on;
    if (on) { fontOptions(); syncButtons(); }
    V.redrawOver();
  };

  T.init = async function () {
    try {
      const o = JSON.parse(localStorage.getItem(KEY)) || {};
      if (o.params) Object.assign(P, o.params);
      if (Array.isArray(o.recipe)) T.recipe = o.recipe;
      T.styleName = o.style || '';
    } catch (e) { /* по умолчанию */ }
    try { mine = JSON.parse(localStorage.getItem(STYLES_KEY)) || []; } catch (e) { mine = []; }
    if (!localStorage.getItem(KEY)) { T.recipe = clone(BUILTIN[1].steps); T.styleName = 'b:' + BUILTIN[1].name; }

    const ta = $('txtText');
    ta.addEventListener('input', () => { P.text = ta.value; changed(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); T.commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); ta.blur(); }
    });
    $('txtFont').addEventListener('change', (e) => { P.font = e.target.value; fontOptions(); changed(); });
    $('txtFontAdd').addEventListener('click', async () => {
      const f = await U.pickFile('.ttf,.otf,.woff,.woff2');
      if (!f) return;
      try { const n = await TF.addFontFile(f); P.font = 'f:' + n; fontOptions(); changed(); NPR.toast(`Шрифт «${n}» добавлен`); }
      catch (e) { NPR.toast('Это не файл шрифта или он повреждён', true); }
    });
    $('txtFontDel').addEventListener('click', async () => {
      if (!P.font.startsWith('f:')) return;
      await TF.removeFont(P.font.slice(2));
      P.font = 'b:inscription'; fontOptions(); changed();
    });
    const num = (id, key, lo, hi) => $(id).addEventListener('input', (e) => { if (e.target.value === '') return; P[key] = U.clamp(Math.round(+e.target.value) || 0, lo, hi); changed(); });
    num('txtSize', 'size', 4, 256); num('txtSpacing', 'spacing', -8, 32); num('txtLine', 'line', 50, 300);
    $('txtBold').addEventListener('change', (e) => { P.bold = e.target.checked; changed(); });
    $('txtItalic').addEventListener('change', (e) => { P.italic = e.target.checked; changed(); });
    $('txtCaps').addEventListener('change', (e) => { P.smallCaps = e.target.checked; changed(); });
    $('txtKern').addEventListener('input', (e) => { P.kern = +e.target.value; $('txtKernVal').textContent = P.kern + '%'; changed(); });
    $('txtSmooth').addEventListener('change', (e) => { P.smooth = e.target.checked; changed(); });
    $('txtNewLayer').addEventListener('change', (e) => { P.newLayer = e.target.checked; saveState(); });
    for (const b of document.querySelectorAll('[data-align]')) b.addEventListener('click', () => {
      const s = T.session;
      // при смене выравнивания текст остаётся на месте: точка привязки сдвигается вслед
      if (s && s.buf) { const old = origin(s); P.align = b.dataset.align; render(); const o = origin(s); s.x += old.x - o.x; s.y += old.y - o.y; }
      P.align = b.dataset.align;
      syncFields(); changed();
    });
    for (const b of document.querySelectorAll('[data-tcenter]')) b.addEventListener('click', () => T.center(b.dataset.tcenter));
    $('txtStyle').addEventListener('change', (e) => chooseStyle(e.target.value));
    $('txtStyleSave').addEventListener('click', saveStyle);
    $('txtStyleDel').addEventListener('click', () => {
      if (!T.styleName.startsWith('m:')) return;
      mine = mine.filter((s) => 'm:' + s.name !== T.styleName);
      try { localStorage.setItem(STYLES_KEY, JSON.stringify(mine)); } catch (e) { /* не страшно */ }
      T.styleName = ''; renderStyles(); saveState();
    });
    $('txtStepAdd').addEventListener('click', (e) => addStepMenu(e.currentTarget));
    $('txtRec').addEventListener('click', () => setRecording(!T.recording));
    $('txtApply').addEventListener('click', T.commit);
    $('txtCancel').addEventListener('click', T.cancel);
    $('txtEdit').addEventListener('click', () => T.editLayer());
    NPR.on('color', schedule);
    NPR.on('layers', syncButtons);
    NPR.on('history', syncButtons);
    syncFields(); renderSteps(); renderStyles(); syncButtons();
    await TF.loadSaved();
    fontOptions();
  };
})(window.NPR);
