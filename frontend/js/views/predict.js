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
    renderForm(script).catch(e => {
      console.error(e);
      UI.toast('预测表单渲染失败：' + e.message, 'error');
    });
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
  async function renderForm(script) {
    const root = document.getElementById('view-predict');
    UI.clear(root);
    const s = State.get();
    const rubric = Rubric.getRubric(s.activeRubric);
    const cal = State.calibrationSamples();
    const confidence = Rubric.confidenceFromSamples(cal);
    const platform = Platforms.get(s.platform);
    const useClaude = window.Claude && window.Claude.isEnabled();

    // Loading state if calling Claude
    if (useClaude) {
      root.append(el('div', { class: 'card' },
        el('div', { class: 'card-title' }, '🤖 ' + window.Claude.getModel() + ' 评分中…'),
        el('div', { class: 'muted', style: { fontSize: '13px' } },
          '正在让 Claude 基于 rubric + 25+ 样本评分 + 生成预测组件。一次大约 5-10 秒。')
      ));
    }

    let scoringResult;
    try {
      scoringResult = await Scorer.autoScore(script.content);
    } catch (e) {
      UI.toast('评分失败：' + e.message, 'error');
      return;
    }
    UI.clear(root);

    const scores = scoringResult.scores;
    const composite = Rubric.composite(scores, rubric);
    const dist = Scorer.distFromComposite(composite, cal, platform.id);
    // Prefer Claude's reason; fall back to heuristic
    const autoReasonText = scoringResult.reason || Scorer.autoReason(scores, composite);
    const reasoningFactors = (scoringResult.factors && scoringResult.factors.length > 0)
      ? scoringResult.factors
      : Scorer.autoFactors(scores);
    const closestAnchor = scoringResult.closestAnchor;
    const headlineBucket = dist.find(b => b.headline);
    const anchors = [];
    const scoringSource = scoringResult.source;

    // ---- Header + banner ----
    const scorerLabel = scoringSource === 'claude'
      ? `🤖 Claude (${window.Claude.getModel()})`
      : scoringSource === 'heuristic-fallback'
      ? '⚠ Claude 调用失败，回退到本地启发式'
      : '🔧 本地启发式（未配置 Claude API key）';
    const banner = el('div', { class: 'callout' },
      el('div', { class: 'callout-title' }, '已自动评分 · ' + scorerLabel),
      el('div', {}, '7 维评分、composite、概率分布、bucket、一句话 reason、推理因素都由 AI 算出 — 不让你改是为了保留你直觉 vs AI 的偏离信号。'),
      closestAnchor && el('div', { style: { marginTop: '6px' } },
        el('strong', {}, '最近 anchor 样本：'), closestAnchor),
      el('div', { style: { marginTop: '6px' } },
        el('strong', {}, '你要做的：填底下的判断块（锚点 / 反事实 / 关键假设）。')),
      el('div', { style: { marginTop: '6px' } }, '⚠ 提交后永久 immutable。')
    );

    const meta = el('div', { class: 'grid grid-4' },
      metaTile('平台', platform.icon + ' ' + platform.name + (platform.optimal ? ' ✅' : '')),
      metaTile('稿子', script.title),
      metaTile('字数', script.content.length + ' 字'),
      metaTile('信心', confidence.label,
        confidence.level === 'extreme-low' ? 'bad' :
        confidence.level === 'low' ? 'warn' :
        confidence.level === 'mid' ? 'good' : 'good')
    );

    // ---- Step 1: scores ----
    // Read-only score card
    const compBox = el('div', { class: 'composite-box' },
      el('div', {},
        el('div', { class: 'composite-label' }, rubric.name),
        el('div', { class: 'composite-formula' }, rubric.formula)
      ),
      el('div', { class: 'composite-value' }, composite.toFixed(2))
    );
    const dimRows = rubric.dimensions.map(d => readonlyDimRow(d, scores));

    // ---- Step 2: bucket distribution (read-only) ----
    const distView = el('div', { class: 'bucket-dist' },
      ...dist.map(b => el('div', { class: 'bucket-row' },
        el('div', { class: 'bucket-name' + (b.headline ? ' headline' : '') }, b.range + (b.headline ? ' ★' : '')),
        el('div', { class: 'bucket-bar-wrap' },
          el('div', { class: 'bucket-bar' + (b.headline ? ' headline' : ''), style: { width: b.percent + '%' } })),
        el('div', { class: 'bucket-value' }, b.percent + '%')
      ))
    );

    // ---- Step 3: reasoning factors (AI-derived, read-only) ----
    const factorsTbl = reasoningFactors.length === 0
      ? el('div', { class: 'muted', style: { fontSize: '13px' } }, 'AI 没在该稿子里识别到突出的强/弱维度')
      : el('table', { class: 'table' },
          el('thead', {}, el('tr', {},
            el('th', {}, '因素'), el('th', {}, '方向'), el('th', {}, '置信度'), el('th', {}, '说明'))),
          el('tbody', {},
            ...reasoningFactors.map(f => el('tr', {},
              el('td', { class: 'mono' }, f.factor),
              el('td', {}, f.direction),
              el('td', {}, el('span', {
                class: 'badge ' + (f.confidence === '高' ? 'green' : f.confidence === '中' ? 'blue' : 'yellow')
              }, f.confidence)),
              el('td', { class: 'dim' }, f.note)
            ))
          )
        );

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

    // ---- Step 5: counterfactuals / assumptions (user contributes) ----
    // (Reason is AI-derived & read-only now)
    const cfHit = el('textarea', { class: 'textarea', rows: '2', placeholder: '验证 / 推翻 / 新增维度' });
    const cfHeadline = el('textarea', { class: 'textarea', rows: '2', placeholder: '基准线验证什么' });
    const cfMiss = el('textarea', { class: 'textarea', rows: '2', placeholder: '推翻什么核心判断' });
    const cfFlop = el('textarea', { class: 'textarea', rows: '2', placeholder: '极端场景的可能解释' });
    const assumptions = el('textarea', { class: 'textarea', rows: '4',
      placeholder: '把这次预测当成一次实验，明确写下"如果 X 发生，证明 Y"' });

    // ---- Submit ----
    function submit() {
      try {
        State.addPrediction({
          scriptId: script.id,
          title: script.title,
          rubricVersion: rubric.version,
          predictedAt: State.today(),
          actualScriptLength: script.content.length,
          confidence,
          scores: { ...scores },
          autoScores: { ...scores },
          composite,
          bucket: headlineBucket ? headlineBucket.range : '<5w',
          probDistribution: dist.map(b => ({ ...b })),
          reason: autoReasonText,
          reasoningFactors,
          anchors: anchors.filter(a => a.sample.trim()),
          counterfactuals: {
            hit: cfHit.value, headline: cfHeadline.value, miss: cfMiss.value, flop: cfFlop.value
          },
          assumptions: assumptions.value,
          scoredBy: 'claude',
          userOverride: null
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
        el('div', { class: 'card-title' }, '① AI 评分 → composite',
          el('span', { class: 'badge', style: { marginLeft: '6px' } }, '只读')),
        ...dimRows,
        compBox
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '② AI 概率分布 + 押注 bucket',
          el('span', { class: 'badge', style: { marginLeft: '6px' } }, '只读'),
          el('span', { class: 'badge accent', style: { marginLeft: '6px' } }, '押 ' + (headlineBucket ? headlineBucket.range : '—'))
        ),
        distView
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '③ AI 一句话 reason',
          el('span', { class: 'badge', style: { marginLeft: '6px' } }, '只读')),
        el('div', { style: { fontStyle: 'italic', color: 'var(--text)', fontSize: '14px' } }, '" ' + autoReasonText + ' "')
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '④ AI 推理因素',
          el('span', { class: 'badge', style: { marginLeft: '6px' } }, '只读')),
        factorsTbl
      ),

      // ===== 用户贡献区 =====
      el('div', { style: { marginTop: '28px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' } },
        el('div', { style: { flex: 1, height: '1px', background: 'var(--accent)' } }),
        el('span', { class: 'badge accent', style: { padding: '4px 12px' } }, '👤 以下由你来填'),
        el('div', { style: { flex: 1, height: '1px', background: 'var(--accent)' } })
      ),

      el('div', { class: 'card' },
        el('div', { class: 'card-title' }, '⑤ 锚点对比'),
        el('div', { class: 'hint', style: { marginBottom: '10px' } },
          '同 composite ±0.5 的历史样本拿来对比 — 写哪个样本、它的 composite/实绩、关键差异维度。AI 没记你的历史，所以这是你的活。'),
        anchorBox
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '⑥ 反事实场景'),
        el('div', { class: 'hint', style: { marginBottom: '10px' } },
          '想象数据落在每个 bucket 各意味着什么 — 复盘时拿来检查你哪个假设错了。'),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '如果爆 (>headline)'), cfHit),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '如果落在 headline'), cfHeadline),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '如果跌穿 (<headline)'), cfMiss),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '如果 <<headline 极端低'), cfFlop)
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '⑦ 关键校准假设'),
        el('div', { class: 'hint', style: { marginBottom: '10px' } },
          '写一句"我押 X — 如果 Y 发生，证明 Z" — 让本次预测成为一次明确的实验。'),
        assumptions
      ),

      UI.nextCta({
        label: '准备好了？',
        title: '一旦提交，AI 评分 + 你的判断块都永久锁定',
        btnText: '🔒 锁定预测',
        onGo: submit
      })
    );
  }

  function probDistCard(dist, bucketRows, sumEl, confidence) {
    // Lock-by-default: show a read-only summary; user toggles "Override" to edit.
    let editing = false;
    const card = el('div', { class: 'card', style: { marginTop: '16px' } });
    const titleRow = el('div', { class: 'card-title' }, '② 概率分布',
      el('span', { class: 'badge accent', style: { marginLeft: '6px' } }, '🤖 自动 (' + confidence.label + ')')
    );
    const toggleBtn = el('button', { class: 'score-override-btn', style: { marginLeft: 'auto' } }, '✎ 覆写');
    titleRow.appendChild(toggleBtn);

    const summary = el('div', { class: 'bucket-dist' });
    function renderSummary() {
      UI.clear(summary);
      dist.forEach(b => {
        summary.appendChild(el('div', { class: 'bucket-row' },
          el('div', { class: 'bucket-name' + (b.headline ? ' headline' : '') }, b.range + (b.headline ? ' ★' : '')),
          el('div', { class: 'bucket-bar-wrap' },
            el('div', { class: 'bucket-bar' + (b.headline ? ' headline' : ''), style: { width: b.percent + '%' } })),
          el('div', { class: 'bucket-value' }, b.percent + '%')
        ));
      });
    }
    const editor = el('div', { style: { display: 'none' } },
      el('div', { class: 'hint', style: { marginBottom: '10px' } },
        '勾 headline 指你押的 bucket（中枢值在该行设置）。所有 % 加起来 = 100。'
        + 'Confidence 低时应该更平（30/30/20/15/5），不是更尖（5/40/45/8/2）。'),
      ...bucketRows, sumEl
    );

    toggleBtn.addEventListener('click', () => {
      editing = !editing;
      summary.style.display = editing ? 'none' : 'flex';
      editor.style.display = editing ? 'block' : 'none';
      toggleBtn.textContent = editing ? '✕ 关闭覆写' : '✎ 覆写';
      toggleBtn.classList.toggle('active', editing);
      if (!editing) renderSummary();
    });

    renderSummary();
    card.append(titleRow, summary, editor);
    return card;
  }

  function metaTile(label, value, kind) {
    return el('div', { class: 'stat' + (kind ? ' ' + kind : '') },
      el('div', { class: 'stat-label' }, label),
      el('div', { class: 'stat-value', style: { fontSize: '16px' } }, value)
    );
  }

  function readonlyDimRow(d, scores) {
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
      el('button', { class: 'btn btn-ghost', onClick: () => render() }, '← 返回列表')
    );

    // Big next-step CTA — what comes next in the lifecycle for this prediction
    const since = p.publishedAt ? UI.daysSince(p.publishedAt) : null;
    const retroDays = State.get().settings.retroWindowDays;
    let nextStep = null;
    if (!p.shot) {
      nextStep = UI.nextCta({ label: '下一步', title: '稿子拍完了？登记 — buffer +1', btnText: '🎬 标记为已拍', onGo: () => doShoot(p) });
    } else if (!p.published) {
      nextStep = UI.nextCta({ label: '下一步', title: '已发布了？记录链接 — buffer -1', btnText: '🚀 标记为已发', onGo: () => doPublish(p) });
    } else if (!p.retro) {
      if (since >= retroDays) {
        nextStep = UI.nextCta({ label: '下一步', title: `T+${since}d，数据可以抓了 — 跑复盘`, btnText: '📈 写复盘', onGo: () => App.navigate('retro', { id: p.id }) });
      } else {
        nextStep = UI.nextCta({ label: '等待中', title: `已发 T+${since}d · 还差 ${retroDays - since}d 才能复盘`, btnText: '看候选池', muted: true, onGo: () => App.navigate('candidates') });
      }
    } else {
      nextStep = UI.nextCta({ label: '本作品已闭环', title: '看候选池里下一题 / 拍下一条', btnText: '🔥 看候选池', muted: true, onGo: () => App.navigate('candidates') });
    }

    const banner = el('div', { class: 'immutable-banner' }, '🔒 此预测段是 immutable —— hook 已拦截所有编辑。仅可向"复盘"段追加。');

    // Scores readback — read-only AI badges
    const scoreList = el('div', { class: 'row wrap', style: { gap: '6px' } },
      ...Object.entries(p.scores).map(([k, v]) =>
        el('span', { class: 'badge outline' }, `🤖 ${k}=${v}`))
    );
    const scoredByBadge = el('div', { class: 'mt', style: { fontSize: '12px' } },
      el('span', { class: 'muted' }, 'Scored by: '),
      el('span', { class: 'badge' }, '🤖 AI auto')
    );

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

    root.append(header, nextStep, banner, lifecycle,
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
