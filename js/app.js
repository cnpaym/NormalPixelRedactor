'use strict';
/* Сборка приложения: меню, панель инструментов, строка состояния, запуск. */
(function (NPR) {
  const S = NPR.state, U = NPR.util, V = NPR.view, E = NPR.edit, O = NPR.ops, { el } = U;
  const $ = (id) => document.getElementById(id);
  const A = (NPR.actions = {});
  const SETTINGS = 'npr.settings';

  NPR.history = new NPR.History();

  /* ---------- документ ---------- */
  NPR.setDoc = function (doc) {
    if (!doc.pid) doc.pid = NPR.io.newId();
    NPR.doc = doc;
    NPR.history.clear();
    NPR.tools.lastPoint = null;
    V.hover = null; V.guide = null; V.guidePath = null;
    V.fit();
    NPR.emit('layers');
    title();
    NPR.status.update();
    if (doc.touched) NPR.io.scheduleAutosave();
  };
  function title() {
    $('docTitle').textContent = `${NPR.doc.name}  ${NPR.doc.width}×${NPR.doc.height}`;
    document.title = NPR.doc.name + ' — NormalPixelRedactor';
  }

  function afterHistory(cmd, word, w, h) {
    if (!cmd) return;
    if (NPR.doc.width !== w || NPR.doc.height !== h) NPR.emit('resized');
    NPR.emit('layers');
    NPR.emit('docChanged');
    V.redrawOver();
    NPR.status.flash(`${word}: ${cmd.label}`);
  }
  NPR.undo = function () {
    if (NPR.input.busy) return;
    const d = NPR.doc, top = NPR.history.undoStack[NPR.history.undoStack.length - 1];
    if (NPR.fx.session && top && top.isDepth) { afterHistory(NPR.history.undo(d), 'Отменено', d.width, d.height); return; } // мазок глубины отменяется, предпросмотр остаётся
    if (E.cancelSessions()) return;
    if (d.float) { E.cancelFloat(); return; }
    const w = d.width, h = d.height;
    afterHistory(NPR.history.undo(d), 'Отменено', w, h);
  };
  NPR.redo = function () {
    if (NPR.input.busy) return;
    const d = NPR.doc, top = NPR.history.redoStack[NPR.history.redoStack.length - 1];
    if (!(NPR.fx.session && top && top.isDepth)) E.commitFloat();
    const w = d.width, h = d.height;
    afterHistory(NPR.history.redo(d), 'Повторено', w, h);
  };

  /* ---------- инструменты ---------- */
  const TOOLS = [
    ['pencil', 'Карандаш', 'B', 'M2 14l1-4 8-8 3 3-8 8z M10 3l3 3'],
    ['eraser', 'Ластик', 'E', 'M6.5 14H14 M2.5 10.5l6-6 4 4L7 14H5z'],
    ['fill', 'Заливка', 'G', 'M3 8l5-5 5 5-5 5z M8 3V1.5 M13.5 11s1.5 1.8 1.5 2.7a1.5 1.5 0 0 1-3 0c0-.9 1.5-2.7 1.5-2.7z'],
    ['eyedropper', 'Пипетка', 'I', 'M2 14l1-3 6-6 2 2-6 6z M9 4l2-2 3 3-2 2z'],
    ['line', 'Линия', 'L', 'M3 13L13 3'],
    ['rect', 'Прямоугольник', 'U', 'M2.5 4h11v8h-11z'],
    ['ellipse', 'Эллипс', 'O', 'M8 3.5c3.2 0 5.5 2 5.5 4.5s-2.3 4.5-5.5 4.5S2.5 10.5 2.5 8 4.8 3.5 8 3.5z'],
    ['select', 'Прямоугольное выделение', 'M', 'M3 3h2 M7 3h2 M11 3h2v2 M13 7v2 M13 11v2h-2 M9 13H7 M5 13H3v-2 M3 9V7 M3 5V3'],
    ['selectEllipse', 'Выделение эллипсом', '', 'M8 3c3.2 0 5.5 2 5.5 5s-2.3 5-5.5 5-5.5-2-5.5-5S4.8 3 8 3z'],
    ['lasso', 'Лассо', 'Q', 'M8 2.5c3.3 0 6 1.7 6 3.9s-2.7 3.9-6 3.9-6-1.7-6-3.9 2.7-3.9 6-3.9z M5.5 10c-1.2 1.5-.5 3 1 4'],
    ['wand', 'Волшебная палочка', 'W', 'M2.5 13.5L9.5 6.5 M11.5 1.5v2 M11.5 7.5v2 M7.5 5.5h2 M13.5 5.5h2'],
    ['gradient', 'Градиент', 'D', 'M2.5 3.5h11v9h-11z M5 12.5l8.5-8.5 M8.5 12.5l5-5 M2.5 9l5.5-5.5'],
    ['light', 'Свет и текстура', 'T', 'M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M8 1.5v1.5 M8 13v1.5 M1.5 8H3 M13 8h1.5 M3.4 3.4l1.1 1.1 M11.5 11.5l1.1 1.1 M3.4 12.6l1.1-1.1 M11.5 4.5l1.1-1.1'],
    ['move', 'Перемещение', 'V', 'M8 2v12 M2 8h12 M6 4l2-2 2 2 M6 12l2 2 2-2 M4 6L2 8l2 2 M12 6l2 2-2 2'],
    ['hand', 'Рука (пан)', 'H', 'M5 9V4.5a1 1 0 0 1 2 0V8 M7 7.5V3.5a1 1 0 0 1 2 0v4 M9 7.5v-3a1 1 0 0 1 2 0V9 M11 8.5v-2a1 1 0 0 1 2 0V10c0 3-2 4.5-4.5 4.5-2 0-3.2-1-4-2.5L3 9.5a1 1 0 0 1 2-.5'],
    ['slice', 'Roblox: 9-slice', '', 'M2.5 2.5h11v11h-11z M6 1v14 M10 1v14 M1 6h14 M1 10h14'],
    ['refs', 'Референсы: двигать и менять размер', 'R', 'M2.5 3.5h11v9h-11z M2.5 10.5L6 7l3 3 2-2 2.5 2.5 M10.5 6h.01'],
  ];
  NPR.setTool = function (name) {
    if (NPR.input.busy) return;
    E.commitSessions(name === 'gradient' ? NPR.gradient : name === 'light' ? NPR.fx : null);
    if (!['move', 'select', 'selectEllipse', 'lasso', 'wand', 'gradient', 'light', 'refs', 'slice'].includes(name)) E.commitFloat();
    NPR.fx.show(name === 'light');
    NPR.roblox.show(name === 'slice');
    document.body.classList.toggle('fx-on', name === 'light' || name === 'slice');
    S.tool = name;
    for (const o of document.querySelectorAll('#options [data-tools]')) o.hidden = !o.dataset.tools.split(' ').includes(name);
    for (const b of $('toolbar').children) b.setAttribute('aria-pressed', String(b.dataset.tool === name));
    NPR.input.setCursor();
    V.redrawOver();
  };
  NPR.setBrushSize = function (n) {
    S.brushSize = U.clamp(Math.round(n) || 1, 1, 64);
    $('brushSize').value = S.brushSize;
    V.redrawOver();
  };

  /* Переключатели вида и режимов. */
  const TOGGLES = {
    grid: () => { S.grid = !S.grid; },
    customGrid: () => { S.customGrid = !S.customGrid; },
    hideGrids: () => { S.hideGrids = !S.hideGrids; },
    grads: () => { S.showGrads = !S.showGrads; },
    symX: () => { S.symX = !S.symX; },
    symY: () => { S.symY = !S.symY; },
    penOnly: () => { S.penOnly = !S.penOnly; },
    shade: () => { S.shade = !S.shade; },
    side: () => { document.body.classList.toggle('no-side'); },
  };
  NPR.toggle = function (name) {
    TOGGLES[name]();
    syncOptions();
    V.redraw();
    saveSettings();
  };

  function syncOptions() {
    $('optPP').checked = S.pixelPerfect;
    $('optFilled').checked = S.filled;
    $('optContig').checked = S.contiguous;
    $('optAll').checked = S.sampleAll;
    $('optShade').checked = S.shade;
    $('optDither').value = S.dither;
    $('optTol').value = S.tolerance;
    $('optSymX').setAttribute('aria-pressed', String(S.symX));
    $('optSymY').setAttribute('aria-pressed', String(S.symY));
    $('optShape').value = S.brushShape;
    $('btnGrid').setAttribute('aria-pressed', String(!S.hideGrids));
    $('btnGrads').setAttribute('aria-pressed', String(S.showGrads));
    document.body.classList.toggle('no-grads', !S.showGrads);
    $('brushSize').value = S.brushSize;
  }

  /* ---------- настройки ---------- */
  function saveSettings() {
    const keep = ['brushSize', 'brushShape', 'pixelPerfect', 'filled', 'contiguous', 'tolerance', 'sampleAll', 'penOnly', 'grid', 'customGrid', 'gridW', 'gridH',
      'hideGrids', 'tile', 'dither', 'shade', 'showGrads', 'gradType', 'gradAngle', 'gradSteps', 'gradDither', 'gradBlend'];
    const o = { undoMB: Math.round(NPR.history.limit / 1048576) };
    for (const k of keep) o[k] = S[k];
    try { localStorage.setItem(SETTINGS, JSON.stringify(o)); } catch (e) { /* хранилище недоступно */ }
  }
  NPR.saveSettings = saveSettings;
  function setTile(mode) { S.tile = mode; V.redraw(); saveSettings(); }
  function loadSettings() {
    try {
      const o = JSON.parse(localStorage.getItem(SETTINGS)) || {};
      if (o.undoMB) NPR.history.limit = U.clamp(o.undoMB, 8, 1024) * 1048576;
      for (const k in o) if (k in S && typeof o[k] === typeof S[k]) S[k] = o[k];
    } catch (e) { /* настройки по умолчанию */ }
  }

  /* ---------- действия меню ---------- */
  const sizeCheck = (v) => {
    const w = v.width, h = v.height;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) return { error: 'Размер должен быть целым числом от 1' };
    if (w > O.MAX || h > O.MAX) return { error: `Максимальный размер — ${O.MAX}×${O.MAX}` };
    if (w > O.WARN || h > O.WARN) return { warn: `Холст больше ${O.WARN} px: на слабом ноутбуке возможны задержки, один слой займёт ${U.fmtBytes(w * h * 4)}.` };
    return null;
  };

  A.newDoc = async function () {
    const v = await NPR.dialog({
      title: 'Новый холст', okLabel: 'Создать', check: sizeCheck,
      fields: [
        { id: 'name', label: 'Название', value: 'Без названия' },
        { id: 'width', label: 'Ширина, px', type: 'number', value: NPR.doc ? NPR.doc.width : 32, min: 1, max: O.MAX },
        { id: 'height', label: 'Высота, px', type: 'number', value: NPR.doc ? NPR.doc.height : 32, min: 1, max: O.MAX },
        { type: 'note', label: 'Текущий холст будет закрыт. Сохраните проект, если он ещё нужен.' },
      ],
    });
    if (!v) return;
    const doc = new NPR.Doc(v.width, v.height);
    doc.name = v.name.trim() || 'Без названия';
    await NPR.io.saveNow();
    NPR.setDoc(doc);
  };
  A.open = () => NPR.io.pickAndOpen();

  /* Список проектов, сохранённых в браузере. */
  A.projects = async function () {
    const list = await NPR.io.listProjects();
    const box = el('ul', { class: 'projects' });
    const fill = () => {
      box.replaceChildren(...list.map((p) => {
        const open = el('button', { type: 'button', class: 'primary' }, 'Открыть');
        const del = el('button', { type: 'button' }, 'Удалить');
        open.addEventListener('click', async () => {
          try {
            await NPR.io.saveNow();
            NPR.setDoc(await NPR.io.loadProject(p.id));
            box.closest('dialog').close();
          } catch (e) { NPR.toast('Не удалось открыть проект: ' + e.message, true); }
        });
        del.addEventListener('click', async () => {
          if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'Точно удалить?'; return; }
          await NPR.io.deleteProject(p.id);
          list.splice(list.indexOf(p), 1);
          fill();
        });
        const current = p.id === NPR.doc.pid;
        return el('li', null,
          el('img', { src: p.thumb, alt: '', width: 40, height: 40 }),
          el('div', { class: 'info' },
            el('strong', null, p.name + (current ? ' (открыт)' : '')),
            el('span', null, `${p.width}×${p.height}, ${new Date(p.updated).toLocaleString('ru')}`)),
          current ? null : open, del);
      }));
      if (!list.length) box.append(el('li', { class: 'empty' }, 'Пока пусто. Проект появится здесь, как только вы начнёте рисовать.'));
    };
    fill();
    NPR.dialog({
      title: 'Мои проекты', okLabel: 'Закрыть', noCancel: true,
      fields: [{ type: 'node', node: box }, { type: 'note', label: 'Проекты хранятся в этом браузере. Для резервной копии сохраняйте файл .npr.' }],
    });
  };
  A.replaceColor = async function () {
    const v = await NPR.dialog({
      title: 'Заменить цвет', okLabel: 'Заменить',
      fields: [
        { id: 'from', label: 'Какой цвет (hex)', value: U.toHex(S.primary, true) },
        { id: 'to', label: 'На какой (hex)', value: U.toHex(S.secondary, true) },
        { id: 'all', label: 'На всех слоях', type: 'checkbox', value: false },
        { type: 'note', label: 'По умолчанию: основной цвет меняется на вторичный. Если есть выделение, замена идёт только внутри него. Чтобы стереть цвет, укажите #00000000.' },
      ],
      check: (x) => (U.parseHex(x.from) === null || U.parseHex(x.to) === null ? { error: 'Цвет записывается как #rrggbb или #rrggbbaa' } : null),
    });
    if (!v) return;
    const to = U.parseHex(v.to), n = O.replaceColor(U.parseHex(v.from), to >>> 24 === 0 ? 0 : to, v.all);
    NPR.toast(n ? `Заменено пикселей: ${n}` : 'Такого цвета здесь нет');
  };
  A.importLayer = async () => NPR.io.importLayer(await U.pickFile('image/*'));
  A.rename = async function () {
    const v = await NPR.dialog({ title: 'Название проекта', okLabel: 'Переименовать', fields: [{ id: 'name', label: 'Название', value: NPR.doc.name }] });
    if (v && v.name.trim()) { NPR.doc.name = v.name.trim(); title(); NPR.emit('docChanged'); }
  };
  A.exportPNG = async function () {
    const doc = NPR.doc;
    const v = await NPR.dialog({
      title: 'Экспорт PNG', okLabel: 'Экспортировать',
      fields: [
        { id: 'scale', label: 'Масштаб', type: 'select', value: 1, options: [1, 2, 3, 4, 6, 8, 10, 16].map((n) => [n, `×${n}  (${doc.width * n}×${doc.height * n})`]) },
        { id: 'what', label: 'Что сохранить', type: 'select', value: 'all', options: [['all', 'Все видимые слои'], ['layer', 'Только активный слой'], ...(doc.sel ? [['selection', 'Только выделение']] : [])] },
      ],
      check: (x) => (Math.max(doc.width, doc.height) * x.scale > 8192 ? { error: 'Итоговая картинка больше 8192 px. Выберите меньший масштаб.' } : null),
    });
    if (v) NPR.io.exportPNG(+v.scale, v.what);
  };
  A.canvasSize = async function () {
    const d = NPR.doc;
    const v = await NPR.dialog({
      title: 'Размер холста', okLabel: 'Изменить', check: sizeCheck,
      fields: [
        { id: 'width', label: 'Ширина, px', type: 'number', value: d.width, min: 1, max: O.MAX },
        { id: 'height', label: 'Высота, px', type: 'number', value: d.height, min: 1, max: O.MAX },
        { id: 'anchor', label: 'Куда прижать рисунок', type: 'anchor', value: '0.5,0.5' },
        { type: 'note', label: 'Рисунок не растягивается: холст расширяется или обрезается.' },
      ],
    });
    if (!v) return;
    const [ax, ay] = v.anchor.split(',').map(Number);
    O.resizeCanvas(v.width, v.height, ax, ay);
  };
  A.scale = async function () {
    const d = NPR.doc;
    const v = await NPR.dialog({
      title: 'Масштабировать изображение', okLabel: 'Масштабировать', check: sizeCheck,
      fields: [
        { id: 'width', label: 'Ширина, px', type: 'number', value: d.width * 2, min: 1, max: O.MAX },
        { id: 'height', label: 'Высота, px', type: 'number', value: d.height * 2, min: 1, max: O.MAX },
        { type: 'note', label: 'Без размытия (ближайший сосед). Чистый результат дают целые кратные: ×2, ×3, ÷2.' },
      ],
    });
    if (v) O.scaleImage(v.width, v.height);
  };
  A.customGrid = async function () {
    const v = await NPR.dialog({
      title: 'Своя сетка', okLabel: 'Применить',
      fields: [
        { id: 'on', label: 'Показывать сетку', type: 'checkbox', value: true },
        { id: 'w', label: 'Ширина ячейки, px', type: 'number', value: S.gridW, min: 1 },
        { id: 'h', label: 'Высота ячейки, px', type: 'number', value: S.gridH, min: 1 },
      ],
      check: (x) => (x.w >= 1 && x.h >= 1 && Number.isInteger(x.w) && Number.isInteger(x.h) ? null : { error: 'Размер ячейки — целое число от 1' }),
    });
    if (!v) return;
    S.customGrid = v.on; S.gridW = v.w; S.gridH = v.h;
    V.redraw(); saveSettings();
  };
  A.settings = async function () {
    const v = await NPR.dialog({
      title: 'Настройки', okLabel: 'Сохранить',
      fields: [
        { id: 'mb', label: 'Память под историю отмены', type: 'select', value: Math.round(NPR.history.limit / 1048576), options: [16, 32, 64, 128, 256, 512].map((n) => [n, n + ' МБ']) },
        { type: 'note', label: `Сейчас занято ${U.fmtBytes(NPR.history.bytes)}. Когда лимит превышен, самые старые шаги удаляются.` },
      ],
    });
    if (!v) return;
    NPR.history.limit = +v.mb * 1048576;
    NPR.history.trim();
    saveSettings(); NPR.status.update();
  };
  A.outline = async function () {
    const v = await NPR.dialog({
      title: 'Обводка', okLabel: 'Обвести',
      fields: [
        { id: 'color', label: 'Цвет (hex)', value: U.toHex(S.primary, true) },
        { id: 'where', label: 'Где', type: 'select', value: 'out', options: [['out', 'снаружи объекта'], ['in', 'по краю внутри объекта']] },
        { id: 'diag', label: 'Закрывать и углы (по диагонали)', type: 'checkbox', value: false },
        { type: 'note', label: 'Обводится всё закрашенное на активном слое. Если есть выделение — только внутри него.' },
      ],
      check: (x) => (U.parseHex(x.color) === null ? { error: 'Цвет записывается как #rrggbb или #rrggbbaa' } : null),
    });
    if (!v) return;
    const n = O.outline(U.parseHex(v.color), v.where === 'in', v.diag);
    NPR.toast(n ? `Обведено пикселей: ${n}` : 'Обводить нечего');
  };
  /* Настройка клавиш: щёлкнуть по действию и нажать новую клавишу. */
  A.hotkeys = function () {
    const I = NPR.input, box = el('ul', { class: 'keys' });
    let waiting = null;
    const paint = () => box.replaceChildren(...Object.keys(I.actions).map((id) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(waiting === id) }, waiting === id ? 'нажмите клавишу…' : I.keyOf(id) || '—');
      b.addEventListener('click', () => { waiting = waiting === id ? null : id; paint(); });
      return el('li', null, el('span', null, I.actions[id].label), b);
    }));
    const onKey = (e) => {
      if (!waiting) return;
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'Escape') { waiting = null; return paint(); }
      if (I.RESERVED.includes(e.code)) return NPR.toast('Эта клавиша занята самим редактором');
      I.setKey(waiting, e.code);
      waiting = null; paint();
    };
    const reset = el('button', { type: 'button' }, 'Вернуть стандартные');
    reset.addEventListener('click', () => { I.resetKeys(); waiting = null; paint(); });
    paint();
    document.addEventListener('keydown', onKey, true);
    NPR.dialog({
      title: 'Настройка клавиш', okLabel: 'Готово', noCancel: true,
      fields: [{ type: 'node', node: box }, { type: 'node', node: reset },
        { type: 'note', label: 'Клавиши привязаны к месту на клавиатуре и работают в любой раскладке. Сочетания с Ctrl (отмена, копирование, сохранение) не меняются.' }],
    }).then(() => document.removeEventListener('keydown', onKey, true));
  };
  A.guide = function () {
    const sec = (title, lines) => [{ type: 'node', node: el('h3', { class: 'guide' }, title) }, ...lines.map((t) => ({ type: 'note', label: t }))];
    NPR.dialog({
      title: 'Свои кисти и текстуры', okLabel: 'Понятно', noCancel: true,
      fields: [
        ...sec('Кисть', [
          '1. Нарисуйте форму кисти на холсте: точку, крест, листик, что угодно. Размер — до 64×64.',
          '2. Обведите её любым выделением (M, лассо Q или палочка W).',
          '3. «Правка → Сделать кисть из выделения». Дайте название.',
          '4. Галочка «своими цветами»: без неё кисть берёт только форму и красит текущим цветом; с ней переносит свои цвета, как штамп.',
          '5. Кисть появится в списке «Форма» у карандаша, ластика, линии и фигур. Удалить её можно кнопкой ⋯ рядом со списком.',
        ]),
        ...sec('Текстура', [
          '1. Откройте «Свет и текстура» (T).',
          '2. «Из файла…» — любая картинка, или «Из холста» — то, что нарисовано (или выделенный кусок).',
          '3. Картинка станет чёрно-белой: серое не меняет цвет, светлое осветляет, тёмное затемняет.',
          '4. Галочка «Сделать бесшовной» убирает стыки при повторении плиткой.',
          '5. «Случайная» придумывает новую бесшовную текстуру при каждом нажатии; понравилась — «Оставить».',
          'Совет: рисуйте текстуру оттенками серого на холсте 16×16 или 32×32 в режиме «Вид → Копии вокруг (3×3)» — так сразу видно, как она стыкуется.',
        ]),
      ],
    });
  };
  A.keys = function () {
    NPR.dialog({
      title: 'Горячие клавиши', okLabel: 'Понятно',
      fields: [
        'B карандаш · E ластик · G заливка · I пипетка · L линия',
        'U прямоугольник · O эллипс · M выделение · Q лассо · W палочка',
        'D градиент · T свет и текстура · R референсы · V перемещение · H рука',
        'Спрайтшит: запятая и точка — предыдущий и следующий кадр',
        'С выделением: Shift — добавить, Alt — вычесть',
        'Градиент: протяжка задаёт направление, Shift — шаг 15°, Enter — применить',
        'Alt — пипетка на время · Shift+клик карандашом — прямая от прошлой точки',
        'Shift с фигурами — квадрат, круг, ровные углы линии',
        'X — поменять цвета · [ и ] — размер кисти · ПКМ — вторым цветом',
        'Колесо — зум · Пробел или средняя кнопка — пан · 0 — вписать · 1 — 100%',
        'Ctrl+Z / Ctrl+Y — отмена и повтор · Ctrl+C/X/V · Ctrl+A · Ctrl+D · Delete',
        'Стрелки — сдвиг выделенного на 1 px · Enter — закрепить · Esc — отменить',
        'Ctrl+S сохранить · Ctrl+O открыть · Ctrl+E экспорт · Shift+G сетки · Tab панель',
        'Ctrl+Shift+S сохранить как · Ctrl+Shift+I инвертировать выделение',
        'Пальцами: щипок — зум, два пальца — пан, тап двумя — отмена, тремя — повтор',
        'Долгое нажатие пальцем — пипетка',
      ].map((t) => ({ type: 'note', label: t })),
    });
  };

  const MENUS = {
    file: () => [
      { label: 'Новый холст…', action: A.newDoc },
      { label: 'Мои проекты…', action: A.projects },
      { label: 'Открыть проект или картинку…', key: 'Ctrl+O', action: A.open },
      { label: 'Импорт картинки как слоя…', action: A.importLayer },
      { label: 'Добавить референс…', action: NPR.refs.pick },
      '-',
      { label: 'Сохранить проект (.npr)', key: 'Ctrl+S', action: () => NPR.io.saveProject() },
      { label: 'Сохранить как…', key: 'Ctrl+Shift+S', action: () => NPR.io.saveProject(true) },
      { label: 'Экспорт PNG…', key: 'Ctrl+E', action: A.exportPNG },
      { label: 'Экспорт спрайтшита…', action: NPR.frames.exportDialog },
      { label: 'Переименовать проект…', action: A.rename },
      '-',
      { label: 'Настройки…', action: A.settings },
    ],
    edit: () => [
      { label: 'Отменить', key: 'Ctrl+Z', disabled: !NPR.history.undoStack.length && !NPR.doc.float, action: NPR.undo },
      { label: 'Повторить', key: 'Ctrl+Y', disabled: !NPR.history.redoStack.length, action: NPR.redo },
      '-',
      { label: 'Вырезать', key: 'Ctrl+X', action: E.cut },
      { label: 'Копировать', key: 'Ctrl+C', action: E.copy },
      { label: 'Вставить', key: 'Ctrl+V', disabled: !E.clipboard, action: () => E.paste() },
      { label: 'Удалить', key: 'Delete', action: E.del },
      '-',
      { label: 'Выделить всё', key: 'Ctrl+A', action: E.selectAll },
      { label: 'Сделать кисть из выделения…', action: NPR.brushes.fromSelection },
      { label: 'Снять выделение', key: 'Ctrl+D', disabled: !NPR.doc.sel, action: E.deselect },
      { label: 'Инвертировать выделение', key: 'Ctrl+Shift+I', action: E.invert },
    ],
    image: () => [
      { label: 'Размер холста…', action: A.canvasSize },
      { label: 'Масштабировать изображение…', action: A.scale },
      { label: 'Обрезать по выделению', disabled: !NPR.doc.sel, action: O.cropToSelection },
      { label: 'Заменить цвет…', action: A.replaceColor },
      { label: 'Обводка…', action: A.outline },
      '-',
      { label: 'Отразить по горизонтали', action: () => E.flip(true) },
      { label: 'Отразить по вертикали', action: () => E.flip(false) },
      { label: 'Повернуть на 90° по часовой', action: () => E.rotate(true) },
      { label: 'Повернуть на 90° против часовой', action: () => E.rotate(false) },
      { label: 'Повернуть на угол…', action: E.rotateDialog },
    ],
    view: () => [
      { label: 'Вписать в окно', key: '0', action: V.fit },
      { label: 'Масштаб 100%', key: '1', action: () => V.setZoom(1) },
      { label: 'Приблизить', key: '+', action: () => V.zoomStep(1) },
      { label: 'Отдалить', key: '−', action: () => V.zoomStep(-1) },
      '-',
      { label: 'Показывать сетки', key: 'Shift+G', checked: !S.hideGrids, action: () => NPR.toggle('hideGrids') },
      { label: 'Пиксельная сетка', checked: S.grid, action: () => NPR.toggle('grid') },
      { label: 'Своя сетка', checked: S.customGrid, action: () => NPR.toggle('customGrid') },
      { label: 'Размер своей сетки…', action: A.customGrid },
      '-',
      { label: 'Без копии холста', checked: S.tile === 'off', action: () => setTile('off') },
      { label: 'Копия справа', checked: S.tile === 'right', action: () => setTile('right') },
      { label: 'Копия снизу', checked: S.tile === 'down', action: () => setTile('down') },
      { label: 'Копии вокруг (3×3)', checked: S.tile === 'all', action: () => setTile('all') },
      '-',
      { label: 'Панель градиентов', checked: S.showGrads, action: () => NPR.toggle('grads') },
      '-',
      { label: 'Рисовать только пером (пальцы двигают холст)', checked: S.penOnly, action: () => NPR.toggle('penOnly') },
      { label: 'Правая панель', key: 'Tab', checked: !document.body.classList.contains('no-side'), action: () => NPR.toggle('side') },
      { label: 'Настроить клавиши…', action: A.hotkeys },
      { label: 'Все сочетания клавиш', action: A.keys },
      { label: 'Как сделать свои кисти и текстуры', action: A.guide },
      { label: 'Блэкджек', action: NPR.blackjack },
    ],
  };

  /* ---------- строка состояния ---------- */
  let flashTimer = 0, lastPos = null;
  NPR.status = {
    extra: '',
    update(p) {
      if (p) lastPos = p;
      const d = NPR.doc, H = NPR.history;
      if (!d) return;
      const inDoc = lastPos && lastPos.x >= 0 && lastPos.y >= 0 && lastPos.x < d.width && lastPos.y < d.height;
      $('stPos').textContent = inDoc ? `${lastPos.x}, ${lastPos.y}` : '—';
      $('stSel').textContent = this.extra || (d.sel ? `выделено ${d.sel.w}×${d.sel.h}` : '');
      $('stZoom').textContent = Math.round(V.zoom * 100) + '%';
      $('stHist').textContent = `история: ${H.undoStack.length} шаг. · ${U.fmtBytes(H.bytes)} из ${Math.round(H.limit / 1048576)} МБ`;
    },
    flash(msg) {
      $('stMsg').textContent = msg;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { $('stMsg').textContent = ''; }, 2500);
    },
  };

  /* ---------- запуск ---------- */
  async function start() {
    loadSettings();

    const tb = $('toolbar');
    for (const [name, label, key, icon] of TOOLS) {
      const b = el('button', { type: 'button', 'data-tool': name, 'data-label': label, title: label, 'aria-label': label, 'aria-pressed': 'false', html: NPR.svgIcon(icon) });
      b.addEventListener('click', () => NPR.setTool(name));
      tb.append(b);
    }
    for (const b of document.querySelectorAll('[data-menu]'))
      b.addEventListener('click', () => NPR.popup(b, MENUS[b.dataset.menu]()));

    $('brushSize').addEventListener('input', (e) => { if (e.target.value !== '') NPR.setBrushSize(+e.target.value); saveSettings(); });
    $('optShape').addEventListener('change', (e) => { S.brushShape = e.target.value; NPR.brushes.render(); saveSettings(); });
    $('optBrushMenu').addEventListener('click', (e) => NPR.brushes.menu(e.currentTarget));
    $('optShade').addEventListener('change', (e) => { S.shade = e.target.checked; saveSettings(); });
    $('optDither').addEventListener('change', (e) => { S.dither = +e.target.value; saveSettings(); });
    const keyTitles = () => { for (const b of tb.children) { const k = NPR.input.keyOf('tool:' + b.dataset.tool); b.title = k ? `${b.dataset.label} (${k})` : b.dataset.label; } };
    NPR.on('keys', keyTitles);
    keyTitles();
    $('optPP').addEventListener('change', (e) => { S.pixelPerfect = e.target.checked; saveSettings(); });
    $('optFilled').addEventListener('change', (e) => { S.filled = e.target.checked; saveSettings(); });
    $('optContig').addEventListener('change', (e) => { S.contiguous = e.target.checked; saveSettings(); });
    $('optAll').addEventListener('change', (e) => { S.sampleAll = e.target.checked; saveSettings(); });
    $('optTol').addEventListener('input', (e) => { S.tolerance = U.clamp(Math.round(+e.target.value) || 0, 0, 255); saveSettings(); });
    $('optSymX').addEventListener('click', () => NPR.toggle('symX'));
    $('optSymY').addEventListener('click', () => NPR.toggle('symY'));
    $('btnUndo').addEventListener('click', NPR.undo);
    $('btnRedo').addEventListener('click', NPR.redo);
    $('btnSide').addEventListener('click', () => NPR.toggle('side'));
    $('btnGrid').addEventListener('click', () => NPR.toggle('hideGrids'));
    $('btnGrads').addEventListener('click', () => NPR.toggle('grads'));
    // разделы правой панели сворачиваются щелчком по заголовку
    let folded = [];
    try { folded = JSON.parse(localStorage.getItem('npr.folded')) || []; } catch (e) { /* всё развёрнуто */ }
    for (const sec of document.querySelectorAll('#side section')) {
      sec.classList.toggle('collapsed', folded.includes(sec.dataset.key));
      const h = sec.querySelector('h2');
      h.title = 'Свернуть или развернуть';
      h.addEventListener('click', () => {
        sec.classList.toggle('collapsed');
        const now = [...document.querySelectorAll('#side section.collapsed')].map((x) => x.dataset.key);
        try { localStorage.setItem('npr.folded', JSON.stringify(now)); } catch (e) { /* не страшно */ }
        V.needPrev = true;
      });
    }
    $('docTitle').addEventListener('click', A.rename);

    NPR.palette.init();
    NPR.color.init();
    NPR.gradient.init();
    NPR.refs.init();
    NPR.brushes.init();
    NPR.roblox.init();
    NPR.frames.init();
    NPR.fx.init();
    NPR.layersUI.init();
    V.init($('cMain'), $('cOver'), $('cPreview'));
    NPR.input.init($('cOver'));

    NPR.on('docChanged', () => { NPR.doc.touched = true; NPR.io.scheduleAutosave(); NPR.status.update(); });
    NPR.on('history', () => {
      $('btnUndo').disabled = !NPR.history.undoStack.length;
      $('btnRedo').disabled = !NPR.history.redoStack.length;
      NPR.status.update();
    });
    NPR.on('resized', () => { V.fit(); title(); });
    NPR.on('view', () => NPR.status.update());
    NPR.on('sel', () => NPR.status.update());

    const restored = await NPR.io.restore();
    NPR.setDoc(restored || new NPR.Doc(32, 32));
    if (restored) NPR.status.flash('Восстановлен последний холст');
    if (window.innerWidth < 760) document.body.classList.add('no-side');
    syncOptions();
    NPR.setTool('pencil');
    NPR.emit('history');
    // Установка как приложения и работа без сети: только когда редактор открыт с сайта (http/https)
    if (/^https?:$/.test(location.protocol)) {
      document.head.append(el('link', { rel: 'manifest', href: 'manifest.webmanifest' }));
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    // последняя попытка сохранить при закрытии вкладки
    document.addEventListener('visibilitychange', () => { if (document.hidden) NPR.io.autosave(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.NPR);
