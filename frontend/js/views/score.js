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
        el('div', { class: 'composite-label' }, `${rubric.name} · 🤖 启发式自动评分`),
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
    recompute();

    const previewBox = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '📄 稿子预览',
        el('span', { class: 'badge', style: { marginLeft: '6px' } }, `${script.content.length} 字`)
      ),
      el('div', { class: 'mono', style: { whiteSpace: 'pre-wrap', fontSize: '12.5px',
        maxHeight: '420px', overflowY: 'auto', color: 'var(--text-dim)',
        background: 'var(--bg)', padding: '14px', borderRadius: '6px', border: '1px solid var(--border-soft)'
      } }, script.content || '（空）')
    );

    const scoreCard = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '🤖 7 维自动评分',
        el('span', { class: 'badge', style: { marginLeft: '6px' } }, '默认 AI 值；不认同就点「✎ 覆写」')),
      ...dimRows,
      compositeBox,
      reasonOut
    );

    const existing = State.getPrediction(script.id);

    root.append(header,
      el('div', { class: 'grid grid-2' }, scoreCard, previewBox),
      existing
        ? UI.nextCta({
            label: '该稿子已锁定预测',
            title: '查看 immutable 预测段',
            btnText: '查看预测',
            muted: true,
            onGo: () => App.navigate('predict', { view: existing.id })
          })
        : UI.nextCta({
            label: '下一步',
            title: '把这份打分推进到「盲预测」 — 提交后 immutable',
            btnText: '🚀 启动预测',
            onGo: () => App.navigate('predict', { scriptId: script.id })
          })
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
    const rowNode = el('div', {
      class: 'dim-row',
      title: d.hint + '\n\n锚点:\n• ' + d.anchors.join('\n• ')
    });
    const cell = UI.aiScoreCell(autoScores[d.key], (newVal) => {
      scores[d.key] = newVal;
      rowNode.classList.toggle('overridden', newVal !== autoScores[d.key]);
      onChange();
    });
    rowNode.append(
      el('div', {},
        el('div', { class: 'dim-key' }, d.key),
        el('div', { class: 'dim-weight' }, '×' + d.weight)
      ),
      el('div', {},
        el('div', { class: 'dim-name' }, d.name + ' · ' + d.name_cn),
        el('div', { class: 'dim-name-cn' }, d.hint)
      ),
      cell.node
    );
    return rowNode;
  }

  window.Views = window.Views || {};
  window.Views.score = { render, title: '打分', sub: '🤖 自动评分 · 人复核' };
})();
