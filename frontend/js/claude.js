// Claude API wrapper — browser-direct via anthropic-dangerous-direct-browser-access.
// Key lives in localStorage only, never sent anywhere except api.anthropic.com.
(function () {
  const KEY_STORE = 'cheat-on-content:claude-key';
  const MODEL_STORE = 'cheat-on-content:claude-model';
  const DEFAULT_MODEL = 'claude-sonnet-4-6';

  function getKey() {
    try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
  }
  function setKey(k) {
    try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch (e) {}
  }
  function getModel() {
    try { return localStorage.getItem(MODEL_STORE) || DEFAULT_MODEL; } catch (e) { return DEFAULT_MODEL; }
  }
  function setModel(m) {
    try { if (m) localStorage.setItem(MODEL_STORE, m); } catch (e) {}
  }
  function isEnabled() { return !!getKey(); }

  async function callMessages({ system, userText, maxTokens = 1024, model }) {
    const apiKey = getKey();
    if (!apiKey) throw new Error('未配置 Claude API key');

    const body = {
      model: model || getModel(),
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userText }]
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      let errText = '';
      try { errText = await response.text(); } catch (e) {}
      const m = errText.match(/"message":\s*"([^"]+)"/);
      throw new Error(`API ${response.status}: ${m ? m[1] : errText.slice(0, 200)}`);
    }
    const data = await response.json();
    const text = (data.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');
    const usage = data.usage || {};
    return { text, usage, raw: data };
  }

  function parseJson(text) {
    // Strip markdown fences if present (the prompt asks not to use them but be defensive)
    let t = text.trim();
    if (t.startsWith('```')) {
      t = t.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    return JSON.parse(t);
  }

  async function scoreScript(scriptText, opts = {}) {
    const sys = window.ReferenceData.SCORING_SYSTEM_PROMPT;
    const userText = `请评分以下稿子：\n\n<script>\n${scriptText}\n</script>`;
    const { text, usage } = await callMessages({ system: sys, userText, maxTokens: 1024, model: opts.model });
    const parsed = parseJson(text);
    return { ...parsed, _usage: usage };
  }

  async function retroBullets(prediction, actuals, opts = {}) {
    const sys = window.ReferenceData.RETRO_SYSTEM_PROMPT;
    const userText = `# Prediction (immutable)
- title: ${prediction.title}
- scores: ${JSON.stringify(prediction.scores)}
- composite: ${prediction.composite}
- predicted bucket: ${prediction.bucket}
- probDistribution: ${JSON.stringify(prediction.probDistribution)}
- reasoning factors: ${JSON.stringify(prediction.reasoningFactors)}
- one-line reason: ${prediction.reason}
- assumptions: ${prediction.assumptions || '(none)'}

# Actual data (T+${actuals.daysSincePublish || '?'}d)
- 播放/主指标: ${actuals.actualPlays}
- 点赞: ${actuals.actualLikes}
- 评论: ${actuals.actualComments}
- 收藏: ${actuals.actualSaves}
- 分享: ${actuals.actualShares}
- comment keywords: ${actuals.commentKeywords || '(none)'}

请输出 JSON。`;
    const { text, usage } = await callMessages({ system: sys, userText, maxTokens: 1024, model: opts.model });
    const parsed = parseJson(text);
    return { ...parsed, _usage: usage };
  }

  async function ping() {
    // Cheap call to verify key works
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getKey(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: getModel(),
        max_tokens: 10,
        messages: [{ role: 'user', content: 'reply with the single word: ok' }]
      })
    });
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`API ${response.status}: ${txt.slice(0, 200)}`);
    }
    const data = await response.json();
    return { ok: true, model: data.model, usage: data.usage };
  }

  // List of model IDs the user can pick from
  const MODELS = [
    { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', desc: '最便宜 · 中文锐利度一般' },
    { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', desc: '默认 · 性价比最高' },
    { id: 'claude-opus-4-7', name: 'Opus 4.7', desc: '最锐利 · 价格 ≈ 6× Sonnet' }
  ];

  window.Claude = {
    getKey, setKey, getModel, setModel, isEnabled,
    callMessages, parseJson, scoreScript, retroBullets, ping,
    MODELS, DEFAULT_MODEL
  };
})();
