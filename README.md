# Cheat on Content · Web Frontend

A complete browser-only frontend for the [XBuilderLAB/cheat-on-content](https://github.com/XBuilderLAB/cheat-on-content) methodology — turning content creation into a calibrated experiment loop.

> The upstream project is a Claude Code / Codex agent-skill bundle. This repo adds a fully featured web UI that runs **entirely in the browser**: no backend, no API keys, all state stored in `localStorage`.

## Live demo

Once deployed to GitHub Pages: `https://<your-username>.github.io/<repo-name>/`

## Workflow covered (every sub-skill mapped to a view)

```
📊 score → 🎯 blind-predict → 🚀 ship → 📈 T+3d retro → 🧬 evolve rubric
```

| Sub-skill | View | What it does |
|---|---|---|
| `cheat-init` | Settings → init | 3-question onboarding sets mode + rubric |
| `cheat-learn-from` | 对标账号 | Benchmark accounts + video samples |
| `cheat-seed` | 稿子 → 🌱 Seed | Topic seeds from keywords + tone |
| `cheat-score` | 打分 | 7-dim live composite, no file write |
| `cheat-predict` | 预测 | Full 7-step blind prediction, immutable on submit |
| `cheat-shoot` | 拍 & 发 | buffer +1 on shoot |
| `cheat-publish` | 拍 & 发 | buffer -1 + URL log |
| `cheat-retro` | 复盘 | T+3d data + verified/refuted/new-observations |
| `cheat-bump` | 升级 | Full-rescore validation; ≥80% rank match required |
| `cheat-recommend` | 候选池 → 🎯 推荐 | 1 safe + 1 experimental |
| `cheat-trends` | 抓热点 | Single paste-to-pool with dedup |
| `cheat-status` | 看板 | Live dashboard |
| `cheat-migrate` | Settings | JSON import/export |

## Three non-negotiable rules (enforced)

1. **Blind prediction** — once submitted, the prediction object is immutable. Re-doing requires a `_redo` script. Enforced at the state-machine layer.
2. **Bump = full re-score** — rubric upgrade re-runs all calibration samples through the new formula. Less than 80% rank match → submit button disabled.
3. **Rubric is a workbench** — observations have only `add` and `delete` (absorb/refute) operations. No archive.

## Local dev

Open `frontend/index.html` directly in a browser, or run a static server:

```bash
python -m http.server 5174 --directory frontend
# → http://localhost:5174
```

## Deploy to GitHub Pages (3 steps)

1. **Create a new GitHub repo** (any name; public required for free Pages).
2. **Push this directory:**
   ```bash
   git remote add origin git@github.com:<your-username>/<repo-name>.git
   git add -A
   git commit -m "Initial commit"
   git push -u origin main
   ```
3. **Enable Pages:** in the repo's *Settings → Pages*, set **Source = GitHub Actions**. The included workflow ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) will auto-deploy on every push.

Your permanent URL: `https://<your-username>.github.io/<repo-name>/`

## Stack

- Pure HTML/CSS/vanilla JS (no build step, no framework)
- Web Crypto API for SHA-256 article hashing + integrity checks
- `localStorage` persistence + JSON import/export
- ~2.5k LOC, 12 view modules

## License

MIT (matches upstream)
