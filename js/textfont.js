'use strict';
/* Шрифты для текста.

   Встроенные шрифты рисуются «пером» по скелету букв. Скелет — это линии
   и дуги в сетке высотой 10 (0 — верх заглавной, 10 — базовая линия).
   Стиль решает, каким пером обвести скелет:
     inscription — широкое перо под углом, контраст толщин и клиновидные засечки
                   (вырезанные в камне буквы: Скайрим, «Властелин колец»);
     gothic      — широкое перо круче, ломаные дуги, узкие буквы (готика);
     rock        — толстая ровная линия, наклон и острые шипы на концах (метал);
     plain       — ровная линия без засечек;
     pixel       — линия в 1 пиксель, для мелкого текста;
     carved      — «Резьба»: грубые буквы, будто вырезанные резцом, с острыми
                   расклешёнными концами, длинными тонкими перекладинами,
                   уходящими на соседние буквы, и настоящими строчными.
   Строчные буквы рисуются капителью (уменьшенными заглавными), как в Trajan.
   Есть латиница, кириллица, цифры и основные знаки.

   Кроме встроенных — любые шрифты системы и свои файлы .ttf/.otf/.woff:
   они растеризуются браузером, а края по умолчанию делаются чёткими. */
(function (NPR) {
  const U = NPR.util;
  const TF = (NPR.textfont = {});

  /* ---------- скелеты букв: [ширина, путь] ----------
     Команды пути: M x y — начать линию; L x y — отрезок; Q cx cy x y — кривая;
     E cx cy rx ry a0 a1 — дуга эллипса от угла a0 до a1 (0° — вправо, 90° — вниз);
     H x1 y x2 [xm] — длинная тонкая перекладина, заострённая с обоих концов (толще всего в xm);
     S x y r — четырёхлучевой блик-звезда. */
  const G = {
    A: [9, 'M0.5 10 L4.5 0 L8.5 10 M2.1 6.2 L6.9 6.2'],
    B: [7, 'M1 0 L1 10 M1 0 L4.2 0 E4.2 2.4 2.4 2.4 -90 90 M1 4.8 L4.5 4.8 E4.5 7.4 2.6 2.6 -90 90 L1 10'],
    C: [9, 'E5 5 4.5 5 -40 -320'],
    D: [9, 'M1 0 L1 10 M1 0 L3.5 0 E3.5 5 5 5 -90 90 L1 10'],
    E: [6.5, 'M1 0 L1 10 M1 0 L6 0 M1 4.8 L5 4.8 M1 10 L6.3 10'],
    F: [6, 'M1 0 L1 10 M1 0 L6 0 M1 4.8 L5 4.8'],
    G: [9.5, 'E5 5 4.5 5 -40 -340 M9.2 5.6 L9.2 9.4 M6.2 5.6 L9.2 5.6'],
    H: [8, 'M1 0 L1 10 M7 0 L7 10 M1 5 L7 5'],
    I: [2, 'M1 0 L1 10'],
    J: [4.5, 'M3.5 0 L3.5 7.5 E1.5 7.5 2 2.5 0 140'],
    K: [7.5, 'M1 0 L1 10 M7 0 L1.2 5.6 M3.4 3.5 L7.4 10'],
    L: [6.2, 'M1 0 L1 10 L6 10'],
    M: [10.5, 'M1 10 L1.6 0 L5.25 10 L8.9 0 L9.5 10'],
    N: [8.5, 'M1 10 L1 0 L7.5 10 L7.5 0'],
    O: [9.6, 'E4.8 5 4.3 5 0 360'],
    P: [7, 'M1 10 L1 0 L4 0 E4 2.7 2.7 2.7 -90 90 L1 5.4'],
    Q: [9.6, 'E4.8 5 4.3 5 0 360 M5.2 9.4 L9.4 11.2'],
    R: [7.5, 'M1 10 L1 0 L4 0 E4 2.6 2.6 2.6 -90 90 L1 5.2 M3.6 5.2 L7.4 10'],
    S: [6.5, 'M5.8 1.2 Q4.6 0 3.2 0 Q0.8 0 0.8 2.5 Q0.8 4.4 3.2 5 Q5.8 5.6 5.8 7.6 Q5.8 10 3.2 10 Q1.4 10 0.6 8.7'],
    T: [8, 'M0.2 0 L7.8 0 M4 0 L4 10'],
    U: [8.5, 'M1 0 L1 6.5 E4.25 6.5 3.25 3.5 180 0 L7.5 0'],
    V: [8.5, 'M0.3 0 L4.25 10 L8.2 0'],
    W: [12, 'M0.2 0 L3.1 10 L6 0 L8.9 10 L11.8 0'],
    X: [8, 'M0.5 0 L7.5 10 M7.5 0 L0.5 10'],
    Y: [8, 'M0.3 0 L4 5.2 L7.7 0 M4 5.2 L4 10'],
    Z: [7.5, 'M0.8 0 L6.8 0 L0.6 10 L7 10'],
    0: [7, 'E3.5 5 3 5 0 360'],
    1: [4, 'M0.6 2 L2.6 0 L2.6 10'],
    2: [6.5, 'M0.7 2.2 Q1.2 0 3.3 0 Q5.8 0 5.8 2.6 Q5.8 4.6 3.6 6.4 L0.6 10 L6.2 10'],
    3: [6.5, 'M0.8 1 Q1.8 0 3.2 0 Q5.6 0 5.6 2.4 Q5.6 4.6 2.8 4.8 Q5.9 5 5.9 7.4 Q5.9 10 3.1 10 Q1.4 10 0.5 8.9'],
    4: [7, 'M4.8 10 L4.8 0 L0.4 7 L6.6 7'],
    5: [6.5, 'M5.8 0 L1.4 0 L1 4.3 Q2 3.8 3.3 3.8 Q5.9 3.8 5.9 6.9 Q5.9 10 3.1 10 Q1.4 10 0.5 8.9'],
    6: [6.5, 'M5.3 0.6 Q4.5 0 3.5 0 Q0.7 0 0.7 5.5 Q0.7 10 3.3 10 Q5.9 10 5.9 7.2 Q5.9 4.4 3.3 4.4 Q1.6 4.4 0.8 5.8'],
    7: [6.5, 'M0.5 0 L6 0 L2.4 10'],
    8: [6.5, 'E3.25 2.45 2.3 2.45 0 360 E3.25 7.45 2.75 2.55 -90 270'],
    9: [6.5, 'M1.2 9.4 Q2 10 3 10 Q5.8 10 5.8 4.5 Q5.8 0 3.2 0 Q0.6 0 0.6 2.8 Q0.6 5.6 3.2 5.6 Q4.9 5.6 5.7 4.2'],
    '.': [2, 'M1 9.5 L1 10'],
    ',': [2, 'M1.2 9.4 L1.2 10 L0.5 11.4'],
    '!': [2, 'M1 0 L1 7 M1 9.5 L1 10'],
    '?': [6, 'M0.7 2 Q1.2 0 3 0 Q5.4 0 5.4 2.4 Q5.4 4.2 3.2 5.2 L3.2 7 M3.2 9.5 L3.2 10'],
    '-': [5, 'M0.8 6 L4.2 6'],
    '–': [7, 'M0.5 6 L6.5 6'],
    '—': [10, 'M0.5 6 L9.5 6'],
    ':': [2, 'M1 3.5 L1 4 M1 9.5 L1 10'],
    ';': [2, 'M1 3.5 L1 4 M1.2 9.4 L1.2 10 L0.5 11.4'],
    "'": [2, 'M1 0 L1 2.8'],
    '"': [3.5, 'M1 0 L1 2.8 M2.5 0 L2.5 2.8'],
    '(': [3.5, 'E4.5 5 3.6 6.4 -125 -235'],
    ')': [3.5, 'E-1 5 3.6 6.4 -55 55'],
    '/': [5, 'M4.5 -0.5 L0.5 10.5'],
    '+': [6, 'M3 2.5 L3 8.5 M0 5.5 L6 5.5'],
    '=': [6, 'M0.3 4 L5.7 4 M0.3 7 L5.7 7'],
    '&': [7.5, 'M7 10 L2 3.5 Q1.2 2.4 1.6 1.2 Q2.2 0 3.4 0 Q4.8 0 4.9 1.3 Q5 2.7 3 4 L1.4 5.2 Q0.4 6 0.4 7.4 Q0.4 10 3 10 Q5 10 6.6 6.8'],
    '«': [5, 'M2.4 3.2 L0.4 5.6 L2.4 8 M4.6 3.2 L2.6 5.6 L4.6 8'],
    '»': [5, 'M0.4 3.2 L2.4 5.6 L0.4 8 M2.6 3.2 L4.6 5.6 L2.6 8'],
    '№': [11, 'M1 10 L1 0 L7.5 10 L7.5 0 E9.6 3 1.2 1.6 0 360 M8.4 6 L10.8 6'],
    '*': [5, 'M2.5 0.5 L2.5 4.5 M0.6 1.4 L4.4 3.6 M4.4 1.4 L0.6 3.6'],
    '#': [7, 'M2.6 1 L1.6 9 M5.4 1 L4.4 9 M0.6 3.6 L6.6 3.6 M0.4 6.4 L6.4 6.4'],
    '%': [8, 'E2 2.2 1.5 2 0 360 M7 0.5 L1 9.5 E6 7.8 1.5 2 0 360'],
    // кириллица (совпадающие с латиницей буквы берутся из латиницы)
    'Б': [7, 'M6 0 L1 0 L1 10 L4.2 10 E4.2 7.3 2.7 2.7 90 -90 L1 4.6'],
    'Г': [6, 'M1 10 L1 0 L6 0'],
    'Д': [8.5, 'M0 12 L0 10 L8.4 10 L8.4 12 M0.8 10 Q2.6 6 2.8 0 L7 0 L7 10'],
    'Ж': [11, 'M5.5 0 L5.5 10 M0.3 0 L5.5 5 L0.3 10 M10.7 0 L5.5 5 L10.7 10'],
    'З': [6.5, 'M0.8 1 Q1.8 0 3.2 0 Q5.6 0 5.6 2.4 Q5.6 4.6 2.8 4.8 Q5.9 5 5.9 7.4 Q5.9 10 3.1 10 Q1.4 10 0.5 8.9'],
    'И': [8.5, 'M1 0 L1 10 L7.5 0 L7.5 10'],
    'Й': [8.5, 'M1 0 L1 10 L7.5 0 L7.5 10 M2.6 -2.6 Q4.25 -0.9 5.9 -2.6'],
    'Л': [8, 'M0.2 10 Q2.2 7 2.6 0 L7 0 L7 10'],
    'П': [8, 'M1 10 L1 0 L7 0 L7 10'],
    'У': [8, 'M0.3 0 L4.9 6 M7.7 0 L3.7 8.6 Q2.9 10 1.2 10'],
    'Ф': [9.5, 'M4.75 0 L4.75 10 E4.75 5 4.3 3 0 360'],
    'Ц': [8.5, 'M1 0 L1 10 L7.4 10 L7.4 0 M7.4 10 L8.4 10 L8.4 12'],
    'Ч': [7.5, 'M1 0 L1 3.5 Q1 5.8 3.8 5.8 L6.5 5.8 M6.5 0 L6.5 10'],
    'Ш': [11, 'M1 0 L1 10 L10 10 L10 0 M5.5 0 L5.5 10'],
    'Щ': [12, 'M1 0 L1 10 L10 10 L10 0 M5.5 0 L5.5 10 M10 10 L11 10 L11 12'],
    'Ъ': [8, 'M0.2 0 L2 0 L2 10 L4.8 10 E4.8 7.4 2.6 2.6 90 -90 L2 4.8'],
    'Ы': [10, 'M1 0 L1 10 L3.8 10 E3.8 7.4 2.6 2.6 90 -90 L1 4.8 M9 0 L9 10'],
    'Ь': [7, 'M1 0 L1 10 L3.8 10 E3.8 7.4 2.6 2.6 90 -90 L1 4.8'],
    'Э': [8.5, 'E3.5 5 4.5 5 -140 140 M3 5 L8 5'],
    'Ю': [11.5, 'M1 0 L1 10 M1 5 L3.8 5 E7.4 5 3.6 5 0 360'],
    'Я': [7.5, 'M6.5 10 L6.5 0 L3.5 0 E3.5 2.7 2.7 2.7 -90 -270 L6.5 5.4 M3.8 5.4 L0.4 10'],
    'Ё': [6.5, 'M1 0 L1 10 M1 0 L6 0 M1 4.8 L5 4.8 M1 10 L6.3 10 M2.3 -2.2 L2.3 -1.6 M4.7 -2.2 L4.7 -1.6'],
    'Є': [8.5, 'E5 5 4.5 5 -40 -320 M0.8 5 L5.6 5'],
    'І': [2, 'M1 0 L1 10'],
    'Ї': [4, 'M2 0 L2 10 M0.8 -2.2 L0.8 -1.6 M3.2 -2.2 L3.2 -1.6'],
    'Ґ': [6, 'M1 10 L1 0 L5.4 0 L5.4 -2'],
  };
  for (const [ru, en] of [['А', 'A'], ['В', 'B'], ['Е', 'E'], ['К', 'K'], ['М', 'M'], ['Н', 'H'], ['О', 'O'], ['Р', 'P'], ['С', 'C'], ['Т', 'T'], ['Х', 'X']]) G[ru] = G[en];
  /* Настоящие строчные для «Резьбы». Высота строчных: от 4 до 10, выносные — до 13.4. */
  const LOWER = {
    a: [6.4, 'M5.4 4 L5.4 10 E3 7 2.4 3 0 360'],
    b: [6.8, 'M1 0 L1 10 E3.4 7 2.4 3 180 540'],
    c: [6.2, 'E3.4 7 2.6 3 -50 -310'],
    d: [6.8, 'M5.8 0 L5.8 10 E3.4 7 2.4 3 0 360'],
    e: [6.6, 'M1 7 L5.8 7 E3.4 7 2.4 3 0 -320'],
    f: [5.2, 'M2 10 L2 2.4 Q2 0 4.2 0 Q5.4 0 5.8 0.8 H-1.8 3.3 7 2'],
    g: [6.6, 'M5.6 4 L5.6 11 Q5.6 13.4 3.2 13.4 Q1.4 13.4 0.6 12.3 E3.2 7 2.4 3 0 360'],
    h: [6.6, 'M1 0 L1 10 M1 6 Q2 4 3.6 4 Q5.6 4 5.6 6 L5.6 10'],
    i: [2.6, 'M1.3 3 L1.3 10'],
    j: [3.6, 'M2.4 2.2 L2.4 11.6 Q2.4 13.4 0.4 13.4'],
    k: [5.8, 'M1 0 L1 10 M5 4 L1.2 7.6 M2.6 6.4 L5.4 10'],
    l: [2.6, 'M1.3 0 L1.3 10'],
    m: [9.2, 'M1 4 L1 10 M1 6 Q1.8 4 3.2 4 Q4.6 4 4.6 6 L4.6 10 M4.6 6 Q5.4 4 6.8 4 Q8.2 4 8.2 6 L8.2 10'],
    n: [6.6, 'M1 4 L1 10 M1 6 Q2 4 3.6 4 Q5.6 4 5.6 6 L5.6 10'],
    o: [6.8, 'E3.4 7 2.4 3 0 360'],
    p: [6.8, 'M1 4 L1 13.4 E3.4 7 2.4 3 180 540'],
    q: [6.8, 'M5.8 4 L5.8 13.4 E3.4 7 2.4 3 0 360'],
    r: [5.6, 'M1 4 L1 10 M1 6.4 Q2 4 4 4 Q5 4 5.4 4.8'],
    s: [6, 'M5 4.8 Q4.2 4 3 4 Q1 4 1 5.5 Q1 6.8 3 7 Q5.2 7.2 5.2 8.6 Q5.2 10 3 10 Q1.6 10 0.8 9.2'],
    t: [5.2, 'M2.6 0.2 L2.6 10 H-5.5 3.1 10.7 2.6 S2.6 3.1 3.2'],
    u: [6.6, 'M1 4 L1 8 Q1 10 3.2 10 Q5.6 10 5.6 8 M5.6 4 L5.6 10'],
    v: [6.4, 'M0.6 4 L3.2 10 L5.8 4'],
    w: [8.8, 'M0.4 4 L2.4 10 L4.4 5 L6.4 10 L8.4 4'],
    x: [6, 'M0.8 4 L5.2 10 M5.2 4 L0.8 10'],
    y: [6.4, 'M0.6 4 L3.2 10 M5.8 4 L3 11.6 Q2.4 13.4 0.6 13.4'],
    z: [6.2, 'M1 4 L5.2 4 L0.8 10 L5.4 10'],
  };
  // точки у i и j
  LOWER.i = [2.6, 'M1.3 4 L1.3 10 M1.3 1.7 L1.3 2.3'];
  LOWER.j = [3.6, 'M2.4 4 L2.4 11.6 Q2.4 13.4 0.4 13.4 M2.4 1.7 L2.4 2.3'];
  /* Кириллические строчные. Похожие на латинские берутся оттуда; остальные, кроме
     особых (б, ф, ё, й, і, ї, є, ґ), — это уменьшенные заглавные, как в настоящих шрифтах. */
  for (const [ru, en] of [['а', 'a'], ['е', 'e'], ['о', 'o'], ['р', 'p'], ['с', 'c'], ['у', 'y'], ['х', 'x']]) LOWER[ru] = LOWER[en];
  Object.assign(LOWER, {
    'б': [6.8, 'M5.6 0.3 Q1.2 0.8 1 6.8 E3.4 7.2 2.4 2.8 0 360'],
    'ф': [7.6, 'M3.8 0 L3.8 13.4 E3.8 7 2.8 3 0 360'],
    'ё': [6.6, 'M1 7 L5.8 7 E3.4 7 2.4 3 0 -320 M2.2 1.8 L2.2 2.4 M4.6 1.8 L4.6 2.4'],
    'й': [6.6, 'M1 4 L1 10 L5.6 4 L5.6 10 M2 1.6 Q3.3 3 4.6 1.6'],
    'і': [2.6, 'M1.3 4 L1.3 10 M1.3 1.7 L1.3 2.3'],
    'ї': [3, 'M1.5 4 L1.5 10 M0.3 1.8 L0.3 2.4 M2.7 1.8 L2.7 2.4'],
    'є': [6.2, 'E3.6 7 2.6 3 -50 -310 M1 7 L4.2 7'],
    'ґ': [5.4, 'M1 10 L1 4 L4.6 4 L4.6 2.6'],
  });
  /* У «Резьбы» t и f с длинными тонкими перекладинами, у остальных — обычные. */
  const LOWER_PLAIN = {
    t: [5, 'M2.4 0.8 L2.4 8.4 Q2.4 10 4.4 10 M0.4 4 L4.6 4'],
    f: [5.2, 'M2 10 L2 2.4 Q2 0 4.2 0 Q5.4 0 5.8 0.8 M0.2 4 L4.6 4'],
  };
  /* Заглавные «Резьбы» с длинными перекладинами. */
  const CARVED = {
    I: [3, 'M1.5 0.6 L1.5 9.4 H-2.5 0.3 25 1.5 H-3 9.7 6 1.5'],
    T: [8, 'M4 0.6 L4 10 H-3 0.3 12 4 S4 0.3 2'],
    'Т': [8, 'M4 0.6 L4 10 H-3 0.3 12 4 S4 0.3 2'],
    'Г': [6.5, 'M1.5 0.6 L1.5 10 H-1.5 0.3 9 1.5'],
    'Ї': [3, 'M1.5 0.6 L1.5 9.4 H-2.5 0.3 9 1.5 H-2 9.7 5 1.5'],
    'І': [3, 'M1.5 0.6 L1.5 9.4 H-2.5 0.3 17 1.5 H-3 9.7 6 1.5'],
  };
  const NO_SERIF = new Set('.,;:!?\'"()«»-–—/+=&*#%№'.split(''));

  /* ---------- стили ---------- */
  const STYLES = {
    inscription: { name: 'Инскрипция — Скайрим, Властелин колец', nib: 1.75, nibAngle: -22, minW: 0.3, serif: 'flare', curve: 1, sx: 1, slant: 0, track: 2 },
    gothic: { name: 'Готика', nib: 2.5, nibAngle: -45, minW: 0.4, serif: 'foot', curve: 4, sx: 0.78, slant: 0, track: 0.9 },
    rock: { name: 'Рок / метал', mono: 1.8, serif: 'spike', curve: 4, sx: 0.95, slant: 0.2, track: 1.5, join: 'miter' },
    plain: { name: 'Простой', mono: 1.25, serif: null, curve: 1, sx: 0.9, slant: 0, track: 1.4, join: 'round' },
    pixel: { name: 'Пиксельный (линия 1 px)', pixel: true, curve: 1, sx: 0.9, slant: 0, track: 1.6 },
    carved: { name: 'Резьба — резной камень (мой)', nib: 2.0, nibAngle: -22, minW: 0.42, serif: 'blade', curve: 1, sx: 1, slant: 0, track: 1.9, lower: true, rough: true, desc: 4, glyphs: CARVED },
  };
  TF.STYLES = STYLES;
  const ASC = 3.2, DESC = 2.4, SPACE = 3.6; // запас над заглавной и под базовой линией, ширина пробела
  const SMALL_X = 0.8, SMALL_Y = 0.74; // капитель вместо строчных

  /* ---------- разбор пути в ломаные ---------- */
  const pathCache = new Map();
  function parse(path, curveStep) {
    const key = path + '|' + curveStep;
    if (pathCache.has(key)) return pathCache.get(key);
    const t = path.trim().split(/\s+|(?=[MLQEHS])|(?<=[MLQEHS])/).filter(Boolean), polys = [];
    polys.hairs = []; polys.stars = [];
    let cur = null, i = 0;
    const num = () => parseFloat(t[i++]);
    const start = (x, y) => { cur = [[x, y]]; polys.push(cur); };
    const last = () => cur[cur.length - 1];
    const segs = curveStep === 1 ? 10 : curveStep === 3 ? 30 : 45; // шаг дуги в градусах
    while (i < t.length) {
      const c = t[i++];
      if (c === 'M') start(num(), num());
      else if (c === 'L') cur.push([num(), num()]);
      else if (c === 'Q') {
        const [x0, y0] = last(), cx = num(), cy = num(), x = num(), y = num(), n = curveStep === 1 ? 8 : 3;
        for (let k = 1; k <= n; k++) { const u = k / n, v = 1 - u; cur.push([v * v * x0 + 2 * v * u * cx + u * u * x, v * v * y0 + 2 * v * u * cy + u * u * y]); }
      } else if (c === 'E') {
        const cx = num(), cy = num(), rx = num(), ry = num(), a0 = num(), a1 = num();
        const pt = (a) => [cx + rx * Math.cos((a * Math.PI) / 180), cy + ry * Math.sin((a * Math.PI) / 180)];
        const p0 = pt(a0);
        if (!cur || Math.hypot(last()[0] - p0[0], last()[1] - p0[1]) > 0.05) start(p0[0], p0[1]);
        const n = Math.max(2, Math.round(Math.abs(a1 - a0) / segs));
        for (let k = 1; k <= n; k++) cur.push(pt(a0 + ((a1 - a0) * k) / n));
      } else if (c === 'H') {
        const x1 = num(), y = num(), x2 = num();
        const xm = i < t.length && !/^[MLQEHS]$/.test(t[i]) ? num() : (x1 + x2) / 2;
        polys.hairs.push([x1, y, x2, xm]);
      } else if (c === 'S') polys.stars.push([num(), num(), num()]);
    }
    pathCache.set(key, polys);
    return polys;
  }
  const len = (p) => { let s = 0; for (let k = 1; k < p.length; k++) s += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); return s; };
  function distToSeg(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? U.clamp(((px - a[0]) * dx + (py - a[1]) * dy) / l2, 0, 1) : 0;
    return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
  }
  /* Свободные концы штрихов (там, где штрих ни к чему не примыкает) — для засечек и шипов. */
  function terminals(polys) {
    const out = [];
    polys.forEach((p, pi) => {
      if (p.length < 2 || len(p) < 1.6) return;
      const closed = Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 0.1;
      if (closed) return;
      for (const end of [0, 1]) {
        const E = end ? p[p.length - 1] : p[0], prev = end ? p[p.length - 2] : p[1];
        let near = false;
        polys.forEach((q, qi) => {
          for (let k = 1; k < q.length && !near; k++) {
            if (qi === pi && (end ? k >= q.length - 2 : k <= 2)) continue; // собственные соседние отрезки
            if (distToSeg(E[0], E[1], q[k - 1], q[k]) < 0.35) near = true;
          }
        });
        if (near) continue;
        const dx = E[0] - prev[0], dy = E[1] - prev[1], l = Math.hypot(dx, dy) || 1;
        out.push({ x: E[0], y: E[1], dx: dx / l, dy: dy / l });
      }
    });
    return out;
  }

  /* ---------- раскладка ---------- */
  /* Буква → контур. small — уменьшенная заглавная (капитель или кириллическая строчная);
     kx, ky — её масштаб: при настоящих строчных верх совпадает с высотой «x». */
  function glyphOf(ch, st) {
    const kx = st && st.lower ? 0.82 : SMALL_X, ky = st && st.lower ? 0.6 : SMALL_Y;
    if (st && st.lower) {
      const l = (!st.rough && LOWER_PLAIN[ch]) || LOWER[ch];
      if (l) return { w: l[0], path: l[1], small: false, noSerif: false, kx: 1, ky: 1 };
    }
    if (st && st.glyphs && st.glyphs[ch]) return { w: st.glyphs[ch][0], path: st.glyphs[ch][1], small: false, noSerif: false, kx: 1, ky: 1 };
    const up = ch.toUpperCase();
    if (st && st.glyphs && st.glyphs[up] && ch !== up) return { w: st.glyphs[up][0], path: st.glyphs[up][1], small: true, noSerif: false, kx, ky };
    const g = G[ch] || G[up];
    if (!g) return null;
    const small = ch !== up && !G[ch];
    return { w: g[0], path: g[1], small, noSerif: NO_SERIF.has(ch), kx: small ? kx : 1, ky: small ? ky : 1 };
  }

  /* ---------- кернинг ----------
     Оптический: у каждой буквы есть «профиль» — самая левая и самая правая точка
     контура в каждой полосе по высоте. Пара сдвигается так, чтобы самый узкий
     просвет между буквами был как у пары «HH». Так «AV», «To», «LT», «Г.» садятся плотнее. */
  const BANDS = 14, B0 = -1, BH = 1; // полосы по 1 единице от −1 до 13
  const profCache = new Map();
  function profile(ch, st) {
    const id = (st.rough ? 'r' : '') + (st.lower ? 'l' : '') + ch;
    let p = profCache.get(id);
    if (p) return p;
    const g = glyphOf(ch, st) || glyphOf('?', st), fx = st.sx * g.kx, ty = (y) => (g.small ? 10 - (10 - y) * g.ky : y);
    const L = new Float32Array(BANDS).fill(Infinity), Rr = new Float32Array(BANDS).fill(-Infinity);
    const add = (x, y) => { const b = Math.floor((y - B0) / BH); if (b < 0 || b >= BANDS) return; if (x < L[b]) L[b] = x; if (x > Rr[b]) Rr[b] = x; };
    for (const poly of parse(g.path, 1)) for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[Math.min(poly.length - 1, i + 1)];
      for (let t = 0; t <= 1; t += 0.2) add((x1 + (x2 - x1) * t) * fx, ty(y1 + (y2 - y1) * t));
    }
    p = { L, R: Rr, adv: g.w * fx };
    profCache.set(id, p);
    return p;
  }
  function rawGap(a, b) { // самый узкий просвет; Infinity, если буквы не стоят напротив друг друга
    let m = Infinity;
    for (let k = 0; k < BANDS; k++) {
      // соседние полосы тоже: наклонные штрихи (A и V) не должны проскакивать друг мимо друга
      for (let j = Math.max(0, k - 1); j <= Math.min(BANDS - 1, k + 1); j++) {
        if (a.R[k] === -Infinity || b.L[j] === Infinity) continue;
        m = Math.min(m, a.adv - a.R[k] + b.L[j]);
      }
    }
    return m;
  }
  function kernOf(a, b, st, strength) {
    if (!strength || a === ' ' || b === ' ') return 0;
    const ref = rawGap(profile('H', st), profile('H', st)), d = rawGap(profile(a, st), profile(b, st));
    if (!Number.isFinite(d)) return 0;
    return Math.max(-3.5, Math.min(1, (ref - d) * strength));
  }
  /* Ширина строки в единицах сетки. */
  function lineUnits(line, st, trackU) {
    let w = 0, prev = ' ';
    for (const ch of line) {
      if (ch === ' ') { w += SPACE + trackU; prev = ch; continue; }
      const g = glyphOf(ch, st) || glyphOf('?', st);
      w += kernOf(prev, ch, st, st.kern) + g.w * st.sx * g.kx + trackU;
      prev = ch;
    }
    return Math.max(0, w - trackU);
  }

  /* Встроенный шрифт → маска (0–255). opts: { style, size (высота заглавной, px), bold, spacing (px), line (%), align }.
     Возвращает { w, h, a: Uint8Array, ax, ay }: (ax, ay) — точка привязки (верх заглавной первой строки:
     левый край, центр или правый край — по выравниванию). */
  function renderBuiltin(text, o) {
    const base = STYLES[o.style] || STYLES.inscription, cap = Math.max(5, o.size | 0);
    // курсив — наклон; строчные — настоящие, если не выбрана капитель; кернинг — сила 0…1
    const st = { ...base, slant: base.slant + (o.italic ? 0.24 : 0), lower: base.lower || !o.smallCaps, kern: o.kern === undefined ? 0.5 : o.kern / 100 };
    const s = st.pixel ? (cap - 1) / 10 : cap / 10, trackU = st.track + (o.spacing || 0) / s;
    const desc = st.desc || DESC, lines = String(text).split('\n'), lineU = (10 + ASC + desc) * (o.line || 100) / 100;
    const widths = lines.map((l) => lineUnits(l, st, trackU)), maxU = Math.max(1, ...widths);
    const xStart = (li) => (o.align === 'center' ? (maxU - widths[li]) / 2 : o.align === 'right' ? maxU - widths[li] : 0);
    // длинные перекладины могут выходить далеко за край строки — меряем, сколько места им нужно
    let minX = 0, maxX = maxU;
    eachGlyph(lines, st, 1, trackU, lineU, xStart, 0, 0, (polys, map) => {
      for (const [x1, y, x2] of polys.hairs) for (const x of [x1, x2]) { const [X] = map(x, y); if (X < minX) minX = X; if (X > maxX) maxX = X; }
    });
    const padL = 3 + st.slant * 12 - minX, padR = 3 + st.slant * 12 + (maxX - maxU);
    const W = Math.ceil((maxU + padL + padR) * s) + 2, H = Math.ceil((lines.length * lineU + ASC + desc) * s) + 2;
    if (W * H > 16e6) throw new Error('Слишком большой текст');
    const originX = padL * s, originY = ASC * s;
    const ax = originX + (o.align === 'center' ? maxU / 2 : o.align === 'right' ? maxU : 0) * s, ay = originY;
    const boldK = o.bold ? 1.4 : 1;
    let a;
    if (st.pixel) a = drawPixel(lines, st, s, trackU, lineU, xStart, originX, originY, W, H, o.bold);
    else if (st.rough) {
      // перекладины и блики рисуются отдельно, чтобы неровный край их не рвал
      a = drawPen(lines, st, s, trackU, lineU, xStart, originX, originY, W, H, boldK, 'body');
      roughen(a, W, H, s);
      const thin = drawPen(lines, st, s, trackU, lineU, xStart, originX, originY, W, H, boldK, 'thin');
      for (let i = 0; i < a.length; i++) if (thin[i] > a[i]) a[i] = thin[i] >= 90 ? 255 : thin[i];
    } else a = drawPen(lines, st, s, trackU, lineU, xStart, originX, originY, W, H, boldK);
    return { w: W, h: H, a, ax: Math.round(ax), ay: Math.round(ay) };
  }

  /* Обойти все буквы: fn(ломаные в единицах, map(x, y) → пиксели, флаги глифа). */
  function eachGlyph(lines, st, s, trackU, lineU, xStart, ox, oy, fn) {
    lines.forEach((line, li) => {
      let gx = xStart(li), prev = ' ';
      const by = li * lineU;
      for (const ch of line) {
        if (ch === ' ') { gx += SPACE + trackU; prev = ch; continue; }
        gx += kernOf(prev, ch, st, st.kern);
        prev = ch;
        const g = glyphOf(ch, st) || glyphOf('?', st), fx = st.sx * g.kx;
        const ty = (y) => (g.small ? 10 - (10 - y) * g.ky : y);
        const raw = parse(g.path, st.curve), polys = raw.map((p) => p.map(([x, y]) => [x * fx, ty(y)]));
        polys.hairs = raw.hairs.map(([x1, y, x2, xm]) => [x1 * fx, ty(y), x2 * fx, xm * fx]);
        polys.stars = raw.stars.map(([x, y, r]) => [x * fx, ty(y), r * g.ky]);
        const x0 = gx, y0 = by;
        const map = (x, y) => [ox + (x0 + x + st.slant * (10 - y)) * s, oy + (y0 + y) * s];
        fn(polys, map, g);
        gx += g.w * fx + trackU;
      }
    });
  }

  /* part: 'body' — только буквы, 'thin' — только перекладины и блики, иначе всё. */
  function drawPen(lines, st, s, trackU, lineU, xStart, ox, oy, W, H, boldK, part) {
    const K = 4; // сглаживание при рисовании, потом порог
    const c = document.createElement('canvas');
    c.width = W * K; c.height = H * K;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.scale(K, K);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    const poly = (pts) => { ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };
    function drawThin(polys, map) {
      // тонкие перекладины: длинный ромб, заострённый с обоих концов, по центру — линия не тоньше пикселя
      ctx.lineWidth = Math.max(1, 0.3 * s); ctx.lineCap = 'butt';
      for (const [x1, y, x2, xm] of polys.hairs) {
        const th = 0.62 * boldK;
        poly([map(x1, y), map(xm, y - th), map(x2, y), map(xm, y + th)]);
        const [ax, ay] = map(x1, y), [bx, by] = map(x2, y);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
      // блик-звезда: четыре острых луча
      for (const [x, y, r] of polys.stars) {
        const w = 0.55 * boldK;
        poly([map(x, y - r * 1.3), map(x + w, y), map(x, y + r * 1.3), map(x - w, y)]);
        poly([map(x - r * 1.1, y), map(x, y - w), map(x + r * 1.1, y), map(x, y + w)]);
      }
    }
    const nibA = ((st.nibAngle || 0) * Math.PI) / 180, nx = Math.cos(nibA), ny = Math.sin(nibA);
    eachGlyph(lines, st, s, trackU, lineU, xStart, ox, oy, (polys, map, g) => {
      const capTop = g.small ? 10 - 10 * g.ky : 0;
      if (part === 'body') { polys = Object.assign(polys.slice(), { hairs: [], stars: [] }); }
      if (part === 'thin') { drawThin(polys, map); return; }
      if (st.mono) { // ровная линия
        ctx.lineWidth = Math.max(1, st.mono * boldK * s);
        ctx.lineJoin = st.join === 'miter' ? 'miter' : 'round';
        ctx.lineCap = st.join === 'miter' ? 'butt' : 'round';
        ctx.miterLimit = 3;
        for (const p of polys) {
          ctx.beginPath();
          p.forEach(([x, y], k) => { const [X, Y] = map(x, y); if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
          if (p.length === 2 && len(p) < 1) ctx.lineCap = 'square';
          ctx.stroke();
          ctx.lineCap = st.join === 'miter' ? 'butt' : 'round';
        }
      } else { // широкое перо
        const hn = (st.nib * boldK * s) / 2;
        ctx.lineWidth = Math.max(1, st.minW * boldK * s);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const p of polys) {
          const P = p.map(([x, y]) => map(x, y));
          for (let k = 1; k < P.length; k++) {
            const [ax, ay] = P[k - 1], [bx, by] = P[k];
            poly([[ax - nx * hn, ay - ny * hn], [ax + nx * hn, ay + ny * hn], [bx + nx * hn, by + ny * hn], [bx - nx * hn, by - ny * hn]]);
          }
          ctx.beginPath();
          P.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.stroke();
        }
      }
      drawThin(polys, map);
      if (!st.serif || g.noSerif) return;
      for (const t of terminals(polys)) {
        const d = [t.dx, t.dy], p = [-t.dy, t.dx];
        if (st.serif === 'spike') { // шип: остриё продолжает штрих
          const hw = (st.mono * boldK) / 2, L = 2.4;
          poly([map(t.x + p[0] * hw, t.y + p[1] * hw), map(t.x + d[0] * L, t.y + d[1] * L), map(t.x - p[0] * hw, t.y - p[1] * hw)]);
          continue;
        }
        const hw = Math.max(st.minW / 2, (st.nib * boldK / 2) * Math.abs(d[0] * ny - d[1] * nx));
        if (st.serif === 'blade') { // резьба: конец расклешивается и уходит в остриё
          const hwB = Math.max(st.minW / 2, (st.nib * boldK / 2) * Math.abs(d[0] * ny - d[1] * nx)), f = hwB * 1.5 + 0.2, L = 2.3;
          poly([map(t.x - d[0] * 0.5 + p[0] * hwB, t.y - d[1] * 0.5 + p[1] * hwB), map(t.x + p[0] * f, t.y + p[1] * f), map(t.x + d[0] * L, t.y + d[1] * L),
            map(t.x - p[0] * f, t.y - p[1] * f), map(t.x - d[0] * 0.5 - p[0] * hwB, t.y - d[1] * 0.5 - p[1] * hwB)]);
          continue;
        }
        if (st.serif === 'foot') { // готика: ромбик пером на концах штрихов
          const r = (st.nib * boldK) * 0.62, cx = t.x + d[0] * 0.15, cy = t.y + d[1] * 0.15;
          poly([map(cx, cy - r), map(cx + r * 0.8, cy), map(cx, cy + r), map(cx - r * 0.8, cy)]);
          continue;
        }
        // инскрипция: клиновидная засечка, на верхней и базовой линии — горизонтальная
        const onLine = Math.abs(d[1]) > 0.6 && (t.y <= capTop + 0.7 || t.y >= 9.3);
        const q = onLine ? [1, 0] : p;
        const pq = p[0] * q[0] + p[1] * q[1], sp = pq < 0 ? -1 : 1, pp = [p[0] * sp, p[1] * sp];
        const sl = hw / Math.max(0.35, Math.abs(pq)) + 1.05, bl = 1.7, st2 = 0.26;
        const o = (d[0] * -q[1] + d[1] * q[0]) > 0 ? [-q[1], q[0]] : [q[1], -q[0]];
        poly([map(t.x + q[0] * sl, t.y + q[1] * sl), map(t.x - q[0] * sl, t.y - q[1] * sl),
          map(t.x - d[0] * bl - pp[0] * hw, t.y - d[1] * bl - pp[1] * hw), map(t.x - d[0] * bl + pp[0] * hw, t.y - d[1] * bl + pp[1] * hw)]);
        poly([map(t.x + q[0] * sl, t.y + q[1] * sl), map(t.x + q[0] * sl + o[0] * st2, t.y + q[1] * sl + o[1] * st2),
          map(t.x - q[0] * sl + o[0] * st2, t.y - q[1] * sl + o[1] * st2), map(t.x - q[0] * sl, t.y - q[1] * sl)]);
      }
    });
    // доля закрытой площади каждого пикселя
    const big = ctx.getImageData(0, 0, W * K, H * K).data, a = new Uint8Array(W * H), KK = K * K;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let j = 0; j < K; j++) { const row = ((y * K + j) * W * K + x * K) * 4 + 3; for (let i = 0; i < K; i++) sum += big[row + i * 4]; }
      a[y * W + x] = Math.round(sum / KK);
    }
    return a;
  }

  /* Неровный край «от резца»: порог по краю буквы чуть плавает (сплошные места не трогает). */
  function roughen(a, W, H, s) {
    const cell = Math.max(1.5, s * 0.55), hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const noise = (x, y) => {
      const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      const a0 = hash(x0, y0), a1 = hash(x0 + 1, y0), b0 = hash(x0, y0 + 1), b1 = hash(x0 + 1, y0 + 1);
      return (a0 * (1 - fx) + a1 * fx) * (1 - fy) + (b0 * (1 - fx) + b1 * fx) * fy;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, v = a[i];
      if (v === 0 || v === 255) continue;
      a[i] = U.clamp(Math.round(v + (noise(x, y) - 0.5) * 230 + (hash(x * 7, y * 13) - 0.5) * 60), 0, 255);
    }
  }

  /* Пиксельный стиль: ломаные одной линией в 1 пиксель (жирный — в 2). */
  function drawPixel(lines, st, s, trackU, lineU, xStart, ox, oy, W, H, bold) {
    const a = new Uint8Array(W * H);
    const put = (x, y) => { for (let k = 0; k <= (bold ? 1 : 0); k++) { const X = x + k; if (X >= 0 && y >= 0 && X < W && y < H) a[y * W + X] = 255; } };
    eachGlyph(lines, st, s, trackU, lineU, xStart, ox, oy, (polys, map) => {
      for (const p of polys) {
        let prev = null;
        for (const [x, y] of p) {
          const [X, Y] = map(x, y), q = [Math.round(X), Math.round(Y)];
          if (prev) { if (prev[0] !== q[0] || prev[1] !== q[1]) NPR.plotLine(prev[0], prev[1], q[0], q[1], put); }
          else put(q[0], q[1]);
          prev = q;
        }
      }
    });
    return a;
  }

  /* ---------- шрифты системы и свои файлы ---------- */
  TF.SYSTEM = ['Georgia', 'Times New Roman', 'Palatino Linotype', 'Book Antiqua', 'Constantia', 'Cambria', 'Sylfaen', 'Gabriola',
    'Monotype Corsiva', 'Old English Text MT', 'Impact', 'Arial Black', 'Segoe Script', 'Segoe UI', 'Arial', 'Verdana', 'Courier New'];
  TF.custom = []; // [{ name, data: ArrayBuffer }]
  TF.available = function (name) {
    const c = document.createElement('canvas').getContext('2d'), sample = 'WwMmIl1@ЖщЯ';
    return ['monospace', 'serif'].some((fb) => {
      c.font = `48px ${fb}`; const a = c.measureText(sample).width;
      c.font = `48px "${name}", ${fb}`; return Math.abs(c.measureText(sample).width - a) > 0.5;
    });
  };
  TF.addFontFile = async function (file) {
    const buf = await file.arrayBuffer();
    let name = file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} _-]+/gu, ' ').trim() || 'Мой шрифт';
    let n = name, k = 2;
    while (TF.custom.some((f) => f.name === n)) n = `${name} ${k++}`;
    const face = new FontFace(n, buf);
    await face.load(); // бросит ошибку, если файл не шрифт
    document.fonts.add(face);
    TF.custom.push({ name: n, data: buf });
    await NPR.io.kvSet('fonts', TF.custom);
    return n;
  };
  TF.removeFont = async function (name) {
    TF.custom = TF.custom.filter((f) => f.name !== name);
    await NPR.io.kvSet('fonts', TF.custom);
  };
  TF.loadSaved = async function () {
    const list = (await NPR.io.kvGet('fonts')) || [];
    for (const f of list) {
      try { const face = new FontFace(f.name, f.data); await face.load(); document.fonts.add(face); TF.custom.push(f); }
      catch (e) { console.warn('Шрифт не загрузился', f.name, e); }
    }
  };

  /* Обычный шрифт → маска. Размер — высота шрифта в пикселях. smooth — оставить мягкие края. */
  function renderVector(text, family, o) {
    const size = Math.max(4, o.size | 0), c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
    const font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${size}px "${family}", serif`;
    ctx.font = font;
    if ('fontKerning' in ctx) ctx.fontKerning = o.kern === 0 ? 'none' : 'normal';
    const hasLS = 'letterSpacing' in ctx, lines = String(text).split('\n');
    const setLS = () => { if (hasLS) ctx.letterSpacing = (o.spacing || 0) + 'px'; };
    setLS();
    const m = ctx.measureText('ÁЙgjpqy|');
    const asc = Math.ceil(m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || size * 0.9), desc = Math.ceil(m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || size * 0.3);
    const capM = ctx.measureText('H'), capTop = Math.round(asc - (capM.actualBoundingBoxAscent || size * 0.7));
    const lh = Math.round((asc + desc) * (o.line || 100) / 100);
    const widthOf = (l) => (hasLS || !o.spacing ? ctx.measureText(l).width : [...l].reduce((w, ch) => w + ctx.measureText(ch).width + o.spacing, 0));
    const widths = lines.map(widthOf), maxW = Math.max(1, ...widths), pad = Math.ceil(size * 0.4);
    const W = Math.ceil(maxW + pad * 2), H = lines.length * lh + asc + desc + pad;
    if (W * H > 16e6) throw new Error('Слишком большой текст');
    c.width = W; c.height = H;
    ctx.font = font; setLS(); if ('fontKerning' in ctx) ctx.fontKerning = o.kern === 0 ? 'none' : 'normal'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
    lines.forEach((l, i) => {
      const x = pad + (o.align === 'center' ? (maxW - widths[i]) / 2 : o.align === 'right' ? maxW - widths[i] : 0), y = asc + i * lh;
      if (hasLS || !o.spacing) ctx.fillText(l, x, y);
      else { let cx = x; for (const ch of l) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + o.spacing; } }
    });
    const d = ctx.getImageData(0, 0, W, H).data, a = new Uint8Array(W * H);
    for (let i = 0; i < a.length; i++) { const v = d[i * 4 + 3]; a[i] = o.smooth ? v : v >= 128 ? 255 : 0; }
    const ax = pad + (o.align === 'center' ? maxW / 2 : o.align === 'right' ? maxW : 0);
    return { w: W, h: H, a, ax: Math.round(ax), ay: capTop };
  }

  /* font: 'b:<стиль>' — встроенный, 's:<имя>' — системный, 'f:<имя>' — свой файл. */
  TF.render = function (text, o) {
    const f = o.font || 'b:inscription';
    if (f.startsWith('b:')) {
      const r = renderBuiltin(text, { ...o, style: f.slice(2) });
      if (!o.smooth) for (let i = 0; i < r.a.length; i++) r.a[i] = r.a[i] >= 128 ? 255 : 0; // чёткие края по пикселям
      return r;
    }
    return renderVector(text, f.slice(2), o);
  };
  TF.isBuiltin = (f) => !f || f.startsWith('b:');
  TF.glyphs = G;
})(window.NPR);
