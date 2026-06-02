# frontend-guardian — 前端统一治理助手

## 触发条件

当满足以下任一条件时，自动激活本 Skill：

- 用户输入 `/frontend-guardian`
- 检测到项目中的 `i18n/`、`locales/`、`lang/`、`messages/` 目录
- 检测到 `vue-i18n`、`react-intl`、`i18next`、`@dcloudio/uni-i18n` 依赖
- 检测到 `antd`、`element-plus`、`@mui/material`、`@nutui/nutui-react` 等组件库
- 检测到 React / Vue 项目中的 hooks / composables 文件
- 检测到小程序项目：`app.json`、`project.config.json`、`manifest.json`
- 检测到鸿蒙项目：`entry/src/main/ets/`、`hvigorfile.ts`
- 检测到多端框架：`uni-app`、`taro`、`remax`、`flutter`、`react-native`
- 用户询问 i18n、组件规范、hooks 最佳实践、多端适配相关问题
- 用户需要在项目中初始化 AI 上下文文件（`--init-ai`）

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

## 指令路由

### 全量扫描（推荐）

```
/frontend-guardian                              # 自动检测技术栈，执行全端扫描
/frontend-guardian --scan                       # 全量治理扫描（9 大模块）
/frontend-guardian --scan --gate                # CI 门禁模式（发现问题退出码非0）
/frontend-guardian --scan --staged              # 仅检查 git staged 文件
/frontend-guardian --scan --since HEAD~3        # 检查最近 3 个 commit
/frontend-guardian --scan --diff main...feature # 检查 PR diff 范围
/frontend-guardian --scan --fix                 # 扫描并自动修复可修复的问题
/frontend-guardian --scan --json                # JSON 格式输出
/frontend-guardian --scan --output report.md    # 指定报告输出路径
/frontend-guardian --scan --no-cluster          # 禁用 Issue 聚类
```

### 单模块扫描

```
/frontend-guardian --module i18n            # i18n 治理（硬编码、缺失 key、死 key）
/frontend-guardian --module component       # 组件医生（反模式、token、性能）
/frontend-guardian --module hooks           # Hooks / Composables 检查
/frontend-guardian --module platform        # 多端平台适配
/frontend-guardian --module performance     # 性能优化
/frontend-guardian --module security        # 安全扫描
/frontend-guardian --module a11y            # 可访问性
/frontend-guardian --module naming          # 命名规范
/frontend-guardian --module cross-file      # 跨文件分析
```

单模块支持 `--fix`、`--json`、`--severity`、`--staged`、`--diff` 参数：
```
/frontend-guardian --module naming --fix
/frontend-guardian --module i18n --severity warning --json
/frontend-guardian --module hooks --staged
/frontend-guardian --module security --diff main...feature
```

### 一键初始化脚手架

```
/frontend-guardian --init-scaffold ./my-project                    # 自动检测技术栈并初始化
/frontend-guardian --init-scaffold ./my-project --stack react      # 指定 React 技术栈
/frontend-guardian --init-scaffold ./my-project --stack uniapp     # 指定 UniApp 技术栈
/frontend-guardian --init-scaffold ./my-project --force            # 强制覆盖已有文件
/frontend-guardian --init-scaffold ./my-project --skip-install     # 跳过 npm install
```

初始化内容：
- 技术栈对应的目录结构（components / hooks / services / locales / constants / types）
- `.frontend-guardian.yml` 治理配置文件
- 示例文件（i18n 工具函数、请求封装、常量定义、语言包模板）
- `.gitignore`
- AI 上下文文件（调用 init-ai-context.sh 自动生成）
- 推荐依赖自动安装

### AI 上下文初始化

```
/frontend-guardian --init-ai                    # 生成通用 AI_CONTEXT.md
/frontend-guardian --init-ai claude             # 生成 .claude/CLAUDE.md
/frontend-guardian --init-ai cursor             # 生成 .cursorrules
/frontend-guardian --init-ai copilot            # 生成 .github/copilot-instructions.md
/frontend-guardian --init-ai all                # 同时生成所有格式
/frontend-guardian --scan --init-ai claude      # 扫描后自动更新 AI 上下文
```

### 组合命令

```
# 提交前检查（仅 staged 文件）
/frontend-guardian --scan --staged

# PR diff 检查
/frontend-guardian --scan --diff main...feature

# 上线前全量扫描 + 门禁 + 更新 AI 上下文
/frontend-guardian --scan --gate --output report.md --init-ai claude

# 指定端类型扫描
/frontend-guardian --module platform --mp-type wechat
/frontend-guardian --module platform --mobile-type h5
```

## 严重级别定义

| 级别 | 图标 | 说明 | 处理要求 |
| ---- | ---- | ---- | -------- |
| Critical | 🔴 | 可能导致线上故障或严重体验问题 | 必须修复 |
| Warning | 🟡 | 潜在风险或不符合最佳实践 | 建议修复 |
| Suggestion | 💡 | 优化建议 | 可选处理 |

## 输出格式

终端输出包含：
1. 检测到的项目类型
2. 各模块检查结果统计
3. 按严重级别分组的问题列表
4. 修复建议（含代码 diff）
5. 报告文件路径

Markdown 报告包含：
- 执行摘要与统计图表
- 按文件分组的问题详情
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
