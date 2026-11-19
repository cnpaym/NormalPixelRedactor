'use strict';
/* Анимация: всё, что убирает рутину из покадровой работы.

   Тень на полу, обводка на всех кадрах, шлейф, очистка пикселей, твининг,
   «дыхание» (Auto-Idle), цветовое циклирование, эффект удара, операции с кадрами
   и инструмент «Дуга удара». Каждое действие — одна запись в истории отмены.
   Результат, который потом захочется пересоздать (тень, контур, шлейф), идёт
   отдельным слоем «<имя> — …»: повторный запуск заменяет этот слой. */
(function (NPR) {
  const U = NPR.util, V = NPR.view, S = NPR.state, { el } = U;
  const A = (NPR.anim = {});
  const $ = (id) => document.getElementById(id);
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const remember = (key, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('npr.anim.' + key)) || {}; localStorage.setItem('npr.anim.' + key, JSON.stringify(v)); } catch (e) { /* не страшно */ } return v || {}; };

  /* ---------- общее ---------- */
  const framesOf = (L) => (L.frames ? L.frames : [L.data]);
  function bbox(d, W, H) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[y * W + x] >>> 24) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  A.bbox = bbox;
  /* Пиксель с прозрачностью a (0…1): узором Байера или настоящей альфой. */
  function putA(d, W, x, y, rgb, a, dither) {
    if (a <= 0.01) return;
    const i = y * W + x;
    if (dither) { if (a >= BAYER[(y & 3) * 4 + (x & 3)]) d[i] = (rgb | 0xff000000) >>> 0; return; }
    const src = ((rgb & 0xffffff) | (Math.round(a * 255) << 24)) >>> 0;
    d[i] = d[i] >>> 24 ? U.blend(d[i], src) : src;
  }
  /* Слой-результат: заменяет прежний с тем же именем, иначе встаёт под или над исходным. */
  function putResultLayer(doc, src, name, frames, below) {
    const old = doc.layers.find((l) => l.name === name);
    let at;
    if (old) { at = doc.indexOf(old.id); doc.layers.splice(at, 1); }
    else at = doc.indexOf(src.id) + (below ? 0 : 1);
    const L = doc.newLayer(name, frames[0]);
    if (frames.length > 1 || src.frames) { L.frames = frames; L.frame = Math.min(src.frame || 0, frames.length - 1); L.data = frames[L.frame]; }
    doc.addLayerRaw(L, Math.max(0, at));
    return L;
  }
  /* Записать новые кадры в слой (слой становится спрайтшитом). */
  function setFrames(L, frames, keepIndex) {
    L.frames = frames;
    L.frame = Math.min(keepIndex ?? L.frame ?? 0, frames.length - 1);
    L.data = frames[L.frame];
    if (L.depths) L.depths = null; // карты глубины кадров больше не совпадают
  }
  const needLayer = () => {
    const L = NPR.doc.active;
    if (!L) { NPR.toast('Нет слоя'); return null; }
    if (L.locked) { NPR.toast('Слой заблокирован', true); return null; }
    NPR.edit.commitSessions(); NPR.edit.commitFloat();
    return L;
  };
  const hexOf = (c) => U.toHex(c | 0xff000000).slice(0, 7);
  const rgbOf = (hex) => U.parseHex(hex) & 0xffffff;
  const ease = { linear: (t) => t, in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t), inout: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)) };
  const EASES = [['linear', 'равномерно'], ['in', 'разгон (ease-in)'], ['out', 'торможение (ease-out)'], ['inout', 'плавно (ease-in-out)']];

  /* ---------- 1. очистка «грязных» пикселей ----------
     Угол из трёх пикселей (L-образный «дубль») в линии толщиной 1 px: у пикселя ровно
     два соседа — сверху/снизу и слева/справа, а диагональ между ними пустая. Такой
     угловой пиксель лишний: линия остаётся связной по диагонали. */
  A.cleanPixels = function (d, W, H, o = {}) {
    const out = d.slice(), sel = o.sel, same = o.sameColor !== false;
    let n = 0;
    const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && out[y * W + x] >>> 24 >= 128;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, c = out[i];
      if (!(c >>> 24) || (sel && !NPR.selection.has(sel, x, y))) continue;
      const N = on(x, y - 1), Sx = on(x, y + 1), Wx = on(x - 1, y), E = on(x + 1, y);
      let a = -1, b = -1, diag = false;
      // ровно два перпендикулярных соседа, противоположные стороны пустые, диагональ между ними пустая
      if (N && E && !Sx && !Wx) { a = i - W; b = i + 1; diag = on(x + 1, y - 1); }
      else if (N && Wx && !Sx && !E) { a = i - W; b = i - 1; diag = on(x - 1, y - 1); }
      else if (Sx && E && !N && !Wx) { a = i + W; b = i + 1; diag = on(x + 1, y + 1); }
      else if (Sx && Wx && !N && !E) { a = i + W; b = i - 1; diag = on(x - 1, y + 1); }
      if (a < 0 || diag) continue;
      if (same && (out[a] !== c || out[b] !== c)) continue; // не трогать стыки разных цветов
      // остальные соседи должны касаться тех двух — иначе без пикселя линия разорвётся
      let keep = true;
      const ax = a % W, ay = (a / W) | 0, bx = b % W, by = (b / W) | 0;
      for (let dy = -1; dy <= 1 && keep; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, j = Y * W + X;
        if ((!dx && !dy) || j === a || j === b || !on(X, Y)) continue;
        if (Math.max(Math.abs(X - ax), Math.abs(Y - ay)) > 1 && Math.max(Math.abs(X - bx), Math.abs(Y - by)) > 1) { keep = false; break; }
      }
      if (!keep) continue;
      out[i] = 0; n++;
    }
    return { data: out, removed: n };
  };
  A.cleanupDialog = async function () {
    const L = needLayer(); if (!L) return;
    const m = remember('clean'), doc = NPR.doc;
    const v = await NPR.dialog({ title: 'Очистка пикселей (pixel-perfect)', okLabel: 'Очистить', fields: [
      { type: 'note', label: 'Сбривает лишние угловые пиксели в линиях толщиной 1 px — «дубли» после RotSprite, масштаба и быстрого скетча.' },
      { id: 'where', label: 'Где', type: 'select', value: m.where || 'frame', options: L.frames ? [['frame', 'текущий кадр'], ['all', 'все кадры слоя']] : [['frame', 'слой']] },
      { id: 'same', label: 'Только внутри одного цвета', type: 'checkbox', value: m.same !== false },
    ] });
    if (!v) return;
    remember('clean', v);
    A.cleanup(v.where === 'all', v.same);
  };
  A.cleanup = function (all, same = true) {
    const L = needLayer(); if (!L) return;
    const doc = NPR.doc, W = doc.width, H = doc.height, sel = doc.sel;
    let n = 0;
    NPR.ops.snap('Очистка пикселей', (d) => {
      const T = d.getLayer(L.id), list = framesOf(T);
      const out = list.map((f, k) => {
        if (!all && T.frames && k !== T.frame) return f;
        const r = A.cleanPixels(f, W, H, { sel, sameColor: same });
        n += r.removed;
        return r.removed ? r.data : f;
      });
      if (T.frames) setFrames(T, out, T.frame); else T.data = out[0];
    });
    NPR.toast(n ? `Убрано лишних пикселей: ${n}` : 'Лишних угловых пикселей не нашлось');
  };

  /* ---------- 2. обводка на всех кадрах ---------- */
  A.outlineDialog = async function () {
    const L = needLayer(); if (!L) return;
    const m = remember('outline');
    const v = await NPR.dialog({ title: 'Контур на всех кадрах', okLabel: 'Сделать контур', fields: [
      { id: 'color', label: 'Цвет', type: 'color', value: m.color || '#1a1020' },
      { id: 'width', label: 'Толщина, px', type: 'number', value: m.width || 1, min: 1, max: 8 },
      { id: 'diag', label: 'С углами по диагонали', type: 'checkbox', value: !!m.diag },
      { id: 'inside', label: 'Внутрь (по краю самого рисунка)', type: 'checkbox', value: !!m.inside },
      { id: 'out', label: 'Куда', type: 'select', value: m.out || 'layer', options: [['layer', 'отдельным слоем (можно пересоздать после правок)'], ['self', 'прямо в кадры слоя']] },
    ] });
    if (!v) return;
    remember('outline', v);
    const doc = NPR.doc, W = doc.width, H = doc.height, col = (rgbOf(v.color) | 0xff000000) >>> 0;
    const frames = framesOf(L).map((f) => {
      const px = NPR.ops.outlinePixels(f, W, H, { width: v.width, diag: v.diag, inside: v.inside });
      const o = v.out === 'self' ? f.slice() : new Uint32Array(W * H);
      for (const i of px) o[i] = col;
      return o;
    });
    NPR.ops.snap('Контур на всех кадрах', (d) => {
      const T = d.getLayer(L.id);
      if (v.out === 'self') { if (T.frames) setFrames(T, frames, T.frame); else T.data = frames[0]; }
      else putResultLayer(d, T, T.name + NPR.t(' — контур'), frames, v.inside ? false : true);
      d.activeId = T.id;
    });
    NPR.toast(`Контур готов на ${frames.length} кадр.` + (v.out === 'layer' ? ' Поправили рисунок — запустите снова, слой контура пересоздастся' : ''));
  };

  /* ---------- 3. тень на полу ---------- */
  A.shadowFrames = function (L, W, H, o) {
    const list = framesOf(L), info = list.map((f) => {
      const b = bbox(f, W, H);
      if (!b) return null;
      // ступни: самые нижние 2 ряда рисунка
      let fx0 = W, fx1 = -1;
      for (let y = Math.max(0, b.y1 - 1); y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (f[y * W + x] >>> 24) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; }
      return { b, cx: (b.x0 + b.x1) / 2, fw: Math.max(fx1 - fx0 + 1, b.w * 0.5) };
    });
    const ok = info.filter(Boolean);
    if (!ok.length) return null;
    const ground = o.ground ?? Math.max(...ok.map((i) => i.b.y1)); // пол — самая низкая точка ног
    const baseW = Math.max(...ok.map((i) => i.fw)) * o.width;
    const rgb = rgbOf(o.color);
    return list.map((_, k) => {
      const out = new Uint32Array(W * H), i = info[k];
      if (!i) return out;
      const h = Math.max(0, ground - i.b.y1); // насколько персонаж оторвался от пола
      const s = Math.max(0.25, 1 - h * o.shrink), a = Math.max(0, o.opacity * (1 - h * o.fade));
      const rx = Math.max(1, (baseW * s) / 2), ry = Math.max(0.6, rx * o.flat);
      const cx = i.cx + o.dx, cy = ground + 1 + o.dy;
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const e = ((x + 0.5 - cx - 0.5) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        if (e > 1) continue;
        // в середине тень плотнее, к краю — мягче
        putA(out, W, x, y, rgb, a * (o.soft ? Math.min(1, (1 - e) * 2.2) : 1), o.dither);
      }
      return out;
    });
  };
  A.shadowDialog = async function () {
    const L = needLayer(); if (!L) return;
    const m = remember('shadow');
    const v = await NPR.dialog({ title: 'Тень на полу', okLabel: 'Сделать тень', fields: [
      { type: 'note', label: 'Тень ложится под ноги на каждом кадре. Персонаж подпрыгнул — тень меньше и бледнее, приземлился — шире и темнее.' },
      { id: 'color', label: 'Цвет', type: 'color', value: m.color || '#000000' },
      { id: 'opacity', label: 'Плотность, %', type: 'number', value: m.opacity ?? 45, min: 5, max: 100 },
      { id: 'width', label: 'Ширина от ступней, %', type: 'number', value: m.width ?? 120, min: 30, max: 300 },
      { id: 'flat', label: 'Сплющенность, %', type: 'number', value: m.flat ?? 30, min: 10, max: 100 },
      { id: 'shrink', label: 'Уменьшение на 1 px прыжка, %', type: 'number', value: m.shrink ?? 6, min: 0, max: 30 },
      { id: 'fade', label: 'Бледнее на 1 px прыжка, %', type: 'number', value: m.fade ?? 7, min: 0, max: 30 },
      { id: 'dx', label: 'Сдвиг X, px', type: 'number', value: m.dx ?? 0, min: -64, max: 64 },
      { id: 'dy', label: 'Сдвиг Y, px', type: 'number', value: m.dy ?? 0, min: -64, max: 64 },
      { id: 'style', label: 'Прозрачность', type: 'select', value: m.style || 'dither', options: [['dither', 'узором (пиксель-арт)'], ['alpha', 'полупрозрачная'], ['solid', 'сплошная плотная']] },
    ] });
    if (!v) return;
    remember('shadow', v);
    const doc = NPR.doc, W = doc.width, H = doc.height;
    const frames = A.shadowFrames(L, W, H, { color: v.color, opacity: v.style === 'solid' ? 1 : v.opacity / 100, width: v.width / 100, flat: v.flat / 100, shrink: v.shrink / 100, fade: v.fade / 100, dx: v.dx, dy: v.dy, dither: v.style !== 'alpha', soft: v.style === 'alpha' });
    if (!frames) return NPR.toast('На слое пусто — не под чем делать тень');
    NPR.ops.snap('Тень на полу', (d) => { const T = d.getLayer(L.id); putResultLayer(d, T, T.name + NPR.t(' — тень'), frames, true); d.activeId = T.id; });
    NPR.toast(`Тень на ${frames.length} кадр. — отдельным слоем под персонажем`);
  };

  /* ---------- 4. шлейф (afterimage) ---------- */
  A.trailFrames = function (L, W, H, o) {
    const list = framesOf(L), n = list.length, rgb = rgbOf(o.color);
    const from = U.clamp(o.from - 1, 0, n - 1), to = U.clamp(o.to - 1, from, n - 1);
    return list.map((_, f) => {
      const out = new Uint32Array(W * H);
      if (f < from || f > to) return out;
      for (let k = o.count; k >= 1; k--) { // дальние копии — первыми, ближние поверх
        let sf = f - k * o.lag;
        if (sf < from) { if (!o.wrap) continue; sf = from + ((((sf - from) % (to - from + 1)) + (to - from + 1)) % (to - from + 1)); }
        const src = list[sf], a = o.opacity * (1 - (k - 1) / o.count), ox = Math.round(o.dx * k), oy = Math.round(o.dy * k);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (!(src[y * W + x] >>> 24)) continue;
          const X = x + ox, Y = y + oy;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          putA(out, W, X, Y, o.keepColors ? src[y * W + x] : rgb, a, o.dither);
        }
      }
      return out;
    });
  };
  A.trailDialog = async function () {
    const L = needLayer(); if (!L) return;
    if (!L.frames || L.frames.length < 2) return NPR.toast('Шлейф строится из прошлых кадров — нужен слой-спрайтшит хотя бы из 2 кадров');
    const m = remember('trail'), n = L.frames.length;
    const v = await NPR.dialog({ title: 'Шлейф (afterimage)', okLabel: 'Сделать шлейф', fields: [
      { type: 'note', label: 'За персонажем тянутся силуэты из прошлых кадров: рывок, телепорт, супер-удар.' },
      { id: 'count', label: 'Сколько копий', type: 'number', value: m.count ?? 2, min: 1, max: 8 },
      { id: 'lag', label: 'Отставание, кадров', type: 'number', value: m.lag ?? 1, min: 1, max: 8 },
      { id: 'color', label: 'Цвет', type: 'color', value: m.color || '#4fc3ff' },
      { id: 'keep', label: 'Сохранить цвета спрайта (без перекраски)', type: 'checkbox', value: !!m.keep },
      { id: 'opacity', label: 'Плотность ближней копии, %', type: 'number', value: m.opacity ?? 70, min: 5, max: 100 },
      { id: 'dx', label: 'Сдвиг каждой копии X, px', type: 'number', value: m.dx ?? 0, min: -32, max: 32 },
      { id: 'dy', label: 'Сдвиг каждой копии Y, px', type: 'number', value: m.dy ?? 0, min: -32, max: 32 },
      { id: 'from', label: 'С кадра', type: 'number', value: 1, min: 1, max: n },
      { id: 'to', label: 'По кадр', type: 'number', value: n, min: 1, max: n },
      { id: 'wrap', label: 'По кругу (для зацикленной анимации)', type: 'checkbox', value: !!m.wrap },
      { id: 'style', label: 'Прозрачность', type: 'select', value: m.style || 'dither', options: [['dither', 'узором (пиксель-арт)'], ['alpha', 'полупрозрачная']] },
    ] });
    if (!v) return;
    remember('trail', v);
    const doc = NPR.doc;
    const frames = A.trailFrames(L, doc.width, doc.height, { count: v.count, lag: v.lag, color: v.color, keepColors: v.keep, opacity: v.opacity / 100, dx: v.dx, dy: v.dy, from: v.from, to: v.to, wrap: v.wrap, dither: v.style === 'dither' });
    NPR.ops.snap('Шлейф', (d) => { const T = d.getLayer(L.id); putResultLayer(d, T, T.name + NPR.t(' — шлейф'), frames, true); d.activeId = T.id; });
    NPR.toast('Шлейф готов — отдельным слоем позади персонажа');
  };

  /* ---------- 5. твининг ---------- */
  function transformObj(obj, w, h, rot, scale) {
    let r = { data: obj, w, h };
    if (Math.abs(rot) > 0.01) r = NPR.edit.rotateAny(obj, w, h, rot);
    if (Math.abs(scale - 1) > 0.001) {
      const nw = Math.max(1, Math.round(r.w * scale)), nh = Math.max(1, Math.round(r.h * scale)), o = new Uint32Array(nw * nh);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) o[y * nw + x] = r.data[Math.min(r.h - 1, Math.floor(y / scale)) * r.w + Math.min(r.w - 1, Math.floor(x / scale))];
      r = { data: o, w: nw, h: nh };
    }
    return r;
  }
  const centroid = (d, W, H) => { let sx = 0, sy = 0, n = 0; for (let i = 0; i < d.length; i++) if (d[i] >>> 24) { sx += i % W; sy += (i / W) | 0; n++; } return n ? [sx / n, sy / n] : null; };
  A.tween = function (L, o) {
    const doc = NPR.doc, W = doc.width, H = doc.height, list = framesOf(L).slice(), a = o.from - 1, b = o.to - 1;
    const src = list[a], sel = o.sel;
    // объект — выделенное или весь кадр
    const box = sel ? { x0: sel.x, y0: sel.y, w: sel.w, h: sel.h } : (() => { const bb = bbox(src, W, H); return bb && { x0: bb.x0, y0: bb.y0, w: bb.w, h: bb.h }; })();
    if (!box) return null;
    const obj = new Uint32Array(box.w * box.h), bg = src.slice();
    for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
      const X = box.x0 + x, Y = box.y0 + y;
      if (X < 0 || Y < 0 || X >= W || Y >= H || (sel && !NPR.selection.has(sel, X, Y))) continue;
      obj[y * box.w + x] = src[Y * W + X];
      if (sel) bg[Y * W + X] = 0;
    }
    if (!sel) bg.fill(0);
    let dx = o.dx, dy = o.dy;
    if (o.auto && list[b] && !sel) { const c0 = centroid(src, W, H), c1 = centroid(list[b], W, H); if (c0 && c1) { dx = c1[0] - c0[0]; dy = c1[1] - c0[1]; } }
    while (list.length <= b) list.push(new Uint32Array(W * H));
    const cx = box.x0 + box.w / 2, cy = box.y0 + box.h / 2, e = ease[o.ease] || ease.linear;
    const last = o.auto && !sel ? b - 1 : b;
    for (let f = a + 1; f <= last; f++) {
      const t = e((f - a) / (b - a)), r = transformObj(obj, box.w, box.h, o.rot * t, 1 + (o.scale - 1) * t);
      const out = bg.slice(), ox = Math.round(cx + dx * t - r.w / 2), oy = Math.round(cy + dy * t - r.h / 2);
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
        const c = r.data[y * r.w + x], X = ox + x, Y = oy + y;
        if (!(c >>> 24) || X < 0 || Y < 0 || X >= W || Y >= H) continue;
        out[Y * W + X] = c >>> 24 === 255 || !(out[Y * W + X] >>> 24) ? c : U.blend(out[Y * W + X], c);
      }
      list[f] = out;
    }
    return { frames: list, dx, dy };
  };
  A.tweenDialog = async function () {
    const L = needLayer(); if (!L) return;
    const doc = NPR.doc, n = L.frames ? L.frames.length : 1, cur = (L.frame || 0) + 1, m = remember('tween'), sel = doc.sel;
    const v = await NPR.dialog({ title: 'Твининг: плавное движение', okLabel: 'Раскидать кадры', fields: [
      { type: 'note', label: sel ? 'Двигается выделенное на кадре «от», остальное в кадрах остаётся.' : 'Двигается весь рисунок кадра «от». Если объект уже стоит на кадре «до» — включите «найти сдвиг сам».' },
      { id: 'from', label: 'От кадра', type: 'number', value: cur, min: 1, max: 64 },
      { id: 'to', label: 'До кадра', type: 'number', value: Math.max(cur + 5, Math.min(n, cur + 5)), min: 2, max: 64 },
      { id: 'auto', label: 'Найти сдвиг сам (объект уже стоит на кадре «до»)', type: 'checkbox', value: !sel && n > cur && !!m.auto },
      { id: 'dx', label: 'Сдвиг X, px', type: 'number', value: m.dx ?? 0, min: -4096, max: 4096 },
      { id: 'dy', label: 'Сдвиг Y, px', type: 'number', value: m.dy ?? -20, min: -4096, max: 4096 },
      { id: 'rot', label: 'Поворот, °', type: 'number', value: m.rot ?? 0, min: -720, max: 720 },
      { id: 'scale', label: 'Масштаб в конце, %', type: 'number', value: m.scale ?? 100, min: 10, max: 400 },
      { id: 'ease', label: 'Кривая', type: 'select', value: m.ease || 'inout', options: EASES },
    ], check: (x) => (x.to > x.from ? null : { error: '«До кадра» должно быть больше «от кадра»' }) });
    if (!v) return;
    remember('tween', v);
    const r = A.tween(L, { ...v, scale: v.scale / 100, sel });
    if (!r) return NPR.toast('На кадре «от» пусто — нечего двигать');
    NPR.ops.snap('Твининг', (d) => { const T = d.getLayer(L.id); setFrames(T, r.frames, v.from - 1); });
    NPR.toast(`Готово: кадры ${v.from}–${v.to}, сдвиг ${Math.round(r.dx)}, ${Math.round(r.dy)} px`);
  };

  /* ---------- 6. дыхание (Auto-Idle) ----------
     Верх спрайта плавно проседает на amp пикселей и чуть расширяется к середине
     вдоха; ступни стоят на месте. Сдвиги целые — никакой «каши». */
  A.idleFrames = function (src, W, H, o) {
    const b = bbox(src, W, H);
    if (!b) return null;
    const out = [], cx = (b.x0 + b.x1 + 1) / 2, bottom = b.y1 + 1, hh = b.h;
    for (let f = 0; f < o.frames; f++) {
      const w = (1 - Math.cos((f / o.frames) * Math.PI * 2)) / 2; // 0 → 1 → 0
      const drop = Math.round(o.amp * w), wide = Math.round(o.wide * w);
      const ky = (hh - drop) / hh, d = new Uint32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (y >= bottom || y < b.y0 + drop - 1) { if (y >= bottom) d[y * W + x] = src[y * W + x]; continue; }
        const sy = Math.floor(bottom - (bottom - y - 0.5) / ky);
        if (sy < b.y0 || sy >= bottom) continue;
        const rw = (bottom - sy) / hh; // 0 у ступней, 1 у макушки
        const grow = 1 + (wide * Math.sin(Math.PI * Math.min(1, rw * 1.1))) / Math.max(1, b.w);
        const sx = Math.floor(cx + (x + 0.5 - cx) / grow);
        if (sx < 0 || sx >= W) continue;
        d[y * W + x] = src[sy * W + sx];
      }
      out.push(d);
    }
    return out;
  };
  A.idleDialog = async function () {
    const L = needLayer(); if (!L) return;
    const m = remember('idle');
    const v = await NPR.dialog({ title: 'Дыхание (Auto-Idle)', okLabel: 'Оживить', fields: [
      { type: 'note', label: 'Из текущего кадра — анимация покоя: тело плавно проседает и чуть расширяется на вдохе, ступни стоят.' },
      { id: 'frames', label: 'Кадров', type: 'select', value: m.frames || 6, options: [[4, '4'], [6, '6'], [8, '8']] },
      { id: 'amp', label: 'Проседание, px', type: 'number', value: m.amp ?? 1, min: 0, max: 6 },
      { id: 'wide', label: 'Расширение (squash), px', type: 'number', value: m.wide ?? 1, min: 0, max: 6 },
      { id: 'out', label: 'Куда', type: 'select', value: m.out || 'self', options: [['self', 'в этот слой (станет спрайтшитом)'], ['layer', 'новым слоем']] },
    ] });
    if (!v) return;
    remember('idle', v);
    const doc = NPR.doc, frames = A.idleFrames(L.data, doc.width, doc.height, { frames: +v.frames, amp: v.amp, wide: v.wide });
    if (!frames) return NPR.toast('На слое пусто');
    NPR.ops.snap('Дыхание', (d) => {
      const T = d.getLayer(L.id);
      if (v.out === 'self') setFrames(T, frames, 0);
      else { const N = d.newLayer(T.name + ' — idle', frames[0]); N.frames = frames; N.frame = 0; d.addLayerRaw(N, d.indexOf(T.id) + 1); T.visible = false; }
    });
    NPR.toast(`Готово: ${frames.length} кадров дыхания. ▶ — проиграть`);
  };

  /* ---------- 7. цветовое циклирование ---------- */
  A.cycleFrames = function (L, o) {
    const src = framesOf(L), n = o.colors.length, idx = new Map();
    o.colors.forEach((c, i) => idx.set(c & 0xffffff, i));
    const N = o.frames, out = [];
    for (let f = 0; f < N; f++) {
      const s = src[f % src.length], d = s.slice(), sh = Math.floor((f * o.step) % n) * o.dir;
      for (let i = 0; i < d.length; i++) {
        const c = d[i];
        if (!(c >>> 24)) continue;
        const k = idx.get(c & 0xffffff);
        if (k === undefined) continue;
        d[i] = ((o.colors[(((k + sh) % n) + n) % n] & 0xffffff) | (c & 0xff000000)) >>> 0;
      }
      out.push(d);
    }
    return out;
  };
  A.cycleDialog = async function () {
    const L = needLayer(); if (!L) return;
    const pal = NPR.palette.current().colors.map(U.parseHex).filter((c) => c !== null);
    const m = remember('cycle');
    const swatches = el('div', { class: 'cyc' });
    const show = (a, b) => swatches.replaceChildren(...pal.map((c, i) => el('span', { class: i >= a && i <= b ? 'on' : '', style: `background:${U.toCss(c)}`, title: '№ ' + (i + 1) })));
    const v = await NPR.dialog({ title: 'Цветовое циклирование', okLabel: 'Запечь в кадры', fields: [
      { type: 'note', label: 'Цвета из диапазона палитры каждый кадр сдвигаются по кругу: руны пульсируют, лава течёт, вода переливается. Рисовать новые кадры не нужно.' },
      { type: 'node', node: swatches },
      { id: 'a', label: 'С цвета палитры №', type: 'number', value: m.a ?? 1, min: 1, max: pal.length },
      { id: 'b', label: 'По цвет №', type: 'number', value: m.b ?? Math.min(4, pal.length), min: 1, max: pal.length },
      { id: 'dir', label: 'Направление', type: 'select', value: m.dir || '1', options: [['1', 'вперёд'], ['-1', 'назад']] },
      { id: 'step', label: 'Шаг за кадр (0.5 — каждые 2 кадра)', type: 'number', value: m.step ?? 1, min: 0.25, max: 8, step: 0.25 },
      { id: 'frames', label: 'Кадров (0 — ровно один круг)', type: 'number', value: m.frames ?? 0, min: 0, max: 64 },
      { id: 'out', label: 'Куда', type: 'select', value: m.out || 'self', options: [['self', 'в этот слой (станет спрайтшитом)'], ['layer', 'новым слоем']] },
    ], check: (x) => { show(x.a - 1, x.b - 1); return x.b - x.a >= 1 ? null : { error: 'В диапазоне должно быть хотя бы 2 цвета' }; } });
    if (!v) return;
    remember('cycle', v);
    const colors = pal.slice(v.a - 1, v.b);
    const one = Math.ceil(colors.length / v.step), frames = A.cycleFrames(L, { colors, dir: +v.dir, step: v.step, frames: v.frames || Math.max(one, L.frames ? L.frames.length : 1) });
    NPR.ops.snap('Цветовое циклирование', (d) => {
      const T = d.getLayer(L.id);
      if (v.out === 'self') setFrames(T, frames, 0);
      else { const N = d.newLayer(T.name + NPR.t(' — цикл цветов'), frames[0]); N.frames = frames; N.frame = 0; d.addLayerRaw(N, d.indexOf(T.id) + 1); T.visible = false; }
    });
    NPR.toast(`Готово: ${frames.length} кадров, цикл из ${colors.length} цветов`);
  };

  /* ---------- 8. эффект удара: вспышка + тряска ---------- */
  A.hitDialog = async function () {
    const L = needLayer(); if (!L) return;
    const m = remember('hit');
    const v = await NPR.dialog({ title: 'Эффект удара', okLabel: 'Добавить кадры', fields: [
      { type: 'note', label: 'После текущего кадра вставляются кадры: вспышка силуэта (hit flash) и тряска со спадом (shake).' },
      { id: 'flash', label: 'Кадров вспышки', type: 'number', value: m.flash ?? 1, min: 0, max: 4 },
      { id: 'color', label: 'Цвет вспышки', type: 'color', value: m.color || '#ffffff' },
      { id: 'shake', label: 'Кадров тряски', type: 'number', value: m.shake ?? 3, min: 0, max: 12 },
      { id: 'amp', label: 'Сила тряски, px', type: 'number', value: m.amp ?? 2, min: 1, max: 8 },
      { id: 'who', label: 'Трясти', type: 'select', value: m.who || 'all', options: [['all', 'весь кадр (все видимые слои)'], ['layer', 'только этот слой']] },
    ] });
    if (!v) return;
    remember('hit', v);
    A.hit(L, { ...v, rgb: rgbOf(v.color) });
  };
  A.hit = function (L, o) {
    const doc = NPR.doc, W = doc.width, H = doc.height, f0 = L.frame || 0;
    const ins = o.flash + o.shake;
    if (!ins) return;
    // случайные, но повторяемые сдвиги; каждый следующий слабее
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const shakes = Array.from({ length: o.shake }, (_, k) => {
      const a = o.amp * (1 - k / Math.max(1, o.shake)) + 0.5, ang = rnd() * Math.PI * 2;
      let dx = Math.round(Math.cos(ang) * a), dy = Math.round(Math.sin(ang) * a);
      if (!dx && !dy) dx = k % 2 ? -1 : 1;
      return [dx, dy];
    });
    const shift = (s, dx, dy) => { const d = new Uint32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const X = x - dx, Y = y - dy; if (X >= 0 && Y >= 0 && X < W && Y < H) d[y * W + x] = s[Y * W + X]; } return d; };
    const flashOf = (s) => { const d = new Uint32Array(W * H); for (let i = 0; i < d.length; i++) if (s[i] >>> 24) d[i] = (o.rgb | (s[i] & 0xff000000)) >>> 0; return d; };
    NPR.ops.snap('Эффект удара', (d) => {
      const T = d.getLayer(L.id), n = framesOf(T).length;
      for (const X of d.layers) {
        const mine = X.id === T.id, shakeIt = mine || (o.who === 'all' && X.visible);
        if (!mine && !shakeIt && !(X.frames && X.frames.length === n)) continue; // чужие анимации той же длины — держим в такт
        const list = framesOf(X).slice(), k = X.frames ? f0 % X.frames.length : 0, base = list[k];
        const add = [];
        for (let i = 0; i < o.flash; i++) add.push(mine ? flashOf(base) : base.slice());
        for (const [dx, dy] of shakes) add.push(shakeIt ? shift(base, dx, dy) : base.slice());
        list.splice(k + 1, 0, ...add);
        setFrames(X, list, k + 1);
      }
    });
    NPR.toast(`Вставлено кадров: ${ins} (после кадра ${f0 + 1})`);
  };

  /* ---------- 9. операции с кадрами ---------- */
  A.frameOp = function (kind) {
    const L = needLayer(); if (!L) return;
    if (!L.frames && kind !== 'empty') return NPR.toast('Сначала сделайте слой спрайтшитом');
    const doc = NPR.doc, W = doc.width, H = doc.height;
    const labels = { empty: 'Пустой кадр', reverse: 'Обратный порядок кадров', ping: 'Туда-обратно' };
    NPR.ops.snap(labels[kind], (d) => {
      const T = d.getLayer(L.id), list = framesOf(T).slice(), k = T.frame || 0;
      if (kind === 'empty') { list.splice(k + 1, 0, new Uint32Array(W * H)); setFrames(T, list, k + 1); }
      else if (kind === 'reverse') setFrames(T, list.reverse(), list.length - 1 - k);
      else if (kind === 'ping') setFrames(T, list.concat(list.slice(1, -1).reverse().map((f) => f.slice())), k);
    });
  };
  A.holdDialog = async function () {
    const L = needLayer(); if (!L || !L.frames) return NPR.toast('Сначала сделайте слой спрайтшитом');
    const v = await NPR.dialog({ title: 'Повторить кадр', okLabel: 'Повторить', fields: [{ id: 'n', label: 'Сколько копий текущего кадра добавить', type: 'number', value: 1, min: 1, max: 32 }] });
    if (!v) return;
    NPR.ops.snap('Повтор кадра', (d) => { const T = d.getLayer(L.id), list = T.frames.slice(), k = T.frame; list.splice(k + 1, 0, ...Array.from({ length: v.n }, () => list[k].slice())); setFrames(T, list, k); });
  };

  /* ---------- 10. инструмент «Дуга удара» ----------
     Тянете от начала взмаха к концу — получается дуга; ручка посередине выгибает её.
     Ширина больше у «головы» (где сейчас оружие), хвост истончается и гаснет.
     «Запечь» кладёт 2–4 кадра затухающего шлейфа в слой «Дуга удара» с текущего кадра. */
  const SM = (A.smear = { arc: null, opts: null });
  const SM_DEF = { width: 6, frames: 3, colors: 'grad', dither: true, outline: false, len: 100 };
  function bez(a, c, b, t) { const u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; }
  /* Кадр шлейфа k из n → пиксели W×H. */
  A.smearFrame = function (arc, o, k, n, W, H) {
    const out = new Uint32Array(W * H), cov = new Float32Array(W * H), tcol = new Float32Array(W * H).fill(-1);
    const lut = o.colors === 'grad' ? NPR.gradient.lutFor(NPR.gradient.current.stops.map((st) => [st.p, U.toHex(st.c, true)])) : null;
    const p = k / Math.max(1, n); // 0 — свежий взмах, ближе к 1 — остатки
    const tail = Math.min(0.95, p * 0.85), fade = 1 - p * 0.75, wk = 1 - p * 0.55;
    const len = Math.hypot(arc.b[0] - arc.a[0], arc.b[1] - arc.a[1]) + Math.hypot(arc.c[0] - arc.a[0], arc.c[1] - arc.a[1]);
    const steps = Math.max(40, Math.ceil(len * 4));
    // с какой стороны выпуклость: внутренний край идёт к центру изгиба
    const mid = bez(arc.a, arc.c, arc.b, 0.5), chord = [(arc.a[0] + arc.b[0]) / 2, (arc.a[1] + arc.b[1]) / 2];
    const start = 1 - (o.len / 100);
    for (let s = 0; s <= steps; s++) {
      const t = start + (1 - start) * (s / steps);
      if (t < start + (1 - start) * tail) continue;
      const P = bez(arc.a, arc.c, arc.b, t), P2 = bez(arc.a, arc.c, arc.b, Math.min(1, t + 0.001)), P1 = bez(arc.a, arc.c, arc.b, Math.max(0, t - 0.001));
      let nx = -(P2[1] - P1[1]), ny = P2[0] - P1[0];
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      if ((chord[0] - mid[0]) * nx + (chord[1] - mid[1]) * ny < 0) { nx = -nx; ny = -ny; }
      const u = (t - start) / Math.max(0.001, 1 - start); // 0 — хвост, 1 — голова
      const w = Math.max(0.6, o.width * wk * Math.pow(Math.sin(Math.PI * Math.min(0.999, 0.5 + u * 0.5)) * 0.35 + u * 0.65, 1.2));
      for (let r = 0; r <= w; r += 0.35) {
        const X = Math.floor(P[0] + nx * r), Y = Math.floor(P[1] + ny * r);
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const i = Y * W + X, a = fade * Math.min(1, 0.35 + u) * (1 - (r / (w + 0.5)) * 0.35);
        if (a > cov[i]) { cov[i] = a; tcol[i] = 1 - u; }
      }
    }
    const prim = S.primary, rgbP = prim & 0xffffff;
    for (let i = 0; i < out.length; i++) {
      if (tcol[i] < 0) continue;
      let c, a = cov[i];
      if (lut) { c = lut[Math.min(1023, (tcol[i] * 1023) | 0)]; a *= (c >>> 24) / 255; c &= 0xffffff; }
      else { c = rgbP; a *= 1 - tcol[i] * 0.85; }
      putA(out, W, i % W, (i / W) | 0, c, a, o.dither);
    }
    if (o.outline) {
      const px = NPR.ops.outlinePixels(out, W, H, { width: 1, diag: false }), col = (S.secondary | 0xff000000) >>> 0;
      for (const i of px) if (fade > 0.5) out[i] = col;
    }
    return out;
  };
  SM.preview = function () {
    if (!SM.arc) return null;
    const doc = NPR.doc;
    return A.smearFrame(SM.arc, SM.opts, 0, SM.opts.frames, doc.width, doc.height);
  };
  let smCanvas = null, smDirty = true;
  SM.drawOverlay = function (ctx) {
    if (S.tool !== 'smear' || !SM.arc) return;
    const doc = NPR.doc, z = V.zoom;
    if (smDirty || !smCanvas) {
      const d = SM.preview();
      smCanvas = smCanvas || document.createElement('canvas');
      smCanvas.width = doc.width; smCanvas.height = doc.height;
      smCanvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d.buffer), doc.width, doc.height), 0, 0);
      smDirty = false;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(smCanvas, V.ox, V.oy, doc.width * z, doc.height * z);
    const P = (p) => [V.ox + (p[0] + 0.5) * z, V.oy + (p[1] + 0.5) * z], { a, b, c } = SM.arc;
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(...P(a)); ctx.lineTo(...P(c)); ctx.lineTo(...P(b)); ctx.stroke(); ctx.setLineDash([]);
    for (const [p, col] of [[a, '#9be7ff'], [b, '#f2b63d'], [c, '#fff']]) { const [x, y] = P(p); ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke(); }
  };
  let smDrag = null;
  NPR.tools.smear = {
    down(p) {
      const z = V.zoom, hit = (q) => q && Math.hypot(V.ox + (q[0] + 0.5) * z - p.sx, V.oy + (q[1] + 0.5) * z - p.sy) < 9;
      if (SM.arc) for (const k of ['a', 'b', 'c']) if (hit(SM.arc[k])) { smDrag = k; return; }
      SM.arc = { a: [p.x, p.y], b: [p.x, p.y], c: [p.x, p.y], fresh: true };
      smDrag = 'new';
      syncSmear();
    },
    move(p) {
      if (!smDrag) return;
      const A2 = SM.arc;
      if (smDrag === 'new') { // конец тянется, середина выгибается сама
        A2.b = [p.x, p.y];
        const dx = A2.b[0] - A2.a[0], dy = A2.b[1] - A2.a[1];
        A2.c = [(A2.a[0] + A2.b[0]) / 2 - dy * 0.45, (A2.a[1] + A2.b[1]) / 2 + dx * 0.45];
      } else A2[smDrag] = [p.x, p.y];
      smDirty = true; V.redrawOver();
    },
    up() { smDrag = null; syncSmear(); },
    cancel() { smDrag = null; },
  };
  SM.commit = function () {
    if (!SM.arc) return false;
    const doc = NPR.doc, W = doc.width, H = doc.height, o = SM.opts, ref = doc.layers.find((l) => l.id === doc.activeId);
    const n = o.frames, f0 = ref && ref.frames ? ref.frame : 0, total = Math.max(ref && ref.frames ? ref.frames.length : 0, f0 + n);
    const arc = { ...SM.arc };
    SM.arc = null; // до snap: он сам закрепляет открытые сессии
    NPR.ops.snap('Дуга удара', (d) => {
      const SN = NPR.t('Дуга удара'), old = d.layers.find((l) => l.name === SN && l.frames);
      let L = old;
      if (!L) { L = d.newLayer(SN, new Uint32Array(W * H)); L.frames = [L.data]; L.frame = 0; d.addLayerRaw(L, d.indexOf(d.activeId) + 1); }
      const list = L.frames.slice();
      while (list.length < total) list.push(new Uint32Array(W * H));
      for (let k = 0; k < n; k++) {
        const fr = A.smearFrame(arc, o, k, n, W, H), dst = list[f0 + k].slice();
        for (let i = 0; i < dst.length; i++) if (fr[i] >>> 24) dst[i] = fr[i];
        list[f0 + k] = dst;
      }
      setFrames(L, list, f0);
    });
    SM.arc = null; smDirty = true;
    syncSmear();
    NPR.toast(`Дуга удара: ${n} кадр. с кадра ${f0 + 1} в слое «Дуга удара»`);
    return true;
  };
  SM.cancel = function () { if (!SM.arc) return false; SM.arc = null; syncSmear(); V.redrawOver(); return true; };
  Object.defineProperty(SM, 'session', { get: () => SM.arc });
  function syncSmear() {
    const b = $('smBake'); if (b) b.disabled = !SM.arc;
    try { localStorage.setItem('npr.smear', JSON.stringify(SM.opts)); } catch (e) { /* не страшно */ }
    smDirty = true;
    V.redrawOver();
  }
  function smearPanel() {
    const o = SM.opts, box = $('smOpts');
    const num = (k, lo, hi, lab, title) => { const i = el('input', { type: 'number', min: lo, max: hi, value: o[k], inputmode: 'numeric' }); i.addEventListener('input', () => { if (i.value === '') return; o[k] = U.clamp(+i.value, lo, hi); syncSmear(); }); return el('label', { title: title || '' }, lab, i); };
    const chk = (k, lab, title) => { const c = el('input', { type: 'checkbox' }); c.checked = !!o[k]; c.addEventListener('change', () => { o[k] = c.checked; syncSmear(); }); return el('label', { class: 'chk', title: title || '' }, c, ' ' + lab); };
    const sel = el('select', null, el('option', { value: 'grad', selected: o.colors === 'grad' }, 'текущий градиент'), el('option', { value: 'prim', selected: o.colors === 'prim' }, 'основной цвет → прозрачный'));
    sel.addEventListener('change', () => { o.colors = sel.value; syncSmear(); });
    box.replaceChildren(
      el('div', { class: 'row' }, num('width', 1, 64, 'ширина', 'Толщина у головы дуги, px'), num('frames', 1, 6, 'кадров', 'Сколько кадров затухания')),
      el('div', { class: 'row' }, num('len', 10, 100, 'длина %', 'Какая часть дуги видна в первом кадре')),
      el('div', { class: 'row' }, el('label', { title: 'Слева в градиенте — голова (у оружия), справа — хвост' }, 'цвет', sel)),
      el('div', { class: 'row' }, chk('dither', 'прозрачность узором'), chk('outline', 'контур', 'Обвести вторичным цветом')),
    );
  }

  /* ---------- синхронные кадры, меню ---------- */
  A.menu = () => {
    const L = NPR.doc.active, sp = !!(L && L.frames), F = NPR.frames;
    return [
      { label: 'Тень на полу…', action: A.shadowDialog },
      { label: 'Контур на всех кадрах…', action: A.outlineDialog },
      { label: 'Шлейф (afterimage)…', disabled: !sp, action: A.trailDialog },
      { label: 'Очистка пикселей…', action: A.cleanupDialog },
      { label: 'Твининг: движение от кадра к кадру…', action: A.tweenDialog },
      { label: 'Дыхание (Auto-Idle)…', action: A.idleDialog },
      { label: 'Цветовое циклирование…', action: A.cycleDialog },
      { label: 'Эффект удара (вспышка + тряска)…', action: A.hitDialog },
      { label: 'Дуга удара (инструмент)', action: () => NPR.setTool('smear') },
      { label: 'Ткань: плащ, флаг, волосы, юбка', action: () => NPR.setTool('cloth') },
      '-',
      { label: 'Сделать слой спрайтшитом', disabled: sp, action: F.convert },
      { label: 'Пустой кадр после текущего', disabled: !sp, action: () => A.frameOp('empty') },
      { label: 'Повторить кадр…', disabled: !sp, action: A.holdDialog },
      { label: 'Обратный порядок кадров', disabled: !sp, action: () => A.frameOp('reverse') },
      { label: 'Туда-обратно (пинг-понг)', disabled: !sp, action: () => A.frameOp('ping') },
      '-',
      { label: 'Кадры всех слоёв синхронно', checked: F.sync, action: () => { F.sync = !F.sync; F.go(F.current(), true, true); NPR.toast(F.sync ? 'Слои-спрайтшиты листаются вместе' : 'Листается только выбранный слой'); } },
      { label: 'Показывать следующий кадр', checked: F.onionNext, action: () => { F.onionNext = !F.onionNext; V.redraw(); } },
      { label: 'Экспорт GIF…', action: () => F.gifDialog() },
    ];
  };

  A.init = function () {
    try { SM.opts = { ...SM_DEF, ...(JSON.parse(localStorage.getItem('npr.smear')) || {}) }; } catch (e) { SM.opts = { ...SM_DEF }; }
    smearPanel();
    $('smBake').addEventListener('click', SM.commit);
    $('smClear').addEventListener('click', SM.cancel);
    NPR.on('color', () => { smDirty = true; if (S.tool === 'smear') V.redrawOver(); });
    syncSmear();
  };
  A.show = function (on) { $('smPanel').hidden = !on; if (on) smearPanel(); V.redrawOver(); };
})(window.NPR);
