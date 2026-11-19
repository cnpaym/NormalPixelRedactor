'use strict';
/* Структурные операции: слои и размер холста.
   Каждая оборачивается в снимок «до/после», поэтому отменяется одним шагом. */
(function (NPR) {
  const U = NPR.util;
  const O = (NPR.ops = {});
  O.MAX = 4096;
  O.WARN = 1024;

  O.snap = (label, fn) => snap(label, fn);
  function snap(label, fn) {
    NPR.edit.commitFloat();
    const doc = NPR.doc, before = doc.snapshot();
    if (fn(doc) === false) return;
    const resized = before.width !== doc.width || before.height !== doc.height;
    NPR.history.push(new NPR.SnapCmd(label, before, doc.snapshot()));
    doc.markAllDirty();
    NPR.emit('layers');
    if (resized) NPR.emit('resized');
    NPR.emit('docChanged');
  }

  O.addLayer = () => snap('Новый слой', (doc) => {
    doc.addLayerRaw(doc.newLayer(), doc.indexOf(doc.activeId) + 1);
  });
  /* Картинка → новый слой над активным, по центру холста.
     how — если картинка больше холста: 'fit' уменьшить целиком, 'center' обрезать края, 'grow' увеличить холст. */
  O.addLayerFromImage = (img, name, how) => snap('Импорт слоя', (doc) => {
    if (how === 'fit' && (img.w > doc.width || img.h > doc.height)) img = O.shrinkImage(img, doc.width, doc.height);
    if (how === 'grow' && (img.w > doc.width || img.h > doc.height)) {
      const nw = Math.min(O.MAX, Math.max(doc.width, img.w)), nh = Math.min(O.MAX, Math.max(doc.height, img.h));
      O.cropTo(doc, -Math.round((nw - doc.width) / 2), -Math.round((nh - doc.height) / 2), nw, nh);
    }
    const W = doc.width, H = doc.height, data = new Uint32Array(W * H);
    const ox = Math.floor((W - img.w) / 2), oy = Math.floor((H - img.h) / 2); // может быть < 0 — тогда края обрезаются
    for (let y = Math.max(0, oy); y < Math.min(H, oy + img.h); y++) {
      const x0 = Math.max(0, ox), x1 = Math.min(W, ox + img.w), sy = y - oy;
      data.set(img.data.subarray(sy * img.w + (x0 - ox), sy * img.w + (x1 - ox)), y * W + x0);
    }
    const L = doc.newLayer(name, data);
    doc.addLayerRaw(L, doc.indexOf(doc.activeId) + 1);
    doc.activeId = L.id;
  });
  /* Уменьшение с усреднением (с учётом прозрачности), чтобы скриншот или фото не рассыпались. */
  O.shrinkImage = function (img, maxW, maxH) {
    const k = Math.min(maxW / img.w, maxH / img.h, 1), w = Math.max(1, Math.round(img.w * k)), h = Math.max(1, Math.round(img.h * k));
    const out = new Uint32Array(w * h), src = img.data;
    for (let y = 0; y < h; y++) {
      const y0 = Math.floor((y * img.h) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.h) / h));
      for (let x = 0; x < w; x++) {
        const x0 = Math.floor((x * img.w) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.w) / w));
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
          const c = src[yy * img.w + xx], A = c >>> 24;
          r += (c & 255) * A; g += ((c >>> 8) & 255) * A; b += ((c >>> 16) & 255) * A; a += A; n++;
        }
        out[y * w + x] = a ? U.rgba(Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / n)) : 0;
      }
    }
    return { w, h, data: out };
  };
  O.duplicateLayer = () => snap('Дублирование слоя', (doc) => {
    const L = doc.active, C = doc.newLayer(L.name + ' копия', L.data.slice());
    C.opacity = L.opacity; C.alphaLock = L.alphaLock;
    if (L.frames) { C.frames = L.frames.map((f) => f.slice()); C.frame = L.frame; C.data = C.frames[C.frame]; }
    if (L.depth) C.depth = L.depth.slice();
    if (L.depths) C.depths = L.depths.map((d) => d && d.slice());
    if (L.text) C.text = JSON.parse(JSON.stringify(L.text));
    if (L.particles) C.particles = JSON.parse(JSON.stringify(L.particles));
    doc.addLayerRaw(C, doc.indexOf(L.id) + 1);
  });
  O.deleteLayer = () => snap('Удаление слоя', (doc) => {
    if (doc.layers.length < 2) { NPR.toast('Нельзя удалить единственный слой'); return false; }
    const i = doc.indexOf(doc.activeId);
    doc.layers.splice(i, 1);
    doc.activeId = doc.layers[Math.max(0, i - 1)].id;
  });
  O.moveLayer = (dir) => snap('Порядок слоёв', (doc) => {
    const i = doc.indexOf(doc.activeId), j = i + dir;
    if (j < 0 || j >= doc.layers.length) return false;
    const [L] = doc.layers.splice(i, 1);
    doc.layers.splice(j, 0, L);
  });
  O.moveLayerTo = (from, to) => snap('Порядок слоёв', (doc) => {
    if (from === to || from < 0 || to < 0 || from >= doc.layers.length || to >= doc.layers.length) return false;
    const [L] = doc.layers.splice(from, 1);
    doc.layers.splice(to, 0, L);
    doc.activeId = L.id;
  });
  /* Заменить один цвет другим: на активном слое или на всех, с учётом выделения. */
  O.replaceColor = function (from, to, allLayers) {
    NPR.edit.commitFloat();
    const doc = NPR.doc, Sel = NPR.selection, W = doc.width, active = doc.activeId, cmds = [];
    const layers = (allLayers ? doc.layers : [doc.active]).filter((L) => !L.locked);
    for (const L of layers) {
      const tx = new NPR.Tx(doc, L), d = L.data;
      for (let i = 0; i < d.length; i++)
        if (d[i] === from && (!doc.sel || Sel.has(doc.sel, i % W, (i / W) | 0))) tx.set(i, to);
      const cmd = tx.commit('Замена цвета');
      if (cmd) cmds.push(cmd);
    }
    doc.activeId = active;
    if (!cmds.length) return 0;
    NPR.history.push(cmds.length === 1 ? cmds[0] : new NPR.GroupCmd('Замена цвета', cmds));
    NPR.emit('docChanged');
    return cmds.reduce((n, c) => n + c.idx.length, 0);
  };
  /* Обводка. Чистая функция: какие пиксели закрасить.
     inside — по краю самого объекта, иначе снаружи (только по прозрачным пикселям);
     diag — соседи и по диагонали; width — толщина в пикселях; region — что считать объектом;
     limit(x, y) — где можно рисовать (например, внутри выделения). */
  O.outlinePixels = function (d, W, H, opt) {
    const near = opt.diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const obj = new Uint8Array(W * H), out = [], inside = !!opt.inside, region = opt.region, limit = opt.limit;
    for (let i = 0; i < obj.length; i++) obj[i] = d[i] >>> 24 && (!region || region[i]) ? 1 : 0;
    const width = Math.max(1, opt.width | 0);
    for (let pass = 0; pass < width; pass++) {
      const add = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (inside ? !obj[i] : obj[i] || d[i] >>> 24) continue;
        if (limit && !limit(x, y)) continue;
        let hit = false;
        for (const [dx, dy] of near) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; // край холста пустым не считается
          if (inside ? !obj[ny * W + nx] : obj[ny * W + nx]) { hit = true; break; }
        }
        if (hit) add.push(i);
      }
      if (!add.length) break;
      for (const i of add) { obj[i] = inside ? 0 : 1; out.push(i); }
    }
    return out;
  };
  /* Связный объект (по 8 соседям), в который попал пиксель (x, y). */
  O.componentAt = function (d, W, H, x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H || d[y * W + x] >>> 24 === 0) return null;
    const m = new Uint8Array(W * H), stack = [y * W + x];
    m[y * W + x] = 1;
    while (stack.length) {
      const i = stack.pop(), cx = i % W, cy = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (!m[j] && d[j] >>> 24) { m[j] = 1; stack.push(j); }
      }
    }
    return m;
  };
  /* Обводка на активном слое (с учётом выделения). Возвращает число закрашенных пикселей. */
  O.outline = function (color, inside, diag, width, region) {
    NPR.edit.commitFloat();
    const doc = NPR.doc, L = NPR.edit.editableLayer();
    if (!L) return 0;
    const Sel = NPR.selection, W = doc.width, H = doc.height;
    const px = O.outlinePixels(L.data.slice(), W, H, { inside, diag, width: width || 1, region, limit: doc.sel ? (x, y) => Sel.has(doc.sel, x, y) : null });
    const tx = new NPR.Tx(doc, L);
    for (const i of px) tx.set(i, color);
    const cmd = tx.commit('Обводка');
    if (cmd) { NPR.history.push(cmd); NPR.emit('docChanged'); }
    return cmd ? cmd.idx.length : 0;
  };
  O.mergeDown = () => snap('Объединение слоёв', (doc) => {
    const i = doc.indexOf(doc.activeId);
    if (i < 1) { NPR.toast('Ниже нет слоя для объединения'); return false; }
    const up = doc.layers[i], low = doc.layers[i - 1];
    if (up.frames || low.frames) { NPR.toast('Слои-спрайтшиты не объединяются: у них разные кадры'); return false; }
    const out = low.data.slice(), src = up.data, op = Math.round(up.opacity * 255);
    for (let k = 0; k < out.length; k++) {
      let s = src[k];
      if (s >>> 24 === 0) continue;
      if (op < 255) s = ((s & 0xffffff) | ((((s >>> 24) * op + 127) / 255 | 0) << 24)) >>> 0;
      out[k] = U.blend(out[k], s);
    }
    low.data = out;
    doc.layers.splice(i, 1);
    doc.activeId = low.id;
  });

  function eachLayer(doc, nw, nh, make) {
    const datas = doc.layers.map((L) => (L.frames ? L.frames.map(make) : make(L.data)));
    doc.setSize(nw, nh);
    doc.layers.forEach((L, i) => {
      if (L.frames) { L.frames = datas[i]; L.data = L.frames[L.frame]; } else L.data = datas[i];
      L.depth = null; L.depths = null; // карты глубины привязаны к старому размеру
    });
    doc.sel = null;
  }
  O.resizeCanvas = (nw, nh, ax, ay) => snap('Размер холста', (doc) => {
    const W = doc.width, H = doc.height;
    if (nw === W && nh === H) return false;
    const ox = Math.round((nw - W) * ax), oy = Math.round((nh - H) * ay);
    O.cropTo(doc, -ox, -oy, nw, nh);
  });
  /* Новый холст nw×nh, левый верхний угол которого лежит в (x, y) старого. */
  O.cropTo = function (doc, x, y, nw, nh) {
    const W = doc.width, H = doc.height;
    const sx0 = Math.max(0, x), sy0 = Math.max(0, y), sx1 = Math.min(W, x + nw), sy1 = Math.min(H, y + nh);
    eachLayer(doc, nw, nh, (src) => {
      const out = new Uint32Array(nw * nh);
      if (sx1 > sx0) for (let yy = sy0; yy < sy1; yy++)
        out.set(src.subarray(yy * W + sx0, yy * W + sx1), (yy - y) * nw + (sx0 - x));
      return out;
    });
  };
  O.cropToSelection = () => snap('Обрезка', (doc) => {
    const s = doc.sel;
    if (!s) { NPR.toast('Сначала выделите область'); return false; }
    const x0 = Math.max(0, s.x), y0 = Math.max(0, s.y), x1 = Math.min(doc.width, s.x + s.w), y1 = Math.min(doc.height, s.y + s.h);
    if (x1 <= x0 || y1 <= y0) return false;
    O.cropTo(doc, x0, y0, x1 - x0, y1 - y0);
  });
  O.scaleImage = (nw, nh) => snap('Масштабирование', (doc) => {
    const W = doc.width, H = doc.height;
    if (nw === W && nh === H) return false;
    eachLayer(doc, nw, nh, (src) => U.scaleNearest(src, W, H, nw, nh));
  });
  O.rotateCanvas = (cw) => snap('Поворот холста', (doc) => {
    const W = doc.width, H = doc.height;
    eachLayer(doc, H, W, (src) => NPR.rot90(src, W, H, cw));
  });
})(window.NPR);
