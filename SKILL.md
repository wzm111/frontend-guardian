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

### 全量扫描

```
/frontend-guardian                          # 自动检测技术栈，执行全端扫描
/frontend-guardian --scan                   # 全量治理扫描
/frontend-guardian --scan --gate            # CI 门禁模式
/frontend-guardian --scan --staged          # 仅检查 git staged 文件
/frontend-guardian --scan --since HEAD~3    # 检查最近 3 个 commit
```

### i18n 治理

```
/frontend-guardian --i18n                   # 扫描硬编码文案
/frontend-guardian --i18n-extract           # 自动提取硬编码到语言包
/frontend-guardian --i18n-missing           # 检测缺失 key
/frontend-guardian --i18n-dead              # 扫描未使用的 key
/frontend-guardian --i18n-lint              # 命名规范检查
/frontend-guardian --i18n-translate         # 自动翻译缺失语言
/frontend-guardian --i18n --fix             # 自动修复
```

### 组件医生

```
/frontend-guardian --component              # 组件反模式检测
/frontend-guardian --component-token        # 主题/token 一致性检查
/frontend-guardian --component-a11y         # 可访问性检查
/frontend-guardian --component-perf         # 性能陷阱检测
/frontend-guardian --component-upgrade      # 组件库版本升级影响分析
```

### Hooks / Composables 检查

```
/frontend-guardian --hooks                  # React Hooks 全量检查
/frontend-guardian --hooks-closure          # 闭包陷阱专项
/frontend-guardian --hooks-custom           # 自定义 Hook 规范
/frontend-guardian --composables            # Vue Composables 检查
/frontend-guardian --hooks-state            # 状态提升建议
```

### 多端平台适配

```
/frontend-guardian --platform               # 多端适配全量检查
/frontend-guardian --platform-mp            # 小程序专项
/frontend-guardian --platform-mp --mp-type wechat    # 指定微信小程序
/frontend-guardian --platform-mobile        # 移动端性能与体验
/frontend-guardian --platform-harmony       # 鸿蒙 ArkTS/ArkUI 规范
/frontend-guardian --platform-responsive    # 响应式断点检查
```

### AI 上下文初始化

在目标项目中生成 AI 智能体上下文文件，让不同智能体理解项目技术栈和规范：

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
# 提交前检查：i18n + 组件 + hooks
/frontend-guardian --i18n --component --hooks

# 上线前全量扫描 + 门禁 + 更新 AI 上下文
/frontend-guardian --scan --gate --output report.md --init-ai claude

# 指定端类型扫描
/frontend-guardian --platform-mp --mp-type wechat
/frontend-guardian --platform-mobile --mobile-type h5
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

### 性能优化

```
/frontend-guardian --performance              # 性能规则全量扫描
/frontend-guardian --perf-waterfall           # 请求瀑布检测
/frontend-guardian --perf-bundle              # 包体积分析
/frontend-guardian --perf-memo               # memoization 建议
```

### 可访问性 (a11y)

```
/frontend-guardian --a11y                     # 可访问性全量扫描
/frontend-guardian --a11y-img                 # 图片 alt 检查
/frontend-guardian --a11y-form               # 表单 label 检查
/frontend-guardian --a11y-contrast           # 颜色对比度检查
```

### 安全扫描

```
/frontend-guardian --security                 # 安全规则全量扫描
/frontend-guardian --sec-xss                  # XSS 漏洞检测
/frontend-guardian --sec-eval                 # eval / new Function 检测
/frontend-guardian --sec-secrets              # 硬编码密钥检测
```

### 代码库瘦身 (Knip)

```
/frontend-guardian --knip                     # 扫描未使用依赖/导出/文件
/frontend-guardian --scan --knip              # 全量扫描 + 代码库瘦身
```

## 与其他 Skill 协作

- 调用 `code-review-assistant` 获取通用代码审查结果作为基础
- 调用 `api-type-sync` 检测接口文案是否已 i18n 化
- 调用 `frontend-perf` 进行深度性能分析（本 Skill 只做初步筛查）
- 调用 `frontend-design` / `web-design-guidelines` 辅助 UI/UX 设计决策
  - 组件库升级时，请求 design skill 提供新组件模板
  - 主题/token 重构时，请求 design skill 输出 design system 规范
