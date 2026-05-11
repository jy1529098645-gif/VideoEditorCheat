// Scripts view — drafts management (scripts/ folder equivalent)
(function () {
  const { el, fmtDate } = UI;

  function render() {
    const root = document.getElementById('view-scripts');
    UI.clear(root);
    const s = State.get();

    const header = el('div', { class: 'section-header' },
      el('div', {},
        el('h2', {}, '草稿管理'),
        el('p', { class: 'muted', style: { fontSize: '12px', marginTop: '2px' } },
          '所有发布前的稿子。每份稿子都有唯一 id，与 predictions/ 共用。')
      ),
      el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-primary', onClick: openNewModal }, '+ 新建稿子'),
        el('button', { class: 'btn', onClick: openSeedModal }, '🌱 Seed 选题')
      )
    );

    let content;
    if (s.scripts.length === 0) {
      content = el('div', { class: 'card' },
        el('div', { class: 'empty' },
          el('div', { class: 'empty-icon' }, '📝'),
          el('div', { class: 'empty-text' }, '还没有任何稿子'),
          el('div', { class: 'empty-sub' }, 'cold-start 期：从一个观点 / 一个场景 / 一句你听到的话开始'),
          el('button', { class: 'btn btn-primary', onClick: openNewModal }, '写第一份')
        )
      );
    } else {
      content = el('div', { class: 'stack' },
        ...s.scripts.map(scriptRow)
      );
    }

    root.append(header, content);
  }

  function scriptRow(script) {
    const pred = State.getPrediction(script.id);
    const status = script.status;
    const badge = statusBadge(status, pred);

    return el('div', { class: 'list-item' },
      el('div', { class: 'li-head' },
        el('div', { class: 'flex-1' },
          el('div', { class: 'li-title' }, script.title),
          el('div', { class: 'li-meta' },
            `id: ${script.id} · ${fmtDate(script.date)} · ${script.content.length} 字 · ${script.path}`
          )
        ),
        badge
      ),
      el('div', { class: 'li-foot' },
        el('button', { class: 'btn btn-sm', onClick: () => openEditModal(script) }, '编辑'),
        !pred && el('button', { class: 'btn btn-sm',
          onClick: () => App.navigate('score', { scriptId: script.id })
        }, '🎯 看 AI 打分'),
        !pred && el('button', { class: 'btn btn-sm btn-pulse',
          onClick: () => App.navigate('predict', { scriptId: script.id })
        }, '🚀 启动预测'),
        pred && el('button', { class: 'btn btn-sm btn-pulse',
          onClick: () => App.navigate('predict', { view: pred.id })
        }, '查看预测 →'),
        !pred && el('button', { class: 'btn btn-sm',
          onClick: () => UI.confirm({
            title: '删除稿子？', danger: true, confirmText: '删除',
            body: '一旦写过预测，原稿不可删（immutable 链）。当前可删。',
            onConfirm: () => { State.deleteScript(script.id); UI.toast('已删除', 'success'); render(); }
          })
        }, '删除')
      )
    );
  }

  function statusBadge(status, pred) {
    if (pred && pred.retro) return el('span', { class: 'badge green' }, '✅ 已复盘');
    if (pred && pred.published) return el('span', { class: 'badge blue' }, '🚀 已发布');
    if (pred && pred.shot) return el('span', { class: 'badge yellow' }, '🎬 已拍');
    if (pred) return el('span', { class: 'badge accent' }, '🔮 已预测');
    return el('span', { class: 'badge' }, '✏️ 草稿');
  }

  function openNewModal() {
    let close;
    const titleInput = el('input', { class: 'input', placeholder: '例如：停止期待' });
    const shortInput = el('input', { class: 'input', placeholder: '英文 / 拼音短名，用于路径' });
    const contentInput = el('textarea', { class: 'textarea', rows: '12', placeholder: '把稿子粘进来或现写……\n\n（hook → 主体 → 收束。前 3 秒决定 30 秒留存。）' });

    close = UI.modal({
      title: '新建稿子',
      body: el('div', {},
        el('div', { class: 'form-group' },
          el('label', { class: 'label' }, '标题', el('span', { class: 'req' }, '*')),
          titleInput
        ),
        el('div', { class: 'form-group' },
          el('label', { class: 'label' }, '短名 (可选，自动派生)'),
          shortInput
        ),
        el('div', { class: 'form-group' },
          el('label', { class: 'label' }, '稿子内容'),
          contentInput,
          el('div', { class: 'hint' }, '字数由系统自动统计——参与"实际稿长 vs 目标时长"诊断')
        )
      ),
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消'),
        el('button', { class: 'btn btn-primary', onClick: async () => {
          const title = titleInput.value.trim();
          if (!title) { UI.toast('标题不能空', 'error'); return; }
          await State.addScript({
            title,
            shortName: shortInput.value.trim() || title,
            content: contentInput.value
          });
          UI.toast('稿子已建', 'success');
          close();
          render();
        }}, '创建')
      )
    });
  }

  function openEditModal(script) {
    let close;
    const pred = State.getPrediction(script.id);
    const titleInput = el('input', { class: 'input', value: script.title, disabled: !!pred });
    const contentInput = el('textarea', { class: 'textarea', rows: '16' }, script.content);

    close = UI.modal({
      title: '编辑稿子',
      wide: true,
      body: el('div', {},
        pred && el('div', { class: 'immutable-banner' }, '🛡 已有预测——内容仍可改，但 hash 变化会在复盘段标 integrity warning'),
        el('div', { class: 'form-group' },
          el('label', { class: 'label' }, '标题'),
          titleInput
        ),
        el('div', { class: 'form-group' },
          el('label', { class: 'label' }, '稿子内容'),
          contentInput
        )
      ),
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消'),
        el('button', { class: 'btn btn-primary', onClick: async () => {
          State.updateScript(script.id, { title: titleInput.value.trim() || script.title });
          await State.updateScriptContent(script.id, contentInput.value);
          UI.toast('已保存', 'success');
          close();
          render();
        }}, '保存')
      )
    });
  }

  function openSeedModal() {
    let close;
    const themes = el('textarea', { class: 'textarea', rows: '4',
      placeholder: '每行一个关键词，比如：\n暗恋\n家庭责任\n职场内化失败感' });
    const tone = el('select', { class: 'select' },
      el('option', { value: 'reflective' }, '反思 / 克制'),
      el('option', { value: 'rant' }, '怒喷 / 辛辣'),
      el('option', { value: 'satire' }, '戏仿 / 反讽'),
      el('option', { value: 'narrative' }, '叙事 / 故事'));

    close = UI.modal({
      title: '🌱 Seed 选题（cold-start 启动器）',
      body: el('div', {},
        el('div', { class: 'callout' },
          '基于你的关键词，前端会生成 5 条候选选题。'),
        el('div', { class: 'form-group' },
          el('label', { class: 'label' }, '主题关键词'),
          themes
        ),
        el('div', { class: 'form-group' },
          el('label', { class: 'label' }, '语调偏好'),
          tone
        )
      ),
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消'),
        el('button', { class: 'btn btn-primary', onClick: () => {
          const keys = themes.value.split('\n').map(s => s.trim()).filter(Boolean);
          if (keys.length === 0) { UI.toast('至少输入一个关键词', 'error'); return; }
          const seeds = seedTopics(keys, tone.value);
          seeds.forEach(t => State.addCandidate({
            title: t.title, source: 'seed', tier: 'tier2',
            note: t.note
          }));
          UI.toast(`生成 ${seeds.length} 条候选，进入候选池`, 'success');
          close();
          App.navigate('candidates');
        }}, '生成 5 条候选')
      )
    });
  }

  function seedTopics(keys, tone) {
    // local heuristic: produce angle variations per keyword
    const angles = {
      reflective: ['为什么我们都假装看不见 X', 'X 不是问题，是我们对 X 的命名方式有问题', '关于 X，没人告诉过你的三件事'],
      rant: ['X 这种事终于有人敢说了', 'X 的本质就是 ___', '我受够了关于 X 的所有讨论'],
      satire: ['X 完整使用说明书', 'X 在 2026 年的最佳实践（虚构）', '一份关于 X 的严肃学术论文（戏仿）'],
      narrative: ['一个朋友的 X 故事', '我经历 X 的那个晚上', 'X 改变了我的看待方式']
    };
    const list = angles[tone] || angles.reflective;
    const out = [];
    for (const k of keys) {
      for (const tpl of list) {
        out.push({
          title: tpl.replace(/X/g, k),
          note: `seed:${k} · 语调:${tone}`
        });
        if (out.length >= 5) break;
      }
      if (out.length >= 5) break;
    }
    return out;
  }

  window.Views = window.Views || {};
  window.Views.scripts = { render, title: '稿子', sub: '草稿管理 · 每份稿子都是一次未来的实验' };
})();
