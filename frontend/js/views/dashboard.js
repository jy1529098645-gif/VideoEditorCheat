// Dashboard view — equivalent to /cheat-status board
(function () {
  const { el, fmt, fmtPlays, fmtPct, fmtDate, daysSince } = UI;

  function render() {
    const root = document.getElementById('view-dashboard');
    UI.clear(root);
    const s = State.get();
    const cal = State.calibrationSamples();
    const buf = State.buffer();
    const pending = State.pendingRetros();
    const streak = State.deviationStreak();
    const minSamples = s.settings.minSamplesForBump;

    // ============ Stat tiles row ============
    const tilesRow = el('div', { class: 'grid grid-4' },
      tile('模式', s.mode === 'calibration' ? 'calibration' : 'cold-start',
        s.mode === 'cold-start' ? `还需 ${Math.max(0, minSamples - cal)} 样本解锁完整预测` : '已进入校准期'),
      tile('Rubric 版本', s.activeRubric.replace('opinion-video-', ''),
        Rubric.getRubric(s.activeRubric).name.split('（')[0]),
      tile('校准样本', `${cal} / ${minSamples}`, cal >= minSamples ? '已可 bump rubric' : '继续累计'),
      tile('Buffer', String(buf),
        buf > s.settings.bufferGoodThreshold ? '充足' : buf > s.settings.bufferWarnThreshold ? '一般' : '⚠ 偏低', bufferKind(buf, s))
    );

    // ============ Pending retros ============
    const pendingCard = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '📈 待复盘',
        pending.length > 0 && el('span', { class: 'badge yellow' }, `${pending.length} 条`)),
      pending.length === 0
        ? el('div', { class: 'muted', style: { fontSize: '13px' } }, 'T+' + s.settings.retroWindowDays + ' 天后没有待复盘任务。')
        : el('div', {},
            ...pending.map(p => el('div', {
              class: 'list-item',
              onClick: () => App.navigate('retro', { id: p.id })
            },
              el('div', { class: 'li-head' },
                el('div', { class: 'li-title' }, p.title),
                el('span', { class: 'badge yellow' }, '已 T+' + daysSince(p.publishedAt) + 'd')
              ),
              el('div', { class: 'li-meta' },
                `composite ${p.composite} · 押 ${p.bucket} · 发布于 ${fmtDate(p.publishedAt)}`
              )
            ))
          )
    );

    // ============ Bump trigger ============
    const bumpCard = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '⚡ Bump 信号'),
      streak.count === 0
        ? el('div', { class: 'muted', style: { fontSize: '13px' } }, '所有复盘命中中枢——rubric 没有偏置信号。')
        : streak.count >= 3
        ? el('div', { class: 'callout warn' },
            el('div', { class: 'callout-title' }, `已连续 ${streak.count} 次同向${streak.direction === 'high' ? '偏高' : '偏低'}`),
            '建议跑「升级 rubric」流程。', ' ',
            el('button', { class: 'btn btn-sm', onClick: () => App.navigate('bump') }, '前往 →')
          )
        : el('div', { class: 'muted', style: { fontSize: '13px' } },
            `当前连续偏差 ${streak.count} 次（方向：${streak.direction === 'high' ? '偏高' : '偏低'}），需 ≥3 才触发 bump 提议。`)
    );

    // ============ Recent activity ============
    const recent = s.predictions.slice(0, 5);
    const recentCard = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '🎬 最近预测',
        el('button', { class: 'btn btn-sm', style: { marginLeft: 'auto' }, onClick: () => App.navigate('predict') }, '+ 新预测')
      ),
      recent.length === 0
        ? el('div', { class: 'empty' },
            el('div', { class: 'empty-icon' }, '🎬'),
            el('div', { class: 'empty-text' }, '还没有预测'),
            el('div', { class: 'empty-sub' }, '从写一份稿子开始。'),
            el('button', { class: 'btn btn-primary', onClick: () => App.navigate('scripts') }, '写第一份稿子')
          )
        : recentTable(recent)
    );

    // ============ Next-step recommendations ============
    const nextStep = nextStepCard(s, cal, buf, pending);

    root.append(
      tilesRow,
      el('div', { style: { height: '16px' } }),
      nextStep,
      el('div', { style: { height: '16px' } }),
      el('div', { class: 'grid grid-2' }, pendingCard, bumpCard),
      el('div', { style: { height: '16px' } }),
      recentCard
    );
  }

  function tile(label, value, sub, kind) {
    return el('div', { class: 'stat' + (kind ? ' ' + kind : '') },
      el('div', { class: 'stat-label' }, label),
      el('div', { class: 'stat-value' }, value),
      el('div', { class: 'stat-sub' }, sub)
    );
  }

  function bufferKind(buf, s) {
    if (buf <= s.settings.bufferWarnThreshold) return 'bad';
    if (buf <= s.settings.bufferGoodThreshold) return 'warn';
    return 'good';
  }

  function recentTable(preds) {
    return el('table', { class: 'table' },
      el('thead', {}, el('tr', {},
        el('th', {}, '标题'),
        el('th', {}, '维度'),
        el('th', {}, 'composite (满 10)'),
        el('th', {}, '押'),
        el('th', {}, '实绩'),
        el('th', {}, '状态'),
        el('th', {}, '日期')
      )),
      el('tbody', {},
        ...preds.map(p => {
          const dimStr = Object.entries(p.scores).map(([k, v]) => `${k}${v}`).join(' ');
          const realPlays = p.retro && p.retro.actualPlays ? fmtPlays(p.retro.actualPlays) : '—';
          const status = p.retro ? '已复盘' : p.published ? '已发布' : p.shot ? '已拍' : '已预测';
          const statusClass = p.retro ? 'green' : p.published ? 'blue' : p.shot ? 'yellow' : '';
          return el('tr', { onClick: () => App.navigate('predict', { view: p.id }), style: { cursor: 'pointer' } },
            el('td', {}, p.title),
            el('td', { class: 'mono dim' }, dimStr),
            el('td', { class: 'mono' }, p.composite + ' / 10'),
            el('td', { class: 'mono' }, p.bucket),
            el('td', { class: 'mono' }, realPlays),
            el('td', {}, el('span', { class: 'badge ' + statusClass }, status)),
            el('td', { class: 'dim' }, fmtDate(p.predictedAt))
          );
        })
      )
    );
  }

  function nextStepCard(s, cal, buf, pending) {
    const steps = [];
    if (!s.initialised) steps.push({ icon: '🚦', text: '3 个 yes/no 完成 onboarding（去「设置」）', view: 'settings' });
    if (s.scripts.length === 0) steps.push({ icon: '📝', text: '写第一份稿子', view: 'scripts' });
    else if (s.predictions.length === 0) steps.push({ icon: '🔮', text: '把第一份稿子推进到「预测」', view: 'predict' });
    if (pending.length > 0) steps.push({ icon: '📈', text: `复盘 ${pending.length} 条已发布作品`, view: 'retro' });
    if (buf <= s.settings.bufferWarnThreshold && s.predictions.length > 0)
      steps.push({ icon: '🎬', text: 'Buffer 偏低——再拍一条', view: 'pipeline' });
    if (s.benchmarks.length === 0 && s.mode === 'cold-start')
      steps.push({ icon: '🎯', text: '导入对标账号（cold-start 强烈建议）', view: 'benchmark' });
    if (steps.length === 0)
      steps.push({ icon: '✅', text: '当前节奏健康。回到「稿子」继续写。', view: 'scripts' });

    return el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '🚦 下一步建议'),
      el('div', { class: 'stack', style: { gap: '8px' } },
        ...steps.map((s, i) => el('div', {
          class: 'list-item',
          style: { padding: '10px 14px', marginBottom: '0',
            border: i === 0 ? '1px solid var(--accent)' : '',
            background: i === 0 ? 'var(--accent-soft)' : '' },
          onClick: () => App.navigate(s.view)
        },
          el('div', { class: 'row' },
            el('span', { style: { fontSize: '16px' } }, s.icon),
            el('span', { class: 'flex-1', style: { fontWeight: i === 0 ? '500' : '400' } }, s.text),
            el('span', {
              class: 'btn btn-sm' + (i === 0 ? ' btn-pulse' : ''),
              style: { pointerEvents: 'none' }
            }, '前往 →')
          )
        ))
      )
    );
  }

  window.Views = window.Views || {};
  window.Views.dashboard = { render, title: '看板', sub: '每条片子的判断都在这里被记账' };
})();
