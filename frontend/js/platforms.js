// Platform configs — each platform has its own performance bucket ranges,
// primary metric, and derivative ratios. The methodology is universal,
// but Douyin/Kuaishou are best-supported because the built-in rubric was
// originally calibrated on a Douyin opinion-video creator's 25+ samples.
(function () {
  const PLATFORMS = {
    douyin: {
      id: 'douyin',
      name: '抖音',
      icon: '🎵',
      optimal: true,
      desc: 'rubric 校准来源 · 完整闭环已验证',
      primaryMetric: '播放',
      bucketUnit: '万',
      buckets: [
        { range: '<5w', label: '<5w 播放', floor: 0, ceil: 50000, center: 3 },
        { range: '5-30w', label: '5-30w 播放', floor: 50000, ceil: 300000, center: 15 },
        { range: '30-100w', label: '30-100w 播放', floor: 300000, ceil: 1000000, center: 50 },
        { range: '>100w', label: '100-150w 播放', floor: 1000000, ceil: 1500000, center: 120 },
        { range: '>150w', label: '>150w 播放', floor: 1500000, ceil: Infinity, center: 200 }
      ],
      retroMetrics: [
        { key: 'plays', label: '播放', required: true },
        { key: 'likes', label: '点赞', derivedLabel: '赞播比' },
        { key: 'comments', label: '评论', derivedLabel: '评播比' },
        { key: 'saves', label: '收藏' },
        { key: 'shares', label: '分享', derivedLabel: '分播比', critical: true }
      ],
      tips: '分播比 ≥ 2% 是议题分享冲动的关键信号。前 3 秒钩子最重要。'
    },
    kuaishou: {
      id: 'kuaishou',
      name: '快手',
      icon: '⚡',
      optimal: true,
      desc: '与抖音同算法逻辑，rubric 直接复用',
      primaryMetric: '播放',
      bucketUnit: '万',
      buckets: [
        { range: '<5w', label: '<5w 播放', floor: 0, ceil: 50000, center: 3 },
        { range: '5-30w', label: '5-30w 播放', floor: 50000, ceil: 300000, center: 15 },
        { range: '30-100w', label: '30-100w 播放', floor: 300000, ceil: 1000000, center: 50 },
        { range: '>100w', label: '100-150w 播放', floor: 1000000, ceil: 1500000, center: 120 },
        { range: '>150w', label: '>150w 播放', floor: 1500000, ceil: Infinity, center: 200 }
      ],
      retroMetrics: [
        { key: 'plays', label: '播放', required: true },
        { key: 'likes', label: '点赞', derivedLabel: '赞播比' },
        { key: 'comments', label: '评论', derivedLabel: '评播比' },
        { key: 'saves', label: '收藏' },
        { key: 'shares', label: '分享', derivedLabel: '分播比', critical: true }
      ],
      tips: '快手用户更下沉，亲和力 / 共鸣权重比抖音略高。'
    },
    xiaohongshu: {
      id: 'xiaohongshu',
      name: '小红书',
      icon: '📔',
      optimal: false,
      desc: '播放数不公开，按"赞"统计；收藏率比赞重要',
      primaryMetric: '赞',
      bucketUnit: '个',
      buckets: [
        { range: '<100', label: '<100 赞', floor: 0, ceil: 100, center: 50 },
        { range: '100-1k', label: '100-1000 赞', floor: 100, ceil: 1000, center: 500 },
        { range: '1k-1w', label: '1000-1w 赞', floor: 1000, ceil: 10000, center: 5000 },
        { range: '1w-5w', label: '1w-5w 赞', floor: 10000, ceil: 50000, center: 25000 },
        { range: '>5w', label: '>5w 赞', floor: 50000, ceil: Infinity, center: 100000 }
      ],
      retroMetrics: [
        { key: 'likes', label: '赞', required: true },
        { key: 'saves', label: '收藏', critical: true },
        { key: 'comments', label: '评论' },
        { key: 'shares', label: '转发' },
        { key: 'follows', label: '涨粉' }
      ],
      tips: '小红书核心是「收藏」(实用价值信号) — 收藏 > 赞表明你的内容值得回看。'
    },
    bilibili: {
      id: 'bilibili',
      name: 'B 站',
      icon: '📺',
      optimal: false,
      desc: '播放为主，但三连率 / 完播率更能反映质量',
      primaryMetric: '播放',
      bucketUnit: '',
      buckets: [
        { range: '<1w', label: '<1w 播放', floor: 0, ceil: 10000, center: 5000 },
        { range: '1w-10w', label: '1w-10w 播放', floor: 10000, ceil: 100000, center: 50000 },
        { range: '10w-50w', label: '10w-50w 播放', floor: 100000, ceil: 500000, center: 200000 },
        { range: '50w-200w', label: '50w-200w 播放', floor: 500000, ceil: 2000000, center: 1000000 },
        { range: '>200w', label: '>200w 播放', floor: 2000000, ceil: Infinity, center: 5000000 }
      ],
      retroMetrics: [
        { key: 'plays', label: '播放', required: true },
        { key: 'likes', label: '点赞', derivedLabel: '点赞率' },
        { key: 'coins', label: '投币', derivedLabel: '投币率', critical: true },
        { key: 'favorites', label: '收藏', derivedLabel: '收藏率' },
        { key: 'comments', label: '评论' },
        { key: 'shares', label: '转发' }
      ],
      tips: '三连率（点赞+投币+收藏）是 B 站算法最重要的信号。叙事性 NA 权重应上调。'
    },
    youtube: {
      id: 'youtube',
      name: 'YouTube',
      icon: '🎥',
      optimal: false,
      desc: 'CTR + AVD 才是真信号；播放只是表面',
      primaryMetric: 'Views',
      bucketUnit: '',
      buckets: [
        { range: '<1k', label: '<1k views', floor: 0, ceil: 1000, center: 500 },
        { range: '1k-10k', label: '1k-10k views', floor: 1000, ceil: 10000, center: 5000 },
        { range: '10k-100k', label: '10k-100k views', floor: 10000, ceil: 100000, center: 50000 },
        { range: '100k-1M', label: '100k-1M views', floor: 100000, ceil: 1000000, center: 500000 },
        { range: '>1M', label: '>1M views', floor: 1000000, ceil: Infinity, center: 2000000 }
      ],
      retroMetrics: [
        { key: 'views', label: 'Views', required: true },
        { key: 'ctr', label: 'CTR (%)', critical: true },
        { key: 'avd', label: 'AVD (avg view duration, sec)', critical: true },
        { key: 'likes', label: 'Likes' },
        { key: 'comments', label: 'Comments' }
      ],
      tips: 'Thumbnail + Title 决定 CTR；AVD 决定 algorithm reach。Hook 权重 ×2.0。'
    },
    wechat: {
      id: 'wechat',
      name: '公众号',
      icon: '✉️',
      optimal: false,
      desc: '长文形态 — rubric 需要调整（去 HP，加文章结构 / 转发动机）',
      primaryMetric: '阅读量',
      bucketUnit: '',
      buckets: [
        { range: '<100', label: '<100 阅读', floor: 0, ceil: 100, center: 50 },
        { range: '100-1k', label: '100-1k 阅读', floor: 100, ceil: 1000, center: 500 },
        { range: '1k-1w', label: '1k-1w 阅读', floor: 1000, ceil: 10000, center: 5000 },
        { range: '1w-10w', label: '1w-10w 阅读', floor: 10000, ceil: 100000, center: 50000 },
        { range: '10w+', label: '10w+ 阅读', floor: 100000, ceil: Infinity, center: 500000 }
      ],
      retroMetrics: [
        { key: 'reads', label: '阅读量', required: true },
        { key: 'shares', label: '转发', critical: true, derivedLabel: '转发率' },
        { key: 'likes', label: '在看', derivedLabel: '在看率' },
        { key: 'comments', label: '留言' },
        { key: 'follows', label: '涨粉' }
      ],
      tips: '"转发动机"和"在看率"才是公众号的核心信号。当前 rubric 是视频形态，公众号建议你自己起新 rubric。'
    },
    twitter: {
      id: 'twitter',
      name: 'X / 微博',
      icon: '🐦',
      optimal: false,
      desc: '短文 thread — 第一条 hook 决定生死',
      primaryMetric: '转推/转发',
      bucketUnit: '',
      buckets: [
        { range: '<10', label: '<10 转推', floor: 0, ceil: 10, center: 5 },
        { range: '10-100', label: '10-100 转推', floor: 10, ceil: 100, center: 50 },
        { range: '100-1k', label: '100-1k 转推', floor: 100, ceil: 1000, center: 500 },
        { range: '1k-1w', label: '1k-1w 转推', floor: 1000, ceil: 10000, center: 5000 },
        { range: '>1w', label: '>1w 转推', floor: 10000, ceil: Infinity, center: 30000 }
      ],
      retroMetrics: [
        { key: 'retweets', label: '转推', required: true },
        { key: 'likes', label: '赞' },
        { key: 'impressions', label: '展现' },
        { key: 'replies', label: '回复' },
        { key: 'follows', label: '涨粉' }
      ],
      tips: '第一条 tweet 的 hook 决定整条 thread 的展现。HP 权重应上调。'
    }
  };

  function get(id) {
    return PLATFORMS[id] || PLATFORMS.douyin;
  }

  function list() {
    return Object.values(PLATFORMS);
  }

  function bucketForValue(platformId, value) {
    const p = get(platformId);
    const v = Number(value) || 0;
    for (const b of p.buckets) {
      if (v >= b.floor && v < b.ceil) return b.range;
    }
    return p.buckets[0].range;
  }

  function centerFor(platformId, range) {
    const p = get(platformId);
    const b = p.buckets.find(x => x.range === range);
    return b ? b.center : 0;
  }

  function formatValue(platformId, value) {
    const p = get(platformId);
    if (value == null || isNaN(value)) return '—';
    const v = Number(value);
    if (p.bucketUnit === '万') {
      const w = v / 10000;
      if (w >= 100) return Math.round(w) + ' 万';
      if (w >= 10) return w.toFixed(1) + ' 万';
      if (w >= 1) return w.toFixed(2) + ' 万';
      return v.toLocaleString();
    }
    return v.toLocaleString();
  }

  window.Platforms = { PLATFORMS, get, list, bucketForValue, centerFor, formatValue };
})();
