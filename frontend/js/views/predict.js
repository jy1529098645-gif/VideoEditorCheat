// Predict view — the core immutable blind-prediction workflow
(function () {
  const { el, fmtDate, fmtPlays, fmtPct } = UI;

  function render(params = {}) {
    const root = document.getElementById('view-predict');
    UI.clear(root);

    if (params.view) {
      const p = State.getPrediction(params.view);
      if (p) return renderView(p);
    }

    const s = State.get();
    const scriptId = params.scriptId;
    const script = scriptId ? State.getScript(scriptId) : null;
    const existing = script && State.getPrediction(script.id);
    if (existing) return renderView(existing);

    if (!script) return renderList();
    renderForm(script);
  }

  // ============ List of existing predictions ============
  function renderList() {
    const root = document.getElementById('view-predict');
    const s = State.get();
    const header = el('div', { class: 'section-header' },
      el('div', {},
        el('h2', {}, '🔮 预测库'),
        el('p', { class: 'muted', style: { fontSize: '12px' } }, '所有 immutable 盲预测——按时间倒序')
      ),
      el('button', { class: 'btn btn-primary', onClick: () => openSelectScript() }, '+ 启动新预测')
    );

    let body;
    if (s.predictions.length === 0) {
      body = el('div', { class: 'card' },
        el('div', { class: 'empty' },
          el('div', { class: 'empty-icon' }, '🔮'),
          el('div', { class: 'empty-text' }, '还没有任何预测'),
          el('div', { class: 'empty-sub' }, '从一份稿子开始 — 打分 → 押 bucket → 写理由 → 锁'),
          el('button', { class: 'btn btn-primary', onClick: () => openSelectScript() }, '启动第一次预测')
        )
      );
    } else {
      body = el('div', { class: 'stack' },
        ...s.predictions.map(p => el('div', {
          class: 'list-item',
          onClick: () => render({ view: p.id })
        },
          el('div', { class: 'li-head' },
            el('div', { class: 'flex-1' },
              el('div', { class: 'li-title' }, p.title),
              el('div', { class: 'li-meta' },
                `${fmtDate(p.predictedAt)} · composite ${p.composite} · 押 ${p.bucket} · ${p.confidence.label}`
              )
            ),
            statusBadge(p)
          )
        ))
      );
    }

    root.append(header, body);
  }

  function openSelectScript() {
    const scripts = State.get().scripts.filter(s => !State.getPrediction(s.id));
    if (scripts.length === 0) {
      UI.toast('没有未预测的稿子——先去「稿子」新建', 'warn');
      return;
    }
    let close;
    const sel = el('select', { class: 'select' },
      el('option', { value: '' }, '— 选一份稿子 —'),
      ...scripts.map(s => el('option', { value: s.id }, `${s.title} (${s.content.length} 字)`))
    );
    close = UI.modal({
      title: '挑稿子启动预测',
      body: el('div', { class: 'form-group' },
        el('label', { class: 'label' }, '从未预测的稿子里挑'),
        sel,
        el('div', { class: 'hint' }, '一旦写完预测，本稿不可再预测——避免事后偷看数据反推。')
      ),
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消'),
        el('button', { class: 'btn btn-primary', onClick: () => {
          if (!sel.value) { UI.toast('选一份', 'error'); return; }
          close();
          render({ scriptId: sel.value });
        }}, '开始')
      )
    });
  }

  function statusBadge(p) {
    if (p.retro) return el('span', { class: 'badge green' }, '✅ 已复盘 · 实绩 ' + fmtPlays(p.retro.actualPlays));
    if (p.published) return el('span', { class: 'badge blue' }, '🚀 已发布 · T+' + UI.daysSince(p.publishedAt) + 'd');
    if (p.shot) return el('span', { class: 'badge yellow' }, '🎬 已拍');
    return el('span', { class: 'badge accent' }, '🔮 待发布');
  }

  // ============ Prediction form (multi-step single-page) ============
  function renderForm(script) {
    const root = document.getElementById('view-predict');
    UI.clear(root);
    const s = State.get();
    const rubric = Rubric.getRubric(s.activeRubric);
    const cal = State.calibrationSamples();
    const confidence = Rubric.confidenceFromSamples(cal);

    // ============ AUTO-SCORE the script content ============
    const autoScores = Scorer.scoreText(script.content);
    const scores = { ...autoScores };
    const autoComposite = Rubric.composite(scores, rubric);
    const dist = Scorer.distFromComposite(autoComposite, cal);
    const autoReason = Scorer.autoReason(scores, autoComposite);
    const autoFactors = Scorer.autoFactors(scores);
    const reasoningFactors = autoFactors.length > 0 ? [...autoFactors] : [
      { factor: 'ER', direction: '强 +', confidence: '中', note: '' }
    ];
    const anchors = [];
    const overrides = {}; // tracks which fields user changed

    // ---- Header + banner ----
    const banner = el('div', { class: 'callout' },
      el('div', { class: 'callout-title' }, '🤖 已自动评分 — 请复核'),
      el('div', {}, '7 维评分、概率分布、一句话 reason、推理因素都已基于稿子文本启发式生成。' +
        '你只需要 review 并改你不认同的字段——改动会自动标 +user_override，复盘时用来诊断"用户直觉 vs Claude 系统性偏离"。'),
      el('div', { style: { marginTop: '6px' } },
        el('strong', {}, '⚠ 提交后预测段永久 immutable，不可改。'))
    );

    const meta = el('div', { class: 'grid grid-4' },
      metaTile('稿子', script.title),
      metaTile('ID', script.id),
      metaTile('字数', script.content.length + ' 字'),
      metaTile('信心', confidence.label,
        confidence.level === 'extreme-low' ? 'bad' :
        confidence.level === 'low' ? 'warn' :
        confidence.level === 'mid' ? 'good' : 'good')
    );

    // ---- Step 1: scores ----
    const compositeEl = el('div', { class: 'composite-value' }, '0.00');
    const compBox = el('div', { class: 'composite-box' },
      el('div', {},
        el('div', { class: 'composite-label' }, rubric.name),
        el('div', { class: 'composite-formula' }, rubric.formula)
      ),
      compositeEl
    );
    const dimRows = rubric.dimensions.map(d => dimRow(d, scores, autoScores, overrides, () => recomputeComposite()));
    function recomputeComposite() {
      compositeEl.textContent = Rubric.composite(scores, rubric).toFixed(2);
    }
    // initialise active to auto-scored values
    dimRows.forEach((r, i) => {
      const k = rubric.dimensions[i].key;
      const v = scores[k];
      const btn = r.querySelectorAll('.score-btn')[v];
      if (btn) btn.classList.add('active');
    });
    recomputeComposite();

    // ---- Step 2: bucket distribution ----
    const bucketRows = dist.map((b, idx) => bucketRow(b, idx, dist, () => recomputeBucket()));
    const sumEl = el('div', { class: 'bucket-sum-warn' }, '');
    function recomputeBucket() {
      const sum = dist.reduce((s, b) => s + Number(b.percent || 0), 0);
      if (sum === 100) { sumEl.className = 'bucket-sum-ok'; sumEl.textContent = '✓ 总和 100%'; }
      else { sumEl.className = 'bucket-sum-warn'; sumEl.textContent = `⚠ 总和 ${sum}%（必须正好 100）`; }
      // update headline label
      bucketRows.forEach((row, i) => {
        row.querySelector('.bucket-name').classList.toggle('headline', dist[i].headline);
        const bar = row.querySelector('.bucket-bar');
        bar.classList.toggle('headline', dist[i].headline);
        bar.style.width = Math.min(100, dist[i].percent) + '%';
        const cb = row.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = !!dist[i].headline;
      });
    }
    recomputeBucket();

    // ---- Step 3: factors ----
    const factorsBox = el('div', { class: 'stack', style: { gap: '6px' } });
    function renderFactors() {
      UI.clear(factorsBox);
      reasoningFactors.forEach((f, idx) => {
        factorsBox.appendChild(factorRow(f, idx, () => {
          reasoningFactors.splice(idx, 1);
          renderFactors();
        }));
      });
      factorsBox.appendChild(el('button', { class: 'btn btn-sm', onClick: () => {
        reasoningFactors.push({ factor: '', direction: '强 +', confidence: '中', note: '' });
        renderFactors();
      } }, '+ 加一行'));
    }
    reasoningFactors.push({ factor: 'ER', direction: '强 +', confidence: '中', note: '' });
    renderFactors();

    // ---- Step 4: anchors ----
    const anchorBox = el('div', { class: 'stack', style: { gap: '6px' } });
    function renderAnchors() {
      UI.clear(anchorBox);
      anchors.forEach((a, idx) => {
        anchorBox.appendChild(anchorRow(a, idx, () => {
          anchors.splice(idx, 1);
          renderAnchors();
        }));
      });
      if (cal < 2) {
        anchorBox.appendChild(el('div', { class: 'callout warn' },
          '校准池只有 ' + cal + ' 个样本，无 composite 邻近样本。**锚点对比 N/A**——本次预测 confidence ' + confidence.label + '。'));
      }
      anchorBox.appendChild(el('button', { class: 'btn btn-sm', onClick: () => {
        anchors.push({ sample: '', composite: '', actual: '', diff: '' });
        renderAnchors();
      } }, '+ 加锚点对比'));
    }
    renderAnchors();

    // ---- Step 5: reason / counterfactuals / assumptions ----
    const reasonInput = el('textarea', { class: 'textarea', rows: '3',
      placeholder: '核心驱动因素 + 最强反例约束 + 中枢预测' }, autoReason);
    const cfHit = el('textarea', { class: 'textarea', rows: '2', placeholder: '验证 / 推翻 / 新增维度' });
    const cfHeadline = el('textarea', { class: 'textarea', rows: '2', placeholder: '基准线验证什么' });
    const cfMiss = el('textarea', { class: 'textarea', rows: '2', placeholder: '推翻什么核心判断' });
    const cfFlop = el('textarea', { class: 'textarea', rows: '2', placeholder: '极端场景的可能解释' });
    const assumptions = el('textarea', { class: 'textarea', rows: '4',
      placeholder: '把这次预测当成一次实验，明确写下"如果 X 发生，证明 Y"' });

    // ---- Submit ----
    const submitBtn = el('button', { class: 'btn btn-primary btn-lg', onClick: submit }, '🔒 锁定预测 (immutable)');
    function submit() {
      const sum = dist.reduce((s, b) => s + Number(b.percent || 0), 0);
      if (sum !== 100) { UI.toast('概率分布必须加起来 100%', 'error'); return; }
      const headline = dist.find(b => b.headline);
      if (!headline) { UI.toast('必须标记一个 headline bucket', 'error'); return; }
      if (!reasonInput.value.trim()) { UI.toast('一句话 reason 不能空', 'error'); return; }
      const composite = Rubric.composite(scores, rubric);
      const overrideCount = Object.keys(overrides).length;
      try {
        State.addPrediction({
          scriptId: script.id,
          title: script.title,
          rubricVersion: rubric.version,
          predictedAt: State.today(),
          actualScriptLength: script.content.length,
          confidence,
          scores: { ...scores },
          autoScores: { ...autoScores },
          composite,
          bucket: headline.range,
          probDistribution: dist.map(b => ({ ...b })),
          reason: reasonInput.value.trim(),
          reasoningFactors: reasoningFactors.filter(f => f.factor.trim()),
          anchors: anchors.filter(a => a.sample.trim()),
          counterfactuals: {
            hit: cfHit.value, headline: cfHeadline.value, miss: cfMiss.value, flop: cfFlop.value
          },
          assumptions: assumptions.value,
          scoredBy: overrideCount > 0 ? 'claude+user_override' : 'claude',
          userOverride: overrideCount > 0 ? overrides : null
        });
        UI.toast('🔒 预测已锁定', 'success');
        App.navigate('predict', { view: script.id });
      } catch (e) {
        UI.toast(e.message, 'error');
      }
    }

    root.append(
      el('div', { class: 'section-header' },
        el('div', {},
          el('h2', {}, '🔮 启动预测 — ' + script.title),
          el('p', { class: 'muted', style: { fontSize: '12px' } }, 'Article ID: ' + script.id)
        ),
        el('button', { class: 'btn btn-ghost', onClick: () => render() }, '← 返回列表')
      ),
      banner,
      meta,
      el('div', { style: { height: '16px' } }),
      el('div', { class: 'card' },
        el('div', { class: 'card-title' }, '① 7 维评分'),
        ...dimRows,
        compBox
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '② 概率分布 — 押哪个 bucket'),
        el('div', { class: 'hint', style: { marginBottom: '10px' } },
          '勾"headline"指你押的 bucket（中枢值在该行设置）。所有 % 加起来必须 = 100。'
          + 'Confidence 低时应该更平（30/30/20/15/5），不是更尖（5/40/45/8/2）。'),
        ...bucketRows,
        sumEl
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '③ 一句话 reason'),
        reasonInput
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '④ 推理因素'),
        factorsBox
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '⑤ 锚点对比'),
        anchorBox
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '⑥ 反事实场景'),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '如果爆 >X w：'), cfHit),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '如果落在 headline：'), cfHeadline),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '如果跌到 <X w：'), cfMiss),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '如果 <<X w：'), cfFlop),
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '⑦ 关键校准假设'),
        assumptions
      ),
      el('div', { style: { marginTop: '20px', textAlign: 'right' } }, submitBtn)
    );
  }

  function metaTile(label, value, kind) {
    return el('div', { class: 'stat' + (kind ? ' ' + kind : '') },
      el('div', { class: 'stat-label' }, label),
      el('div', { class: 'stat-value', style: { fontSize: '16px' } }, value)
    );
  }

  function dimRow(d, scores, autoScores, overrides, onChange) {
    const btnEls = [];
    const out = el('div', { class: 'dim-score-out' }, String(scores[d.key]));
    const tag = el('span', { class: 'badge', style: { fontSize: '9.5px', marginLeft: '4px' } }, '🤖');
    for (let i = 0; i <= 5; i++) {
      btnEls.push(el('button', { class: 'score-btn', onClick: () => {
        scores[d.key] = i;
        btnEls.forEach((x, j) => x.classList.toggle('active', j === i));
        out.textContent = i;
        if (i !== autoScores[d.key]) {
          overrides[d.key] = { from: autoScores[d.key], to: i };
          tag.textContent = '✏️ overridden';
          tag.className = 'badge accent';
          tag.style.fontSize = '9.5px';
          tag.style.marginLeft = '4px';
        } else {
          delete overrides[d.key];
          tag.textContent = '🤖';
          tag.className = 'badge';
        }
        onChange();
      } }, String(i)));
    }
    return el('div', {
      class: 'dim-row',
      title: d.hint + '\n\n锚点:\n• ' + d.anchors.join('\n• ')
    },
      el('div', {},
        el('div', {}, el('span', { class: 'dim-key' }, d.key), tag),
        el('div', { class: 'dim-weight' }, '×' + d.weight)
      ),
      el('div', {},
        el('div', { class: 'dim-name' }, d.name),
        el('div', { class: 'dim-name-cn' }, d.name_cn)
      ),
      el('div', { class: 'score-slider' }, ...btnEls),
      out
    );
  }

  function bucketRow(b, idx, dist, onChange) {
    const head = el('input', { type: 'checkbox', checked: b.headline ? 'true' : null,
      onChange: e => { dist.forEach((x, i) => x.headline = (i === idx) && e.target.checked); onChange(); }
    });
    const pct = el('input', { class: 'input bucket-input', type: 'number', min: '0', max: '100', value: b.percent,
      onInput: e => { b.percent = Number(e.target.value) || 0; onChange(); } });
    const ctr = el('input', { class: 'input bucket-input', type: 'number', value: b.center || 0,
      onInput: e => { b.center = Number(e.target.value) || 0; } });

    return el('div', { class: 'bucket-row', style: { gridTemplateColumns: '24px 120px 1fr 60px 80px' } },
      head,
      el('div', { class: 'bucket-name' + (b.headline ? ' headline' : '') }, b.range),
      el('div', { class: 'bucket-bar-wrap' },
        el('div', { class: 'bucket-bar' + (b.headline ? ' headline' : ''), style: { width: b.percent + '%' } })),
      el('div', { class: 'row gap-sm' }, pct, el('span', { class: 'muted' }, '%')),
      el('div', { class: 'row gap-sm' }, ctr, el('span', { class: 'muted' }, '万'))
    );
  }

  function factorRow(f, idx, onRemove) {
    const factor = el('input', { class: 'input', placeholder: 'dim 或 feature, e.g. ER', value: f.factor,
      onInput: e => f.factor = e.target.value });
    const direction = el('select', { class: 'select', onChange: e => f.direction = e.target.value },
      ...['强 +', '中 +', '弱 ?', '强 -', '中 -'].map(v =>
        el('option', { value: v, selected: f.direction === v ? 'true' : null }, v)));
    const conf = el('select', { class: 'select', onChange: e => f.confidence = e.target.value },
      ...['高', '中', '低'].map(v =>
        el('option', { value: v, selected: f.confidence === v ? 'true' : null }, v)));
    const note = el('input', { class: 'input', placeholder: '≤30 字理由', value: f.note,
      onInput: e => f.note = e.target.value });
    const rm = el('button', { class: 'btn btn-sm', onClick: onRemove }, '−');

    return el('div', { style: { display: 'grid', gridTemplateColumns: '120px 100px 80px 1fr 32px', gap: '8px' } },
      factor, direction, conf, note, rm);
  }

  function anchorRow(a, idx, onRemove) {
    return el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 100px 100px 1fr 32px', gap: '8px' } },
      el('input', { class: 'input', placeholder: '对照样本名', value: a.sample, onInput: e => a.sample = e.target.value }),
      el('input', { class: 'input', type: 'number', step: '0.1', placeholder: 'composite', value: a.composite, onInput: e => a.composite = e.target.value }),
      el('input', { class: 'input', placeholder: '实绩', value: a.actual, onInput: e => a.actual = e.target.value }),
      el('input', { class: 'input', placeholder: '关键差异维度', value: a.diff, onInput: e => a.diff = e.target.value }),
      el('button', { class: 'btn btn-sm', onClick: onRemove }, '−')
    );
  }

  // ============ View an existing immutable prediction ============
  function renderView(p) {
    const root = document.getElementById('view-predict');
    UI.clear(root);
    const script = State.getScript(p.scriptId);

    const header = el('div', { class: 'section-header' },
      el('div', {},
        el('h2', {}, '🔮 ' + p.title),
        el('p', { class: 'muted', style: { fontSize: '12px' } },
          `Article ID: ${p.id} · rubric ${p.rubricVersion} · ${p.confidence.label} (校准 ${p.calibrationSamples}/5)`)
      ),
      el('div', { class: 'row gap-sm' },
        !p.shot && el('button', { class: 'btn', onClick: () => doShoot(p) }, '🎬 已拍'),
        p.shot && !p.published && el('button', { class: 'btn', onClick: () => doPublish(p) }, '🚀 已发布'),
        p.published && !p.retro && el('button', { class: 'btn btn-primary', onClick: () => App.navigate('retro', { id: p.id }) }, '📈 写复盘'),
        el('button', { class: 'btn btn-ghost', onClick: () => render() }, '← 返回列表')
      )
    );

    const banner = el('div', { class: 'immutable-banner' }, '🔒 此预测段是 immutable —— hook 已拦截所有编辑。仅可向"复盘"段追加。');

    // Scores readback — show overridden dims with the original
    const scoreList = el('div', { class: 'row wrap', style: { gap: '6px' } },
      ...Object.entries(p.scores).map(([k, v]) => {
        const ov = p.userOverride && p.userOverride[k];
        return el('span', { class: 'badge ' + (ov ? 'accent' : 'outline'),
          title: ov ? `auto=${ov.from} → user=${ov.to}` : 'auto' },
          `${k}=${v}` + (ov ? ` (was ${ov.from})` : ''));
      })
    );
    const scoredByBadge = el('div', { class: 'mt', style: { fontSize: '12px' } },
      el('span', { class: 'muted' }, 'Scored by: '),
      el('span', { class: 'badge ' + (p.scoredBy === 'claude+user_override' ? 'accent' : '') },
        p.scoredBy || 'claude'));

    // Distribution chart
    const distChart = el('div', { class: 'bucket-dist' },
      ...p.probDistribution.map(b =>
        el('div', { class: 'bucket-row' },
          el('div', { class: 'bucket-name' + (b.headline ? ' headline' : '') }, b.range + (b.headline ? ' ★' : '')),
          el('div', { class: 'bucket-bar-wrap' },
            el('div', { class: 'bucket-bar' + (b.headline ? ' headline' : ''), style: { width: b.percent + '%' } })),
          el('div', { class: 'bucket-value' }, b.percent + '%')
        ))
    );

    // Factors table
    const factorsTbl = p.reasoningFactors.length > 0 ? el('table', { class: 'table' },
      el('thead', {}, el('tr', {},
        el('th', {}, '因素'), el('th', {}, '方向'), el('th', {}, '置信度'), el('th', {}, '说明'))),
      el('tbody', {},
        ...p.reasoningFactors.map(f => el('tr', {},
          el('td', { class: 'mono' }, f.factor),
          el('td', {}, f.direction),
          el('td', {}, el('span', { class: 'badge ' +
            (f.confidence === '高' ? 'green' : f.confidence === '中' ? 'blue' : 'yellow') }, f.confidence)),
          el('td', { class: 'dim' }, f.note)
        ))
      )
    ) : el('div', { class: 'muted', style: { fontSize: '12px' } }, '（无）');

    // Anchors
    const anchorsTbl = p.anchors.length > 0 ? el('table', { class: 'table' },
      el('thead', {}, el('tr', {},
        el('th', {}, '对照样本'), el('th', {}, 'composite'), el('th', {}, '实绩'), el('th', {}, '差异'))),
      el('tbody', {},
        ...p.anchors.map(a => el('tr', {},
          el('td', {}, a.sample),
          el('td', { class: 'mono' }, a.composite),
          el('td', { class: 'mono' }, a.actual),
          el('td', { class: 'dim' }, a.diff)
        ))
      )
    ) : el('div', { class: 'muted', style: { fontSize: '12px' } }, '（无锚点 — confidence ' + p.confidence.label + '）');

    // Lifecycle bar
    const lifecycle = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '🚀 生命周期'),
      el('div', { class: 'row', style: { gap: '24px' } },
        stage('🔮 预测', p.predictedAt, true),
        stage('🎬 拍摄', p.shotAt, p.shot),
        stage('🚀 发布', p.publishedAt, p.published),
        stage('📈 复盘', p.retro && p.retro.retroAt, p.retro)
      ),
      p.publishUrl && el('div', { class: 'mt' },
        el('span', { class: 'muted' }, '发布链接: '),
        el('a', { href: p.publishUrl, target: '_blank' }, p.publishUrl))
    );

    root.append(header, banner, lifecycle,
      el('div', { style: { height: '16px' } }),
      el('div', { class: 'grid grid-2' },
        el('div', { class: 'card' },
          el('div', { class: 'card-title' }, '① 7 维评分 → composite'),
          scoreList,
          scoredByBadge,
          el('div', { class: 'composite-box' },
            el('div', {},
              el('div', { class: 'composite-label' }, 'rubric ' + p.rubricVersion),
              el('div', { class: 'composite-formula' }, p.confidence.desc)
            ),
            el('div', { class: 'composite-value' }, p.composite))
        ),
        el('div', { class: 'card' },
          el('div', { class: 'card-title' }, '② 概率分布 — 押 ' + p.bucket),
          distChart
        )
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '③ 一句话 reason'),
        el('div', { style: { fontSize: '14px', fontStyle: 'italic', color: 'var(--text)' } }, '" ' + p.reason + ' "')
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '④ 推理因素'),
        factorsTbl
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '⑤ 锚点对比'),
        anchorsTbl
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '⑥ 反事实场景'),
        cfBlock(p.counterfactuals)
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '⑦ 关键校准假设'),
        el('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '13px', color: 'var(--text)' } }, p.assumptions || '（未填）')
      )
    );
    if (p.retro) root.appendChild(renderRetroSection(p));
  }

  function stage(label, date, done) {
    return el('div', { class: 'row gap-sm', style: { flex: '1', opacity: done ? '1' : '0.4' } },
      el('div', { style: {
        width: '24px', height: '24px', borderRadius: '12px',
        background: done ? 'var(--accent)' : 'var(--bg-elev-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '11px', fontWeight: '600',
        color: done ? '#fff' : 'var(--text-dim)'
      } }, done ? '✓' : '○'),
      el('div', {},
        el('div', { style: { fontSize: '12px', fontWeight: '500' } }, label),
        el('div', { class: 'muted', style: { fontSize: '11px' } }, date ? fmtDate(date) : '—')
      )
    );
  }

  function cfBlock(cf) {
    const rows = [
      ['爆 (>headline)', cf.hit],
      ['命中 headline', cf.headline],
      ['跌穿 (<headline)', cf.miss],
      ['极端低', cf.flop]
    ];
    return el('div', { class: 'stack' },
      ...rows.map(([label, v]) => el('div', {},
        el('div', { class: 'label' }, label),
        el('div', { style: { fontSize: '13px', color: 'var(--text-dim)', whiteSpace: 'pre-wrap' } }, v || '（未填）')
      ))
    );
  }

  function renderRetroSection(p) {
    const r = p.retro;
    const script = State.getScript(p.scriptId);
    const integrityOk = !script || !script.contentHash
      || p.scriptHash === ('sha256:' + script.contentHash);
    return el('div', { class: 'card', style: { marginTop: '16px', borderColor: 'var(--green)' } },
      el('div', { class: 'card-title' }, '📈 复盘段（T+', el('span', {}, UI.daysSince(p.publishedAt) + 'd'), '）'),
      !integrityOk && el('div', { class: 'callout warn' },
        el('div', { class: 'callout-title' }, '⚠ Script integrity warning'),
        '稿子内容在预测后被改过（hash 不一致）。预测段仍 immutable，但实际拍摄稿与预测稿之间的差异可能解释了部分中枢偏差。'
      ),
      el('div', { class: 'grid grid-4' },
        statKV('播放', fmtPlays(r.actualPlays), r.deviation === 'high' ? '偏高' : r.deviation === 'low' ? '偏低' : '中枢'),
        statKV('点赞', fmtPlays(r.actualLikes), '赞播比 ' + fmtPct(r.likeRatio)),
        statKV('评论', UI.fmt(r.actualComments), '评播比 ' + fmtPct(r.commentRatio, 3)),
        statKV('分享', fmtPlays(r.actualShares), '分播比 ' + fmtPct(r.shareRatio))
      ),
      r.verified.length > 0 && el('div', { class: 'mt-lg' },
        el('div', { class: 'label' }, '✅ 被验证'),
        el('ul', { style: { paddingLeft: '20px', fontSize: '13px' } },
          ...r.verified.map(v => el('li', {}, v)))
      ),
      r.refuted.length > 0 && el('div', { class: 'mt-lg' },
        el('div', { class: 'label' }, '❌ 被推翻'),
        el('ul', { style: { paddingLeft: '20px', fontSize: '13px' } },
          ...r.refuted.map(v => el('li', {}, v)))
      ),
      r.newObservations.length > 0 && el('div', { class: 'mt-lg' },
        el('div', { class: 'label' }, '🧠 新观察'),
        el('ul', { style: { paddingLeft: '20px', fontSize: '13px' } },
          ...r.newObservations.map(v => el('li', {}, v)))
      )
    );
  }

  function statKV(label, value, sub) {
    return el('div', { class: 'stat' },
      el('div', { class: 'stat-label' }, label),
      el('div', { class: 'stat-value', style: { fontSize: '20px' } }, value),
      el('div', { class: 'stat-sub' }, sub)
    );
  }

  function doShoot(p) {
    let close, note;
    close = UI.modal({
      title: '🎬 登记拍摄',
      body: el('div', {},
        el('div', { class: 'callout' }, 'buffer +1'),
        el('div', { class: 'form-group' },
          el('label', { class: 'label' }, '备注（可选）'),
          note = el('textarea', { class: 'textarea', rows: '3', placeholder: '拍摄时的临时记录' })
        )
      ),
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消'),
        el('button', { class: 'btn btn-primary', onClick: () => {
          State.markShot(p.id, note.value);
          UI.toast('已拍 · buffer +1', 'success');
          close();
          render({ view: p.id });
        }}, '确认')
      )
    });
  }

  function doPublish(p) {
    let close, urlInp;
    close = UI.modal({
      title: '🚀 登记发布',
      body: el('div', {},
        el('div', { class: 'callout' }, 'buffer -1'),
        el('div', { class: 'form-group' },
          el('label', { class: 'label' }, '发布链接'),
          urlInp = el('input', { class: 'input', placeholder: 'https://...' })
        ),
        el('div', { class: 'hint' }, 'T+' + State.get().settings.retroWindowDays + ' 天后会自动出现在「复盘」页面')
      ),
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消'),
        el('button', { class: 'btn btn-primary', onClick: () => {
          State.markPublished(p.id, urlInp.value.trim());
          UI.toast('已发布 · buffer -1', 'success');
          close();
          render({ view: p.id });
        }}, '确认')
      )
    });
  }

  window.Views = window.Views || {};
  window.Views.predict = { render, title: '预测', sub: '盲预测 · 写完即 immutable' };
})();
