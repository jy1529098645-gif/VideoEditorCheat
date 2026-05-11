// App bootstrap — router, sidebar wiring, topbar handlers
(function () {
  const VIEWS = ['dashboard', 'scripts', 'score', 'predict', 'pipeline',
    'retro', 'rubric', 'bump', 'candidates', 'benchmark', 'trends', 'settings'];

  let current = 'dashboard';

  function navigate(view, params = {}) {
    if (!VIEWS.includes(view)) view = 'dashboard';
    current = view;

    // Update sidebar active state
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Update topbar
    const def = window.Views[view];
    document.getElementById('page-title').textContent = def.title;
    document.getElementById('page-sub').textContent = def.sub;

    // Hide all, show current
    VIEWS.forEach(v => {
      const node = document.getElementById('view-' + v);
      if (node) node.classList.toggle('hidden', v !== view);
    });

    // Render
    try {
      def.render(params);
    } catch (e) {
      console.error('View render failed', view, e);
      UI.toast('渲染出错：' + e.message, 'error');
    }

    // Persist last view
    try { localStorage.setItem('cheat-on-content:last-view', view); } catch (e) {}
  }

  function refreshBadges() {
    const s = State.get();
    const counts = {
      scripts: s.scripts.length,
      buffer: State.buffer(),
      pendingRetros: State.pendingRetros().length,
      candidates: s.candidates.filter(c => c.tier !== 'skip' && c.tier !== 'done').length
    };
    document.querySelectorAll('.nav-badge[data-count]').forEach(badge => {
      const key = badge.dataset.count;
      const n = counts[key];
      badge.textContent = n > 0 ? String(n) : '';
    });
    // Footer
    document.getElementById('footer-calibration').textContent =
      State.calibrationSamples() + ' / ' + s.settings.minSamplesForBump;
    document.getElementById('footer-rubric').textContent =
      Rubric.getRubric(s.activeRubric).version;
  }

  function wireUi() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.view));
    });

    document.getElementById('btn-export').addEventListener('click', () => {
      const json = State.exportJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cheat-on-content-${State.today()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      UI.toast('已导出', 'success');
    });

    document.getElementById('btn-import').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });

    document.getElementById('btn-help').addEventListener('click', showHelp);

    document.getElementById('import-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const txt = await file.text();
        State.importJson(txt);
        UI.toast('已导入 ✓ — 刷新界面', 'success');
        navigate(current);
      } catch (err) {
        UI.toast('导入失败：' + err.message, 'error');
      }
      e.target.value = '';
    });

  }

  function showHelp() {
    const el = UI.el;
    UI.modal({
      title: '🛡 5 阶段循环 · 三条铁律',
      wide: true,
      body: el('div', {},
        el('div', { class: 'callout' },
          el('div', { class: 'callout-title' }, '5 阶段循环'),
          el('div', { class: 'mono', style: { fontSize: '13px', lineHeight: '2', marginTop: '6px' } },
            '📊 打分 → 🎯 盲预测 → 🚀 发布 → 📈 T+3d 复盘 → 🧬 进化 rubric')
        ),
        el('div', { style: { marginTop: '14px' } },
          el('h3', { style: { fontSize: '14px', marginBottom: '8px' } }, '三条不可妥协原则'),
          el('ol', { style: { paddingLeft: '20px', fontSize: '13px', lineHeight: '1.85' } },
            el('li', {}, el('strong', {}, '盲预测：'), '预测段写完即 immutable — 不可改'),
            el('li', {}, el('strong', {}, '升级 = 全量重打：'), 'rubric 升级时所有历史样本必须重打分'),
            el('li', {}, el('strong', {}, 'rubric 是工作台：'), '失效的观察删掉，不留历史')
          )
        ),
        el('div', { style: { marginTop: '14px' } },
          el('h3', { style: { fontSize: '14px', marginBottom: '8px' } }, '7 维评分'),
          el('div', { class: 'mono', style: { fontSize: '12px', color: 'var(--text-dim)' } },
            'ER 情感共鸣 · SR 社会共振 · HP 钩子 · QL 金句 · NA 叙事 · AB 受众广度 · SAT 讽刺深度')
        )
      ),
      footer: el('div', { class: 'row end' },
        el('button', { class: 'btn btn-primary',
          onClick: () => document.getElementById('modal-root').innerHTML = '' }, '懂了')
      )
    });
  }

  function init() {
    wireUi();
    State.subscribe(refreshBadges);
    refreshBadges();

    // Restore last view (default to dashboard)
    let last = 'dashboard';
    try { last = localStorage.getItem('cheat-on-content:last-view') || 'dashboard'; } catch (e) {}
    navigate(VIEWS.includes(last) ? last : 'dashboard');

    // First-time welcome
    if (!State.get().initialised && State.get().scripts.length === 0) {
      setTimeout(showHelp, 400);
    }
  }

  window.App = { navigate, refreshBadges, showHelp };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
