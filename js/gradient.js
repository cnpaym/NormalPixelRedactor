'use strict';
/* Градиенты: модель (до 100 точек с прозрачностью), инструмент с живым
   предпросмотром, редактор точек, библиотека (недавние, свои, готовые)
   и полоса образцов для быстрого выбора цветов.

   Как работает инструмент: щелчок или протяжка задаёт область и направление.
   Область — выделение, а если его нет — участок одного цвета под курсором
   (по тем же правилам, что у заливки). Пока градиент не применён (Enter),
   его можно крутить, двигать за ручки и менять точки — холст обновляется сразу. */
(function (NPR) {
  const S = NPR.state, U = NPR.util, V = NPR.view, Sel = NPR.selection, { el } = U;
  const $ = (id) => document.getElementById(id);
  const KEY = 'npr.gradients', MAX_STOPS = 100, LUT_N = 1024, RECENT_MAX = 12;
  const G = (NPR.gradient = { current: null, session: null, mine: [], recent: [], samples: 16, stop: null, editing: false });

  /* ---------- модель ---------- */
  const fromStore = (g) => ({ name: g.name, stops: g.stops.map(([p, h]) => ({ p, c: U.parseHex(h) })).filter((s) => s.c !== null) });
  const toStore = (g) => ({ name: g.name, stops: g.stops.map((s) => [+s.p.toFixed(4), U.toHex(s.c, true)]) });
  const clone = (g) => ({ name: g.name, stops: g.stops.map((s) => ({ p: s.p, c: s.c })) });
  const sameStops = (a, b) => JSON.stringify(toStore(a).stops) === JSON.stringify(toStore(b).stops);
  const sortStops = (g) => g.stops.sort((a, b) => a.p - b.p);

  /* Цвет в точке t. Смешивание идёт в «умноженном на альфу» виде,
     чтобы переход в прозрачность не давал тёмной каймы. */
  function colorAt(stops, t) {
    const n = stops.length;
    if (t <= stops[0].p) return stops[0].c;
    if (t >= stops[n - 1].p) return stops[n - 1].c;
    let i = 0;
    while (i < n - 2 && stops[i + 1].p <= t) i++;
    const a = stops[i], b = stops[i + 1], span = b.p - a.p;
    if (span <= 0) return b.c;
    const f = (t - a.p) / span, aa = a.c >>> 24, ba = b.c >>> 24, oa = aa + (ba - aa) * f;
    if (oa <= 0) return 0;
    const ch = (sh) => (((a.c >>> sh) & 255) * aa * (1 - f) + ((b.c >>> sh) & 255) * ba * f) / oa;
    return U.rgba(Math.round(ch(0)), Math.round(ch(8)), Math.round(ch(16)), Math.round(oa));
  }
  G.colorAt = (t) => colorAt(G.current.stops, t);
  const css = (g) => 'linear-gradient(90deg,' + g.stops.map((s) => `${U.toCss(s.c)} ${(s.p * 100).toFixed(2)}%`).join(',') + ')';
  const CHECK = 'repeating-conic-gradient(#666 0 25%, #999 0 50%) 0 0 / 10px 10px';

  let lut = null;
  function getLUT() {
    if (!lut) { lut = new Uint32Array(LUT_N); for (let i = 0; i < LUT_N; i++) lut[i] = colorAt(G.current.stops, i / (LUT_N - 1)); }
    return lut;
  }

  /* ---------- отрисовка в слой ---------- */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  function render() {
    const s = G.session;
    if (!s) return;
    const { tx, region: r } = s, W = NPR.doc.width, d = tx.layer.data, alock = tx.layer.alphaLock;
    tx.revert();
    const table = getLUT(), type = S.gradType, N = S.gradSteps >= 2 ? S.gradSteps : 0, dither = N && S.gradDither, mix = S.gradBlend;
    const dx = s.p1.x - s.p0.x, dy = s.p1.y - s.p0.y, L2 = dx * dx + dy * dy || 1, L = Math.sqrt(L2), base = Math.atan2(dy, dx), TAU = Math.PI * 2;
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const i = y * W + x;
      if (!r.full[i]) continue;
      const px = x - s.p0.x, py = y - s.p0.y;
      let t;
      if (type === 'linear') t = (px * dx + py * dy) / L2;
      else if (type === 'radial') t = Math.sqrt(px * px + py * py) / L;
      else if (type === 'angular') { t = (Math.atan2(py, px) - base) / TAU; t -= Math.floor(t); }
      else t = Math.abs(px * dx + py * dy) / L2 + Math.abs(py * dx - px * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (N) {
        let k;
        if (dither) { const f = t * (N - 1); k = Math.floor(f); if (f - k > BAYER[(y & 3) * 4 + (x & 3)]) k++; }
        else k = Math.min(N - 1, Math.floor(t * N));
        t = k / (N - 1);
      }
      const c = table[(t * (LUT_N - 1) + 0.5) | 0], old = d[i];
      let n;
      if (alock) { if (old >>> 24 === 0) continue; n = (((mix ? U.blend(old, c) : c) & 0xffffff) | (old & 0xff000000)) >>> 0; }
      else n = mix ? U.blend(old, c) : c >>> 24 === 0 ? 0 : c;
      if (n !== old) tx.set(i, n);
    }
    tx.sync();
  }
  let raf = 0;
  function schedule() {
    if (raf || !G.session) return;
    raf = requestAnimationFrame(() => { raf = 0; render(); V.redrawOver(); });
  }
  function flush() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  /* ---------- сеанс инструмента ---------- */
  function region(doc, L, p) {
    const W = doc.width, H = doc.height, clip = { x0: 0, y0: 0, x1: W, y1: H };
    if (doc.sel) {
      const full = Sel.toFull(doc.sel, W, H);
      const x0 = Math.max(0, doc.sel.x), y0 = Math.max(0, doc.sel.y), x1 = Math.min(W, doc.sel.x + doc.sel.w) - 1, y1 = Math.min(H, doc.sel.y + doc.sel.h) - 1;
      return x1 >= x0 && y1 >= y0 ? { full, x0, y0, x1, y1 } : null;
    }
    if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) return null;
    let src = L.data;
    if (S.sampleAll) { doc.flush(); src = doc.comp32; }
    return Sel.region(src, W, H, p.x, p.y, { clip, contiguous: S.contiguous, tolerance: S.tolerance });
  }
  const dir = () => { const a = (S.gradAngle * Math.PI) / 180; return [Math.cos(a), Math.sin(a)]; };
  /* Щелчок без протяжки: градиент ложится на всю область под заданным углом. */
  function defaultVector(s) {
    const r = s.region, w = r.x1 - r.x0, h = r.y1 - r.y0, cx = r.x0 + w / 2, cy = r.y0 + h / 2, [ux, uy] = dir();
    const half = Math.max(0.5, (Math.abs(ux) * w + Math.abs(uy) * h) / 2);
    if (S.gradType === 'linear') { s.p0 = { x: cx - ux * half, y: cy - uy * half }; s.p1 = { x: cx + ux * half, y: cy + uy * half }; }
    else { s.p0 = { x: cx, y: cy }; s.p1 = { x: cx + ux * half, y: cy + uy * half }; }
  }
  function syncAngle() {
    const s = G.session;
    if (s) {
      const a = Math.round((Math.atan2(s.p1.y - s.p0.y, s.p1.x - s.p0.x) * 180) / Math.PI);
      S.gradAngle = ((a % 360) + 360) % 360;
    }
    if (document.activeElement !== $('gradAngle')) $('gradAngle').value = S.gradAngle;
  }
  function syncButtons() {
    $('gradApply').disabled = $('gradCancel').disabled = !G.session;
  }
  const screenOf = (p) => [V.ox + (p.x + 0.5) * V.zoom, V.oy + (p.y + 0.5) * V.zoom];

  let drag = null;
  NPR.tools.gradient = {
    down(p, ev) {
      let s = G.session;
      if (s) {
        for (const h of ['p1', 'p0']) {
          const [hx, hy] = screenOf(s[h]);
          if (Math.hypot(p.sx - hx, p.sy - hy) < 10) { drag = h; return; }
        }
        const W = NPR.doc.width;
        if (p.x >= 0 && p.y >= 0 && p.x < W && p.y < NPR.doc.height && s.region.full[p.y * W + p.x]) {
          s.p0 = { x: p.x, y: p.y }; s.p1 = { x: p.x, y: p.y }; drag = 'p1'; // та же область, новое направление
          schedule();
          return;
        }
        G.commit();
      }
      NPR.edit.commitSessions(G);
      NPR.edit.commitFloatOnly();
      const doc = NPR.doc, L = NPR.edit.editableLayer();
      if (!L) return false;
      const r = region(doc, L, p);
      if (!r) return false;
      G.session = { tx: new NPR.Tx(doc, L), region: r, p0: { x: p.x, y: p.y }, p1: { x: p.x, y: p.y } };
      drag = 'p1';
      syncButtons();
      schedule();
    },
    move(p, ev) {
      const s = G.session;
      if (!s || !drag) return;
      let x = p.x, y = p.y;
      if (ev && ev.shiftKey) { // привязка к шагу 15°
        const o = drag === 'p1' ? s.p0 : s.p1, len = Math.hypot(x - o.x, y - o.y);
        const a = Math.round(Math.atan2(y - o.y, x - o.x) / (Math.PI / 12)) * (Math.PI / 12);
        x = o.x + Math.cos(a) * len; y = o.y + Math.sin(a) * len;
      }
      s[drag] = { x, y };
      schedule();
    },
    up() {
      const s = G.session;
      if (!s) return;
      if (s.p0.x === s.p1.x && s.p0.y === s.p1.y) defaultVector(s);
      drag = null;
      syncAngle();
      schedule();
      NPR.status.flash('Enter — применить градиент, Esc — отменить');
    },
    cancel() { drag = null; },
  };

  G.commit = function () {
    const s = G.session;
    if (!s) return;
    flush();
    if (s.p0.x === s.p1.x && s.p0.y === s.p1.y) defaultVector(s);
    render();
    G.session = null; drag = null;
    if (NPR.edit.finish(s.tx, 'Градиент')) addRecent(G.current);
    syncButtons();
    V.redrawOver();
  };
  G.cancel = function () {
    const s = G.session;
    if (!s) return;
    flush();
    s.tx.revert();
    G.session = null; drag = null;
    syncButtons();
    V.redrawOver();
  };
  /* Ручки поверх холста. */
  G.drawOverlay = function (ctx) {
    const s = G.session;
    if (!s) return;
    const [x0, y0] = screenOf(s.p0), [x1, y1] = screenOf(s.p1);
    const stroke = (fn) => { ctx.beginPath(); fn(); ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); };
    if (S.gradType === 'radial') stroke(() => ctx.arc(x0, y0, Math.hypot(x1 - x0, y1 - y0), 0, Math.PI * 2));
    stroke(() => { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); });
    for (const [x, y, c] of [[x0, y0, G.colorAt(0)], [x1, y1, G.colorAt(1)]]) {
      stroke(() => ctx.arc(x, y, 6, 0, Math.PI * 2));
      ctx.fillStyle = U.toCss((c | 0xff000000) >>> 0); ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
    }
  };

  /* ---------- библиотека ---------- */
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ mine: G.mine.map(toStore), recent: G.recent.map(toStore), samples: G.samples, current: toStore(G.current) }));
    } catch (e) { /* хранилище недоступно */ }
  }
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY)) || {};
      const ok = (g) => g.stops.length >= 2;
      G.mine = (o.mine || []).map(fromStore).filter(ok);
      G.recent = (o.recent || []).map(fromStore).filter(ok);
      if ([8, 16, 32].includes(o.samples)) G.samples = o.samples;
      if (o.current) { const c = fromStore(o.current); if (ok(c)) G.current = c; }
    } catch (e) { /* начинаем с готовых */ }
    if (!G.current) G.current = clone(fromStore(NPR.gradientPresets[0]));
  }
  function addRecent(g) {
    const i = G.recent.findIndex((r) => sameStops(r, g));
    if (i >= 0) G.recent.splice(i, 1);
    G.recent.unshift(clone(g));
    if (G.recent.length > RECENT_MAX) G.recent.pop();
    save(); renderList();
  }
  G.select = function (g) {
    G.current = clone(g);
    G.stop = G.current.stops[0];
    changed(true);
  };
  /* Текущий градиент изменился: обновить всё, что его показывает. */
  function changed(rebuild) {
    lut = null;
    sortStops(G.current);
    renderBar();
    renderEditor(rebuild);
    schedule();
    save();
  }

  function item(g, menuItems) {
    const b = el('button', { type: 'button', class: 'grad', title: g.name, 'aria-label': 'Градиент ' + g.name });
    b.style.background = css(g) + ', ' + CHECK;
    b.addEventListener('click', () => G.select(g));
    if (menuItems) b.addEventListener('contextmenu', (e) => { e.preventDefault(); NPR.popup(b, menuItems(g)); });
    return b;
  }
  async function saveAsMine(g) {
    const v = await NPR.dialog({ title: 'Сохранить градиент', okLabel: 'Сохранить', fields: [{ id: 'name', label: 'Название', value: g.name && !/^GPE /.test(g.name) ? g.name : 'Мой градиент ' + (G.mine.length + 1) }] });
    if (!v) return;
    const c = clone(g);
    c.name = v.name.trim() || 'Мой градиент';
    G.mine.unshift(c);
    G.current.name = c.name;
    save(); renderList();
    NPR.toast('Градиент сохранён в «Мои»');
  }
  G.saveCurrent = () => saveAsMine(G.current);
  function renderList() {
    const box = $('gradList');
    const section = (title, list, menu, empty) => {
      const out = [el('h3', null, title)];
      if (!list.length && empty) out.push(el('p', { class: 'empty' }, empty));
      for (const g of list) out.push(item(g, menu));
      return out;
    };
    box.replaceChildren(
      ...section('Недавние', G.recent, (g) => [
        { label: 'Сохранить в «Мои»…', action: () => saveAsMine(g) },
        { label: 'Убрать из недавних', action: () => { G.recent.splice(G.recent.indexOf(g), 1); save(); renderList(); } },
      ], 'Появятся после первого применения.'),
      ...section('Мои', G.mine, (g) => [
        { label: 'Переименовать…', action: async () => {
          const v = await NPR.dialog({ title: 'Название градиента', okLabel: 'Переименовать', fields: [{ id: 'name', label: 'Название', value: g.name }] });
          if (v && v.name.trim()) { g.name = v.name.trim(); save(); renderList(); }
        } },
        { label: 'Удалить', action: () => { G.mine.splice(G.mine.indexOf(g), 1); save(); renderList(); } },
      ], 'Сохраните текущий кнопкой «+».'),
      ...section('Готовые', G.builtin));
  }

  /* ---------- верхняя полоса: текущий градиент и образцы ---------- */
  function renderBar() {
    $('gradStrip').style.background = css(G.current) + ', ' + CHECK;
    const n = G.samples;
    $('gradSwatches').replaceChildren(...Array.from({ length: n }, (_, i) => {
      const c = G.colorAt(i / (n - 1));
      const b = el('button', { type: 'button', class: 'swatch', title: U.toHex(c), 'aria-label': 'Образец ' + U.toHex(c) });
      b.style.setProperty('--c', U.toCss(c));
      b.addEventListener('click', () => { G.stop = null; renderEditor(); NPR.setColor('primary', c); });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); NPR.setColor('secondary', c); });
      return b;
    }));
  }

  /* ---------- редактор точек ---------- */
  const handles = new Map();
  let linking = false; // защита от петли «точка → выбор цвета → точка»
  function selectStop(s) {
    G.stop = s;
    if (s) { linking = true; NPR.setColor('primary', s.c); linking = false; }
    renderEditor();
  }
  function renderEditor(rebuild) {
    if (!G.editing) return;
    const g = G.current, box = $('gradStops');
    $('gradEditBar').style.background = css(g) + ', ' + CHECK;
    if (rebuild || handles.size !== g.stops.length || g.stops.some((s) => !handles.has(s))) {
      handles.clear();
      box.replaceChildren(...g.stops.map((s) => {
        const h = el('button', { type: 'button', class: 'gstop', 'aria-label': 'Точка градиента' });
        h.addEventListener('pointerdown', (e) => { h.setPointerCapture(e.pointerId); selectStop(s); });
        h.addEventListener('pointermove', (e) => {
          if (!h.hasPointerCapture(e.pointerId)) return;
          const r = box.getBoundingClientRect();
          s.p = Math.round(U.clamp((e.clientX - r.left) / r.width, 0, 1) * 1000) / 1000;
          changed();
        });
        handles.set(s, h);
        return h;
      }));
    }
    if (G.stop && !g.stops.includes(G.stop)) G.stop = null;
    for (const [s, h] of handles) {
      h.style.left = s.p * 100 + '%';
      h.style.setProperty('--c', U.toCss(s.c));
      h.setAttribute('aria-pressed', String(s === G.stop));
    }
    const st = G.stop, pos = $('gradPos'), hex = $('gradHex');
    pos.disabled = hex.disabled = $('gradDelStop').disabled = !st;
    if (st) {
      if (document.activeElement !== pos) pos.value = +(st.p * 100).toFixed(1);
      if (document.activeElement !== hex) hex.value = U.toHex(st.c);
    } else { pos.value = ''; hex.value = ''; }
    $('gradDelStop').disabled = !st || g.stops.length <= 2;
    $('gradCount').textContent = `Точек: ${g.stops.length} из ${MAX_STOPS}`;
  }
  G.toggleEditor = function (on) {
    G.editing = on === undefined ? !G.editing : on;
    $('gradEditor').hidden = !G.editing;
    $('gradEdit').setAttribute('aria-pressed', String(G.editing));
    if (G.editing) { if (!G.stop) G.stop = G.current.stops[0]; selectStop(G.stop); renderEditor(true); }
  };

  G.init = function () {
    G.builtin = NPR.gradientPresets.map(fromStore);
    load();
    G.stop = G.current.stops[0];

    $('gradSamples').value = G.samples;
    $('gradSamples').addEventListener('change', (e) => { G.samples = +e.target.value; renderBar(); save(); });
    $('gradStrip').addEventListener('click', () => G.toggleEditor());
    $('gradEdit').addEventListener('click', () => G.toggleEditor());
    $('gradSave').addEventListener('click', G.saveCurrent);
    $('gradClose').addEventListener('click', () => G.toggleEditor(false));

    // щелчок по полосе добавляет точку
    $('gradEditBar').addEventListener('click', (e) => {
      const g = G.current;
      if (g.stops.length >= MAX_STOPS) return NPR.toast(`В градиенте не больше ${MAX_STOPS} точек`);
      const r = e.currentTarget.getBoundingClientRect(), p = Math.round(U.clamp((e.clientX - r.left) / r.width, 0, 1) * 1000) / 1000;
      const s = { p, c: colorAt(g.stops, p) };
      g.stops.push(s);
      changed(true);
      selectStop(s);
    });
    $('gradPos').addEventListener('input', (e) => {
      if (!G.stop || e.target.value === '') return;
      G.stop.p = U.clamp(+e.target.value, 0, 100) / 100;
      changed();
    });
    $('gradHex').addEventListener('input', (e) => {
      const c = U.parseHex(e.target.value);
      if (G.stop && c !== null) { G.stop.c = c; linking = true; NPR.setColor('primary', c); linking = false; changed(); }
    });
    $('gradDelStop').addEventListener('click', () => {
      const g = G.current;
      if (!G.stop || g.stops.length <= 2) return;
      g.stops.splice(g.stops.indexOf(G.stop), 1);
      G.stop = null;
      changed(true);
    });
    $('gradReverse').addEventListener('click', () => { for (const s of G.current.stops) s.p = +(1 - s.p).toFixed(4); changed(); });
    $('gradEven').addEventListener('click', () => { const st = G.current.stops; st.forEach((s, i) => { s.p = i / (st.length - 1); }); changed(); });
    // выбор цвета справа красит выбранную точку
    NPR.on('color', () => {
      if (linking || !G.editing || !G.stop || G.stop.c === S.primary) return;
      G.stop.c = S.primary;
      changed();
    });

    // настройки инструмента
    const opt = (id, key, read) => $(id).addEventListener('input', (e) => { S[key] = read(e.target); NPR.saveSettings(); schedule(); });
    opt('gradType', 'gradType', (t) => t.value);
    opt('gradSteps', 'gradSteps', (t) => U.clamp(Math.round(+t.value) || 0, 0, 64));
    opt('gradDither', 'gradDither', (t) => t.checked);
    opt('gradBlend', 'gradBlend', (t) => t.checked);
    $('gradAngle').addEventListener('input', (e) => {
      if (e.target.value === '') return;
      S.gradAngle = (((Math.round(+e.target.value) || 0) % 360) + 360) % 360;
      NPR.saveSettings();
      const s = G.session;
      if (!s) return;
      const [ux, uy] = dir(), len = Math.hypot(s.p1.x - s.p0.x, s.p1.y - s.p0.y);
      if (S.gradType === 'linear') { // крутим вокруг середины
        const mx = (s.p0.x + s.p1.x) / 2, my = (s.p0.y + s.p1.y) / 2;
        s.p0 = { x: mx - (ux * len) / 2, y: my - (uy * len) / 2 }; s.p1 = { x: mx + (ux * len) / 2, y: my + (uy * len) / 2 };
      } else s.p1 = { x: s.p0.x + ux * len, y: s.p0.y + uy * len };
      schedule();
    });
    $('gradApply').addEventListener('click', G.commit);
    $('gradCancel').addEventListener('click', G.cancel);

    $('gradType').value = S.gradType; $('gradSteps').value = S.gradSteps;
    $('gradDither').checked = S.gradDither; $('gradBlend').checked = S.gradBlend;
    syncAngle(); syncButtons();
    renderList(); renderBar();
  };
})(window.NPR);
