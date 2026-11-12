'use strict';
/* Отмена/повтор. Два вида команд:
   - пиксельная: только изменённые пиксели (индекс, было, стало);
   - структурная: снимок списка слоёв до и после (буферы по ссылке).
   История ограничена по памяти, а не по числу шагов. */
(function (NPR) {
  class Grow {
    constructor() { this.a = new Uint32Array(256); this.n = 0; }
    push(v) {
      if (this.n === this.a.length) {
        const b = new Uint32Array(this.a.length * 2);
        b.set(this.a);
        this.a = b;
      }
      this.a[this.n++] = v;
    }
  }

  /* Транзакция: копит изменения одного слоя, пока идёт штрих. */
  class Tx {
    constructor(doc, layer) {
      this.doc = doc;
      this.layer = layer;
      this.mask = doc.txMask; // 0 — не тронут, 1 — закрашен, 2 — возвращён назад
      this.idx = new Grow();
      this.old = new Grow();
      this._resetBox();
      this.bx0 = Infinity; this.by0 = Infinity; this.bx1 = -1; this.by1 = -1;
    }
    _resetBox() { this.dx0 = Infinity; this.dy0 = Infinity; this.dx1 = -1; this.dy1 = -1; }
    _touch(i) {
      const w = this.doc.width, x = i % w, y = (i / w) | 0;
      if (x < this.dx0) this.dx0 = x;
      if (x > this.dx1) this.dx1 = x;
      if (y < this.dy0) this.dy0 = y;
      if (y > this.dy1) this.dy1 = y;
    }
    set(i, v) {
      const d = this.layer.data;
      if (this.mask[i] === 0) { this.idx.push(i); this.old.push(d[i]); }
      this.mask[i] = 1;
      d[i] = v;
      this._touch(i);
    }
    /* Вернуть пикселю исходное значение (для pixel-perfect). */
    restore(i) {
      if (this.mask[i] !== 1) return;
      const a = this.idx.a;
      for (let k = this.idx.n - 1; k >= 0; k--)
        if (a[k] === i) { this.layer.data[i] = this.old.a[k]; break; }
      this.mask[i] = 2;
      this._touch(i);
    }
    /* Передать накопленную грязную область документу. */
    sync() {
      if (this.dx1 < 0) return;
      this.doc.markDirty(this.dx0, this.dy0, this.dx1 - this.dx0 + 1, this.dy1 - this.dy0 + 1);
      if (this.dx0 < this.bx0) this.bx0 = this.dx0;
      if (this.dy0 < this.by0) this.by0 = this.dy0;
      if (this.dx1 > this.bx1) this.bx1 = this.dx1;
      if (this.dy1 > this.by1) this.by1 = this.dy1;
      this._resetBox();
    }
    /* Откатить всё и начать заново (предпросмотр фигур, отмена штриха). */
    revert() {
      const d = this.layer.data, a = this.idx.a, o = this.old.a, m = this.mask;
      for (let k = 0; k < this.idx.n; k++) { d[a[k]] = o[k]; m[a[k]] = 0; this._touch(a[k]); }
      this.idx.n = 0; this.old.n = 0;
      this.sync();
    }
    /* Завершить: вернуть команду или null, если ничего не изменилось. */
    commit(label) {
      this.sync();
      const d = this.layer.data, a = this.idx.a, o = this.old.a, m = this.mask, n = this.idx.n;
      let cnt = 0;
      for (let k = 0; k < n; k++) { m[a[k]] = 0; if (d[a[k]] !== o[k]) cnt++; }
      if (!cnt) return null;
      const idx = new Uint32Array(cnt), before = new Uint32Array(cnt), after = new Uint32Array(cnt);
      let j = 0;
      for (let k = 0; k < n; k++) {
        const i = a[k];
        if (d[i] !== o[k]) { idx[j] = i; before[j] = o[k]; after[j] = d[i]; j++; }
      }
      return new PixelCmd(label, this.layer.id, idx, pack(before), pack(after),
        { x: this.bx0, y: this.by0, w: this.bx1 - this.bx0 + 1, h: this.by1 - this.by0 + 1 }, this.layer.frames ? this.layer.frame : -1);
    }
  }

  /* Если все значения одинаковые (типичная заливка) — храним одно число. */
  function pack(arr) {
    const v = arr[0];
    for (let i = 1; i < arr.length; i++) if (arr[i] !== v) return arr;
    return v;
  }
  const sizeOf = (p) => (typeof p === 'number' ? 8 : p.byteLength);

  class PixelCmd {
    constructor(label, layerId, idx, before, after, box, frame) {
      Object.assign(this, { label, layerId, idx, before, after, box, frame });
      this.bytes = idx.byteLength + sizeOf(before) + sizeOf(after) + 64;
    }
    _apply(doc, vals) {
      const L = doc.getLayer(this.layerId);
      if (!L) return;
      if (L.frames && this.frame >= 0 && this.frame < L.frames.length && L.frame !== this.frame) {
        L.frame = this.frame; L.data = L.frames[this.frame]; // правка была в другом кадре — переходим к нему
        doc.markAllDirty();
      }
      const d = L.data, idx = this.idx;
      if (typeof vals === 'number') for (let k = 0; k < idx.length; k++) d[idx[k]] = vals;
      else for (let k = 0; k < idx.length; k++) d[idx[k]] = vals[k];
      doc.markDirty(this.box.x, this.box.y, this.box.w, this.box.h);
      doc.activeId = this.layerId;
    }
    undo(doc) { this._apply(doc, this.before); }
    redo(doc) { this._apply(doc, this.after); }
  }

  class SnapCmd {
    constructor(label, before, after) {
      this.label = label; this.before = before; this.after = after;
      const bufs = (s) => new Set(s.layers.flatMap((l) => l.frames || [l.data]));
      const a = bufs(after), b = bufs(before);
      let bytes = 256;
      for (const d of a) if (!b.has(d)) bytes += d.byteLength;
      for (const d of b) if (!a.has(d)) bytes += d.byteLength;
      this.bytes = bytes;
    }
    undo(doc) { doc.restore(this.before); }
    redo(doc) { doc.restore(this.after); }
  }

  /* Несколько команд как один шаг (например, замена цвета на всех слоях). */
  class GroupCmd {
    constructor(label, cmds) { this.label = label; this.cmds = cmds; this.bytes = cmds.reduce((n, c) => n + c.bytes, 0); }
    undo(doc) { for (let i = this.cmds.length - 1; i >= 0; i--) this.cmds[i].undo(doc); }
    redo(doc) { for (const c of this.cmds) c.redo(doc); }
  }

  class History {
    constructor() { this.undoStack = []; this.redoStack = []; this.bytes = 0; this.limit = 64 * 1048576; }
    push(cmd) {
      if (!cmd) return;
      this._drop(this.redoStack.splice(0));
      this.undoStack.push(cmd);
      this.bytes += cmd.bytes;
      this.trim();
      NPR.emit('history');
    }
    _drop(list) { for (const c of list) this.bytes -= c.bytes; }
    trim() {
      while (this.bytes > this.limit && this.undoStack.length > 1) this._drop([this.undoStack.shift()]);
    }
    undo(doc) {
      const c = this.undoStack.pop();
      if (!c) return null;
      c.undo(doc);
      this.redoStack.push(c);
      NPR.emit('history');
      return c;
    }
    redo(doc) {
      const c = this.redoStack.pop();
      if (!c) return null;
      c.redo(doc);
      this.undoStack.push(c);
      NPR.emit('history');
      return c;
    }
    clear() { this.undoStack = []; this.redoStack = []; this.bytes = 0; NPR.emit('history'); }
  }

  NPR.Tx = Tx;
  NPR.SnapCmd = SnapCmd;
  NPR.GroupCmd = GroupCmd;
  NPR.History = History;
})(window.NPR);
