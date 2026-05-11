// Trends view — single-purpose paste-to-pool interface
(function () {
  const { el } = UI;

  function render() {
    const root = document.getElementById('view-trends');
    UI.clear(root);

    const header = el('div', { class: 'section-header' },
      el('div', {},
        el('h2', {}, '📡 抓热点 → 候选池'),
        el('p', { class: 'muted', style: { fontSize: '12px' } },
          '把外部热榜 / 议题 / 同行选题贴进来，自动去重入候选池')
      ),
      el('button', { class: 'btn btn-ghost', onClick: () => App.navigate('candidates') }, '查看候选池 →')
    );

    const textarea = el('textarea', { class: 'textarea', rows: '12',
      placeholder: '每行一条标题，例如：\n\n哈哈长度——为什么"哈"越多越假\n关于"为你好"这件事\n弗洛伊德 21 世纪心理学家不敢承认的事' });
    const sourceInput = el('input', { class: 'input', value: 'trend:manual',
      placeholder: 'douyin / weibo / hackernews / manual …' });
    const tierSel = el('select', { class: 'select' },
      ...['tier2', 'tier3', 'tier1', 'risky'].map(t => el('option', { value: t }, t)));

    const card = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '粘贴入池'),
      el('div', { class: 'form-group' },
        el('label', { class: 'label' }, '标题（每行一条）'),
        textarea
      ),
      el('div', { class: 'grid grid-2' },
        el('div', { class: 'form-group' },
          el('label', { class: 'label' }, '来源标识'),
          sourceInput,
          el('div', { class: 'hint' }, '随便填，便于以后回溯')
        ),
        el('div', { class: 'form-group' },
          el('label', { class: 'label' }, '默认 tier'),
          tierSel
        )
      ),
      el('div', { class: 'row end' },
        el('button', { class: 'btn btn-primary', onClick: submit }, '入池')
      )
    );

    function submit() {
      const lines = textarea.value.split('\n').map(s => s.trim()).filter(Boolean);
      if (lines.length === 0) { UI.toast('没有内容', 'warn'); return; }
      const existing = new Set(State.get().candidates.map(c => c.title));
      let added = 0, dup = 0;
      for (const line of lines) {
        if (existing.has(line)) { dup++; continue; }
        State.addCandidate({
          title: line,
          source: sourceInput.value || 'trend:manual',
          tier: tierSel.value
        });
        added++;
      }
      UI.toast(`新增 ${added} 条，去重 ${dup} 条`, 'success');
      textarea.value = '';
      if (added > 0) {
        setTimeout(() => App.navigate('candidates'), 600);
      }
    }

    root.append(header, card);
  }

  window.Views = window.Views || {};
  window.Views.trends = { render, title: '抓热点', sub: '粘贴入候选池 · 自动去重' };
})();
