// Candidates view — pool of topic candidates with sorting and recommendation
(function () {
  const { el, fmtDate } = UI;

  let filter = 'active';

  function render() {
    const root = document.getElementById('view-candidates');
    UI.clear(root);
    const s = State.get();

    const header = el('div', { class: 'section-header' },
      el('div', {},
        el('h2', {}, '🔥 候选池'),
        el('p', { class: 'muted', style: { fontSize: '12px' } },
          '抓热点 + 手加 + Seed 共同贡献。按 composite 排序，buffer 偏低时推 1 稳 + 1 实验。')
      ),
      el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn', onClick: () => recommend() }, '🎯 推荐下一题'),
        el('button', { class: 'btn btn-primary', onClick: openNew }, '+ 加候选')
      )
    );

    // Filter tabs
    const tabs = el('div', { class: 'row gap-sm', style: { marginBottom: '14px' } },
      tab('active', '活跃', s.candidates.filter(c => c.tier !== 'skip' && c.tier !== 'done').length),
      tab('tier1', 'Tier 1', s.candidates.filter(c => c.tier === 'tier1').length),
      tab('skip', '已跳过', s.candidates.filter(c => c.tier === 'skip').length),
      tab('done', '已发布', s.candidates.filter(c => c.tier === 'done').length),
      tab('all', '全部', s.candidates.length)
    );

    function tab(key, label, n) {
      return el('button', {
        class: 'btn btn-sm' + (filter === key ? ' btn-primary' : ''),
        onClick: () => { filter = key; render(); }
      }, `${label} · ${n}`);
    }

    let list = s.candidates;
    if (filter === 'active') list = list.filter(c => c.tier !== 'skip' && c.tier !== 'done');
    else if (filter !== 'all') list = list.filter(c => c.tier === filter);

    // sort by composite desc, then snapshotAt desc
    list = [...list].sort((a, b) => (b.composite || 0) - (a.composite || 0));

    const body = list.length === 0
      ? el('div', { class: 'card' },
          el('div', { class: 'empty' },
            el('div', { class: 'empty-icon' }, '🔥'),
            el('div', { class: 'empty-text' }, '候选池空'),
            el('div', { class: 'empty-sub' }, '加几条候选 / 抓个热点 / Seed 一批'),
            el('button', { class: 'btn btn-primary', onClick: openNew }, '+ 加第一条')
          )
        )
      : el('table', { class: 'table' },
          el('thead', {}, el('tr', {},
            el('th', {}, 'Tier'),
            el('th', {}, '标题'),
            el('th', {}, 'composite'),
            el('th', {}, '押 bucket'),
            el('th', {}, '来源'),
            el('th', {}, '日期'),
            el('th', {}, '操作'))),
          el('tbody', {},
            ...list.map(c => el('tr', {},
              el('td', {}, el('span', { class: 'badge ' + tierClass(c.tier) }, c.tier)),
              el('td', {}, c.title),
              el('td', { class: 'mono' }, c.composite || '—'),
              el('td', { class: 'mono dim' }, c.predictedBucket || '—'),
              el('td', { class: 'mono dim' }, c.source),
              el('td', { class: 'dim' }, fmtDate(c.snapshotAt)),
              el('td', { class: 'row gap-sm' },
                el('button', { class: 'btn btn-sm', onClick: () => openEdit(c) }, '编辑'),
                el('button', { class: 'btn btn-sm', onClick: () => promoteToScript(c) }, '→ 稿子'),
                el('button', { class: 'btn btn-sm', onClick: () => deleteIt(c) }, '−')
              )
            ))
          )
        );

    root.append(header, tabs, body);
  }

  function tierClass(t) {
    return { tier1: 'green', tier2: 'blue', tier3: 'yellow', skip: '', done: '', risky: 'red' }[t] || '';
  }

  function openNew() {
    let close;
    const title = el('input', { class: 'input', placeholder: '候选标题' });
    const tier = el('select', { class: 'select' },
      ...['tier1', 'tier2', 'tier3', 'risky', 'skip'].map(t => el('option', { value: t }, t)));
    const source = el('input', { class: 'input', value: 'pool:manual' });
    const content = el('textarea', { class: 'textarea', rows: '4', placeholder: '深读笔记 / 议题描述' });

    close = UI.modal({
      title: '+ 加候选',
      body: el('div', {},
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '标题'), title),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, 'Tier'), tier),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '来源'), source),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '笔记 (可选)'), content)
      ),
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消'),
        el('button', { class: 'btn btn-primary', onClick: () => {
          if (!title.value.trim()) { UI.toast('标题不能空', 'error'); return; }
          State.addCandidate({
            title: title.value.trim(),
            tier: tier.value,
            source: source.value,
            content: content.value,
            snapshotAt: State.today()
          });
          UI.toast('已加', 'success');
          close();
          render();
        }}, '加入')
      )
    });
  }

  function openEdit(c) {
    let close;
    const title = el('input', { class: 'input', value: c.title });
    const tier = el('select', { class: 'select' },
      ...['tier1', 'tier2', 'tier3', 'risky', 'skip', 'done'].map(t =>
        el('option', { value: t, selected: t === c.tier ? 'true' : null }, t)));
    const note = el('textarea', { class: 'textarea', rows: '3' }, c.note || '');

    close = UI.modal({
      title: '编辑候选',
      body: el('div', {},
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '标题'), title),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, 'Tier'), tier),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '备注'), note)
      ),
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消'),
        el('button', { class: 'btn btn-primary', onClick: () => {
          State.updateCandidate(c.id, {
            title: title.value, tier: tier.value, note: note.value
          });
          close();
          render();
        }}, '保存')
      )
    });
  }

  async function promoteToScript(c) {
    const s = await State.addScript({
      title: c.title,
      content: c.content || c.title,
      shortName: c.title
    });
    State.updateCandidate(c.id, { tier: 'done' });
    UI.toast(`已升为稿子 (auto-score: ${s.autoComposite || '—'})`, 'success');
    App.navigate('scripts');
  }

  function deleteIt(c) {
    UI.confirm({
      title: '删除候选？', danger: true,
      body: '不可撤销。',
      onConfirm: () => { State.deleteCandidate(c.id); render(); }
    });
  }

  function recommend() {
    const s = State.get();
    const buf = State.buffer();
    const active = s.candidates.filter(c => c.tier !== 'skip' && c.tier !== 'done');
    if (active.length === 0) { UI.toast('候选池空', 'warn'); return; }

    const sorted = [...active].sort((a, b) => (b.composite || 0) - (a.composite || 0));
    const safe = sorted[0];
    const experiment = sorted.length > 1 ? sorted[Math.min(2, sorted.length - 1)] : null;

    let close;
    const bufStatus = buf <= s.settings.bufferWarnThreshold ? '🔴 偏低 — 推稳' :
      buf > s.settings.bufferGoodThreshold ? '🟢 充足 — 可以实验' : '🟡 一般';

    close = UI.modal({
      title: '🎯 下一题推荐',
      body: el('div', {},
        el('div', { class: 'callout' },
          el('div', { class: 'callout-title' }, 'Buffer 状态：' + bufStatus),
          '推 1 稳 + 1 实验（buffer 充足时再考虑实验）'
        ),
        recCard('🟢 稳·安全选择', safe),
        experiment && recCard('🔥 实验·拉伸 rubric', experiment)
      ),
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '关闭')
      )
    });

    function recCard(label, c) {
      return el('div', { class: 'card', style: { marginTop: '12px' } },
        el('div', { class: 'card-title' }, label),
        el('div', { style: { fontSize: '14px', marginBottom: '8px' } }, c.title),
        el('div', { class: 'li-meta' }, `composite ${c.composite || '—'} · ${c.tier} · ${c.source}`),
        el('div', { class: 'mt' },
          el('button', { class: 'btn btn-primary btn-sm',
            onClick: () => { promoteToScript(c); close(); } }, '→ 升为稿子')
        )
      );
    }
  }

  window.Views = window.Views || {};
  window.Views.candidates = { render, title: '候选池', sub: '选题排序 · 1 稳 + 1 实验' };
})();
