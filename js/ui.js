'use strict';
/* Мелкие элементы интерфейса: уведомления, выпадающие меню, диалоги. */
(function (NPR) {
  const { el } = NPR.util;

  NPR.toast = function (msg, isError) {
    const box = document.getElementById('toasts');
    const t = el('div', { class: 'toast' + (isError ? ' error' : ''), role: 'status' }, msg);
    box.append(t);
    setTimeout(() => t.remove(), isError ? 6000 : 3200);
  };

  let openPopup = null;
  NPR.closePopup = function () { if (openPopup) { openPopup.remove(); openPopup = null; } };
  /* items: {label, key, action, checked, disabled} или '-' */
  NPR.popup = function (anchor, items) {
    const same = openPopup && openPopup._anchor === anchor;
    NPR.closePopup();
    if (same) return;
    const m = el('div', { class: 'popup', role: 'menu' });
    for (const it of items) {
      if (it === '-') { m.append(el('hr')); continue; }
      const b = el('button', { type: 'button', role: 'menuitem', disabled: !!it.disabled },
        el('span', { class: 'check' }, it.checked ? '✓' : ''),
        el('span', { class: 'label' }, it.label),
        el('span', { class: 'key' }, it.key || ''));
      b.addEventListener('click', () => { NPR.closePopup(); it.action(); });
      m.append(b);
    }
    document.body.append(m);
    const r = anchor.getBoundingClientRect();
    m.style.left = Math.max(4, Math.min(r.left, innerWidth - m.offsetWidth - 4)) + 'px';
    m.style.top = Math.min(r.bottom + 2, innerHeight - m.offsetHeight - 4) + 'px';
    m._anchor = anchor;
    openPopup = m;
  };
  document.addEventListener('pointerdown', (e) => {
    if (openPopup && !openPopup.contains(e.target) && !openPopup._anchor.contains(e.target)) NPR.closePopup();
  }, true);

  /* Диалог с полями. Возвращает Promise со значениями или null при отмене.
     field: {id, label, type: number|text|select|checkbox|anchor|note|node, value, min, max, options}
     opts.check(values) может вернуть {warn, error} для живой подсказки. */
  NPR.dialog = function (opts) {
    return new Promise((resolve) => {
      const dlg = el('dialog', { class: 'dlg' });
      const form = el('form', { method: 'dialog' });
      form.append(el('h2', null, opts.title));
      const inputs = {};
      for (const f of opts.fields || []) {
        if (f.type === 'note') { form.append(el('p', { class: 'note' }, f.label)); continue; }
        if (f.type === 'node') { form.append(f.node); continue; }
        let input;
        if (f.type === 'select') {
          input = el('select', null, f.options.map(([v, t]) => el('option', { value: v, selected: String(v) === String(f.value) }, t)));
        } else if (f.type === 'checkbox') {
          input = el('input', { type: 'checkbox' });
          input.checked = !!f.value;
        } else if (f.type === 'anchor') {
          input = el('div', { class: 'anchor' });
          input.value = f.value || '0.5,0.5';
          for (const ay of [0, 0.5, 1]) for (const ax of [0, 0.5, 1]) {
            const v = ax + ',' + ay;
            const b = el('button', { type: 'button', 'aria-label': 'Привязка', 'aria-pressed': String(v === input.value) });
            b.addEventListener('click', () => {
              input.value = v;
              for (const o of input.children) o.setAttribute('aria-pressed', String(o === b));
            });
            input.append(b);
          }
        } else {
          input = el('input', { type: f.type || 'text', value: f.value, min: f.min, max: f.max, step: f.step });
          if (f.type === 'number') input.inputMode = 'numeric';
        }
        inputs[f.id] = { f, input };
        const row = el('label', { class: 'row' + (f.type === 'checkbox' ? ' inline' : '') }, el('span', null, f.label), input);
        form.append(row);
      }
      const msg = el('p', { class: 'msg' });
      const ok = el('button', { type: 'submit', class: 'primary' }, opts.okLabel || 'Готово');
      const cancel = el('button', { type: 'button' }, 'Отмена');
      form.append(msg, el('div', { class: 'buttons' }, opts.noCancel ? null : cancel, ok));
      dlg.append(form);
      document.body.append(dlg);

      const values = () => {
        const v = {};
        for (const id in inputs) {
          const { f, input } = inputs[id];
          v[id] = f.type === 'checkbox' ? input.checked : f.type === 'number' ? Number(input.value) : input.value;
        }
        return v;
      };
      const refresh = () => {
        const r = (opts.check && opts.check(values())) || {};
        msg.textContent = r.error || r.warn || '';
        msg.className = 'msg' + (r.error ? ' error' : r.warn ? ' warn' : '');
        ok.disabled = !!r.error;
        return !r.error;
      };
      form.addEventListener('input', refresh);
      let result = null;
      form.addEventListener('submit', (e) => { if (!refresh()) e.preventDefault(); else result = values(); });
      cancel.addEventListener('click', () => dlg.close());
      dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
      refresh();
      dlg.showModal();
      const first = form.querySelector('input,select');
      if (first) { first.focus(); if (first.select) first.select(); }
    });
  };

  NPR.dialogOpen = () => !!document.querySelector('dialog[open]');
})(window.NPR);
