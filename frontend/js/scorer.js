// Heuristic auto-scorer — runs entirely in browser, no API/network needed.
// Honest about being a rough draft: every output is meant to be reviewed and overridden.
// Outputs match the opinion-video rubric (ER/SR/HP/QL/NA/AB/SAT) 0–5 integers.
(function () {
  // Keyword banks — derived from the rubric's anchor descriptions
  const EMOTION_WORDS = /恐惧|羞耻|孤独|愤怒|温暖|失望|痛苦|绝望|害怕|被骗|羞辱|嫉妒|期待|希望|失败|不愿|心碎|苦涩|无力|哭|焦虑|崩溃|挣扎|沉重|渴望|羡慕|后悔|遗憾|怀念|想念|疲惫|麻木|空虚|孤独|憎恨|怨恨|嫉妒/g;
  const REFLECTIVE = /我曾经|我们都|你也|我也|有没有|你有没有|你是不是|不愿承认|不敢承认|偷偷|心里清楚|装作不知道/g;
  const SOCIETAL = /阶层|教育|经济|政治|性别|职场|内卷|996|社会|底层|资本|消费|时代|系统|结构性|不公|压迫|霸凌|权力|男女|阶级|贫富|城乡|户口|学历|文凭|考公|考研|失业|内耗/g;
  const UNIVERSAL = /家庭|爱情|工作|朋友|父母|孩子|考试|结婚|租房|赚钱|相亲|分手|前任|同事|老板|同学|生病|加班|失眠|减肥|相处|沟通|关系|焦虑|内卷|躺平|人生|未来/g;
  const NARRATIVE_MARKERS = /然后|突然|那一天|记得|后来|当时|有一次|忽然|某天|某次|多年后|很久以前|从前|曾经|那时候|后来才发现|后来我才|那一刻|从那以后/g;
  const IRONY_MARKERS = /[「『""]([^」』""]{2,15})[」』""]|【[^】]+】|(伟大的|完美的|理想的|高尚的|纯洁的).{0,8}(笑)?/g;
  const GENERIC_OPENINGS = /^(大家好|hello|hi|今天聊|今天给大家|今天我们来|今天讲|今天分享|好的|首先|各位|大家|这期|本期)/;
  const QUOTABLE_PATTERNS = /(不是.{1,15}是|的本质是|说白了就是|其实是|我们都|从来不是|根本不是|.{1,10}就是.{1,10}|越.{1,5}越|你以为.{1,10}其实)/g;

  function countMatches(text, regex) {
    const m = text.match(regex);
    return m ? m.length : 0;
  }

  // Each dimension scored 0–5 based on text features.
  // Conservative bias: when uncertain, return 2–3 (middle).
  function scoreText(text) {
    const t = String(text || '');
    const len = t.length;
    const lines = t.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const firstPara = (lines[0] || '').slice(0, 200);

    // ============ HP (Hook Potential) ============
    let HP = 2;
    if (GENERIC_OPENINGS.test(firstPara.trim())) HP = 1;
    if (firstPara.length >= 30 && !GENERIC_OPENINGS.test(firstPara)) HP = 3;
    // Specific imagery / numbers / quoted phrase → bump
    if (/\d+(\.\d+)?%|\d+(\.\d+)?(万|亿|千)/.test(firstPara)) HP = Math.max(HP, 4);
    if (/[「『""].{4,30}[」』""]/.test(firstPara)) HP = Math.max(HP, 4);
    // Strong counterintuitive opening pattern
    if (/^.{0,40}(不是|从来不是|根本不是|你以为)/.test(firstPara)) HP = Math.max(HP, 4);
    if (len < 80) HP = Math.min(HP, 2);

    // ============ ER (Emotional Resonance) ============
    const emo = countMatches(t, EMOTION_WORDS);
    const refl = countMatches(t, REFLECTIVE);
    let ER = Math.min(5, Math.floor(emo / 2) + Math.floor(refl / 2));
    if (ER === 0 && (emo > 0 || refl > 0)) ER = 1;
    if (refl >= 3 && emo >= 4) ER = Math.max(ER, 4);

    // ============ SR (Social Resonance) ============
    const soc = countMatches(t, SOCIETAL);
    let SR = Math.min(5, Math.floor(soc / 2));
    if (soc >= 6) SR = Math.max(SR, 4);

    // ============ AB (Audience Breadth) ============
    const uni = countMatches(t, UNIVERSAL);
    let AB = 2;
    if (uni >= 2) AB = 3;
    if (uni >= 5) AB = 4;
    if (uni >= 8) AB = 5;

    // ============ QL (Quotable Lines) ============
    const sentences = t.split(/[。！？!?]/).map(s => s.trim()).filter(Boolean);
    const quotable = sentences.filter(s => {
      if (s.length < 6 || s.length > 35) return false;
      return QUOTABLE_PATTERNS.test(s) || /^[「『""].{4,30}/.test(s);
    }).length;
    QUOTABLE_PATTERNS.lastIndex = 0;
    let QL = Math.min(5, Math.floor(quotable / 2));
    if (len < 100) QL = Math.min(QL, 1);

    // ============ NA (Narrativity) ============
    const narr = countMatches(t, NARRATIVE_MARKERS);
    const hasList = /^[0-9一二三四五]\.|^[•\-*]\s/m.test(t);
    let NA = Math.min(5, Math.floor(narr / 2));
    if (hasList) NA = Math.max(1, NA - 2);
    if (narr === 0) NA = 1;

    // ============ SAT (Satire Depth) ============
    const irony = countMatches(t, IRONY_MARKERS);
    IRONY_MARKERS.lastIndex = 0;
    let SAT = Math.min(5, Math.floor(irony / 2));
    if (SAT === 0 && irony > 0) SAT = 1;
    if (SAT === 0) SAT = 1;

    return { ER, SR, HP, QL, NA, AB, SAT };
  }

  // Bucket prediction from composite. Returns the BUCKET RANGE the user is "betting".
  function bucketFromComposite(comp) {
    if (comp >= 8.0) return '30-100w';
    if (comp >= 6.5) return '5-30w';
    if (comp >= 4.5) return '5-30w';
    return '<5w';
  }

  // Probability distribution shaped by composite + sample count.
  // Cold-start (few samples) → flatter; mature → sharper around headline.
  function distFromComposite(comp, samples) {
    const headline = bucketFromComposite(comp);
    // Sharpness: 0.0 (flat) → 1.0 (very sharp)
    const sharp = Math.min(1, samples / 15);
    const peakPct = Math.round(30 + sharp * 30); // 30–60
    const wingHi = Math.round((100 - peakPct) * 0.4);
    const wingLo = Math.round((100 - peakPct) * 0.4);
    const tails = (100 - peakPct - wingHi - wingLo) / 2;

    // Define the 5 buckets in order
    const buckets = ['<5w', '5-30w', '30-100w', '>100w', '>150w'];
    const centerCenter = { '<5w': 3, '5-30w': 15, '30-100w': 50, '>100w': 120, '>150w': 200 }[headline] || 50;
    const idx = buckets.indexOf(headline);
    const dist = buckets.map((range, i) => {
      let percent;
      if (i === idx) percent = peakPct;
      else if (Math.abs(i - idx) === 1) percent = (i < idx ? wingLo : wingHi);
      else percent = Math.max(1, Math.round(tails));
      return {
        range,
        percent,
        headline: i === idx,
        center: i === idx ? centerCenter : 0
      };
    });

    // Normalise to exactly 100
    const sum = dist.reduce((s, b) => s + b.percent, 0);
    if (sum !== 100) dist[idx].percent += (100 - sum);

    return dist;
  }

  // One-line reason auto-assembled from top 2 scoring dims + composite range.
  function autoReason(scores, comp) {
    const labels = {
      ER: '情感锐利', SR: '议题厚重', HP: '钩子强', QL: '金句密',
      NA: '叙事紧', AB: '受众普世', SAT: '反讽嵌套'
    };
    const lowLabels = {
      ER: '情感薄', SR: '议题轻', HP: '钩子弱', QL: '金句少',
      NA: '叙事散', AB: '受众窄', SAT: '直陈'
    };
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 2).filter(([k, v]) => v >= 4).map(([k]) => labels[k]);
    const low = sorted.slice(-2).filter(([k, v]) => v <= 1).map(([k]) => lowLabels[k]);
    const headline = bucketFromComposite(comp);
    const centerMap = { '<5w': '~3w', '5-30w': '~15w', '30-100w': '~50w', '>100w': '~120w', '>150w': '~200w' };
    const parts = [];
    if (top.length) parts.push(top.join(' + '));
    if (low.length) parts.push('但' + low.join('/'));
    parts.push('中枢 ' + (centerMap[headline] || ''));
    return parts.join(' · ');
  }

  // Auto-derived reasoning factors from top-scoring dims.
  function autoFactors(scores) {
    const map = {
      ER: '情感共鸣', SR: '社会议题', HP: '钩子强度', QL: '金句密度',
      NA: '叙事性', AB: '受众广度', SAT: '讽刺深度'
    };
    return Object.entries(scores)
      .filter(([k, v]) => v >= 4 || v <= 1)
      .map(([k, v]) => ({
        factor: k,
        direction: v >= 4 ? '强 +' : v <= 1 ? '强 -' : '中 +',
        confidence: '中',
        note: v >= 4 ? `${map[k]} 在 anchor 级` : v <= 1 ? `${map[k]} 拖后腿` : `${map[k]} 中性`
      }));
  }

  // Auto-suggest verified/refuted bullets by comparing actual data vs predicted factors + bucket.
  function autoRetroCompare(prediction, actuals) {
    const verified = [];
    const refuted = [];
    const r = actuals;
    const plays = Number(r.actualPlays) || 0;
    const playsW = plays / 10000;
    const headline = (prediction.probDistribution.find(b => b.headline) || {});
    const center = headline.center || 0;
    const actualBucket = window.Rubric.bucketForPlays(plays);

    // 1) Bucket hit check
    if (actualBucket === prediction.bucket) {
      verified.push(`实际播放 ${playsW.toFixed(1)}w 落在押注桶 ${prediction.bucket} 内 — 核心 bucket 押对`);
    } else {
      refuted.push(`实际落在 ${actualBucket}，押的是 ${prediction.bucket} — 桶判断错位`);
    }

    // 2) Center deviation
    if (center > 0) {
      const drift = ((playsW - center) / center) * 100;
      if (Math.abs(drift) <= 25) {
        verified.push(`中枢 ${center}w 估算贴近实际 ${playsW.toFixed(1)}w（偏差 ${drift.toFixed(0)}%）`);
      } else if (drift > 0) {
        refuted.push(`中枢 ${center}w 低估实际 ${playsW.toFixed(1)}w（+${drift.toFixed(0)}%）`);
      } else {
        refuted.push(`中枢 ${center}w 高估实际 ${playsW.toFixed(1)}w（${drift.toFixed(0)}%）`);
      }
    }

    // 3) Share ratio signal
    const sharesNum = Number(r.actualShares) || 0;
    if (plays > 0 && sharesNum > 0) {
      const sharePct = sharesNum / plays * 100;
      if (sharePct >= 2.0) verified.push(`分播比 ${sharePct.toFixed(2)}% — 强分享冲动信号`);
      else if (sharePct <= 0.8) refuted.push(`分播比仅 ${sharePct.toFixed(2)}% — 即使广也没传播力`);
    }

    // 4) Per-factor verification
    for (const f of prediction.reasoningFactors || []) {
      if (f.confidence === '高') {
        const aligned = (f.direction.includes('+') && playsW >= center) ||
                        (f.direction.includes('-') && playsW < center);
        if (aligned) verified.push(`高置信因素 ${f.factor} ${f.direction} 与实际一致`);
        else refuted.push(`高置信因素 ${f.factor} ${f.direction} 被推翻 — rubric bug 信号`);
      }
    }

    return { verified, refuted };
  }

  window.Scorer = {
    scoreText, bucketFromComposite, distFromComposite,
    autoReason, autoFactors, autoRetroCompare
  };
})();
