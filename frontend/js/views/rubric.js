// Rubric view — current rubric inspection + observations workbench
(function () {
  const { el, fmtDate } = UI;

  function render() {
    const root = document.getElementById('view-rubric');
    UI.clear(root);
    const s = State.get();
    const rubric = Rubric.getRubric(s.activeRubric);

    const header = el('div', { class: 'section-header' },
      el('div', {},
        el('h2', {}, '🧬 Rubric · ' + rubric.name),
        el('p', { class: 'muted', style: { fontSize: '12px' } },
          '当前用于打分和预测的公式 + 观察工作台（被新数据推翻或吸收的观察会被删除）')
      ),
      el('div', { class: 'row gap-sm' },
        el('select', { class: 'select', onChange: e => {
          State.set({ activeRubric: e.target.value });
          render();
          UI.toast('Rubric 已切换为 ' + e.target.value, 'success');
        } },
          ...Rubric.listRubrics().map(r =>
            el('option', { value: r.id, selected: r.id === s.activeRubric ? 'true' : null }, r.name))
        ),
        el('button', { class: 'btn', onClick: () => App.navigate('bump') }, '⚡ Bump rubric')
      )
    );

    const formulaCard = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '公式'),
      el('div', { class: 'composite-box' },
        el('div', { style: { flex: 1 } },
          el('div', { class: 'composite-label' }, 'composite = '),
          el('div', { class: 'composite-formula', style: { fontSize: '14px', color: 'var(--accent)' } }, rubric.formula)
        )
      )
    );

    const dimsCard = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '维度'),
      el('div', { class: 'stack', style: { gap: '8px' } },
        ...rubric.dimensions.map(d => el('div', {
          class: 'dim-row', style: { gridTemplateColumns: '70px 1fr 220px' }
        },
          el('div', {},
            el('div', { class: 'dim-key' }, d.key),
            el('div', { class: 'dim-weight' }, '权重 ×' + d.weight)
          ),
          el('div', {},
            el('div', { class: 'dim-name' }, d.name + ' · ' + d.name_cn),
            el('div', { class: 'dim-name-cn', style: { marginTop: '4px' } }, d.hint)
          ),
          el('div', { class: 'tag-strip' },
            ...d.anchors.map(a => el('span', { class: 'badge outline', style: { fontSize: '10.5px' } }, a))
          )
        ))
      )
    );

    const obs = s.observations;
    const obsCard = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '🧠 rubric_notes 观察池',
        el('span', { class: 'badge' }, obs.length + ' 条'),
        el('button', { class: 'btn btn-sm', style: { marginLeft: 'auto' }, onClick: openAdd }, '+ 加观察')
      ),
      el('div', { class: 'callout warn', style: { marginBottom: '12px' } },
        '🪒 这里只放当前有效的观察。被新数据推翻或被吸收为正式维度的，删掉——git history 才是档案。'
      ),
      obs.length === 0
        ? el('div', { class: 'muted', style: { fontSize: '13px' } }, '（空——复盘时新观察会自动进来）')
        : el('div', { class: 'stack' },
            ...obs.map(o => el('div', { class: 'list-item', style: { marginBottom: '0' } },
              el('div', { class: 'li-head' },
                el('div', { class: 'flex-1' },
                  el('div', { style: { fontSize: '13.5px' } }, o.text),
                  el('div', { class: 'li-meta' }, `${o.source} · ${fmtDate(o.addedAt)}`)
                ),
                el('div', { class: 'row gap-sm' },
                  el('button', {
                    class: 'btn btn-sm',
                    title: '吸收为正式维度——从观察池删除',
                    onClick: () => { State.deleteObservation(o.id); UI.toast('已吸收 / 删除', 'success'); render(); }
                  }, '吸收 / 删除')
                )
              )
            ))
          )
    );

    const bumps = s.bumps;
    const bumpsCard = el('div', { class: 'card' },
      el('div', { class: 'card-title' }, '⚡ 升级历史'),
      bumps.length === 0
        ? el('div', { class: 'muted', style: { fontSize: '13px' } }, '（无）')
        : el('table', { class: 'table' },
            el('thead', {}, el('tr', {},
              el('th', {}, '从'), el('th', {}, '到'), el('th', {}, '日期'),
              el('th', {}, '通过审核'), el('th', {}, '备注'))),
            el('tbody', {},
              ...bumps.map(b => el('tr', {},
                el('td', { class: 'mono' }, b.fromVersion),
                el('td', { class: 'mono' }, b.toVersion),
                el('td', { class: 'dim' }, fmtDate(b.createdAt)),
                el('td', {}, el('span', { class: 'badge ' + (b.validated ? 'green' : 'red') },
                  b.validated ? '✓ 通过' : '✗ 拒绝')),
                el('td', { class: 'dim' }, b.note || '—')
              ))
            )
          )
    );

    root.append(header, formulaCard,
      el('div', { style: { height: '16px' } }), dimsCard,
      el('div', { style: { height: '16px' } }), obsCard,
      el('div', { style: { height: '16px' } }), bumpsCard);
  }

  function openAdd() {
    let close, inp;
    close = UI.modal({
      title: '+ 加一条观察',
      body: el('div', {},
        el('div', { class: 'form-group' },
          el('label', { class: 'label' }, '观察内容'),
          inp = el('textarea', { class: 'textarea', rows: '4',
            placeholder: '例如：ER=5 + HP=5 + 可挪用模因句 = 病毒级，缺一不可' }),
          el('div', { class: 'hint' }, '可追溯到具体数据点——不要写"情感很重要"这种含糊话')
        )
      ),
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消'),
        el('button', { class: 'btn btn-primary', onClick: () => {
          if (!inp.value.trim()) return;
          State.addObservation({ text: inp.value.trim(), source: 'manual', tag: 'observation' });
          UI.toast('已加入观察池', 'success');
          close();
          window.Views.rubric.render();
        }}, '加入')
      )
    });
  }

  window.Views = window.Views || {};
  window.Views.rubric = { render, title: 'Rubric', sub: '评分规则 · 观察工作台' };
})();
