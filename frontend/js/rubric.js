// Rubric definitions, calculation, observation lifecycle
(function () {
  // Built-in starter rubrics — sourced from starter-rubrics/*.md
  const RUBRICS = {
    'opinion-video-v0': {
      version: 'v0',
      name: '观点视频 v0（cold-start 等权占位）',
      formula: '(ER + SR + HP + QL + NA + AB + SAT) / 7 × 2.0',
      dimensions: [
        { key: 'ER', name: 'Emotional Resonance', name_cn: '情感共鸣', weight: 1.0,
          hint: '稿子能否在前 30 秒让观众产生一种具体的、能命名的情感？',
          anchors: ['0=纯信息没情感', '3=一般共鸣（"我也有过"）', '5=锐利、让人不太愿意承认的自我识别'] },
        { key: 'SR', name: 'Social Resonance', name_cn: '社会议题共振', weight: 1.0,
          hint: '触及当下的、有争议的、或结构性重要的社会模式吗？',
          anchors: ['0=纯个人/人际', '3=触到公认的社会现象但无新视角', '5=命名了观众认识但没有语言形容的结构性模式'] },
        { key: 'HP', name: 'Hook Potential', name_cn: '钩子强度', weight: 1.0,
          hint: '前 3 秒能不能逼观众看下去 30 秒？',
          anchors: ['0=通用开场', '3=具体承诺或反直觉断言', '5=具体生动的场景或断言，观众无法停止处理'] },
        { key: 'QL', name: 'Quotable Lines', name_cn: '金句密度', weight: 1.0,
          hint: '稿子里至少 2-3 行能被截图、能独立传播吗？',
          anchors: ['0=全是叙述无警句', '3=结尾有一句令人记住', '5=多句独立可用分布在开场/中间/结尾'] },
        { key: 'NA', name: 'Narrativity', name_cn: '叙事性', weight: 1.0,
          hint: '有没有可辨识的弧线——铺垫、升级、收束？',
          anchors: ['0=列表式结构', '3=松散主线', '5=紧凑三幕，结尾 payoff 在开场就埋好'] },
        { key: 'AB', name: 'Audience Breadth', name_cn: '受众广度', weight: 1.0,
          hint: '这个议题的潜在受众有多广？',
          anchors: ['0=极小众', '3=中等（一类人群）', '5=普世（暗恋/家庭/工作）'] },
        { key: 'SAT', name: 'Satire Depth', name_cn: '讽刺深度', weight: 1.0,
          hint: '用了多层反讽 / 戏仿格式 / 自指嘲讽吗？',
          anchors: ['0=真诚直陈', '3=一层反讽', '5=嵌套或自指反讽'] }
      ]
    },
    'opinion-video-v2': {
      version: 'v2',
      name: '观点视频 v2（已校准 25+ 样本）',
      formula: '(ER×1.5 + SR×1.5 + HP×1.5 + QL + NA + AB + SAT) / 8.5 × 2.0',
      dimensions: [
        { key: 'ER', name: 'Emotional Resonance', name_cn: '情感共鸣', weight: 1.5,
          hint: '稿子能否在前 30 秒让观众产生一种具体的、能命名的情感？',
          anchors: ['0=纯信息没情感', '3=一般共鸣', '5=锐利、让人不太愿意承认的自我识别'] },
        { key: 'SR', name: 'Social Resonance', name_cn: '社会议题共振', weight: 1.5,
          hint: '触及结构性重要的社会模式吗？',
          anchors: ['0=纯个人', '3=触到公认现象', '5=命名了无语言形容的结构性模式'] },
        { key: 'HP', name: 'Hook Potential', name_cn: '钩子强度', weight: 1.5,
          hint: '前 3 秒能不能逼观众看下去 30 秒？',
          anchors: ['0=通用开场', '3=具体承诺/反直觉', '5=观众无法停止处理'] },
        { key: 'QL', name: 'Quotable Lines', name_cn: '金句密度', weight: 1.0,
          hint: '至少 2-3 行能被截图、能独立传播吗？',
          anchors: ['0=无警句', '3=结尾有一句', '5=多句独立可用'] },
        { key: 'NA', name: 'Narrativity', name_cn: '叙事性', weight: 1.0,
          hint: '有可辨识的弧线吗？',
          anchors: ['0=列表式', '3=松散主线', '5=紧凑三幕'] },
        { key: 'AB', name: 'Audience Breadth', name_cn: '受众广度', weight: 1.0,
          hint: '潜在受众有多广？',
          anchors: ['0=极小众', '3=中等', '5=普世'] },
        { key: 'SAT', name: 'Satire Depth', name_cn: '讽刺深度', weight: 1.0,
          hint: '多层反讽 / 戏仿吗？',
          anchors: ['0=真诚', '3=一层反讽', '5=嵌套/自指反讽'] }
      ]
    }
  };

  function getRubric(versionId) {
    return RUBRICS[versionId] || RUBRICS['opinion-video-v0'];
  }

  function listRubrics() {
    return Object.entries(RUBRICS).map(([id, r]) => ({ id, ...r }));
  }

  // Composite calculator: weighted average normalised to 0-10 range
  function composite(scores, rubric) {
    const weightSum = rubric.dimensions.reduce((s, d) => s + d.weight, 0);
    let weighted = 0;
    for (const dim of rubric.dimensions) {
      const v = Number(scores[dim.key] || 0);
      weighted += v * dim.weight;
    }
    return Math.round((weighted / weightSum) * 2.0 * 100) / 100;
  }

  // Confidence label derived from calibration sample count
  function confidenceFromSamples(n) {
    if (n < 1) return { level: 'extreme-low', label: '🔴 极低', desc: '无样本，预测仅供热身' };
    if (n < 5) return { level: 'low', label: '🟡 偏低', desc: '中枢 ±40%，可作为参考之一' };
    if (n < 15) return { level: 'mid', label: '🟢 中', desc: '中枢 ±25%' };
    return { level: 'high', label: '🔵 高', desc: '中枢 ±15%' };
  }

  // Bucket presets — common for short video performance (千万播放级)
  const BUCKETS = [
    { range: '<5w', floor: 0, ceil: 50000 },
    { range: '5-30w', floor: 50000, ceil: 300000 },
    { range: '30-100w', floor: 300000, ceil: 1000000 },
    { range: '>100w', floor: 1000000, ceil: 1500000 },
    { range: '>150w', floor: 1500000, ceil: Infinity }
  ];

  function bucketForPlays(plays) {
    for (const b of BUCKETS) {
      if (plays >= b.floor && plays < b.ceil) return b.range;
    }
    return '<5w';
  }

  window.Rubric = {
    RUBRICS, BUCKETS,
    getRubric, listRubrics,
    composite, confidenceFromSamples,
    bucketForPlays
  };
})();
