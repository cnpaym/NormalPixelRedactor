'use strict';
/* Частицы.

   Эффект состоит из одного или нескольких излучателей (пламя, искры, дым…).
   Каждый излучатель — цепочка узлов:
     Источник → Рождение (и «при смерти») → Движение (силы, аттрактор, пол) →
     Размер → Форма (фигура или свой микро-спрайт) → Цвет по жизни → Смешивание → Свет.

   Как устроен расчёт. Каждая частица просчитывается шагами от рождения до смерти
   независимо от других, а её случайные параметры зависят только от номера
   частицы. Рождения идут по кругу (номер кадра по модулю длины цикла), дети
   рождаются в момент смерти родителя. Поэтому зацикленный эффект повторяется
   точно, без шва, даже с отскоками, притяжением и дочерними излучателями.

   «Светится на окружение»: частицы такого излучателя на каждом кадре освещают
   выбранный слой (например, бревно под костром). Получается отдельный слой-
   спрайтшит с мерцающим отблеском; оригинал не меняется. */
(function (NPR) {
  const S = NPR.state, U = NPR.util, V = NPR.view, { el } = U;
  const $ = (id) => document.getElementById(id);
  const PT = (NPR.particles = { fx: null, cur: 0, frames: null, f: 0, timer: 0, editId: null });
  const KEY = 'npr.particles', MINE = 'npr.particlePresets', MAX_PARTICLES = 6000, SUB = 4;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* ---------- микро-спрайты ---------- */
  const sprite = (rows, pal) => ({ w: rows[0].length, h: rows.length, px: rows.join('').split('').map((ch) => (ch === '.' ? '' : pal[ch])) });
  const SPRITES = {
    'Сердечко': sprite(['.RR.RR.', 'RWRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'], { R: '#e8344e', W: '#ffc2cc' }),
    'Черепок': sprite(['.WWW.', 'WKWKW', 'WWWWW', '.WKW.', '.W.W.'], { W: '#e8e2d0', K: '#1a1414' }),
    'Листик': sprite(['...GG', '..GGG', '.GLG.', 'GGG..', 'D....'], { G: '#d9822b', L: '#f0b04a', D: '#7a4318' }),
    'Монетка': sprite(['.YYY.', 'YOYYY', 'YOYWY', 'YOYYY', '.YYY.'], { Y: '#ffd23f', O: '#e09a1a', W: '#fff6c8' }),
    'Звёздочка': sprite(['..W..', '.WWW.', 'WWWWW', '.WWW.', '..W..'], { W: '#fff8d6' }),
    'Капля': sprite(['.B.', 'BBB', 'BLB', '.B.'], { B: '#4aa3ff', L: '#cfe9ff' }),
  };
  PT.SPRITES = SPRITES;

  /* ---------- излучатель по умолчанию и пресеты ----------
     rx, ry — положение в долях холста; floorR, attrR — пол и аттрактор в долях. */
  const em = (o) => ({ name: 'Излучатель', on: true, rx: 0.5, ry: 0.85, shape: 'point', w: 4, h: 2, mode: 'loop', rate: 2, burst: 20,
    life: [10, 16], speed: [0.3, 0.8], dir: 270, spread: 20, gx: 0, gy: 0, drag: 0, wobble: 0, wobbleFreq: 0.15,
    pull: 0, swirl: 0, absorb: false, floor: 'none', bounce: 0.5, friction: 0.8, collide: 'none',
    sizeCurve: [0, 0.25, 0.5, 0.75, 1], speedCurve: [1, 1, 1, 1, 1],
    death: -1, deathCount: 1, inherit: 0.3,
    size: [3, 1], sizeJitter: 0.3, form: 'circle', sprite: null, spin: 'none', spinSpeed: 12, tint: false,
    colors: [[0, '#ffffff'], [1, '#ffffff00']], blend: 'normal', glow: false, ...o });
  const FIRE = [[0, '#fff3c299'], [0.15, '#ffcf4a99'], [0.42, '#ff8a1f88'], [0.72, '#d0301a77'], [1, '#4a0c0c00']];
  const PRESETS = [
    { name: 'Огонь с отблеском', frames: 16, fps: 12, emitters: [
      em({ name: 'Пламя', shape: 'line', w: 7, rate: 2.2, life: [11, 19], speed: [0.4, 0.75], dir: 270, spread: 10, gy: -0.03, wobble: 0.8, wobbleFreq: 0.09, size: [3, 1], sizeJitter: 0.4,
        colors: FIRE, blend: 'add', glow: true, death: 2, deathCount: 0.25, inherit: 0.4 }),
      em({ name: 'Искры', shape: 'line', w: 5, rate: 0.35, life: [14, 22], speed: [0.6, 1.1], dir: 270, spread: 30, gy: 0.01, wobble: 0.4, size: [1, 1], form: 'square',
        colors: [[0, '#ffffcc'], [0.5, '#ffb42e'], [1, '#ff4d0000']], blend: 'add' }),
      em({ name: 'Дым', mode: 'sub', life: [14, 22], speed: [0.15, 0.3], dir: 270, spread: 20, wobble: 0.5, size: [2, 5],
        colors: [[0, '#55505000'], [0.25, '#4a454599'], [1, '#2e2b2b00']] }),
    ] },
    { name: 'Салют', frames: 24, fps: 12, emitters: [
      em({ name: 'Ракета', ry: 0.95, rate: 0.13, life: [15, 17], speed: [1.7, 1.9], dir: 270, spread: 8, gy: 0.06, size: [2, 1], form: 'spark',
        colors: [[0, '#fff6d0'], [1, '#ffb04a']], blend: 'add', death: 1, deathCount: 22, inherit: 0.2 }),
      em({ name: 'Взрыв', mode: 'sub', life: [10, 16], speed: [0.5, 1.3], spread: 360, gy: 0.035, drag: 0.05, size: [2, 1], form: 'square',
        colors: [[0, '#ffffff'], [0.3, '#ffe066'], [0.65, '#ff5ca8'], [1, '#6b2bd900']], blend: 'add', glow: true }),
    ] },
    { name: 'Кузня — искры с отскоком', frames: 24, fps: 15, floorR: 0.8, emitters: [
      em({ name: 'Искры', rx: 0.45, ry: 0.6, rate: 1.2, life: [18, 26], speed: [0.9, 1.8], dir: 300, spread: 70, gy: 0.12, size: [2, 1], form: 'spark',
        floor: 'bounce', bounce: 0.45, friction: 0.7, colors: [[0, '#ffffff'], [0.3, '#ffd24a'], [0.75, '#ff6a1a'], [1, '#a0141400']], blend: 'add', glow: true }),
    ] },
    { name: 'Дождь с брызгами', frames: 16, fps: 15, floorR: 0.9, emitters: [
      em({ name: 'Капли', ry: 0, shape: 'line', rw: 1, rate: 1.6, life: [30, 30], speed: [2.4, 3], dir: 100, spread: 2, size: [3, 3], form: 'spark',
        floor: 'die', death: 1, deathCount: 2, inherit: 0, colors: [[0, '#cfe9ff'], [1, '#6aa8ff99']] }),
      em({ name: 'Брызги', mode: 'sub', life: [4, 7], speed: [0.3, 0.7], dir: 270, spread: 150, gy: 0.12, size: [1, 1], form: 'square',
        colors: [[0, '#e6f4ff'], [1, '#8fc4ff00']] }),
    ] },
    { name: 'Портал — воронка', frames: 24, fps: 12, attrR: [0.5, 0.5], emitters: [
      em({ name: 'Вихрь', ry: 0.5, shape: 'circle', w: 15, rate: 3, life: [20, 30], speed: [0, 0.15], spread: 360, pull: 0.07, swirl: 0.12, absorb: true, size: [2, 1], form: 'square',
        colors: [[0, '#d9b8ff00'], [0.2, '#c49bff'], [0.7, '#7a4dff'], [1, '#ffffff']], blend: 'add', glow: true }),
      em({ name: 'Ядро', ry: 0.5, rate: 0.6, life: [6, 10], speed: [0, 0.05], spread: 360, size: [4, 2], form: 'diamond',
        colors: [[0, '#ffffff'], [1, '#7a4dff00']], blend: 'add' }),
    ] },
    { name: 'Хил — сердечки', frames: 20, fps: 10, emitters: [
      em({ name: 'Сердечки', ry: 0.8, shape: 'line', w: 14, rate: 0.2, life: [16, 20], speed: [0.9, 1.3], dir: 270, spread: 10, wobble: 0.8, wobbleFreq: 0.06, size: [1, 1], sizeJitter: 0,
        form: 'sprite', sprite: SPRITES['Сердечко'], colors: [[0, '#ffffff00'], [0.15, '#ffffff'], [0.75, '#ffffff'], [1, '#ffffff00']] }),
      em({ name: 'Блёстки', shape: 'line', w: 14, rate: 0.6, life: [8, 14], speed: [0.2, 0.5], dir: 270, spread: 20, size: [1, 1], form: 'square',
        colors: [[0, '#d6ffd6'], [1, '#56d97a00']], blend: 'add' }),
    ] },
    { name: 'Листопад', frames: 32, fps: 10, emitters: [
      em({ name: 'Листья', ry: 0, shape: 'line', rw: 1, rate: 0.12, life: [70, 80], speed: [0.55, 0.7], dir: 90, spread: 20, wobble: 2, wobbleFreq: 0.04, size: [1, 1], sizeJitter: 0,
        form: 'sprite', sprite: SPRITES['Листик'], spin: 'rotate', spinSpeed: 9, colors: [[0, '#ffffff'], [1, '#ffffff']] }),
    ] },
    { name: 'Монетки — лут', frames: 24, fps: 12, loop: false, floorR: 0.85, emitters: [
      em({ name: 'Монетки', ry: 0.7, mode: 'burst', burst: 8, life: [24, 24], speed: [0.8, 1.5], dir: 270, spread: 70, gy: 0.09, floor: 'bounce', bounce: 0.4, friction: 0.6,
        size: [1, 1], sizeJitter: 0, form: 'sprite', sprite: SPRITES['Монетка'], spin: 'flip', spinSpeed: 30, colors: [[0, '#ffffff'], [0.85, '#ffffff'], [1, '#ffffff00']] }),
    ] },
    { name: 'Искры — взрыв', frames: 16, fps: 15, loop: false, emitters: [
      em({ name: 'Искры', ry: 0.5, mode: 'burst', burst: 34, life: [8, 16], speed: [0.8, 2.2], spread: 360, gy: 0.07, drag: 0.08, size: [3, 2], sizeJitter: 0.4, form: 'spark',
        colors: [[0, '#ffffff'], [0.3, '#ffe066'], [0.7, '#ff7a1a'], [1, '#a0141400']], blend: 'add', glow: true }),
      em({ name: 'Вспышка', ry: 0.5, mode: 'burst', burst: 6, life: [3, 6], speed: [0, 0.3], spread: 360, size: [7, 2],
        colors: [[0, '#ffffff'], [1, '#ffcc5500']], blend: 'add' }),
    ] },
    { name: 'Магия', frames: 16, fps: 12, emitters: [
      em({ name: 'Огоньки', ry: 0.55, shape: 'circle', w: 6, rate: 1.4, life: [12, 20], speed: [0.1, 0.35], dir: 270, spread: 40, wobble: 0.7, wobbleFreq: 0.1, size: [0, 3], sizeCurve: [0, 1, 0.8, 0.5, 0], form: 'diamond',
        colors: [[0, '#ffffff'], [0.3, '#d9b8ff'], [0.7, '#8a5cff'], [1, '#3a1f9900']], blend: 'add', glow: true }),
    ] },
    { name: 'Дым', frames: 16, fps: 10, emitters: [
      em({ name: 'Дым', shape: 'line', w: 4, rate: 0.9, life: [18, 30], speed: [0.25, 0.5], dir: 270, spread: 14, wobble: 0.6, wobbleFreq: 0.08, size: [2, 6],
        colors: [[0, '#8a858500'], [0.2, '#7a7575bb'], [1, '#4a454500']] }),
    ] },
    { name: 'Снег налипает на рисунок', frames: 24, fps: 10, emitters: [
      em({ name: 'Снежинки', ry: 0, shape: 'line', rw: 1, rate: 1.2, life: [60, 70], speed: [0.35, 0.5], dir: 90, spread: 10, wobble: 0.6, wobbleFreq: 0.05, size: [1, 1], sizeJitter: 0, form: 'square',
        collide: 'stick', colors: [[0, '#ffffff'], [0.85, '#eef6ff'], [1, '#dfefff00']] }),
    ] },
    { name: 'Снег', frames: 24, fps: 10, emitters: [
      em({ name: 'Снежинки', ry: 0, shape: 'line', rw: 1, rate: 1, life: [40, 50], speed: [0.25, 0.4], dir: 90, spread: 10, wobble: 0.8, wobbleFreq: 0.05, size: [1, 2], sizeJitter: 0.6, form: 'square',
        colors: [[0, '#ffffff'], [1, '#dfefff']] }),
    ] },
  ];
  const base = () => ({ name: 'Эффект', frames: 16, fps: 12, seed: 7, loop: true, alpha: 'dither', palette: false,
    floorY: null, attr: null, light: { strength: 1, radius: 14, height: 4, tones: 2, target: null }, emitters: [] });
  let mine = [];
  /* Пресет → эффект с координатами холста. */
  function fromPreset(p) {
    const doc = NPR.doc, W = doc.width, H = doc.height, fx = { ...base(), ...clone(p) };
    fx.name = NPR.t(fx.name); // в английском интерфейсе — сразу английские имена
    for (const e of fx.emitters) e.name = NPR.t(e.name);
    fx.emitters = fx.emitters.map((e) => {
      const o = { ...em({}), ...e };
      o.x = Math.round(W * (o.rx ?? 0.5)); o.y = Math.round(H * (o.ry ?? 0.85));
      if (o.rw) o.w = W;
      delete o.rx; delete o.ry; delete o.rw;
      return o;
    });
    if (p.floorR !== undefined) fx.floorY = Math.round(H * p.floorR);
    if (p.attrR) fx.attr = { x: Math.round(W * p.attrR[0]), y: Math.round(H * p.attrR[1]) };
    delete fx.floorR; delete fx.attrR;
    fx.emitters.forEach((e) => { e.g = 1; });
    fx.groups = { 1: fx.name };
    return fx;
  }
  /* Старые сохранённые эффекты дополняются новыми полями. */
  function upgrade(fx) {
    const b = base();
    fx = { ...b, ...fx, light: { ...b.light, ...(fx.light || {}) } };
    fx.emitters = fx.emitters.map((e) => ({ ...em({}), g: 1, ...e }));
    fx.groups = fx.groups || {};
    for (const e of fx.emitters) if (!(e.g in fx.groups)) fx.groups[e.g] = Object.keys(fx.groups).length ? 'Эффект ' + e.g : fx.name;
    return fx;
  }

  /* ---------- несколько эффектов в одном слое ----------
     Эффект = набор групп. Группа — излучатели одного пресета (пламя, искры и дым
     костра). Группы двигаются целиком, можно добавить другой пресет или копию. */
  const groupIds = (fx) => [...new Set(fx.emitters.map((e) => e.g))];
  const groupName = (fx, g) => (fx.groups && fx.groups[g]) || 'Эффект';
  const nextGroup = (fx) => Math.max(0, ...fx.emitters.map((e) => e.g)) + 1;
  /* Якорь группы — первый излучатель, который ставится на холст. */
  const anchorOf = (fx, g) => fx.emitters.find((e) => e.g === g && e.mode !== 'sub') || fx.emitters.find((e) => e.g === g);
  function renameEffect(fx) {
    const names = [...new Set(groupIds(fx).map((g) => groupName(fx, g).replace(/ \d+$/, '')))];
    fx.name = names.length > 3 ? names.slice(0, 3).join(' + ') + ' …' : names.join(' + ') || 'Эффект';
  }
  /* Добавить излучатели (из пресета или копии группы) новой группой; ссылки «при смерти» сдвигаются. */
  function appendGroup(fx, emitters, name, x, y) {
    const off = fx.emitters.length, g = nextGroup(fx), a = emitters.find((e) => e.mode !== 'sub') || emitters[0];
    const dx = x === undefined ? 0 : x - a.x, dy = y === undefined ? 0 : y - a.y;
    for (const e of emitters) fx.emitters.push({ ...clone(e), g, x: e.x + dx, y: e.y + dy, death: e.death >= 0 ? e.death + off : -1 });
    fx.groups = { ...(fx.groups || {}), [g]: name };
    renameEffect(fx);
    return g;
  }
  PT.addPreset = function (p, x, y) {
    const src = p.emitters && p.emitters[0] && 'x' in p.emitters[0] ? upgrade(clone(p)) : fromPreset(p), fx = PT.fx;
    if (fx.floorY === null && src.floorY !== null) fx.floorY = src.floorY; // пол и аттрактор общие на весь слой
    if (!fx.attr && src.attr) fx.attr = src.attr;
    const g = appendGroup(fx, src.emitters, NPR.t(p.name), x, y);
    PT.cur = fx.emitters.indexOf(anchorOf(fx, g));
    return g;
  };
  PT.copyGroup = function (g, x, y) {
    const fx = PT.fx, list = fx.emitters.filter((e) => e.g === g), first = fx.emitters.indexOf(list[0]);
    // ссылки внутри группы считаются от её начала
    const local = list.map((e) => ({ ...e, death: e.death >= 0 ? list.indexOf(fx.emitters[e.death]) : -1 }));
    const a = anchorOf(fx, g);
    const base = groupName(fx, g).replace(/ \d+$/, ''), used = new Set(Object.values(fx.groups || {}));
    let n = 2; while (used.has(`${base} ${n}`)) n++;
    const ng = appendGroup(fx, local, `${base} ${n}`, x ?? a.x + 6, y ?? a.y);
    PT.cur = fx.emitters.indexOf(anchorOf(fx, ng));
    return first >= 0 ? ng : null;
  };
  function removeEmitters(fx, drop) { // drop — множество индексов
    const map = [];
    let k = 0;
    fx.emitters.forEach((_, i) => { map[i] = drop.has(i) ? -1 : k++; });
    fx.emitters = fx.emitters.filter((_, i) => !drop.has(i));
    for (const e of fx.emitters) e.death = e.death >= 0 ? map[e.death] : -1;
    for (const g of Object.keys(fx.groups || {})) if (!fx.emitters.some((e) => String(e.g) === g)) delete fx.groups[g];
  }
  PT.removeGroup = function (g) {
    const fx = PT.fx;
    removeEmitters(fx, new Set(fx.emitters.map((e, i) => (e.g === g ? i : -1)).filter((i) => i >= 0)));
    renameEffect(fx);
    PT.cur = 0;
  };

  /* ---------- симуляция ---------- */
  function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hashSeed = (...n) => n.reduce((h, v) => Math.imul(h ^ (v | 0), 2654435761) >>> 0, 0x9e3779b9);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* Новая частица излучателя e. r — её собственный генератор случайностей. */
  function makeParticle(e, ei, r, t0, x, y, extraVx, extraVy, depth) {
    const a = ((e.dir + (r() - 0.5) * e.spread) * Math.PI) / 180, sp = lerp(e.speed[0], e.speed[1], r());
    return {
      ei, t0, depth, life: Math.max(1, Math.round(lerp(e.life[0], e.life[1], r()))),
      x, y, vx: Math.cos(a) * sp + extraVx, vy: Math.sin(a) * sp + extraVy,
      ph: r() * Math.PI * 2, sj: 1 + (r() - 0.5) * 2 * e.sizeJitter, spinDir: r() < 0.5 ? -1 : 1, seed: (r() * 4294967296) >>> 0,
    };
  }
  function emitPoint(e, r) {
    let ox = 0, oy = 0;
    if (e.shape === 'line') ox = (r() - 0.5) * e.w;
    else if (e.shape === 'rect') { ox = (r() - 0.5) * e.w; oy = (r() - 0.5) * e.h; }
    else if (e.shape === 'circle') { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * e.w; ox = Math.cos(a) * d; oy = Math.sin(a) * d; }
    return [e.x + ox, e.y + oy];
  }
  /* Путь частицы по кадрам: [x, y, vx, vy] для каждого возраста, пока жива. */
  /* Кривая из 5 точек (t = 0, ¼, ½, ¾, 1) с плавными переходами. */
  const curveAt = (c, t) => {
    if (!c) return t;
    const u = Math.max(0, Math.min(1, t)) * 4, i = Math.min(3, Math.floor(u)), f = u - i, k = f * f * (3 - 2 * f);
    return c[i] + (c[i + 1] - c[i]) * k;
  };
  PT.curveAt = curveAt;
  /* Препятствие — непрозрачные пиксели выбранного слоя (его текущего кадра). */
  PT.collideLayer = function (fx) {
    const doc = NPR.doc, L = fx.collideLayer && doc.getLayer(fx.collideLayer);
    return L && !L.particles ? L : PT.lightTarget(fx);
  };
  function collideMask(fx) {
    if (!fx.emitters.some((e) => e.on && e.collide && e.collide !== 'none')) return null;
    const L = PT.collideLayer(fx);
    if (!L) return null;
    const doc = NPR.doc, W = doc.width, H = doc.height, m = new Uint8Array(W * H), d = L.data;
    for (let i = 0; i < m.length; i++) m[i] = d[i] >>> 24 >= 128 ? 1 : 0;
    return { m, W, H };
  }
  function trace(p, e, fx, mask) {
    const out = [], dt = 1 / SUB, floorY = fx.floorY, at = fx.attr;
    const solid = mask && e.collide !== 'none' ? (X, Y) => { X = Math.floor(X); Y = Math.floor(Y); return X >= 0 && Y >= 0 && X < mask.W && Y < mask.H && mask.m[Y * mask.W + X] === 1; } : null;
    let x = p.x, y = p.y, vx = p.vx, vy = p.vy, died = false, stuck = false;
    // родившаяся внутри рисунка частица его не замечает, пока не выйдет наружу
    let inside = solid ? solid(x, y) : false;
    out.push(x, y, vx, vy);
    for (let age = 1; age < p.life && !died; age++) {
      const sm = curveAt(e.speedCurve, age / p.life); // множитель скорости по жизни
      if (stuck) { out.push(x, y, 0, 0); continue; }
      for (let k = 0; k < SUB; k++) {
        let ax = e.gx - e.drag * vx, ay = e.gy - e.drag * vy;
        if (at && (e.pull || e.swirl)) { // притяжение к точке и закрутка вокруг неё
          // скорость «подруливает» к желаемой: внутрь (притяжение) и по касательной (закрутка) — получается спираль
          const dx = at.x - x, dy = at.y - y, d = Math.max(1.5, Math.hypot(dx, dy)), ux = dx / d, uy = dy / d, tw = Math.min(1, d / 6);
          const tx = ux * e.pull * 10 - uy * e.swirl * 10 * tw, ty = uy * e.pull * 10 + ux * e.swirl * 10 * tw;
          ax += (tx - vx) * 0.2; ay += (ty - vy) * 0.2;
          if (e.absorb && d < 2) { died = true; break; }
        }
        vx += ax * dt; vy += ay * dt;
        if (solid) { // столкновение с рисунком
          const nx = x + vx * sm * dt, ny2 = y + vy * sm * dt;
          if (inside) inside = solid(nx, ny2);
          else if (solid(nx, ny2)) {
            if (e.collide === 'die') { died = true; break; }
            if (e.collide === 'stick') { stuck = true; vx = vy = 0; break; }
            const hx = solid(nx, y), hy = solid(x, ny2);
            if (hx || !hy) vx = -vx * e.bounce;
            if (hy || !hx) { vy = -vy * e.bounce; vx *= e.friction; }
            if (Math.abs(vy) < 0.15 && hy) vy = 0;
            continue; // в этом шаге стоим на месте, дальше летим отражённо
          }
        }
        const ny = y + vy * sm * dt;
        if (floorY !== null && e.floor !== 'none' && y <= floorY && ny > floorY && vy > 0) {
          if (e.floor === 'die') { x += vx * sm * dt * ((floorY - y) / (ny - y)); y = floorY; died = true; break; }
          y = floorY; vy = -vy * e.bounce; vx *= e.friction; // отскок
          if (Math.abs(vy) < 0.15) vy = 0;
        } else y = ny;
        x += vx * sm * dt;
      }
      out.push(x, y, vx, vy);
    }
    return Float32Array.from(out);
  }
  /* Все частицы одного цикла, включая рождённых «при смерти». */
  PT.simulate = function (fx) {
    const N = fx.frames, out = [], queue = [], mask = collideMask(fx);
    fx.emitters.forEach((e, ei) => {
      if (!e.on || e.mode === 'sub') return;
      const count = e.mode === 'burst' ? Math.max(0, e.burst | 0) : Math.max(0, Math.round(e.rate * N));
      for (let k = 0; k < count; k++) {
        const r = rng(hashSeed(fx.seed, ei, k)), [x, y] = emitPoint(e, r);
        const t0 = e.mode === 'burst' ? 0 : Math.floor((k * N) / count + r() * (N / count) * 0.6);
        queue.push(makeParticle(e, ei, r, t0, x, y, 0, 0, 0));
      }
    });
    while (queue.length && out.length < MAX_PARTICLES) {
      const p = queue.shift(), e = fx.emitters[p.ei];
      p.tr = trace(p, e, fx, mask);
      p.len = p.tr.length / 4;
      out.push(p);
      const de = fx.emitters[e.death];
      if (e.death >= 0 && de && de.on && p.depth < 3) { // событие «при смерти»
        const r = rng(p.seed), j = (p.len - 1) * 4, n = Math.floor(e.deathCount) + (r() < e.deathCount % 1 ? 1 : 0);
        for (let k = 0; k < n; k++) queue.push(makeParticle(de, e.death, r, p.t0 + p.len, p.tr[j], p.tr[j + 1], p.tr[j + 2] * e.inherit, p.tr[j + 3] * e.inherit, p.depth + 1));
      }
    }
    return out;
  };
  /* Возрасты частицы, видимые в кадре f (в цикле — с повторами). */
  function agesAt(p, f, fx) {
    const N = fx.frames, loops = fx.loop, res = [];
    if (!loops) { const a = f - p.t0; if (a >= 0 && a < p.len) res.push(a); return res; }
    for (let a = (((f - p.t0) % N) + N) % N; a < p.len; a += N) res.push(a);
    return res;
  }

  /* ---------- рисование ---------- */
  const spriteCache = new WeakMap();
  function spritePixels(sp) { // '#rrggbbaa' → числа
    let v = spriteCache.get(sp);
    if (!v) { v = sp.px.map((h) => (h ? U.parseHex(h) : 0)); spriteCache.set(sp, v); }
    return v;
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) * 16);
  /* Состояние частицы в возрасте a для рисования. */
  function stateAt(p, e, a) {
    const j = a * 4, t = a / p.life;
    let x = p.tr[j], y = p.tr[j + 1];
    if (e.wobble) x += e.wobble * Math.sin(p.ph + a * e.wobbleFreq * Math.PI * 2) * Math.min(1, a / 4);
    return { x, y, vx: p.tr[j + 2], vy: p.tr[j + 3], t };
  }
  PT.renderFrame = function (fx, f, W, H, parts) {
    const acc = new Float32Array(W * H * 4);
    for (const p of parts) {
      const e = fx.emitters[p.ei];
      if (!e || !e.on) continue;
      const table = NPR.gradient.lutFor(e.colors), add = e.blend === 'add';
      for (const a of agesAt(p, f, fx)) {
        const { x, y, vx, vy, t } = stateAt(p, e, a), c = table[Math.min(1023, (t * 1023) | 0)], ca = (c >>> 24) / 255;
        if (ca <= 0.01) continue;
        const cr = (c & 255) / 255, cg = ((c >>> 8) & 255) / 255, cb = ((c >>> 16) & 255) / 255;
        const plot = (px, py, col, alpha) => {
          px = Math.round(px); py = Math.round(py);
          if (px < 0 || py < 0 || px >= W || py >= H) return;
          const i = (py * W + px) * 4, r = col ? (col & 255) / 255 : cr, g = col ? ((col >>> 8) & 255) / 255 : cg, b = col ? ((col >>> 16) & 255) / 255 : cb, A = alpha ?? ca;
          if (add) { acc[i] += r * A; acc[i + 1] += g * A; acc[i + 2] += b * A; acc[i + 3] = Math.min(1, acc[i + 3] + A); }
          else { const k = 1 - A; acc[i] = acc[i] * k + r * A; acc[i + 1] = acc[i + 1] * k + g * A; acc[i + 2] = acc[i + 2] * k + b * A; acc[i + 3] = acc[i + 3] * k + A; }
        };
        const sz = lerp(e.size[0], e.size[1], curveAt(e.sizeCurve, t)) * p.sj;
        if (e.form === 'sprite' && e.sprite) { drawSprite(e, p, a, x, y, sz, plot, ca, cr, cg, cb); continue; }
        if (sz < 0.5) continue;
        const n = Math.max(1, Math.round(sz)), o = (n - 1) / 2, cx = Math.round(x - o), cy = Math.round(y - o);
        if (e.form === 'spark') { // штрих вдоль движения
          const l = Math.hypot(vx, vy) || 1;
          NPR.plotLine(Math.round(x), Math.round(y), Math.round(x - (vx / l) * (n - 1)), Math.round(y - (vy / l) * (n - 1)), (X, Y) => plot(X, Y));
          continue;
        }
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const dx = i - o, dy = j - o;
          if (e.form === 'circle' && n > 2 && dx * dx + dy * dy > (n / 2) * (n / 2) - 0.25 + (n === 3 ? 0.5 : 0)) continue;
          if (e.form === 'diamond' && Math.abs(dx) + Math.abs(dy) > n / 2) continue;
          if (e.form === 'plus' && Math.abs(dx) > 0.5 && Math.abs(dy) > 0.5) continue;
          plot(cx + i, cy + j);
        }
      }
    }
    return finish(acc, W, H, fx);
  };
  /* Свой спрайт: масштаб = размер, поворот или «монетка» (сжатие по ширине). */
  function drawSprite(e, p, a, x, y, scale, plot, ca, cr, cg, cb) {
    const sp = e.sprite, px = spritePixels(sp), k = Math.max(1, Math.round(scale)), sw = sp.w * k, sh = sp.h * k;
    // поворот шагами по 45°: у пиксельного спрайта промежуточные углы превращаются в кашу
    const q = Math.PI / 4, ang = e.spin === 'rotate' ? Math.round((p.ph + p.spinDir * a * e.spinSpeed * Math.PI / 180) / q) * q : 0;
    const flip = e.spin === 'flip' ? Math.cos(p.ph + a * e.spinSpeed * Math.PI / 180) : 1;
    if (Math.abs(flip) < 0.15) return; // ребром — не видно
    const cos = Math.round(Math.cos(ang) * 1e9) / 1e9, sin = Math.round(Math.sin(ang) * 1e9) / 1e9, R = Math.ceil(Math.hypot(sw, sh) / 2) + 1;
    x = Math.round(x); y = Math.round(y);
    const half = (n) => (n % 2 ? 0 : 0.5); // у чётного спрайта центр между пикселями
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      // обратное отображение: какой пиксель спрайта попадает сюда
      const ddx = dx + half(sw), ddy = dy + half(sh); let u = ddx * cos + ddy * sin, v = -ddx * sin + ddy * cos;
      u /= flip;
      const sx = Math.floor((u + sw / 2) / k), sy = Math.floor((v + sh / 2) / k);
      if (sx < 0 || sy < 0 || sx >= sp.w || sy >= sp.h) continue;
      const c = px[sy * sp.w + sx];
      if (!c) continue;
      const alpha = ((c >>> 24) / 255) * ca;
      if (e.tint) { const m = (ch) => Math.round(((c >>> ch) & 255) * [cr, cg, cb][ch / 8]); plot(x + dx, y + dy, U.rgba(m(0), m(8), m(16)), alpha); }
      else plot(x + dx, y + dy, c, alpha);
    }
  }
  /* Накопленные цвета → пиксели (прозрачность узором/порогом, цвета по палитре). */
  function finish(acc, W, H, fx) {
    const out = new Uint32Array(W * H), pal = fx.palette ? NPR.palette.current().colors.map(U.parseHex).filter((c) => c !== null) : null;
    for (let i = 0; i < W * H; i++) {
      const a = acc[i * 4 + 3];
      if (a <= 0.004) continue;
      const k = 1 / a;
      let r = Math.min(255, acc[i * 4] * k * 255), g = Math.min(255, acc[i * 4 + 1] * k * 255), b = Math.min(255, acc[i * 4 + 2] * k * 255);
      let A = Math.round(a * 255);
      if (fx.alpha === 'dither') A = A > BAYER[((i / W) & 3) * 4 + ((i % W) & 3)] ? 255 : 0;
      else if (fx.alpha === 'hard') A = A >= 128 ? 255 : 0;
      if (!A) continue;
      if (pal && pal.length) {
        let best = pal[0], bd = Infinity;
        for (const c of pal) { const d = ((c & 255) - r) ** 2 + (((c >>> 8) & 255) - g) ** 2 + (((c >>> 16) & 255) - b) ** 2; if (d < bd) { bd = d; best = c; } }
        r = best & 255; g = (best >>> 8) & 255; b = (best >>> 16) & 255;
      }
      out[i] = U.rgba(Math.round(r), Math.round(g), Math.round(b), A);
    }
    return out;
  }
  PT.renderAll = function (fx, W, H, parts) {
    parts = parts || PT.simulate(fx);
    return Array.from({ length: fx.frames }, (_, f) => PT.renderFrame(fx, f, W, H, parts));
  };

  /* ---------- свет от частиц на слой ----------
     Каждая светящаяся частица — маленький точечный источник над рисунком.
     Освещённость пикселя = сумма вкладов с затуханием по расстоянию и с учётом
     того, смотрит ли «склон» пикселя на частицу (объём от края, как в «Свете»). */
  PT.lightTarget = function (fx) {
    const doc = NPR.doc, t = fx.light.target && doc.getLayer(fx.light.target);
    if (t && !t.particles) return t;
    const ok = (l) => l && !l.particles && !l.text && !l.name.endsWith(NPR.t(' — свет частиц').trim());
    const a = doc.active;
    if (ok(a)) return a;
    return doc.layers.find(ok) || null;
  };
  PT.lightFrames = function (fx, W, H, parts, layer) {
    if (!layer || !fx.emitters.some((e) => e.on && e.glow)) return null;
    const src = layer.data, L = fx.light, R = Math.max(2, L.radius), hz = Math.max(1, L.height), tones = U.clamp(L.tones | 0, 1, 4);
    // объём от края: расстояние до прозрачного, не больше 3
    const dist = new Uint8Array(W * H);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!(src[i] >>> 24)) continue;
      dist[i] = Math.min(3, 1 + Math.min(x > 0 ? dist[i - 1] : 0, y > 0 ? dist[i - W] : 0));
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return null;
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (dist[i]) dist[i] = Math.min(dist[i], 1 + Math.min(x < W - 1 ? dist[i + 1] : 0, y < H - 1 ? dist[i + W] : 0));
    }
    NPR.fx.resetTone();
    const frames = [];
    for (let f = 0; f < fx.frames; f++) {
      const lights = [];
      for (const p of parts) {
        const e = fx.emitters[p.ei];
        if (!e || !e.on || !e.glow) continue;
        const table = NPR.gradient.lutFor(e.colors);
        for (const a of agesAt(p, f, fx)) {
          const s = stateAt(p, e, a), c = table[Math.min(1023, (s.t * 1023) | 0)], w = ((c >>> 24) / 255) * Math.max(0.5, lerp(e.size[0], e.size[1], curveAt(e.sizeCurve, s.t)) * p.sj);
          if (w > 0.05) lights.push(s.x, s.y, w, c & 255, (c >>> 8) & 255, (c >>> 16) & 255);
        }
      }
      const d = src.slice();
      if (lights.length) {
        for (let y = Math.max(0, y0); y <= y1; y++) for (let x = Math.max(0, x0); x <= x1; x++) {
          const i = y * W + x, c = src[i];
          if (!(c >>> 24)) continue;
          const h = dist[i], at = (j, ok) => (ok ? dist[j] : 0);
          const gx = (at(i + 1, x < W - 1) - at(i - 1, x > 0)) / 2, gy = (at(i + W, y < H - 1) - at(i - W, y > 0)) / 2, nl = Math.hypot(gx, gy, 1);
          const nx = -gx / nl, ny = -gy / nl, nz = 1 / nl;
          let I = 0, tr = 0, tg = 0, tb = 0;
          for (let k = 0; k < lights.length; k += 6) {
            const lx = lights[k] - x, ly = lights[k + 1] - y, dd = Math.hypot(lx, ly);
            if (dd > R) continue;
            const lz = hz + h * 0.5, ll = Math.hypot(lx, ly, lz), facing = Math.max(0.15, (nx * lx + ny * ly + nz * lz) / ll);
            const v = lights[k + 2] * (1 - dd / R) ** 2 * facing;
            I += v; tr += v * lights[k + 3]; tg += v * lights[k + 4]; tb += v * lights[k + 5];
          }
          if (I <= 0.02) continue;
          const lit = Math.min(1.5, I * 0.35 * L.strength), n = Math.round(Math.min(tones, lit * tones * 1.2));
          let out = NPR.fx.tone(c, n, 'hsv');
          const m = Math.round(Math.min(0.6, lit * 0.55) / 0.15) * 0.15;
          if (m > 0) { const q = 1 - m; out = U.rgba(Math.round((out & 255) * q + (tr / I) * m), Math.round(((out >>> 8) & 255) * q + (tg / I) * m), Math.round(((out >>> 16) & 255) * q + (tb / I) * m), c >>> 24); }
          d[i] = out;
        }
      }
      frames.push(d);
    }
    return frames;
  };

  /* ---------- предпросмотр на холсте ---------- */
  let dirty = true;
  const toCanvas = (d, W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d.buffer.slice(0)), W, H), 0, 0); return c; };
  function rebuild() {
    dirty = false;
    const doc = NPR.doc, W = doc.width, H = doc.height, parts = PT.simulate(PT.fx);
    PT.frames = PT.renderAll(PT.fx, W, H, parts).map((d) => toCanvas(d, W, H));
    const lit = PT.lightFrames(PT.fx, W, H, parts, PT.lightTarget(PT.fx));
    PT.litFrames = lit ? lit.map((d) => toCanvas(d, W, H)) : null;
    PT.count = parts.length;
    PT.f %= PT.fx.frames;
  }
  function tick() {
    if (dirty) rebuild();
    PT.f = (PT.f + 1) % PT.fx.frames;
    $('ptFrame').textContent = `кадр ${PT.f + 1} из ${PT.fx.frames} · частиц ${PT.count}`;
    V.redrawOver();
  }
  function play(on) {
    clearInterval(PT.timer); PT.timer = 0;
    if (on) PT.timer = setInterval(tick, 1000 / U.clamp(PT.fx.fps, 1, 60));
    const b = $('ptPlay'); if (b) b.textContent = PT.timer ? '❚❚' : '▶';
  }
  PT.drawOverlay = function (ctx) {
    if (S.tool !== 'particles' || !PT.fx) return;
    if (dirty) rebuild();
    const z = V.zoom, doc = NPR.doc, W = doc.width * z, H = doc.height * z;
    ctx.imageSmoothingEnabled = false;
    if (PT.litFrames && PT.litFrames[PT.f]) ctx.drawImage(PT.litFrames[PT.f], V.ox, V.oy, W, H);
    const c = PT.frames && PT.frames[PT.f];
    if (c) ctx.drawImage(c, V.ox, V.oy, W, H);
    const fx = PT.fx;
    if (fx.floorY !== null) { // пол
      const y = Math.round(V.oy + fx.floorY * z) + 0.5;
      ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(V.ox - 10, y); ctx.lineTo(V.ox + W + 10, y); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = '#3ddc84'; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#3ddc84'; ctx.font = '11px system-ui'; ctx.textBaseline = 'bottom'; ctx.fillText('пол', V.ox + W + 12, y + 5);
    }
    if (fx.attr) { // аттрактор
      const x = V.ox + (fx.attr.x + 0.5) * z, y = V.oy + (fx.attr.y + 0.5) * z;
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = '#c49bff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = '#c49bff'; ctx.fill();
    }
    fx.emitters.forEach((e, i) => {
      if (e.mode === 'sub') return; // дочерние рождаются там, где умер родитель
      const x = V.ox + (e.x + 0.5) * z, y = V.oy + (e.y + 0.5) * z, sel = i === PT.cur;
      ctx.strokeStyle = sel ? '#f2b63d' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = sel ? 2 : 1;
      ctx.setLineDash(sel ? [] : [3, 3]);
      ctx.beginPath();
      if (e.shape === 'line') { ctx.moveTo(x - (e.w / 2) * z, y); ctx.lineTo(x + (e.w / 2) * z, y); }
      else if (e.shape === 'circle') ctx.arc(x, y, Math.max(3, e.w * z), 0, Math.PI * 2);
      else if (e.shape === 'rect') ctx.rect(x - (e.w / 2) * z, y - (e.h / 2) * z, e.w * z, e.h * z);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x, y, sel ? 5 : 3.5, 0, Math.PI * 2); ctx.fillStyle = sel ? '#f2b63d' : '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    });
    const gids = groupIds(fx), curG = fx.emitters[PT.cur] && fx.emitters[PT.cur].g;
    if (gids.length > 1) { // подписи групп, чтобы не путаться, где какой эффект
      ctx.font = '11px system-ui'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = '#000';
      for (const g of gids) {
        const a = anchorOf(fx, g);
        if (!a || a.mode === 'sub') continue;
        const x = V.ox + (a.x + 0.5) * z + 8, y = V.oy + (a.y + 0.5) * z + 6, t = groupName(fx, g);
        ctx.strokeText(t, x, y); ctx.fillStyle = g === curG ? '#f2b63d' : '#ddd'; ctx.fillText(t, x, y);
      }
    }
  };
  function changed(structure) {
    dirty = true;
    if (structure) render();
    try { localStorage.setItem(KEY, JSON.stringify(PT.fx)); } catch (e) { /* не страшно */ }
    if (!PT.timer) V.redrawOver();
  }

  /* ---------- инструмент: источник, пол, аттрактор ---------- */
  let drag = null, dragFrom = null;
  NPR.tools.particles = {
    down(p, ev) {
      const fx = PT.fx, z = V.zoom;
      p = { ...p, shift: ev && ev.shiftKey, alt: ev && ev.altKey };
      if (PT.placing) { PT.placing = false; p.alt = false; } // только что добавленный эффект — ставим всю группу
      if (fx.attr && Math.hypot(V.ox + (fx.attr.x + 0.5) * z - p.sx, V.oy + (fx.attr.y + 0.5) * z - p.sy) < 10) drag = 'attr';
      else if (fx.floorY !== null && Math.abs(V.oy + fx.floorY * z - p.sy) < 6) drag = 'floor';
      else {
        let e = fx.emitters[PT.cur];
        if (!e) return false;
        if (p.shift) { PT.copyGroup(e.g, p.x, p.y); changed(true); NPR.toast('Копия «' + groupName(fx, e.g) + '» — в том же слое'); drag = null; return; }
        if (e.mode === 'sub') e = anchorOf(fx, e.g); // дочерний: двигаем всю группу
        if (!e || e.mode === 'sub') { NPR.toast('Этот излучатель рождается только «при смерти» другого — его нельзя поставить'); return false; }
        drag = p.alt ? 'emitter' : 'group';
        dragFrom = { e, x: e.x, y: e.y };
      }
      this.move(p);
    },
    move(p) {
      const fx = PT.fx;
      if (drag === 'attr') { fx.attr.x = p.x; fx.attr.y = p.y; }
      else if (drag === 'floor') fx.floorY = U.clamp(p.y, 0, NPR.doc.height);
      else if (drag === 'emitter') { const e = dragFrom.e; e.x = p.x; e.y = p.y; syncPos(); }
      else if (drag === 'group') { // вся группа едет вместе, сохраняя расстояния
        const dx = p.x - dragFrom.e.x, dy = p.y - dragFrom.e.y;
        for (const e of fx.emitters) if (e.g === dragFrom.e.g) { e.x += dx; e.y += dy; }
        syncPos();
      }
      else return;
      changed();
    },
    up() { if (drag === 'floor' || drag === 'attr') render(); drag = null; },
    cancel() { drag = null; },
  };
  function syncPos() { const e = PT.fx.emitters[PT.cur], o = $('ptPos'); if (e && o) o.textContent = `${e.x}, ${e.y}`; }

  /* ---------- создать слой(и) ---------- */
  PT.bake = function () {
    const doc = NPR.doc, W = doc.width, H = doc.height, fx = PT.fx;
    if (!fx.emitters.some((e) => e.on)) return NPR.toast('Нет включённых излучателей');
    const parts = PT.simulate(fx), frames = PT.renderAll(fx, W, H, parts), meta = clone(fx);
    const target = PT.lightTarget(fx), lit = PT.lightFrames(fx, W, H, parts, target);
    const edit = PT.editId && doc.getLayer(PT.editId);
    NPR.ops.snap(edit ? 'Изменение частиц' : 'Частицы', (d) => {
      let L;
      if (edit) { L = d.getLayer(PT.editId); L.frames = frames; L.frame = 0; L.data = frames[0]; L.particles = meta; L.depths = null; }
      else {
        L = d.newLayer(NPR.tf('Частицы: {0}', fx.name), frames[0]);
        L.frames = frames; L.frame = 0; L.particles = meta;
        d.addLayerRaw(L, d.indexOf(d.activeId) + 1);
      }
      if (lit && target) { // отблеск — отдельный слой поверх освещаемого, оригинал не меняется
        const gname = target.name + NPR.t(' — свет частиц'), old = d.layers.find((l) => l.name === gname && l.frames);
        if (old) d.layers.splice(d.indexOf(old.id), 1);
        const G = d.newLayer(gname, lit[0]);
        G.frames = lit; G.frame = 0;
        d.addLayerRaw(G, d.indexOf(target.id) + 1);
        d.activeId = L.id;
      }
    });
    PT.editId = null;
    syncButtons();
    NPR.toast(`Готово: ${fx.frames} кадров${lit ? ', и отдельный слой с отблеском на «' + target.name + '»' : ''}. Проиграть — в полосе кадров`);
  };
  PT.editLayer = function () {
    const L = NPR.doc.active;
    if (!L || !L.particles) return NPR.toast('Этот слой не из частиц');
    PT.fx = upgrade(clone(L.particles)); PT.cur = 0; PT.editId = L.id;
    changed(true);
    NPR.toast('Правьте эффект и нажмите «Обновить слой»');
  };

  /* ---------- панель-узлы ---------- */
  const HELP = {
    src: 'Где рождаются частицы. Щёлкните или тяните по холсту, чтобы поставить источник',
    birth: 'Сколько частиц, как долго живут (в кадрах) и что рождают, когда умирают',
    move: 'Скорость, направление и силы',
    attr: 'Притяжение к фиолетовой точке на холсте: воронка, портал, всасывание',
    floor: 'Зелёная линия на холсте — пол. Частицы отскакивают от неё или умирают. Ниже — столкновение с самим рисунком',
    size: 'Размер в начале и в конце жизни, в пикселях (для своего спрайта — во сколько раз увеличить)',
    form: 'Чем рисуется частица',
    color: 'Цвет и прозрачность от рождения к смерти',
    blend: 'Как частицы складываются друг с другом',
    light: 'Частицы освещают слой под собой: на каждом кадре свой отблеск',
  };
  /* Мини-редактор кривой: 5 точек по жизни частицы, тянутся мышью; плюс готовые формы. */
  const SIZE_CURVES = { 'ровно': [0, 0.25, 0.5, 0.75, 1], 'быстро в начале': [0, 0.6, 0.85, 0.96, 1], 'медленно в начале': [0, 0.05, 0.2, 0.5, 1],
    'вырос и сжался': [0, 1, 1, 1, 0], 'пульс': [0, 1, 0.3, 1, 0], 'сразу конечный': [1, 1, 1, 1, 1] };
  const SPEED_CURVES = { 'постоянная': [1, 1, 1, 1, 1], 'разгон': [0.2, 0.6, 1, 1.5, 2], 'торможение': [2, 1.2, 0.6, 0.3, 0.1], 'рывок и стоп': [2.5, 0.6, 0.2, 0.1, 0.05],
    'стоп и рывок': [0.1, 0.1, 0.4, 1.5, 2.5], 'толчками': [1.5, 0.3, 1.5, 0.3, 1.5] };
  function curveEditor(e, key, label, max, presets) {
    const W = 150, H = 46, c = el('canvas', { width: W, height: H, class: 'pcurve', title: 'Тяните точки. Слева — рождение, справа — смерть' });
    const ctx = c.getContext('2d'), pts = e[key], X = (i) => 6 + (i * (W - 12)) / 4, Y = (v) => H - 5 - (v / max) * (H - 10);
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = '#3a3a3a'; ctx.beginPath(); ctx.moveTo(6, Y(max === 1 ? 0 : 1)); ctx.lineTo(W - 6, Y(max === 1 ? 0 : 1)); ctx.stroke();
      ctx.strokeStyle = '#f2b63d'; ctx.lineWidth = 2; ctx.beginPath();
      for (let k = 0; k <= 40; k++) { const t = k / 40, x = 6 + t * (W - 12), y = Y(curveAt(pts, t)); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      pts.forEach((v, i) => { ctx.beginPath(); ctx.arc(X(i), Y(v), 3.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); });
    };
    let drag = -1;
    const at = (ev) => { const r = c.getBoundingClientRect(); return [((ev.clientX - r.left) * W) / r.width, ((ev.clientY - r.top) * H) / r.height]; };
    c.addEventListener('pointerdown', (ev) => { const [x] = at(ev); drag = Math.round(((x - 6) / (W - 12)) * 4); drag = U.clamp(drag, 0, 4); c.setPointerCapture(ev.pointerId); move(ev); });
    const move = (ev) => { if (drag < 0) return; const [, y] = at(ev); pts[drag] = +U.clamp(((H - 5 - y) / (H - 10)) * max, 0, max).toFixed(2); draw(); changed(); };
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', () => { drag = -1; });
    draw();
    const s = el('select', { title: 'Готовые формы кривой' }, el('option', { value: '' }, 'форма…'), Object.keys(presets).map((k) => el('option', { value: k }, k)));
    s.addEventListener('change', () => { if (presets[s.value]) { e[key] = presets[s.value].slice(); changed(true); } });
    return el('div', { class: 'row' }, el('span', { class: 'lbl' }, label), c, s);
  }
  const node = (title, key, ...rows) => el('section', { class: 'pnode', title: HELP[key] }, el('h4', null, title), ...rows);
  function spriteEditor(e) {
    const sp = e.sprite, box = el('div', { class: 'pspr', style: `grid-template-columns: repeat(${sp.w}, 14px)` });
    sp.px.forEach((h, i) => {
      const b = el('button', { type: 'button', class: 'cell', 'aria-label': 'Пиксель спрайта' });
      if (h) b.style.background = U.toCss(U.parseHex(h));
      const paint = (erase) => { sp.px[i] = erase ? '' : U.toHex(S.primary, true); spriteCache.delete(sp); changed(true); };
      b.addEventListener('click', () => paint(false));
      b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); paint(true); });
      box.append(b);
    });
    return box;
  }
  function render() {
    const fx = PT.fx, box = $('ptNodes');
    $('ptName').textContent = fx.name;
    $('ptFrames').value = fx.frames; $('ptFps').value = fx.fps; $('ptSeed').value = fx.seed;
    $('ptLoop').checked = fx.loop; $('ptAlpha').value = fx.alpha; $('ptPal').checked = fx.palette;
    const curG = fx.emitters[PT.cur] && fx.emitters[PT.cur].g, gids = groupIds(fx);
    $('ptTabs').replaceChildren(...gids.map((g) => {
      const tabs = fx.emitters.map((e, i) => [e, i]).filter(([e]) => e.g === g).map(([e, i]) => {
        const b = el('button', { type: 'button', 'aria-pressed': String(i === PT.cur), title: (e.mode === 'sub' ? 'Рождается при смерти другого излучателя. ' : '') + (e.on ? 'Включён' : 'Выключен'), class: (e.on ? '' : 'off') + (e.mode === 'sub' ? ' sub' : '') }, (e.mode === 'sub' ? '↳ ' : '') + e.name);
        b.addEventListener('click', () => { PT.cur = i; render(); V.redrawOver(); });
        return b;
      });
      const small = (t, title, fn) => { const b = el('button', { type: 'button', class: 'gbtn', title }, t); b.addEventListener('click', fn); return b; };
      const head = el('div', { class: 'ghead' },
        el('span', { class: 'gname', title: 'Группа: тяните её источник по холсту — двигается вся группа' }, groupName(fx, g)),
        small('✎', 'Переименовать группу', async () => {
          const v = await NPR.dialog({ title: 'Название группы', okLabel: 'Готово', fields: [{ id: 'n', label: 'Название', value: groupName(fx, g) }] });
          if (v && v.n.trim()) { fx.groups[g] = v.n.trim(); renameEffect(fx); changed(true); }
        }),
        small('⧉', 'Копия группы рядом (или Shift+щелчок по холсту — копия в это место)', () => { PT.copyGroup(g); changed(true); }),
        gids.length > 1 ? small('✕', 'Убрать группу из эффекта', () => { PT.removeGroup(g); changed(true); }) : null);
      return el('div', { class: 'pgroup' + (g === curG && gids.length > 1 ? ' cur' : '') }, gids.length > 1 ? head : null, el('div', { class: 'gtabs' }, ...tabs));
    }));
    const e = fx.emitters[PT.cur];
    if (!e) { box.replaceChildren(el('p', { class: 'note' }, 'Добавьте излучатель кнопкой «+».')); return; }
    const num = (key, lo, hi, step, label, title, idx, obj) => {
      obj = obj || e;
      const val = idx === undefined ? obj[key] : obj[key][idx];
      const inp = el('input', { type: 'number', min: lo, max: hi, step, value: +(+val).toFixed(3), inputmode: 'decimal' });
      inp.addEventListener('input', () => {
        if (inp.value === '' || Number.isNaN(+inp.value)) return;
        const v = U.clamp(+inp.value, lo, hi);
        if (idx === undefined) obj[key] = v; else obj[key][idx] = v;
        changed();
      });
      return el('label', { title: title || '' }, label, inp);
    };
    const sel = (key, opts, label, title) => {
      const s = el('select', { title: title || '' }, opts.map(([v, t]) => el('option', { value: v, selected: String(e[key]) === String(v) }, t)));
      s.addEventListener('change', () => { e[key] = typeof e[key] === 'number' ? +s.value : s.value; changed(true); });
      return el('label', null, label, s);
    };
    const chk = (key, label, title, after) => {
      const c = el('input', { type: 'checkbox' });
      c.checked = !!e[key];
      c.addEventListener('change', () => { e[key] = c.checked; if (after) after(); changed(true); });
      return el('label', { class: 'chk', title: title || '' }, c, ' ' + label);
    };
    const btn = (text, title, fn) => { const b = el('button', { type: 'button', title }, text); b.addEventListener('click', fn); return b; };
    const row = (...k) => el('div', { class: 'row' }, ...k);
    const name = el('input', { type: 'text', value: e.name, 'aria-label': 'Название излучателя' });
    name.addEventListener('change', () => { e.name = name.value.trim() || 'Излучатель'; changed(true); });
    const strip = el('div', { class: 'pstrip', title: 'Цвет по жизни: слева — рождение, справа — конец' });
    strip.style.background = 'linear-gradient(90deg,' + e.colors.map(([p, h]) => `${h} ${p * 100}%`).join(',') + '), repeating-conic-gradient(#666 0 25%, #999 0 50%) 0 0 / 8px 8px';
    const others = fx.emitters.map((o, i) => [i, o.name]).filter(([i]) => i !== PT.cur);
    const forms = el('div', { class: 'pforms' }, [['square', '■ квадрат'], ['circle', '● круг'], ['diamond', '◆ ромб'], ['plus', '✚ крест'], ['spark', '╱ штрих'], ['sprite', '★ свой спрайт']].map(([v, t]) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(e.form === v) }, t);
      b.addEventListener('click', () => { e.form = v; if (v === 'sprite' && !e.sprite) e.sprite = clone(SPRITES['Звёздочка']); changed(true); });
      return b;
    }));
    const spriteRows = e.form !== 'sprite' || !e.sprite ? [] : [
      row(el('label', null, 'готовый', (() => {
        const s = el('select', null, el('option', { value: '' }, 'выбрать…'), Object.keys(SPRITES).map((k) => el('option', { value: k }, k)));
        s.addEventListener('change', () => { if (SPRITES[s.value]) { e.sprite = clone(SPRITES[s.value]); changed(true); } });
        return s;
      })()), el('label', null, 'размер', (() => {
        const s = el('select', null, [3, 5, 8, 12].map((n) => el('option', { value: n, selected: n === e.sprite.w }, `${n}×${n}`)));
        s.addEventListener('change', () => { const n = +s.value; e.sprite = { w: n, h: n, px: Array(n * n).fill('') }; changed(true); });
        return s;
      })())),
      spriteEditor(e),
      row(btn('из выделения', 'Взять пиксели из выделения на холсте (до 16×16)', () => {
        if (!NPR.doc.sel && !NPR.doc.float) return NPR.toast('Сначала выделите маленький рисунок на холсте');
        if (!NPR.edit.copy()) return;
        const c = NPR.edit.clipboard, img = NPR.brushes.crop(c.data, c.w, c.h);
        if (!img) return NPR.toast('В выделении пусто');
        if (img.w > 16 || img.h > 16) return NPR.toast(`Спрайт не больше 16×16, а здесь ${img.w}×${img.h}`);
        e.sprite = { w: img.w, h: img.h, px: Array.from(img.data, (v) => (v >>> 24 ? U.toHex(v, true) : '')) };
        changed(true);
      }), el('span', { class: 'lbl' }, 'ЛКМ — рисовать основным цветом, ПКМ — стереть')),
      row(sel('spin', [['none', 'без вращения'], ['rotate', 'вращается'], ['flip', 'переворот (монетка)']], ''), num('spinSpeed', 0, 90, 1, 'скорость', 'Градусов за кадр'), chk('tint', 'красить цветом по жизни')),
    ];
    box.replaceChildren(
      row(chk('on', 'включён'), name),
      node('1. Источник', 'src',
        e.mode === 'sub'
          ? el('p', { class: 'lbl' }, 'Рождается там, где умерла частица другого излучателя.')
          : row(sel('shape', [['point', 'точка'], ['line', 'линия'], ['circle', 'круг'], ['rect', 'прямоугольник']], 'форма'), el('span', { class: 'pos' }, 'в ', el('b', { id: 'ptPos' }, `${e.x}, ${e.y}`))),
        e.mode === 'sub' || e.shape === 'point' ? null : row(num('w', 1, 2048, 1, e.shape === 'circle' ? 'радиус' : 'ширина'), e.shape === 'rect' ? num('h', 1, 2048, 1, 'высота') : null)),
      node('2. Рождение', 'birth',
        row(sel('mode', [['loop', 'поток'], ['burst', 'вспышка'], ['sub', 'только при смерти другого']], ''),
          e.mode === 'burst' ? num('burst', 0, 500, 1, 'частиц', 'Сколько частиц сразу') : e.mode === 'loop' ? num('rate', 0, 50, 0.1, 'в кадр', 'Сколько частиц рождается за кадр (0.5 — одна за два кадра)') : null),
        row(num('life', 1, 300, 1, 'жизнь от', 'Сколько кадров живёт частица', 0), num('life', 1, 300, 1, 'до', '', 1)),
        row(sel('death', [[-1, 'ничего'], ...others], 'при смерти рождать', 'Когда частица умирает, на её месте рождаются частицы другого излучателя'),
          e.death >= 0 ? num('deathCount', 0, 100, 0.25, '×', 'Сколько (дробное — с вероятностью: 0.3 — каждая третья)') : null),
        e.death >= 0 ? row(num('inherit', 0, 1, 0.05, 'наследовать скорость', 'Какую долю скорости родителя получают дети')) : null),
      node('3. Движение', 'move',
        row(num('speed', 0, 20, 0.05, 'скорость от', 'Пикселей за кадр', 0), num('speed', 0, 20, 0.05, 'до', '', 1)),
        row(num('dir', 0, 359, 1, 'направление', '270 — вверх, 90 — вниз, 0 — вправо'), num('spread', 0, 360, 1, 'разброс', 'Насколько направление случайно, в градусах')),
        row(num('gx', -2, 2, 0.005, 'сила →', 'Ветер: + вправо, − влево'), num('gy', -2, 2, 0.005, 'сила ↓', 'Гравитация: + вниз, − вверх (подъём горячего воздуха)')),
        row(num('drag', 0, 1, 0.01, 'торможение', 'Сопротивление воздуха'), num('wobble', 0, 10, 0.1, 'колебание', 'Покачивание, в пикселях'), num('wobbleFreq', 0, 1, 0.01, 'частота')),
        curveEditor(e, 'speedCurve', 'скорость по жизни', 3, SPEED_CURVES)),
      node('4. Аттрактор', 'attr',
        row(num('pull', -1, 1, 0.01, 'притяжение', 'Тянет к фиолетовой точке; минус — отталкивает'), num('swirl', -1, 1, 0.01, 'закрутка', 'Закручивает вокруг точки по спирали; минус — в другую сторону')),
        row(chk('absorb', 'исчезать в центре', 'Частица умирает, долетев до точки (можно запустить «при смерти»)'),
          fx.attr ? btn('убрать точку', 'Убрать аттрактор с холста', () => { fx.attr = null; changed(true); }) : btn('поставить точку', 'Аттрактор появится в центре холста — его можно тянуть', () => { fx.attr = { x: NPR.doc.width >> 1, y: NPR.doc.height >> 1 }; changed(true); }))),
      node('5. Пол и препятствия', 'floor',
        row(sel('floor', [['none', 'не замечает'], ['bounce', 'отскок'], ['die', 'умирает при ударе']], ''),
          e.floor === 'bounce' ? num('bounce', 0, 1, 0.05, 'упругость', '1 — отскок без потерь, 0 — падает и лежит') : null,
          e.floor === 'bounce' || e.collide === 'bounce' ? num('friction', 0, 1, 0.05, 'скольжение', 'Сколько горизонтальной скорости остаётся после удара') : null),
        row(sel('collide', [['none', 'проходит насквозь'], ['bounce', 'отскакивает'], ['die', 'умирает при ударе'], ['stick', 'прилипает']], 'рисунок:', 'Столкновение с непрозрачными пикселями слоя: искры от стены, капли на крыше, снег на ветке'),
          e.collide !== 'none' && e.floor !== 'bounce' && e.collide === 'bounce' ? num('bounce', 0, 1, 0.05, 'упругость') : null),
        e.collide !== 'none' ? row(el('label', null, 'препятствие — слой', (() => {
          const t = PT.collideLayer(fx), s = el('select', { title: 'Об какой слой ударяются частицы' }, NPR.doc.layers.filter((l) => !l.particles).map((l) => el('option', { value: l.id, selected: t && l.id === t.id }, l.name)));
          s.addEventListener('change', () => { fx.collideLayer = +s.value; changed(); });
          return s;
        })())) : null,
        row(fx.floorY !== null ? num('floorY', 0, 4096, 1, 'пол на y =', 'Можно тянуть зелёную линию на холсте', undefined, fx) : null,
          fx.floorY !== null ? btn('убрать пол', '', () => { fx.floorY = null; changed(true); }) : btn('поставить пол', 'Линия пола появится внизу холста — её можно тянуть', () => { fx.floorY = Math.round(NPR.doc.height * 0.85); changed(true); }))),
      node('6. Размер', 'size',
        row(num('size', 0, 32, 0.5, 'в начале', '', 0), num('size', 0, 32, 0.5, 'в конце', '', 1), num('sizeJitter', 0, 1, 0.05, 'разброс')),
        curveEditor(e, 'sizeCurve', 'как меняется', 1, SIZE_CURVES)),
      node('7. Форма', 'form', forms, ...spriteRows),
      node('8. Цвет по жизни', 'color', strip, row(
        btn('↻ из текущего градиента', 'Взять цвета из текущего градиента (панель вверху)', () => { e.colors = NPR.gradient.current.stops.map((s) => [+s.p.toFixed(4), U.toHex(s.c, true)]); changed(true); }),
        btn('в редактор', 'Открыть эти цвета в редакторе градиента, поправить и нажать «↻»', () => { NPR.gradient.select({ name: e.name, stops: e.colors.map(([p, h]) => ({ p, c: U.parseHex(h) })) }); NPR.gradient.toggleEditor(true); }))),
      node('9. Смешивание', 'blend', row(sel('blend', [['normal', 'обычное'], ['add', 'свечение (сложение)']], ''))),
      node('10. Свет на окружение', 'light',
        row(chk('glow', 'светится на окружение', 'Частицы этого излучателя освещают слой под собой')),
        e.glow || fx.emitters.some((o) => o.glow) ? row(el('label', null, 'освещает слой', (() => {
          const t = PT.lightTarget(fx), s = el('select', { title: 'Какой слой подсвечивать' }, NPR.doc.layers.filter((l) => !l.particles && !l.name.endsWith(NPR.t(' — свет частиц').trim())).map((l) => el('option', { value: l.id, selected: t && l.id === t.id }, l.name)));
          s.addEventListener('change', () => { fx.light.target = +s.value; changed(); });
          return s;
        })())) : null,
        e.glow || fx.emitters.some((o) => o.glow) ? row(num('strength', 0, 4, 0.1, 'сила', '', undefined, fx.light), num('radius', 2, 128, 1, 'радиус', 'Докуда достаёт свет, в пикселях', undefined, fx.light),
          num('height', 1, 32, 1, 'высота', 'Насколько частицы «над» рисунком: выше — свет мягче и ровнее', undefined, fx.light), num('tones', 1, 4, 1, 'тонов', 'Насколько сильно светлеет', undefined, fx.light)) : null),
    );
    syncButtons();
  }
  function syncButtons() {
    const L = NPR.doc && NPR.doc.active;
    $('ptEdit').disabled = !(L && L.particles);
    $('ptBake').textContent = PT.editId ? 'Обновить слой' : 'Создать спрайтшит';
  }
  function presetMenu(anchor) {
    const pick = (p) => { PT.fx = fromPreset(p); PT.cur = 0; PT.editId = null; changed(true); };
    NPR.popup(anchor, [
      ...PRESETS.map((p) => ({ label: p.name, action: () => pick(p) })),
      ...(mine.length ? ['-', ...mine.map((p) => ({ label: p.name + ' (мой)', action: () => { PT.fx = upgrade(clone(p)); PT.cur = 0; PT.editId = null; changed(true); } }))] : []),
      '-',
      { label: 'Сохранить эффект…', action: saveMine },
      { label: 'Удалить мой эффект…', disabled: !mine.length, action: async () => {
        const v = await NPR.dialog({ title: 'Удалить эффект', okLabel: 'Удалить', fields: [{ id: 'n', label: 'Какой', type: 'select', value: mine[0].name, options: mine.map((m) => [m.name, m.name]) }] });
        if (!v) return;
        mine = mine.filter((m) => m.name !== v.n);
        try { localStorage.setItem(MINE, JSON.stringify(mine)); } catch (e) { /* не страшно */ }
      } },
    ]);
  }
  async function saveMine() {
    const v = await NPR.dialog({ title: 'Сохранить эффект', okLabel: 'Сохранить', fields: [{ id: 'name', label: 'Название', value: PT.fx.name }] });
    if (!v) return;
    PT.fx.name = v.name.trim() || 'Мой эффект';
    const i = mine.findIndex((m) => m.name === PT.fx.name);
    if (i >= 0) mine[i] = clone(PT.fx); else mine.push(clone(PT.fx));
    try { localStorage.setItem(MINE, JSON.stringify(mine)); } catch (e) { NPR.toast('Не хватило места в браузере', true); }
    render();
    NPR.toast('Эффект сохранён');
  }
  PT.show = function (on) {
    $('ptPanel').hidden = !on;
    if (on) { if (!PT.fx) PT.fx = fromPreset(PRESETS[0]); dirty = true; render(); play(true); }
    else play(false);
    V.redrawOver();
  };

  PT.init = function () {
    try { PT.fx = JSON.parse(localStorage.getItem(KEY)); } catch (e) { PT.fx = null; }
    PT.fx = PT.fx && Array.isArray(PT.fx.emitters) ? upgrade(PT.fx) : null;
    try { mine = JSON.parse(localStorage.getItem(MINE)) || []; } catch (e) { mine = []; }
    const num = (id, key, lo, hi) => $(id).addEventListener('input', (e) => { if (e.target.value === '') return; PT.fx[key] = U.clamp(Math.round(+e.target.value) || lo, lo, hi); changed(); if (key === 'fps' && PT.timer) play(true); });
    num('ptFrames', 'frames', 2, 64); num('ptFps', 'fps', 1, 60); num('ptSeed', 'seed', 0, 999999);
    $('ptDice').addEventListener('click', () => { PT.fx.seed = (Math.random() * 999999) | 0; $('ptSeed').value = PT.fx.seed; changed(); });
    $('ptLoop').addEventListener('change', (e) => { PT.fx.loop = e.target.checked; changed(); });
    $('ptAlpha').addEventListener('change', (e) => { PT.fx.alpha = e.target.value; changed(); });
    $('ptPal').addEventListener('change', (e) => { PT.fx.palette = e.target.checked; changed(); });
    $('ptPresets').addEventListener('click', (e) => presetMenu(e.currentTarget));
    $('ptAddFx').addEventListener('click', (ev) => {
      const add = (p) => { PT.addPreset(p); PT.placing = true; changed(true); NPR.toast(`«${p.name}» добавлен в этот же эффект. Щёлкните по холсту, куда его поставить`); };
      NPR.popup(ev.currentTarget, [
        ...PRESETS.map((p) => ({ label: p.name, action: () => add(p) })),
        ...(mine.length ? ['-', ...mine.map((p) => ({ label: p.name + ' (мой)', action: () => add(p) }))] : []),
      ]);
    });
    $('ptAdd').addEventListener('click', () => {
      const doc = NPR.doc, src = PT.fx.emitters[PT.cur];
      PT.fx.emitters.push(src ? { ...clone(src), name: src.name + ' 2', death: -1 } : { ...em({}), g: 1, x: doc.width >> 1, y: Math.round(doc.height * 0.85) });
      if (!src) { PT.fx.groups = { 1: PT.fx.name }; }
      PT.cur = PT.fx.emitters.length - 1; changed(true);
    });
    $('ptDel').addEventListener('click', () => {
      const fx = PT.fx;
      if (!fx.emitters.length) return;
      const k = PT.cur;
      removeEmitters(fx, new Set([k])); // ссылки «при смерти» пересчитываются
      renameEffect(fx);
      PT.cur = Math.max(0, k - 1); changed(true);
    });
    $('ptPlay').addEventListener('click', () => play(!PT.timer));
    $('ptBake').addEventListener('click', PT.bake);
    $('ptEdit').addEventListener('click', PT.editLayer);
    NPR.on('layers', () => { if (!$('ptPanel').hidden) { syncButtons(); dirty = true; } });
    NPR.on('resized', () => { dirty = true; });
    NPR.on('docChanged', () => { if (!$('ptPanel').hidden) dirty = true; });
  };
})(window.NPR);
