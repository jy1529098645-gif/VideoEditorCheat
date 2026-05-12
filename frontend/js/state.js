// Central state machine — single source of truth, observable pattern
(function () {
  const DEFAULT_STATE = {
    schemaVersion: 1,
    initialised: false,
    mode: 'cold-start', // 'cold-start' | 'calibration'
    contentForm: 'opinion-video',
    platform: 'douyin', // 'douyin' (optimal) | 'kuaishou' | 'xiaohongshu' | 'bilibili' | 'youtube' | 'wechat' | 'twitter'
    activeRubric: 'opinion-video-v0',
    settings: {
      typicalDurationSeconds: 240,
      retroWindowDays: 3,
      minSamplesForBump: 5,
      bufferWarnThreshold: 0,
      bufferGoodThreshold: 2,
      crossModelAudit: true
    },
    scripts: [],         // drafts
    predictions: [],     // immutable predictions linked to scripts
    candidates: [],
    benchmarks: [],
    observations: [],    // rubric_notes observations (active only — refuted/absorbed are deleted)
    bumps: [],           // history of rubric upgrades
    usageLog: []         // event log, like usage.jsonl
  };

  const listeners = new Set();
  let state = null;

  function load() {
    const stored = window.Storage.read();
    if (stored && stored.schemaVersion === DEFAULT_STATE.schemaVersion) {
      state = stored;
      // ensure new fields exist after upgrades
      for (const k of Object.keys(DEFAULT_STATE)) {
        if (!(k in state)) state[k] = DEFAULT_STATE[k];
      }
    } else {
      state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      // seed with a couple of demo observations for context
      state.observations = [];
    }
  }

  function save() {
    window.Storage.write(state);
    notify();
  }

  function get() { return state; }

  function set(patch) {
    Object.assign(state, patch);
    save();
  }

  function reset() {
    window.Storage.clear();
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    save();
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function notify() { listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); }

  // ============ Derived helpers ============
  function calibrationSamples() {
    return state.predictions.filter(p => p.retro && p.retro.actualPlays != null).length;
  }

  function buffer() {
    // buffer +1 when shot, -1 when published — net "shot but not yet shipped"
    return state.predictions.filter(p => p.shot && !p.published).length;
  }

  function pendingRetros() {
    const now = Date.now();
    const windowMs = state.settings.retroWindowDays * 86400 * 1000;
    return state.predictions.filter(p => {
      if (!p.published || !p.publishedAt) return false;
      if (p.retro && p.retro.actualPlays != null) return false;
      const elapsed = now - new Date(p.publishedAt).getTime();
      return elapsed >= windowMs;
    });
  }

  function activePredictions() {
    return state.predictions.filter(p => !p.retro || p.retro.actualPlays == null);
  }

  function deviationStreak() {
    // count of trailing same-direction deviations (high/low) — drives bump suggestion
    const completed = state.predictions
      .filter(p => p.retro && p.retro.deviation)
      .sort((a, b) => new Date(b.retro.retroAt) - new Date(a.retro.retroAt));
    let streak = 0;
    let dir = null;
    for (const p of completed) {
      const d = p.retro.deviation; // 'high' | 'low' | 'on-target'
      if (d === 'on-target') break;
      if (dir == null) dir = d;
      if (d === dir) streak++;
      else break;
    }
    return { count: streak, direction: dir };
  }

  function modeFromSamples() {
    return calibrationSamples() >= state.settings.minSamplesForBump ? 'calibration' : 'cold-start';
  }

  function logEvent(type, payload) {
    state.usageLog.push({ type, ts: new Date().toISOString(), ...payload });
    if (state.usageLog.length > 500) state.usageLog = state.usageLog.slice(-500);
  }

  // ============ Entity mutations ============
  // Generate a 12-char hex id similar to the spec (sha256-prefix style)
  function genId() {
    const chars = '0123456789abcdef';
    let id = '';
    for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * 16)];
    return id;
  }

  // Hash a string using SHA-256 (Web Crypto). Returns first 12 hex chars.
  // Synchronous fallback when crypto.subtle unavailable.
  async function sha256_12(text) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text || ''));
      const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      return hex.slice(0, 12);
    } catch (e) {
      // Fallback: simple non-crypto hash (fnv-style) — only used if crypto.subtle missing
      let h = 0x811c9dc5;
      for (let i = 0; i < (text || '').length; i++) {
        h ^= text.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
      }
      return h.toString(16).padStart(8, '0') + genId().slice(0, 4);
    }
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  async function addScript(data) {
    const content = data.content || '';
    const id = data.id || await sha256_12(content + Date.now());
    const date = data.date || today();
    const short = (data.shortName || data.title || 'untitled').replace(/\s+/g, '-').slice(0, 30);
    const contentHash = await sha256_12(content);
    // Auto-score from text — stored on the script for quick reuse
    let autoScores = null;
    let autoComposite = null;
    if (window.Scorer && window.Rubric) {
      autoScores = window.Scorer.scoreText(content);
      const r = window.Rubric.getRubric(state.activeRubric);
      autoComposite = window.Rubric.composite(autoScores, r);
    }
    const script = {
      id,
      title: data.title || '未命名稿子',
      shortName: short,
      date,
      path: `scripts/${date}_${id}_${short}.md`,
      content,
      contentHash,
      autoScores,
      autoComposite,
      status: 'draft',
      createdAt: new Date().toISOString()
    };
    state.scripts.unshift(script);
    logEvent('script.add', { id, title: script.title });
    save();
    return script;
  }

  async function updateScriptContent(id, content) {
    const s = state.scripts.find(x => x.id === id);
    if (!s) return null;
    s.content = content;
    s.contentHash = await sha256_12(content);
    save();
    return s;
  }

  function updateScript(id, patch) {
    const s = state.scripts.find(x => x.id === id);
    if (!s) return null;
    Object.assign(s, patch);
    save();
    return s;
  }

  function deleteScript(id) {
    // Cascade: also remove the linked prediction (if any) and its retro.
    // Returns what was actually deleted for the toast.
    const hadPrediction = state.predictions.some(p => p.id === id);
    const hadRetro = state.predictions.some(p => p.id === id && p.retro && p.retro.actualPlays != null);
    state.scripts = state.scripts.filter(s => s.id !== id);
    state.predictions = state.predictions.filter(p => p.id !== id);
    save();
    return { hadPrediction, hadRetro };
  }

  function getScript(id) { return state.scripts.find(s => s.id === id); }

  function addPrediction(data) {
    // Immutable once added — only the retro sub-object can be touched later.
    const id = data.scriptId;
    const exists = state.predictions.find(p => p.id === id);
    if (exists) throw new Error('该稿子已有预测，不可重写。如需重做，请新建 _redo 稿子。');
    const script = state.scripts.find(s => s.id === id);
    const scriptHash = data.scriptHash || (script && script.contentHash) || genId();
    const pred = {
      id,
      scriptId: data.scriptId,
      title: data.title,
      rubricVersion: data.rubricVersion,
      predictedAt: data.predictedAt || today(),
      scriptHash: 'sha256:' + scriptHash,
      targetDuration: data.targetDuration || state.settings.typicalDurationSeconds,
      actualScriptLength: data.actualScriptLength || 0,
      calibrationSamples: calibrationSamples(),
      confidence: data.confidence,
      scores: data.scores,
      autoScores: data.autoScores || null,
      evidence: data.evidence || null,
      scoredBy: data.scoredBy || 'claude',
      userOverride: data.userOverride || null,
      composite: data.composite,
      bucket: data.bucket,
      probDistribution: data.probDistribution,
      reason: data.reason,
      reasoningFactors: data.reasoningFactors || [],
      anchors: data.anchors || [],
      counterfactuals: data.counterfactuals || {},
      assumptions: data.assumptions || '',
      published: false,
      shot: false,
      publishedAt: null,
      shotAt: null,
      publishUrl: null,
      retro: null,
      createdAt: new Date().toISOString(),
      immutable: true
    };
    state.predictions.unshift(pred);
    const s = getScript(id);
    if (s) s.status = 'predicted';
    logEvent('predict.add', { id, composite: pred.composite, bucket: pred.bucket });
    save();
    return pred;
  }

  function getPrediction(id) { return state.predictions.find(p => p.id === id); }

  function markShot(id, note) {
    const p = getPrediction(id);
    if (!p) return null;
    p.shot = true;
    p.shotAt = new Date().toISOString();
    p.shotNote = note || '';
    const s = getScript(id);
    if (s) s.status = 'shot';
    logEvent('shoot', { id });
    save();
    return p;
  }

  function markPublished(id, url) {
    const p = getPrediction(id);
    if (!p) return null;
    p.published = true;
    p.publishedAt = new Date().toISOString();
    p.publishUrl = url || '';
    const s = getScript(id);
    if (s) s.status = 'published';
    logEvent('publish', { id, url });
    save();
    return p;
  }

  function addRetro(id, data) {
    const p = getPrediction(id);
    if (!p) return null;
    const headlineBucket = (p.probDistribution.find(b => b.headline) || {}).range;
    const actualBucket = window.Rubric.bucketForPlays(Number(data.actualPlays) || 0);
    // Estimate centre of headline bucket from probDist (in 万)
    const centerW = (p.probDistribution.find(b => b.headline) || {}).center || 0;
    const playsW = (Number(data.actualPlays) || 0) / 10000;
    let deviation = 'on-target';
    if (centerW > 0) {
      const drift = (playsW - centerW) / centerW;
      if (drift > 0.25) deviation = 'high';
      else if (drift < -0.25) deviation = 'low';
    }
    p.retro = {
      retroAt: data.retroAt || today(),
      capturedAt: new Date().toISOString(),
      source: data.source || 'manual',
      actualPlays: Number(data.actualPlays) || 0,
      actualLikes: Number(data.actualLikes) || 0,
      actualComments: Number(data.actualComments) || 0,
      actualSaves: Number(data.actualSaves) || 0,
      actualShares: Number(data.actualShares) || 0,
      likeRatio: (Number(data.actualPlays) || 0) > 0 ? Number(data.actualLikes) / Number(data.actualPlays) : 0,
      commentRatio: (Number(data.actualPlays) || 0) > 0 ? Number(data.actualComments) / Number(data.actualPlays) : 0,
      shareRatio: (Number(data.actualPlays) || 0) > 0 ? Number(data.actualShares) / Number(data.actualPlays) : 0,
      actualBucket,
      headlineBucket,
      deviation,
      verified: data.verified || [],
      refuted: data.refuted || [],
      newObservations: data.newObservations || [],
      commentKeywords: data.commentKeywords || ''
    };
    const s = getScript(id);
    if (s) s.status = 'retrod';
    // Auto-promote new observations
    for (const obs of (data.newObservations || [])) {
      if (obs && obs.trim()) addObservation({ text: obs, source: 'retro:' + id });
    }
    logEvent('retro', { id, plays: p.retro.actualPlays, deviation });
    save();
    return p;
  }

  function addObservation(data) {
    state.observations.unshift({
      id: genId(),
      text: data.text,
      source: data.source || 'manual',
      addedAt: new Date().toISOString(),
      tag: data.tag || 'observation'
    });
    save();
  }

  function deleteObservation(id) {
    state.observations = state.observations.filter(o => o.id !== id);
    save();
  }

  function addBump(data) {
    state.bumps.unshift({
      id: genId(),
      ...data,
      createdAt: new Date().toISOString()
    });
    save();
  }

  function addCandidate(data) {
    // Auto-score from title + content when scores not provided
    let scores = data.scores;
    let composite = data.composite;
    let predictedBucket = data.predictedBucket;
    if (!scores && window.Scorer) {
      const text = (data.content || '') + ' ' + (data.title || '');
      scores = window.Scorer.scoreText(text);
      const rubric = window.Rubric.getRubric(state.activeRubric);
      composite = window.Rubric.composite(scores, rubric);
      predictedBucket = window.Scorer.bucketFromComposite(composite);
    }
    state.candidates.unshift({
      id: data.id || genId(),
      title: data.title,
      source: data.source || 'pool:manual',
      snapshotAt: data.snapshotAt || today(),
      tier: data.tier || 'tier2',
      readStatus: data.readStatus || 'unread',
      composite: composite || null,
      scores: scores || null,
      predictedBucket: predictedBucket || '',
      note: data.note || '',
      content: data.content || ''
    });
    save();
  }

  function updateCandidate(id, patch) {
    const c = state.candidates.find(x => x.id === id);
    if (!c) return;
    Object.assign(c, patch);
    save();
  }

  function deleteCandidate(id) {
    state.candidates = state.candidates.filter(c => c.id !== id);
    save();
  }

  function addBenchmark(data) {
    state.benchmarks.unshift({
      id: data.id || genId(),
      name: data.name,
      url: data.url || '',
      notes: data.notes || '',
      videos: data.videos || [],
      createdAt: new Date().toISOString()
    });
    save();
  }

  function updateBenchmark(id, patch) {
    const b = state.benchmarks.find(x => x.id === id);
    if (!b) return;
    Object.assign(b, patch);
    save();
  }

  function deleteBenchmark(id) {
    state.benchmarks = state.benchmarks.filter(b => b.id !== id);
    save();
  }

  function exportJson() {
    return JSON.stringify(state, null, 2);
  }

  function importJson(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('Invalid JSON');
    state = data;
    save();
  }

  load();

  window.State = {
    get, set, save, reset, subscribe, load,
    // derived
    calibrationSamples, buffer, pendingRetros, activePredictions,
    deviationStreak, modeFromSamples, today, genId,
    // entities
    addScript, updateScript, updateScriptContent, deleteScript, getScript, sha256_12,
    addPrediction, getPrediction, markShot, markPublished, addRetro,
    addObservation, deleteObservation,
    addBump,
    addCandidate, updateCandidate, deleteCandidate,
    addBenchmark, updateBenchmark, deleteBenchmark,
    exportJson, importJson, logEvent
  };
})();
