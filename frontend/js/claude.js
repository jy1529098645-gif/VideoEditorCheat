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

    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(body)
      });
    } catch (netErr) {
      const msg = `网络/CORS 错误：${netErr.message}（可能是 key 格式错、网络被墙、或浏览器拒绝 CORS）`;
      window._lastClaudeError = { kind: 'network', message: msg, raw: String(netErr) };
      throw new Error(msg);
    }

    if (!response.ok) {
      let errText = '';
      try { errText = await response.text(); } catch (e) {}
      const m = errText.match(/"message":\s*"([^"]+)"/);
      const errMsg = `API ${response.status}: ${m ? m[1] : errText.slice(0, 300)}`;
      window._lastClaudeError = {
        kind: 'http', status: response.status, message: errMsg, raw: errText, requestBody: body
      };
      throw new Error(errMsg);
    }
    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      throw new Error('响应不是合法 JSON: ' + parseErr.message);
    }
    const text = (data.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');
    const usage = data.usage || {};
    window._lastClaudeError = null;
    return { text, usage, raw: data };
  }

  function parseJson(text) {
    let t = (text || '').trim();
    // Strip markdown fences
    if (t.startsWith('```')) {
      t = t.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    // Extract the first {...} object if there's leading explanation text
    const m = t.match(/\{[\s\S]*\}/);
    if (m) t = m[0];
    try {
      return JSON.parse(t);
    } catch (e) {
      const err = new Error('Claude 返回的 JSON 解析失败：' + e.message + ' / 原文片段：' + (text || '').slice(0, 200));
      window._lastClaudeError = { kind: 'parse', message: err.message, raw: text };
      throw err;
    }
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

  // Full diagnostic: returns a stringified report whether call succeeds or fails
  async function diagnose() {
    const lines = [];
    const log = (s) => lines.push(s);
    const key = getKey();
    log('== Claude API 诊断 ==');
    log('Key length: ' + (key ? key.length : 0) + ' (prefix: ' + (key ? key.slice(0, 10) + '…' : '(空)') + ')');
    log('Key 格式: ' + (key && key.startsWith('sk-ant-') ? '✓ sk-ant-* 前缀正确' : '✗ 期待 sk-ant-* 开头'));
    log('Model: ' + getModel());
    log('Endpoint: https://api.anthropic.com/v1/messages');
    log('');

    try {
      log('→ 发送请求…');
      const t0 = Date.now();
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: getModel(),
          max_tokens: 20,
          messages: [{ role: 'user', content: 'reply with the single word: ok' }]
        })
      });
      const dt = Date.now() - t0;
      log(`← HTTP ${response.status} ${response.statusText}  (${dt}ms)`);
      const text = await response.text();
      if (response.ok) {
        const data = JSON.parse(text);
        const reply = (data.content || []).map(c => c.text || '').join('').trim();
        log('✓ 模型回复: "' + reply + '"');
        log('用量 (本次): input ' + (data.usage?.input_tokens || 0) + ' / output ' + (data.usage?.output_tokens || 0) + ' tokens');
        log('');
        log('== 结论 ==  ✅ Claude API 可用');
      } else {
        log('响应正文:');
        log(text.slice(0, 600));
        log('');
        log('== 结论 ==  ❌ HTTP 错误');
        log('常见解决:');
        if (response.status === 401) log(' • 401 = key 无效 / 过期 / 误粘了空格。去 console.anthropic.com 重发一个');
        else if (response.status === 404) log(' • 404 = model 不存在。试切换到 claude-sonnet-4-6 或 claude-haiku-4-5-20251001');
        else if (response.status === 429) log(' • 429 = 限流，等几秒重试');
        else if (response.status === 400) log(' • 400 = 请求体格式错。看响应正文找具体字段');
        else if (response.status >= 500) log(' • 5xx = Anthropic 服务端临时问题，重试');
      }
    } catch (e) {
      log('✗ 抛出异常: ' + e.name + ': ' + e.message);
      log('');
      log('== 结论 ==  ❌ 网络层错误');
      if (e.name === 'TypeError' && /fetch/i.test(e.message)) {
        log('几乎肯定是 CORS 失败。可能原因：');
        log(' • 浏览器版本太老，不支持 anthropic-dangerous-direct-browser-access');
        log(' • 你访问的不是 https://（http 站点不能调 https 跨域）');
        log(' • 公司网络/代理拦截了 anthropic.com');
        log(' • 加了广告拦截插件干扰了请求');
      }
    }
    return lines.join('\n');
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
    callMessages, parseJson, scoreScript, retroBullets, ping, diagnose,
    getLastError: () => window._lastClaudeError || null,
    MODELS, DEFAULT_MODEL
  };
})();
