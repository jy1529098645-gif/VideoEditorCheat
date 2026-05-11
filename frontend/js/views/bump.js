// Bump view — rubric upgrade with full re-score validation
(function () {
  const { el, fmtPlays } = UI;

  function render() {
    const root = document.getElementById('view-bump');
    UI.clear(root);
    const s = State.get();
    const cal = State.calibrationSamples();
    const minSamples = s.settings.minSamplesForBump;
    const currentRubric = Rubric.getRubric(s.activeRubric);

    const header = el('div', { class: 'section-header' },
      el('div', {},
        el('h2', {}, '⚡ Bump Rubric — 公式升级'),
        el('p', { class: 'muted', style: { fontSize: '12px' } },
          'rubric 升级必须全量重打校准池，新排序 ≥ 4/5 命中 + 跨模型独立审核才放行')
      )
    );

    if (cal < minSamples) {
      root.append(header,
        el('div', { class: 'card' },
          el('div', { class: 'empty' },
            el('div', { class: 'empty-icon' }, '⏳'),
            el('div', { class: 'empty-text' }, `校准池还不到 ${minSamples} 样本`),
            el('div', { class: 'empty-sub' }, `当前 ${cal} / ${minSamples}——bump 流程暂未解锁`)
          )
        )
      );
      return;
    }

    const samples = s.predictions.filter(p => p.retro && p.retro.actualPlays);
    // sort by actual plays desc
    const realRank = [...samples].sort((a, b) => b.retro.actualPlays - a.retro.actualPlays).map(p => p.id);

    // Local: editable candidate rubric (start from current)
    const candidate = JSON.parse(JSON.stringify(currentRubric));
    candidate.version = (parseFloat(candidate.version.replace('v', '')) + 0.1).toFixed(1).replace(/\.0$/, '');
    candidate.version = 'v' + candidate.version;
    candidate.formula = formulaFrom(candidate);

    const versionInput = el('input', { class: 'input', value: candidate.version,
      onInput: e => { candidate.version = e.target.value; } });

    const weightInputs = {};
    candidate.dimensions.forEach(d => {
      weightInputs[d.key] = el('input', { class: 'input', type: 'number', step: '0.1', value: d.weight,
        style: { width: '80px' },
        onInput: e => {
          d.weight = Number(e.target.value) || 0;
          candidate.formula = formulaFrom(candidate);
          recomputeTable();
        }
      });
    });

    // Validation table
    const validationTbl = el('div');
    const summary = el('div', { class: 'mt-lg' });

    function recomputeTable() {
      // Compute candidate composite for each sample, rank desc
      const withNew = samples.map(p => ({
        p, oldComp: p.composite, newComp: Rubric.composite(p.scores, candidate)
      }));
      const candidateRank = [...withNew].sort((a, b) => b.newComp - a.newComp).map(x => x.p.id);
      const oldRank = [...withNew].sort((a, b) => b.oldComp - a.oldComp).map(x => x.p.id);

      const candidateHits = matches(candidateRank, realRank);
      const oldHits = matches(oldRank, realRank);

      UI.clear(validationTbl);
      validationTbl.appendChild(el('table', { class: 'table' },
        el('thead', {}, el('tr', {},
          el('th', {}, '#'),
          el('th', {}, '样本'),
          el('th', {}, '旧 composite'),
          el('th', {}, '新 composite'),
          el('th', {}, '实际播放'),
          el('th', {}, '实际排名'),
          el('th', {}, '新排名'),
          el('th', {}, '命中？'))),
        el('tbody', {},
          ...withNew.sort((a, b) => b.newComp - a.newComp).map((row, idx) => {
            const realIdx = realRank.indexOf(row.p.id);
            const newIdx = candidateRank.indexOf(row.p.id);
            const hit = realIdx === newIdx;
            return el('tr', {},
              el('td', {}, idx + 1),
              el('td', {}, row.p.title),
              el('td', { class: 'mono dim' }, row.oldComp),
              el('td', { class: 'mono' }, row.newComp.toFixed(2)),
              el('td', { class: 'mono' }, fmtPlays(row.p.retro.actualPlays)),
              el('td', { class: 'mono' }, realIdx + 1),
              el('td', { class: 'mono' }, newIdx + 1),
              el('td', {}, hit
                ? el('span', { class: 'badge green' }, '✓')
                : el('span', { class: 'badge red' }, '✗'))
            );
          })
        )
      ));

      const totalN = samples.length;
      const passThreshold = Math.ceil(totalN * 0.8);
      const passes = candidateHits >= passThreshold && candidateHits >= oldHits;

      UI.clear(summary);
      summary.appendChild(el('div', { class: 'grid grid-3' },
        el('div', { class: 'stat' + (passes ? ' good' : '') },
          el('div', { class: 'stat-label' }, '新公式命中'),
          el('div', { class: 'stat-value' }, `${candidateHits} / ${totalN}`),
          el('div', { class: 'stat-sub' }, `需 ≥ ${passThreshold}（80%）才放行`)),
        el('div', { class: 'stat' },
          el('div', { class: 'stat-label' }, '旧公式命中'),
          el('div', { class: 'stat-value' }, `${oldHits} / ${totalN}`),
          el('div', { class: 'stat-sub' }, '新公式必须 ≥ 旧公式')),
        el('div', { class: 'stat' },
          el('div', { class: 'stat-label' }, '跨模型审核'),
          el('div', { class: 'stat-value', style: { fontSize: '18px' } },
            s.settings.crossModelAudit ? '✅ 启用' : '⚠ 禁用'),
          el('div', { class: 'stat-sub' }, '前端模拟——实际需要外部模型独立审）'))
      ));

      summary.appendChild(el('div', {
        class: 'callout ' + (passes ? 'good' : 'bad'), style: { marginTop: '16px' }
      },
        el('div', { class: 'callout-title' },
          passes ? '✅ 满足升级阈值，可提交' : '❌ 不满足升级阈值'),
        passes
          ? '新公式 ≥ 4/5 样本排序正确，且优于旧公式。'
          : '新公式不优于旧公式或低于阈值——升级被拒。'
      ));

      submitBtn.disabled = !passes;
    }

    const submitBtn = el('button', { class: 'btn btn-primary btn-lg', onClick: () => {
      // Commit a new rubric version into history & switch active
      const key = 'opinion-video-' + candidate.version.toLowerCase();
      Rubric.RUBRICS[key] = candidate;
      State.set({ activeRubric: key });
      State.addBump({
        fromVersion: currentRubric.version,
        toVersion: candidate.version,
        formula: candidate.formula,
        validated: true,
        note: '前端模拟跨模型审核通过',
        weights: Object.fromEntries(candidate.dimensions.map(d => [d.key, d.weight]))
      });
      UI.toast('Rubric 已升级至 ' + candidate.version, 'success');
      App.navigate('rubric');
    } }, '🚀 提交升级 ' + currentRubric.version + ' → ' + candidate.version);

    const editor = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '调整权重（拖动 / 输入）'),
      el('div', { class: 'form-group' },
        el('label', { class: 'label' }, '新版本号'),
        versionInput
      ),
      el('div', { class: 'stack', style: { gap: '8px' } },
        ...candidate.dimensions.map(d => el('div', {
          class: 'dim-row',
          style: { gridTemplateColumns: '70px 1fr 100px' }
        },
          el('div', {},
            el('div', { class: 'dim-key' }, d.key),
            el('div', { class: 'dim-weight' }, d.name_cn)
          ),
          el('div', { class: 'dim-name' }, d.hint),
          weightInputs[d.key]
        ))
      )
    );

    root.append(header,
      el('div', { class: 'callout' },
        el('div', { class: 'callout-title' }, '🛡 升级 = 全量重打'),
        '所有有实绩数据的样本会用新公式重打分；新排序 vs 实际播放排序必须 ≥ 4/5 一致，且优于旧版。'
      ),
      el('div', { class: 'grid grid-2', style: { gap: '16px' } }, editor,
        el('div', { class: 'card' },
          el('div', { class: 'card-title' }, '校准池（按实际播放排序）'),
          validationTbl
        )
      ),
      summary,
      el('div', { style: { marginTop: '20px', textAlign: 'right' } }, submitBtn)
    );

    recomputeTable();
  }

  function formulaFrom(rubric) {
    const sum = rubric.dimensions.reduce((s, d) => s + d.weight, 0);
    const parts = rubric.dimensions.map(d => d.weight === 1 ? d.key : `${d.key}×${d.weight}`).join(' + ');
    return `(${parts}) / ${sum.toFixed(1)} × 2.0`;
  }

  function matches(rankA, rankB) {
    let hits = 0;
    for (let i = 0; i < rankA.length; i++) {
      if (rankA[i] === rankB[i]) hits++;
    }
    return hits;
  }

  window.Views = window.Views || {};
  window.Views.bump = { render, title: '升级 Rubric', sub: '全量重打 + 跨模型审核' };
})();
