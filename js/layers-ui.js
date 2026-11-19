'use strict';
/* Панель слоёв. Верхний слой — вверху списка. */
(function (NPR) {
  const { el } = NPR.util;
  const ICON = {
    eye: 'M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z M8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
    eyeOff: 'M2 2l12 12 M4.2 5.2C2.5 6.4 1.5 8 1.5 8S4 12.5 8 12.5c1 0 1.9-.3 2.7-.7 M6.7 3.6c.4-.1.9-.1 1.3-.1 4 0 6.5 4.5 6.5 4.5s-.6 1.1-1.7 2.2',
    lock: 'M4 7h8v6H4z M5.5 7V5a2.5 2.5 0 0 1 5 0v2',
    unlock: 'M4 7h8v6H4z M5.5 7V5a2.5 2.5 0 0 1 4.8-1',
    alpha: 'M3 3h10v10H3z M3 8h10 M8 3v10',
  };
  const svg = (d) => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  NPR.svgIcon = svg;

  function toggleBtn(on, icon, label, fn) {
    const b = el('button', { type: 'button', class: 'ico' + (on ? ' on' : ''), title: label, 'aria-label': label, 'aria-pressed': String(on), html: svg(icon) });
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }

  /* Миниатюра слоя: 26×26, выборка ближайшим соседом. */
  const TS = 26;
  function thumb(L, doc) {
    const c = el('canvas', { class: 'thumb', width: TS, height: TS });
    const ctx = c.getContext('2d'), id = ctx.createImageData(TS, TS), out = new Uint32Array(id.data.buffer);
    const k = Math.max(doc.width, doc.height) / TS, ox = (TS * k - doc.width) / 2, oy = (TS * k - doc.height) / 2;
    for (let y = 0; y < TS; y++) {
      const sy = Math.floor((y + 0.5) * k - oy);
      if (sy < 0 || sy >= doc.height) continue;
      for (let x = 0; x < TS; x++) {
        const sx = Math.floor((x + 0.5) * k - ox);
        if (sx >= 0 && sx < doc.width) out[y * TS + x] = L.data[sy * doc.width + sx];
      }
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  function render() {
    const doc = NPR.doc, list = document.getElementById('layerList');
    if (!doc) return;
    const rows = [];
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const L = doc.layers[i], act = L.id === doc.activeId;
      const row = el('li', { class: 'layer' + (act ? ' active' : '') + (L.visible ? '' : ' hidden'), 'aria-current': act ? 'true' : null, draggable: 'true', title: 'Перетащите, чтобы изменить порядок. Двойной щелчок — переименовать' },
        toggleBtn(L.visible, L.visible ? ICON.eye : ICON.eyeOff, L.visible ? 'Скрыть слой' : 'Показать слой', () => { L.visible = !L.visible; changed(); }),
        thumb(L, doc),
        el('span', { class: 'name' }, L.particles ? el('small', { title: 'Слой частиц: его эффект можно изменить инструментом «Частицы»' }, '✦ ') : null, L.text ? el('small', { title: 'Текстовый слой: его можно изменить инструментом «Текст»' }, 'T ') : null, L.name, L.frames ? el('small', { title: 'Слой-спрайтшит: кадров ' + L.frames.length }, ` ▦${L.frames.length}`) : null),
        toggleBtn(L.alphaLock, ICON.alpha, 'Блокировка прозрачности: рисовать только по закрашенным пикселям', () => { L.alphaLock = !L.alphaLock; changed(true); }),
        toggleBtn(L.locked, L.locked ? ICON.lock : ICON.unlock, L.locked ? 'Разблокировать слой' : 'Заблокировать слой', () => { L.locked = !L.locked; changed(true); }));
      row.addEventListener('click', () => select(L.id));
      row.addEventListener('dblclick', () => rename(L));
      row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-npr-layer', String(i)); e.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-npr-layer')) { e.preventDefault(); row.classList.add('drop'); } });
      row.addEventListener('dragleave', () => row.classList.remove('drop'));
      row.addEventListener('drop', (e) => {
        const from = e.dataTransfer.getData('text/x-npr-layer');
        row.classList.remove('drop');
        if (from === '') return;
        e.preventDefault(); e.stopPropagation();
        NPR.ops.moveLayerTo(+from, i);
      });
      rows.push(row);
    }
    list.replaceChildren(...rows);
    const op = document.getElementById('layerOpacity');
    op.value = Math.round(doc.active.opacity * 100);
    document.getElementById('layerOpacityVal').textContent = op.value + '%';
  }

  function changed(noPixels) {
    if (!noPixels) NPR.doc.markAllDirty();
    render();
    NPR.emit('docChanged');
  }
  function select(id) {
    if (NPR.doc.activeId === id) return;
    NPR.edit.commitFloat();
    NPR.doc.activeId = id;
    NPR.emit('layers');
  }
  async function rename(L) {
    const v = await NPR.dialog({ title: 'Название слоя', okLabel: 'Переименовать', fields: [{ id: 'name', label: 'Название', value: L.name }] });
    if (v && v.name.trim()) { L.name = v.name.trim(); changed(true); }
  }

  NPR.layersUI = {
    init() {
      const O = NPR.ops;
      const bind = (id, fn) => document.getElementById(id).addEventListener('click', fn);
      bind('layerAdd', O.addLayer);
      bind('layerImport', () => NPR.actions.importLayer());
      bind('layerDup', O.duplicateLayer);
      bind('layerUp', () => O.moveLayer(1));
      bind('layerDown', () => O.moveLayer(-1));
      bind('layerMerge', O.mergeDown);
      bind('layerDel', O.deleteLayer);
      bind('layerSprite', NPR.frames.convert);
      const op = document.getElementById('layerOpacity');
      op.addEventListener('input', () => {
        NPR.doc.active.opacity = op.value / 100;
        document.getElementById('layerOpacityVal').textContent = op.value + '%';
        NPR.doc.markAllDirty();
        NPR.emit('docChanged');
      });
      NPR.on('layers', render);
      NPR.on('history', render);
    },
    render,
  };
})(window.NPR);
