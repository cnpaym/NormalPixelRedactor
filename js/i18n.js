'use strict';
/* Язык интерфейса. Базовый — английский; русский включается кнопкой в меню.

   Исходные строки редактора написаны по-русски, а перевод — словарь
   NPR.I18N_EN (русский текст → английский). Переводится всё, что появляется
   на экране: текст и подсказки элементов (наблюдатель за DOM), диалоги,
   уведомления и подписи на холсте. Пользовательские данные (поля ввода,
   текст инструмента «Текст») не трогаются.

   Строки со вставками (`Кадр ${n} из ${m}`) лежат в словаре как «Кадр {0} из {1}»;
   склеенные строки («Слой 1 — тень») переводятся по частям. */
(function (NPR) {
  const KEY = 'npr.lang';
  let lang = 'en';
  try { lang = localStorage.getItem(KEY) || 'en'; } catch (e) { /* по умолчанию английский */ }
  NPR.lang = lang === 'ru' ? 'ru' : 'en';
  const DICT = NPR.I18N_EN || {};
  const CYR = /[А-Яа-яЁёЇїІіЄєҐґ]/;
  const cache = new Map();

  // шаблоны со вставками → регулярные выражения
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const templates = Object.keys(DICT).filter((k) => /\{\d\}/.test(k)).map((k) => {
    const order = [];
    const re = new RegExp('^' + esc(k).replace(/\\\{(\d)\\\}/g, (m, n) => { order.push(+n); return '([\\s\\S]*?)'; }) + '$');
    return { re, order, out: DICT[k], len: k.length };
  }).sort((a, b) => b.len - a.len); // длинные шаблоны точнее — первыми

  const SEPS = [' — ', ' · ', ': ', ' → ', ', ', ' / '];
  function core(s, depth) {
    if (Object.prototype.hasOwnProperty.call(DICT, s)) return DICT[s];
    for (const t of templates) {
      const m = t.re.exec(s);
      if (!m) continue;
      const vals = [];
      t.order.forEach((n, i) => { vals[n] = m[i + 1]; });
      return t.out.replace(/\{(\d)\}/g, (x, n) => (vals[n] === undefined ? '' : tr(vals[n], depth + 1)));
    }
    if (depth > 3) return null;
    // обрамление: многоточие, двоеточие, «…», стрелки, номера в скобках
    let m = /^(.*?)(…|:|\s*▾| ▸)$/.exec(s);
    if (m && m[1]) { const c = core(m[1], depth + 1); if (c !== null) return c + m[2]; }
    m = /^(.*\S)\s+\(([^()]*)\)$/.exec(s);
    if (m) { const c = core(m[1], depth + 1); if (c !== null) return c + ' (' + tr(m[2], depth + 1) + ')'; }
    m = /^(\d+\.\s+|[^\p{L}\d\s«]+\s*)(\S.*)$/u.exec(s); // «1. Градиент», «↓ среднее», «↳ Дым»
    if (m) { const c = core(m[2], depth + 1); if (c !== null) return m[1] + c; }
    m = /^«(.+)»$/.exec(s);
    if (m) { const c = core(m[1], depth + 1); if (c !== null) return '«' + c + '»'; }
    // склейка частей
    for (const sep of SEPS) {
      if (!s.includes(sep)) continue;
      const parts = s.split(sep), out = parts.map((p) => (CYR.test(p) ? core(p.trim(), depth + 1) : p));
      if (out.some((p, i) => p !== null && CYR.test(parts[i]))) return out.map((p, i) => (p === null ? parts[i] : p)).join(sep);
    }
    // строчная версия известной фразы («углубление: среднее» → «Углубление: среднее»)
    const first = s[0];
    if (first !== first.toUpperCase() && CYR.test(first)) {
      const c = core(first.toUpperCase() + s.slice(1), depth + 1);
      if (c !== null) return c[0].toLowerCase() + c.slice(1);
    }
    // «Слово остальное»: известное начало + известный или не русский хвост
    const words = s.split(' ');
    if (words.length > 1) for (let k = words.length - 1; k >= 1; k--) {
      const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
      const ca = CYR.test(a) ? core(a, depth + 1) : a;
      if (ca === null) continue;
      const cb = CYR.test(b) ? core(b, depth + 1) : b;
      if (cb !== null && (ca !== a || cb !== b)) return ca + ' ' + cb;
    }
    return null;
  }
  function tr(s, depth = 0) {
    if (NPR.lang !== 'en' || !s || !CYR.test(s)) return s;
    const hit = cache.get(s);
    if (hit !== undefined) return hit;
    const lead = /^\s*/.exec(s)[0], trail = /\s*$/.exec(s)[0], body = s.trim().replace(/\s+/g, ' ');
    const c = core(body, depth);
    const r = c === null ? s : lead + c + trail;
    if (cache.size > 5000) cache.clear();
    cache.set(s, r);
    return r;
  }
  NPR.t = tr;
  NPR.tf = (s, ...a) => tr(s).replace(/\{(\d)\}/g, (m, i) => (a[i] === undefined ? m : a[i])); // перевод с подстановкой

  /* ---------- экран ---------- */
  const ATTRS = ['title', 'aria-label', 'placeholder', 'data-label', 'alt'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);
  // текст внутри полей ввода и помеченного data-no-i18n — данные пользователя
  function skip(node, attr) {
    for (let n = node.nodeType === 1 ? node : node.parentNode; n; n = n.parentNode) {
      if (n.nodeType !== 1) continue;
      if (n.dataset && n.dataset.noI18n !== undefined) return true;
      if (!attr && (SKIP.has(n.tagName) || n.isContentEditable)) return true;
    }
    return false;
  }
  function translateText(node) {
    const v = node.nodeValue;
    if (!v || !CYR.test(v) || skip(node)) return;
    const t = tr(v);
    if (t !== v) node.nodeValue = t;
  }
  function translateEl(el) {
    if (skip(el, true)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && CYR.test(v)) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return translateText(root);
    if (root.nodeType !== 1 || skip(root, true)) return;
    translateEl(root);
    const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = it.nextNode(); n; n = it.nextNode()) { if (n.nodeType === 3) translateText(n); else translateEl(n); }
  }
  NPR.translateDom = walk;

  /* Подписи, нарисованные прямо на холсте (пол, группы частиц…). */
  function patchCanvas() {
    const P = CanvasRenderingContext2D.prototype;
    for (const fn of ['fillText', 'strokeText', 'measureText']) {
      const orig = P[fn];
      P[fn] = function (text, ...rest) { return orig.call(this, typeof text === 'string' ? tr(text) : text, ...rest); };
    }
  }

  NPR.setLang = async function (l) {
    try { localStorage.setItem(KEY, l); } catch (e) { /* не страшно */ }
    try { if (NPR.io && NPR.io.saveNow) await NPR.io.saveNow(); } catch (e) { /* не страшно */ }
    location.reload();
  };

  if (NPR.lang === 'en') {
    patchCanvas();
    document.documentElement.lang = 'en';
    const start = () => {
      walk(document.body);
      document.title = tr(document.title);
      new MutationObserver((list) => {
        for (const m of list) {
          if (m.type === 'characterData') translateText(m.target);
          else if (m.type === 'attributes') translateEl(m.target);
          else for (const n of m.addedNodes) walk(n);
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }
})(window.NPR);
