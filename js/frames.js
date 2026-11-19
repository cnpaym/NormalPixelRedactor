'use strict';
/* Спрайтшиты. Слой-спрайтшит хранит несколько кадров одного размера с холстом;
   на холсте виден текущий кадр, предыдущий просвечивает (onion skin).
   Новый кадр — копия текущего. Размер листа считается при экспорте:
   4 кадра 64×64 дают 64×256, несколько слоёв-спрайтшитов — один атлас. */
(function (NPR) {
  const U = NPR.util, V = NPR.view, { el } = U;
  const $ = (id) => document.getElementById(id);
  const F = (NPR.frames = { onion: true, onionNext: false, diff: false, timer: 0, fps: 8, sync: true });
  const sprite = () => { const L = NPR.doc && NPR.doc.active; return L && L.frames ? L : null; };

  /* ---------- операции ---------- */
  F.convert = function () {
    if (sprite()) return NPR.toast('Этот слой уже спрайтшит');
    NPR.ops.snap('Слой-спрайтшит', (doc) => { const L = doc.active; L.frames = [L.data]; L.frame = 0; });
    NPR.toast('Слой стал спрайтшитом. Кадры — в полосе под холстом');
  };
  F.add = function () {
    if (!sprite()) return;
    NPR.ops.snap('Новый кадр', (doc) => {
      const L = doc.active;
      L.frames.splice(L.frame + 1, 0, L.data.slice()); // копия текущего
      const D = (L.depths = L.depths ? L.depths.slice() : []);
      while (D.length < L.frames.length - 1) D.push(null);
      D.splice(L.frame + 1, 0, D[L.frame] ? D[L.frame].slice() : null); // и его карты глубины
      L.frame++; L.data = L.frames[L.frame];
    });
  };
  F.remove = function () {
    const L = sprite();
    if (!L) return;
    if (L.frames.length < 2) return NPR.toast('В спрайтшите должен остаться хотя бы один кадр');
    NPR.ops.snap('Удаление кадра', (doc) => {
      const S = doc.active;
      S.frames.splice(S.frame, 1);
      if (S.depths) { S.depths = S.depths.slice(); S.depths.splice(S.frame, 1); }
      S.frame = Math.min(S.frame, S.frames.length - 1); S.data = S.frames[S.frame];
    });
  };
  F.shift = function (dir) { // поменять кадр местами с соседним
    const L = sprite();
    if (!L) return;
    const j = L.frame + dir;
    if (j < 0 || j >= L.frames.length) return;
    NPR.ops.snap('Порядок кадров', (doc) => {
      const S = doc.active, f = S.frames;
      [f[S.frame], f[j]] = [f[j], f[S.frame]];
      if (S.depths) { const D = (S.depths = S.depths.slice()); while (D.length < f.length) D.push(null); [D[S.frame], D[j]] = [D[j], D[S.frame]]; }
      S.frame = j; S.data = f[j];
    });
  };
  /* Перейти на кадр i. В синхронном режиме все слои-спрайтшиты встают на тот же
     кадр (короткие — по кругу): персонаж, тень, шлейф и частицы листаются вместе. */
  F.current = () => { const L = sprite(); return L ? L.frame : 0; };
  F.go = function (i, quiet, force) {
    const L = sprite();
    if (!L) return;
    if (!quiet) NPR.edit.commitFloat();
    i = ((i % L.frames.length) + L.frames.length) % L.frames.length;
    if (i === L.frame && !force) return;
    L.frame = i; L.data = L.frames[i];
    if (F.sync) for (const X of NPR.doc.layers) if (X !== L && X.frames) { X.frame = i % X.frames.length; X.data = X.frames[X.frame]; }
    NPR.doc.markAllDirty();
    render();
  };
  F.step = (d) => { const L = sprite(); if (L) F.go(L.frame + d); };
  F.stop = function () { if (F.timer) { clearInterval(F.timer); F.timer = 0; render(); V.redraw(); } };
  F.play = function () {
    if (F.timer) return F.stop();
    if (!sprite() || sprite().frames.length < 2) return;
    NPR.edit.commitFloat();
    F.timer = setInterval(() => { const L = sprite(); if (L) F.go(L.frame + 1, true); else F.stop(); }, 1000 / F.fps);
    render(); V.redraw();
  };

  /* ---------- onion skin ---------- */
  let onionCanvas = null, onionBuf = null, onionDirty = true;
  let nextCanvas = null, nextBuf = null;
  F.drawOnion = function (ctx) {
    const L = sprite(), doc = NPR.doc;
    if (F.onionNext && !F.timer && L && L.visible && L.frame < L.frames.length - 1) { // следующий кадр — зеленоватым
      const nb = L.frames[L.frame + 1];
      if (!nextCanvas) nextCanvas = document.createElement('canvas');
      if (nextBuf !== nb || onionDirty || nextCanvas.width !== doc.width || nextCanvas.height !== doc.height) {
        nextCanvas.width = doc.width; nextCanvas.height = doc.height;
        const id = new ImageData(doc.width, doc.height), o = new Uint32Array(id.data.buffer);
        for (let i = 0; i < o.length; i++) if (nb[i] >>> 24) o[i] = U.rgba(((nb[i] & 255) >> 1) + 30, (((nb[i] >>> 8) & 255) >> 1) + 110, (((nb[i] >>> 16) & 255) >> 1) + 60);
        nextCanvas.getContext('2d').putImageData(id, 0, 0);
        nextBuf = nb;
      }
      ctx.globalAlpha = 0.3;
      ctx.drawImage(nextCanvas, V.ox, V.oy, doc.width * V.zoom, doc.height * V.zoom);
      ctx.globalAlpha = 1;
    }
    if (!F.onion || F.timer || !L || L.frame === 0 || !L.visible) return;
    const buf = L.frames[L.frame - 1];
    if (!onionCanvas) onionCanvas = document.createElement('canvas');
    if (onionBuf !== buf || onionDirty || onionCanvas.width !== doc.width || onionCanvas.height !== doc.height) {
      onionCanvas.width = doc.width; onionCanvas.height = doc.height;
      const id = new ImageData(new Uint8ClampedArray(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)), doc.width, doc.height);
      onionCanvas.getContext('2d').putImageData(id, 0, 0);
      onionBuf = buf; onionDirty = false;
    }
    ctx.globalAlpha = 0.3;
    ctx.drawImage(onionCanvas, V.ox, V.oy, doc.width * V.zoom, doc.height * V.zoom);
    ctx.globalAlpha = 1;
  };

  /* Подсветка пикселей, которые отличаются от предыдущего кадра. */
  let diffCanvas = null;
  F.drawDiff = function (ctx) {
    const L = sprite(), doc = NPR.doc;
    if (!F.diff || F.timer || !L || L.frame === 0 || !L.visible) return;
    const a = L.data, b = L.frames[L.frame - 1], W = doc.width, H = doc.height;
    if (!diffCanvas) diffCanvas = document.createElement('canvas');
    diffCanvas.width = W; diffCanvas.height = H;
    const id = new ImageData(W, H), o = new Uint32Array(id.data.buffer), mark = U.rgba(255, 0, 200, 120);
    let n = 0;
    for (let i = 0; i < o.length; i++) if (a[i] !== b[i]) { o[i] = mark; n++; }
    F.diffCount = n;
    diffCanvas.getContext('2d').putImageData(id, 0, 0);
    ctx.drawImage(diffCanvas, V.ox, V.oy, W * V.zoom, H * V.zoom);
  };

  /* Таблица для Roblox: где на листе лежит каждый кадр. */
  F.luau = function (layers, W, H, down, gap, k, size, fileName) {
    const v2 = (x, y) => `Vector2.new(${x * k}, ${y * k})`, out = [];
    out.push(`-- ${fileName}: ${size.w * k}x${size.h * k}, кадр ${W * k}x${H * k}`);
    out.push('-- image.ImageRectOffset = frame.ImageRectOffset; image.ImageRectSize = frame.ImageRectSize');
    out.push('return {', `\tImageSize = ${v2(size.w, size.h)},`, `\tFrameSize = ${v2(W, H)},`);
    if (NPR.doc.slice && layers.length === 1 && layers[0].frames.length === 1) out.push(`\tSliceCenter = ${NPR.roblox.sliceCenter()},`);
    out.push('\tSheets = {');
    layers.forEach((L, si) => {
      out.push(`\t\t[${JSON.stringify(L.name)}] = {`);
      L.frames.forEach((_, fi) => {
        const x = (down ? si : fi) * (W + gap), y = (down ? fi : si) * (H + gap);
        out.push(`\t\t\t{ ImageRectOffset = ${v2(x, y)}, ImageRectSize = ${v2(W, H)} },`);
      });
      out.push('\t\t},');
    });
    out.push('\t},', '}', '');
    return out.join('\n');
  };

  /* ---------- полоса кадров ---------- */
  const TS = 40;
  function thumb(buf, doc) {
    const c = el('canvas', { width: TS, height: TS }), ctx = c.getContext('2d'), id = ctx.createImageData(TS, TS), out = new Uint32Array(id.data.buffer);
    const k = Math.max(doc.width, doc.height) / TS, ox = (TS * k - doc.width) / 2, oy = (TS * k - doc.height) / 2;
    for (let y = 0; y < TS; y++) {
      const sy = Math.floor((y + 0.5) * k - oy);
      if (sy < 0 || sy >= doc.height) continue;
      for (let x = 0; x < TS; x++) { const sx = Math.floor((x + 0.5) * k - ox); if (sx >= 0 && sx < doc.width) out[y * TS + x] = buf[sy * doc.width + sx]; }
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }
  function render() {
    const L = sprite(), bar = $('frameBar');
    const was = bar.hidden;
    bar.hidden = !L;
    if (was !== bar.hidden) V.resize();
    if (!L) { F.stop(); return; }
    onionDirty = true;
    $('frameList').replaceChildren(...L.frames.map((buf, i) => {
      const b = el('button', { type: 'button', class: 'frame', 'aria-pressed': String(i === L.frame), title: 'Кадр ' + (i + 1), 'aria-label': 'Кадр ' + (i + 1) }, thumb(buf, NPR.doc), el('span', null, String(i + 1)));
      b.addEventListener('click', () => { F.stop(); F.go(i); });
      return b;
    }));
    const cur = $('frameList').children[L.frame];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('frameInfo').textContent = `Кадр ${L.frame + 1} из ${L.frames.length}`;
    $('framePlay').textContent = F.timer ? '■ Стоп' : '▶ Проиграть';
    $('frameOnion').checked = F.onion;
    $('frameDiff').checked = F.diff;
    $('frameNext').checked = F.onionNext; $('frameSync').checked = F.sync;
    V.redraw();
  }
  F.render = render;

  /* ---------- экспорт листа или атласа ---------- */
  F.exportDialog = async function () {
    NPR.edit.commitFloat();
    const doc = NPR.doc, all = doc.layers.filter((l) => l.frames);
    if (!all.length) return NPR.toast('В проекте нет слоёв-спрайтшитов. Сделайте слой спрайтшитом кнопкой в панели слоёв');
    const act = sprite();
    const v = await NPR.dialog({
      title: 'Экспорт спрайтшита', okLabel: 'Экспортировать',
      fields: [
        { id: 'what', label: 'Что сохранить', type: 'select', value: act ? 'active' : 'all', options: [...(act ? [['active', `Слой «${act.name}» (${act.frames.length} кадр.)`]] : []), ['all', `Атлас: все спрайтшиты (${all.length})`]] },
        { id: 'dir', label: 'Кадры идут', type: 'select', value: 'down', options: [['down', 'сверху вниз'], ['right', 'слева направо']] },
        { id: 'gap', label: 'Отступ между кадрами, px', type: 'number', value: 0, min: 0, max: 64 },
        { id: 'scale', label: 'Масштаб', type: 'select', value: 1, options: [1, 2, 3, 4, 8].map((n) => [n, '×' + n]) },
        { id: 'lua', label: 'Сохранить и Luau-таблицу для Roblox (.lua)', type: 'checkbox', value: false },
        { type: 'note', label: 'В атласе каждый спрайтшит занимает свой ряд (или столбец), порядок — как у слоёв сверху вниз.' },
      ],
      check: (x) => (Number.isInteger(x.gap) && x.gap >= 0 ? null : { error: 'Отступ — целое число от 0' }),
    });
    if (!v) return;
    const layers = v.what === 'active' && act ? [act] : all.slice().reverse(), sheets = layers.map((l) => l.frames);
    const img = F.compose(sheets, doc.width, doc.height, v.dir === 'down', v.gap);
    const k = +v.scale, src = k > 1 ? U.scaleNearest(img.data, img.w, img.h, img.w * k, img.h * k) : img.data;
    if (Math.max(img.w, img.h) * k > 16384) return NPR.toast('Лист получается больше 16384 px. Уменьшите масштаб', true);
    const base = NPR.io.safeName(doc.name) + (v.what === 'all' ? '_atlas' : '_sheet');
    U.download(await U.makePNG(img.w * k, img.h * k, src), base + '.png');
    if (v.lua) setTimeout(() => U.download(new Blob([F.luau(layers, doc.width, doc.height, v.dir === 'down', v.gap, k, img, base + '.png')], { type: 'text/plain' }), base + '.lua'), 400);
    NPR.toast(`Сохранён лист ${img.w * k}×${img.h * k}`);
  };
  /* ---------- экспорт GIF ----------
     Кадр f собирается из всех видимых слоёв: у спрайтшита берётся его кадр f
     (короткие спрайтшиты идут по кругу), обычный слой одинаков на всех кадрах. */
  F.compositeFrame = function (doc, f, only) {
    const W = doc.width, out = new Uint32Array(W * doc.height);
    for (const L of doc.layers) {
      if (only ? L !== only : !L.visible || L.opacity <= 0) continue;
      const src = L.frames ? L.frames[f % L.frames.length] : L.data, op = only ? 255 : Math.round(L.opacity * 255);
      for (let i = 0; i < out.length; i++) {
        let s = src[i];
        if (!(s >>> 24)) continue;
        if (op < 255) { const a = ((s >>> 24) * op + 127) / 255 | 0; if (!a) continue; s = ((s & 0xffffff) | (a << 24)) >>> 0; }
        const o = out[i];
        out[i] = !(o >>> 24) || s >>> 24 === 255 ? s : U.blend(o, s);
      }
    }
    return out;
  };
  F.gifDialog = async function () {
    NPR.edit.commitFloat();
    const doc = NPR.doc, sprites = doc.layers.filter((l) => l.frames && l.visible), act = sprite();
    const n = sprites.length ? Math.max(...sprites.map((l) => l.frames.length)) : 1;
    const opts = [];
    if (sprites.length) opts.push(['all', `Анимация: все видимые слои (${n} кадр.)`]);
    if (act) opts.push(['active', `Только слой «${act.name}» (${act.frames.length} кадр.)`]);
    opts.push(['still', 'Одна картинка (как сейчас на холсте)']);
    const mem = (() => { try { return JSON.parse(localStorage.getItem('npr.gif')) || {}; } catch (e) { return {}; } })();
    const v = await NPR.dialog({
      title: 'Экспорт GIF', okLabel: 'Сохранить GIF',
      fields: [
        { id: 'what', label: 'Что сохранить', type: 'select', value: opts[0][0], options: opts },
        { id: 'fps', label: 'Кадров в секунду', type: 'number', value: F.fps, min: 1, max: 50 },
        { id: 'scale', label: 'Масштаб', type: 'select', value: mem.scale || 4, options: [1, 2, 3, 4, 6, 8, 10].map((k) => [k, '×' + k]) },
        { id: 'bg', label: 'Фон', type: 'select', value: mem.bg || 'none', options: [['none', 'прозрачный'], ['secondary', 'дополнительный цвет'], ['#151515', 'тёмный #151515'], ['#ffffff', 'белый']] },
        { id: 'loop', label: 'Повторять по кругу', type: 'checkbox', value: mem.loop !== false },
        { type: 'note', label: 'В GIF нет полупрозрачности: на прозрачном фоне мягкие края станут резкими. Для свечения и дыма лучше выбрать фон.' },
      ],
      check: (x) => (x.fps >= 1 && x.fps <= 50 ? null : { error: 'Кадров в секунду — от 1 до 50' }),
    });
    if (!v) return;
    try { localStorage.setItem('npr.gif', JSON.stringify({ scale: +v.scale, bg: v.bg, loop: v.loop })); } catch (e) { /* не страшно */ }
    doc.flush();
    const W = doc.width, H = doc.height, k = +v.scale;
    if (Math.max(W, H) * k > 4096) return NPR.toast('GIF получается больше 4096 px. Уменьшите масштаб', true);
    let frames;
    if (v.what === 'still') frames = [doc.comp32.slice()];
    else if (v.what === 'active') frames = act.frames.map((_, f) => F.compositeFrame(doc, f, act));
    else frames = Array.from({ length: n }, (_, f) => F.compositeFrame(doc, f));
    const bg = v.bg === 'none' ? null : v.bg === 'secondary' ? NPR.state.secondary & 0xffffff : U.parseHex(v.bg) & 0xffffff;
    NPR.toast('Собираю GIF…');
    await new Promise((r) => setTimeout(r, 30));
    const prep = NPR.gif.prepare(frames, W, H, { bg, scale: k });
    const bytes = NPR.gif.encode(prep, W * k, H * k, { delay: 100 / v.fps, loop: v.loop });
    const name = NPR.io.safeName(doc.name) + (v.what === 'active' ? '_' + NPR.io.safeName(act.name) : '') + '.gif';
    U.download(new Blob([bytes], { type: 'image/gif' }), name);
    NPR.toast(`Сохранён GIF ${W * k}×${H * k}, кадров: ${frames.length}`);
    return bytes;
  };
  /* sheets: массив спрайтшитов, каждый — массив кадров W×H. */
  F.compose = function (sheets, W, H, down, gap) {
    const maxN = Math.max(...sheets.map((s) => s.length));
    const along = (n, size) => n * size + (n - 1) * gap; // длина n ячеек с отступами
    const w = down ? along(sheets.length, W) : along(maxN, W), h = down ? along(maxN, H) : along(sheets.length, H);
    const data = new Uint32Array(w * h);
    sheets.forEach((frames, si) => frames.forEach((buf, fi) => {
      const cx = (down ? si : fi) * (W + gap), cy = (down ? fi : si) * (H + gap);
      for (let y = 0; y < H; y++) data.set(buf.subarray(y * W, (y + 1) * W), (cy + y) * w + cx);
    }));
    return { w, h, data };
  };

  F.init = function () {
    const bind = (id, fn) => $(id).addEventListener('click', fn);
    bind('frameAdd', () => { F.stop(); F.add(); });
    bind('frameDel', () => { F.stop(); F.remove(); });
    bind('frameLeft', () => { F.stop(); F.shift(-1); });
    bind('frameRight', () => { F.stop(); F.shift(1); });
    bind('framePlay', F.play);
    bind('frameExport', F.exportDialog);
    bind('frameGif', F.gifDialog);
    $('frameOnion').addEventListener('change', (e) => { F.onion = e.target.checked; V.redraw(); });
    $('frameDiff').addEventListener('change', (e) => { F.diff = e.target.checked; V.redraw(); });
    $('frameNext').addEventListener('change', (e) => { F.onionNext = e.target.checked; V.redraw(); });
    $('frameSync').addEventListener('change', (e) => { F.sync = e.target.checked; F.go(F.current(), true, true); });
    bind('frameMenu', (e) => NPR.popup(e.currentTarget, NPR.anim.menu()));
    $('frameFps').addEventListener('input', (e) => { F.fps = U.clamp(Math.round(+e.target.value) || 8, 1, 60); if (F.timer) { F.stop(); F.play(); } });
    NPR.on('layers', render);
    NPR.on('history', render);
  };
})(window.NPR);
