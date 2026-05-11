// Settings view — init wizard + tunables
(function () {
  const { el } = UI;

  function render() {
    const root = document.getElementById('view-settings');
    UI.clear(root);
    const s = State.get();

    const header = el('div', { class: 'section-header' },
      el('div', {},
        el('h2', {}, '⚙️ 设置'),
        el('p', { class: 'muted', style: { fontSize: '12px' } },
          '初始化 · 协议参数 · 调试')
      )
    );

    // Platform selector
    const platformCard = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '📡 平台适配',
        el('span', { class: 'badge accent', style: { marginLeft: '6px' } },
          Platforms.get(s.platform).icon + ' ' + Platforms.get(s.platform).name)),
      el('div', { class: 'muted', style: { fontSize: '12.5px', marginBottom: '14px' } },
        '方法论通用 · bucket / 指标 / 算法权重侧重点会随平台切换。'),
      el('div', { class: 'grid grid-2', style: { gap: '10px' } },
        ...Platforms.list().map(p => el('div', {
          class: 'list-item',
          style: {
            marginBottom: '0',
            cursor: 'pointer',
            borderColor: s.platform === p.id ? 'var(--accent)' : '',
            background: s.platform === p.id ? 'var(--accent-soft)' : ''
          },
          onClick: () => {
            State.set({ platform: p.id });
            UI.toast(`已切换到 ${p.name}`, 'success');
            render();
          }
        },
          el('div', { class: 'row between', style: { alignItems: 'flex-start' } },
            el('div', { class: 'flex-1' },
              el('div', { class: 'row gap-sm', style: { alignItems: 'center' } },
                el('span', { style: { fontSize: '17px' } }, p.icon),
                el('span', { class: 'li-title' }, p.name),
                p.optimal && el('span', { class: 'badge green', style: { fontSize: '10px' } }, '✅ 最佳适配')
              ),
              el('div', { class: 'li-meta', style: { marginTop: '4px', fontFamily: 'inherit' } }, p.desc),
              el('div', { style: { fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '4px' } },
                '主指标：' + p.primaryMetric + ' · bucket：' + p.buckets.map(b => b.range).join(' / '))
            ),
            s.platform === p.id
              ? el('span', { class: 'badge accent' }, '✓ 当前')
              : el('span', { class: 'muted', style: { fontSize: '11px' } }, '点击切换')
          )
        ))
      ),
      el('div', { class: 'callout warn', style: { marginTop: '14px' } },
        el('div', { class: 'callout-title' }, '⚠ rubric 校准来源'),
        '内置 rubric 是抖音/快手观点视频 v2（25+ 样本校准）。其他平台 bucket 已对齐，但 rubric 权重还是视频版的——B 站 / YouTube / 公众号请按 tips 自己 bump rubric。')
    );

    // Init wizard
    const initCard = s.initialised
      ? el('div', { class: 'card' },
          el('div', { class: 'card-title' }, '🚦 已初始化'),
          el('div', { class: 'muted', style: { fontSize: '13px' } },
            `内容形态：${s.contentForm} · 模式：${s.mode} · rubric：${s.activeRubric}`),
          el('div', { class: 'mt' },
            el('button', { class: 'btn btn-sm', onClick: openInit }, '重新初始化')
          )
        )
      : el('div', { class: 'card', style: { borderColor: 'var(--accent)' } },
          el('div', { class: 'card-title' }, '🚦 首次使用 — 5 步初始化'),
          el('div', { class: 'muted', style: { fontSize: '13px', marginBottom: '12px' } },
            '初始化决定 cold-start vs calibration 起点 · 选 rubric · 设节奏参数'),
          el('button', { class: 'btn btn-primary', onClick: openInit }, '开始初始化')
        );

    // Tunables
    const tunables = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '协议参数'),
      el('div', { class: 'stack' },
        kvEdit('typical_duration_seconds', '目标视频时长（秒）', s.settings.typicalDurationSeconds,
          v => { s.settings.typicalDurationSeconds = Number(v); State.save(); }),
        kvEdit('retro_window_days', 'T+N 复盘窗口（天）', s.settings.retroWindowDays,
          v => { s.settings.retroWindowDays = Number(v); State.save(); }),
        kvEdit('min_samples_for_bump', '触发 bump 最小样本数', s.settings.minSamplesForBump,
          v => { s.settings.minSamplesForBump = Number(v); State.save(); }),
        kvEdit('buffer_warn_threshold', 'Buffer 警戒线', s.settings.bufferWarnThreshold,
          v => { s.settings.bufferWarnThreshold = Number(v); State.save(); }),
        kvEdit('buffer_good_threshold', 'Buffer 充足线', s.settings.bufferGoodThreshold,
          v => { s.settings.bufferGoodThreshold = Number(v); State.save(); }),
        kvEditBool('cross_model_audit', '跨模型独立审核', s.settings.crossModelAudit,
          v => { s.settings.crossModelAudit = v; State.save(); })
      )
    );

    // Data ops
    const data = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '数据'),
      el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn', onClick: exportData }, '⬇ 导出 JSON'),
        el('button', { class: 'btn', onClick: importData }, '⬆ 导入 JSON'),
        el('button', { class: 'btn btn-ghost danger', onClick: resetAll }, '🗑 重置所有数据')
      ),
      el('div', { class: 'hint mt' },
        `当前：${s.scripts.length} 稿子 · ${s.predictions.length} 预测 · ${State.calibrationSamples()} 已复盘`)
    );

    root.append(header, platformCard,
      el('div', { style: { height: '16px' } }), initCard,
      el('div', { style: { height: '16px' } }), tunables,
      el('div', { style: { height: '16px' } }), data);
  }

  function kvEdit(key, label, value, onSet) {
    const inp = el('input', { class: 'input', type: 'number', value, style: { maxWidth: '120px' },
      onChange: e => { onSet(e.target.value); UI.toast('已保存', 'success'); }
    });
    return el('div', { class: 'row', style: { gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border-soft)' } },
      el('div', { style: { flex: 1 } },
        el('div', { class: 'mono', style: { fontSize: '12px' } }, key),
        el('div', { class: 'muted', style: { fontSize: '11.5px' } }, label)
      ),
      inp
    );
  }

  function kvEditBool(key, label, value, onSet) {
    const inp = el('input', { type: 'checkbox', checked: value ? 'true' : null,
      onChange: e => { onSet(e.target.checked); UI.toast('已保存', 'success'); }
    });
    return el('div', { class: 'row', style: { gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border-soft)' } },
      el('div', { style: { flex: 1 } },
        el('div', { class: 'mono', style: { fontSize: '12px' } }, key),
        el('div', { class: 'muted', style: { fontSize: '11.5px' } }, label)
      ),
      inp
    );
  }

  function openInit() {
    let close;
    let step = 0;
    const data = {
      hasPublished: false,
      hasBenchmark: false,
      wantSeedTopics: false
    };

    const qs = [
      { key: 'hasPublished', q: '① 过去 30 天发过观点视频吗？' },
      { key: 'hasBenchmark', q: '② 有想对标的账号吗？' },
      { key: 'wantSeedTopics', q: '③ 要不要先生成几个 seed 选题？' }
    ];

    function update(body) {
      UI.clear(body);
      if (step < qs.length) {
        const cur = qs[step];
        body.appendChild(el('div', {},
          el('div', { class: 'label' }, '问题 ' + (step + 1) + ' / ' + qs.length),
          el('div', { style: { fontSize: '17px', margin: '16px 0 24px', lineHeight: '1.5' } }, cur.q),
          el('div', { class: 'row gap-sm' },
            el('button', { class: 'btn btn-primary btn-lg', onClick: () => { data[cur.key] = true; step++; update(body); } }, '✓ Yes'),
            el('button', { class: 'btn btn-lg', onClick: () => { data[cur.key] = false; step++; update(body); } }, '✗ No')
          ),
          el('div', { class: 'progress mt-lg' },
            el('div', { class: 'progress-bar', style: { width: ((step / qs.length) * 100) + '%' } }))
        ));
      } else {
        const mode = data.hasPublished ? 'calibration' : 'cold-start';
        const rubric = mode === 'calibration' ? 'opinion-video-v2' : 'opinion-video-v0';
        body.appendChild(el('div', {},
          el('div', { class: 'callout good' },
            el('div', { class: 'callout-title' }, '✓ 准备完成'),
            `模式：${mode} · 起始 rubric：${rubric}`
          ),
          el('div', { class: 'mt-lg row gap-sm' },
            el('button', { class: 'btn btn-primary', onClick: () => {
              State.set({ initialised: true, mode, activeRubric: rubric });
              UI.toast('初始化完成 ✓', 'success');
              close();
              if (data.hasBenchmark) App.navigate('benchmark');
              else App.navigate('dashboard');
            }}, '应用配置'),
            el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消')
          )
        ));
      }
    }

    const body = el('div', {});
    close = UI.modal({
      title: '🚦 cheat-on-content init',
      body,
      onClose: () => {}
    });
    update(body);
  }

  function exportData() {
    const json = State.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cheat-on-content-${State.today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('已导出', 'success');
  }

  function importData() {
    document.getElementById('import-file').click();
  }

  function resetAll() {
    UI.confirm({
      title: '重置所有数据？',
      body: '所有稿子、预测、复盘、候选都会被删除。不可恢复。建议先导出。',
      danger: true,
      confirmText: '我确定 · 重置',
      onConfirm: () => {
        State.reset();
        UI.toast('已重置', 'success');
        App.navigate('dashboard');
      }
    });
  }

  window.Views = window.Views || {};
  window.Views.settings = { render, title: '设置', sub: 'init · 协议参数 · 数据管理' };
})();
