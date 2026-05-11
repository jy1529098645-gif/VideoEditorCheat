// Score view — read-only AI scoring of a selected script
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
        el('h2', {}, '🎯 AI 评分'),
        el('p', { class: 'muted', style: { fontSize: '12px' } },
          '选稿子 → AI 基于文本自动出 7 维分。分数由稿子内容决定 — 不可手改。')
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
    const composite = Rubric.composite(autoScores, rubric);
    const reason = Scorer.autoReason(autoScores, composite);

    const dimRows = rubric.dimensions.map(d => dimRow(d, autoScores));
    const compositeBox = el('div', { class: 'composite-box' },
      el('div', {},
        el('div', { class: 'composite-label' }, `${rubric.name} · 🤖 启发式自动`),
        el('div', { class: 'composite-formula' }, rubric.formula)
      ),
      el('div', { class: 'composite-value' }, composite.toFixed(2))
    );
    const reasonOut = el('div', { class: 'muted', style: { fontSize: '13px', fontStyle: 'italic', marginTop: '10px' } },
      '"' + reason + '"');

    const previewBox = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '📄 稿子预览',
        el('span', { class: 'badge', style: { marginLeft: '6px' } }, `${script.content.length} 字`),
        el('button', { class: 'btn btn-sm', style: { marginLeft: 'auto' },
          onClick: () => App.navigate('scripts') }, '✎ 改稿子')
      ),
      el('div', { class: 'mono', style: { whiteSpace: 'pre-wrap', fontSize: '12.5px',
        maxHeight: '420px', overflowY: 'auto', color: 'var(--text-dim)',
        background: 'var(--bg)', padding: '14px', borderRadius: '6px', border: '1px solid var(--border-soft)'
      } }, script.content || '（空）')
    );

    const scoreCard = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '🤖 7 维评分',
        el('span', { class: 'badge', style: { marginLeft: '6px' } }, 'AI 自动 · 只读')),
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

  function dimRow(d, scores) {
    return el('div', {
      class: 'dim-row',
      title: d.hint + '\n\n锚点:\n• ' + d.anchors.join('\n• ')
    },
      el('div', {},
        el('div', { class: 'dim-key' }, d.key),
        el('div', { class: 'dim-weight' }, '×' + d.weight)
      ),
      el('div', {},
        el('div', { class: 'dim-name' }, d.name + ' · ' + d.name_cn),
        el('div', { class: 'dim-name-cn' }, d.hint)
      ),
      UI.aiScoreReadonly(scores[d.key])
    );
  }

  window.Views = window.Views || {};
  window.Views.score = { render, title: '打分', sub: '🤖 AI 自动评分 · 只读' };
})();
