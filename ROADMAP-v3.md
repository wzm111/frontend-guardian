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

## 🚧 v3.8.0 — MCP Server 与 AI Agent 集成（MCP Server & AI Agent Integration）

**目标**：让 frontend-guardian 成为 AI Agent 的标准工具，通过 MCP 协议暴露治理能力。

**预计发布**：2026-07-22

> **CodeGraph 借鉴点**：MCP Server 模式（`codegraph serve --mcp`）、自动向 Agent 注入使用指引

### P0 — 必须完成

- [ ] **MCP Server 启动**：`fg-core --mcp` 启动 MCP Server，暴露 scan / fix / e2e-run / e2e-detect-gaps 工具
- [ ] **Cursor / Copilot 兼容**：MCP Server 兼容 Cursor 的 MCP 配置格式和 GitHub Copilot 的 tool calling 格式
- [ ] **自然语言触发**：Agent 无需记忆 CLI 命令，通过自然语言描述需求即可触发治理（如"检查这个项目有没有 i18n 问题"）

### P1 — 尽量完成

- [ ] **上下文感知扫描**：Agent 传入当前编辑文件/光标位置，MCP Server 只扫描相关上下文（而非全量扫描）
- [ ] **修复结果反馈**：MCP 返回修复后的代码 diff，Agent 直接应用到编辑器
- [ ] **多 Agent 协作**：支持同时接入 Claude Code、Cursor、Copilot、Kimi Code，共享同一份扫描索引

### P2 — 排期实现

- [ ] **自动注入使用指引**：MCP Server 初始化时自动向 Agent 发送工具使用说明（类似 CodeGraph 的自动 guidance）
- [ ] **Agent 记忆持久化**：记录 Agent 的偏好设置（如常用规则集、忽略模式），跨会话保持一致

---

## 🚧 v3.9.0 — 智能测试推荐（Intelligent Test Recommendation）

**目标**：基于代码变更影响分析，自动推荐需要重新运行的测试，减少 CI 耗时。

**预计发布**：2026-07-29

> **CodeGraph 借鉴点**：影响分析（Impact Analysis）、callers/callees 工具

### P0 — 必须完成

- [ ] **修改影响分析**：修改某个组件/页面时，自动分析哪些 E2E 测试文件依赖它（基于 import 图 + 路由映射）
- [ ] **智能测试推荐**：`fg-core --recommend-tests` 输出"本次变更建议运行的测试列表"
- [ ] **PR 阶段增量测试**：在 CI 中只运行受影响的测试套件（而非全量），结合 `--gate` 使用

### P1 — 尽量完成

- [ ] **测试优先级排序**：根据变更影响范围、测试历史失败率、测试执行时长排序推荐列表
- [ ] **跨文件影响追踪**：修改 utils/hooks 等共享模块时，追踪到所有引用它的页面和测试
- [ ] ** flaky 测试预警**：基于历史测试数据，标记高 flakiness 风险的测试

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
