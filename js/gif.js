'use strict';
/* GIF: анимация или одна картинка.

   GIF умеет максимум 256 цветов на кадр и только «полную» прозрачность.
   Поэтому:
   - если во всей анимации ≤ 255 цветов (почти всегда в пиксель-арте), палитра точная;
   - иначе цвета сводятся к 255 методом медианного разреза (свечение, градиенты);
   - полупрозрачное становится либо непрозрачным, либо прозрачным (порог), либо
     ложится на выбранный цвет фона.
   Кадры с прозрачностью стираются перед следующим (disposal 2), чтобы не копились. */
(function (NPR) {
  const G = (NPR.gif = {});

  /* ---------- палитра ---------- */
  const key = (c) => c & 0xffffff; // RGB без альфы
  function collect(frames) {
    const counts = new Map();
    for (const f of frames) for (let i = 0; i < f.length; i++) {
      const c = f[i];
      if (c >>> 24) { const k = key(c); counts.set(k, (counts.get(k) || 0) + 1); }
    }
    return counts;
  }
  /* Медианный разрез: делим «коробку» цветов по самой длинной стороне, пока коробок не станет n. */
  function medianCut(counts, n) {
    const all = [...counts.entries()].map(([k, w]) => [k & 255, (k >>> 8) & 255, (k >>> 16) & 255, w]);
    let boxes = [all];
    const range = (b, ch) => { let lo = 255, hi = 0; for (const c of b) { if (c[ch] < lo) lo = c[ch]; if (c[ch] > hi) hi = c[ch]; } return hi - lo; };
    while (boxes.length < n) {
      let bi = -1, best = -1, bch = 0;
      boxes.forEach((b, i) => {
        if (b.length < 2) return;
        for (let ch = 0; ch < 3; ch++) { const r = range(b, ch) * Math.sqrt(b.length); if (r > best) { best = r; bi = i; bch = ch; } }
      });
      if (bi < 0) break;
      const b = boxes[bi].sort((p, q) => p[bch] - q[bch]);
      let total = 0; for (const c of b) total += c[3];
      let acc = 0, cut = 1;
      for (let i = 0; i < b.length - 1; i++) { acc += b[i][3]; if (acc >= total / 2) { cut = i + 1; break; } }
      boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
    }
    return boxes.map((b) => {
      let r = 0, g = 0, bl = 0, w = 0;
      for (const c of b) { r += c[0] * c[3]; g += c[1] * c[3]; bl += c[2] * c[3]; w += c[3]; }
      return (Math.round(r / w) | (Math.round(g / w) << 8) | (Math.round(bl / w) << 16)) >>> 0;
    });
  }
  function nearest(pal, c) {
    const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const p = pal[i], d = 2 * ((p & 255) - r) ** 2 + 4 * (((p >>> 8) & 255) - g) ** 2 + 3 * (((p >>> 16) & 255) - b) ** 2;
      if (d < bd) { bd = d; bi = i; if (!d) break; }
    }
    return bi;
  }

  /* ---------- LZW ---------- */
  function lzw(idx, minSize, out) {
    const clear = 1 << minSize, eoi = clear + 1;
    let size = minSize + 1, next = eoi + 1, dict = new Map();
    let cur = 0, bits = 0;
    const block = [];
    const emit = (code) => {
      cur |= code << bits; bits += size;
      while (bits >= 8) { block.push(cur & 255); cur >>>= 8; bits -= 8; if (block.length === 255) { out.push(255, ...block); block.length = 0; } }
    };
    emit(clear);
    let prefix = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const k = idx[i], kk = prefix * 4096 + k, hit = dict.get(kk);
      if (hit !== undefined) { prefix = hit; continue; }
      emit(prefix);
      if (next < 4096) { dict.set(kk, next++); if (next > 1 << size && size < 12) size++; }
      else { emit(clear); dict = new Map(); size = minSize + 1; next = eoi + 1; }
      prefix = k;
    }
    emit(prefix); emit(eoi);
    if (bits > 0) block.push(cur & 255);
    if (block.length) out.push(block.length, ...block);
    out.push(0);
  }

  /* frames: массив Uint32Array w×h (альфа 0 = прозрачно, иначе непрозрачно).
     o: { delay — сотые доли секунды, loop — повторять бесконечно }. Возвращает Uint8Array. */
  G.encode = function (frames, w, h, o = {}) {
    const counts = collect(frames), hasT = frames.some((f) => f.some((c) => !(c >>> 24)));
    const room = hasT ? 255 : 256;
    let pal = counts.size <= room ? [...counts.keys()] : medianCut(counts, room);
    if (!pal.length) pal = [0];
    const T = hasT ? pal.length : -1; // прозрачный индекс — сразу за цветами
    const n = pal.length + (hasT ? 1 : 0);
    let bitsPal = 1; while (1 << bitsPal < n) bitsPal++;
    const exact = counts.size <= room, map = new Map();
    if (exact) pal.forEach((c, i) => map.set(c, i));

    const out = [];
    const str = (s) => { for (const ch of s) out.push(ch.charCodeAt(0)); };
    const u16 = (v) => out.push(v & 255, (v >> 8) & 255);
    str('GIF89a'); u16(w); u16(h);
    out.push(0x80 | ((bitsPal - 1) << 4) | (bitsPal - 1), hasT ? T : 0, 0);
    for (let i = 0; i < 1 << bitsPal; i++) { const c = pal[i] || 0; out.push(c & 255, (c >>> 8) & 255, (c >>> 16) & 255); }
    if (frames.length > 1 && o.loop !== false) { out.push(0x21, 0xff, 11); str('NETSCAPE2.0'); out.push(3, 1); u16(0); out.push(0); }
    const delay = Math.max(2, Math.round(o.delay || 10));
    for (const f of frames) {
      out.push(0x21, 0xf9, 4, (hasT ? (2 << 2) | 1 : 1 << 2), 0, 0, hasT ? T : 0, 0);
      out[out.length - 4] = delay & 255; out[out.length - 3] = (delay >> 8) & 255;
      out.push(0x2c); u16(0); u16(0); u16(w); u16(h); out.push(0);
      const idx = new Uint16Array(w * h);
      for (let i = 0; i < f.length; i++) {
        const c = f[i];
        if (!(c >>> 24)) { idx[i] = T; continue; }
        const k = key(c);
        let v = map.get(k);
        if (v === undefined) { v = nearest(pal, k); map.set(k, v); }
        idx[i] = v;
      }
      const minSize = Math.max(2, bitsPal);
      out.push(minSize);
      lzw(idx, minSize, out);
    }
    out.push(0x3b);
    return Uint8Array.from(out);
  };

  /* Подготовка кадров: прозрачность по правилу и масштаб. */
  G.prepare = function (frames, w, h, o) {
    const U = NPR.util, bg = o.bg === null || o.bg === undefined ? null : o.bg, k = o.scale || 1;
    return frames.map((f) => {
      let d = new Uint32Array(f.length);
      for (let i = 0; i < f.length; i++) {
        const c = f[i], a = c >>> 24;
        if (bg !== null) d[i] = a === 255 ? c : a === 0 ? bg | 0xff000000 : (U.blend(bg | 0xff000000, c) | 0xff000000) >>> 0;
        else d[i] = a >= (o.threshold ?? 128) ? (c | 0xff000000) >>> 0 : 0;
      }
      if (k > 1) d = U.scaleNearest(d, w, h, w * k, h * k);
      return d;
    });
  };
})(window.NPR);
