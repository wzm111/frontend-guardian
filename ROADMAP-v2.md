# frontend-guardian Roadmap

> 版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：`MAJOR.MINOR.PATCH`
> - **MAJOR**：架构级不兼容变更
> - **MINOR**：功能迭代（每个 Phase 对应一个 MINOR）
> - **PATCH**：Bug 修复与性能补丁

---

## ✅ v2.0.0 — 简单化 · 智能化 · 通用化 · 覆盖全面化 · 极致智能化 · 极致自动化

**发布状态：已交付**

| Phase | 主题 | 核心交付 |
|-------|------|----------|
| Phase 1 | 简单化 | 统一命令体系（7 个核心命令）、合并双引擎、统一输出格式 |
| Phase 2 | 智能化 | Issue 聚类、深度技术栈检测、增量扫描（`--staged` / `--diff`） |
| Phase 3 | 通用化 | 规则注册中心、配置驱动规则、自定义规则热插拔 |
| Phase 4 | 覆盖全面化 | 外部工具集成（ESLint/TS/Stylelint）、规则扩增 51 条、Svelte 支持 |
| Phase 5 | 极致智能化 | 智能缓存（SmartCache）、Watch 模式（`--watch`）、修复预览（`--dry-run`） |
| Phase 6 | 极致自动化 | Git Hook 安装（`--install-hooks`）、CI 配置生成（`--init-ci`）、历史报告（HistoryReport）、格式化器集成（`--format`） |

---

## 🚧 v2.1.0 — 性能与架构优化（Performance & Architecture）

**目标**：解决审计发现的核心架构问题，大幅提升大项目扫描速度，消除代码重复。

**预计发布**：2026-06-15

### P0 — 必须完成 ✅ (2026-06-02)

- [x] **真正并行扫描**：`RuleEngine.scan()` 文件级 `Promise.all` 并行，可配置并发数（默认 `os.cpus().length`）
- [x] **AST 解析结果缓存**：`SmartCache` 扩展内存级 AST 缓存层，同一文件单次扫描内规则间复用 AST
- [x] **消除代码重复**：提取 `getFileExt()` / `getJSXTagName()` 到 `utils/common.ts`，8 个 scanner 文件去重
- [x] **RuleEngine 核心测试**：新增 `tests/rule-engine.test.ts`，14 个测试覆盖 scan / applyFixes / clusterIssues / register / filter
- [x] **清除全局缓存污染**：`i18n-scanner.ts` 模块级 `localeKeyCache` / `allCodeKeysCache` 改为 `Map<string, Set>`

### P1 — 尽量完成 ✅ (2026-06-02)

- [x] **跨文件扫描器文件图缓存**：`cross-file-scanner` 文件图缓存复用，避免重复解析兄弟文件（`RuleContext.sharedCache`）
- [x] **规则预过滤优化**：先根据 `projectMeta` 过滤规则，无匹配规则则跳过 glob，减少文件读取
- [x] **移除无用依赖**：删除 `jscodeshift` 及其类型定义（源码零引用）
- [x] **tsconfig paths 对齐**：源码统一使用 `@/*` 路径映射，`tsc-alias` 编译后重写为相对路径

---

## 🚧 v2.2.0 — 测试覆盖与质量（Testing & Quality）

**目标**：核心模块零测试 → 全面覆盖，建立 CI 质量门禁。

**预计发布**：2026-06-22

### P0 — 必须完成 ✅ (2026-06-02)

- [x] **ast-parser 测试**：覆盖 `parseAST()` / `getImports()` / `hasImport()` / `walkAST()`
- [x] **project-detector 测试**：覆盖所有 `detect*` 函数（框架/组件库/构建工具等）
- [x] **修复功能测试**：覆盖 `applySingleFix()` / `makeDiffPreview()`，含多字节字符场景
- [x] **CLI 入口测试**：`fg-core.js` 参数解析与路由逻辑（使用 `node:test` 子进程测试）

### P1 — 尽量完成 ✅ (2026-06-02)

- [x] **Svelte scanner 测试**：补齐 `svelte-scanner.ts` 的 4 条规则测试
- [x] **外部工具集成测试**：Mock ESLint / TypeScript / Stylelint 输出，验证转换逻辑
- [ ] **Watch 模式测试**：`fs.watch` 触发逻辑验证（推迟至 v2.3.0）
- [ ] **集成测试（E2E）**：从 CLI → 引擎 → 扫描器 → 输出的完整链路（使用临时项目夹具）（推迟至 v2.3.0）
- [x] **覆盖率报告**：Vitest 配置 `coverage` 输出，当前 62.57%（目标 ≥ 80%，持续改进）
- [x] **测试辅助函数提取**：统一 `createContext` / `createMockFile` 到 `tests/helpers.ts`

---

## 🚧 v2.3.0 — CI/CD 与提交增强（Delivery & Integration）

**目标**：让 frontend-guardian 无缝融入现代 CI/CD 工作流。

**预计发布**：2026-06-29

### P0 — 必须完成 ✅ (2026-06-02)

- [x] **SARIF 格式输出** `--sarif`：输出 GitHub Security tab 可消费的 SARIF JSON
- [x] **GitHub Actions Annotation**：CI 输出内联代码注解，PR 中直接看到问题行
- [x] **Baseline 模式** `--baseline`：已有问题不阻塞，仅关注新增问题（遗留项目渐进式治理）

### P1 — 尽量完成 ✅ (2026-06-02)

- [x] **pre-push hook**：提交前全量检查，与现有 pre-commit 互补
- [x] **husky 兼容**：检测 husky 并适配其 hook 管理方式
- [x] **配置文件初始化** `--init-config`：一键生成 `.frontend-guardian.yml` 模板
- [x] **团队共享配置继承**：`.frontend-guardian.yml` 支持 `extends` 字段指向组织级基线配置
- [ ] **PR/MR 评论自动发布**：扫描结果通过 GitHub API / GitLab API 发布为 PR 评论（推迟至 v2.4.0）

---

## 🚧 v2.4.0 — 开发者体验（Developer Experience）

**目标**：让日常开发使用 frontend-guardian 成为一种愉悦体验。

**预计发布**：2026-07-06

### P1 — 高优先级 ✅ (2026-06-02)

- [x] **交互式修复** `--fix --interactive`：类似 `git add -p`，逐条确认修复
- [x] **修复置信度系统**：`SmartFix` 接口落地，低置信度修复要求用户确认
- [x] **规则文档内联链接**：Issue 输出附带 `docsUrl`，终端可点击跳转规则说明
- [x] **大文件智能跳过**：检测 > 500KB 文件自动跳过并 warn，避免卡死
- [ ] **扫描范围智能推断**：大项目支持"仅扫描最近修改的 N 个目录"模式

### P2 — 排期实现

- [ ] **报告托管/上传**：历史报告支持上传至 S3 / 内部服务器，团队共享趋势
- [ ] **自动修复 Bot**：类似 Dependabot，扫描后自动提交修复 PR
- [ ] **commit-msg hook**：检查 commit message 规范
- [ ] **GitLab CI 模板完善**：`--init-ci` 生成含 `rules` / `artifacts` / `merge_requests` 的完整模板
- [ ] **缓存预热**：Watch 模式启动时自动预热缓存，秒开体验

---

## ✅ v2.5.0 / v2.5.1 — 生态集成与自动化（Ecosystem & Automation）

**目标**：让 frontend-guardian 从个人工具进化为团队协作基础设施，无缝融入开发生态。

**发布状态：已交付 v2.5.1（2026-06-02）**

### P0 — 必须完成

- [x] **PR/MR 评论自动发布**：扫描结果通过 GitHub API / GitLab API 发布为 PR/MR 评论，支持评论更新（同一 PR 多次扫描不重复发评论）
- [x] **规则 docsUrl & confidence 全量填充**：9 个 scanner 文件的 53 条规则全部添加 `docsUrl`，15 条含 fix 的规则添加 `confidence` + `description`
- [x] **npm 发布准备**：`package.json` 完善 repository / bugs / homepage / exports / files 字段，新增 `.npmignore`、`LICENSE`、`prepublishOnly` 脚本，包体积 146KB

### P1 — 尽量完成

- [x] **扫描范围智能推断**：`--auto-scope` 自动检测未提交修改 → 最近 5 次提交 → 全量回退，大项目秒级精准扫描
- [x] **报告托管/上传**：`--upload` + `--output` 支持 HTTP webhook 和文件复制上传，自动检测 FG_UPLOAD_PROVIDER 环境变量配置
- [x] **GitLab CI 模板完善**：`--init-ci` 生成含 `rules` / `artifacts` / `cache` / `--post-comment` 的完整 GitLab 模板，支持 `--init-ci-provider gitlab|both`，自动检测平台

### P2 — 排期实现 ✅（已交付于 v2.6.0）

- [x] **自动修复 Bot**：类似 Dependabot，扫描后自动提交修复 PR（需配合 GitHub App / GitLab Bot Token）
- [x] **commit-msg hook**：检查 commit message 规范（Conventional Commits 等）
- [x] **缓存预热**：Watch 模式启动时自动预热缓存，秒开体验

---

## ✅ v2.6.0 — 自动化工作流增强（Automation & Efficiency）

**目标**：让日常开发中的每一次 commit 和 watch 都更快、更规范。

**发布状态：已交付（2026-06-02）**

### P0 — 必须完成 ✅

- [x] **commit-msg hook**：`--install-hooks --install-hooks-type commit-msg` 安装 Conventional Commits 检查 hook，支持 11 种标准 type；`--install-hooks-type all` 同时安装 pre-commit / pre-push / commit-msg
- [x] **缓存预热**：`--watch` 启动时创建并复用 SmartCache 实例，首次扫描即填充 AST 缓存，文件变更后增量扫描秒级响应

### P1 — 尽量完成 ✅

- [x] **自动修复 Bot `--fix --fix-bot`**：扫描后自动创建修复分支、提交修复、创建 PR/MR；支持 GitHub / GitLab，环境变量配置

---

## ✅ v2.7.0 — 可扩展性与智能化（Extensibility & Intelligence）

**目标**：让 frontend-guardian 从单一工具进化为可扩展的平台，支持第三方规则生态和智能化诊断。

**发布状态：已交付（2026-06-02）**

### P0 — 必须完成 ✅

- [x] **配置热重载**：Watch 模式监听 `.frontend-guardian.yml` / `.frontend-guardian.yaml` / `.frontend-guardian.json` 变更自动重载配置，配置修改后清除缓存并重新全量扫描，无需重启进程
- [x] **规则插件系统**：支持 `extends: npm:package-name` 从 npm 包加载规则和配置，规则包遵循 `frontend-guardian-plugin-*` 命名约定。插件包导出 `{ config?: ProjectConfig, rules?: Rule[] }`，规则自动注册到引擎

### P1 — 尽量完成

- [ ] **团队趋势看板**：基于历史报告数据生成静态 HTML 趋势页面（`--generate-dashboard`），含问题趋势图、模块分布饼图、修复率统计
- [ ] **扫描结果持久化**：JSON 格式历史报告存储到 `.frontend-guardian/history/` 目录，支持跨会话查询和趋势分析

### P2 — 排期实现

- [ ] **AI 修复建议**：集成 LLM API（OpenAI / Claude）生成 Issue 修复建议，低置信度修复优先展示 AI 建议
- [ ] **monorepo 工作区支持**：自动检测 `pnpm-workspace.yaml` / `lerna.json` / `nx.json`，分别扫描各子包并汇总报告

---

## ✅ v2.8.0 — 数据洞察与可视化（Data Insights & Visualization）

**目标**：让扫描结果从一次性报告变为可追踪、可分析、可可视化的数据资产，为团队治理决策提供数据支撑。

**发布状态：已交付（2026-06-02）**

### P0 — 必须完成 ✅

- [x] **扫描结果完整持久化 `--save-report`**：每次扫描保存完整的 issues 到 `.frontend-guardian/history/YYYYMMDD-HHmmss.json`，含问题详情、git 信息、扫描统计
- [x] **历史报告查询 CLI `--history`**：查看历史扫描记录列表，支持 `--history-module <name>` 按模块过滤，`--history-limit <n>` 限制条数（默认 20）
- [x] **团队趋势看板 `--generate-dashboard`**：基于历史报告数据生成单文件 HTML 趋势页面，含问题趋势折线图、模块分布饼图、修复率统计、严重级别柱状图、扫描历史表格

### P1 — 尽量完成 ✅

- [x] **Dashboard 自托管优化**：单文件 HTML（内联 CSS/JS），纯 Canvas 绘制图表，零外部 CDN 依赖，可直接在浏览器打开或部署到 GitHub Pages / GitLab Pages

### P2 — 排期实现 ✅（已交付于 v2.9.0）

- [x] **monorepo 工作区支持**：自动检测 `pnpm-workspace.yaml` / `lerna.json` / `nx.json` / `rush.json` / `package.json workspaces`，分别扫描各子包并汇总报告
- [ ] **AI 修复建议**：集成 LLM API（OpenAI / Claude）生成 Issue 修复建议，低置信度修复优先展示 AI 建议
- [ ] **历史报告对比 `--history-compare`**：对比两次扫描结果，输出新增/已修复/持续存在的问题明细

---

## ✅ v2.9.0 — Monorepo 工作区支持（Monorepo Workspace Support）

**目标**：让 frontend-guardian 从单项目工具进化为 monorepo 友好型治理平台，支持现代前端常见的多包工作区架构。

**发布状态：已交付（2026-06-03）**

### P0 — 必须完成 ✅

- [x] **Monorepo 自动检测 `detectMonorepo()`**：支持 `pnpm-workspace.yaml` / `lerna.json` / `nx.json` / `rush.json` / `package.json workspaces` 五种工具自动检测，返回工具类型、配置文件路径、所有子包信息
- [x] **Workspace 多包扫描 `--monorepo`**：CLI 新增 `--monorepo` 参数，自动遍历 workspace 所有子包分别扫描。支持 `--workspace <name>` 仅扫描指定包、`--skip-package <name>` 跳过指定包
- [x] **跨包依赖分析 `analyzeCrossPackageDeps()`**：检测 workspace 包间循环依赖和缺失内部依赖，输出 `CrossPackageIssue[]`（critical / warning 级别）
- [x] **统一汇总报告**：`formatWorkspaceReport()` 生成终端友好的多包扫描报告，`formatWorkspaceJson()` 生成结构化 JSON 输出。各包文件路径自动调整为相对于 monorepo 根目录

### P1 — 尽量完成 ✅

- [x] **子包路径自动调整**：扫描结果中的文件路径自动从子包目录转换为相对于 monorepo 根目录的路径，便于统一查看和定位
- [x] **扫描失败容错**：单个包扫描失败不影响其他包继续扫描，失败信息记录在结果中

### P2 — 排期实现 ✅（已交付于 v3.0.0）

- [x] **AI 修复建议**：集成 LLM API（OpenAI / Claude）生成 Issue 修复建议，低置信度修复优先展示 AI 建议
- [ ] **历史报告对比 `--history-compare`**：对比两次扫描结果，输出新增/已修复/持续存在的问题明细

---

## ✅ v3.1.0 — 历史报告对比（History Report Comparison）

**目标**：让扫描结果可追踪、可对比，帮助团队清晰了解每次提交带来的质量变化。

**发布状态：已交付（2026-06-03）**

### P0 — 必须完成 ✅

- [x] **历史报告对比 `--history-compare`**：`compareHistoryReports()` 对比两次扫描报告，按 `file|ruleId|line` 签名精确匹配 issue，输出新增 / 已修复 / 持续存在的问题明细
- [x] **严重级别变化检测**：同一 issue 的 severity 变化（如 warning → critical）单独归类为 "changed"
- [x] **多种对比模式**：CLI 支持不指定参数（对比最近两次）、指定一个报告（与最近一次对比）、指定两个报告互相对比
- [x] **前缀匹配**：支持 `20250601` 等前缀快速定位报告文件

---

## ✅ v3.0.0 — AI 修复建议（AI Fix Suggestions）

**目标**：让 frontend-guardian 具备智能化诊断能力，为无法自动修复的问题提供 AI 驱动的修复建议。

**发布状态：已交付（2026-06-03）**

### P0 — 必须完成 ✅

- [x] **LLM 驱动的修复建议 `--ai-fix`**：`AIFixSuggester` 为无自动修复的 Issue 调用 OpenAI / Claude API 生成修复建议。扫描后自动展示 AI 推荐的修复方案，含置信度和解释
- [x] **AI 配置自动检测**：`detectAIConfig()` 通过 `FG_AI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` 环境变量自动检测配置。支持 `--ai-model <model>` 指定模型（如 `gpt-4o-mini` / `claude-3-5-sonnet`）
- [x] **建议缓存**：AI 修复建议按 issue 指纹缓存到 `.frontend-guardian/ai-cache/`，避免重复调用 API，节省成本
- [x] **解析与置信度**：AI 响应按 `FIX:` / `EXPLANATION:` / `CONFIDENCE:` 格式解析，置信度分为 high / medium / low，与现有 SmartFix 置信度系统兼容

### P1 — 尽量完成 ✅

- [x] **批量建议**：支持为多个 issue 批量生成 AI 修复建议，默认每次扫描最多处理 5 个无修复方案的问题
- [x] **双提供商支持**：支持 OpenAI API 和 Claude API，自动根据环境变量推断提供商

### P2 — 排期实现 ✅（已交付于 v3.1.0）

- [x] **历史报告对比 `--history-compare`**：对比两次扫描结果，输出新增/已修复/持续存在的问题明细

---

## 📋 版本迭代原则

1. **每次迭代前**：先读取本 Roadmap 当前版本任务清单
2. **每次迭代后**：
   - 更新 `lib/package.json` 版本号（PATCH 递增）
   - 更新 `README.md`「版本演进」章节
   - 在 Roadmap 中勾选已完成的任务
3. **版本号示例**：
   - `v2.1.0`：v2.1 迭代开始
   - `v2.1.1`：v2.1 迭代中的 bug 修复
   - `v2.2.0`：v2.2 迭代开始（新功能发布）
