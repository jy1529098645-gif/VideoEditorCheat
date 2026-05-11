// Score view — auto-score a selected script + show diff if user overrides
(function () {
  const { el } = UI;

  function render(params = {}) {
    const root = document.getElementById('view-score');
    UI.clear(root);
    const s = State.get();
    const rubric = Rubric.getRubric(s.activeRubric);

    const scripts = s.scripts;
    const selectedId = params.scriptId || (scripts[0] && scripts[0].id);
    const script = selectedId ? State.getScript(selectedId) : null;

    const header = el('div', { class: 'section-header' },
      el('div', {},
        el('h2', {}, '🎯 自动打分'),
        el('p', { class: 'muted', style: { fontSize: '12px' } },
          '选稿子 → 系统基于文本启发式自动出 7 维分。改你不认同的——这里不写文件，去「预测」才落盘。')
      ),
      scriptSelector(selectedId, val => render({ scriptId: val }))
    );

    if (!script) {
      root.append(header, el('div', { class: 'card' },
        el('div', { class: 'empty' },
          el('div', { class: 'empty-icon' }, '📝'),
          el('div', { class: 'empty-text' }, '没有稿子可打分'),
          el('div', { class: 'empty-sub' }, '先去「稿子」建一份'),
          el('button', { class: 'btn btn-primary', onClick: () => App.navigate('scripts') }, '+ 写第一份')
        )
      ));
      return;
    }

    const autoScores = Scorer.scoreText(script.content);
    const scores = { ...autoScores };

    const compositeEl = el('div', { class: 'composite-value' }, '0.00');
    const compositeBox = el('div', { class: 'composite-box' },
      el('div', {},
        el('div', { class: 'composite-label' }, `${rubric.name} · 启发式自动`),
        el('div', { class: 'composite-formula' }, rubric.formula)
      ),
      compositeEl
    );

    const reasonOut = el('div', { class: 'muted', style: { fontSize: '13px', fontStyle: 'italic', marginTop: '10px' } });

    function recompute() {
      const v = Rubric.composite(scores, rubric);
      compositeEl.textContent = v.toFixed(2);
      reasonOut.textContent = '"' + Scorer.autoReason(scores, v) + '"';
    }

    const dimRows = rubric.dimensions.map(d => dimRow(d, scores, autoScores, recompute));
    dimRows.forEach((r, i) => {
      const k = rubric.dimensions[i].key;
      const v = scores[k];
      const btn = r.querySelectorAll('.score-btn')[v];
      if (btn) btn.classList.add('active');
    });
    recompute();

    const previewBox = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '📄 稿子预览',
        el('span', { class: 'badge', style: { marginLeft: '6px' } }, `${script.content.length} 字`),
        el('button', { class: 'btn btn-sm', style: { marginLeft: 'auto' },
          onClick: () => App.navigate('predict', { scriptId: script.id }) }, '→ 启动预测')
      ),
      el('div', { class: 'mono', style: { whiteSpace: 'pre-wrap', fontSize: '12.5px',
        maxHeight: '420px', overflowY: 'auto', color: 'var(--text-dim)',
        background: 'var(--bg)', padding: '14px', borderRadius: '6px', border: '1px solid var(--border-soft)'
      } }, script.content || '（空）')
    );

    const scoreCard = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '🤖 7 维自动评分',
        el('span', { class: 'badge', style: { marginLeft: '6px' } }, '点数字调整 = 标 user_override')),
      ...dimRows,
      compositeBox,
      reasonOut
    );

    root.append(header,
      el('div', { class: 'grid grid-2' }, scoreCard, previewBox),
      el('div', { class: 'callout warn', style: { marginTop: '16px' } },
        '⚠ 启发式评分仅是起点 — 不可代替你真正的判断。改得越多 → "+user_override" 字段越长 → 越能在复盘时诊断"用户直觉 vs 模型偏离"。'
      )
    );
  }

  function scriptSelector(currentId, onChange) {
    const scripts = State.get().scripts;
    if (scripts.length === 0) return el('span');
    return el('select', { class: 'select', style: { minWidth: '260px' },
      onChange: e => onChange(e.target.value || null) },
      el('option', { value: '' }, '— 选稿子 —'),
      ...scripts.map(s => el('option', { value: s.id, selected: s.id === currentId ? 'true' : null }, s.title))
    );
  }

  function dimRow(d, scores, autoScores, onChange) {
    const btnEls = [];
    const out = el('div', { class: 'dim-score-out' }, String(scores[d.key]));
    const tag = el('span', { class: 'badge', style: { fontSize: '9.5px', marginLeft: '4px' } }, '🤖');
    for (let i = 0; i <= 5; i++) {
      btnEls.push(el('button', { class: 'score-btn', onClick: () => {
        scores[d.key] = i;
        btnEls.forEach((x, j) => x.classList.toggle('active', j === i));
        out.textContent = i;
        if (i !== autoScores[d.key]) {
          tag.textContent = `✏️ ${autoScores[d.key]}→${i}`;
          tag.className = 'badge accent';
        } else {
          tag.textContent = '🤖';
          tag.className = 'badge';
        }
        tag.style.fontSize = '9.5px';
        tag.style.marginLeft = '4px';
        onChange();
      } }, String(i)));
    }
    return el('div', {
      class: 'dim-row',
      title: d.hint + '\n\n锚点:\n• ' + d.anchors.join('\n• ')
    },
      el('div', {},
        el('div', {}, el('span', { class: 'dim-key' }, d.key), tag),
        el('div', { class: 'dim-weight' }, '权重 ×' + d.weight)
      ),
      el('div', {},
        el('div', { class: 'dim-name' }, d.name),
        el('div', { class: 'dim-name-cn' }, d.name_cn + ' — ' + d.hint)
      ),
      el('div', { class: 'score-slider' }, ...btnEls),
      out
    );
  }

  window.Views = window.Views || {};
  window.Views.score = { render, title: '打分', sub: '🤖 自动评分 · 人复核' };
})();
