# frontend-guardian — 前端统一治理助手

> 聚合国际化治理、组件规范、Hooks 最佳实践、多端适配检查的前端开发一体化 Skill。
> **当前版本：v2.3.0**
> 覆盖 PC Web、H5、小程序（微信/支付宝/抖音）、iOS、Android、鸿蒙 HarmonyOS。

## 核心能力矩阵

按重要程度排序：

| 维度 | 能力 | 命令 | 多端支持 | 优先级 |
| ---- | ---- | ---- | -------- | ------ |
| 🧠 **智能化** | 深度技术栈检测 + Issue 聚类 + 增量扫描 | `--scan --staged/--diff` | ✅ 全端 | ⭐⭐⭐⭐⭐ |
| 🚀 **脚手架** | 一键初始化项目 + 治理配置 | `--init-scaffold` | ✅ 全端 | ⭐⭐⭐⭐⭐ |
| 🔍 **full-scan** | 全量治理扫描（9 大模块） | `--scan` | ✅ 全端 | ⭐⭐⭐⭐⭐ |
| | CI 门禁模式（阻断流水线） | `--scan --gate` | ✅ 全端 | ⭐⭐⭐⭐⭐ |
| 🌍 **i18n-governance** | 硬编码文案 / 缺失 key / 死 key | `--module i18n` | ✅ 全端 | ⭐⭐⭐⭐☆ |
| 🏥 **component-doctor** | 反模式 / token / 性能 / 可访问性 | `--module component` | ✅ 全端 | ⭐⭐⭐⭐☆ |
| ⚡ **hook-checker** | useEffect / 闭包 / 自定义 Hook | `--module hooks` | React / Vue | ⭐⭐⭐⭐⭐ |
| 📱 **platform-guard** | 小程序 / 移动端 / 鸿蒙 / 响应式 | `--module platform` | 多端专项 | ⭐⭐⭐⭐☆ |
| 🔧 **性能优化** | 请求瀑布 / 懒加载 / 整库导入 / memo | `--module performance` | ✅ 全端 | ⭐⭐⭐⭐☆ |
| 🛡️ **安全扫描** | XSS / eval / 密钥泄露 / CORS | `--module security` | ✅ 全端 | ⭐⭐⭐⭐☆ |
| ♿ **可访问性** | alt / label / 对比度 / ARIA | `--module a11y` | ✅ 全端 | ⭐⭐⭐⭐☆ |
| 🏷️ **命名规范** | 类 / 接口 / 函数 / 变量 / 文件名 | `--module naming` | ✅ 全端 | ⭐⭐⭐☆☆ |
| 🔗 **跨文件分析** | props 检查 / 重复代码 / Context | `--module cross-file` | ✅ 全端 | ⭐⭐⭐☆☆ |
| 🧹 **代码库瘦身** | 未使用依赖/导出/文件（Knip） | `--knip` | ✅ 全端 | ⭐⭐⭐☆☆ |

## 安装

```bash
cp -r frontend-guardian /your/project/.claude/skills/
```

## 使用方式

### 一键初始化脚手架

```bash
# 自动检测技术栈并创建项目结构
frontend-guardian --init-scaffold ./my-project

# 指定技术栈
frontend-guardian --init-scaffold ./my-project --stack react
frontend-guardian --init-scaffold ./my-project --stack uniapp
frontend-guardian --init-scaffold ./my-project --stack harmony

# 强制覆盖已有文件
frontend-guardian --init-scaffold ./my-project --stack nextjs --force
```

> **路径说明**：`./my-project` 表示在**当前运行目录**下创建 `my-project` 子目录。支持相对路径（`../my-project`）和绝对路径（`/home/user/my-project`）。
>
> | 命令示例 | 创建位置 |
> | -------- | -------- |
> | `--init-scaffold ./my-project` | 当前目录下的 `my-project/` |
> | `--init-scaffold ../my-project` | 父目录下的 `my-project/` |
> | `--init-scaffold /home/user/my-project` | 绝对路径 `/home/user/my-project/` |

脚手架会自动完成：
- 创建技术栈对应的目录结构（src/components / hooks / services / locales 等）
- 生成 `.frontend-guardian.yml` 完整治理配置
- 生成示例文件（i18n 工具函数、请求封装、API 常量、双语语言包）
- 生成 `.gitignore`
- 初始化 AI 上下文文件
- 安装推荐依赖（react-i18next / vue-i18n / typescript / eslint 等）

支持的技术栈：`react` `vue` `nextjs` `nuxt` `uniapp` `taro` `wechat-mp` `harmony`

---

### 快速命令

```text
# 全量扫描（推荐）
/frontend-guardian                          # 自动检测技术栈，执行全端扫描
/frontend-guardian --scan                   # 全量治理扫描（9 大模块）
/frontend-guardian --scan --gate            # CI 门禁模式（发现问题退出码非0）
/frontend-guardian --scan --staged          # 仅检查 git staged 文件
/frontend-guardian --scan --since HEAD~3    # 检查最近 3 个 commit
/frontend-guardian --scan --diff main...feature  # 检查 PR diff 范围
/frontend-guardian --scan --fix             # 扫描并自动修复
/frontend-guardian --scan --json            # JSON 格式输出
/frontend-guardian --scan --no-cluster      # 禁用 Issue 聚类（默认开启）

# 单模块扫描
/frontend-guardian --module i18n            # i18n 治理（硬编码、缺失 key、死 key）
/frontend-guardian --module component       # 组件医生（反模式、token、性能）
/frontend-guardian --module hooks           # Hooks / Composables 检查
/frontend-guardian --module platform        # 多端平台适配
/frontend-guardian --module performance     # 性能优化
/frontend-guardian --module security        # 安全扫描
/frontend-guardian --module a11y            # 可访问性
/frontend-guardian --module naming          # 命名规范
/frontend-guardian --module cross-file      # 跨文件分析

# 初始化
/frontend-guardian --init-scaffold ./my-project
/frontend-guardian --init-ai claude
```

### 组合命令

```text
# 提交前检查：i18n + 组件 + hooks
/frontend-guardian --i18n --component --hooks

# 上线前全量扫描 + 门禁 + AI 上下文更新
/frontend-guardian --scan --gate --output report.md --init-ai claude

# 仅检查当前修改的文件
/frontend-guardian --scan --staged

# 自动修复可修复的问题
/frontend-guardian --scan --fix
/frontend-guardian --component --fix
/frontend-guardian --naming --fix

# 初始化 AI 上下文（让 AI 理解项目技术栈）
/frontend-guardian --init-ai claude      # Claude Code: .claude/CLAUDE.md
/frontend-guardian --init-ai cursor      # Cursor: .cursorrules
/frontend-guardian --init-ai copilot     # GitHub Copilot: .github/copilot-instructions.md
/frontend-guardian --init-ai all         # 同时生成所有格式

# 指定端类型扫描
/frontend-guardian --platform-mp --mp-type wechat
/frontend-guardian --platform-mobile --mobile-type h5
```

### 参数说明

| 参数 | 说明 | 默认值 |
| ---- | ---- | ------ |
| `--output <file>` | 报告输出路径 | `./frontend-guardian-report.md` |
| `--gate` | 门禁模式，发现问题时退出码 1 | false |
| `--staged` | 仅检查 git staged 文件 | false |
| `--since <ref>` | 检查指定 commit 以来的变更 | `HEAD~1` |
| `--diff <range>` | git diff 范围，如 `main...feature` | - |
| `--fix` | 自动修复可修复的问题 | false |
| `--json` | 以 JSON 格式输出原始扫描结果 | false |
| `--no-cluster` | 禁用 Issue 聚类 | false |
| `--severity <level>` | 最低输出严重级别 | `warning` |
| `--module <name>` | 扫描模块：`i18n` / `performance` / `a11y` / `security` / `naming` / `cross-file` / `component` / `hooks` / `platform` / `all` | `all` |
| `--init-ai <agent>` | 初始化 AI 上下文：`claude` / `cursor` / `copilot` / `all` | 不初始化 |
| `--init-scaffold` | 一键初始化项目脚手架 | - |

### AI 上下文初始化

在目标项目中自动生成 AI 智能体上下文文件，让 Claude / Cursor / Copilot 等智能体理解项目技术栈和规范：

```text
# 为 Claude Code 生成 .claude/CLAUDE.md
/frontend-guardian --init-ai claude

# 为 Cursor 生成 .cursorrules
/frontend-guardian --init-ai cursor

# 为 GitHub Copilot 生成 .github/copilot-instructions.md
/frontend-guardian --init-ai copilot

# 同时生成所有格式（+ 通用 AI_CONTEXT.md）
/frontend-guardian --init-ai all

# 扫描后自动更新 AI 上下文（包含扫描结果）
/frontend-guardian --scan --init-ai claude
```

生成的 AI 上下文文件包含：
- 项目技术栈概况（框架、组件库、目标平台、版本信息）
- 前端治理规则摘要（基于检测到的技术栈自动提取对应 rules）
- 最近一次扫描结果统计
- 项目目录结构约定
- AI 助手指令（代码风格、组件规范、状态管理、国际化等）
- 额外引用的项目文档（在 `.frontend-guardian.yml` 中配置 `aiContext.includeFiles`）

**配置示例**（`.frontend-guardian.yml`）：

```yaml
aiContext:
  agent: claude                    # 默认智能体类型
  includeFiles:                    # 额外引用的文档
    - README.md
    - CONTRIBUTING.md
    - docs/architecture.md
  autoUpdate: true                 # 扫描后自动更新
```

---

## 触发条件

Skill 在以下场景自动激活：

- 用户输入 `/frontend-guardian`
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
/frontend-guardian --scan --gate
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

## 规则文件结构

```
frontend-guardian/
├── SKILL.md                              # Claude Code 入口（触发条件 + 指令路由）
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
