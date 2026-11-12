'use strict';
/* Палитры. Хранятся в localStorage и не зависят от проекта;
   палитра, с которой проект сохранён, записывается и в файл проекта. */
(function (NPR) {
  const S = NPR.state, U = NPR.util, { el } = U;
  const P = (NPR.palette = { list: [], index: 0, selected: -1 });
  const KEY = 'npr.palettes';

  const DEFAULTS = [
    { name: 'PICO-8', colors: '000000 1d2b53 7e2553 008751 ab5236 5f574f c2c3c7 fff1e8 ff004d ffa300 ffec27 00e436 29adff 83769c ff77a8 ffccaa' },
    { name: 'Sweetie 16', colors: '1a1c2c 5d275d b13e53 ef7d57 ffcd75 a7f070 38b764 257179 29366f 3b5dc9 41a6f6 73eff7 f4f4f4 94b0c2 566c86 333c57' },
    { name: 'Game Boy', colors: '0f380f 306230 8bac0f 9bbc0f' },
    { name: 'Оттенки серого', colors: '000000 242424 494949 6d6d6d 929292 b6b6b6 dbdbdb ffffff' },
  ].map((p) => ({ name: p.name, colors: p.colors.split(' ').map((c) => '#' + c) }));

  /* ---------- хранение ---------- */
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY));
      if (o && Array.isArray(o.list) && o.list.length) { P.list = o.list; P.index = U.clamp(o.index | 0, 0, o.list.length - 1); return; }
    } catch (e) { /* повреждённые данные — берём стандартные */ }
    P.list = JSON.parse(JSON.stringify(DEFAULTS));
    P.index = 0;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ list: P.list, index: P.index })); } catch (e) { /* хранилище недоступно */ }
  }
  P.current = () => P.list[P.index];
  P.adopt = function (pal) {
    if (!pal || !Array.isArray(pal.colors)) return;
    const colors = pal.colors.filter((c) => U.parseHex(c) !== null);
    const i = P.list.findIndex((p) => p.name === pal.name && p.colors.join() === colors.join());
    if (i >= 0) P.index = i;
    else { P.list.push({ name: pal.name || 'Из проекта', colors }); P.index = P.list.length - 1; }
    save(); P.render();
  };

  /* ---------- разбор файлов палитр ---------- */
  P.parseText = function (text) {
    const out = [], lines = text.split(/\r?\n/);
    const head = (lines[0] || '').trim();
    if (/^GIMP Palette/i.test(head) || /^JASC-PAL/i.test(head)) {
      for (const ln of lines.slice(1)) {
        const m = ln.match(/^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/);
        if (m) out.push(U.toHex(U.rgba(+m[1], +m[2], +m[3]), false));
      }
    } else {
      for (const ln of lines) {
        const m = ln.trim().match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
        if (m) out.push('#' + m[1].toLowerCase());
      }
    }
    return out;
  };
  /* Уникальные цвета картинки, не больше max. */
  P.fromPixels = function (data, max) {
    const seen = new Set();
    for (let i = 0; i < data.length; i++) {
      const c = data[i];
      if (c >>> 24 === 0 || seen.has(c)) continue;
      seen.add(c);
      if (seen.size > max) return null;
    }
    return [...seen].map((c) => U.toHex(c));
  };

  /* ---------- интерфейс палитры ---------- */
  P.render = function () {
    const sel = document.getElementById('palSelect'), box = document.getElementById('palSwatches');
    sel.replaceChildren(...P.list.map((p, i) => el('option', { value: i, selected: i === P.index }, p.name)));
    const cur = P.current();
    box.replaceChildren(...cur.colors.map((hex, i) => {
      const b = el('button', { type: 'button', class: 'swatch' + (i === P.selected ? ' sel' : ''), title: hex, 'aria-label': 'Цвет ' + hex });
      b.style.setProperty('--c', U.toCss(U.parseHex(hex)));
      b.addEventListener('click', () => { P.selected = i; NPR.setColor('primary', U.parseHex(hex)); P.render(); });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); NPR.setColor('secondary', U.parseHex(hex)); });
      return b;
    }));
    if (!cur.colors.length) box.append(el('p', { class: 'empty' }, 'Палитра пуста. Нажмите «+», чтобы добавить текущий цвет.'));
  };

  function addColor() {
    const hex = U.toHex(S.primary), cur = P.current();
    if (cur.colors.includes(hex)) { NPR.toast('Этот цвет уже есть в палитре'); return; }
    cur.colors.push(hex);
    P.selected = cur.colors.length - 1;
    save(); P.render();
  }
  function removeColor() {
    const cur = P.current();
    let i = P.selected;
    if (i < 0 || i >= cur.colors.length) i = cur.colors.indexOf(U.toHex(S.primary));
    if (i < 0) { NPR.toast('Выберите цвет в палитре, чтобы убрать его'); return; }
    cur.colors.splice(i, 1);
    P.selected = -1;
    save(); P.render();
  }
  function addPalette(name, colors) {
    P.list.push({ name, colors });
    P.index = P.list.length - 1; P.selected = -1;
    save(); P.render();
  }

  async function menu(anchor) {
    const cur = P.current(), base = NPR.io.safeName(cur.name);
    NPR.popup(anchor, [
      { label: 'Новая палитра…', action: async () => {
        const v = await NPR.dialog({ title: 'Новая палитра', okLabel: 'Создать', fields: [{ id: 'name', label: 'Название', value: 'Моя палитра' }] });
        if (v) addPalette(v.name.trim() || 'Моя палитра', []);
      } },
      { label: 'Переименовать…', action: async () => {
        const v = await NPR.dialog({ title: 'Название палитры', okLabel: 'Переименовать', fields: [{ id: 'name', label: 'Название', value: cur.name }] });
        if (v && v.name.trim()) { cur.name = v.name.trim(); save(); P.render(); }
      } },
      { label: 'Дублировать', action: () => addPalette(cur.name + ' копия', cur.colors.slice()) },
      { label: 'Удалить палитру', disabled: P.list.length < 2, action: () => {
        P.list.splice(P.index, 1); P.index = Math.max(0, P.index - 1); P.selected = -1; save(); P.render();
      } },
      '-',
      { label: 'Импорт (.hex, .gpl, .pal, .png)…', action: async () => {
        const f = await U.pickFile('.hex,.gpl,.pal,.txt,image/png');
        if (!f) return;
        let colors;
        if (/\.png$/i.test(f.name)) {
          colors = P.fromPixels((await U.decodeImage(f)).data, 256);
          if (!colors) return NPR.toast('В картинке больше 256 цветов — это не палитра', true);
        } else colors = P.parseText(await f.text());
        if (!colors.length) return NPR.toast('В файле не найдено цветов', true);
        addPalette(f.name.replace(/\.[^.]+$/, ''), colors);
      } },
      { label: 'Собрать из холста', action: () => {
        NPR.doc.flush();
        const colors = P.fromPixels(NPR.doc.comp32, 256);
        if (!colors) return NPR.toast('На холсте больше 256 цветов', true);
        if (!colors.length) return NPR.toast('Холст пуст');
        addPalette(NPR.doc.name, colors);
      } },
      '-',
      { label: 'Экспорт .hex', action: () => U.download(new Blob([cur.colors.map((c) => c.slice(1, 7)).join('\n') + '\n']), base + '.hex') },
      { label: 'Экспорт .gpl (GIMP, Aseprite)', action: () => {
        const rows = cur.colors.map((h) => { const c = U.parseHex(h); return `${U.R(c)} ${U.G(c)} ${U.B(c)}\t${h}`; });
        U.download(new Blob([`GIMP Palette\nName: ${cur.name}\nColumns: 8\n#\n${rows.join('\n')}\n`]), base + '.gpl');
      } },
    ]);
  }

  P.init = function () {
    load();
    document.getElementById('palSelect').addEventListener('change', (e) => { P.index = +e.target.value; P.selected = -1; save(); P.render(); });
    document.getElementById('palAdd').addEventListener('click', addColor);
    document.getElementById('palDel').addEventListener('click', removeColor);
    document.getElementById('palMenu').addEventListener('click', (e) => menu(e.currentTarget));
    P.render();
  };
})(window.NPR);
