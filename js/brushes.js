'use strict';
/* Свои кисти. Кисть — маленькая картинка: рисует отпечатком той формы,
   какой была нарисована. Обычная кисть берёт только форму и красит текущим
   цветом; «цветная» переносит и свои цвета (годится для узоров и штампов). */
(function (NPR) {
  const S = NPR.state, U = NPR.util, { el } = U;
  const KEY = 'npr.brushes', MAX = 64;
  const B = (NPR.brushes = { list: [] });

  B.current = function () {
    const s = S.brushShape;
    if (typeof s !== 'string' || s[0] !== 'b' || s[1] !== ':') return null;
    return B.list.find((b) => b.name === s.slice(2)) || null;
  };
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(B.list.map((b) => ({ name: b.name, w: b.w, h: b.h, colored: b.colored, data: U.toBase64(new Uint8Array(b.data.buffer, b.data.byteOffset, b.data.byteLength)) })))); }
    catch (e) { NPR.toast('Не хватило места в браузере, чтобы сохранить кисть', true); }
  }
  function load() {
    try {
      for (const o of JSON.parse(localStorage.getItem(KEY)) || []) {
        const bytes = U.fromBase64(o.data);
        if (bytes.length === o.w * o.h * 4) B.list.push({ name: o.name, w: o.w, h: o.h, colored: !!o.colored, data: new Uint32Array(bytes.buffer) });
      }
    } catch (e) { /* без своих кистей */ }
  }

  /* Вырезать закрашенную часть картинки (без пустых полей). */
  B.crop = function (data, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x] >>> 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const nw = x1 - x0 + 1, nh = y1 - y0 + 1, out = new Uint32Array(nw * nh);
    for (let y = 0; y < nh; y++) out.set(data.subarray((y0 + y) * w + x0, (y0 + y) * w + x1 + 1), y * nw);
    return { w: nw, h: nh, data: out };
  };
  B.add = function (name, img, colored) {
    let n = name, k = 2;
    while (B.list.some((b) => b.name === n)) n = `${name} ${k++}`;
    B.list.push({ name: n, w: img.w, h: img.h, data: img.data, colored });
    S.brushShape = 'b:' + n;
    save(); B.render();
    return n;
  };
  B.fromSelection = async function () {
    if (!NPR.doc.sel && !NPR.doc.float) return NPR.toast('Сначала выделите нарисованную форму кисти');
    if (!NPR.edit.copy()) return;
    const c = NPR.edit.clipboard, img = B.crop(c.data, c.w, c.h);
    if (!img) return NPR.toast('В выделении нет закрашенных пикселей');
    if (img.w > MAX || img.h > MAX) return NPR.toast(`Кисть не больше ${MAX}×${MAX} пикселей, а здесь ${img.w}×${img.h}`, true);
    const v = await NPR.dialog({
      title: 'Новая кисть', okLabel: 'Создать',
      fields: [
        { id: 'name', label: 'Название', value: 'Кисть ' + (B.list.length + 1) },
        { id: 'colored', label: 'Рисовать её собственными цветами', type: 'checkbox', value: false },
        { type: 'note', label: `Размер ${img.w}×${img.h}. Без галочки кисть берёт только форму и красит текущим цветом.` },
      ],
    });
    if (!v) return;
    const n = B.add(v.name.trim() || 'Кисть', img, v.colored);
    NPR.setTool('pencil');
    NPR.toast(`Кисть «${n}» выбрана`);
  };
  B.removeCurrent = function () {
    const b = B.current();
    if (!b) return NPR.toast('Выбрана встроенная кисть, её удалить нельзя');
    B.list.splice(B.list.indexOf(b), 1);
    S.brushShape = 'square';
    save(); B.render();
  };

  /* Список форм в строке настроек. */
  B.render = function () {
    const sel = document.getElementById('optShape');
    if (!B.current() && S.brushShape !== 'circle') S.brushShape = 'square';
    sel.replaceChildren(
      el('option', { value: 'square' }, 'квадрат'), el('option', { value: 'circle' }, 'круг'),
      ...B.list.map((b) => el('option', { value: 'b:' + b.name }, `${b.name} (${b.w}×${b.h}${b.colored ? ', цветная' : ''})`)));
    sel.value = S.brushShape;
    document.getElementById('brushSize').disabled = !!B.current();
    NPR.view.redrawOver();
  };
  B.menu = function (anchor) {
    NPR.popup(anchor, [
      { label: 'Сделать кисть из выделения…', action: B.fromSelection },
      { label: 'Удалить выбранную кисть', disabled: !B.current(), action: B.removeCurrent },
      '-',
      { label: 'Как сделать свою кисть', action: () => NPR.actions.guide() },
    ]);
  };
  B.init = function () { load(); B.render(); };
})(window.NPR);
