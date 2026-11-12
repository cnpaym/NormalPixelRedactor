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
  O.addLayerFromImage = (img, name) => snap('Импорт слоя', (doc) => {
    const data = new Uint32Array(doc.width * doc.height);
    const w = Math.min(img.w, doc.width), h = Math.min(img.h, doc.height);
    for (let y = 0; y < h; y++) data.set(img.data.subarray(y * img.w, y * img.w + w), y * doc.width);
    doc.addLayerRaw(doc.newLayer(name, data), doc.indexOf(doc.activeId) + 1);
  });
  O.duplicateLayer = () => snap('Дублирование слоя', (doc) => {
    const L = doc.active, C = doc.newLayer(L.name + ' копия', L.data.slice());
    C.opacity = L.opacity; C.alphaLock = L.alphaLock;
    if (L.frames) { C.frames = L.frames.map((f) => f.slice()); C.frame = L.frame; C.data = C.frames[C.frame]; }
    if (L.depth) C.depth = L.depth.slice();
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
      L.depth = null; // карта глубины привязана к старому размеру
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
