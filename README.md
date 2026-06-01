# frontend-guardian — 前端统一治理助手

> 聚合国际化治理、组件规范、Hooks 最佳实践、多端适配检查的前端开发一体化 Skill。
> 覆盖 PC Web、H5、小程序（微信/支付宝/抖音）、iOS、Android、鸿蒙 HarmonyOS。

## 核心能力矩阵

| 模块 | 能力 | 命令 | 多端支持 |
| ---- | ---- | ---- | -------- |
| 🌍 **i18n-governance** | 硬编码文案扫描与自动提取 | `--i18n` / `--i18n-extract` | ✅ 全端 |
| | 语言包缺失 key 检测 | `--i18n-missing` | ✅ 全端 |
| | 死 key 清理 | `--i18n-dead` | ✅ 全端 |
| | 命名规范检查 | `--i18n-lint` | ✅ 全端 |
| | 自动翻译填充 | `--i18n-translate` | ✅ 全端 |
| 🏥 **component-doctor** | 组件反模式检测 | `--component` | ✅ 全端 |
| | 主题/token 一致性 | `--component-token` | ✅ 全端 |
| | 可访问性检查 | `--component-a11y` | ✅ 全端 |
| | 性能陷阱检测 | `--component-perf` | ✅ 全端 |
| | 版本升级影响分析 | `--component-upgrade` | ✅ 全端 |
| ⚡ **hook-checker** | useEffect 依赖检查 | `--hooks` | React / RN / 鸿蒙 ArkUI |
| | 闭包陷阱检测 | `--hooks-closure` | React / RN / 鸿蒙 ArkUI |
| | 自定义 Hook 规范 | `--hooks-custom` | React / RN / 鸿蒙 ArkUI |
| | Vue Composables 检查 | `--composables` | Vue / 小程序 Vue3 |
| | 状态提升建议 | `--hooks-state` | React / Vue |
| 📱 **platform-guard** | 多端适配检查 | `--platform` | 多端专项 |
| | 小程序专有规则 | `--platform-mp` | 微信小程序 / 支付宝 / 抖音 |
| | 移动端性能检查 | `--platform-mobile` | H5 / App / 小程序 |
| | 鸿蒙 ArkTS/ArkUI 规范 | `--platform-harmony` | HarmonyOS |
| | 响应式断点检查 | `--platform-responsive` | PC / H5 |
| 🔍 **full-scan** | 全量治理扫描 | `--scan` | ✅ 全端 |
| | CI 门禁模式 | `--scan --gate` | ✅ 全端 |

## 安装

```bash
cp -r frontend-guardian /your/project/.claude/skills/
```

## 使用方式

### 快速命令

```text
/frontend-guardian                          # 自动检测技术栈，执行全端扫描
/frontend-guardian --scan                   # 全量治理扫描（i18n + 组件 + hooks + 平台适配）
/frontend-guardian --scan --gate            # CI 门禁模式（发现问题退出码非0）

# i18n 治理
/frontend-guardian --i18n                   # 扫描硬编码文案，输出提取建议
/frontend-guardian --i18n-extract           # 自动提取硬编码到语言包
/frontend-guardian --i18n-missing           # 检测缺失 key
/frontend-guardian --i18n-dead              # 扫描未使用的 key
/frontend-guardian --i18n-lint              # 命名规范检查（module.page.element）
/frontend-guardian --i18n-translate         # 自动翻译缺失语言（调用翻译 API）
/frontend-guardian --i18n --fix             # 自动修复（提取 + 替换 + 清理死key）

# 组件医生
/frontend-guardian --component              # 组件反模式检测
/frontend-guardian --component-token        # 主题/token 一致性检查
/frontend-guardian --component-a11y         # 可访问性检查
/frontend-guardian --component-perf         # 性能陷阱检测
/frontend-guardian --component-upgrade      # 组件库版本升级影响分析

# Hooks / Composables 检查
/frontend-guardian --hooks                  # React Hooks 全量检查
/frontend-guardian --hooks-closure          # 闭包陷阱专项
/frontend-guardian --hooks-custom           # 自定义 Hook 规范
/frontend-guardian --composables            # Vue Composables 检查
/frontend-guardian --hooks-state            # 状态提升建议

# 多端平台适配
/frontend-guardian --platform               # 多端适配全量检查
/frontend-guardian --platform-mp            # 小程序专项（微信/支付宝/抖音）
/frontend-guardian --platform-mobile        # 移动端性能与体验
/frontend-guardian --platform-harmony       # 鸿蒙 ArkTS/ArkUI 规范
/frontend-guardian --platform-responsive    # 响应式断点检查
```

### 组合命令

```text
# 提交前检查：i18n + 组件 + hooks
/frontend-guardian --i18n --component --hooks

# 上线前全量扫描 + 门禁
/frontend-guardian --scan --gate --output report.md

# 仅检查当前修改的文件
/frontend-guardian --scan --staged

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
| `--fix` | 自动修复可修复的问题 | false |
| `--locale <lang>` | 报告语言（zh/en） | `zh` |
| `--severity <level>` | 最低输出严重级别 | `warning` |
| `--mp-type <type>` | 小程序类型：`wechat` / `alipay` / `douyin` / `uniapp` | 自动检测 |
| `--mobile-type <type>` | 移动端类型：`h5` / `rn` / `flutter` / `native` | 自动检测 |
| `--component-lib <lib>` | 指定组件库：`antd` / `element-plus` / `mui` / `vuetify` | 自动检测 |
| `--i18n-format <format>` | 语言包格式：`json` / `yaml` / `js` / `ts` | 自动检测 |
| `--i18n-locales <langs>` | 目标语言列表，如 `zh-CN,en-US,ja-JP` | 自动检测 |

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
🛡️ frontend-guardian v1.0.0 — 全端扫描报告
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

## 规则文件结构

```
frontend-guardian/
├── SKILL.md                    # Claude Code 入口（触发条件 + 指令路由）
├── README.md                   # 本文档
├── rules/
│   ├── react.md               # React 通用规则
│   ├── vue.md                 # Vue 通用规则
│   ├── nextjs.md              # Next.js 专项
│   ├── nuxt.md                # Nuxt 专项
│   ├── uniapp.md              # UniApp 跨端规则
│   ├── taro.md                # Taro 跨端规则
│   ├── wechat-mp.md           # 微信小程序原生
│   ├── alipay-mp.md           # 支付宝小程序
│   ├── douyin-mp.md           # 抖音小程序
│   ├── flutter.md             # Flutter 规则
│   ├── react-native.md        # React Native 规则
│   ├── harmony.md             # 鸿蒙 ArkTS/ArkUI
│   ├── antd.md                # Ant Design 组件规则
│   ├── element-plus.md        # Element Plus 组件规则
│   ├── mui.md                 # Material UI 规则
│   ├── i18n.md                # 国际化通用规则
│   └── platform-common.md     # 多端通用规则
├── scripts/
│   ├── scan-i18n.sh           # i18n 扫描脚本
│   ├── scan-components.sh     # 组件规范扫描
│   ├── scan-hooks.sh          # Hooks 检查脚本
│   ├── scan-platform.sh       # 多端适配扫描
│   ├── extract-i18n.sh        # i18n 自动提取
│   ├── translate.sh           # 自动翻译脚本
│   └── full-scan.sh           # 全量扫描入口
└── examples/
    ├── .frontend-guardian.yml  # 配置示例
    └── report-sample.md        # 报告示例
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
