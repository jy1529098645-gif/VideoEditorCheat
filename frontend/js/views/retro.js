// Retro view — T+3d data ingestion + verification/refutation
(function () {
  const { el, fmtDate, fmtPlays, fmtPct, daysSince } = UI;

  function render(params = {}) {
    const root = document.getElementById('view-retro');
    UI.clear(root);

    if (params.id) {
      const p = State.getPrediction(params.id);
      if (p && !p.retro) return renderForm(p);
      if (p && p.retro) return App.navigate('predict', { view: p.id });
    }

    const s = State.get();
    const pending = State.pendingRetros();
    const upcoming = s.predictions.filter(p => p.published && !p.retro && daysSince(p.publishedAt) < s.settings.retroWindowDays);
    const completed = s.predictions.filter(p => p.retro);

    const header = el('div', { class: 'section-header' },
      el('div', {},
        el('h2', {}, '📈 复盘'),
        el('p', { class: 'muted', style: { fontSize: '12px' } },
          `T+${s.settings.retroWindowDays} 天数据回收 + 计分 + rubric 调整建议`)
      )
    );

    const pendingCard = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '🟡 待复盘',
        pending.length > 0 && el('span', { class: 'badge yellow' }, pending.length)),
      pending.length === 0
        ? el('div', { class: 'muted', style: { fontSize: '13px' } }, '当前没有到 T+' + s.settings.retroWindowDays + ' 的待复盘任务。')
        : el('div', { class: 'stack' },
            ...pending.map(p => row(p, true))
          )
    );

    const upcomingCard = upcoming.length > 0 && el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '⏳ 即将待复盘'),
      el('div', { class: 'stack' }, ...upcoming.map(p => row(p, false)))
    );

    const completedCard = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '✅ 已复盘'),
      completed.length === 0
        ? el('div', { class: 'muted', style: { fontSize: '13px' } }, '还没有任何复盘。')
        : completedTable(completed)
    );

    root.append(header, pendingCard);
    if (upcomingCard) root.append(el('div', { style: { height: '16px' } }), upcomingCard);
    root.append(el('div', { style: { height: '16px' } }), completedCard);
  }

  function row(p, actionable) {
    const since = daysSince(p.publishedAt);
    return el('div', { class: 'list-item', style: { marginBottom: '0' } },
      el('div', { class: 'li-head' },
        el('div', { class: 'flex-1' },
          el('div', { class: 'li-title' }, p.title),
          el('div', { class: 'li-meta' },
            `composite ${p.composite} · 押 ${p.bucket} · 发布 ${fmtDate(p.publishedAt)} · T+${since}d`)
        ),
        actionable
          ? el('button', { class: 'btn btn-primary btn-sm', onClick: () => render({ id: p.id }) }, '📈 写复盘')
          : el('span', { class: 'badge' }, `T+${since}d / 需 ${State.get().settings.retroWindowDays}d`)
      )
    );
  }

  function completedTable(preds) {
    return el('table', { class: 'table' },
      el('thead', {}, el('tr', {},
        el('th', {}, '标题'),
        el('th', {}, 'composite'),
        el('th', {}, '押'),
        el('th', {}, '实绩'),
        el('th', {}, '中枢偏差'),
        el('th', {}, '分播比'),
        el('th', {}, '复盘日')
      )),
      el('tbody', {},
        ...preds.map(p => {
          const r = p.retro;
          return el('tr', {
            onClick: () => App.navigate('predict', { view: p.id }),
            style: { cursor: 'pointer' }
          },
            el('td', {}, p.title),
            el('td', { class: 'mono' }, p.composite),
            el('td', { class: 'mono' }, p.bucket),
            el('td', { class: 'mono' }, fmtPlays(r.actualPlays)),
            el('td', {}, el('span', { class: 'badge ' +
              (r.deviation === 'high' ? 'red' : r.deviation === 'low' ? 'yellow' : 'green') },
              r.deviation === 'high' ? '偏高' : r.deviation === 'low' ? '偏低' : '中枢')),
            el('td', { class: 'mono' }, fmtPct(r.shareRatio)),
            el('td', { class: 'dim' }, fmtDate(r.retroAt))
          );
        })
      )
    );
  }

  // ============ Retro form ============
  function renderForm(p) {
    const root = document.getElementById('view-retro');
    UI.clear(root);

    const playsInp = el('input', { class: 'input', type: 'number', placeholder: '例如：710000（绝对值，非"w"）',
      onInput: () => recomputeAutoBullets() });
    const likesInp = el('input', { class: 'input', type: 'number', placeholder: '例如：24000' });
    const commentsInp = el('input', { class: 'input', type: 'number', placeholder: '例如：899' });
    const savesInp = el('input', { class: 'input', type: 'number', placeholder: '例如：5251' });
    const sharesInp = el('input', { class: 'input', type: 'number', placeholder: '例如：18000',
      onInput: () => recomputeAutoBullets() });
    const sourceSel = el('select', { class: 'select' },
      el('option', { value: 'manual' }, '手动粘贴'),
      el('option', { value: 'adapter:douyin' }, 'adapter:douyin'),
      el('option', { value: 'adapter:wechat' }, 'adapter:wechat'));
    const commentsBox = el('textarea', { class: 'textarea', rows: '5',
      placeholder: '把 Top 评论粘进来，会和模因分类一起被归档' });

    // Verified / refuted / new observations as bullet lists
    const verifiedItems = [];
    const refutedItems = [];
    const newObsItems = [''];

    const verifiedBox = el('div', { class: 'stack', style: { gap: '6px' } });
    const refutedBox = el('div', { class: 'stack', style: { gap: '6px' } });
    const newObsBox = el('div', { class: 'stack', style: { gap: '6px' } });
    const autoBanner = el('div', { class: 'callout', style: { fontSize: '12px', padding: '8px 12px' } },
      '🤖 等你填播放 + 分享数 → 自动对照预测因素 → 出验证/推翻 bullet');

    function recomputeAutoBullets() {
      if (!playsInp.value) return;
      const auto = Scorer.autoRetroCompare(p, {
        actualPlays: playsInp.value,
        actualLikes: likesInp.value,
        actualComments: commentsInp.value,
        actualShares: sharesInp.value
      });
      // Replace contents with auto-suggestions (idempotent on each recompute)
      verifiedItems.length = 0; refutedItems.length = 0;
      auto.verified.forEach(v => verifiedItems.push(v));
      auto.refuted.forEach(v => refutedItems.push(v));
      if (verifiedItems.length === 0) verifiedItems.push('');
      if (refutedItems.length === 0) refutedItems.push('');
      renderArr(verifiedItems, verifiedBox, '✅ 引用具体数据点');
      renderArr(refutedItems, refutedBox, '❌ "高置信度被推翻 → rubric bug"');
      autoBanner.className = 'callout good';
      autoBanner.textContent = `🤖 已根据实际数据自动生成 ${auto.verified.length} 条验证 + ${auto.refuted.length} 条推翻。改你不认同的。`;
    }
    function renderArr(arr, box, ph) {
      UI.clear(box);
      arr.forEach((v, i) => {
        const inp = el('input', { class: 'input', value: v, placeholder: ph,
          onInput: e => arr[i] = e.target.value });
        const rm = el('button', { class: 'btn btn-sm', onClick: () => { arr.splice(i, 1); renderArr(arr, box, ph); } }, '−');
        box.appendChild(el('div', { class: 'row gap-sm' }, inp, rm));
      });
      box.appendChild(el('button', { class: 'btn btn-sm', onClick: () => { arr.push(''); renderArr(arr, box, ph); } }, '+ 加一条'));
    }
    renderArr(verifiedItems, verifiedBox, '✅ 引用具体数据点');
    renderArr(refutedItems, refutedBox, '❌ "高置信度被推翻 → rubric bug"');
    renderArr(newObsItems, newObsBox, '🧠 新的规律，必须可追溯到数据');

    const header = el('div', { class: 'section-header' },
      el('div', {},
        el('h2', {}, '📈 复盘 — ' + p.title),
        el('p', { class: 'muted', style: { fontSize: '12px' } },
          `押 ${p.bucket} · composite ${p.composite} · T+${daysSince(p.publishedAt)}d`)
      ),
      el('button', { class: 'btn btn-ghost', onClick: () => render() }, '← 返回列表')
    );

    const submitBtn = el('button', { class: 'btn btn-primary btn-lg', onClick: () => {
      if (!playsInp.value) { UI.toast('播放量必填', 'error'); return; }
      State.addRetro(p.id, {
        retroAt: State.today(),
        source: sourceSel.value,
        actualPlays: playsInp.value,
        actualLikes: likesInp.value,
        actualComments: commentsInp.value,
        actualSaves: savesInp.value,
        actualShares: sharesInp.value,
        commentKeywords: commentsBox.value,
        verified: verifiedItems.filter(x => x.trim()),
        refuted: refutedItems.filter(x => x.trim()),
        newObservations: newObsItems.filter(x => x.trim())
      });
      UI.toast('复盘已归档 ✓', 'success');
      App.navigate('predict', { view: p.id });
    } }, '🧬 提交复盘 → 追加到预测段');

    root.append(header,
      el('div', { class: 'callout' },
        el('div', { class: 'callout-title' }, '关键纪律'),
        '每条验证 / 推翻必须引用具体数据（"分播比 2.53%"），不许写"基本符合"这种含糊措辞。'
      ),
      el('div', { class: 'card' },
        el('div', { class: 'card-title' }, '① 实绩数据'),
        el('div', { class: 'grid grid-3' },
          field('播放（绝对值）', playsInp, '*必填'),
          field('点赞', likesInp),
          field('评论', commentsInp),
          field('收藏', savesInp),
          field('分享', sharesInp),
          field('数据来源', sourceSel)
        )
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '② Top 评论 / 模因关键词'),
        commentsBox
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '③ ✅ 被验证 / ❌ 被推翻'),
        autoBanner,
        el('div', { class: 'label', style: { marginTop: '10px' } }, '✅ 被验证'),
        verifiedBox
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '❌ 被推翻'),
        refutedBox
      ),
      el('div', { class: 'card', style: { marginTop: '16px' } },
        el('div', { class: 'card-title' }, '④ 🧠 需要写进 rubric_notes 的新观察',
          el('span', { class: 'badge accent' }, '会自动进 rubric notes')),
        newObsBox
      ),
      el('div', { style: { marginTop: '20px', textAlign: 'right' } }, submitBtn)
    );
  }

  function field(label, input, hint) {
    return el('div', { class: 'form-group' },
      el('label', { class: 'label' }, label, hint && el('span', { class: 'req' }, ' ' + hint)),
      input
    );
  }

  window.Views = window.Views || {};
  window.Views.retro = { render, title: '复盘', sub: 'T+3d 数据回收 · 计分 vs 押注' };
})();
