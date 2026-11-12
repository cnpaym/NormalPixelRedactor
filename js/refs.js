'use strict';
/* Референсы — вспомогательные картинки, которые не попадают в рисунок и в экспорт.
   Три способа показа:
     under — под рисунком (фон), в координатах холста;
     over  — поверх рисунка (наложение), в координатах холста;
     pin   — мини-окно, закреплённое на экране, не зависит от зума.
   Картинка «сбоку» — это under/over, сдвинутая за край холста.
   Пипетка берёт цвета с любого референса. */
(function (NPR) {
  const S = NPR.state, U = NPR.util, V = NPR.view, { el } = U;
  const $ = (id) => document.getElementById(id);
  const R = (NPR.refs = { selected: null });
  const MAX_SIDE = 1600; // большие фото уменьшаются: слабому ноутбуку не нужны 12 мегапикселей
  const PROPS = ['name', 'x', 'y', 'scale', 'opacity', 'mode', 'visible', 'locked', 'sx', 'sy', 'sw', 'rot'];
  let nextId = 1;
  const list = () => (NPR.doc ? NPR.doc.refs : []);

  /* ---------- загрузка ---------- */
  async function decode(blob) {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const data = new Uint32Array(ctx.getImageData(0, 0, c.width, c.height).data.buffer);
    let out = blob;
    if (k < 1) { // храним уже уменьшенную копию
      let alpha = false;
      for (let i = 0; i < data.length; i += 7) if (data[i] >>> 24 !== 255) { alpha = true; break; }
      out = await new Promise((res) => c.toBlob(res, alpha ? 'image/png' : 'image/jpeg', 0.92));
    }
    return { canvas: c, data, w: c.width, h: c.height, blob: out };
  }
  function make(img, props) {
    return Object.assign({ id: nextId++, name: 'Референс', x: 0, y: 0, scale: 1, opacity: 1, mode: 'under', visible: true, locked: false, sx: 10, sy: 10, sw: 180, rot: 0 }, props, img);
  }
  /* Поставить справа от холста, по его высоте. */
  R.placeSide = function (r) {
    const doc = NPR.doc, gap = Math.max(1, Math.round(doc.width * 0.06));
    let x = doc.width + gap;
    for (const o of doc.refs) if (o !== r && o.mode !== 'pin' && o.x >= doc.width) x = Math.max(x, Math.ceil(o.x + o.w * o.scale) + gap);
    r.scale = doc.height / r.h; r.x = x; r.y = 0;
    if (r.mode === 'pin') r.mode = 'under';
  };
  /* Вписать в холст по центру. */
  R.placeFit = function (r) {
    const doc = NPR.doc;
    r.scale = Math.min(doc.width / r.w, doc.height / r.h);
    r.x = Math.round((doc.width - r.w * r.scale) / 2); r.y = Math.round((doc.height - r.h * r.scale) / 2);
    if (r.mode === 'pin') r.mode = 'under';
  };
  R.add = async function (files) {
    let added = 0;
    for (const f of files) {
      try {
        const r = make(await decode(f), { name: (f.name || 'Референс').replace(/\.[^.]+$/, '') });
        R.placeSide(r);
        const pins = list().filter((o) => o.mode === 'pin').length;
        r.sx = Math.max(10, V.vw - r.sw - 10); r.sy = 10 + pins * 24;
        NPR.doc.refs.push(r);
        R.selected = r;
        added++;
      } catch (e) { NPR.toast('Не удалось прочитать картинку ' + (f.name || ''), true); }
    }
    if (added) touch();
  };
  R.pick = function () {
    const i = el('input', { type: 'file', accept: 'image/*', multiple: true });
    i.onchange = () => R.add([...i.files]);
    i.click();
  };
  R.remove = function (r) {
    const a = list(), i = a.indexOf(r);
    if (i >= 0) a.splice(i, 1);
    if (R.selected === r) R.selected = null;
    touch();
  };
  function touch(light) {
    V.redraw();
    if (!light) R.render();
    NPR.emit('docChanged');
  }

  /* ---------- сохранение вместе с проектом ---------- */
  const propsOf = (r) => { const o = {}; for (const k of PROPS) o[k] = r[k]; return o; };
  R.toRecords = (doc) => doc.refs.map((r) => ({ ...propsOf(r), blob: r.blob }));
  R.fromRecords = async function (recs) {
    const out = [];
    for (const rec of recs || []) {
      try { out.push(make(await decode(rec.blob), propsOf(rec))); } catch (e) { console.warn('Референс не восстановлен', e); }
    }
    return out;
  };
  const toDataURL = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  R.toJSON = async (doc) => Promise.all(doc.refs.map(async (r) => ({ ...propsOf(r), data: await toDataURL(r.blob) })));
  R.fromJSON = async function (arr) {
    const recs = [];
    for (const o of arr || []) {
      if (typeof o.data !== 'string' || !o.data.startsWith('data:image/')) continue;
      recs.push({ ...o, blob: await (await fetch(o.data)).blob() });
    }
    return R.fromRecords(recs);
  };

  /* ---------- геометрия ---------- */
  const pinH = (r) => (r.sw * r.h) / r.w;
  function screenRect(r) {
    if (r.mode === 'pin') return [r.sx, r.sy, r.sw, pinH(r)];
    const z = V.zoom;
    return [V.ox + r.x * z, V.oy + r.y * z, r.w * r.scale * z, r.h * r.scale * z];
  }
  /* Сверху вниз: мини-окна, наложения, фон. */
  function ordered(modes) {
    const out = [];
    for (const m of modes) for (let i = list().length - 1; i >= 0; i--) if (list()[i].mode === m && list()[i].visible) out.push(list()[i]);
    return out;
  }
  /* Точка экрана в системе неповёрнутого референса (поворот — вокруг его центра). */
  function unrotate(r, sx, sy) {
    if (!r.rot) return [sx, sy];
    const [x, y, w, h] = screenRect(r), cx = x + w / 2, cy = y + h / 2, a = (-r.rot * Math.PI) / 180, dx = sx - cx, dy = sy - cy;
    return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
  }
  function pixelAt(r, px, py) {
    const [x, y, w, h] = screenRect(r), [sx, sy] = unrotate(r, px, py);
    if (sx < x || sy < y || sx >= x + w || sy >= y + h) return 0;
    const c = r.data[Math.min(r.h - 1, Math.floor(((sy - y) / h) * r.h)) * r.w + Math.min(r.w - 1, Math.floor(((sx - x) / w) * r.w))];
    return c >>> 24 ? (c | 0xff000000) >>> 0 : 0;
  }
  /* Цвет под указателем для пипетки. above=true — то, что лежит поверх рисунка. */
  R.sample = function (p, above) {
    for (const r of ordered(above ? ['pin', 'over'] : ['under'])) {
      const c = pixelAt(r, p.sx, p.sy);
      if (c) return c;
    }
    return 0;
  };

  /* ---------- отрисовка ---------- */
  function drawRef(ctx, r, frame) {
    let [x, y, w, h] = screenRect(r);
    const far = r.rot ? Math.hypot(w, h) / 2 : 0;
    if (x - far > V.vw || y - far > V.vh || x + w + far < 0 || y + h + far < 0) return;
    ctx.save();
    if (r.rot) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate((r.rot * Math.PI) / 180); x = -w / 2; y = -h / 2; }
    if (frame) { ctx.fillStyle = '#151515'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2); }
    ctx.globalAlpha = r.opacity;
    ctx.imageSmoothingEnabled = w < r.w; // уменьшение сглаживаем, увеличение оставляем чётким
    ctx.drawImage(r.canvas, x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    if (frame) { ctx.strokeStyle = '#777'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x) - 0.5, Math.round(y) - 0.5, Math.round(w) + 1, Math.round(h) + 1); }
    ctx.restore();
  }
  R.draw = function (ctx, mode) {
    for (const r of list()) if (r.visible && r.mode === mode) drawRef(ctx, r, mode === 'pin');
  };
  const HANDLE = 12;
  R.drawOverlay = function (ctx) {
    const r = R.selected;
    if (!r || S.tool !== 'refs' || !r.visible || !list().includes(r)) return;
    let [x, y, w, h] = screenRect(r);
    ctx.save();
    if (r.rot) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate((r.rot * Math.PI) / 180); x = -w / 2; y = -h / 2; }
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000'; ctx.strokeRect(Math.round(x) - 0.5, Math.round(y) - 0.5, Math.round(w) + 1, Math.round(h) + 1);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#f2b63d'; ctx.strokeRect(Math.round(x) - 0.5, Math.round(y) - 0.5, Math.round(w) + 1, Math.round(h) + 1);
    ctx.setLineDash([]);
    if (!r.locked) {
      ctx.fillStyle = '#f2b63d'; ctx.fillRect(x + w - HANDLE, y + h - HANDLE, HANDLE, HANDLE);
      ctx.strokeStyle = '#000'; ctx.strokeRect(x + w - HANDLE + 0.5, y + h - HANDLE + 0.5, HANDLE - 1, HANDLE - 1);
    }
    ctx.restore();
  };

  /* ---------- инструмент: двигать и менять размер ---------- */
  let drag = null;
  NPR.tools.refs = {
    down(p) {
      let hit = null;
      for (const r of ordered(['pin', 'over', 'under'])) {
        if (r.locked) continue;
        const [x, y, w, h] = screenRect(r), [lx, ly] = unrotate(r, p.sx, p.sy);
        if (lx >= x && ly >= y && lx < x + w && ly < y + h) { hit = r; break; }
      }
      R.selected = hit;
      R.render();
      V.redrawOver();
      if (!hit) return false;
      const [x, y, w, h] = screenRect(hit), [lx, ly] = unrotate(hit, p.sx, p.sy);
      const resize = lx >= x + w - HANDLE - 2 && ly >= y + h - HANDLE - 2;
      // размер меняется от центра: так это работает и для повёрнутой картинки
      drag = { r: hit, resize, sx: p.sx, sy: p.sy, start: propsOf(hit), cx: x + w / 2, cy: y + h / 2, w0: w, h0: h };
    },
    move(p) {
      if (!drag) return;
      const { r, start } = drag, z = V.zoom, dx = p.sx - drag.sx, dy = p.sy - drag.sy;
      if (drag.resize) {
        const k = Math.max(0.05, Math.hypot(p.sx - drag.cx, p.sy - drag.cy) / Math.max(1, Math.hypot(drag.sx - drag.cx, drag.sy - drag.cy)));
        const w = Math.max(8, drag.w0 * k), h = (w * r.h) / r.w; // новый размер на экране, центр на месте
        if (r.mode === 'pin') { r.sw = w; r.sx = drag.cx - w / 2; r.sy = drag.cy - h / 2; }
        else { r.scale = w / (r.w * z); r.x = (drag.cx - w / 2 - V.ox) / z; r.y = (drag.cy - h / 2 - V.oy) / z; }
      } else if (r.mode === 'pin') { r.sx = start.sx + dx; r.sy = start.sy + dy; }
      else { r.x = Math.round(start.x + dx / z); r.y = Math.round(start.y + dy / z); }
      V.redraw();
    },
    up() { if (drag) { drag = null; NPR.emit('docChanged'); } },
    cancel() { if (drag) { Object.assign(drag.r, drag.start); drag = null; V.redraw(); } },
  };

  /* ---------- панель ---------- */
  const MODES = [['under', 'под рисунком'], ['over', 'поверх рисунка'], ['pin', 'мини-окно']];
  const ICON = {
    eye: 'M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z M8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
    eyeOff: 'M2 2l12 12 M4.2 5.2C2.5 6.4 1.5 8 1.5 8S4 12.5 8 12.5c1 0 1.9-.3 2.7-.7 M6.7 3.6c.4-.1.9-.1 1.3-.1 4 0 6.5 4.5 6.5 4.5s-.6 1.1-1.7 2.2',
    lock: 'M4 7h8v6H4z M5.5 7V5a2.5 2.5 0 0 1 5 0v2',
    unlock: 'M4 7h8v6H4z M5.5 7V5a2.5 2.5 0 0 1 4.8-1',
    del: 'M4 4l8 8 M12 4l-8 8',
  };
  function ico(icon, label, on, fn) {
    const b = el('button', { type: 'button', class: 'ico' + (on ? ' on' : ''), title: label, 'aria-label': label, html: NPR.svgIcon(icon) });
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  R.render = function () {
    const box = $('refList');
    if (!box) return;
    const rows = list().map((r) => {
      const sel = r === R.selected;
      const mode = el('select', { 'aria-label': 'Где показывать' }, MODES.map(([v, t]) => el('option', { value: v, selected: v === r.mode }, t)));
      mode.addEventListener('change', () => {
        r.mode = mode.value;
        if (r.mode === 'over' && r.opacity === 1) r.opacity = 0.5; // наложение без прозрачности закрыло бы рисунок
        touch();
      });
      const op = el('input', { type: 'range', min: 5, max: 100, value: Math.round(r.opacity * 100), 'aria-label': 'Непрозрачность референса', title: 'Непрозрачность' });
      op.addEventListener('input', () => { r.opacity = op.value / 100; touch(true); });
      const row = el('li', { class: 'ref' + (sel ? ' active' : '') },
        el('div', { class: 'line' },
          ico(r.visible ? ICON.eye : ICON.eyeOff, r.visible ? 'Скрыть' : 'Показать', r.visible, () => { r.visible = !r.visible; touch(); }),
          el('span', { class: 'name', title: r.name }, r.name),
          ico(r.locked ? ICON.lock : ICON.unlock, r.locked ? 'Разблокировать' : 'Заблокировать: инструмент не будет его двигать', r.locked, () => { r.locked = !r.locked; touch(); }),
          ico(ICON.del, 'Удалить референс', true, () => R.remove(r))),
        el('div', { class: 'line' }, mode, op));
      if (sel) {
        const btn = (text, title, fn) => { const b = el('button', { type: 'button', title }, text); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); touch(); }); return b; };
        row.append(el('div', { class: 'line btns' },
          btn('Сбоку', 'Поставить справа от холста', () => R.placeSide(r)),
          btn('На холст', 'Вписать в холст по центру', () => R.placeFit(r)),
          btn('1:1', 'Пиксель референса = пиксель холста', () => { r.scale = 1; if (r.mode === 'pin') r.sw = r.w; })));
        const rot = el('input', { type: 'number', min: 0, max: 359, value: r.rot || 0, inputmode: 'numeric', 'aria-label': 'Поворот в градусах' });
        rot.addEventListener('input', () => { if (rot.value !== '') { r.rot = (((Math.round(+rot.value) || 0) % 360) + 360) % 360; touch(true); } });
        row.append(el('div', { class: 'line btns' }, el('label', { class: 'rot' }, 'Поворот ', rot, '°'),
          btn('−90°', 'Повернуть против часовой', () => { r.rot = ((r.rot || 0) + 270) % 360; }),
          btn('+90°', 'Повернуть по часовой', () => { r.rot = ((r.rot || 0) + 90) % 360; })));
      }
      row.addEventListener('click', (e) => {
        if (/^(SELECT|INPUT|BUTTON)$/.test(e.target.tagName)) return;
        R.selected = r; R.render(); V.redrawOver();
      });
      return row;
    });
    box.replaceChildren(...rows);
    $('refHint').hidden = !rows.length;
  };

  R.init = function () {
    $('refAdd').addEventListener('click', R.pick);
    NPR.on('layers', R.render); // срабатывает и при смене документа
  };
})(window.NPR);
