'use strict';
/* Документ: слои с пикселями RGBA и программная компоновка.
   У слоя нет своего canvas — только Uint32Array. Итоговая картинка
   собирается в один буфер, и пересчитывается только изменённая область. */
(function (NPR) {
  const { blend } = NPR.util;
  let nextId = 1;

  class Layer {
    constructor(w, h, name, data) {
      this.id = nextId++;
      this.name = name || 'Слой ' + this.id;
      this.visible = true;
      this.opacity = 1;
      this.locked = false;
      this.alphaLock = false;
      this.frames = null; // кадры слоя-спрайтшита; data всегда указывает на текущий
      this.frame = 0;
      this.depth = null; // карта глубины для освещения (Uint8Array, см. fx.js)
      this.data = data || new Uint32Array(w * h);
    }
  }

  class Doc {
    constructor(w, h) {
      this.name = 'Без названия';
      this.layers = []; // [0] — нижний слой
      this.activeId = 0;
      this.sel = null; // {x,y,w,h}
      this.float = null; // «плавающие» пиксели выделения
      this.refs = []; // референсы (см. refs.js)
      this._alloc(w, h);
      this.addLayerRaw(new Layer(w, h, 'Слой 1'));
    }

    _alloc(w, h) {
      this.width = w;
      this.height = h;
      this.comp = new ImageData(w, h);
      this.comp32 = new Uint32Array(this.comp.data.buffer);
      if (!this.canvas) this.canvas = document.createElement('canvas');
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx = this.canvas.getContext('2d');
      this.txMask = new Uint8Array(w * h);
      this.dirty = { x0: 0, y0: 0, x1: w, y1: h };
    }

    get active() { return this.getLayer(this.activeId) || this.layers[this.layers.length - 1]; }
    getLayer(id) { return this.layers.find((l) => l.id === id); }
    indexOf(id) { return this.layers.findIndex((l) => l.id === id); }
    addLayerRaw(layer, index) {
      if (index === undefined) this.layers.push(layer);
      else this.layers.splice(index, 0, layer);
      this.activeId = layer.id;
      return layer;
    }
    newLayer(name, data) {
      if (!name) { // «Слой N» с первым свободным номером
        let n = this.layers.length + 1;
        while (this.layers.some((l) => l.name === 'Слой ' + n)) n++;
        name = 'Слой ' + n;
      }
      return new Layer(this.width, this.height, name, data);
    }

    markDirty(x, y, w, h) {
      let x0 = Math.max(0, x), y0 = Math.max(0, y);
      let x1 = Math.min(this.width, x + w), y1 = Math.min(this.height, y + h);
      if (x1 <= x0 || y1 <= y0) return;
      const d = this.dirty;
      if (!d) this.dirty = { x0, y0, x1, y1 };
      else {
        if (x0 < d.x0) d.x0 = x0;
        if (y0 < d.y0) d.y0 = y0;
        if (x1 > d.x1) d.x1 = x1;
        if (y1 > d.y1) d.y1 = y1;
      }
    }
    markAllDirty() { this.dirty = { x0: 0, y0: 0, x1: this.width, y1: this.height }; }

    /* Пересобирает изменённую область. Возвращает true, если что-то обновилось. */
    flush() {
      const d = this.dirty;
      if (!d) return false;
      this.dirty = null;
      const W = this.width, out = this.comp32;
      const { x0, y0, x1, y1 } = d;
      for (let y = y0; y < y1; y++) out.fill(0, y * W + x0, y * W + x1);
      for (const L of this.layers) {
        if (!L.visible || L.opacity <= 0) continue;
        const src = L.data, op = Math.round(L.opacity * 255);
        for (let y = y0; y < y1; y++) {
          const end = y * W + x1;
          for (let i = y * W + x0; i < end; i++) {
            let s = src[i];
            if (s >>> 24 === 0) continue;
            if (op < 255) {
              const a = ((s >>> 24) * op + 127) / 255 | 0;
              if (a === 0) continue;
              s = ((s & 0xffffff) | (a << 24)) >>> 0;
            }
            const o = out[i];
            out[i] = o >>> 24 === 0 || s >>> 24 === 255 ? s : blend(o, s);
          }
        }
      }
      this.ctx.putImageData(this.comp, 0, 0, x0, y0, x1 - x0, y1 - y0);
      return true;
    }

    /* Снимок структуры для отмены. Буферы пикселей не копируются:
       структурные операции создают новые буферы, а не меняют старые. */
    snapshot() {
      return {
        width: this.width, height: this.height, activeId: this.activeId,
        sel: this.sel && { ...this.sel },
        layers: this.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, locked: l.locked, alphaLock: l.alphaLock, data: l.data, frames: l.frames && l.frames.slice(), frame: l.frame, depth: l.depth })),
      };
    }
    restore(s) {
      const cur = new Map(this.layers.map((l) => [l.id, l]));
      if (s.width !== this.width || s.height !== this.height) this._alloc(s.width, s.height);
      this.layers = s.layers.map((p) => {
        const L = new Layer(0, 0, p.name, p.data);
        nextId--; // id берём из снимка
        Object.assign(L, p, cur.has(p.id) ? propsOf(cur.get(p.id)) : null);
        L.frames = p.frames ? p.frames.slice() : null;
        L.frame = p.frame || 0;
        L.depth = p.depth || null;
        L.data = p.data;
        return L;
      });
      this.activeId = s.activeId;
      this.sel = s.sel && { ...s.sel };
      this.float = null;
      this.markAllDirty();
    }
    setSize(w, h) { this._alloc(w, h); }
    bytes() { return this.layers.reduce((n, l) => n + (l.frames ? l.frames.length : 1), 0) * this.width * this.height * 4; }
  }
  const propsOf = (l) => ({ name: l.name, visible: l.visible, opacity: l.opacity, locked: l.locked, alphaLock: l.alphaLock });

  NPR.Layer = Layer;
  NPR.Doc = Doc;
  NPR.bumpLayerId = (id) => { if (id >= nextId) nextId = id + 1; };
})(window.NPR);
