# frontend-guardian v2.0 改进蓝图

> 目标：简单化 · 智能化 · 通用化 · 覆盖全面化

---

## Phase 0: 现状诊断

### 架构层

| 问题 | 影响 | 优先级 |
|------|------|--------|
| **双引擎重复扫描** | Bash scanner + Node.js AST 引擎检测逻辑完全重复，维护成本高，结果不一致 | 🔴 P0 |
| **full-scan.sh 结果未合并** | Bash 引擎输出到 `/tmp/fg-*.txt`，AST 引擎输出到 `/tmp/fg-ast-*.json`，最终报告只取 Bash 结果 | 🔴 P0 |
| **命令体系碎片化** | SKILL.md 列了 40+ 命令，多数子命令（如 `--component-a11y`, `--hooks-state`）无实际路由 | 🔴 P0 |
| **规则与配置脱节** | `.frontend-guardian.yml` 配置丰富但 scanner 未读取（如 `component.maxSelectOptions`, `hooks.maxEffectDeps`） | 🟡 P1 |

### 简单化问题

1. **命令过多**：用户需要记忆 40+ 个命令变体
2. **参数不一致**：`full-scan.sh` 用 `--gate`，`fg-core.js` 用 `--severity`，`extract-i18n.sh` 用 `--dry-run`
3. **输出不统一**：Bash 脚本直接 `echo`，AST 引擎输出 JSON，没有统一格式
4. **修复体验割裂**：`--fix` 只在 AST 引擎中可用，Bash 脚本无修复能力

### 智能化问题

1. **无问题聚类**：同一组件 3 个 useEffect 缺少依赖 → 报 3 次，应合并为 1 次
2. **技术栈检测粗糙**：只看文件是否存在，不分析 package.json 版本
3. **修复建议简单**：硬编码颜色统一替换成 `var(--primary-color)`，不分析上下文
4. **无增量扫描**：`--staged` 只过滤文件，规则执行仍是全量
5. **无历史学习**：每次扫描从零开始，没有"这个项目常见这类问题"的适应

### 通用化问题

1. **规则硬编码**：所有规则写在 scanner 文件中，无法热插拔
2. **无自定义规则入口**：用户无法添加自己的规则
3. **框架绑定深**：`hooks-effect-deps` 直接遍历 `useEffect`，不抽象为"effect-like hook"
4. **扫描范围固化**：扩展名和目录写死在代码中

### 覆盖全面化问题

1. **规则数量少**：48 条 vs ESLint 1000+
2. **缺 TypeScript 类型检查**：`no-explicit-any`, `strict-null-checks` 等
3. **缺 CSS 规范**：`@media` 查询、单位统一、BEM 规范等
4. **缺 Bundle 分析**：未集成 webpack/vite 分析器
5. **缺现代框架**：Svelte, SolidJS, Astro 等未支持

---

## Phase 1: 简单化（统一命令体系 + 合并双引擎）

### 1.1 命令扁平化（目标：7 个核心命令）

```text
/frontend-guardian                    → 智能全量扫描（自动选择模块）
/frontend-guardian --scan             → 全量扫描（9模块）
/frontend-guardian --scan --fix       → 扫描 + 自动修复
/frontend-guardian --scan --staged    → 仅扫描 git staged
/frontend-guardian --scan --gate      → CI 门禁模式
/frontend-guardian --scan --json      → JSON 输出

/frontend-guardian --init-scaffold    → 初始化脚手架
/frontend-guardian --init-ai          → 初始化 AI 上下文

# 子命令简化为模块名 + --action
/frontend-guardian --i18n             → i18n 全量扫描
/frontend-guardian --i18n --action extract     → 提取硬编码
/frontend-guardian --i18n --action translate   → 自动翻译
/frontend-guardian --i18n --fix               → 自动修复
```

删除所有没有实现的子命令（从 SKILL.md 中移除或标记为计划中）。

### 1.2 合并双引擎

**方案**：以 Node.js AST 引擎为唯一分析引擎，Bash 脚本只做两件事：
1. **入口路由**：解析参数 → 调用 fg-core.js
2. **外部工具集成**：Knip、bundle-size 等非 AST 工具

```
full-scan.sh 流程简化：
  1. 解析参数
  2. 技术栈检测（保留 Bash 逻辑，因为不需要 AST）
  3. 获取文件列表
  4. 调用 fg-core.js --module all（一次调用，所有模块）
  5. 调用 Knip（外部工具）
  6. 生成统一 Markdown 报告
  7. 门禁检查
```

删除独立的 Bash scanner：
- `scan-i18n.sh` → 逻辑迁移到 `i18n-scanner.ts`
- `scan-components.sh` → 逻辑迁移到 `component-scanner.ts`
- `scan-hooks.sh` → 逻辑迁移到 `hooks-scanner.ts`
- `scan-platform.sh` → 逻辑迁移到 `platform-scanner.ts`

### 1.3 统一输出格式

```typescript
interface UnifiedOutput {
  summary: {
    timestamp: string;
    project: string;
    stack: string;
    totalFiles: number;
    issuesBySeverity: { critical: number; warning: number; suggestion: number };
    fixedCount?: number;
    duration: number;
  };
  modules: Record<string, ModuleResult>;
  // 修复结果
  fix?: FixResult;
  // 外部工具结果
  external?: {
    knip?: KnipResult;
    bundleSize?: BundleSizeResult;
  };
}
```

---

## Phase 2: 智能化（问题聚类 + 上下文感知 + 增量扫描）

### 2.1 问题聚类（Issue Grouper）

同一文件/同一组件的同类问题合并：

```typescript
// 输入：5 个独立 Issue
// useEffect 缺少依赖: 'count'
// useEffect 缺少依赖: 'name'
// useEffect 缺少依赖: 'list'
// useEffect 缺少依赖: 'isLoading'
// useEffect 缺少依赖: 'error'

// 输出：1 个聚合 Issue
{
  ruleId: 'hooks-effect-deps',
  title: 'useEffect 缺少 5 个依赖',
  description: '变量 count, name, list, isLoading, error 在 useEffect 中使用但不在依赖数组中',
  severity: 'warning',
  meta: { aggregated: true, count: 5, items: [...] }
}
```

### 2.2 技术栈增强检测

```typescript
interface EnhancedProjectMeta extends ProjectMeta {
  // 新增：精确版本信息
  frameworkVersion: string;        // "18.2.0"
  componentLibVersion: string;     // "5.17.0"
  typescriptVersion?: string;      // "5.7.0"

  // 新增：构建工具
  bundler: 'webpack' | 'vite' | 'rollup' | 'esbuild' | 'turbo' | 'farm' | 'rsbuild';
  testFramework?: 'jest' | 'vitest' | 'playwright' | 'cypress';
  stateManager?: 'redux' | 'zustand' | 'mobx' | 'pinia' | 'jotai' | 'recoil';
  router?: 'react-router' | 'vue-router' | 'nextjs' | 'nuxt';

  // 新增：项目规模
  totalFiles: number;
  totalLines: number;
  testCoverage?: number;
}
```

### 2.3 智能修复建议

修复不再只是简单文本替换，而是基于上下文的代码生成：

```typescript
interface SmartFix extends Fix {
  // 修复说明
  explanation: string;
  // 修复前后的代码 diff（用于终端展示）
  diff: string;
  // 是否需要用户确认
  requiresConfirmation: boolean;
  // 置信度 0-1
  confidence: number;
}
```

### 2.4 增量扫描

```bash
# 仅扫描 git diff 涉及的文件
/frontend-guardian --scan --staged

# 扫描最近 N 个 commit 的变更
/frontend-guardian --scan --since HEAD~5

# 扫描 PR 分支与 main 的差异
/frontend-guardian --scan --diff main...feature-branch
```

---

## Phase 3: 通用化（插件化规则体系）

### 3.1 规则注册中心

```typescript
// lib/src/rules/registry.ts
export class RuleRegistry {
  private rules = new Map<string, RuleDefinition>();

  register(def: RuleDefinition): void {
    this.rules.set(def.id, def);
  }

  // 支持从配置文件动态加载
  loadFromConfig(config: RuleConfig[]): void {
    for (const cfg of config) {
      if (cfg.enabled === false) {
        this.rules.delete(cfg.id);
      } else {
        const rule = this.rules.get(cfg.id);
        if (rule) {
          rule.severity = cfg.severity || rule.severity;
        }
      }
    }
  }

  // 支持自定义规则（用户 JS 文件）
  loadCustomRule(filePath: string): void {
    const mod = require(filePath);
    this.register(mod.default || mod);
  }
}
```

### 3.2 配置驱动规则

```yaml
# .frontend-guardian.yml
rules:
  # 完全禁用某规则
  hooks-effect-deps:
    enabled: false

  # 调整严重级别
  component-token:
    severity: warning  # 原来是 suggestion

  # 规则参数化
  hooks-effect-deps:
    maxDeps: 7  # 覆盖默认 5
    ignorePatterns:
      - "dispatch"
      - "setState"

  # 自定义规则（用户自己的规则文件）
  customRules:
    - ./rules/my-company-rule.js
```

### 3.3 框架抽象层

```typescript
// 将 useEffect 抽象为 EffectHook
interface EffectHookPattern {
  name: string;           // "useEffect"
  framework: Framework;
  getCallback: (node: CallExpression) => Function;
  getDeps: (node: CallExpression) => ArrayExpression | undefined;
  getCleanup: (node: Function) => ReturnStatement | undefined;
}

// React
const reactUseEffect: EffectHookPattern = {
  name: 'useEffect',
  framework: 'react',
  getCallback: (node) => node.arguments[0],
  getDeps: (node) => node.arguments[1],
  // ...
};

// Vue
const vueWatchEffect: EffectHookPattern = {
  name: 'watchEffect',
  framework: 'vue',
  // ...
};
```

---

## Phase 4: 覆盖全面化（规则扩增 + 外部工具集成）

### 4.1 规则扩增路线图

| 模块 | 当前 | 目标 | 新增规则 |
|------|------|------|----------|
| i18n | 3 | 8 | 插值变量检查、复数规则、RTL 支持、key 过长、嵌套过深 |
| performance | 4 | 12 | 大文件检测、循环引用、内存泄漏模式、requestAnimationFrame、Web Worker |
| a11y | 5 | 10 | 焦点管理、屏幕阅读器、键盘导航、语义化 HTML、跳过链接 |
| security | 5 | 10 | CSRF、点击劫持、Content-Security-Policy、依赖漏洞 |
| naming | 8 | 10 | 常量命名、测试文件命名、Hook 文件命名 |
| cross-file | 5 | 8 | 循环依赖、 barrel 文件分析、模块边界 |
| component | 3 | 10 | 表单验证、日期格式、Icon 使用、布局组件 |
| hooks | 6 | 12 | useMemo 依赖、useCallback 滥用、Suspense 模式、Error Boundary |
| platform | 6 | 10 | 深色模式、字体加载、离线能力、PWA |
| **总计** | **48** | **100+** | |

### 4.2 外部工具集成

```typescript
interface ExternalToolIntegration {
  name: string;
  command: string;
  parseOutput: (stdout: string) => Issue[];
}

const integrations: ExternalToolIntegration[] = [
  {
    name: 'ESLint',
    command: 'npx eslint --format json src/',
    parseOutput: parseESLintJson,
  },
  {
    name: 'TypeScript',
    command: 'npx tsc --noEmit',
    parseOutput: parseTscOutput,
  },
  {
    name: 'Stylelint',
    command: 'npx stylelint "src/**/*.{css,scss,less}" --formatter json',
    parseOutput: parseStylelintJson,
  },
  {
    name: 'Lighthouse CI',
    command: 'npx lhci collect --url=http://localhost:3000',
    parseOutput: parseLhciOutput,
  },
];
```

### 4.3 现代框架支持

| 框架 | 检测特征 | 新增规则 |
|------|----------|----------|
| Svelte | `.svelte` 文件 | 响应式声明、store 使用、过渡动画 |
| SolidJS | `solid-js` 依赖 | Signal 使用、Memo 模式、Store |
| Astro | `.astro` 文件 | Islands 架构、客户端指令、内容集合 |
| Qwik | `@builder.io/qwik` | Resumable、$ 前缀、useSignal |
| Remix | `@remix-run` | Loader/Action 模式、Form 处理 |

---

## 实施计划

### Sprint 1: 简单化 ✅（已交付）
- [x] 统一命令体系：重构 `full-scan.sh` 为单一入口
- [x] 合并双引擎：AST 引擎为主，`fg-core --module all` 一次扫描全部 9 模块
- [x] 统一输出格式：`UnifiedOutput` 接口 + Markdown/JSON/终端适配器
- [x] 简化 SKILL.md：从 40+ 命令精简为 7 个核心命令

### Sprint 2: 智能化 ✅（已交付）
- [x] 问题聚类引擎：`RuleEngine.clusterIssues()` 按 (file, ruleId) 聚合
- [x] 技术栈增强检测：从 package.json 解析 10+ 维度（bundler / test / state / styling / router / pm / linter / monorepo）
- [x] 增量扫描：`--staged` / `--diff main...feature` 仅扫描 git 变更文件
- [ ] ~~智能修复建议：`SmartFix` 带 diff 和置信度~~（推迟到 Phase 3）

### Sprint 3: 通用化（1-2 周）
- [ ] 规则注册中心：`RuleRegistry`
- [ ] 配置驱动规则：`.frontend-guardian.yml` 规则开关
- [ ] 自定义规则支持：加载用户 JS 规则文件
- [ ] 框架抽象层：通用 Hook/Effect 模式

### Sprint 4: 覆盖全面化（持续）
- [ ] 规则扩增到 100+
- [ ] ESLint / TypeScript / Stylelint 集成
- [ ] Svelte / SolidJS / Astro 支持
- [ ] Bundle 分析集成

---

## 验收标准

1. **简单化**：`/frontend-guardian --scan` 一条命令完成所有扫描，输出统一
2. **智能化**：同一文件同类问题自动聚类，技术栈检测准确率 > 95%
3. **通用化**：用户可通过 `.frontend-guardian.yml` 关闭/调整/扩展任意规则
4. **覆盖全面化**：规则数达到 100+，覆盖 TypeScript/CSS/Bundle 等维度
