// Score view — pure scoring tool (no immutable file written)
(function () {
  const { el } = UI;

  function render(params = {}) {
    const root = document.getElementById('view-score');
    UI.clear(root);
    const s = State.get();
    const rubric = Rubric.getRubric(s.activeRubric);

    const scriptId = params.scriptId;
    const script = scriptId ? State.getScript(scriptId) : null;

    // Local scoring state
    const scores = {};
    rubric.dimensions.forEach(d => scores[d.key] = 0);

    const header = el('div', { class: 'section-header' },
      el('div', {},
        el('h2', {}, '🎯 单稿打分'),
        el('p', { class: 'muted', style: { fontSize: '12px', marginTop: '2px' } },
          '只评分不写文件——便于反复试。如要建预测请去「预测」。')
      ),
      el('div', { class: 'row gap-sm' },
        scriptSelector(script ? script.id : null, val => render({ scriptId: val }))
      )
    );

    const compositeEl = el('div', { class: 'composite-value' }, '0.00');
    const compositeBox = el('div', { class: 'composite-box' },
      el('div', {},
        el('div', { class: 'composite-label' }, `当前 rubric: ${rubric.name}`),
        el('div', { class: 'composite-formula' }, rubric.formula)
      ),
      compositeEl
    );

    function recompute() {
      const v = Rubric.composite(scores, rubric);
      compositeEl.textContent = v.toFixed(2);
    }

    const dimRows = rubric.dimensions.map(d => dimRow(d, scores, recompute));

    const previewBox = script
      ? el('div', { class: 'card' },
          el('div', { class: 'card-title' }, '📄 稿子预览', el('span', { class: 'badge' }, `${script.content.length} 字`)),
          el('div', { class: 'mono', style: { whiteSpace: 'pre-wrap', fontSize: '12.5px',
            maxHeight: '320px', overflowY: 'auto', color: 'var(--text-dim)',
            background: 'var(--bg)', padding: '14px', borderRadius: '6px', border: '1px solid var(--border-soft)'
          } }, script.content || '（空）')
        )
      : el('div', { class: 'callout' }, '可选：从上方挑一份稿子，看着稿子打分会更准');

    const content = el('div', { class: 'grid grid-2' },
      el('div', { class: 'card' },
        el('div', { class: 'card-title' }, '7 维评分'),
        ...dimRows,
        compositeBox
      ),
      previewBox
    );

    const guidance = el('div', { class: 'callout warn', style: { marginTop: '16px' } },
      el('div', { class: 'callout-title' }, '⚠ 打分纪律'),
      '不要为了让分高而调高——这里是基准面，不是 wishlist。'
      + '5 分意味着 anchor 级（参考博主同分位的样本），看着 anchor 给分。'
    );

    root.append(header, content, guidance);
    recompute();
  }

  function scriptSelector(currentId, onChange) {
    const scripts = State.get().scripts;
    if (scripts.length === 0) return el('span', { class: 'muted' }, '（没有稿子可选）');
    const sel = el('select', { class: 'select', style: { minWidth: '260px' },
      onChange: e => onChange(e.target.value || null) },
      el('option', { value: '' }, '— 不绑定稿子 —'),
      ...scripts.map(s => el('option', { value: s.id, selected: s.id === currentId ? 'true' : null }, s.title))
    );
    return sel;
  }

  function dimRow(d, scores, onChange) {
    const btns = [];
    const btnEls = [];
    for (let i = 0; i <= 5; i++) {
      const b = el('button', { class: 'score-btn', onClick: () => {
        scores[d.key] = i;
        btnEls.forEach((x, j) => x.classList.toggle('active', j === i));
        outEl.textContent = i;
        onChange();
      } }, String(i));
      btnEls.push(b);
      btns.push(b);
    }
    const outEl = el('div', { class: 'dim-score-out' }, '0');

    return el('div', {
      class: 'dim-row',
      title: d.hint + '\n\n锚点:\n• ' + d.anchors.join('\n• ')
    },
      el('div', {},
        el('div', { class: 'dim-key' }, d.key),
        el('div', { class: 'dim-weight' }, '权重 ×' + d.weight)
      ),
      el('div', {},
        el('div', { class: 'dim-name' }, d.name),
        el('div', { class: 'dim-name-cn' }, d.name_cn + ' — ' + d.hint)
      ),
      el('div', { class: 'score-slider' }, ...btns),
      outEl
    );
  }

  window.Views = window.Views || {};
  window.Views.score = { render, title: '打分', sub: '7 维即时评分 · 不写文件' };
})();
