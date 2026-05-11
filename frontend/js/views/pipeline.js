// Pipeline view — shoot & publish state board
(function () {
  const { el, fmtDate, daysSince } = UI;

  function render() {
    const root = document.getElementById('view-pipeline');
    UI.clear(root);
    const s = State.get();

    const all = s.predictions;
    const predicted = all.filter(p => !p.shot);
    const shot = all.filter(p => p.shot && !p.published);
    const published = all.filter(p => p.published && !p.retro);

    const buf = State.buffer();

    const stats = el('div', { class: 'grid grid-3' },
      tile('待拍', predicted.length, '已锁预测，未拍摄', predicted.length > 0 ? '' : 'good'),
      tile('Buffer (已拍未发)', buf,
        buf > s.settings.bufferGoodThreshold ? '充足' :
        buf > s.settings.bufferWarnThreshold ? '一般' :
        '⚠ 偏低，节奏要断',
        buf > s.settings.bufferGoodThreshold ? 'good' :
        buf > s.settings.bufferWarnThreshold ? 'warn' : 'bad'),
      tile('已发布待复盘', published.length, 'T+' + s.settings.retroWindowDays + ' 天后可复盘')
    );

    const protocol = el('div', { class: 'callout' },
      el('div', { class: 'callout-title' }, '🛡 节奏协议'),
      'buffer 警戒系统需要明确知道"拍了但没发" vs "已发"两种状态。',
      el('br'),
      '推荐：buffer ≥ 2 时心态稳；buffer = 0 时节奏会断。'
    );

    root.append(stats, el('div', { style: { height: '16px' } }), protocol);

    root.append(
      el('div', { class: 'grid grid-3', style: { marginTop: '16px', gap: '16px' } },
        column('🔮 待拍', predicted, p =>
          el('button', { class: 'btn btn-sm', onClick: () => doShoot(p) }, '🎬 标记为已拍')),
        column('🎬 已拍 / 待发', shot, p =>
          el('button', { class: 'btn btn-sm', onClick: () => doPublish(p) }, '🚀 标记为已发')),
        column('🚀 已发 / 待复盘', published, p => {
          const since = daysSince(p.publishedAt);
          const ready = since >= s.settings.retroWindowDays;
          return el('button', {
            class: 'btn btn-sm' + (ready ? ' btn-primary' : ''),
            disabled: !ready,
            onClick: () => App.navigate('retro', { id: p.id })
          }, ready ? '📈 复盘' : `T+${since}d (需 ${s.settings.retroWindowDays}d)`);
        })
      )
    );
  }

  function tile(label, value, sub, kind) {
    return el('div', { class: 'stat' + (kind ? ' ' + kind : '') },
      el('div', { class: 'stat-label' }, label),
      el('div', { class: 'stat-value' }, value),
      el('div', { class: 'stat-sub' }, sub)
    );
  }

  function column(title, items, actionFor) {
    return el('div', { class: 'card', style: { minHeight: '400px' } },
      el('div', { class: 'card-title' }, title, el('span', { class: 'badge' }, items.length)),
      items.length === 0
        ? el('div', { class: 'muted', style: { textAlign: 'center', padding: '40px 0', fontSize: '13px' } }, '（空）')
        : el('div', { class: 'stack' },
            ...items.map(p =>
              el('div', { class: 'list-item', style: { marginBottom: '0' } },
                el('div', { class: 'li-title', style: { fontSize: '13.5px' } }, p.title),
                el('div', { class: 'li-meta' },
                  `composite ${p.composite} · 押 ${p.bucket}`),
                el('div', { class: 'li-foot' },
                  el('button', { class: 'btn btn-sm', onClick: () => App.navigate('predict', { view: p.id }) }, '查看'),
                  actionFor(p))
              ))
          )
    );
  }

  function doShoot(p) {
    State.markShot(p.id);
    UI.toast('已拍 · buffer +1', 'success');
    render();
  }

  function doPublish(p) {
    let close, urlInp;
    close = UI.modal({
      title: '🚀 登记发布 — ' + p.title,
      body: el('div', {},
        el('div', { class: 'form-group' },
          el('label', { class: 'label' }, '发布链接（可选）'),
          urlInp = el('input', { class: 'input', placeholder: 'https://...' })
        )
      ),
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消'),
        el('button', { class: 'btn btn-primary', onClick: () => {
          State.markPublished(p.id, urlInp.value.trim());
          UI.toast('已发布 · buffer -1', 'success');
          close();
          render();
        }}, '确认')
      )
    });
  }

  window.Views = window.Views || {};
  window.Views.pipeline = { render, title: '拍 & 发', sub: 'buffer 警戒 · 节奏协议' };
})();
