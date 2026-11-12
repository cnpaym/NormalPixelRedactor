'use strict';
/* Инструменты для Roblox.
   9-slice: четыре направляющие делят картинку на 9 частей; углы не тянутся,
   края тянутся в одну сторону, середина — в обе. Панель показывает, как
   картинка будет выглядеть растянутой, и выдаёт готовый SliceCenter.
   Luau-таблица для спрайтшитов собирается в frames.js (экспорт листа). */
(function (NPR) {
  const S = NPR.state, U = NPR.util, V = NPR.view;
  const $ = (id) => document.getElementById(id);
  const R = (NPR.roblox = {});

  function slice() {
    const d = NPR.doc;
    if (!d.slice) d.slice = { l: Math.floor(d.width / 3), t: Math.floor(d.height / 3), r: Math.floor(d.width / 3), b: Math.floor(d.height / 3) };
    const s = d.slice; // отступы не могут пересечься
    s.l = U.clamp(s.l, 0, d.width - 1); s.r = U.clamp(s.r, 0, d.width - 1 - s.l);
    s.t = U.clamp(s.t, 0, d.height - 1); s.b = U.clamp(s.b, 0, d.height - 1 - s.t);
    return s;
  }
  R.sliceCenter = function () {
    const d = NPR.doc, s = slice();
    return `Rect.new(${s.l}, ${s.t}, ${d.width - s.r}, ${d.height - s.b})`;
  };

  /* Нарисовать doc.canvas растянутым до w×h по правилам 9-slice. */
  function draw9(ctx, x, y, w, h, k) {
    const d = NPR.doc, s = slice(), W = d.width, H = d.height, img = d.canvas;
    const sx = [0, s.l, W - s.r, W], sy = [0, s.t, H - s.b, H];
    const dx = [x, x + s.l * k, x + w - s.r * k, x + w], dy = [y, y + s.t * k, y + h - s.b * k, y + h];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const sw = sx[i + 1] - sx[i], sh = sy[j + 1] - sy[j], dw = dx[i + 1] - dx[i], dh = dy[j + 1] - dy[j];
      if (sw > 0 && sh > 0 && dw > 0 && dh > 0) ctx.drawImage(img, sx[i], sy[j], sw, sh, dx[i], dy[j], dw, dh);
    }
  }
  function sync() {
    if ($('rbxPanel').hidden) return;
    const d = NPR.doc, s = slice();
    for (const k of ['l', 't', 'r', 'b']) { const i = $('rbx' + k.toUpperCase()); if (document.activeElement !== i) i.value = s[k]; }
    $('rbxOut').value = `SliceCenter = ${R.sliceCenter()}`;
    // предпросмотр растяжения
    d.flush();
    const c = $('rbxPreview'), ctx = c.getContext('2d'), fw = +$('rbxW').value / 100, fh = +$('rbxH').value / 100;
    const tw = d.width * fw, th = d.height * fh, k = Math.max(0.25, Math.min(c.width / tw, c.height / th, 8));
    const kk = k >= 1 ? Math.floor(k) : k;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    draw9(ctx, Math.round((c.width - tw * kk) / 2), Math.round((c.height - th * kk) / 2), Math.round(tw * kk), Math.round(th * kk), kk);
    $('rbxSize').textContent = `${Math.round(tw)}×${Math.round(th)} px`;
    V.redrawOver();
  }
  R.sync = sync;

  /* Направляющие на холсте; тянутся мышью. */
  let drag = null;
  NPR.tools.slice = {
    down(p) {
      const d = NPR.doc, s = slice(), z = V.zoom;
      const lines = [['l', 'x', s.l], ['r', 'x', d.width - s.r], ['t', 'y', s.t], ['b', 'y', d.height - s.b]];
      let best = null, bd = 12;
      for (const [k, ax, pos] of lines) {
        const dist = Math.abs((ax === 'x' ? V.ox + pos * z - p.sx : V.oy + pos * z - p.sy));
        if (dist < bd) { bd = dist; best = k; }
      }
      if (!best) return false;
      drag = best;
    },
    move(p) {
      if (!drag) return;
      const d = NPR.doc, s = slice(), z = V.zoom, fx = Math.round((p.sx - V.ox) / z), fy = Math.round((p.sy - V.oy) / z);
      if (drag === 'l') s.l = U.clamp(fx, 0, d.width - 1 - s.r);
      else if (drag === 'r') s.r = U.clamp(d.width - fx, 0, d.width - 1 - s.l);
      else if (drag === 't') s.t = U.clamp(fy, 0, d.height - 1 - s.b);
      else s.b = U.clamp(d.height - fy, 0, d.height - 1 - s.t);
      sync();
    },
    up() { if (drag) { drag = null; NPR.emit('docChanged'); } },
    cancel() { drag = null; },
  };
  R.drawOverlay = function (ctx) {
    if (S.tool !== 'slice') return;
    const d = NPR.doc, s = slice(), z = V.zoom, x0 = V.ox, y0 = V.oy, x1 = V.ox + d.width * z, y1 = V.oy + d.height * z;
    const line = (ax, pos) => {
      ctx.beginPath();
      if (ax === 'x') { const x = Math.round(V.ox + pos * z) + 0.5; ctx.moveTo(x, y0 - 12); ctx.lineTo(x, y1 + 12); }
      else { const y = Math.round(V.oy + pos * z) + 0.5; ctx.moveTo(x0 - 12, y); ctx.lineTo(x1 + 12, y); }
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = '#3ddc84'; ctx.stroke();
    };
    line('x', s.l); line('x', d.width - s.r); line('y', s.t); line('y', d.height - s.b);
  };
  R.show = function (on) { $('rbxPanel').hidden = !on; if (on) sync(); };

  R.init = function () {
    for (const k of ['l', 't', 'r', 'b']) $('rbx' + k.toUpperCase()).addEventListener('input', (e) => {
      if (e.target.value === '') return;
      slice()[k] = Math.max(0, Math.round(+e.target.value) || 0);
      sync(); NPR.emit('docChanged');
    });
    $('rbxW').addEventListener('input', sync);
    $('rbxH').addEventListener('input', sync);
    $('rbxCopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('rbxOut').value); NPR.toast('Скопировано'); }
      catch (e) { $('rbxOut').select(); NPR.toast('Не удалось скопировать автоматически: текст выделен, нажмите Ctrl+C'); }
    });
    $('rbxLua').addEventListener('click', () => NPR.frames.exportDialog());
    NPR.on('history', sync);
    NPR.on('layers', sync);
  };
})(window.NPR);
