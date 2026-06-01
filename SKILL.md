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

### 一键初始化脚手架

为新项目或现有项目创建符合治理规范的目录结构和配置文件：

```
/frontend-guardian --init-scaffold ./my-project                    # 自动检测技术栈并初始化
/frontend-guardian --init-scaffold ./my-project --stack react      # 指定 React 技术栈
/frontend-guardian --init-scaffold ./my-project --stack uniapp     # 指定 UniApp 技术栈
/frontend-guardian --init-scaffold ./my-project --force            # 强制覆盖已有文件
/frontend-guardian --init-scaffold ./my-project --skip-install     # 跳过 npm install
```

初始化内容：
- 技术栈对应的目录结构（components / hooks / services / locales / constants / types）
- `.frontend-guardian.yml` 治理配置文件（含 i18n / 命名规范 / 门禁 / AI 上下文配置）
- 示例文件（i18n 工具函数、请求封装、常量定义、语言包模板）
- `.gitignore`（含 build / IDE / 缓存 / Frontend Guardian 报告忽略）
- AI 上下文文件（调用 init-ai-context.sh 自动生成）
- 推荐依赖自动安装（i18n 库、TypeScript、ESLint、Prettier）

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

### 页面设计规范（调用 design skill）

当需要创建新页面或重构现有页面时，frontend-guardian 会调用 `state skill` 或 `frontend-design` 提供设计规范：

```
/frontend-guardian --design-page                    # 页面设计规范（自动路由到 design skill）
/frontend-guardian --design-page "/users/list"      # 为指定路由页面输出设计规范
/frontend-guardian --design-system                  # 生成 Design System Token 规范
/frontend-guardian --design-token                   # 主题 Token 一致性检查
/frontend-guardian --design-review                  # 审查现有页面的设计合规性
```

协作场景：
1. **新建页面**：frontend-guardian 扫描确认技术栈 → 调用 design skill 输出页面布局/组件/交互规范 → 生成符合规范的页面代码
2. **组件库升级**：frontend-guardian 检测版本变化 → 调用 design skill 提供新组件 API 和视觉规范 → 输出迁移方案
3. **主题/token 重构**：frontend-guardian 扫描现有 token 使用 → 调用 design skill 输出 Design System 规范 → 自动生成 token 替换脚本
4. **设计审查**：frontend-guardian 检测组件使用是否合规 → 调用 design skill 审查视觉层 → 联合输出整改报告

### 命名规范与代码风格

```
/frontend-guardian --naming                       # 命名规范全量扫描
/frontend-guardian --naming-class                 # 类名 PascalCase 检查
/frontend-guardian --naming-function              # 函数/方法 camelCase 检查
/frontend-guardian --naming-const                 # 常量 UPPER_SNAKE_CASE 检查
/frontend-guardian --naming-file                  # 文件/文件夹 kebab-case 检查
```

### 跨文件公共部分分析

```
/frontend-guardian --cross-file                   # 跨文件公共部分全量分析
/frontend-guardian --cross-unused-props           # 父子组件未使用 props 检测
/frontend-guardian --cross-missing-props          # 子组件缺失必传 props 检测
/frontend-guardian --cross-context                # Context 过度使用检测
/frontend-guardian --cross-duplicate              # 兄弟组件重复代码检测
/frontend-guardian --cross-extract                # 公共逻辑提取建议
```
