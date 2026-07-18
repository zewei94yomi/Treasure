# 惊魂寻宝鸭 · Treasure

网页版本地双人搜打撤游戏（纯 Canvas + 原生 JS，零依赖零构建）。项目已封存（v31），
线上：https://zewei94yomi.github.io/Treasure/ 。
开发文档见 docs/（技术架构 / 运行与配置指南 / 故障排查 / 开发复盘）。

## Agent skills

### Issue tracker

Issues 走本仓库的 GitHub Issues（gh CLI）。See `docs/agents/issue-tracker.md`.

### Triage labels

使用五个默认触诊标签（needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix）。
See `docs/agents/triage-labels.md`.

### Domain docs

单上下文布局：根目录 `CONTEXT.md` + `docs/adr/`（按需惰性创建）。See `docs/agents/domain.md`.
