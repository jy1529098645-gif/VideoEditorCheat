// Benchmark view — reference accounts (cheat-learn-from equivalent)
(function () {
  const { el, fmtDate, fmtPlays } = UI;

  function render() {
    const root = document.getElementById('view-benchmark');
    UI.clear(root);
    const s = State.get();

    const header = el('div', { class: 'section-header' },
      el('div', {},
        el('h2', {}, '🎬 对标账号'),
        el('p', { class: 'muted', style: { fontSize: '12px' } },
          'cold-start 强烈建议导入对标账号 — 5–10 个样本就能给 rubric 一个锚点')
      ),
      el('button', { class: 'btn btn-primary', onClick: openNew }, '+ 加对标账号')
    );

    let body;
    if (s.benchmarks.length === 0) {
      body = el('div', { class: 'card' },
        el('div', { class: 'empty' },
          el('div', { class: 'empty-icon' }, '🎯'),
          el('div', { class: 'empty-text' }, '没有对标账号'),
          el('div', { class: 'empty-sub' }, '没有锚点的话，前 5 篇预测会落在 ±50% 精度'),
          el('button', { class: 'btn btn-primary', onClick: openNew }, '+ 导入第一个')
        )
      );
    } else {
      body = el('div', { class: 'stack' },
        ...s.benchmarks.map(b => renderCard(b))
      );
    }

    root.append(header, body);
  }

  function renderCard(b) {
    return el('div', { class: 'card' },
      el('div', { class: 'card-title' },
        el('span', {}, '👤 ' + b.name),
        b.url && el('a', { href: b.url, target: '_blank',
          style: { marginLeft: '8px', fontSize: '12px', fontWeight: '400' } }, b.url),
        el('button', { class: 'btn btn-sm', style: { marginLeft: 'auto' },
          onClick: () => openAddVideo(b) }, '+ 视频样本'),
        el('button', { class: 'btn btn-sm', onClick: () => openEdit(b) }, '编辑'),
        el('button', { class: 'btn btn-sm', onClick: () => deleteIt(b) }, '−')
      ),
      b.notes && el('div', { class: 'muted', style: { fontSize: '13px', marginBottom: '12px' } }, b.notes),
      (b.videos && b.videos.length > 0)
        ? el('table', { class: 'table' },
            el('thead', {}, el('tr', {},
              el('th', {}, '标题'),
              el('th', {}, '播放'),
              el('th', {}, '点赞'),
              el('th', {}, '评论'),
              el('th', {}, '分享'),
              el('th', {}, '日期'))),
            el('tbody', {},
              ...b.videos.map(v => el('tr', {},
                el('td', {}, v.title),
                el('td', { class: 'mono' }, fmtPlays(v.plays)),
                el('td', { class: 'mono dim' }, fmtPlays(v.likes)),
                el('td', { class: 'mono dim' }, UI.fmt(v.comments)),
                el('td', { class: 'mono dim' }, fmtPlays(v.shares)),
                el('td', { class: 'dim' }, v.savedAt)
              ))
            )
          )
        : el('div', { class: 'muted', style: { fontSize: '12px' } }, '（还没有视频样本）')
    );
  }

  function openNew() {
    let close;
    const name = el('input', { class: 'input', placeholder: '账号名 / 博主名' });
    const url = el('input', { class: 'input', placeholder: 'https://...（可选）' });
    const notes = el('textarea', { class: 'textarea', rows: '3', placeholder: '为什么对标这个账号？他们做对了什么？' });

    close = UI.modal({
      title: '+ 加对标账号',
      body: el('div', {},
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '名称'), name),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '链接'), url),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '笔记'), notes)
      ),
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消'),
        el('button', { class: 'btn btn-primary', onClick: () => {
          if (!name.value.trim()) { UI.toast('名字不能空', 'error'); return; }
          State.addBenchmark({ name: name.value.trim(), url: url.value, notes: notes.value });
          close();
          render();
        }}, '加')
      )
    });
  }

  function openEdit(b) {
    let close;
    const name = el('input', { class: 'input', value: b.name });
    const url = el('input', { class: 'input', value: b.url });
    const notes = el('textarea', { class: 'textarea', rows: '3' }, b.notes || '');
    close = UI.modal({
      title: '编辑对标账号',
      body: el('div', {},
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '名称'), name),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '链接'), url),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '笔记'), notes)
      ),
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消'),
        el('button', { class: 'btn btn-primary', onClick: () => {
          State.updateBenchmark(b.id, { name: name.value, url: url.value, notes: notes.value });
          close();
          render();
        }}, '保存')
      )
    });
  }

  function openAddVideo(b) {
    let close;
    const title = el('input', { class: 'input', placeholder: '视频标题' });
    const plays = el('input', { class: 'input', type: 'number', placeholder: '播放（绝对值）' });
    const likes = el('input', { class: 'input', type: 'number', placeholder: '点赞' });
    const comments = el('input', { class: 'input', type: 'number', placeholder: '评论' });
    const shares = el('input', { class: 'input', type: 'number', placeholder: '分享' });
    const date = el('input', { class: 'input', type: 'date', value: State.today() });
    const transcript = el('textarea', { class: 'textarea', rows: '4', placeholder: '转录 / 关键金句（可选）' });

    close = UI.modal({
      title: '+ 加视频样本到 ' + b.name,
      body: el('div', {},
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '标题'), title),
        el('div', { class: 'grid grid-2' },
          el('div', { class: 'form-group' }, el('label', { class: 'label' }, '播放'), plays),
          el('div', { class: 'form-group' }, el('label', { class: 'label' }, '日期'), date)
        ),
        el('div', { class: 'grid grid-3' },
          el('div', { class: 'form-group' }, el('label', { class: 'label' }, '点赞'), likes),
          el('div', { class: 'form-group' }, el('label', { class: 'label' }, '评论'), comments),
          el('div', { class: 'form-group' }, el('label', { class: 'label' }, '分享'), shares)
        ),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, '转录 / 笔记'), transcript)
      ),
      footer: el('div', { class: 'row gap-sm' },
        el('button', { class: 'btn btn-ghost', onClick: () => close() }, '取消'),
        el('button', { class: 'btn btn-primary', onClick: () => {
          if (!title.value.trim()) { UI.toast('标题不能空', 'error'); return; }
          const videos = b.videos || [];
          videos.unshift({
            videoId: State.genId(),
            title: title.value.trim(),
            plays: Number(plays.value) || 0,
            likes: Number(likes.value) || 0,
            comments: Number(comments.value) || 0,
            shares: Number(shares.value) || 0,
            savedAt: date.value,
            transcript: transcript.value
          });
          State.updateBenchmark(b.id, { videos });
          close();
          render();
        }}, '加')
      )
    });
  }

  function deleteIt(b) {
    UI.confirm({
      title: '删除对标账号？',
      body: `连同 ${b.videos ? b.videos.length : 0} 条视频样本一起删。`,
      danger: true,
      onConfirm: () => { State.deleteBenchmark(b.id); render(); }
    });
  }

  window.Views = window.Views || {};
  window.Views.benchmark = { render, title: '对标账号', sub: '5-10 个样本就够给 rubric 锚点' };
})();
