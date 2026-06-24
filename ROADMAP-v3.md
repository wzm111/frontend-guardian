# frontend-guardian Roadmap v3 — 进阶方向

> ROADMAP v2 已全部完成。v3.x 进入功能完善和生态扩展阶段。

---

## 🚧 v3.2.0 — 性能与体验优化（Performance & Experience）

**目标**：让 frontend-guardian 在大项目中也能秒级响应，提升日常使用体验。

**预计发布**：2026-06-10

### P0 — 必须完成 ✅

- [x] **增量扫描优化**：基于 git diff 的精确增量扫描，只扫描变更文件及其依赖文件（通过 import 图分析），大项目扫描时间从分钟级降至秒级
- [x] **并行度自适应**：根据系统 CPU 和项目规模自动调整 `RuleEngine.scan()` 的并发数，避免小项目过度并行、大项目并行不足
- [x] **内存占用优化**：大项目扫描时 AST 缓存的 LRU 淘汰策略，防止内存泄漏

### P1 — 尽量完成

- [ ] **扫描进度显示**：长扫描任务显示实时进度条（已扫描文件数 / 总文件数 / 预估剩余时间）
- [ ] **Watch 模式增量优化**：文件变更后只重新扫描变更文件涉及的规则，而非全量重新扫描
- [ ] **配置推荐**：根据项目规模和框架自动推荐最优配置（并发数、缓存策略、规则集）

### P2 — 排期实现

- [ ] **扫描耗时分析**：`--profile` 参数输出各规则/各文件的扫描耗时排名，帮助定位性能瓶颈
- [ ] **增量 baseline**：baseline 文件只记录新增问题，不重复记录已知问题，减少 baseline 文件膨胀

---

## 🚧 v3.3.0 — IDE 集成（IDE Integration）

**目标**：让问题发现前置到编码阶段，实现"写代码时就知道问题"。

**预计发布**：2026-06-17

### P0 — 必须完成 ✅

- [x] **LSP 协议支持**：实现 Language Server Protocol，提供 diagnostics（问题诊断）、code actions（快速修复）
- [x] **VS Code 插件**：发布 VS Code 扩展 `frontend-guardian.vscode`，支持实时问题下划线、hover 提示规则说明、一键修复
- [x] **增量诊断**：文件保存时增量扫描当前文件，100ms 内返回结果

### P1 — 尽量完成

- [ ] **WebStorm / IntelliJ 插件**：基于 LSP 的 JetBrains 插件支持
- [ ] **Neovim 集成**：通过 LSP 支持 Neovim 的 `null-ls` / `nvim-lint`
- [ ] **代码 lens**：在问题行上方显示 inline 提示（如"⚠️ useEffect 缺少依赖"）

### P2 — 排期实现

- [ ] **AI 实时建议**：IDE 中直接展示 AI 修复建议，一键应用
- [ ] **类型检查联动**：与 TypeScript LSP 联动，在类型错误位置同时展示 guardian 规则提示

---

## 🚧 v3.4.0 — 规则生态与扩展（Rule Ecosystem）

**目标**：建立规则分享和复用机制，让社区贡献规则变得简单。

**预计发布**：2026-06-24

### P0 — 必须完成

- [ ] **规则模板生成器**：`--create-rule` CLI 命令，交互式生成规则模板（含测试模板）
- [ ] **规则市场索引**：维护公开规则包索引（类似 eslint-plugin 生态），支持 `extends: market:package-name`
- [ ] **规则评分系统**：基于使用率、准确率、修复成功率对规则打分，帮助用户选择高质量规则

### P1 — 尽量完成

- [ ] **自定义规则热重载**：开发自定义规则时，规则文件修改后自动重载（类似 watch 模式）
- [ ] **规则文档自动生成**：从规则源码自动生成 Markdown 文档（含示例、配置参数说明）
- [ ] **规则兼容性检查**：检测规则间的冲突（如两个规则可能给出矛盾的建议）

### P2 — 排期实现

- [ ] **更多语言支持**：扩展扫描器到 CSS/SCSS、JSON/YAML、Markdown 等非 JS 文件
- [ ] **后端语言扫描**：提供 Node.js / Go / Rust 后端代码的基础扫描（安全、命名规范等）

---

## 🚧 v3.5.0 — 企业级团队协作（Enterprise Team）

**目标**：支持中大型团队的企业级治理需求。

**预计发布**：2026-07-01

### P0 — 必须完成 ✅

- [x] **团队共享 baseline**：支持从远程 URL 加载团队 baseline，统一忽略已知遗留问题（`--team-baseline <url>`，1 小时本地缓存）
- [x] **扫描结果通知**：扫描完成后通过 webhook / 企业微信 / 钉钉 / Slack 发送通知（`--notify`，环境变量自动检测）
- [x] **问题指派**：Issue 可指派给团队成员（通过代码所有者 `CODEOWNERS` 自动推断，`--assign`）

### P1 — 尽量完成

- [x] **治理看板服务端**：部署服务端收集多项目扫描数据，统一展示团队治理趋势
- [x] **扫描策略分级**：支持 `strict` / `standard` / `loose` 三种预设策略，适配不同严格度要求
- [x] **合规报告**：生成符合 SOC2 / ISO27001 要求的代码质量合规报告

### P2 — 排期实现

- [ ] **SSO 集成**：企业 SSO 登录，团队权限管理
- [ ] **扫描调度中心**：集中管理多个项目的扫描计划、报告归档、告警阈值

---

---

## ✅ v3.6.0 — E2E 测试治理（E2E Test Governance）

**目标**：将前端治理从静态代码扫描延伸到 E2E 测试质量，覆盖测试代码规范、覆盖缺口检测。

**实际发布**：2026-05-27

### P0 — 必须完成 ✅

- [x] **E2E 测试规范扫描**：扫描 Playwright/Cypress 测试代码，检测反模式（硬编码选择器、固定时长等待、缺少接口断言）
- [x] **测试覆盖缺口检测**：对比项目页面路由/接口文档与现有 E2E 测试文件，发现未覆盖的页面路径和接口
- [x] **运行时规则引擎**：复用现有 `RuleEngine`，新增 `e2e` 规则类别，不引入 Playwright 等重型依赖

### P1 — 尽量完成 ✅

- [x] **测试骨架生成器**：根据接口文档（Markdown）自动生成 Playwright 测试代码骨架
- [x] **测试报告质量分析**：解析 Playwright/Cypress JSON 报告，发现 flaky 测试、慢测试、未覆盖页面

### P2 — 排期实现

- [ ] **智能测试补全建议**：基于缺口检测结果，AI 生成测试用例建议
- [ ] **多框架支持**：除 Playwright 外，支持 Cypress、Selenium、Katalon 的测试代码扫描

---

## ✅ v3.6.1 — Playwright 外部工具集成（Playwright External Tool Integration）

**目标**：Skill 作为统一入口调用 Playwright 执行测试，聚合结果到统一报告。

**实际发布**：2026-05-28

### P0 — 必须完成 ✅

- [x] **Playwright 外部工具集成**：`lib/src/integrations/playwright.ts`，调用 `npx playwright test --reporter=json`
- [x] **CLI 统一入口**：`fg-core . --e2e-run` 自动检测 Playwright 配置并执行测试
- [x] **JSON 报告解析**：将 failed/timedOut 转为 `Issue`，passed/skipped 忽略

---

## ✅ v3.7.0 — 增量索引与影响分析（已交付 2026-06-01，607 测试通过）

**目标**：借鉴 [CodeGraph](https://github.com/colbymchenry/codegraph) 的预索引理念，解决大项目扫描慢的问题；同时引入影响分析能力，让治理更智能。

> **CodeGraph 借鉴点**：预索引（符号、调用图）、文件监听自动同步、框架路由理解

### 已交付

- [x] **预索引建立**：首次扫描后建立 `.frontend-guardian/index/index.json` 本地索引（文件哈希 → 符号表 + import 关系 + 路由表）
- [x] **文件监听自动同步**：基于 `fs.watch` 的文件变更监听，500ms 防抖自动同步索引（`--watch-index`）
- [x] **框架路由自动解析**：自动识别 React Router / Vue Router / Next.js / Nuxt / UniApp / Taro 路由配置
- [x] **影响分析**：`getTransitiveImporters()` 递归追踪文件依赖链，定位变更影响范围

---

## ✅ v3.7.1 — 页面健康检查（已交付 2026-06-08，611 测试通过）

**目标**：结合 webapp-testing skill 的运行时验证能力，补充 frontend-guardian 的"页面测试"能力。

> **webapp-testing 借鉴点**：侦察-行动模式（访问 → 等待 networkidle → 检查 DOM/控制台 → 截图）

### 已交付

- [x] **页面健康检查 `--page-health`**：启动浏览器遍历路由，验证页面渲染质量
- [x] **6 类运行时 Issue**：HTTP 错误、白屏、控制台 Error、资源加载失败、导航失败
- [x] **自动截图**：保存到 `.frontend-guardian/screenshots/`，供人工核查
- [x] **服务器生命周期管理**：`--serve "npm run dev"` 自动启动 dev server 并等待端口就绪
- [x] **Playwright 可选依赖**：运行时检测，未安装时友好提示，不强制引入

---

## ✅ v3.7.2 — 页面健康检查并发优化（已交付 2026-06-09，616 测试通过）

**目标**：解决大项目页面健康检查串行遍历慢的问题，通过并发检查数倍提升速度。

### 已交付

- [x] **并发路由检查**：基于 `runWithConcurrency` 并发池，默认 3 个 page 并行遍历路由
- [x] **可配置并发数**：`--page-health-concurrency <n>` CLI 参数自定义并发度
- [x] **故障隔离**：单个路由检查失败不阻断其他并发任务
- [x] **测试覆盖**：新增 5 个并发相关测试（类型检查 + 并发控制逻辑 + 边界条件）

---

## ✅ v3.7.3 — 页面健康检查报告集成（已交付 2026-06-09，618 测试通过）

**目标**：将页面健康检查结果自动上报到 v3.5.2 治理看板服务器，实现运行时验证数据的集中管理。

### 已交付

- [x] **Dashboard 上报**：`uploadPageHealthResult()` 将 `PageHealthResult` 转换为 `ScanResult` 并上报
- [x] **CLI 集成**：`--page-health --server <url>` 自动上报检查结果
- [x] **类型适配**：`toScanResult()` 函数实现 PageHealthResult → ScanResult 转换
- [x] **测试覆盖**：新增 2 个 `toScanResult` 测试（正常转换 + 空结果边界）

---

## ✅ v3.7.4 — 页面健康检查交互元素发现（已交付 2026-06-09，620 测试通过）

**目标**：在页面健康检查中自动发现交互元素（button/link/input）并验证可点击性，发现潜在的交互体验问题。

### 已交付

- [x] **交互元素检测**：`page.evaluate()` 获取 button、a[href]、input、textarea、select 及 ARIA role 元素
- [x] **可见性/禁用检查**：统计可见元素数和禁用元素数
- [x] **CLI 开关**：`--no-check-interactive` 可关闭交互元素检查
- [x] **Issue 规则**：`page-health-interactive-disabled` 标记被禁用的交互元素
- [x] **测试覆盖**：新增 2 个交互元素测试

---

## ✅ v3.7.5 — 页面健康检查截图对比（已交付 2026-06-09，622 测试通过）

**目标**：在页面健康检查中引入截图基线对比能力，发现 UI 回退和未预期的视觉变化。

### 已交付

- [x] **截图基线管理**：`.frontend-guardian/screenshots/baseline/` 保存基线截图
- [x] **哈希对比**：SHA256 哈希对比当前截图与基线
- [x] **CLI 更新基线**：`--update-baseline` 参数更新基线截图
- [x] **Issue 规则**：`page-health-screenshot-changed` 标记截图变化
- [x] **测试覆盖**：新增 2 个截图对比测试

---

## ✅ v3.8.0 — MCP Server 与 AI Agent 集成（已交付 2026-06-18，631 测试通过）

**目标**：让 frontend-guardian 成为 AI Agent 的标准工具，通过 MCP 协议暴露治理能力。

**实际发布**：2026-06-18

> **CodeGraph 借鉴点**：MCP Server 模式（`codegraph serve --mcp`）、自动向 Agent 注入使用指引

### P0 — 必须完成 ✅

- [x] **MCP Server 启动**：`fg-core --mcp` 启动 MCP Server，暴露 scan / fix / e2e-run / e2e-detect-gaps 工具
- [x] **Cursor / Copilot 兼容**：MCP Server 兼容 Cursor 的 MCP 配置格式和 GitHub Copilot 的 tool calling 格式
- [x] **自然语言触发**：Agent 无需记忆 CLI 命令，通过自然语言描述需求即可触发治理（如"检查这个项目有没有 i18n 问题"）

### P1 — 尽量完成

- [ ] **上下文感知扫描**：Agent 传入当前编辑文件/光标位置，MCP Server 只扫描相关上下文（而非全量扫描）
- [ ] **修复结果反馈**：MCP 返回修复后的代码 diff，Agent 直接应用到编辑器
- [ ] **多 Agent 协作**：支持同时接入 Claude Code、Cursor、Copilot、Kimi Code，共享同一份扫描索引

### P2 — 排期实现

- [ ] **自动注入使用指引**：MCP Server 初始化时自动向 Agent 发送工具使用说明（类似 CodeGraph 的自动 guidance）
- [ ] **Agent 记忆持久化**：记录 Agent 的偏好设置（如常用规则集、忽略模式），跨会话保持一致

---

## ✅ v3.9.0 — 智能测试推荐（Intelligent Test Recommendation）（已交付 2026-06-18，642 测试通过）

**目标**：基于代码变更影响分析，自动推荐需要重新运行的测试，减少 CI 耗时。

### P0 — 必须完成 ✅

- [x] **修改影响分析**：修改某个组件/页面时，自动分析哪些测试文件依赖它（基于 import 图 + 路由映射）
- [x] **智能测试推荐**：`fg-core --recommend-tests` 输出"本次变更建议运行的测试列表"
- [x] **PR 阶段增量测试**：在 CI 中只运行受影响的测试套件（而非全量），结合 `--staged` / `--diff` / `--auto-scope` 使用

### P1 — 尽量完成 ✅

- [x] **测试优先级排序**：根据变更影响范围排序推荐列表（Priority 1 直接 / 2 传递 / 3 路由相关）
- [x] **跨文件影响追踪**：修改 utils/hooks 等共享模块时，追踪到所有引用它的页面和测试
- [x] **flaky 测试预警**：基于历史测试数据，标记高 flakiness 风险的测试（v3.12.1 交付）
  - 历史数据存储：`.frontend-guardian/test-history.json`
  - 失败率 / 状态翻转率双阈值检测
  - `--recommend-tests` 输出 flaky 风险提示

### P2 — 排期实现

- [ ] **可视化影响图**：Web 看板中展示"组件 → 页面 → 测试"的依赖关系图（Canvas/SVG）
- [ ] **预测性扫描**：基于代码变更模式预测可能引入的问题，在提交前预警

---

## 📋 版本迭代原则

1. **每次迭代前**：从本 ROADMAP 中选择下一个 MINOR 版本，读取任务清单
2. **每次迭代后**：
   - 更新 `lib/package.json` 版本号
   - 更新 `README.md`「版本演进」章节
   - 在 ROADMAP 中勾选已完成的任务
3. **版本号示例**：
   - `v3.7.0`：v3.7 迭代开始
   - `v3.7.1`：v3.7 迭代中的 bug 修复
   - `v3.8.0`：v3.8 迭代开始（新功能发布）

---

## 🔗 CodeGraph 借鉴总览

| CodeGraph 能力 | 借鉴方向 | 对应版本 |
|----------------|---------|---------|
| 预索引 SQLite | 本地 AST 缓存索引 + 文件哈希 | v3.7.0 |
| FSEvents/inotify 监听 | `--watch-index` 自动同步 | v3.7.0 |
| 框架路由理解 | React/Vue/Next.js 路由自动解析 | v3.7.0 |
| MCP Server | `fg-core --mcp` Agent 集成 | v3.8.0 |
| 影响分析 (Impact) | 修改 → 测试推荐 | v3.9.0 |
| callers/callees | hooks 调用链分析 | v3.7.0 |

---

## 🎯 下一步建议

当前已交付到 **v3.6.1**，推荐进入 **v3.7.0 增量索引与影响分析**，原因：

1. **性能痛点**：大项目（1000+ 文件）全量扫描仍是分钟级，预索引可降至秒级
2. **IDE 基础**：v3.3.0 的 LSP 集成已落地，但增量诊断仍依赖实时 AST 解析，索引可进一步加速
3. **E2E 基础**：v3.6.x 的 E2E 治理已就绪，v3.7.0 的路由自动解析可让 `--e2e-detect-gaps` 更智能
4. **AI Agent 趋势**：v3.8.0 的 MCP 集成是前端治理工具的下一个差异化竞争力

**可选路线**：
- **路线 A（推荐）**：v3.7.0 → v3.8.0 → v3.9.0（按序迭代）
- **路线 B**：直接跳到 v3.8.0 MCP Server（如果当前团队主要用 Cursor/Copilot）
- **路线 C**：v3.7.0 P0 完成后，并行开发 v3.8.0 MCP（如果资源充足）

**你说继续我就继续，或者你选一个方向。**

---

## ✅ v3.10.0 — 页面测试进阶（Web Testing Advanced）（已交付 2026-06-22，669 测试通过，3 个 skip）

**目标**：将页面健康检查从「可用性验证」升级为「质量度量」，覆盖视觉回归、性能指标、无障碍测试等维度。

**实际发布**：2026-06-22

> **市场参考**：Playwright 2026 年已成为视觉回归测试事实标准（月下载量 2.31 亿），内置 `toHaveScreenshot()` 使用 pixelmatch 做像素级对比。Lighthouse 的 Core Web Vitals 是页面性能的行业基准。

### P0 — 必须完成 ✅

- [x] **像素级视觉回归**：引入 pixelmatch 替代 SHA256 哈希，实现真正的像素差异检测
  - 支持 `maxDiffPixels` / `maxDiffPixelRatio` 阈值配置
  - 生成差异高亮图（diff overlay），直观展示变化区域
  - 支持元素级截图（`page.locator().screenshot()`）替代全页截图，减少噪音
- [x] **动态内容遮罩**：自动识别并遮罩不稳定元素（日期、随机数、广告位），降低视觉回归的误报率
  - 遮罩配置：CSS 选择器 → 统一替换为灰色色块
  - 内置常见不稳定元素预设（`[data-testid="timestamp"]`, `.ad-banner` 等）
- [x] **性能指标采集**：集成 Lighthouse Core Web Vitals，采集 LCP / CLS / FCP / TTFB / INP
  - `--page-health --page-health-metrics` 输出性能指标 JSON
  - 性能阈值告警：LCP > 2.5s、CLS > 0.1 时生成 warning Issue
- [x] **运行时无障碍测试**：在页面健康检查中注入 axe-core，检测运行时 DOM 的无障碍问题
  - 检测 color contrast、aria 属性、焦点管理等动态问题
  - 与静态 AST 的 a11y 扫描互补（静态查源码，动态查渲染后 DOM）

### P1 — 尽量完成

- [x] **跨浏览器截图对比**：支持 Chromium / Firefox / WebKit 三套基线，检测浏览器渲染差异
  - `--page-health --browser all` 遍历所有浏览器引擎
  - 基线目录按浏览器隔离：`.frontend-guardian/screenshots/baseline/{chromium,firefox,webkit}/`
- [x] **移动端视口模拟**：模拟 iPhone / Android 常见视口尺寸，检测响应式布局问题
  - 预设视口列表：iPhone 14 Pro (390×844)、Pixel 7 (412×915)、iPad (820×1180)
  - 每个视口独立基线，发现断点处的布局异常

### P2 — 排期实现

- [ ] **AI 视觉异常检测**：对接 LLM Vision API，判断截图变化是否为「有意义的 UI 变更」而非噪声
  - 过滤字体渲染差异、滚动条变化、anti-aliasing 差异
  - 为变化区域生成自然语言描述（如"按钮颜色从蓝色变为红色"）
- [ ] **录屏回放**：页面健康检查时录制视频（Playwright `recordVideo`），失败时提供回放链路
  - 视频保存到 `.frontend-guardian/videos/`，与截图同目录
  - Dashboard 支持视频在线播放

---

## ✅ v3.10.1 — 跨浏览器基线与移动端视口模拟（已交付 2026-06-22，688 测试通过，3 个 skip）

**目标**：补全 v3.10.0 P1，让 `--page-health` 支持多浏览器与移动端视口，并为每个浏览器/视口组合建立独立基线。

**实际发布**：2026-06-22

### P0 — 必须完成

- [x] `--browser <chromium|firefox|webkit|all>` 浏览器引擎选择
- [x] `--device <name>` 使用 Playwright 内置设备预设（iPhone 14 Pro / Pixel 7 / iPad 等）
- [x] `--viewport <WxH>` 自定义视口尺寸
- [x] `--viewport-mobile` 快捷使用移动端预设视口
- [x] 基线目录按 `baseline/{browser}/{viewportKey}/` 隔离
- [x] Issue `meta` 与报告携带 `browser` / `viewport` 信息
- [x] Lighthouse CWV 仅在 Chromium 上运行，Firefox/WebKit 自动跳过

## ✅ v3.11.0 — 小程序自动化测试（Mini-Program Testing）

**目标**：将页面健康检查能力扩展到微信小程序、支付宝小程序、抖音小程序，解决小程序无法直接用 Playwright 测试的痛点。

**预计发布**：2026-07-29 · **实际交付**：2026-06-23 · **713 测试全部通过，3 个 skip**

### P0 — 必须完成

- [x] **微信开发者工具 CLI 自动化**：`lib/src/integrations/miniprogram-wechat.ts`
  - 自动检测 `project.config.json` / `app.json` / `pages.json` 定位微信项目
  - 调用 `cli --auto --project <path>` 编译并启动预览
  - 遍历 `app.json` / `pages.json` 中的页面路由，验证页面存在性
  - 解析编译输出中的 error / warning
- [x] **小程序页面健康检查**：复用 v3.7.x 的页面健康检查框架，适配小程序环境
  - 页面源码存在性检查
  - 包体积检查：主包 / 分包大小是否超限
  - 首页截图基线对比（可选 `--miniprogram-screenshot`）
- [x] **CLI 统一入口**：`fg-core . --mini-program [wechat|alipay|douyin|auto]`
  - 自动检测项目类型（微信/支付宝/抖音），无需手动指定
  - 未安装微信开发者工具时给出友好提示和下载链接

### P1 — 尽量完成

- [x] **支付宝小程序 IDE 自动化**：类似微信方案，调用支付宝小程序开发者工具 CLI（v3.11.1 交付）
  - 检测 `mini.project.json` 定位支付宝项目
  - 支持支付宝小程序特有的 API 检测（如 `my.request` vs `wx.request`）
- [x] **抖音小程序自动化**：调用抖音开发者工具 CLI（v3.11.1 交付）
  - 检测 `project.config.json` + `tt` 字段识别抖音项目
- [x] **小程序截图对比**：保存小程序页面基线截图，检测 UI 回退
  - 微信开发者工具支持 headless 截图（`--screenshot`）
  - 基线目录：`.frontend-guardian/screenshots/baseline/miniprogram/wechat/`

### P2 — 排期实现

- [x] **小程序性能采集**：通过开发者工具性能面板或静态分析采集启动时间、setData 耗时、渲染帧率（v3.11.2 交付）
  - 启动时间 > 2s 时生成 warning Issue
  - setData 数据量 > 10KB 时生成 warning Issue
- [x] **多平台并行测试**：同时测试微信 + 支付宝 + 抖音三个平台，发现平台差异（v3.11.1 交付）
  - `--mini-program all` 与 `--mini-program wechat,alipay` 支持
  - 同一份代码编译到不同平台，分别输出各平台报告
- [x] **多平台截图差异对比**：同一份代码编译到不同平台后对比截图差异（v3.12.0 交付）
  - 支持 reference / pairwise 两种对比模式
  - 复用 `visual-regression.ts` 像素级差异计算
  - 生成 `miniprogram-cross-platform-screenshot-diff` issue 与差异图

---

## ✅ v3.12.0 — 小程序多平台截图差异对比

**目标**：在 v3.11.1 多平台并行测试与单平台截图基线基础上，实现同一页面在不同平台（微信/支付宝/抖音）之间的截图差异检测。

**预计发布**：2026-06-30 · **实际交付**：2026-06-24 · **755 测试全部通过，3 个 skip**

### 已实现

- [x] 多页面截图：`runScreenshotForPages` 支持首页或指定页面列表
- [x] 跨平台差异对比：`runCrossPlatformDiff` 支持 reference / pairwise 模式
- [x] 差异图生成：输出到 `.frontend-guardian/screenshots/miniprogram/cross-platform/`
- [x] 阈值检查：`diffThresholdPixels` / `diffThresholdRatio` 控制 issue 生成
- [x] CLI 参数：`--miniprogram-cross-platform-diff` 及 6 个相关参数
- [x] MCP `mini-program` 工具支持跨平台截图对比字段
- [x] 报告输出：终端 / JSON / ScanResult meta 均包含跨平台差异统计

---

## ✅ v3.12.1 — flaky 测试预警

**目标**：补齐 v3.9.0 P1 的 flaky 测试预警能力，基于历史测试运行数据标记高 flakiness 风险的测试。

**预计发布**：2026-06-30 · **实际交付**：2026-06-24 · **765 测试全部通过，3 个 skip**

### 已实现

- [x] 测试历史记录：`TestHistoryReport` 持久化到 `.frontend-guardian/test-history.json`
- [x] Playwright E2E 运行后自动记录每个 suite 的通过/失败状态
- [x] flaky 检测算法：失败率 + 相邻运行状态翻转率双阈值
- [x] 智能测试推荐集成：`--recommend-tests` 输出 flaky 风险提示与汇总
- [x] CLI 阈值参数：`--flaky-threshold-failure-rate`、`--flaky-threshold-flip-rate`、`--flaky-min-runs`
- [x] MCP `recommend-tests` 工具支持 `flakyThresholds` 参数
- [x] 新增 10 个单元/集成测试

---

## ✅ v3.11.2 — 小程序性能采集

**目标**：在 v3.11.1 多平台小程序自动化测试基础上，增加小程序性能数据采集与阈值告警。

**预计发布**：2026-06-30 · **实际交付**：2026-06-23 · **748 测试全部通过，3 个 skip**

### 已实现

- [x] 通用 CLI 性能采集入口：`MiniProgramCliConfig.performanceArgs` + `runPerformance()`
- [x] 构建指标采集：编译耗时、主包/分包/页面体积
- [x] setData 静态分析：调用次数与负载估算
- [x] 运行时指标解析：`parsePerformanceOutput()` 支持 JSON / 文本输出
- [x] 性能阈值检查：启动时间、FPS、setData、包体积、页面复杂度
- [x] CLI 参数：`--miniprogram-performance` 与 6 个 `--miniprogram-performance-threshold-*`
- [x] MCP `mini-program` 工具支持 `performance` 与 `performanceThresholds`
- [x] 多平台性能数据合并为数组

### 明确不做

- [x] 多平台截图差异对比（已拆分为 v3.12.0 独立完成）
- [ ] 真机运行时 SDK 深度性能埋点（v3.13.0+）

---

## ✅ v3.11.1 — 支付宝/抖音小程序 CLI 自动化与多平台并行测试

**目标**：把 v3.11.0 仅支持微信的小程序测试能力扩展到支付宝、抖音，并支持一次跑多个平台。

**预计发布**：2026-06-30 · **实际交付**：2026-06-23 · **733 测试全部通过，3 个 skip**

### 已完成

- [x] 通用小程序开发者工具 CLI 抽象：`lib/src/utils/miniprogram-cli.ts`
- [x] 支付宝/抖音 CLI 配置与下载链接：`miniprogram-alipay-cli.ts`、`miniprogram-douyin-cli.ts`
- [x] 多平台统一集成入口：`lib/src/integrations/miniprogram.ts`
- [x] CLI 支持 `--mini-program all` 与逗号分隔多平台
- [x] 各平台截图基线目录隔离：`miniprogram/{wechat,alipay,douyin}/`
- [x] `project-detector.ts` 补齐 `douyin-mp` 检测
- [x] 新增 `rules/douyin-mp.md`
- [x] MCP `mini-program` 工具支持 `platform: "all"`

---

## 🚧 v4.0.0 — 移动端应用测试（Mobile App Testing）

**目标**：将治理能力从 Web / 小程序延伸到原生移动端应用（iOS / Android），支持 React Native / Flutter / 原生 App 的测试。

**预计发布**：2026-08-12

> **市场参考**：2026 年移动端测试双雄格局：Appium（成熟、跨平台、真机支持，但学习曲线陡峭、flakiness 10-15%）vs Maestro（新兴、YAML 声明式、快 2-3 倍、flakiness <1%，但 iOS 真机支持有限）。推荐双方案覆盖不同场景。

### P0 — 必须完成

- [ ] **Maestro 集成**：`lib/src/integrations/maestro.ts`
  - 检测项目中的 `.maestro/` 目录或 `maestro.yaml` 文件
  - `fg-core . --mobile --maestro` 调用 `maestro test` 执行测试
  - 解析 Maestro JUnit/XML 报告，转换为统一 Issue 格式
  - 零额外依赖：Maestro 由项目自行安装，skill 只作为统一调用入口
- [ ] **Appium 集成**：`lib/src/integrations/appium.ts`
  - 检测项目中的 Appium 配置（`wdio.conf.js`、`appium:capabilities` 等）
  - `fg-core . --mobile --appium` 调用 Appium 测试套件
  - 解析 Appium JSON/XML 报告，提取 failed/skipped 用例为 Issue
- [ ] **移动端页面健康检查**：`--mobile --page-health`
  - 启动 Appium/Maestro 打开 App，遍历关键页面路径
  - 截图保存到 `.frontend-guardian/screenshots/mobile/`
  - 检测白屏、崩溃、ANR（Application Not Responding）

### P1 — 尽量完成

- [ ] **移动端性能指标**：集成 Firebase Performance / Flipper，采集启动时间、帧率、内存占用
  - 启动时间 > 3s 时生成 warning Issue
  - 内存占用 > 阈值时生成 warning Issue
- [ ] **真机云测集成**：对接 BrowserStack / Sauce Labs / Firebase Test Lab
  - `--mobile --cloud browserstack` 在云端真机上运行测试
  - 环境变量自动检测：`FG_BROWSERSTACK_USERNAME`、`FG_BROWSERSTACK_KEY`
- [ ] **移动端截图对比**：保存移动端页面基线，检测 UI 回退
  - 区分 iOS / Android 基线（系统字体、阴影渲染差异）
  - 支持设备型号维度：iPhone 14 Pro / Pixel 7 独立基线

### P2 — 排期实现

- [ ] **手势操作测试**：通过 Maestro/Appium 模拟滑动、长按、捏合等手势，验证交互流程
  - 定义常见手势模板（下拉刷新、左滑删除、轮播图滑动）
  - 手势失败时截图 + 录屏留存证据
- [ ] **离线/弱网测试**：模拟无网络 / 2G / 3G 环境，验证 App 的降级表现
  - 配合 Maestro 的 `network` 条件或 Appium 的网络模拟能力

---

## 🎯 下一步建议（2026-06-09 更新）

当前已交付到 **v3.7.6**，下一步推荐方向：

### 路线 D（推荐）—— 页面测试 → 小程序 → 移动端（按序迭代）

这是用户最关心的方向，覆盖 Web → 小程序 → App 的完整测试链路：

1. **v3.10.0 页面测试进阶**（预计 2 周）
   - 像素级视觉回归（pixelmatch）替代 SHA256 哈希
   - Lighthouse 性能指标采集
   - 动态内容遮罩降低误报
   - 这是 v3.7.x 页面健康检查的自然延伸，市场需求最明确

2. **v3.11.0 小程序测试**（预计 2 周）
   - 微信开发者工具 CLI 自动化
   - 小程序页面健康检查（白屏、控制台、包体积）
   - 支付宝 + 抖音扩展
   - 填补小程序无法被 Playwright 覆盖的空白

3. **v4.0.0 移动端应用测试**（预计 3 周）
   - Maestro + Appium 双方案
   - 移动端页面健康检查
   - 真机云测集成
   - 覆盖 React Native / Flutter / 原生 App

### 路线 E — 并行推进

如果资源充足，可并行开发：
- 主线 A：v3.10.0 页面测试进阶 + v3.11.0 小程序测试（有依赖关系，页面测试框架可复用）
- 主线 B：v3.8.0 MCP Server（AI Agent 集成，与测试方向不冲突）

### 各版本价值

| 版本 | 核心价值 | 目标用户 |
|------|---------|---------|
| v3.10.0 | 视觉回归 + 性能度量 | 前端团队、UI 工程师 |
| v3.11.0 | 小程序自动化测试 | 小程序开发者、跨端团队 |
| v4.0.0 | 移动端 App 测试 | 移动端团队、RN/Flutter 开发者 |

**你说继续我就继续，或者你选一个版本开始。**
