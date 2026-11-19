'use strict';
/* NormalPixelRedactor — общие утилиты: цвет, PNG, файлы.
   Цвет пикселя хранится одним числом Uint32 в порядке ABGR (little-endian),
   то есть так же, как лежат байты RGBA в ImageData. */
window.NPR = window.NPR || {};
(function (NPR) {
  const U = (NPR.util = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.rgba = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  U.R = (c) => c & 255;
  U.G = (c) => (c >>> 8) & 255;
  U.B = (c) => (c >>> 16) & 255;
  U.A = (c) => c >>> 24;

  const h2 = (n) => (n < 16 ? '0' : '') + n.toString(16);
  U.toHex = (c, alpha) =>
    '#' + h2(c & 255) + h2((c >>> 8) & 255) + h2((c >>> 16) & 255) +
    (alpha === true || (alpha === undefined && c >>> 24 !== 255) ? h2(c >>> 24) : '');
  U.toCss = (c) => `rgba(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255},${(c >>> 24) / 255})`;

  U.parseHex = function (s) {
    s = String(s).trim().replace(/^#/, '').toLowerCase();
    if (!/^[0-9a-f]+$/.test(s)) return null;
    if (s.length === 3 || s.length === 4) s = s.replace(/./g, '$&$&');
    if (s.length !== 6 && s.length !== 8) return null;
    const n = (i) => parseInt(s.substr(i, 2), 16);
    return U.rgba(n(0), n(2), n(4), s.length === 8 ? n(6) : 255);
  };

  U.hsvToRgb = function (h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  };
  U.rgbToHsv = function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, mx ? d / mx : 0, mx];
  };

  /* Наложение src поверх dst (обычный альфа-блендинг, без премультипликации). */
  U.blend = function (dst, src) {
    const sa = src >>> 24;
    if (sa === 255) return src;
    if (sa === 0) return dst;
    const da = dst >>> 24;
    if (da === 0) return src;
    const k = da * (255 - sa);
    const oa = sa * 255 + k;
    const r = ((src & 255) * sa * 255 + (dst & 255) * k) / oa;
    const g = (((src >>> 8) & 255) * sa * 255 + ((dst >>> 8) & 255) * k) / oa;
    const b = (((src >>> 16) & 255) * sa * 255 + ((dst >>> 16) & 255) * k) / oa;
    return ((Math.round(oa / 255) << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
  };

  /* ---------- сжатие и base64 ---------- */
  U.hasCompression = typeof CompressionStream !== 'undefined';
  async function pipe(bytes, stream) {
    const s = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  U.deflate = (bytes) => pipe(bytes, new CompressionStream('deflate'));
  U.inflate = (bytes) => pipe(bytes, new DecompressionStream('deflate'));

  U.toBase64 = function (bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  U.fromBase64 = function (str) {
    const s = atob(str), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  };

  /* ---------- свой PNG-кодировщик ----------
     canvas.toBlob портит полупрозрачные пиксели (премультипликация),
     поэтому PNG собирается вручную: точные значения RGBA. */
  let crcTable = null;
  function crc32(buf, crc) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
    }
    crc = ~crc;
    for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 255] ^ (crc >>> 8);
    return ~crc >>> 0;
  }
  function chunk(type, data) {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length), 0));
    return out;
  }
  U.encodePNG = async function (w, h, px32) {
    if (!U.hasCompression) return null;
    const src = new Uint8Array(px32.buffer, px32.byteOffset, w * h * 4);
    const raw = new Uint8Array((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) raw.set(src.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
    const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
    dv.setUint32(0, w); dv.setUint32(4, h);
    ihdr[8] = 8; ihdr[9] = 6;
    const idat = await U.deflate(raw);
    return new Blob(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))],
      { type: 'image/png' });
  };
  /* Запасной путь через canvas, если CompressionStream недоступен. */
  U.canvasPNG = function (w, h, px32) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const id = new ImageData(new Uint8ClampedArray(px32.buffer.slice(px32.byteOffset, px32.byteOffset + w * h * 4)), w, h);
    c.getContext('2d').putImageData(id, 0, 0);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  };
  U.makePNG = async (w, h, px32) => (await U.encodePNG(w, h, px32)) || U.canvasPNG(w, h, px32);

  /* Масштабирование без размытия (ближайший сосед). */
  U.scaleNearest = function (src, w, h, nw, nh) {
    const out = new Uint32Array(nw * nh);
    for (let y = 0; y < nh; y++) {
      const sy = Math.min(h - 1, Math.floor(((y + 0.5) * h) / nh)) * w, o = y * nw;
      for (let x = 0; x < nw; x++) out[o + x] = src[sy + Math.min(w - 1, Math.floor(((x + 0.5) * w) / nw))];
    }
    return out;
  };

  /* ---------- файлы ---------- */
  U.download = function (blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  U.pickFile = function (accept) {
    return new Promise((res) => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = accept;
      i.onchange = () => res(i.files[0] || null);
      i.click();
    });
  };
  /* Картинка (File/Blob) → {w, h, data: Uint32Array}. */
  U.decodeImage = async function (blob) {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height);
    return { w: c.width, h: c.height, data: new Uint32Array(id.data.buffer) };
  };

  U.el = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null) e.append(k);
    return e;
  };
  /* ---------- события и общее состояние ---------- */
  const handlers = {};
  NPR.on = (name, fn) => (handlers[name] = handlers[name] || []).push(fn);
  NPR.emit = (name, arg) => { for (const fn of handlers[name] || []) fn(arg); };

  NPR.state = {
    tool: 'pencil',
    primary: U.rgba(0, 0, 0),
    secondary: U.rgba(255, 255, 255),
    brushSize: 1,
    brushShape: 'square', // square | circle | b:<название своей кисти>
    dither: 0, // узор кисти: 0 — сплошная, 1 — 25%, 2 — 50%, 3 — 75%
    shade: false, // карандаш не красит, а сдвигает тон: ЛКМ светлее, ПКМ темнее
    outlineInside: false, outlineDiag: false, outlineWidth: 1,
    pixelPerfect: false,
    filled: false,
    contiguous: true,
    symX: false,
    symY: false,
    grid: true,
    customGrid: false,
    gridW: 16,
    gridH: 16,
    tile: 'off', // копия холста рядом: off | right | down | all (3×3)
    hideGrids: false, // общий выключатель всех сеток
    gradType: 'linear', // linear | radial | angular | diamond
    gradAngle: 0,
    gradSteps: 0, // 0 — плавно, 2–64 — число ступеней
    gradDither: false,
    gradBlend: false, // накладывать поверх пикселей, а не заменять их
    showGrads: true,
    tolerance: 0, // допуск заливки и палочки, 0–255
    sampleAll: false, // искать область по всем видимым слоям
    penOnly: false, // пальцы только двигают холст
    touchCursor: false, // палец водит курсор, рисует кнопка «✎»
  };

  U.fmtBytes = (n) => (n < 1048576 ? (n / 1024).toFixed(0) + ' КБ' : (n / 1048576).toFixed(1) + ' МБ');
})(window.NPR);
