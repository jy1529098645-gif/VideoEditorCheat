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
      btn.addEventListener('click', () => {
        navigate(btn.dataset.view);
        document.body.classList.remove('sidebar-open');
      });
    });

    const toggle = document.getElementById('menu-toggle');
    if (toggle) toggle.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-open');
    });
    document.addEventListener('click', e => {
      if (!document.body.classList.contains('sidebar-open')) return;
      if (e.target.closest('.sidebar') || e.target.closest('.menu-toggle')) return;
      document.body.classList.remove('sidebar-open');
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
    const platform = window.Platforms.get(window.State.get().platform);

    function phase(num, title, who, what, examples) {
      const exNode = (examples == null) ? null
        : (typeof examples === 'string'
          ? el('div', { class: 'mono', style: { fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '6px' } }, '例：' + examples)
          : el('div', { class: 'mono', style: { fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '6px' } }, '例：', examples));
      return el('div', { style: { marginBottom: '18px', paddingLeft: '14px', borderLeft: '2px solid var(--accent)' } },
        el('div', { style: { fontSize: '14px', fontWeight: '600', marginBottom: '4px' } },
          `阶段 ${num} · ${title}`,
          el('span', { class: 'badge ' + (who === 'AI' ? 'blue' : who === '你' ? 'accent' : 'green'),
            style: { marginLeft: '8px', fontSize: '10.5px' } }, who)
        ),
        el('div', { style: { fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.7' } }, what),
        exNode
      );
    }

    UI.modal({
      title: '🛡 工作流详解',
      wide: true,
      body: el('div', {},
        el('div', { class: 'callout' },
          el('div', { class: 'callout-title' }, '一句话总结'),
          '把"我感觉这条会火"变成可校准实验：AI 替你打分预测 → 你只押注 + 验证 → 一段时间后你的判断越来越准。'
        ),

        el('h3', { style: { fontSize: '15px', margin: '20px 0 10px' } }, '🔄 6 阶段闭环'),

        phase('1', '起选题', '你 / AI 协作',
          '从 4 个来源积累候选池：(a) 抓热点粘贴（trends），(b) 手动加，(c) Seed 关键词派生，(d) 复盘旧主题。' +
          'AI 入池时自动评分给候选排序。你只挑「我对这条议题真有感觉」的。',
          '候选池 → 看 composite 最高那条 → 升为稿子'),

        phase('2', '写稿子', '你',
          '在「稿子」视图建一份 .md 草稿。' +
          '建议字数：' + (platform.id === 'wechat' ? '1500-3000 字' : platform.id === 'twitter' ? '一个 thread 5-15 条' : '600-1200 字（' + (platform.id === 'douyin' || platform.id === 'kuaishou' ? '3-5 分钟视频对应' : platform.id + ' 视频对应') + '）') + '。' +
          'AI 立刻自动算 7 维分（基于稿子文本中的：情感词密度、社会议题词、钩子模式、可截图句式、叙事 marker、普世主题、反讽信号）。',
          '改稿子内容 → AI 评分会自动重新计算'),

        phase('3', '启动盲预测', 'AI + 你',
          el('span', {},
            el('div', { style: { marginBottom: '6px' } },
              '🤖 ', el('strong', {}, 'AI 算（只读、不能改）：'),
              ' 7 维分 → composite → headline bucket → 概率分布 → 一句话 reason → 推理因素表'
            ),
            el('div', {},
              '👤 ', el('strong', {}, '你填（AI 替不了）：'),
              ' (a) 锚点对比 — 同 composite ±0.5 的历史样本拿来对照；' +
              '(b) 反事实场景 — 数据落每个 bucket 各意味着什么；' +
              '(c) 关键校准假设 — 一句"我押 X，如果 Y 发生则证明 Z"'
            )
          ),
          '提交 → 永久 immutable，连你的判断块都不可改'),

        phase('4', '拍 + 发', '你（线下）',
          '工具不参与拍摄。拍完了点「已拍」（buffer +1），实际拍稿与原稿差异自动 hash 比对。' +
          '发布后填链接（buffer -1）。' +
          'Buffer = "已拍未发"的库存 — 推荐保持 ≥ 2，避免节奏断。',
          '抖音/快手：拍完抖音 app 发；小红书：图片配套；B 站：上传通常 24h 后才有数据'),

        phase('5', '复盘（T+' + (window.State.get().settings.retroWindowDays) + 'd 后）', 'AI + 你',
          el('span', {},
            el('div', { style: { marginBottom: '6px' } },
              '👤 ', el('strong', {}, '你填：'),
              ' 实际数据（' + platform.retroMetrics.slice(0, 3).map(m => m.label).join(' / ') + ' ...）'
            ),
            el('div', { style: { marginBottom: '6px' } },
              '🤖 ', el('strong', {}, 'AI 自动跑对照：'),
              ' (1) bucket 命中？ (2) 中枢偏差 +/- ？ (3) 关键派生比率信号 (4) 每条高置信因素是否被验证'
            ),
            el('div', {},
              '👤 ', el('strong', {}, '你 review + 加新观察：'),
              ' AI bullet 不全/不准就改；新发现的规律必须可追溯到具体数据点（"分播比 2.5% vs 0.9%"）'
            )
          ),
          el('span', {}, '新观察自动入 rubric_notes — ', el('strong', {}, '不留考古层，被推翻的删掉'))),

        phase('6', '进化 rubric (累计 ≥ 5 样本后)', 'AI + 你',
          '连续 3 次同向偏差（都偏高 or 都偏低）→ 看板自动出 Bump 提议。' +
          '进 Bump 视图：你试调维度权重，AI 跑全量重打——把所有历史样本用新公式重新评分。' +
          '新排序 vs 实际播放排序 ≥ 80% 一致 + 跨模型审通过 → 升级。否则被拒。',
          '升级后所有未来预测自动用新公式'),

        el('h3', { style: { fontSize: '15px', margin: '20px 0 10px' } }, '🛡 三条不可妥协原则'),
        el('ol', { style: { paddingLeft: '20px', fontSize: '13px', lineHeight: '1.9' } },
          el('li', {}, el('strong', {}, '盲预测 immutable：'), '预测一旦提交，AI 分 + 你的判断块都不能改。重做要建 `_redo` 稿子，原版保留。'),
          el('li', {}, el('strong', {}, '升级 = 全量重打 + 跨模型审：'), '不允许"为了让新公式过就改阈值"。'),
          el('li', {}, el('strong', {}, 'rubric 是工作台不是博物馆：'), '失效观察删掉，git history 才是档案。')
        ),

        el('h3', { style: { fontSize: '15px', margin: '20px 0 10px' } }, '📊 7 维评分（AI 自动）'),
        el('div', { class: 'mono', style: { fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.9' } },
          el('div', {}, 'ER (×1.5) 情感共鸣 — 情感词 + 反思人称'),
          el('div', {}, 'SR (×1.5) 社会共振 — 结构性议题词'),
          el('div', {}, 'HP (×1.5) 钩子 — 前 100 字 vs 通用开场'),
          el('div', {}, 'QL (×1.0) 金句 — "不是X是Y" 句式密度'),
          el('div', {}, 'NA (×1.0) 叙事 — 时间 marker、弧线'),
          el('div', {}, 'AB (×1.0) 受众广度 — 普世主题词'),
          el('div', {}, 'SAT (×1.0) 讽刺深度 — 引号 / 戏仿 marker')
        ),

        el('h3', { style: { fontSize: '15px', margin: '20px 0 10px' } }, '📡 平台适配'),
        el('div', { style: { fontSize: '13px', lineHeight: '1.7' } },
          el('div', { class: 'callout good', style: { padding: '10px 14px' } },
            el('strong', {}, '✅ 最佳：抖音 / 快手 '),
            '— 内置 rubric 是从抖音 25+ 真实样本拟合的，完整闭环 + bucket（万播放）已验证。'
          ),
          el('div', { class: 'callout warn', style: { padding: '10px 14px' } },
            el('strong', {}, '⚠ 实验：小红书 / B 站 / YouTube / 公众号 / X '),
            '— bucket 范围 + 主指标已对齐到各平台习惯，但 rubric 权重还是视频版的。这些平台请用前 5 篇做 cold-start 校准，5 篇后跑 Bump 让权重往你的平台漂。'
          )
        ),

        el('div', { class: 'callout', style: { marginTop: '14px' } },
          el('div', { class: 'callout-title' }, '🔑 这套工作流跟普通"内容工具"的区别'),
          el('div', {}, '其他工具：给你"灵感"、AI 帮你写、A/B 测试 10 个版本。'),
          el('div', {}, '本工具：让你的"直觉"变成可校准的实验循环——一个月后你的判断准度 10× 于第一天。')
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
