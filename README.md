# frontend-guardian — 前端代码质量检查工具

> 自动扫描前端项目中的潜在问题：硬编码文案、性能隐患、安全漏洞、可访问性缺陷等。
>
> **当前版本：v3.11.2** · 支持 React / Vue / 小程序 / 鸿蒙等主流技术栈

## 核心能力

frontend-guardian 是一个**前端统一治理工具**，覆盖代码质量、运行时验证、团队协作三个层面：

| 能力 | 说明 | 对应命令 |
| ------ | ------ | ---------- |
| **🔍 代码扫描** | 9 大模块、50+ 条规则，检测 i18n、性能、安全、可访问性、命名规范、Hooks 等问题 | `fg-core . --scan` |
| **🧪 页面健康检查** | 启动真实浏览器遍历路由，发现白屏、控制台报错、资源加载失败、交互元素异常 | `fg-core . --page-health` |
| **📸 像素级视觉回归** | 像素级对比截图基线，生成差异高亮图，支持元素级截图 | `fg-core . --page-health --max-diff-pixels 50` |
| **🎭 动态内容遮罩** | 自动遮罩时间戳/广告等不稳定元素，降低视觉回归误报 | `fg-core . --page-health --mask-selectors ".clock"` |
| **⚡ Lighthouse CWV** | 集成 Lighthouse 采集 LCP/CLS/FCP/TTFB/INP 性能指标 | `fg-core . --page-health --page-health-metrics` |
| **♿ 运行时无障碍检测** | 注入 axe-core 检测渲染后 DOM 的可访问性问题 | `fg-core . --page-health --a11y` |
| **🌐 跨浏览器基线** | 支持 Chromium / Firefox / WebKit 三套独立基线，检测浏览器渲染差异 | `fg-core . --page-health --browser all` |
| **📱 移动端视口模拟** | 使用 Playwright 设备预设或自定义视口，发现响应式布局问题 | `fg-core . --page-health --device "iPhone 14 Pro"` |
| **🛰️ 小程序自动化测试** | 自动检测微信/支付宝/抖音小程序，检查页面存在性、包体积、编译错误，支持多平台并行与首页截图基线 | `fg-core . --mini-program all` |
| **🛠️ 自动修复** | 8 类问题支持一键自动修复，含修复预览（dry-run）和交互式确认 | `fg-core . --scan --fix` |
| **📊 治理看板** | 扫描结果上报到 Web 看板，团队维度追踪代码质量趋势 | `fg-core . --scan --server <url>` |
| **🧠 AI 修复建议** | 为无自动修复方案的问题调用 LLM 生成修复建议 | `fg-core . --scan --ai-fix` |
| **📝 E2E 测试治理** | 扫描 Playwright/Cypress 测试代码反模式，检测测试覆盖缺口 | `fg-core . --module e2e` |
| **⚡ 增量扫描** | 基于 git diff / import 图分析，只扫描变更文件及影响范围 | `fg-core . --scan --staged` |
| **🤖 MCP Server** | 以 MCP 协议暴露治理能力，供 Claude / Cursor / Copilot 等 AI Agent 调用 | `fg-core . --mcp` |
| **🎯 智能测试推荐** | 基于代码变更影响分析，自动推荐需要运行的测试文件，减少 CI 全量测试耗时 | `fg-core . --recommend-tests` |

---

## 两种使用形态

frontend-guardian 同时提供 **npm 包** 和 **AI Skill** 两种形态，功能完全一致：

### 形态一：npm 包（CLI）

适合 CI/CD 流水线、本地开发终端、自动化脚本。

```bash
# 全局安装
npm install -g frontend-guardian-core

# 扫描当前项目
fg-core . --scan

# 只检查国际化问题
fg-core . --module i18n

# 检查页面是否正常渲染（需要 Playwright）
fg-core . --page-health --serve "npm run dev"

# 跨浏览器基线对比（Chromium / Firefox / WebKit）
fg-core . --page-health --serve "npm run dev" --browser all --update-baseline

# 移动端视口模拟（使用 Playwright 设备预设）
fg-core . --page-health --serve "npm run dev" --device "iPhone 14 Pro"

# 自定义视口尺寸
fg-core . --page-health --serve "npm run dev" --viewport 390x844
```

**CLI 工具清单**：

| 命令 | 用途 |
|------|------|
| `fg-core` | 核心扫描引擎 |
| `fg-lsp` | LSP 语言服务器（IDE 实时诊断） |
| `fg-server` | 治理看板服务端 |

### 形态二：AI Skill

适合在 AI 对话中直接调用，无需安装 npm 包。

**安装方式**：将本仓库复制到对应智能体的 Skill 目录：

| 智能体 | Skill 目录 | 安装命令 |
|--------|-----------|---------|
| Claude Code | `.claude/skills/` | `cp -r frontend-guardian .claude/skills/` |
| Codex (OpenAI) | `.codex/skills/` | `cp -r frontend-guardian .codex/skills/` |
| Kimi Code | `.kimi/skills/` | `cp -r frontend-guardian .kimi/skills/` |
| 通用 / 其他 | `.ai/skills/` | `cp -r frontend-guardian .ai/skills/` |

**使用方式**：在 AI 对话中输入 `/frontend-guardian [选项]`

```text
/frontend-guardian --scan
/frontend-guardian --module i18n
/frontend-guardian --page-health --serve "npm run dev"
```

> 💡 **Skill 自动触发**：当 AI 检测到项目中的 `i18n/`、`pages.json`、`app.json`、`package.json` 中的相关依赖时，会自动建议调用 frontend-guardian。

---

## 30 秒上手

```bash
# 1. 安装
npm install -g frontend-guardian-core

# 2. 初始化配置（自动检测技术栈）
fg-core . --init-config

# 3. 全量扫描
fg-core . --scan

# 4. 安装 git hook（提交前自动检查）
fg-core . --install-hooks
```

---

### 场景一：新建项目（从 0 开始）

#### Step 1 — 安装 CLI

```bash
# 方式 A：全局安装（推荐）
npm install -g frontend-guardian-core

# 方式 B：项目内安装
npm install -D frontend-guardian-core
```

#### Step 2 — 初始化配置

```bash
# CLI 方式
fg-core . --init-config

# AI Skill 方式（智能体会自动执行）
/frontend-guardian --init-config
```

这会生成 `.frontend-guardian.yml`，自动检测你的技术栈（React/Vue/小程序等）并填入适合的默认配置。

#### Step 3 — 安装 Git hook（推荐）

```bash
# CLI 方式
fg-core . --install-hooks          # pre-commit 增量检查
fg-core . --install-hooks --install-hooks-type both   # pre-commit + pre-push

# AI Skill 方式
/frontend-guardian --install-hooks
/frontend-guardian --install-hooks --install-hooks-type both
```

这样每次提交前会自动扫描 staged 文件，有问题会阻止提交。

#### Step 4 — 首次全量扫描

```bash
# CLI 方式
fg-core . --scan

# AI Skill 方式
/frontend-guardian --scan
```

---

### 场景二：已有项目

#### Step 1 — 直接安装并扫描

```bash
cd existing-project
npm install -g frontend-guardian-core

# CLI 方式
fg-core . --scan

# AI Skill 方式（无需安装，智能体直接执行）
/frontend-guardian --scan
```

#### Step 2 — 根据项目现状选择策略

- **问题很多，想先摸底**
  - CLI: `fg-core . --scan --json`
  - AI: `/frontend-guardian --scan --json`
- **只想看最严重的问题**
  - CLI: `fg-core . --scan --severity critical`
  - AI: `/frontend-guardian --scan --severity critical`
- **逐步治理（不阻塞现有问题）**
  - CLI: `fg-core . --scan --baseline baseline.json`
  - AI: `/frontend-guardian --scan --baseline baseline.json`
- **想自动修复简单问题**
  - CLI: `fg-core . --scan --fix --dry-run`
  - AI: `/frontend-guardian --scan --fix --dry-run`
- **只想检查本次改动**
  - CLI: `fg-core . --scan --staged`
  - AI: `/frontend-guardian --scan --staged`

#### Step 3 — 集成到 CI（可选）

```bash
# CLI 方式（AI Skill 不适用于 CI 场景）
fg-core . --scan --gate    # 有问题时退出码非 0，可阻断 CI
```

配合 `--sarif report.sarif` 可将结果上传到 GitHub Security tab。

#### Step 4 — 初始化 CI 配置（可选）

```bash
# 自动检测平台（根据 .github/、.gitlab-ci.yml 或 git remote URL）
fg-core . --init-ci

# 显式指定 GitLab CI
fg-core . --init-ci --init-ci-provider gitlab

# 同时生成 GitHub Actions + GitLab CI
fg-core . --init-ci --init-ci-provider both
```

生成的 GitLab CI 模板包含：
- `stages` 阶段定义
- `rules`（MR 事件 + 默认分支推送）
- `cache`（基于 lock 文件的缓存键）
- `artifacts`（扫描报告产物）
- `--post-comment` 自动发布 MR 评论

- **配置**
  - 新建项目：`--init-config` 生成默认配置
  - 已有项目：手动调整配置，或用 `--baseline` 渐进式治理
- **策略**
  - 新建项目：从第一天起规范化，问题少
  - 已有项目：先摸底，再分批修复，避免一次性改动过大
- **Hook**
  - 新建项目：强烈建议安装，养成习惯
  - 已有项目：根据团队接受度决定，可先 `--gate` 在 CI 中试运行

---

### 核心命令

> 以下所有命令，`fg-core` 和 `/frontend-guardian` 均可使用，将 `fg-core .` 替换为 `/frontend-guardian` 即可。

```text
# 1️⃣ 全量扫描（推荐）
fg-core . --scan

# 2️⃣ 提交前检查（仅 staged 文件）
fg-core . --scan --staged

# 3️⃣ 扫描并自动修复
fg-core . --scan --fix

# 4️⃣ CI 门禁模式（发现问题退出码非 0）
fg-core . --scan --gate

# 5️⃣ PR diff 范围检查
fg-core . --scan --diff main...feature

# 6️⃣ 智能扫描范围（未提交修改 → 最近 5 次提交）
fg-core . --scan --auto-scope

# 8️⃣ 智能测试推荐（基于变更影响分析）
fg-core . --recommend-tests
fg-core . --recommend-tests --staged
fg-core . --recommend-tests --diff main...feature
fg-core . --recommend-tests --json

# 9️⃣ 初始化项目配置
fg-core . --init-config

# 🔟 安装 Git hook（pre-commit / pre-push）
fg-core . --install-hooks
fg-core . --install-hooks --install-hooks-type pre-push
fg-core . --install-hooks --install-hooks-type both

# 1️⃣1️⃣ 初始化 CI 配置（自动检测平台）
fg-core . --init-ci
fg-core . --init-ci --init-ci-provider gitlab
fg-core . --init-ci --init-ci-provider both
```

### 单模块扫描

```text
fg-core . --module i18n            # i18n 治理（硬编码、缺失 key、死 key）
fg-core . --module component       # 组件医生（反模式、token、性能）
fg-core . --module hooks           # Hooks / Composables 检查
fg-core . --module platform        # 多端平台适配
fg-core . --module performance     # 性能优化
fg-core . --module security        # 安全扫描
fg-core . --module a11y            # 可访问性
fg-core . --module naming          # 命名规范
fg-core . --module cross-file      # 跨文件分析
fg-core . --module svelte          # Svelte 专项检查
```

> 💡 AI Skill 用法：`/frontend-guardian --module i18n`（其余模块同理）

### 常用组合

> 将 `fg-core .` 替换为 `/frontend-guardian` 即可在 AI 对话中使用。

```text
# 修复预览（展示 diff 不写入）
fg-core . --scan --fix --dry-run

# JSON 输出 + 门禁
fg-core . --scan --gate --json

# 指定严重级别 + 禁用聚类
fg-core . --scan --severity warning --no-cluster

# 仅扫描指定文件
fg-core . --scan --files "src/**/*.tsx"

# 运行外部工具（ESLint / TypeScript / Stylelint）
fg-core . --scan --external

# Watch 模式（开发时自动扫描）
fg-core . --scan --watch

# 智能测试推荐（PR 阶段只跑相关测试）
fg-core . --recommend-tests --staged --json

# SARIF 报告输出（GitHub Security tab 兼容）
fg-core . --scan --sarif report.sarif

# Baseline 模式（仅报告新增问题）
fg-core . --scan --baseline baseline.json
fg-core . --scan --baseline baseline.json --generate-baseline

# PR/MR 评论自动发布（v2.5.0）
fg-core . --scan --post-comment
```

### 参数说明

| 参数 | 说明 | 默认值 |
| ---- | ---- | ------ |
| `--module <name>` | 扫描模块：`i18n` / `performance` / `a11y` / `security` / `naming` / `cross-file` / `component` / `hooks` / `platform` / `svelte` / `all` | `all` |
| `--severity <level>` | 最低输出严重级别：`critical` / `warning` / `suggestion` | `suggestion` |
| `--staged` | 仅检查 git staged 文件 | false |
| `--diff <range>` | git diff 范围，如 `main...feature` | - |
| `--auto-scope` | 智能扫描范围：自动检测未提交/最近修改的文件 | - |
| `--fix` | 自动修复可修复的问题 | false |
| `--dry-run` | 修复预览模式（展示 diff 不写入文件） | false |
| `--json` | 以 JSON 格式输出原始扫描结果 | false |
| `--gate` | 门禁模式，发现问题时退出码非 0 | false |
| `--no-cluster` | 禁用 Issue 聚类 | false |
| `--external` | 同时运行 ESLint / TypeScript / Stylelint | false |
| `--watch` | Watch 模式：文件变更自动增量扫描 | false |
| `--no-cache` | 禁用智能缓存 | false |
| `--config <file>` | 指定配置文件 | `.frontend-guardian.yml` |
| `--init-config` | 生成 `.frontend-guardian.yml` 智能配置 | - |
| `--install-hooks` | 安装 Git pre-commit hook | - |
| `--install-hooks-type` | hook 类型：`pre-commit` / `pre-push` / `both` | `pre-commit` |
| `--init-ci` | 生成 CI 配置文件（自动检测 GitHub / GitLab） | - |
| `--init-ci-provider <p>` | CI 平台：`github` / `gitlab` / `both` | `auto` |
| `--sarif <file>` | 输出 SARIF 格式报告 | - |
| `--github-actions` | 启用 GitHub Actions Annotation 输出 | 自动检测 |
| `--baseline <file>` | Baseline 模式：仅报告新增问题 | - |
| `--generate-baseline` | 生成 baseline 文件 | - |
| `--output <file>` | 将扫描报告写入指定 Markdown 文件 | - |
| `--server <url>` | 扫描后上报到治理看板服务器 | - |
| `--serve` | 扫描前启动本地看板服务（扫描完成后停止） | - |
| `--upload` | 上传报告（需配置 FG_UPLOAD_PROVIDER 环境变量） | - |
| `--interactive` | 交互式修复（逐条确认，类似 `git add -p`） | false |
| `--skip-large-files-threshold <bytes>` | 大文件跳过阈值（默认 512000 = 500KB，0 表示不跳过） | 512000 |
| `--mcp` | 启动 MCP Server（stdio，供 AI Agent 调用） | - |
| `--browser <name>` | 页面健康检查浏览器：`chromium` / `firefox` / `webkit` / `all` | `chromium` |
| `--device <name>` | 页面健康检查模拟设备（如 `iPhone 14 Pro`） | - |
| `--viewport <WxH>` | 页面健康检查自定义视口（如 `390x844`） | - |
| `--viewport-mobile` | 页面健康检查使用移动端预设视口 | false |
| `--mini-program [p]` | 小程序自动化测试：`wechat` / `alipay` / `douyin` / `auto` / `all` / `wechat,alipay,...` | - |
| `--miniprogram-screenshot` | 小程序测试时截取首页截图 | false |
| `--miniprogram-update-baseline` | 更新小程序截图基线 | false |

## 使用场景

Skill 在以下场景自动激活：

- 用户通过 AI 智能体 Skill 调用 frontend-guardian（Claude Code / Codex / Kimi Code / Qode / Gemini / Hermes 等）
- 检测到 `i18n/`、`locales/`、`lang/`、`messages/` 目录
- 检测到 `vue-i18n`、`react-intl`、`i18next`、`@dcloudio/uni-i18n` 依赖
- 检测到 `antd`、`element-plus`、`@mui/material`、`@nutui/nutui-react` 等组件库
- 检测到 React / Vue 项目中的 hooks / composables 文件
- 检测到小程序项目：`app.json`、`project.config.json`、`manifest.json`
- 检测到鸿蒙项目：`entry/src/main/ets/`、`hvigorfile.ts`
- 检测到多端框架：`uni-app`、`taro`、`remax`、`flutter`、`react-native`
- 用户询问 i18n、组件规范、hooks 最佳实践、多端适配相关问题

---

## 技术栈自动检测

Skill 会自动检测项目类型并加载对应规则：

| 检测特征 | 识别的平台/框架 | 加载规则 |
| -------- | -------------- | -------- |
| `pages.json` + `uni` | UniApp | `rules/uniapp.md` |
| `app.config.ts` + `taro` | Taro | `rules/taro.md` |
| `app.json` (无 uni/taro) | 微信小程序原生 | `rules/wechat-mp.md` |
| `mini.project.json` | 支付宝小程序 | `rules/alipay-mp.md` |
| `project.config.json` + `tt` | 抖音小程序 | `rules/douyin-mp.md` |
| `flutter` | Flutter | `rules/flutter.md` |
| `react-native` | React Native | `rules/react-native.md` |
| `ArkTS` / `entry/src/main/ets` | 鸿蒙 HarmonyOS | `rules/harmony.md` |
| `vue` + 无多端标记 | Vue PC/H5 | `rules/vue.md` |
| `react` + 无多端标记 | React PC/H5 | `rules/react.md` |
| `next.config` | Next.js | `rules/nextjs.md` |
| `nuxt.config` | Nuxt | `rules/nuxt.md` |

---

## AST 核心引擎（Node.js）

frontend-guardian 提供基于 AST 的 Node.js 核心分析引擎，支持精确到语法树节点的规则检测：

```bash
cd lib && npm install && npm run build
npx fg-core ./my-project --module i18n --severity warning
```

### 支持的扫描模块（9 大模块，48 条规则）

| 模块 | CLI | 规则数 | 说明 |
| ------ | ----- | ------ | ------ |
| i18n | `--module i18n` | 3 | 硬编码中文、缺失 key、未使用 key |
| performance | `--module performance` | 4 | 请求瀑布、整库导入、昂贵计算缓存、大组件懒加载 |
| accessibility | `--module a11y` | 5 | 图片 alt、表单 label、按钮 role、颜色对比度、ARIA 校验 |
| security | `--module security` | 5 | XSS、eval、密钥泄露、URL 校验、CORS |
| naming | `--module naming` | 8 | 类、接口、函数、变量、枚举、私有成员、文件/文件夹命名 |
| cross-file | `--module cross-file` | 5 | 未使用 props、缺失 props、Context 过度使用、重复代码、公共逻辑提取 |
| component | `--module component` | 3 | 反模式（Form/Table/Modal）、硬编码 token、性能陷阱 |
| hooks | `--module hooks` | 6 | useEffect 依赖、定时器清理、Hook 命名、Vue reactive、computed 副作用、状态提升 |
| platform | `--module platform` | 6 | 小程序体积/base64/HTTP、安全区域、鸿蒙规范、响应式断点 |
| **all** | **`--module all`** | **48** | **一次扫描全部 9 个模块** |

### 自动修复（--fix）

Node.js 引擎支持自动修复可修复的问题：

```bash
# 扫描并自动修复
npx fg-core ./my-project --module naming --fix
npx fg-core ./my-project --module component --fix
```

**当前支持自动修复的规则：**

| 规则 | 修复内容 |
| ---- | -------- |
| `i18n-hardcoded-string` | `"中文"` → `t('key')` |
| `i18n-hardcoded-jsx-text` | `中文` → `{t('key')}` |
| `perf-avoid-barrel-import` | 将整库导入拆分为子模块导入 |
| `perf-dynamic-import` | 插入 React.lazy / defineAsyncComponent 代码 |
| `composables-reactive` | 将解构的 reactive 改为 `toRefs(reactive(...))` |
| `component-token` (颜色) | `#1890ff` → `var(--primary-color)` |
| `component-token` (间距) | `margin: 16px` → `theme.spacing.md` |
| `naming-*` (系列) | 不规范命名 → 自动修正为规范命名 |

修复逻辑：
1. 按文件收集所有带 `fix` 字段的问题
2. 按行号倒序排列（从文件末尾开始修复，避免行号偏移）
3. 应用文本替换并写回文件

### 与 Bash 引擎的关系（v2.0 统一架构）

- **AST 引擎（主要）**：`fg-core --module all` 一次调用扫描全部 9 个模块，48 条规则，精确到语法树节点
- **Bash 引擎（补充）**：覆盖 AST 引擎尚未迁移的规则（如小程序 `#ifdef` 检查、平台专有 API 检测）
- **外部工具（Knip）**：检测未使用依赖/导出/文件

`full-scan.sh` 统一调用 AST 引擎获取主要结果，再调用 Bash 引擎补充，最后合并生成统一报告。

---

## 🧠 智能化特性（Phase 2）

### 深度技术栈检测

自动解析 `package.json` 依赖树，精确识别项目技术栈：

```text
📱 正在检测技术栈...
   检测到: React
   构建: vite@5.0 | 测试: vitest | 状态: zustand
   样式: tailwindcss | 路由: react-router | Lint: eslint
   包管: pnpm
```

检测维度：

| 维度 | 检测内容 | 示例 |
| ---- | -------- | ---- |
| 构建工具 | webpack / vite / rsbuild / turbopack / farm / rspack | `vite@5.2.0` |
| 测试框架 | jest / vitest / cypress / playwright / mocha | `vitest` |
| 状态管理 | redux / mobx / zustand / recoil / jotai / pinia / vuex | `zustand@4.5` |
| 样式方案 | tailwindcss / styled-components / emotion / sass / less | `tailwindcss@3.4` |
| 路由 | react-router / vue-router / tanstack-router / wouter | `react-router@6.23` |
| 包管理器 | npm / yarn / pnpm / bun（通过 lockfile 推断） | `pnpm` |
| Linter | eslint / biome / oxlint / prettier / stylelint | `eslint` |
| Monorepo | nx / turborepo / lerna / pnpm-workspace | `turborepo` |

### Issue 聚类

同一文件、同一规则的多个相似 Issue 自动聚类为聚合 Issue，减少重复输出：

```text
🔴 [CRITICAL] useEffect 缺失依赖 (×5)
   📄 src/pages/OrderList.tsx:23:10
   useEffect 的依赖数组缺少响应式变量

   聚类详情：在 5 处发现同类问题（行: 23, 45, 67, 89, 112）
```

聚类规则：
- 按 `(file, ruleId)` 分组
- 保留第一个 Issue 的位置和详细信息
- 在 `meta.clusterCount` 中记录聚类数量
- 可通过 `--no-cluster` 禁用

### 增量扫描

仅扫描变更文件，大幅提升大型项目扫描速度：

```bash
# 仅扫描 git staged 文件
npx fg-core ./my-project --module all --staged

# 扫描 PR diff 范围
npx fg-core ./my-project --module all --diff main...feature

# Bash 入口同样支持
bash scripts/full-scan.sh --staged
bash scripts/full-scan.sh --since HEAD~3
```

---

## 模块详解

### 🌍 i18n-governance（国际化治理）

#### 1. 硬编码文案扫描

扫描源码中的硬编码字符串，判断是否需要提取到语言包：

- ✅ **需要提取**：UI 文案、提示信息、按钮文字、表单标签
- ❌ **跳过**：日志输出、调试信息、代码注释、CSS 类名、URL 路径、变量名

输出格式：
```text
[file.tsx:42] 硬编码文案: "确认删除"
  建议 key: order.detail.deleteConfirm
  建议替换为: t('order.detail.deleteConfirm')

[file.vue:23] 硬编码文案: "Please enter your email"
  建议 key: common.form.emailPlaceholder
  建议替换为: $t('common.form.emailPlaceholder')
```

#### 2. 自动提取（--i18n-extract）

自动将硬编码文案提取到语言包：

- 按文件路径自动推断 key 命名空间（`pages/order/detail.tsx` → `order.detail.xxx`）
- 生成 key 时处理重复（自动追加序号或合并）
- 替换源码中的硬编码为 `t()` / `$t()` / `intl.formatMessage()` 调用
- 支持插值变量自动识别：`"你好，{name}"` → `t('greeting.hello', { name })`

#### 3. 缺失 key 检测

对比多语言文件，找出缺失的 key：

```text
❌ en-US.json 缺失以下 key（存在于 zh-CN.json）:
  - order.detail.deleteConfirm
  - user.profile.updateSuccess

❌ zh-CN.json 缺失以下 key（存在于 en-US.json）:
  - common.error.networkTimeout
```

#### 4. 死 key 清理

扫描源码引用，找出语言包中未被使用的 key：

```text
⚠️ 以下 key 在源码中无引用，建议清理:
  - deprecated.oldFeature.title（最后引用: commit abc123, 2024-01-15）
  - temp.debug.message

🗑️ 已自动备份到 locales/dead-keys-20240601.json
```

#### 5. 命名规范检查

检查 key 命名是否符合 `module.page.element` 规范：

| 规范项 | 正确示例 | 错误示例 |
| ------ | -------- | -------- |
| 分层结构 | `order.list.searchPlaceholder` | `orderListSearchPlaceholder` |
| 命名空间 | `common.error.network` | `network_error` |
| 语义化 | `user.profile.saveButton` | `btn1`、`str123` |
| 复数处理 | `item.count` + 复数规则 | `item_one`、`item_many` |

#### 6. 自动翻译填充

调用翻译 API（支持配置 OpenAI / DeepL / 阿里云翻译等）自动填充缺失语言：

```text
🌐 正在为 23 个缺失 key 生成 en-US 翻译...
✅ 完成，已写入 locales/en-US.json
⚠️ 以下翻译建议人工复核（涉及业务术语）:
  - order.status.pending: "Pending" → 建议改为 "To be processed"
```

---

### 🏥 component-doctor（组件医生）

#### 1. 组件反模式检测

按组件库类型加载专项规则：

**Ant Design 5.x / 4.x**
| 反模式 | 检测逻辑 | 建议 |
| ------ | -------- | ---- |
| Form 无 name | `<Form.Item>` 缺少 `name` 或 name 路径错误 | 补全 name 路径 |
| Table 无 rowKey | `<Table>` 缺少 `rowKey` 或 rowKey 类型错误 | 添加唯一标识 rowKey |
| Modal 内无销毁 | Modal 关闭后组件未销毁，内存泄漏 | 设置 `destroyOnClose` |
| Select 大数据 | Select options > 100 且无虚拟滚动 | 使用 `virtual` 或分页 |
| DatePicker 无 format | DatePicker 未指定 format，导致显示不一致 | 统一 format 格式 |

**Element Plus**
| 反模式 | 检测逻辑 | 建议 |
| ------ | -------- | ---- |
| ElTable 无 row-key | 同 Ant Design Table | 添加 row-key |
| ElForm 规则未绑定 | rules 定义但未绑定到 form-item | 检查 prop 匹配 |
| ElDialog 嵌套滚动 | Dialog 内内容过长无滚动处理 | 添加 ElScrollbar |

**小程序组件（UniApp / Taro / 原生）**
| 反模式 | 检测逻辑 | 建议 |
| ------ | -------- | ---- |
| scroll-view 无滚动优化 | 长列表未使用虚拟列表 | 使用 `virtual-list` |
| image 无懒加载 | 图片未设置 `lazy-load` | 添加 lazy-load |
| view 嵌套层级 > 10 | 嵌套层级过深影响渲染性能 | 扁平化结构 |

#### 2. 主题/token 一致性检查

检测硬编码样式值 vs 设计 token：

```text
❌ [Button.tsx:15] 硬编码颜色: color: '#1890ff'
   建议改为: color: var(--primary-color) 或 theme.colors.primary

❌ [Card.vue:8] 硬编码间距: margin: '16px'
   建议改为: margin: theme.spacing.md

⚠️ [App.tsx] 混合使用 CSS 变量和 JS theme，建议统一
```

支持的设计系统：
- Ant Design Design Token (`@ant-design/cssinjs`)
- Element Plus CSS Vars
- Tailwind CSS（检查 arbitrary values）
- 自定义 CSS Variables
- 小程序全局样式变量

#### 3. 可访问性检查

```text
❌ [Image.tsx] img 标签缺少 alt 属性
❌ [Button.tsx] 按钮只有 icon 无 aria-label
❌ [Input.tsx] 表单输入无关联 label
❌ [Modal.tsx] 弹窗打开后焦点未捕获
⚠️ [Text.tsx] 文字对比度可能不足（#999 on #fff = 2.8:1）
```

#### 4. 性能陷阱检测

```text
❌ [List.tsx] 渲染列表 > 1000 项未虚拟化
❌ [Chart.tsx] ECharts 实例未在 unmount 时 dispose
⚠️ [Form.tsx] 表单字段过多（>50），建议分步或分页
⚠️ [Page.tsx] 图片无尺寸，可能导致 CLS 累积布局偏移
```

#### 5. 版本升级影响分析

```text
📦 当前 antd 版本: 4.24.15，最新: 5.17.0

🔴 Breaking Changes 影响:
   - DatePicker format 变更（影响 3 个文件）
   - Icon 引入方式变更（影响 12 个文件）
   - Form 校验时机变更（影响 5 个文件）

📝 建议迁移步骤:
   1. 运行 codemod: npx @ant-design/codemod-v5
   2. 手动修复以上标记的文件
   3. 验证 DatePicker 格式输出
```

---

### ⚡ hook-checker / composables-checker

#### React Hooks 检查

| 检查项 | 检测逻辑 | 严重级别 |
| ------ | -------- | -------- |
| useEffect 缺失依赖 | deps 数组缺少响应式变量 | 🔴 Critical |
| useEffect 过多依赖 | deps > 5 个，建议拆分 | 🟡 Warning |
| useEffect 空依赖但使用 state | 闭包陷阱，state 永远是初始值 | 🔴 Critical |
| setInterval / setTimeout 未清理 | unmount 时未 clear | 🔴 Critical |
| 自定义 Hook 命名 | 不以 `use` 开头 | 🟡 Warning |
| 自定义 Hook 返回规范 | 返回数组时元素 > 3 个，建议改为对象 | 🟡 Warning |
| useCallback 滥用 | 简单函数包裹 useCallback，开销 > 收益 | 🟡 Warning |
| useMemo 依赖不变 | 计算不复杂但包裹 useMemo | 💡 Suggestion |
| useState 初始化函数 | 复杂初始化未使用 lazy init | 💡 Suggestion |
| Context 粒度 | 频繁更新的值放在大 Context 中 | 🟡 Warning |

#### Vue Composables 检查

| 检查项 | 检测逻辑 | 严重级别 |
| ------ | -------- | -------- |
| reactive 解构丢失响应式 | `const { count } = reactive(...)` | 🔴 Critical |
| toRefs 未使用 | 解构 reactive 对象时未 toRefs | 🟡 Warning |
| computed 副作用 | computed 中修改其他响应式数据 | 🔴 Critical |
| watch 立即执行 | watch 配置 `immediate: true` 但依赖未就绪 | 🟡 Warning |
| onMounted 异步操作 | onMounted 中 async 操作未处理错误 | 🟡 Warning |
| provide/inject 类型 | inject 无默认值或类型断言 | 🟡 Warning |

#### 状态提升建议

分析组件内的 useState / ref，判断是否应提升：

```text
📊 [UserCard.tsx] 检测到状态分布:
   - userInfo: 3 个子组件共享 → 建议提升到父组件或全局状态
   - isExpanded: 仅本组件使用 → 保持本地状态
   - filterQuery: 2 个子组件共享 + URL 同步 → 建议提升到 URL 状态
```

---

### 📱 platform-guard（多端适配检查）

#### 小程序专项（--platform-mp）

| 平台 | 检查项 | 规则 |
| ---- | ------ | ---- |
| **微信小程序** | 包体积 | 主包 < 2MB，分包 < 2MB，总包 < 20MB |
| | 图片规范 | 使用 CDN 图片，禁止 base64 > 10KB |
| | setData 优化 | 检测频繁/大数据量 setData |
| | 生命周期 | 正确使用 onLoad / onShow / onHide |
| | 跳转限制 | 页面栈 < 10 层，防止溢出 |
| | 递归组件 | 检测无终止条件的递归组件 |
| **支付宝小程序** | 组件差异 | 检测微信专有 API / 组件 |
| **抖音小程序** | 视频组件 | 视频预加载、自动播放规范 |
| **UniApp** | 条件编译 | 检测平台差异代码是否正确使用 `#ifdef` |
| | 跨端兼容 | 检测 UniApp 不支持的 API 在特定平台的使用 |
| | nvue 性能 | 检测 nvue 中使用了不支持的 CSS 属性 |
| | 原生插件 | 检查 `uni.requireNativePlugin` 的插件是否已配置 |
| | App 鸿蒙 | 检查 `uni-app-x` 鸿蒙编译不支持的 API / 组件 |
| **Taro** | 编译配置 | 检查 `webpack5` / `vite` 配置与项目依赖一致 |
| | 跨端组件 | 禁止直接使用平台原生组件（`wx:xx` / `a:xx`） |
| | 生命周期 Hooks | 检测在 H5 中使用小程序生命周期 hooks |
| | 样式单位 | 推荐用 `Taro.pxTransform` 替代手动计算 |
| | 第三方 UI 库 | 检查 `taro-ui` / `nutui-react` 与 Taro 版本兼容 |

#### 移动端性能（--platform-mobile）

| 检查项 | H5 | App (RN/Flutter) |
| ------ | ---- | ---------------- |
| 点击延迟 | 检查 FastClick / touch-action | - |
| 滚动性能 | 检查 `-webkit-overflow-scrolling` | 检查 ScrollView 配置 |
| 键盘弹出 | 检查输入框在可视区域内 | 检查键盘事件处理 |
| 安全区域 | 检查 `env(safe-area-inset-*)` | 检查 SafeAreaView |
| 横竖屏 | 检查 orientation lock | 检查 orientation 配置 |
| 字体加载 | 检查 FOUT/FOIT 处理 | 检查字体包大小 |
| 触摸目标 | 检查点击区域 >= 44x44px | 检查点击区域 >= 44x44pt |

#### 鸿蒙 HarmonyOS（--platform-harmony）

| 检查项 | 规则 |
| ------ | ---- |
| ArkTS 严格模式 | 检查类型注解完整性 |
| ArkUI 组件规范 | 检查 `@Component` / `@Entry` 正确使用 |
| 状态管理 | 检查 `@State` / `@Prop` / `@Link` / `@Provide` 正确使用 |
| 生命周期 | 检查 `aboutToAppear` / `aboutToDisappear` |
| 资源引用 | 检查 `resource` / `rawfile` 正确引用 |
| 多线程 | 检查 `TaskPool` / `Worker` 使用规范 |

#### 响应式断点（--platform-responsive）

```text
📐 [Layout.tsx] 响应式检查:
   ✅ 已定义断点: 576px / 768px / 992px / 1200px
   ❌ [Table.tsx] 未处理小屏横向滚动
   ❌ [Chart.tsx] 图表在 <768px 下未调整高度
   ⚠️ [Sidebar.tsx] 移动端隐藏但未提供替代导航
```

---

## 输出格式

### 终端输出（默认）

```text
🛡️ frontend-guardian v2.0.0 — 全端扫描报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 检测到项目类型: UniApp + Vue3 + TypeScript（微信小程序目标）

🌍 i18n-governance
   ❌ 硬编码文案: 12 处
   ⚠️ 缺失 key: 3 个（en-US）
   🗑️ 死 key: 7 个
   ✅ 命名规范: 通过

🏥 component-doctor
   ❌ 反模式: 4 处（ElTable 无 row-key x2, Select 无虚拟滚动 x1, Dialog 无 destroyOnClose x1）
   ⚠️ 硬编码样式: 8 处
   ✅ 可访问性: 通过

⚡ hook-checker
   ❌ useEffect 缺失依赖: 2 处
   ⚠️ 自定义 Hook 命名不规范: 1 处

📱 platform-guard
   ❌ 包体积超限: 主包 2.3MB > 2MB
   ⚠️ setData 大数据: 1 处（单次 150KB）
   ❌ 图片 base64: 3 处 > 10KB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 Critical: 8  |  🟡 Warning: 14  |  💡 Suggestion: 5
📄 详细报告: ./frontend-guardian-report.md
```

### Markdown 报告（--output）

生成结构化 Markdown 报告，包含：
- 执行摘要与统计
- 按文件分组的问题列表
- 自动修复建议（代码 diff 格式）
- 严重级别分布图表（ASCII）
- 修复优先级排序

### CI 门禁模式（--gate）

```bash
fg-core . --scan --gate
# 发现 Critical 问题 → 退出码 1，阻断 CI
```

门禁规则可配置：
```yaml
# .frontend-guardian.yml
gate:
  critical:
    max: 0        # Critical 必须为 0
  warning:
    max: 10       # Warning 不超过 10
  suggestion:
    max: 20       # Suggestion 不超过 20
```

---

## 规则配置

项目根目录可创建 `.frontend-guardian.yml` 覆盖默认规则：

```yaml
# 全局配置
locale: zh
severity: warning
output: ./reports/frontend-guardian.md

# i18n 配置
i18n:
  sourceLocale: zh-CN
  targetLocales: [en-US, ja-JP]
  format: json
  keyPattern: "^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$"  # 命名正则
  extractPaths:
    - src/**
    - pages/**
  ignorePaths:
    - src/utils/logger.ts
    - **/*.test.ts
  interpolationPattern: "\{([^}]+)\}"  # 插值变量匹配
  translateProvider: openai  # openai / deepl / aliyun

# 组件配置
component:
  library: auto  # auto / antd / element-plus / mui
  themeTokenPrefix: "--"  # CSS 变量前缀
  maxSelectOptions: 100
  checkA11y: true
  checkPerf: true

# Hooks 配置
hooks:
  maxEffectDeps: 5
  checkClosure: true
  checkCustomHookNaming: true

# 多端配置
platform:
  targets:
    - wechat-mp
    - h5
  mp:
    maxMainPackageSize: 2097152  # 2MB
    maxSubPackageSize: 2097152
    maxBase64ImageSize: 10240    # 10KB
  mobile:
    minTouchTarget: 44
    checkSafeArea: true
  harmony:
    strictTypeCheck: true
```

---

## 版本演进

### v3.11.2 — 小程序性能采集（已交付，748 测试通过，3 个 skip）

- **性能采集入口**：`lib/src/utils/miniprogram-cli.ts` 新增 `performanceArgs` 与 `runPerformance`，为各平台开发者工具 CLI 性能参数预留统一入口
- **性能工具库**：新增 `lib/src/utils/miniprogram-performance.ts`，提供 `collectBuildMetrics`、`collectSetDataMetrics`、`checkPerformanceThresholds`、`parsePerformanceOutput` 等函数
- **构建指标**：自动采集编译耗时、主包/分包体积、页面文件体积（JS / 模板 / 样式 / 图片）
- **setData 静态分析**：扫描页面 JS/TS 文件中的 `setData` 调用，统计次数与估算负载，识别大对象 setData
- **运行时指标（可选）**：平台 CLI 支持性能参数时，解析启动时间、FPS 输出；不支持时优雅降级为构建指标 + suggestion 提示
- **阈值告警**：新增 `miniprogram-perf-startup-time`、`miniprogram-perf-fps`、`miniprogram-perf-setdata-cost`、`miniprogram-perf-large-setdata`、`miniprogram-perf-main-package-size`、`miniprogram-perf-subpackage-size`、`miniprogram-perf-page-complexity` 等 issue 规则
- **CLI 参数**：
  - `--miniprogram-performance` 启用性能采集
  - `--miniprogram-performance-threshold-startup`、`-fps`、`-setdata-count`、`-setdata-payload`、`-package-size`、`-page-size` 覆盖默认阈值
- **MCP 增强**：`mini-program` 工具新增 `performance` 与 `performanceThresholds` 参数
- **多平台性能合并**：`--mini-program all` 时各平台 `performanceData` 合并为数组上报
- **文件系统解耦**：新增 `lib/src/utils/miniprogram-fs.ts`，抽离 `getDirectorySize`、`getSubPackageSize`、`findPageSourceFile` 供多模块复用

### v3.11.1 — 支付宝/抖音小程序 CLI 自动化与多平台并行测试（已交付，733 测试通过，3 个 skip）

- **通用 CLI 抽象**：新增 `lib/src/utils/miniprogram-cli.ts`，将开发者工具路径发现、execSync 调用、编译输出解析统一为平台无关函数
- **支付宝/抖音 CLI 配置**：新增 `miniprogram-alipay-cli.ts`、`miniprogram-douyin-cli.ts`，提供默认安装路径、环境变量与下载链接；命令参数按常见约定实现并留有版本验证注释
- **多平台统一入口**：`lib/src/integrations/miniprogram.ts` 替代原 `miniprogram-wechat.ts`，按平台分发编译/截图调用，缺失某平台开发者工具时仅跳过该平台运行时检查
- **多平台并行测试**：
  - `--mini-program all` 自动检测项目中的所有小程序平台并串行执行
  - `--mini-program wechat,alipay` 显式指定多个平台
  - 结果合并为 `MiniProgramResult`，`platform` 为 `"multi"` 并附带 `platforms` 列表
- **基线隔离**：各平台首页截图基线目录改为 `.frontend-guardian/screenshots/baseline/miniprogram/{wechat,alipay,douyin}/`
- **补齐抖音检测**：`project-detector.ts` 在 `project.config.json` 含 `tt` 字段时返回 `douyin-mp`；新增 `rules/douyin-mp.md`
- **MCP 增强**：`mini-program` 工具 `platform` 枚举新增 `"all"`
- **测试覆盖**：新增/替换 `miniprogram-cli.test.ts`、`miniprogram-alipay-cli.test.ts`、`miniprogram-douyin-cli.test.ts`、`miniprogram-integration.test.ts`

### v3.11.0 — 小程序自动化测试（已交付，713 测试通过，3 个 skip）

- **小程序平台自动检测**：根据 `app.json` / `project.config.json` / `pages.json` / `mini.project.json` 识别微信 / 支付宝 / 抖音小程序
- **微信小程序 CLI 自动化**：调用微信开发者工具 `cli --auto --project <path>` 进行编译检查，解析错误/警告输出
- **页面存在性检查**：遍历 `app.json` / `pages.json` 的 `pages`，验证每个页面是否有对应源码文件
- **包体积检查**：主包与分包源码体积分别与 2MB 阈值对比，超限生成 `miniprogram-main-package-oversize` / `miniprogram-sub-package-oversize` Issue
- **首页截图基线（可选）**：`--miniprogram-screenshot` 触发首页截图，支持 `--miniprogram-update-baseline` 更新基线
  - 基线目录：`.frontend-guardian/screenshots/baseline/miniprogram/wechat/`
  - 未安装微信开发者工具时给出下载链接提示，不影响静态检查
- **CLI 入口**：`fg-core . --mini-program [wechat|alipay|douyin|auto]`
- **MCP 工具**：新增 `mini-program` 工具，AI Agent 可直接调用
- **测试覆盖**：新增 `lib/tests/miniprogram-detect.test.ts`、`miniprogram-wechat-cli.test.ts`、`miniprogram-wechat.test.ts`

### v3.10.1 — 跨浏览器基线与移动端视口模拟（已交付，688 测试通过，3 个 skip）

- **跨浏览器截图对比**：`--page-health --browser all` 依次在 Chromium / Firefox / WebKit 上执行
  - `--browser chromium|firefox|webkit|all` 选择浏览器引擎
  - 每个浏览器拥有独立基线目录：`.frontend-guardian/screenshots/baseline/{chromium,firefox,webkit}/`
  - Issue `meta` 携带 `browser` 字段，便于按浏览器分组
- **移动端视口模拟**：支持 Playwright 设备预设或自定义视口
  - `--device "iPhone 14 Pro"` 使用 Playwright 内置设备（含 viewport / userAgent / touch / deviceScaleFactor）
  - `--viewport 390x844` 自定义视口尺寸
  - `--viewport-mobile` 快捷使用 iPhone 14 Pro 预设
  - 基线目录按 `baseline/{browser}/{viewportKey}/` 隔离
- **Lighthouse 限制**：Core Web Vitals 仅在 Chromium profile 上运行，Firefox/WebKit 自动跳过
- **测试覆盖**：新增 `lib/tests/page-health-profile.test.ts`，扩展 `visual-regression.test.ts` 与 `page-health.test.ts`

### v3.10.0 — 页面测试进阶（已交付，669 测试通过，3 个 skip）

- **像素级视觉回归**：`--page-health` 支持真实像素差异对比，替代原有 SHA256 哈希对比
  - 依赖 `pixelmatch` + `pngjs`（可选安装），未安装时自动回退到 SHA256
  - 生成差异高亮图保存到 `.frontend-guardian/screenshots/diff/`
  - 支持 `--screenshot-selector <selector>` 对特定元素截图，减少全页噪音
  - 支持 `--max-diff-pixels` / `--max-diff-pixel-ratio` 阈值配置
  - 新增 Issue 规则 `page-health-visual-regression`
- **动态内容遮罩**：截图前自动遮罩时间戳、广告位等不稳定元素
  - 内置遮罩选择器：`[data-testid="timestamp"]`, `.ad-banner`, `.live-clock`, `[data-random]` 等
  - 支持 `--mask-selectors` 追加自定义选择器，`--no-mask` 关闭遮罩
- **Lighthouse Core Web Vitals**：`--page-health --page-health-metrics` 采集性能指标
  - 采集 LCP / CLS / FCP / TTFB / INP
  - 阈值超标时生成 `page-health-lighthouse-*` warning Issue
  - 阈值可通过 `--cwv-thresholds` 或配置文件覆盖
- **运行时无障碍检测**：`--page-health --a11y` 注入 axe-core
  - 检测 color contrast、ARIA、焦点管理等动态问题
  - 支持 `--a11y-tags` 过滤标签（如 `wcag2a,wcag2aa`）
  - 新增 `page-health-a11y-runtime-<axeRuleId>` Issue
- **测试覆盖**：新增 `lib/tests/visual-regression.test.ts`、`lighthouse-metrics.test.ts`、`runtime-a11y.test.ts` 单元测试，扩展 `page-health.test.ts` 格式化测试

### v3.9.0 — 智能测试推荐（已交付，642 测试通过）

- **智能测试推荐 `--recommend-tests`**: 基于代码变更影响分析，自动推荐需要运行的测试文件
  - Priority 1：测试文件直接 import 了变更文件
  - Priority 2：变更文件通过 import 链间接影响测试文件
  - Priority 3：变更文件影响某个路由，E2E 测试覆盖该路由
  - 复用 v3.7.0 的 `ProjectIndexer` 反向依赖图，无需重新解析 AST
- **PR 阶段增量测试**: 配合 `--staged` / `--diff` / `--auto-scope` 使用，CI 中只运行受影响的测试套件
- **MCP 工具 `recommend-tests`**: AI Agent 可直接调用获取推荐测试列表
- **测试覆盖**: 新增 `lib/tests/v3.9.0-test-recommender.test.ts`（7 个单元测试）以及 CLI / MCP 冒烟测试

### v3.8.0 — MCP Server 与 AI Agent 集成（已交付，631 测试通过）

- **MCP Server 模式 `--mcp`**: `fg-core . --mcp` 启动基于 stdio 的 MCP Server，暴露治理能力为 AI Agent 可调用的工具
  - 暴露工具：`scan`、`fix`、`e2e-run`、`e2e-detect-gaps`、`list-rules`、`scan-file`、`page-health`、`ai-fix`、`get-project-meta`、`index-project`
  - 兼容 Claude Code、Cursor、Copilot 等支持 MCP 协议的客户端
  - 自然语言触发：Agent 无需记忆 CLI 命令，通过工具描述即可调用
- **静默扫描模式**: `EngineOptions.silent` 避免 MCP stdio 传输被 stdout 日志污染
- **版本号同步**: 修复 `fg-server.js` 帮助文本与启动日志版本不一致的问题
- **测试覆盖**: 新增 `lib/tests/mcp-server.test.ts`（8 个 MCP 工具单元测试）和 CLI `--mcp` 冒烟测试

### v3.7.6 — README 重写与文档改进（已交付，622 测试通过）

- **README 重写**: 重新组织 README 结构，降低新用户认知负担
  - 新增「核心能力」表格：8 大能力一目了然，每行附带对应命令
  - 新增「两种使用形态」章节：清晰区分 npm 包（CLI）和 AI Skill 的安装与使用方式
  - 简化「30 秒上手」为 4 步流程（安装 → 初始化 → 扫描 → 装 hook）
  - 移除冗余的 AI 智能体兼容性大表格，保留关键信息

### v3.7.5 — 页面健康检查截图对比（已交付，622 测试通过）

- **截图基线对比**: 页面健康检查支持基线截图对比，发现 UI 回退
  - 首次运行保存基线到 `.frontend-guardian/screenshots/baseline/`
  - 后续运行自动对比当前截图与基线（SHA256 哈希）
  - 截图不同时生成 `page-health-screenshot-changed` warning Issue
  - `--update-baseline` 更新基线截图
- **CLI 参数**: `--update-baseline` 更新基线截图（配合 `--page-health`）
- **测试覆盖**: 新增 2 个截图对比测试

### v3.7.4 — 页面健康检查交互元素发现（已交付，620 测试通过）

- **交互元素检测**: 页面健康检查自动发现 button/link/input 等交互元素并验证可点击性
  - 默认启用，可通过 `--no-check-interactive` 关闭
  - 检测范围：button、a[href]、input、textarea、select、role="button/link/checkbox/radio"
  - 统计可见/禁用交互元素数量
  - 新增 Issue 规则 `page-health-interactive-disabled`：交互元素被禁用
- **CLI 参数**: `--no-check-interactive` 禁用交互元素检查（配合 `--page-health`）
- **测试覆盖**: 新增 2 个交互元素测试（带数据报告 + 无数据报告）

### v3.7.3 — 页面健康检查报告集成（已交付，618 测试通过）

- **Dashboard 上报**: 页面健康检查结果自动上报到 v3.5.2 治理看板服务器
  - 复用 `--server <url>` 参数，`--page-health` 模式下检查结果自动上报
  - `toScanResult()` 将 `PageHealthResult` 转换为 `ScanResult`，兼容 dashboard server API
  - `uploadPageHealthResult()` 封装上报逻辑，支持 auth token
- **测试覆盖**: 新增 2 个 `toScanResult` 测试（正常转换 + 空结果处理）

### v3.7.2 — 页面健康检查并发优化（已交付，616 测试通过）

- **并发路由检查**: 页面健康检查支持并发执行，默认 3 个 page 并行，大项目检查时间大幅缩短
  - 新增 `--page-health-concurrency <n>` CLI 参数自定义并发数
  - 基于 `runWithConcurrency` 并发池实现，限制同时运行的浏览器 page 数量
  - 单个路由失败不阻断其他并发任务，确保检查完整性
- **测试覆盖**: 新增 5 个并发相关测试（类型检查 + 并发控制逻辑 + 边界条件）

### v3.7.1 — 页面健康检查（已交付，611 测试通过）

- **页面健康检查 `--page-health`**: 结合 webapp-testing skill 的侦察-行动模式，启动浏览器遍历项目路由，验证页面渲染质量
  - 自动检测 Playwright 可用性，未安装时给出友好提示
  - 支持 `--serve "npm run dev"` 自动启动 dev server 并等待端口就绪
  - 支持 `--base-url` 直接指定目标 URL
  - 支持 `--routes` 指定要检查的路由列表
- **6 类运行时 Issue 检测**:
  - `page-health-http-error`: HTTP 404/500 等错误状态码
  - `page-health-white-screen`: 页面白屏检测（body 无可见内容）
  - `page-health-console-error`: 控制台 Error 日志捕获
  - `page-health-resource-error`: 资源（JS/CSS/图片）加载失败
  - `page-health-navigation-failed`: 页面导航超时/连接失败
- **自动截图**: 每个路由检查完成后自动截图保存到 `.frontend-guardian/screenshots/`，供人工核查
- **复用 v3.7.0 索引**: 自动从 `ProjectIndexer` 获取路由列表，无需手动配置

### v3.7.0 — 增量索引与影响分析（已交付，607 测试通过）

- **项目索引器 `ProjectIndexer`**: 预索引文件结构、符号、import 关系、路由，持久化到 `.frontend-guardian/index/index.json`
- **文件监听 `--watch-index`**: 基于 `fs.watch` 的文件变更监听，500ms 防抖自动同步索引
- **路由解析器 `RouteParser`**: 自动识别 React Router / Vue Router / Next.js / Nuxt / UniApp / Taro 路由
- **影响分析 `getTransitiveImporters()`**: 递归追踪文件依赖链，定位变更影响范围

### v3.6.1 — Playwright 外部工具集成（已交付，576 测试通过）

- **Skill 统一入口 `--e2e-run`**: `fg-core . --e2e-run` 自动检测 Playwright 配置并执行 `npx playwright test --reporter=json`，将失败/超时结果转为 `Issue` 对象统一展示
- **JSON 报告解析**: 解析 Playwright JSON 报告，支持 `failed` / `timedOut` / `skipped` / `passed` 状态，提取错误消息、堆栈、步骤信息、行号列号
- **全局错误检测**: 捕获 `beforeAll` / `afterAll` 钩子失败等全局 setup 错误，转为 `playwright-setup-error` Issue
- **零额外依赖**: Playwright 仍由项目自行安装，skill 只作为统一调用入口和结果聚合器

### v3.6.0 — E2E 测试治理（已交付，569 测试通过）

- **E2E 测试规范扫描 `--module e2e`**: 扫描 Playwright/Cypress 测试代码，检测 6 类反模式：
  - `e2e-no-hardcode-selector`: 硬编码 CSS 选择器（推荐 data-testid）
  - `e2e-no-wait-for-timeout`: 固定时长等待（waitForTimeout）
  - `e2e-missing-api-assert`: UI 操作后缺少接口断言（waitForResponse）
  - `e2e-no-try-catch`: 测试用例缺少错误处理
  - `e2e-naming-convention`: 测试文件命名不规范
  - `e2e-selector-over-class`: 选择器过度依赖类名
- **测试覆盖缺口检测 `--e2e-detect-gaps`**: 对比项目页面路由（pages.json / pages/ 目录 / router 配置）和现有 E2E 测试文件，发现未覆盖的页面路径和 API 接口，输出覆盖率和建议生成的测试文件名
- **零外部依赖**: 不依赖 Playwright 运行时，纯文本/文件系统扫描

### v3.5.2 — 治理看板服务端（已交付，559 测试通过）

- **治理看板服务端 `fg-server`**: 零外部依赖的 HTTP 服务器（基于 `node:http`），用于集中收集多项目扫描数据。支持 `--port` / `--data-dir` / `--cors` / `--auth-token` 参数。提供 REST API: `POST /api/reports`（接收扫描结果）、`GET /api/projects`（项目列表）、`GET /api/projects/:id/trends`（趋势数据）、`GET /api/projects/:id/latest`（最新报告），以及 Web 看板首页 `/`
- **CLI 上报 `--server <url>`**: `fg-core ./project --scan --server http://localhost:3456` 扫描后自动上报到看板服务器。支持 `--serve` 快捷方式（使用默认 localhost:3456）
- **Web 看板 SPA**: 零外部依赖的纯前端看板，AJAX 加载数据，Canvas 绘制趋势折线图、严重级别柱状图。支持多项目切换、30 秒自动刷新
- **环境变量自动检测**: `FG_DASHBOARD_SERVER` 和 `FG_DASHBOARD_TOKEN` 支持自动配置上报目标

### v3.5.1 — 扫描策略分级 + 合规报告（已交付，546 测试通过）

- **扫描策略分级 `--strategy strict|standard|loose`**：`strict` 启用所有规则（包括默认禁用的）；`standard` 保持默认行为；`loose` 禁用所有 `suggestion` 级别规则。策略通过 `RuleRegistry.applyStrategy()` 实现，与配置文件中的 `strategy` 字段联动
- **合规报告 `--compliance <file>`**：生成 SOC2 / ISO27001 / WCAG 风格的代码质量合规报告。内置规则到控制项的映射表（如 `security-xss-vulnerable` → SOC2-CC7.1），输出包含执行摘要、合规评分（0-100）、不符合项清单、整改建议与优先级、控制项映射参考

### v3.5.0 — 企业级团队协作（已交付，532 测试通过）

- **团队共享 baseline `--team-baseline`**：支持从远程 URL 加载团队 baseline（如 `https://team.example.com/baseline.json`），自动缓存到本地（1 小时 TTL），下载失败时回退到本地 baseline 或全量报告
- **扫描结果通知 `--notify`**：扫描完成后通过 webhook 发送通知到飞书、钉钉、企业微信、Slack。支持环境变量自动检测（`FG_NOTIFY_*`），发送内容包含问题分布、关键问题 top 5、门禁状态
- **问题责任人指派 `--assign`**：自动解析目标项目根目录的 `CODEOWNERS` 文件（支持 `.github/CODEOWNERS`、`CODEOWNERS`、`docs/CODEOWNERS`），按 GitHub glob 匹配规则为每个 issue 推断 `assignee`，后续规则覆盖前面规则

### v3.4.0 — 简单化重构（已交付）

- **统一输出格式 UnifiedOutput**：AST 引擎 + Bash 补充引擎 + Knip 外部工具的结果合并为统一 JSON 结构，包含 `summary`、`modules`、`external` 三个顶层节点
- **`full-scan.sh` 统一入口重构**：AST 引擎成为主要引擎（`fg-core --module all`），Bash scanner 降级为补充引擎但结果结构化解析后合并
- **Bash scanner 结构化解析**：`parse_bash_to_json()` 将 Bash scanner 的文本输出（`❌ [file:line] message`）解析为结构化 Issue JSON，统一进入报告
- **`--scan` CLI 参数**：`fg-core.js` 新增 `--scan` 作为 `--module all` 的别名，命令体系更直观
- **SKILL.md 精简对齐**：7 个核心命令与实际 CLI 参数完全一致，删除过时描述
- **Markdown 报告统一生成**：`generate_report()` 从 UnifiedOutput JSON 生成，同时包含 AST 和 Bash 引擎的问题

### v3.3.0 — IDE 集成（已交付，516 测试通过）

- **增量诊断引擎**：`IncrementalDiagnostic` 单文件毫秒级扫描，内容缓存命中时直接返回，避免重复解析
- **LSP 协议支持**：`fg-lsp` 语言服务器，提供 `textDocument/diagnostic`（实时诊断）和 `textDocument/codeAction`（快速修复）
- **VS Code 插件**：`frontend-guardian-vscode` 扩展，支持实时问题下划线、Hover 规则说明、一键修复、治理看板

### v3.2.0 — 性能与体验优化（已交付，503 测试通过）

- **增量扫描 import 图分析**：`--staged` / `--diff` / `--auto-scope` 增量扫描时，通过 import 图自动扩展扫描范围到变更文件的所有依赖方，确保不遗漏受影响文件
- **并行度自适应**：`getAdaptiveConcurrency()` 根据项目规模（文件数）和规则数动态调整并发度，小项目降低调度开销，大项目允许超线程
- **AST 缓存 LRU 淘汰**：SmartCache 的内存级 AST 缓存增加 LRU 淘汰策略（默认上限 200 条），防止大项目扫描时内存泄漏

### v3.1.0 — 历史报告对比（已交付，485 测试通过）

- **历史报告对比 `--history-compare`**：对比两次扫描报告，输出新增 / 已修复 / 持续存在的问题明细
- **严重级别变化检测**：自动识别同一问题 severity 变化（如 warning → critical）
- **多种对比模式**：不指定参数对比最近两次；指定一个报告与最近一次对比；指定两个报告互相对比
- **前缀匹配**：支持 `20250601` 前缀快速定位报告文件

### v3.0.0 — AI 修复建议（已交付，475 测试通过）

- **LLM 驱动的修复建议 `--ai-fix`**：为无自动修复的 Issue 调用 OpenAI / Claude API 生成修复建议。扫描后自动展示 AI 推荐的修复方案，含置信度和解释
- **AI 配置自动检测**：通过 `FG_AI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` 环境变量自动检测配置。支持 `--ai-model <model>` 指定模型（如 `gpt-4o-mini` / `claude-3-5-sonnet`）
- **建议缓存**：AI 修复建议按 issue 指纹缓存到 `.frontend-guardian/ai-cache/`，避免重复调用 API，节省成本
- **批量建议**：支持为多个 issue 批量生成 AI 修复建议，默认每次扫描最多处理 5 个无修复方案的问题
- **解析与置信度**：AI 响应按 `FIX:` / `EXPLANATION:` / `CONFIDENCE:` 格式解析，置信度分为 high / medium / low，与现有 SmartFix 置信度系统兼容

### v2.9.0 — Monorepo 工作区支持（已交付，466 测试通过）

- **Monorepo 自动检测**：`detectMonorepo()` 支持 `pnpm-workspace.yaml` / `lerna.json` / `nx.json` / `rush.json` / `package.json workspaces` 五种工具自动检测
- **Workspace 多包扫描 `--monorepo`**：自动遍历 workspace 所有子包分别扫描，汇总跨包报告。支持 `--workspace <name>` 仅扫描指定包、`--skip-package <name>` 跳过指定包
- **跨包依赖分析**：`analyzeCrossPackageDeps()` 检测 workspace 包间循环依赖和缺失依赖，输出 `CrossPackageIssue[]`
- **统一汇总报告**：`formatWorkspaceReport()` 生成终端友好的多包扫描报告，`formatWorkspaceJson()` 生成结构化 JSON 输出
- **路径自动调整**：子包扫描结果的文件路径自动调整为相对于 monorepo 根目录，便于统一查看

### v2.8.0 — 数据洞察与可视化（已交付，458 测试通过）

- **扫描结果完整持久化 `--save-report`**：每次扫描保存完整的 issues 到 `.frontend-guardian/history/YYYYMMDD-HHmmss.json`，含问题详情、git 信息、扫描统计
- **历史报告查询 `--history`**：查看历史扫描记录列表，支持 `--history-module <name>` 按模块过滤，`--history-limit <n>` 限制条数
- **团队趋势看板 `--generate-dashboard`**：基于历史报告数据生成单文件 HTML 趋势页面（零外部依赖），含问题趋势折线图、模块分布饼图、严重级别柱状图、修复率统计、扫描历史表格。可直接浏览器打开或部署到静态托管

### v2.7.0 — 可扩展性与智能化（已交付，453 测试通过）

- **配置热重载（Watch 模式）**：`--watch` 启动时额外监听 `.frontend-guardian.yml` / `.frontend-guardian.yaml` / `.frontend-guardian.json` 配置文件变更，配置修改后自动清除缓存并重新全量扫描，无需重启进程
- **规则插件系统 `extends: npm:package-name`**：配置文件支持 `extends: npm:frontend-guardian-plugin-*` 从 npm 包加载规则和配置。插件包导出 `{ config?: ProjectConfig, rules?: Rule[] }`，规则自动注册到引擎，配置与普通 `extends` 一样支持多级继承和合并

### v2.6.0 — 自动化工作流增强（已交付，446 测试通过）

- **commit-msg hook**：`--install-hooks --install-hooks-type commit-msg` 安装 Conventional Commits 检查 hook，支持 `feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert` 等类型；`--install-hooks-type all` 同时安装 pre-commit / pre-push / commit-msg 三个 hook
- **缓存预热（Watch 模式）**：`--watch` 启动时创建并复用 SmartCache 实例，首次扫描即填充 AST 缓存，文件变更后的增量扫描实现秒级响应
- **自动修复 Bot `--fix --fix-bot`**：扫描后自动创建修复分支、提交修复、创建 PR/MR；支持 GitHub / GitLab，通过 `FG_FIX_BOT_PROVIDER` / `FG_FIX_BOT_TOKEN` / `FG_FIX_BOT_BASE_BRANCH` 环境变量配置

### v2.5.1 — 生态集成 P1（已交付，444 测试通过）

- **GitLab CI 模板完善**：`--init-ci` 生成含 `stages` / `rules` / `cache` / `artifacts` / `--post-comment` 的完整 GitLab 模板；新增 `--init-ci-provider` 参数支持 `github` / `gitlab` / `both`；新增 `detectCIProvider()` 自动检测平台
- **扫描范围智能推断 `--auto-scope`**：自动检测未提交修改（unstaged + staged）→ 回退到最近 5 次提交 → 无修改时全量扫描，大项目秒级精准定位
- **报告托管/上传 `--upload`**：支持 HTTP webhook 和文件复制两种上传方式，通过 `FG_UPLOAD_PROVIDER` / `FG_UPLOAD_URL` / `FG_UPLOAD_DIR` 环境变量配置
- **报告输出 `--output`**：将扫描报告写入指定 Markdown 文件，修复 CI 模板中的隐式依赖

### v2.5.0 — 生态集成与自动化（已交付，405 测试通过）

- **规则 docsUrl & confidence 全量填充**：9 个 scanner 文件的 53 条规则全部添加 `docsUrl`（指向 GitHub 文档链接），15 条含 fix 的规则添加 `confidence`（high/medium/low）+ `description`，CLI 输出具备完整可追溯性
- **npm 发布准备**：`package.json` 完善 repository / bugs / homepage / exports / files 字段，新增 `.npmignore` 和 `LICENSE`，`prepublishOnly` 自动构建 + 测试，包体积 146KB
- **PR/MR 评论自动发布 `--post-comment`**：GitHub PR / GitLab MR 评论发布，支持去重更新，自动检测 CI 环境
- **CLI 版本同步**：`fg-core.js` 版本号升级至 v2.5.0

### v2.4.0 — 开发者体验（已交付，376 测试通过）

- **修复置信度系统 `SmartFix`**：`Fix` 接口扩展 `confidence: "high" | "medium" | "low"` + `description`，`applyFixes()` 自动跳过低置信度修复（需 `--interactive` 或手动确认）
- **交互式修复 `--fix --interactive`**：类似 `git add -p`，逐条展示 diff 并确认 `[y/n/a/q]`，支持全部应用后退出交互模式
- **规则文档内联链接 `docsUrl`**：`Rule` 接口扩展 `docsUrl`，Issue 输出自动附带规则文档链接（终端可点击跳转）
- **大文件智能跳过**：`scanFile()` 检测文件大小，默认 > 500KB 自动跳过并 warn，可通过 `--skip-large-files-threshold` 调整阈值（0 表示不跳过）
- **指令统一**：README 统一使用 `fg-core .` CLI 格式，移除 SKILL 特有的 `/frontend-guardian` 指令
- **测试**：新增 `tests/v2.4.0-smart-fix.test.ts`（10 测试），覆盖置信度过滤、docsUrl 传递、大文件跳过阈值

### v2.3.1 — CI/CD 增强补全（已交付，366 测试通过）

- **`--init-config` 配置初始化**：新增 `utils/init-config.ts`，一键生成 `.frontend-guardian.yml` 智能默认配置，基于项目检测结果自动填充框架/组件库/平台相关配置
- **pre-push hook 支持**：`git-hooks.ts` 扩展 `type: "pre-push" | "both"`，pre-push 运行全量扫描，pre-commit 保持 staged 增量扫描；CLI 新增 `--install-hooks-type` 参数
- **husky 兼容**：`detectHusky()` 自动检测 husky 安装，hook 写入 `.husky/` 目录并适配 v8+ 格式，无需 shebang
- **团队共享配置继承 `extends`**：`config-loader.ts` 支持 `extends: ./base.yml`，多级继承 + 嵌套对象浅合并 + rules 按 id 去重合并 + customRules 按 path 去重
- **指令体系精简**：README / SKILL.md 精简为 7 个核心命令 + 单模块扫描 + 常用组合，移除过时/不支持的命令示例
- **测试**：新增 `tests/init-config.test.ts`（12 测试）、`tests/config-loader-extends.test.ts`（5 测试）

### v2.3.0 — CI/CD 与提交增强（已交付，349 测试通过）

- **SARIF 格式输出** `--sarif`：新增 `formatters/sarif.ts`，将 Issue 列表转换为 SARIF 2.1.0 JSON，支持 GitHub Security tab 消费，含 rule 定义、location、fix replacement
- **GitHub Actions Annotation**：新增 `formatters/github-annotation.ts`，输出 `::error file=...::message` 格式命令，PR diff 内联显示问题；支持 `GITHUB_STEP_SUMMARY` Markdown 汇总
- **Baseline 模式** `--baseline`：新增 `utils/baseline.ts`，`BaselineManager` 支持保存/加载/对比 baseline，遗留项目渐进式治理（已有问题不阻塞，仅关注新增）；列号容差 ±5
- **CLI 集成**：`fg-core.js` 新增 `--sarif`、`--github-actions`、`--baseline <file>`、`--generate-baseline` 参数，自动检测 `GITHUB_ACTIONS` 环境
- **测试**：新增 `tests/sarif-formatter.test.ts`（15 测试）、`tests/github-annotation.test.ts`（14 测试）、`tests/baseline.test.ts`（17 测试）

### v2.2.0 — 测试覆盖与质量（已交付，303 测试通过）

- **ast-parser 全面测试**：`tests/ast-parser.test.ts` 30 个测试覆盖 `parseAST()` / `getImports()` / `hasImport()` / `walkAST()`，含 JS/TS/JSX/TSX/Vue SFC/多字节字符/边界场景
- **project-detector 全面测试**：`tests/project-detector.test.ts` 59 个测试覆盖框架/组件库/平台/TS/i18n/Bundler/测试框架/状态管理/样式/路由/包管理器/Linter/Monorepo/Runtime 全维度检测
- **修复功能测试**：`tests/fix-engine.test.ts` 18 个测试覆盖单行修复、多行修复、多修复倒序应用、dry-run diff 预览、emoji/中文多字节字符、越界容错
- **CLI 入口测试**：`tests/cli-entry.test.ts` 16 个测试覆盖 `--help` / `--module` / `--json` / `--install-hooks` / `--init-ci` / `--watch` 等参数解析与路由，使用子进程真实调用
- **Svelte scanner 测试**：`tests/svelte-scanner.test.ts` 16 个测试补齐 4 条 Svelte 规则
- **外部工具集成测试**：`tests/integrations.test.ts` 9 个测试覆盖 `eslintSeverityToFg()` / `hasPackage()` / `runCommand()`
- **测试辅助函数提取**：新建 `tests/helpers.ts`，统一 `createTempProject` / `writeProjectFile` / `makeFixIssue` / `createMinimalContext` 等通用工具
- **覆盖率报告**：Vitest + `@vitest/coverage-v8` 配置完成，当前覆盖率 语句 62.57% / 分支 72.92% / 函数 73.91%
- **Bug 修复**：`hasImport()` 支持 `namespaceImport` 检查；`detectRuntime()` 从 `process.cwd()` 修正为使用 `projectDir`

### v2.1.1 — 架构收尾优化（已交付，155 测试通过）

- **规则预过滤优化**：`scan()` 先根据 `projectMeta` 过滤规则，无匹配规则时直接跳过 `glob`，避免不必要的文件遍历
- **跨文件扫描器文件图缓存**：`cross-file-scanner` 的 5 条规则共享 `RuleContext.sharedCache` 中的文件图，同一目录只解析一次 AST，不再重复构建
- **移除 jscodeshift 依赖**：源码零引用，删除 `jscodeshift` + `@types/jscodeshift`，减少安装体积
- **tsconfig paths 对齐**：源码全部改用 `@/*` 路径映射（`@/types.js`、`@/utils/ast-parser.js` 等），开发体验更清晰；编译后 `tsc-alias` 自动重写为相对路径，不影响发布

### v2.1.0 — 性能与架构优化（已交付，155 测试通过）

- **真正并行扫描**：`RuleEngine.scan()` 文件级 `Promise.all` 并行（`concurrentMap`），默认并发数 = CPU 核心数，大项目扫描速度提升与核心数成正比
- **AST 解析结果缓存**：`SmartCache` 扩展内存级 AST 缓存层，同一文件在单次扫描中只 `parseAST()` 一次，规则间复用 AST
- **消除代码重复**：提取 `getFileExt()` / `getJSXTagName()` 到 `utils/common.ts`，8 个 scanner 文件删除重复定义
- **RuleEngine 核心测试**：新增 `tests/rule-engine.test.ts`，14 个测试覆盖 `scan()` / `applyFixes()` / `clusterIssues()` / `register` / `filter` / 缓存命中
- **清除全局缓存污染**：`i18n-scanner.ts` 模块级 `localeKeyCache` / `allCodeKeysCache` 改为 `Map<string, Set>`，支持多项目并发扫描

### v2.0 — 简单化 · 智能化 · 通用化 · 覆盖全面化

#### Phase 1: 简单化（已交付）

- **统一命令体系**：从 40+ 碎片化命令精简为 7 个核心命令
- **合并双引擎**：AST 引擎（`fg-core --module all`）成为主要引擎，Bash 引擎降级为补充
- **统一输出格式**：所有扫描结果合并为统一 JSON → Markdown/终端/JSON 三种输出适配器
- **修复 category mapping bug**：`a11y`/`naming`/`cross-file` 模块名正确映射到规则 category

#### Phase 2: 智能化（已交付）

- **深度技术栈检测**：从 package.json 解析 10+ 维度（构建工具、测试框架、状态管理、样式方案、路由、包管理器、Linter、Monorepo）
- **Issue 聚类**：同一文件同一规则的多个问题自动聚合为 `(×N)` 聚合 Issue，减少重复输出
- **增量扫描**：`--staged` / `--diff main...feature` 仅扫描 git 变更文件，大型项目扫描速度大幅提升

#### Phase 3: 通用化（已交付）

- **规则注册中心 (`RuleRegistry`)**：`lib/src/rules/registry.ts` — 统一管理内置规则 + 自定义规则，支持注册/注销/查询/按条件过滤
- **配置驱动规则**：`.frontend-guardian.yml` 的 `rules:` 节点支持启用/禁用/调整 severity/参数化，如关闭某规则、调高 severity、修改 `maxDeps` 阈值
- **自定义规则支持**：`customRules:` 配置加载用户自己的 JS 规则文件（`module.exports = { id, name, execute }`），实现热插拔扩展
- **引擎集成 Registry**：`RuleEngine` 启动时自动读取配置文件中的 `rules` + `customRules`，无需改代码即可调整规则行为
- **新增 11 项单元测试**：`tests/rule-registry.test.ts` 覆盖注册、配置覆盖、severity 调整、参数化、过滤、清除等全部场景
- 框架抽象层：useEffect / watchEffect 等抽象为通用 EffectHook 模式

#### Phase 4: 覆盖全面化（已交付）

- **外部工具集成**：`lib/src/integrations/` — ESLint（`--format json`）、TypeScript（`tsc --noEmit`）、Stylelint（`--formatter json`）
  - 统一转换为 Issue 格式，与内置规则一起输出
  - CLI 新增 `--external` 参数，自动检测可用工具并执行
  - 关键 TS 错误码分类（TS2322/2345/2531 等为 critical，未使用变量为 warning）
- **规则扩增**：hooks 模块 6 → 10 条
  - `hooks-memo-deps`: useMemo/useCallback 缺少依赖数组或空依赖
  - `hooks-callback-misuse`: 简单回调不需要 useCallback 包裹
  - `hooks-missing-key`: 列表渲染 map() 缺少 key 属性
  - `hooks-conditional`: Hook 在条件/循环中调用（违反 Hook 规则）
- **现代框架支持**：新增 Svelte 模块（`--module svelte`）
  - `svelte-reactive-statement`: $: 响应式语句使用未声明变量
  - `svelte-store-unsubscribe`: Store 订阅未取消（内存泄漏）
  - `svelte-props-mutate`: 直接修改 props（Svelte props 只读）
  - `svelte-event-modifier`: Svelte 5 已弃用的事件修饰符
  - Framework 类型扩展：svelte | solidjs | astro
  - project-detector 自动检测 svelte / solid-js / astro 依赖
- **总计规则数**：47 → 51 条内置规则 + 3 个外部工具集成
- **测试覆盖**：129 个单元测试全部通过

---

### 📍 未来路线图（Roadmap Preview）

> 基于 [CodeGraph](https://github.com/colbymchenry/codegraph) 等优秀工具的借鉴分析，frontend-guardian 的下一步方向：

**v3.7.0 — 增量索引与影响分析**
- 预索引建立：首次扫描后建立 `.frontend-guardian/index/` 本地索引，后续扫描秒级响应
- 文件监听自动同步：`--watch-index` 集成 FSEvents/inotify/ReadDirectoryChanges
- 框架路由自动解析：React Router / Vue Router / Next.js / Nuxt 路由配置自动识别
- 调用图分析：hooks 调用链检测深层嵌套反模式

**v3.8.0 — MCP Server 与 AI Agent 集成**
- `fg-core --mcp` 启动 MCP Server，暴露 scan / fix / e2e-run 工具
- Cursor / Copilot / Claude Code 兼容，自然语言触发治理
- 上下文感知扫描：Agent 传入当前编辑文件，只扫描相关上下文

**v3.9.0 — 智能测试推荐**
- 修改影响分析：修改组件/页面时自动分析依赖的 E2E 测试
- `fg-core --recommend-tests` 输出"本次变更建议运行的测试列表"
- PR 阶段增量测试：CI 中只运行受影响的测试套件

---

## 规则文件结构

```
frontend-guardian/
├── SKILL.md                              # AI 智能体 Skill 入口（触发条件 + 指令路由，兼容 Claude Code / Codex / Kimi Code / Qode / Gemini / Hermes）
├── README.md                             # 本文档
├── .frontend-guardian.yml                # 配置模板
├── rules/
│   ├── react.md                          # React 通用规则
│   ├── vue.md                            # Vue 通用规则
│   ├── harmony.md                        # 鸿蒙 ArkTS/ArkUI 规则
│   ├── uniapp.md                         # UniApp 跨端规则
│   ├── taro.md                           # Taro 跨端规则
│   ├── nextjs.md                         # Next.js 专项
│   ├── nuxt.md                           # Nuxt 专项
│   ├── wechat-mp.md                      # 微信小程序原生
│   ├── alipay-mp.md                      # 支付宝小程序
│   ├── douyin-mp.md                      # 抖音小程序
│   ├── flutter.md                        # Flutter 规则
│   ├── react-native.md                   # React Native 规则
│   ├── antd.md                           # Ant Design 组件规则
│   ├── element-plus.md                   # Element Plus 组件规则
│   ├── mui.md                            # Material UI 规则
│   ├── i18n.md                           # 国际化通用规则
│   └── platform-common.md                # 多端通用规则
├── scripts/
│   ├── full-scan.sh                      # 全量扫描入口
│   ├── scan-i18n.sh                      # i18n 扫描脚本
│   ├── scan-components.sh                # 组件规范扫描
│   ├── scan-hooks.sh                     # Hooks 检查脚本
│   ├── scan-platform.sh                  # 多端适配扫描
│   ├── extract-i18n.sh                   # i18n 硬编码自动提取
│   └── translate.sh                      # 自动翻译缺失 key
├── .github/
│   └── workflows/
│       └── frontend-guardian.yml         # GitHub Actions 流水线
└── examples/
    ├── aliyun-flow.yml                   # 阿里云效 Flow 流水线
    ├── tencent-coding.yml                # 腾讯云 CODING 流水线
    ├── azure-pipelines.yml               # Azure DevOps 流水线
    └── Jenkinsfile                       # Jenkins 流水线
```

---

## 与其他 Skill 的关系

| Skill | 职责边界 | 协作方式 |
| ----- | -------- | -------- |
| `code-review-assistant` | 通用代码审查（安全、性能、正确性） | frontend-guardian 调用其通用检查作为基础，叠加前端专项 |
| `api-type-sync` | 前后端接口类型同步 | frontend-guardian 检测接口文案是否已 i18n 化 |
| `frontend-perf` | 前端性能深度分析 | frontend-guardian 做初步性能筛查，复杂场景推荐调用 frontend-perf |
| `taste-skill` | 设计/视觉方向 | 不重叠 |

---

## License

MIT
