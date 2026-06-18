# frontend-guardian — 前端统一治理助手（跨 AI 智能体 Skill）

> **定位**：聚合国际化治理、组件规范、Hooks 最佳实践、多端适配检查、E2E 测试治理、页面健康检查、增量索引与影响分析的前端开发一体化 Skill。
> **兼容性**：本 Skill 采用标准 slash command 格式，设计目标为跨 AI 智能体兼容（Claude Code、Codex、Kimi Code、Qode、Gemini CLI、Hermes 等）。
>
> ⚠️ **诚实说明**：目前仅 Claude Code 的 Skill 系统经过实际验证。其他智能体的 Skill/插件机制、目录结构、文件格式均需根据各自生态确认。设计层面（标准 slash command + 纯文本规则 + 独立 CLI）是通用的，但实际安装路径和加载机制请查阅对应智能体的官方文档。

## 触发条件

当满足以下任一条件时，自动激活本 Skill：

- 用户输入 `/frontend-guardian`（各智能体通用的 slash command）
- 检测到项目中的 `i18n/`、`locales/`、`lang/`、`messages/` 目录
- 检测到 `vue-i18n`、`react-intl`、`i18next`、`@dcloudio/uni-i18n` 依赖
- 检测到 `antd`、`element-plus`、`@mui/material`、`@nutui/nutui-react` 等组件库
- 检测到 React / Vue 项目中的 hooks / composables 文件
- 检测到小程序项目：`app.json`、`project.config.json`、`manifest.json`
- 检测到鸿蒙项目：`entry/src/main/ets/`、`hvigorfile.ts`
- 检测到多端框架：`uni-app`、`taro`、`remax`、`flutter`、`react-native`
- 用户询问 i18n、组件规范、hooks 最佳实践、多端适配相关问题

## 技术栈检测

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
| `svelte` | Svelte | `rules/svelte.md` |
| `solid-js` | SolidJS | `rules/solidjs.md` |
| `astro` | Astro | `rules/astro.md` |

## 指令路由（8 个核心命令）

所有命令通过 `full-scan.sh` 统一入口执行，结果自动合并 AST + Bash + Knip：

```
# 1️⃣ 智能全量扫描（默认）
/frontend-guardian
/frontend-guardian --scan

# 2️⃣ 提交前检查（仅 staged 文件）
/frontend-guardian --scan --staged

# 3️⃣ 扫描并自动修复
/frontend-guardian --scan --fix

# 4️⃣ CI 门禁模式
/frontend-guardian --scan --gate

# 5️⃣ JSON 统一输出（含 AST + Bash + Knip）
/frontend-guardian --scan --json

# 6️⃣ 初始化项目配置
/frontend-guardian --init-config

# 7️⃣ 安装 Git hook
/frontend-guardian --install-hooks
/frontend-guardian --install-hooks --install-hooks-type pre-push

# 8️⃣ 智能测试推荐（PR 阶段增量测试）
/frontend-guardian --recommend-tests
/frontend-guardian --recommend-tests --staged
/frontend-guardian --recommend-tests --json
```

### 单模块精细扫描

如需只扫描特定模块（直接调用 AST 引擎，速度更快）：

```
/frontend-guardian --module i18n            # i18n 治理
/frontend-guardian --module component       # 组件医生
/frontend-guardian --module hooks           # Hooks / Composables
/frontend-guardian --module platform        # 多端平台适配
/frontend-guardian --module performance     # 性能优化
/frontend-guardian --module security        # 安全扫描
/frontend-guardian --module a11y            # 可访问性
/frontend-guardian --module naming          # 命名规范
/frontend-guardian --module cross-file      # 跨文件分析
/frontend-guardian --module svelte          # Svelte 专项检查
/frontend-guardian --module e2e            # E2E 测试治理
```

单模块支持 `--fix`、`--json`、`--severity`、`--staged`、`--diff`、`--external` 参数：
```
/frontend-guardian --module naming --fix
/frontend-guardian --module i18n --severity warning --json
/frontend-guardian --module hooks --staged
/frontend-guardian --module security --diff main...feature
```

### 常用组合

```
# 修复预览（展示 diff 不写入）
/frontend-guardian --scan --fix --dry-run

# JSON 输出 + 门禁
/frontend-guardian --scan --gate --json

# 指定严重级别 + 禁用聚类
/frontend-guardian --scan --severity warning --no-cluster

# 运行外部工具（ESLint / TypeScript / Stylelint）
/frontend-guardian --scan --external

# Watch 模式（开发时自动扫描）
/frontend-guardian --scan --watch

# 启动 MCP Server（供 AI Agent 调用）
/frontend-guardian --mcp

# 智能测试推荐（PR 阶段只跑相关测试）
/frontend-guardian --recommend-tests --staged --json

# SARIF 报告输出（GitHub Security tab）
/frontend-guardian --scan --sarif report.sarif

# Baseline 模式（仅报告新增问题）
/frontend-guardian --scan --baseline baseline.json

# 团队共享 baseline（远程 URL）
/frontend-guardian --scan --team-baseline https://team.example.com/baseline.json

# 扫描后发送通知（飞书/钉钉/企业微信/Slack）
/frontend-guardian --scan --notify

# 为 issue 推断责任人（CODEOWNERS）
/frontend-guardian --scan --assign

# 扫描策略分级（strict / standard / loose）
/frontend-guardian --scan --strategy strict
/frontend-guardian --scan --strategy loose

# 生成合规报告（SOC2 / ISO27001 风格）
/frontend-guardian --scan --compliance compliance-report.md

# 扫描后上报到治理看板服务器
/frontend-guardian --scan --server http://localhost:3456

# 启动治理看板服务端
/frontend-guardian --serve
# 或独立启动
fg-server --port 3456 --cors "*"

# E2E 测试覆盖缺口检测
/frontend-guardian --e2e-detect-gaps
# JSON 输出
/frontend-guardian --e2e-detect-gaps --json

# 运行 Playwright E2E 测试（skill 作为统一入口）
/frontend-guardian --e2e-run
# JSON 输出
/frontend-guardian --e2e-run --json

# 页面健康检查（运行时浏览器验证）
/frontend-guardian --page-health --serve "npm run dev" --port 5173
/frontend-guardian --page-health --base-url http://localhost:3000
/frontend-guardian --page-health --base-url http://localhost:3000 --routes /login,/dashboard
# 调整并发数（默认 3 个 page 并行）
/frontend-guardian --page-health --base-url http://localhost:3000 --page-health-concurrency 5

# 生成 CI 配置（GitHub Actions）
/frontend-guardian --init-ci
```

## MCP Server 集成

`frontend-guardian` 支持以 MCP（Model Context Protocol）Server 模式运行，让 Claude Code、Cursor、Copilot 等 AI Agent 直接调用治理能力：

```
/frontend-guardian --mcp
```

启动后通过 stdio 暴露以下工具：

| 工具 | 说明 |
| ---- | ---- |
| `scan` | 运行治理扫描，可指定模块、severity、staged 等 |
| `fix` | 扫描并自动修复，支持 `dryRun` 预览 |
| `e2e-run` | 运行 Playwright E2E 测试并返回失败 Issue |
| `e2e-detect-gaps` | 检测 E2E 覆盖缺口 |
| `list-rules` | 列出可用规则 |
| `scan-file` | 单文件快速扫描 |
| `page-health` | 页面健康检查（需 Playwright） |
| `ai-fix` | 为无自动修复的问题生成 AI 建议 |
| `get-project-meta` | 获取检测到的项目元数据 |
| `index-project` | 查询/构建项目索引 |
| `recommend-tests` | 基于变更文件智能推荐需要运行的测试 |

Cursor / Copilot 配置示例（`.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "frontend-guardian": {
      "command": "npx",
      "args": ["frontend-guardian-core", ".", "--mcp"]
    }
  }
}
```

## 严重级别定义

| 级别 | 图标 | 说明 | 处理要求 |
| ---- | ---- | ---- | -------- |
| Critical | 🔴 | 可能导致线上故障或严重体验问题 | 必须修复 |
| Warning | 🟡 | 潜在风险或不符合最佳实践 | 建议修复 |
| Suggestion | 💡 | 优化建议 | 可选处理 |

## 输出格式

**终端输出**：
1. 检测到的项目类型
2. 各模块检查结果统计
3. 按严重级别分组的问题列表
4. 修复建议（含代码 diff）

**统一 JSON 输出**（`--json`）：
```json
{
  "summary": {
    "timestamp": "2026-06-03T10:00:00Z",
    "project": "/path/to/project",
    "stack": "React + Ant Design",
    "totalFiles": 120,
    "issuesBySeverity": { "critical": 3, "warning": 12, "suggestion": 5 },
    "duration": 2340
  },
  "modules": {
    "i18n": { "engine": "ast", "total": 8, "issues": { "critical": [...], ... } },
    "i18n-治理": { "engine": "bash", "total": 3, "issues": { "critical": [...], ... } }
  },
  "external": {
    "knip": { "unusedDeps": 3, "unusedExports": 5 }
  }
}
```

**Markdown 报告**：
- 执行摘要与统计图表
- 按引擎分组的问题详情（AST + Bash）
- 自动修复代码片段
- 修复优先级排序

## CI 门禁配置

项目根目录创建 `.frontend-guardian.yml`：

```yaml
gate:
  critical:
    max: 0
  warning:
    max: 10
  suggestion:
    max: 20
```

## 与其他 Skill 协作

- 调用 `code-review-assistant` 获取通用代码审查结果作为基础
- 调用 `api-type-sync` 检测接口文案是否已 i18n 化
- 调用 `frontend-perf` 进行深度性能分析（本 Skill 只做初步筛查）
