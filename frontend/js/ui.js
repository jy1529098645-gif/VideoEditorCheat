// Shared UI primitives — toast, modal, helpers
(function () {
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') node.innerHTML = v;
      else if (v != null && v !== false) node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      if (c instanceof Node) node.appendChild(c);
      else node.appendChild(document.createTextNode(String(c)));
    }
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function toast(msg, kind = 'info', ttl = 3000) {
    const root = document.getElementById('toast-root');
    const t = el('div', { class: `toast ${kind}` }, msg);
    root.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity 0.2s';
      setTimeout(() => t.remove(), 220);
    }, ttl);
  }

  function modal({ title, body, footer, onClose, wide }) {
    const root = document.getElementById('modal-root');
    clear(root);
    const close = () => { clear(root); if (onClose) onClose(); };
    const bg = el('div', { class: 'modal-bg', onClick: e => { if (e.target === bg) close(); } },
      el('div', { class: 'modal', style: wide ? { maxWidth: '820px' } : {} },
        el('div', { class: 'modal-head' },
          el('h3', {}, title),
          el('button', { class: 'close-btn', onClick: close }, '×')
        ),
        el('div', { class: 'modal-body' }, body),
        footer && el('div', { class: 'modal-foot' }, footer)
      )
    );
    root.appendChild(bg);
    return close;
  }

  function confirm({ title, body, danger, confirmText = '确定', onConfirm }) {
    let close;
    close = modal({
      title,
      body: typeof body === 'string' ? el('div', {}, body) : body,
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消'),
        el('button', { class: danger ? 'btn btn-ghost danger' : 'btn btn-primary',
          onClick: () => { close(); onConfirm && onConfirm(); } }, confirmText)
      )
    });
  }

  function fmt(n, digits = 0) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('en', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  }

  function fmtPlays(plays) {
    // shows in 万 (Chinese)
    if (plays == null) return '—';
    const w = plays / 10000;
    if (w >= 100) return Math.round(w) + ' 万';
    if (w >= 10) return w.toFixed(1) + ' 万';
    if (w >= 1) return w.toFixed(2) + ' 万';
    return plays.toLocaleString() + '';
  }

  function fmtPct(x, digits = 2) {
    if (x == null) return '—';
    return (x * 100).toFixed(digits) + '%';
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return iso.slice(0, 10);
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString();
  }

  function daysSince(iso) {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  // ============ AI score cell — display-first, override on demand ============
  // Returns { node, getValue, isOverridden } so callers can read state.
  // onChange(newVal, isOverride) fires whenever the value changes.
  function aiScoreCell(autoVal, onChange) {
    let val = autoVal;
    let picking = false;
    const valBox = el('span', { class: 'ai-score-value' });
    const btn = el('button', { class: 'score-override-btn', title: '点击覆写 AI 评分' });
    const pickerWrap = el('span', { class: 'score-picker-inline', style: { display: 'none' } });
    const revert = el('button', { class: 'revert-btn', style: { display: 'none' }, title: '恢复 AI 默认' }, '↶');

    const pickerBtns = [];
    for (let i = 0; i <= 5; i++) {
      pickerBtns.push(el('button', { class: 'score-btn', onClick: () => {
        val = i;
        rerender();
        onChange && onChange(val, val !== autoVal);
      } }, String(i)));
    }
    pickerWrap.append(...pickerBtns);

    function rerender() {
      const isOv = val !== autoVal;
      valBox.classList.toggle('overridden', isOv);
      clear(valBox);
      valBox.appendChild(el('span', { class: 'ai-tag' }, isOv ? '✏️' : '🤖'));
      valBox.appendChild(el('span', {}, String(val)));
      if (isOv) valBox.appendChild(el('span', { class: 'ai-tag' }, `(was ${autoVal})`));
      revert.style.display = isOv ? 'inline-block' : 'none';
      pickerBtns.forEach((b, j) => b.classList.toggle('active', j === val));
      btn.textContent = picking ? '✕ 关' : (isOv ? '改' : '✎ 覆写');
      btn.classList.toggle('active', picking);
      pickerWrap.style.display = picking ? 'inline-flex' : 'none';
    }

    btn.addEventListener('click', () => { picking = !picking; rerender(); });
    revert.addEventListener('click', () => {
      val = autoVal;
      picking = false;
      rerender();
      onChange && onChange(val, false);
    });

    rerender();
    const node = el('div', { class: 'ai-score-cell' }, valBox, revert, pickerWrap, btn);
    return { node, getValue: () => val, isOverridden: () => val !== autoVal };
  }

  // ============ Next-step CTA banner ============
  function nextCta({ label, title, btnText, onGo, muted }) {
    return el('div', { class: 'next-cta' + (muted ? ' muted-cta' : '') },
      el('div', { class: 'next-cta-text' },
        el('div', { class: 'next-cta-label' }, label),
        el('div', { class: 'next-cta-title' }, title)
      ),
      el('button', { class: 'next-cta-btn', onClick: onGo }, btnText)
    );
  }

  window.UI = { el, clear, toast, modal, confirm, fmt, fmtPlays, fmtPct, fmtDate, fmtDateTime, daysSince, aiScoreCell, nextCta };
})();
