'use strict';
/* Файлы: проект (.npr), PNG и автосохранение в IndexedDB.
   Формат проекта — JSON с полем version; пиксели слоёв лежат как
   сжатый (deflate) RGBA в base64, без потерь. */
(function (NPR) {
  const U = NPR.util;
  const IO = (NPR.io = {});
  const FORMAT = 'NormalPixelRedactor', VERSION = 1;

  const layerProps = (L) => ({ name: L.name, visible: L.visible, opacity: L.opacity, locked: L.locked, alphaLock: L.alphaLock });
  const bytesOf = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

  /* extras[i] = { frames: [Uint32Array] | null, frame, depth: Uint8Array | null } */
  function build(meta, datas, extras) {
    const w = meta.width | 0, h = meta.height | 0;
    if (!(w >= 1 && h >= 1 && w <= NPR.ops.MAX && h <= NPR.ops.MAX)) throw new Error('Недопустимый размер холста');
    const doc = new NPR.Doc(w, h);
    doc.name = meta.name || 'Без названия';
    doc.layers = meta.layers.map((p, i) => {
      if (datas[i].length !== w * h) throw new Error('Повреждённые данные слоя «' + p.name + '»');
      const L = doc.newLayer(p.name, datas[i]);
      L.visible = p.visible !== false;
      L.opacity = typeof p.opacity === 'number' ? U.clamp(p.opacity, 0, 1) : 1;
      L.locked = !!p.locked; L.alphaLock = !!p.alphaLock;
      const x = (extras && extras[i]) || {};
      if (x.frames && x.frames.length && x.frames.every((f) => f.length === w * h)) {
        L.frames = x.frames; L.frame = U.clamp(x.frame | 0, 0, x.frames.length - 1); L.data = L.frames[L.frame];
      }
      if (x.depth && x.depth.length === w * h) L.depth = x.depth;
      if (L.frames && Array.isArray(x.depths)) L.depths = x.depths.map((d) => (d && d.length === w * h ? d : null));
      return L;
    });
    if (!doc.layers.length) throw new Error('В проекте нет слоёв');
    doc.activeId = (doc.layers[meta.activeLayer] || doc.layers[doc.layers.length - 1]).id;
    const sl = meta.slice;
    if (sl && [sl.l, sl.t, sl.r, sl.b].every((n) => Number.isInteger(n) && n >= 0)) doc.slice = { l: sl.l, t: sl.t, r: sl.r, b: sl.b };
    doc.markAllDirty();
    return doc;
  }

  IO.serialize = async function () {
    NPR.edit.commitFloat();
    const doc = NPR.doc, layers = [];
    const pack = async (arr) => U.toBase64(U.hasCompression ? await U.deflate(bytesOf(arr)) : bytesOf(arr));
    for (const L of doc.layers) {
      const rec = { ...layerProps(L), encoding: U.hasCompression ? 'deflate' : 'raw', data: await pack(L.data) };
      if (L.frames) { rec.frames = []; for (const f of L.frames) rec.frames.push(await pack(f)); rec.frame = L.frame; }
      if (L.depth) rec.depth = await pack(L.depth);
      if (L.depths) { rec.depths = []; for (const d of L.depths) rec.depths.push(d ? await pack(d) : null); }
      layers.push(rec);
    }
    return JSON.stringify({
      format: FORMAT, version: VERSION, name: doc.name, width: doc.width, height: doc.height,
      activeLayer: doc.indexOf(doc.activeId), layers, slice: doc.slice || null,
      palette: NPR.palette ? NPR.palette.current() : null,
      refs: await NPR.refs.toJSON(doc),
    });
  };

  IO.parse = async function (text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { throw new Error('Файл не является проектом NormalPixelRedactor'); }
    if (o.format !== FORMAT) throw new Error('Файл не является проектом NormalPixelRedactor');
    if (o.version > VERSION) throw new Error('Проект сохранён в более новой версии редактора');
    const datas = [], extras = [];
    for (const L of o.layers) {
      const bytes = async (str) => { const b = U.fromBase64(str); return L.encoding === 'deflate' ? U.inflate(b) : b; };
      const px = async (str) => { const b = await bytes(str); return new Uint32Array(b.buffer, b.byteOffset, b.byteLength >> 2); };
      datas.push(await px(L.data));
      const x = { frames: null, frame: L.frame, depth: null };
      if (Array.isArray(L.frames)) { x.frames = []; for (const f of L.frames) x.frames.push(await px(f)); }
      if (typeof L.depth === 'string') x.depth = await bytes(L.depth);
      if (Array.isArray(L.depths)) { x.depths = []; for (const d of L.depths) x.depths.push(typeof d === 'string' ? await bytes(d) : null); }
      extras.push(x);
    }
    const doc = build(o, datas, extras);
    doc.refs = await NPR.refs.fromJSON(o.refs);
    return { doc, palette: o.palette };
  };

  const safeName = (s) => (s || 'project').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'project';
  IO.safeName = safeName;
  const NPR_TYPE = { description: 'Проект NormalPixelRedactor', accept: { 'application/json': ['.npr'] } };

  /* Сохранение. Где браузер это умеет (Chrome, Edge), проект пишется прямо
     в выбранный файл и повторный Ctrl+S перезаписывает его без вопросов.
     В остальных браузерах файл скачивается в «Загрузки». */
  IO.saveProject = async function (saveAs) {
    const doc = NPR.doc;
    if (window.showSaveFilePicker) {
      try {
        let handle = saveAs === true ? null : doc.fileHandle;
        if (!handle) handle = await window.showSaveFilePicker({ suggestedName: safeName(doc.name) + '.npr', types: [NPR_TYPE] });
        const text = await IO.serialize();
        const w = await handle.createWritable();
        await w.write(text);
        await w.close();
        doc.fileHandle = handle;
        NPR.toast('Сохранено в файл ' + handle.name);
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // окно выбора закрыли
        console.warn('Запись в файл не удалась, скачиваю копию', e);
      }
    }
    U.download(new Blob([await IO.serialize()], { type: 'application/json' }), safeName(doc.name) + '.npr');
    NPR.toast('Проект скачан в «Загрузки»');
  };

  IO.pickAndOpen = async function () {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Проекты и картинки', accept: { 'application/json': ['.npr'], 'image/*': ['.png', '.gif', '.jpg', '.jpeg', '.webp', '.bmp'] } }],
        });
        return IO.openFile(await handle.getFile(), handle);
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    return IO.openFile(await U.pickFile('.npr,.json,image/png,image/gif,image/jpeg,image/webp,image/bmp'));
  };

  IO.openFile = async function (file, handle) {
    if (!file) return;
    try {
      let doc, palette;
      if (/\.(npr|json)$/i.test(file.name)) {
        ({ doc, palette } = await IO.parse(await file.text()));
        if (handle) doc.fileHandle = handle;
      } else {
        const img = await U.decodeImage(file);
        if (img.w > NPR.ops.MAX || img.h > NPR.ops.MAX) throw new Error(`Картинка больше ${NPR.ops.MAX}×${NPR.ops.MAX}`);
        doc = new NPR.Doc(img.w, img.h);
        doc.layers[0].data = img.data.slice();
        doc.name = file.name.replace(/\.[^.]+$/, '');
        if (img.w > NPR.ops.WARN || img.h > NPR.ops.WARN) NPR.toast('Большой холст: на слабом ноутбуке возможны задержки');
      }
      doc.touched = true;
      await IO.saveNow();
      NPR.setDoc(doc);
      if (palette && NPR.palette) NPR.palette.adopt(palette);
    } catch (e) {
      NPR.toast('Не удалось открыть: ' + e.message, true);
    }
  };

  IO.importLayer = async function (file) {
    if (!file) return;
    try {
      const img = await U.decodeImage(file);
      NPR.ops.addLayerFromImage(img, file.name.replace(/\.[^.]+$/, ''));
      if (img.w > NPR.doc.width || img.h > NPR.doc.height) NPR.toast('Картинка больше холста, лишнее обрезано');
    } catch (e) { NPR.toast('Не удалось прочитать картинку', true); }
  };

  /* what: 'all' | 'layer' | 'selection' */
  IO.exportPNG = async function (scale, what) {
    NPR.edit.commitFloat();
    const doc = NPR.doc;
    doc.flush();
    let w = doc.width, h = doc.height, src = what === 'layer' ? doc.active.data : doc.comp32;
    if (what === 'selection' && doc.sel) {
      const s = doc.sel, x0 = Math.max(0, s.x), y0 = Math.max(0, s.y);
      const x1 = Math.min(w, s.x + s.w), y1 = Math.min(h, s.y + s.h);
      const out = new Uint32Array((x1 - x0) * (y1 - y0));
      for (let y = y0; y < y1; y++) out.set(src.subarray(y * w + x0, y * w + x1), (y - y0) * (x1 - x0));
      if (s.mask) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++)
        if (!NPR.selection.has(s, x, y)) out[(y - y0) * (x1 - x0) + (x - x0)] = 0;
      src = out; w = x1 - x0; h = y1 - y0;
    }
    if (scale > 1) { src = U.scaleNearest(src, w, h, w * scale, h * scale); w *= scale; h *= scale; }
    const blob = await U.makePNG(w, h, src);
    U.download(blob, safeName(doc.name) + (scale > 1 ? `_x${scale}` : '') + '.png');
  };

  /* ---------- проекты в браузере (IndexedDB) ----------
     Ключи: 'index' — список проектов, 'p:<id>' — сам проект, 'last' — id последнего. */
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('NormalPixelRedactor', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('kv', mode), rq = fn(t.objectStore('kv'));
      t.oncomplete = () => res(rq && rq.result);
      t.onerror = t.onabort = () => rej(t.error);
    });
  }
  const get = (key) => idb('readonly', (s) => s.get(key));
  IO.newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function thumbnail(doc) {
    doc.flush();
    const k = Math.min(1, 48 / Math.max(doc.width, doc.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(doc.width * k)); c.height = Math.max(1, Math.round(doc.height * k));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = k < 1;
    ctx.drawImage(doc.canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  let timer = 0;
  IO.scheduleAutosave = function () {
    clearTimeout(timer);
    const big = NPR.doc.bytes() > 48 * 1048576;
    timer = setTimeout(IO.autosave, big ? 12000 : 1500);
  };
  IO.autosave = async function () {
    const doc = NPR.doc;
    if (!doc || !doc.touched) return;
    if (doc.float || NPR.edit.sessions().length || NPR.input.busy) return IO.scheduleAutosave();
    const rec = {
      version: VERSION, id: doc.pid, name: doc.name, width: doc.width, height: doc.height,
      activeLayer: doc.indexOf(doc.activeId), slice: doc.slice || null,
      layers: doc.layers.map((L) => ({ ...layerProps(L), data: L.data, frames: L.frames, frame: L.frame, depth: L.depth, depths: L.depths })), // IndexedDB сам копирует буферы
      refs: NPR.refs.toRecords(doc),
    };
    const entry = { id: doc.pid, name: doc.name, width: doc.width, height: doc.height, updated: Date.now(), thumb: thumbnail(doc) };
    try {
      const index = ((await get('index')) || []).filter((p) => p.id !== doc.pid);
      index.unshift(entry);
      await idb('readwrite', (s) => { s.put(rec, 'p:' + doc.pid); s.put(index, 'index'); s.put(doc.pid, 'last'); });
      NPR.emit('saved');
    } catch (e) { console.warn('Автосохранение не удалось', e); }
  };
  /* Сохранить немедленно — перед тем как текущий холст сменится другим. */
  IO.saveNow = async function () {
    clearTimeout(timer);
    if (!NPR.doc) return;
    NPR.edit.commitFloat();
    await IO.autosave();
  };

  async function fromRecord(rec) {
    const doc = build(rec, rec.layers.map((L) => L.data), rec.layers);
    doc.refs = await NPR.refs.fromRecords(rec.refs);
    doc.pid = rec.id || IO.newId();
    doc.touched = true;
    return doc;
  }
  IO.restore = async function () {
    try {
      const last = await get('last');
      let rec = last && (await get('p:' + last));
      if (!rec) { // последний проект удалён — берём самый свежий из списка
        const first = ((await get('index')) || [])[0];
        rec = (first && (await get('p:' + first.id))) || (await get('autosave')); // 'autosave' — слот первой версии
      }
      return rec && rec.layers ? await fromRecord(rec) : null;
    } catch (e) { console.warn('Не удалось восстановить холст', e); return null; }
  };
  IO.listProjects = async () => { try { return (await get('index')) || []; } catch (e) { return []; } };
  IO.loadProject = async function (id) {
    const rec = await get('p:' + id);
    if (!rec) throw new Error('Проект не найден');
    await idb('readwrite', (s) => s.put(id, 'last'));
    return fromRecord(rec);
  };
  IO.deleteProject = async function (id) {
    const index = ((await get('index')) || []).filter((p) => p.id !== id);
    await idb('readwrite', (s) => { s.delete('p:' + id); s.put(index, 'index'); });
    if (NPR.doc && NPR.doc.pid === id) NPR.doc.touched = false; // не воскрешать, пока в нём снова не порисуют
  };
})(window.NPR);
