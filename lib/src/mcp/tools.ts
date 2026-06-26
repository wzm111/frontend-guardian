/**
 * v3.8.0: MCP 工具定义与分发器
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { globby } from "globby";
import { ProjectIndexer } from "@/engine/indexer.js";
import { createEngine, type EngineOptions, type RuleEngine } from "@/engine/rule-engine.js";
import { createUnifiedDiff } from "@/formatters/unified-diff.js";
import { formatMiniProgramJson, formatMiniProgramReport, runMiniProgramTest } from "@/integrations/miniprogram.js";
import { formatPageHealthJson, isPlaywrightAvailable, runPageHealthCheck } from "@/integrations/page-health.js";
import { playwrightIntegration } from "@/integrations/playwright.js";
import { a11yRules } from "@/scanners/a11y-scanner.js";
import { componentRules } from "@/scanners/component-scanner.js";
import { crossFileRules } from "@/scanners/cross-file-scanner.js";
import { e2eRules } from "@/scanners/e2e-scanner.js";
import { hooksRules } from "@/scanners/hooks-scanner.js";
import { i18nRules } from "@/scanners/i18n-scanner.js";
import { namingRules } from "@/scanners/naming-scanner.js";
import { performanceRules } from "@/scanners/performance-scanner.js";
import { platformRules } from "@/scanners/platform-scanner.js";
import { securityRules } from "@/scanners/security-scanner.js";
import { svelteRules } from "@/scanners/svelte-scanner.js";
import type { ComponentLib, Framework, Issue, Platform, Rule, ScanResult, Severity } from "@/types.js";
import { generateAIFixSuggestions } from "@/utils/ai-fix-suggester.js";
import { detectE2EGaps, formatE2EGapJson } from "@/utils/e2e-gap-detector.js";
import { acquireIndexLock } from "@/utils/index-lock.js";
import { detectProjectMeta } from "@/utils/project-detector.js";
import { formatRecommendations, formatRecommendationsJson, recommendTests } from "@/utils/test-recommender.js";
import { AgentRegistry } from "./agent-registry.js";
import type { MCPServerOptions, MCPToolArgs, MCPToolResult } from "./types.js";

const MODULES = [
    "i18n",
    "performance",
    "a11y",
    "security",
    "naming",
    "cross-file",
    "component",
    "hooks",
    "platform",
    "svelte",
    "e2e",
] as const;

const MODULE_RULES: Record<string, Rule[]> = {
    i18n: i18nRules,
    performance: performanceRules,
    a11y: a11yRules,
    security: securityRules,
    naming: namingRules,
    "cross-file": crossFileRules,
    component: componentRules,
    hooks: hooksRules,
    platform: platformRules,
    svelte: svelteRules,
    e2e: e2eRules,
};

/** 构造引擎实例（MCP 场景默认静默） */
function createMcpEngine(options: MCPServerOptions, overrides: Partial<EngineOptions> = {}): RuleEngine {
    return createEngine({
        projectDir: options.projectDir,
        configFile: options.configFile,
        minSeverity: (options.minSeverity as Severity) ?? "suggestion",
        silent: true,
        ...overrides,
    });
}

/** v3.14.0: 每个 MCP Server 进程缓存一个 ProjectIndexer；跨进程共享通过磁盘索引 + 文件锁 */
const projectIndexerCache = new Map<string, ProjectIndexer>();

/** v3.14.0: 为项目创建 AgentRegistry */
function getAgentRegistry(projectDir: string): AgentRegistry {
    return new AgentRegistry({ projectDir });
}

/** v3.14.0: 记录 Agent 心跳（如提供了 agent 参数） */
function recordAgentHeartbeat(projectDir: string, agent?: string): void {
    if (!agent) return;
    try {
        const registry = getAgentRegistry(projectDir);
        registry.heartbeat({ kind: agent as import("./types.js").AgentKind });
    } catch {
        // 心跳失败不应影响主流程
    }
}

/** 获取源文件 glob 模式 */
function getSourceGlobPatterns(): string[] {
    return ["**/*.js", "**/*.ts", "**/*.jsx", "**/*.tsx", "**/*.vue"];
}

/** 获取源文件列表 */
async function listSourceFiles(projectDir: string): Promise<string[]> {
    return globby(getSourceGlobPatterns(), {
        cwd: projectDir,
        ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
        absolute: true,
    });
}

/** 确保项目索引可用（支持多 Agent 并发安全） */
async function ensureProjectIndexer(projectDir: string, agent?: string): Promise<ProjectIndexer> {
    const resolvedDir = resolve(projectDir);
    const cached = projectIndexerCache.get(resolvedDir);

    // 1. 内存缓存有效时，尝试刷新磁盘最新状态
    if (cached?.isValid()) {
        try {
            const disk = new ProjectIndexer(resolvedDir);
            if (disk.isValid()) {
                const diskMeta = disk.getMeta();
                const cachedMeta = cached.getMeta();
                if (diskMeta.updatedAt > cachedMeta.updatedAt) {
                    cached.reload();
                }
            }
        } catch {
            // 刷新失败继续使用缓存
        }
        return cached;
    }

    // 2. 无缓存或缓存无效：尝试直接读取磁盘索引
    const indexer = new ProjectIndexer(resolvedDir);
    if (indexer.isValid()) {
        projectIndexerCache.set(resolvedDir, indexer);
        return indexer;
    }

    // 3. 磁盘索引无效：加锁后双检锁，避免多 Agent 同时全量重建
    let lock: Awaited<ReturnType<typeof acquireIndexLock>> | undefined;
    try {
        lock = await acquireIndexLock({ projectDir: resolvedDir, agent });

        // 锁内再次检查缓存和磁盘（可能其他进程已建好）
        const cachedAfterLock = projectIndexerCache.get(resolvedDir);
        if (cachedAfterLock?.isValid()) {
            return cachedAfterLock;
        }

        const indexerAfterLock = new ProjectIndexer(resolvedDir);
        if (indexerAfterLock.isValid()) {
            projectIndexerCache.set(resolvedDir, indexerAfterLock);
            return indexerAfterLock;
        }

        const files = await listSourceFiles(resolvedDir);
        await indexerAfterLock.buildIndex(files);
        projectIndexerCache.set(resolvedDir, indexerAfterLock);
        return indexerAfterLock;
    } finally {
        lock?.release();
    }
}

/** v3.13.0: 解析上下文扫描目标文件列表 */
async function resolveContextFiles(
    context: import("./types.js").ScanContext,
    projectDir: string,
    agent?: string
): Promise<{ primaryFile: string; expandedFiles: string[] }> {
    const primaryFile = resolve(projectDir, context.file);
    const expandedFiles: string[] = [];

    if (context.expand) {
        const indexer = await ensureProjectIndexer(projectDir, agent);
        const importers = indexer.getTransitiveImporters(primaryFile);
        const maxExpanded = 50;
        for (const file of importers.slice(0, maxExpanded)) {
            if (file !== primaryFile) {
                expandedFiles.push(file);
            }
        }
    }

    return { primaryFile, expandedFiles };
}

/** 判断 issue 行范围是否与上下文范围相交 */
function issueIntersectsRange(issue: Issue, range: import("./types.js").ScanContextRange): boolean {
    const startLine = issue.line ?? 1;
    const endLine = issue.endLine ?? issue.line ?? 1;
    const rangeStart = range.startLine ?? 1;
    const rangeEnd = range.endLine ?? rangeStart;
    return startLine <= rangeEnd && endLine >= rangeStart;
}

/** 注册指定模块的规则 */
function registerModuleRules(engine: RuleEngine, moduleName?: string): void {
    if (!moduleName || moduleName === "all") {
        for (const rules of Object.values(MODULE_RULES)) {
            engine.registerAll(rules);
        }
        return;
    }
    const rules = MODULE_RULES[moduleName];
    if (rules) {
        engine.registerAll(rules);
    }
}

/** 文本内容结果 */
function textResult(text: string, isError = false): MCPToolResult {
    return { content: [{ type: "text", text }], isError };
}

/** 扫描结果聚合 */
function aggregateScanResults(results: ScanResult[]): ScanResult {
    const issues: Record<Severity, Issue[]> = {
        critical: [],
        warning: [],
        suggestion: [],
    };
    let total = 0;
    let duration = 0;
    let filesScanned = 0;
    let filesWithIssues = 0;
    for (const r of results) {
        issues.critical.push(...r.issues.critical);
        issues.warning.push(...r.issues.warning);
        issues.suggestion.push(...r.issues.suggestion);
        total += r.total;
        duration += r.duration;
        filesScanned = Math.max(filesScanned, r.filesScanned);
        if (r.filesWithIssues > 0) filesWithIssues += r.filesWithIssues;
    }
    return { module: "all", total, issues, duration, filesScanned, filesWithIssues };
}

/** 格式化扫描结果为 Markdown（供非 json 模式使用） */
function formatScanMarkdown(result: ScanResult): string {
    const lines = [
        `# frontend-guardian 扫描报告`,
        ``,
        `- 模块: ${result.module}`,
        `- 扫描文件: ${result.filesScanned}`,
        `- 问题文件: ${result.filesWithIssues}`,
        `- 耗时: ${result.duration}ms`,
        `- Critical: ${result.issues.critical.length}`,
        `- Warning: ${result.issues.warning.length}`,
        `- Suggestion: ${result.issues.suggestion.length}`,
        ``,
    ];
    for (const sev of ["critical", "warning", "suggestion"] as Severity[]) {
        const list = result.issues[sev];
        if (list.length === 0) continue;
        lines.push(`## ${sev.toUpperCase()}`);
        for (const issue of list.slice(0, 50)) {
            lines.push(`- [${issue.ruleId}] ${issue.file}:${issue.line} ${issue.title}`);
            if (issue.description) lines.push(`  ${issue.description}`);
        }
        if (list.length > 50) lines.push(`  ... 还有 ${list.length - 50} 条`);
        lines.push("");
    }
    return lines.join("\n");
}

/** 解析 severity */
function parseSeverity(value?: string): Severity | undefined {
    if (value === "critical" || value === "warning" || value === "suggestion") return value;
    return undefined;
}

/** ───────────────────────────────────────────────────────────────────────── */
/** 工具 Schema 定义                                                          */
/** ───────────────────────────────────────────────────────────────────────── */

export function getToolDefinitions(): Tool[] {
    return [
        {
            name: "scan",
            description:
                "Run a frontend governance scan on the project. " +
                "Optionally filter by module (i18n, performance, a11y, security, naming, cross-file, component, hooks, platform, svelte, e2e, all), " +
                "severity level, or file scope (staged, diff, specific files). " +
                "Returns a structured report with issues grouped by severity.",
            inputSchema: {
                type: "object",
                properties: {
                    module: {
                        type: "string",
                        description: "Module to scan. Default is 'all'.",
                    },
                    severity: {
                        type: "string",
                        enum: ["critical", "warning", "suggestion"],
                        description: "Minimum severity level. Default is suggestion.",
                    },
                    files: {
                        type: "array",
                        items: { type: "string" },
                        description: "Specific file patterns to scan.",
                    },
                    staged: {
                        type: "boolean",
                        description: "Only scan git staged files.",
                    },
                    diff: {
                        type: "string",
                        description: "Git diff range, e.g. main...feature.",
                    },
                    autoScope: {
                        type: "boolean",
                        description: "Auto-detect changed files.",
                    },
                    external: {
                        type: "boolean",
                        description: "Run external tools (ESLint, TypeScript, Stylelint).",
                    },
                    fix: {
                        type: "boolean",
                        description: "Apply auto-fixes during scan.",
                    },
                    dryRun: {
                        type: "boolean",
                        description: "Preview fixes without writing files.",
                    },
                    json: {
                        type: "boolean",
                        description: "Return JSON output instead of Markdown.",
                    },
                    // v3.13.0: 编辑器上下文感知扫描
                    context: {
                        type: "object",
                        description:
                            "Editor context for focused scan. Provide file path and optionally range, unsaved content, or expand to related files.",
                        properties: {
                            file: {
                                type: "string",
                                description: "Absolute or relative path to the file being edited.",
                            },
                            range: {
                                type: "object",
                                description: "Line range to focus on (1-based, inclusive).",
                                properties: {
                                    startLine: { type: "number" },
                                    startColumn: { type: "number" },
                                    endLine: { type: "number" },
                                    endColumn: { type: "number" },
                                },
                            },
                            content: { type: "string", description: "Unsaved editor content (optional)." },
                            expand: {
                                type: "boolean",
                                description: "Expand scan to related files via import graph (default false).",
                            },
                        },
                        required: ["file"],
                    },
                    // v3.14.0: Agent 身份声明
                    agent: {
                        type: "string",
                        enum: ["claude", "cursor", "copilot", "kimi", "generic"],
                        description: "Identify the calling AI agent for shared index coordination.",
                    },
                },
            },
        },
        {
            name: "fix",
            description:
                "Apply auto-fixes for governance issues found in the project. " +
                "Can run a scan first and apply fixes, or show a diff preview in dry-run mode. " +
                "Returns a summary of changes made.",
            inputSchema: {
                type: "object",
                properties: {
                    module: { type: "string", description: "Module to scan and fix." },
                    severity: {
                        type: "string",
                        enum: ["critical", "warning", "suggestion"],
                        description: "Minimum severity level.",
                    },
                    files: {
                        type: "array",
                        items: { type: "string" },
                        description: "Specific file patterns to scan.",
                    },
                    staged: { type: "boolean", description: "Only scan git staged files." },
                    diff: { type: "string", description: "Git diff range, e.g. main...feature." },
                    dryRun: { type: "boolean", description: "Show diff preview without applying." },
                    json: { type: "boolean", description: "Return JSON output." },
                    // v3.13.0: 编辑器上下文感知修复
                    context: {
                        type: "object",
                        description:
                            "Editor context for focused fix. Provide file path and optionally range, unsaved content, or expand to related files.",
                        properties: {
                            file: {
                                type: "string",
                                description: "Absolute or relative path to the file being edited.",
                            },
                            range: {
                                type: "object",
                                description: "Line range to focus on (1-based, inclusive).",
                                properties: {
                                    startLine: { type: "number" },
                                    startColumn: { type: "number" },
                                    endLine: { type: "number" },
                                    endColumn: { type: "number" },
                                },
                            },
                            content: { type: "string", description: "Unsaved editor content (optional)." },
                            expand: {
                                type: "boolean",
                                description: "Expand scan to related files via import graph (default false).",
                            },
                        },
                        required: ["file"],
                    },
                    // v3.14.0: Agent 身份声明
                    agent: {
                        type: "string",
                        enum: ["claude", "cursor", "copilot", "kimi", "generic"],
                        description: "Identify the calling AI agent for shared index coordination.",
                    },
                },
            },
        },
        {
            name: "e2e-run",
            description:
                "Run Playwright E2E tests and return a governance report. " +
                "Detects Playwright configuration automatically. " +
                "Returns test failures as structured issues.",
            inputSchema: {
                type: "object",
                properties: {
                    json: { type: "boolean", description: "Return JSON output." },
                },
            },
        },
        {
            name: "e2e-detect-gaps",
            description:
                "Detect E2E test coverage gaps by comparing project routes and APIs " +
                "against existing E2E test files. Returns uncovered pages, uncovered APIs, " +
                "and suggested test files.",
            inputSchema: {
                type: "object",
                properties: {
                    json: { type: "boolean", description: "Return JSON output." },
                },
            },
        },
        {
            name: "list-rules",
            description:
                "List all available governance rules, optionally filtered by module, framework, or severity. " +
                "Useful for understanding what the scanner checks.",
            inputSchema: {
                type: "object",
                properties: {
                    module: { type: "string", description: "Filter by module name." },
                    framework: { type: "string", description: "Filter by framework." },
                    platform: { type: "string", description: "Filter by platform." },
                    componentLib: { type: "string", description: "Filter by component library." },
                },
            },
        },
        {
            name: "scan-file",
            description:
                "Scan a single file for governance issues. Fast, useful for real-time feedback " +
                "on the current file being edited.",
            inputSchema: {
                type: "object",
                properties: {
                    filePath: {
                        type: "string",
                        description: "Absolute path to the file to scan.",
                    },
                    module: { type: "string", description: "Optional module to restrict rules." },
                },
                required: ["filePath"],
            },
        },
        {
            name: "page-health",
            description:
                "Run a page health check by launching a browser and traversing routes. " +
                "Detects white screens, console errors, HTTP errors, resource loading failures, " +
                "visual regressions, Core Web Vitals, and runtime accessibility issues. " +
                "Requires Playwright to be installed in the project.",
            inputSchema: {
                type: "object",
                properties: {
                    baseUrl: { type: "string", description: "Base URL like http://localhost:3000" },
                    serveCommand: {
                        type: "string",
                        description: "Command to start dev server, e.g. 'npm run dev'.",
                    },
                    port: { type: "number", description: "Dev server port." },
                    routes: {
                        type: "array",
                        items: { type: "string" },
                        description: "Explicit routes to check.",
                    },
                    screenshot: { type: "boolean", description: "Take screenshots.", default: true },
                    concurrency: {
                        type: "number",
                        description: "Concurrent page checks. Default 3.",
                        default: 3,
                    },
                    json: { type: "boolean", description: "Return JSON output." },
                    screenshotSelector: {
                        type: "string",
                        description: "CSS selector for element-level screenshot instead of full page.",
                    },
                    maxDiffPixels: {
                        type: "number",
                        description: "Visual regression max absolute diff pixels. Default 100.",
                    },
                    maxDiffPixelRatio: {
                        type: "number",
                        description: "Visual regression max diff pixel ratio. Default 0.01.",
                    },
                    noMask: { type: "boolean", description: "Disable dynamic content masking." },
                    maskSelectors: {
                        type: "array",
                        items: { type: "string" },
                        description: "Additional CSS selectors to mask before screenshot.",
                    },
                    metrics: {
                        type: "boolean",
                        description: "Enable Lighthouse Core Web Vitals collection.",
                    },
                    a11y: {
                        type: "boolean",
                        description: "Enable axe-core runtime accessibility checks.",
                    },
                    a11yTags: {
                        type: "array",
                        items: { type: "string" },
                        description: "Axe tags to filter, e.g. ['wcag2a', 'wcag2aa'].",
                    },
                    browser: {
                        type: "string",
                        enum: ["chromium", "firefox", "webkit", "all"],
                        description: "Browser engine for page-health. Default: chromium.",
                    },
                    device: {
                        type: "string",
                        description: "Playwright device to emulate, e.g. 'iPhone 14 Pro'.",
                    },
                    viewport: {
                        type: "string",
                        description: "Viewport size as 'WxH', e.g. '390x844'.",
                    },
                    viewportMobile: {
                        type: "boolean",
                        description: "Use mobile viewport preset.",
                    },
                },
            },
        },
        {
            name: "mini-program",
            description:
                "Run automated WeChat/Alipay/Douyin mini-program testing. " +
                "Detects the project type automatically, validates pages, checks package size, " +
                "and optionally captures a homepage screenshot baseline.",
            inputSchema: {
                type: "object",
                properties: {
                    platform: {
                        type: "string",
                        enum: ["wechat", "alipay", "douyin", "auto", "all"],
                        description: "Mini-program platform. Default: auto.",
                    },
                    screenshot: {
                        type: "boolean",
                        description: "Capture homepage screenshot baseline.",
                    },
                    updateBaseline: {
                        type: "boolean",
                        description: "Update the screenshot baseline.",
                    },
                    json: { type: "boolean", description: "Return JSON output instead of Markdown." },
                    performance: {
                        type: "boolean",
                        description:
                            "Enable mini-program performance collection (build metrics, setData analysis, runtime thresholds).",
                    },
                    performanceThresholds: {
                        type: "object",
                        description: "Optional thresholds for performance issues.",
                        properties: {
                            startup: { type: "number", description: "Startup time threshold in milliseconds." },
                            fps: { type: "number", description: "Minimum acceptable FPS." },
                            setDataCount: { type: "number", description: "Max setData calls per page." },
                            setDataPayloadBytes: {
                                type: "number",
                                description: "Max average setData payload in bytes.",
                            },
                            packageSize: { type: "number", description: "Max package size in bytes." },
                            pageSize: { type: "number", description: "Max page size in bytes." },
                        },
                    },
                    // v3.12.0
                    crossPlatformDiff: {
                        type: "boolean",
                        description:
                            "Enable cross-platform screenshot diff (requires platform=all and screenshot=true).",
                    },
                    diffMode: {
                        type: "string",
                        enum: ["reference", "pairwise"],
                        description: "Cross-platform diff mode. Default: reference.",
                    },
                    diffReferencePlatform: {
                        type: "string",
                        enum: ["wechat", "alipay", "douyin"],
                        description: "Reference platform for reference mode. Default: wechat.",
                    },
                    diffPages: {
                        type: "array",
                        items: { type: "string" },
                        description: "Pages to diff (defaults to first 10 pages from app.json).",
                    },
                    diffMaxPages: {
                        type: "number",
                        description: "Max pages to diff. Default: 10.",
                    },
                    diffThresholdPixels: {
                        type: "number",
                        description: "Diff pixel threshold. Default: 100.",
                    },
                    diffThresholdRatio: {
                        type: "number",
                        description: "Diff pixel ratio threshold. Default: 0.01.",
                    },
                },
            },
        },
        {
            name: "ai-fix",
            description:
                "Generate AI-powered fix suggestions for issues that don't have automatic fixes. " +
                "Requires FG_AI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY environment variable.",
            inputSchema: {
                type: "object",
                properties: {
                    module: { type: "string", description: "Module to scan." },
                    severity: {
                        type: "string",
                        enum: ["critical", "warning", "suggestion"],
                        description: "Minimum severity level.",
                    },
                    maxSuggestions: {
                        type: "number",
                        description: "Max suggestions to generate. Default 5.",
                        default: 5,
                    },
                    json: { type: "boolean", description: "Return JSON output." },
                },
            },
        },
        {
            name: "get-project-meta",
            description:
                "Detect and return project metadata: framework, component library, platforms, " +
                "TypeScript usage, i18n setup, etc.",
            inputSchema: { type: "object" },
        },
        {
            name: "index-project",
            description: "Build or query the project index (file structure, symbols, routes, import graph).",
            inputSchema: {
                type: "object",
                properties: {
                    action: {
                        type: "string",
                        enum: ["build", "status"],
                        description: "Query existing index or rebuild it.",
                        default: "status",
                    },
                    json: { type: "boolean", description: "Return JSON output." },
                    // v3.14.0: Agent 身份声明
                    agent: {
                        type: "string",
                        enum: ["claude", "cursor", "copilot", "kimi", "generic"],
                        description: "Identify the calling AI agent for shared index coordination.",
                    },
                },
            },
        },
        // v3.14.0: 多 Agent 协作
        {
            name: "register-agent",
            description:
                "Register the current AI agent session (Claude Code, Cursor, Copilot, Kimi Code, etc.) " +
                "so that multiple agents can share the same project index and see each other.",
            inputSchema: {
                type: "object",
                properties: {
                    agent: {
                        type: "string",
                        enum: ["claude", "cursor", "copilot", "kimi", "generic"],
                        description: "The AI agent kind.",
                    },
                    id: {
                        type: "string",
                        description: "Optional stable agent session identifier. If omitted, one is generated.",
                    },
                    json: { type: "boolean", description: "Return JSON output." },
                },
                required: ["agent"],
            },
        },
        {
            name: "list-agents",
            description:
                "List currently active AI agents that are sharing this project's index. " +
                "Agents that have not sent a heartbeat recently are automatically pruned.",
            inputSchema: {
                type: "object",
                properties: {
                    json: { type: "boolean", description: "Return JSON output." },
                },
            },
        },
        {
            name: "recommend-tests",
            description:
                "Intelligently recommend which tests to run based on changed files. " +
                "Analyzes git diff, import graph, and route mappings to determine the minimal set of tests " +
                "that cover the code changes. Supports staged files, diff ranges, or explicit file lists.",
            inputSchema: {
                type: "object",
                properties: {
                    scope: {
                        type: "string",
                        enum: ["staged", "diff", "auto", "explicit"],
                        description: "How to determine changed files. Default: auto.",
                    },
                    diffRange: {
                        type: "string",
                        description: "Git diff range when scope=diff, e.g. main...feature.",
                    },
                    changedFiles: {
                        type: "array",
                        items: { type: "string" },
                        description: "Explicit changed file paths when scope=explicit.",
                    },
                    minPriority: {
                        type: "number",
                        enum: [1, 2, 3],
                        description: "Minimum priority: 1=direct imports only, 2=+transitive, 3=+route-related.",
                        default: 1,
                    },
                    json: { type: "boolean", description: "Return JSON output instead of Markdown." },
                    flakyThresholds: {
                        type: "object",
                        description: "Thresholds for flaky test detection based on historical test data.",
                        properties: {
                            failureRate: { type: "number", description: "Failure rate threshold (default 0.2)." },
                            flipRate: { type: "number", description: "Status flip rate threshold (default 0.15)." },
                            minRuns: { type: "number", description: "Minimum historical runs required (default 3)." },
                        },
                    },
                },
            },
        },
    ];
}

/** ───────────────────────────────────────────────────────────────────────── */
/** 工具调用分发器                                                            */
/** ───────────────────────────────────────────────────────────────────────── */

export async function handleToolCall(
    name: string,
    args: MCPToolArgs,
    options: MCPServerOptions
): Promise<MCPToolResult> {
    try {
        switch (name) {
            case "scan":
                return handleScan(args as import("./types.js").ScanToolArgs, options);
            case "fix":
                return handleFix(args as import("./types.js").FixToolArgs, options);
            case "e2e-run":
                return handleE2ERun(args as import("./types.js").E2ERunToolArgs, options);
            case "e2e-detect-gaps":
                return handleE2EDetectGaps(args as import("./types.js").E2EDetectGapsToolArgs, options);
            case "list-rules":
                return handleListRules(args as import("./types.js").ListRulesToolArgs, options);
            case "scan-file":
                return handleScanFile(args as import("./types.js").ScanFileToolArgs, options);
            case "page-health":
                return handlePageHealth(args as import("./types.js").PageHealthToolArgs, options);
            case "mini-program":
                return handleMiniProgram(args as import("./types.js").MiniProgramToolArgs, options);
            case "ai-fix":
                return handleAIFix(args as import("./types.js").AIFixToolArgs, options);
            case "get-project-meta":
                return handleGetProjectMeta(args as Record<string, never>, options);
            case "index-project":
                return handleIndexProject(args as import("./types.js").IndexProjectToolArgs, options);
            // v3.14.0: 多 Agent 协作
            case "register-agent":
                return handleRegisterAgent(args as import("./types.js").RegisterAgentToolArgs, options);
            case "list-agents":
                return handleListAgents(args as import("./types.js").ListAgentsToolArgs, options);
            case "recommend-tests":
                return handleRecommendTests(args as import("./types.js").RecommendTestsToolArgs, options);
            default:
                return textResult(`Unknown tool: ${name}`, true);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return textResult(`Tool ${name} failed: ${message}`, true);
    }
}

/** ───────────────────────────────────────────────────────────────────────── */
/** 各工具实现                                                                */
/** ───────────────────────────────────────────────────────────────────────── */

async function handleContextScan(
    args: import("./types.js").ScanToolArgs,
    options: MCPServerOptions
): Promise<{ scan: ScanResult; fixResult?: ReturnType<RuleEngine["applyFixes"]>; diffs?: Record<string, string> }> {
    const moduleName = args.module || "context";
    const context = args.context;
    if (!context) {
        throw new Error("Context is required for context-aware scan");
    }
    const { primaryFile, expandedFiles } = await resolveContextFiles(context, options.projectDir, args.agent);
    const hasContent = context.content !== undefined;
    const contextContent = context.content;
    const contextRange = context.range;

    const engine = createMcpEngine(options, {
        minSeverity: parseSeverity(args.severity),
        files: expandedFiles,
        external: args.external,
        dryRun: args.dryRun,
    });
    registerModuleRules(engine, moduleName === "context" ? "all" : moduleName);

    const allIssues: Issue[] = [];

    // 主文件扫描（支持内存中的未保存内容）
    const primaryModule = moduleName === "context" || moduleName === "all" ? undefined : moduleName;
    const primaryIssues = await engine.scanSingleFile(
        primaryFile,
        primaryModule,
        hasContent ? contextContent : undefined
    );
    allIssues.push(...primaryIssues);

    // 扩展文件扫描（基于 import 图）
    if (expandedFiles.length > 0) {
        if (moduleName === "context" || moduleName === "all") {
            for (const mod of MODULES) {
                const r = await engine.scan(mod);
                allIssues.push(...r.issues.critical, ...r.issues.warning, ...r.issues.suggestion);
            }
        } else {
            const r = await engine.scan(moduleName);
            allIssues.push(...r.issues.critical, ...r.issues.warning, ...r.issues.suggestion);
        }
    }

    // 范围过滤（仅对主文件）
    let filteredIssues = allIssues;
    if (contextRange) {
        filteredIssues = allIssues.filter((i) => i.file !== primaryFile || issueIntersectsRange(i, contextRange));
    }

    const issues: Record<Severity, Issue[]> = { critical: [], warning: [], suggestion: [] };
    for (const issue of filteredIssues) {
        issues[issue.severity].push(issue);
    }

    const scan: ScanResult = {
        module: moduleName,
        total: filteredIssues.length,
        issues,
        duration: 0,
        filesScanned: (hasContent ? 0 : 1) + expandedFiles.length,
        filesWithIssues: new Set(filteredIssues.map((i) => i.file)).size,
    };

    let fixResult: ReturnType<RuleEngine["applyFixes"]> | undefined;
    const diffs: Record<string, string> = {};

    if ((args.fix || args.dryRun) && filteredIssues.some((i) => i.file === primaryFile && i.fix)) {
        const fixable = filteredIssues.filter(
            (i) => i.file === primaryFile && i.fix && (!contextRange || issueIntersectsRange(i, contextRange))
        );

        const originalSource = hasContent ? (contextContent as string) : readFileSync(primaryFile, "utf-8");

        fixResult = engine.applyFixes(fixable, {
            sourceOverrides: { [primaryFile]: originalSource },
            writeFiles: !hasContent,
        });

        const patchedSource = fixResult.patchedSources?.[primaryFile];
        if (patchedSource !== undefined) {
            diffs[primaryFile] = createUnifiedDiff(primaryFile, originalSource, patchedSource);
        }
    }

    return { scan, fixResult, diffs };
}

async function handleScan(args: import("./types.js").ScanToolArgs, options: MCPServerOptions): Promise<MCPToolResult> {
    // v3.14.0: 记录 Agent 心跳
    recordAgentHeartbeat(options.projectDir, args.agent);

    // v3.13.0: 上下文感知扫描分支
    if (args.context) {
        const { scan, fixResult, diffs } = await handleContextScan(args, options);

        if (args.fix || args.dryRun) {
            const payload = { scan, fix: fixResult ?? { fixedCount: 0, filesModified: [], errors: [] }, diffs };
            if (args.json) {
                return textResult(JSON.stringify(payload, null, 2));
            }
            return textResult(formatFixMarkdown(payload.fix, scan, diffs));
        }

        if (args.json) {
            return textResult(JSON.stringify(scan, null, 2));
        }
        return textResult(formatScanMarkdown(scan));
    }

    const moduleName = args.module || "all";
    const engine = createMcpEngine(options, {
        minSeverity: parseSeverity(args.severity),
        files: args.files,
        staged: args.staged,
        diffRange: args.diff,
        autoScope: args.autoScope,
        external: args.external,
        dryRun: args.dryRun,
    });

    registerModuleRules(engine, moduleName);

    let result: ScanResult;
    if (moduleName === "all") {
        const results: ScanResult[] = [];
        for (const mod of MODULES) {
            results.push(await engine.scan(mod));
        }
        result = aggregateScanResults(results);
    } else {
        result = await engine.scan(moduleName);
    }

    if (args.fix || args.dryRun) {
        const fixable = [...result.issues.critical, ...result.issues.warning, ...result.issues.suggestion].filter(
            (i) => i.fix
        );
        if (fixable.length > 0) {
            const fixResult = engine.applyFixes(fixable);
            if (args.json) {
                return textResult(JSON.stringify({ scan: result, fix: fixResult }, null, 2));
            }
            return textResult(formatFixMarkdown(fixResult, result));
        }
    }

    if (args.json) {
        return textResult(JSON.stringify(result, null, 2));
    }
    return textResult(formatScanMarkdown(result));
}

async function handleFix(args: import("./types.js").FixToolArgs, options: MCPServerOptions): Promise<MCPToolResult> {
    // fix 等价于 scan + fix/dryRun
    return handleScan(
        {
            ...args,
            fix: !args.dryRun,
            module: args.module || "all",
        },
        options
    );
}

function formatFixMarkdown(
    fixResult: ReturnType<RuleEngine["applyFixes"]>,
    scanResult: ScanResult,
    diffs?: Record<string, string>
): string {
    const lines = [
        `# 自动修复报告`,
        ``,
        `- 模块: ${scanResult.module}`,
        `- 修复数: ${fixResult.fixedCount}`,
        `- 修改文件: ${fixResult.filesModified.length}`,
        `- 跳过: ${fixResult.skippedByUser ?? 0}`,
        `- 错误: ${fixResult.errors.length}`,
        ``,
    ];
    if (fixResult.previews && fixResult.previews.length > 0) {
        lines.push(`## 修复预览`);
        for (const p of fixResult.previews) {
            lines.push(`### ${p.file} [${p.ruleId}]`);
            lines.push(p.diff);
            lines.push("");
        }
    }
    if (diffs && Object.keys(diffs).length > 0) {
        lines.push(`## Unified Diff`);
        for (const [file, diff] of Object.entries(diffs)) {
            lines.push(`### ${file}`);
            lines.push("```diff");
            lines.push(diff);
            lines.push("```");
            lines.push("");
        }
    }
    if (fixResult.filesModified.length > 0) {
        lines.push(`## 已修改文件`);
        for (const f of fixResult.filesModified) {
            lines.push(`- ${f}`);
        }
    }
    if (fixResult.errors.length > 0) {
        lines.push(`## 错误`);
        for (const e of fixResult.errors) {
            lines.push(`- ${e}`);
        }
    }
    return lines.join("\n");
}

async function handleE2ERun(
    args: import("./types.js").E2ERunToolArgs,
    options: MCPServerOptions
): Promise<MCPToolResult> {
    if (!playwrightIntegration.isAvailable(options.projectDir)) {
        return textResult(
            "Playwright is not available in this project. " +
                "Please install @playwright/test or add a playwright.config.{ts,js,mjs,cjs} file.",
            true
        );
    }
    const issues = playwrightIntegration.run(options.projectDir);
    if (args.json) {
        return textResult(JSON.stringify({ issues }, null, 2));
    }
    const lines = ["# Playwright E2E 测试结果", "", `失败/超时 Issue: ${issues.length}`, ""];
    for (const issue of issues) {
        lines.push(`- [${issue.severity}] ${issue.file}:${issue.line} ${issue.title}`);
        if (issue.description) lines.push(`  ${issue.description}`);
    }
    return textResult(lines.join("\n"));
}

async function handleE2EDetectGaps(
    args: import("./types.js").E2EDetectGapsToolArgs,
    options: MCPServerOptions
): Promise<MCPToolResult> {
    const result = detectE2EGaps({ projectDir: options.projectDir });
    if (args.json) {
        return textResult(JSON.stringify(formatE2EGapJson(result), null, 2));
    }
    return textResult(formatE2EGapMarkdown(result));
}

function formatE2EGapMarkdown(result: ReturnType<typeof detectE2EGaps>): string {
    const lines = [
        `# E2E 覆盖缺口检测`,
        ``,
        `- 页面覆盖率: ${result.pageCoverage}%`,
        `- 接口覆盖率: ${result.apiCoverage}%`,
        `- 未覆盖页面: ${result.uncoveredPages.length}`,
        `- 未覆盖接口: ${result.uncoveredApis.length}`,
        `- 建议测试: ${result.suggestions.length}`,
        ``,
    ];
    if (result.uncoveredPages.length > 0) {
        lines.push(`## 未覆盖页面`);
        for (const p of result.uncoveredPages) {
            lines.push(`- ${p.path} (${p.framework})`);
        }
        lines.push("");
    }
    if (result.suggestions.length > 0) {
        lines.push(`## 建议生成测试文件`);
        for (const s of result.suggestions) {
            lines.push(`- ${s.suggestedFileName}: ${s.reason}`);
        }
    }
    return lines.join("\n");
}

async function handleListRules(
    args: import("./types.js").ListRulesToolArgs,
    options: MCPServerOptions
): Promise<MCPToolResult> {
    const engine = createMcpEngine(options);
    registerModuleRules(engine, args.module);
    const rules = engine.getRules();
    const filtered = rules.filter((r) => {
        if (args.framework && r.frameworks && !r.frameworks.includes(args.framework as Framework)) return false;
        if (args.platform && r.platforms && !r.platforms.includes(args.platform as Platform)) return false;
        if (args.componentLib && r.componentLibs && !r.componentLibs.includes(args.componentLib as ComponentLib))
            return false;
        return true;
    });
    const list = filtered.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        severity: r.severity,
        category: r.category,
        docsUrl: r.docsUrl,
    }));
    return textResult(JSON.stringify(list, null, 2));
}

async function handleScanFile(
    args: import("./types.js").ScanFileToolArgs,
    options: MCPServerOptions
): Promise<MCPToolResult> {
    const engine = createMcpEngine(options);
    registerModuleRules(engine, args.module || "all");
    const issues = await engine.scanSingleFile(args.filePath, args.module);
    return textResult(JSON.stringify(issues, null, 2));
}

async function handlePageHealth(
    args: import("./types.js").PageHealthToolArgs,
    options: MCPServerOptions
): Promise<MCPToolResult> {
    if (!isPlaywrightAvailable()) {
        return textResult("Playwright is not installed. Please run: npm install -D playwright", true);
    }
    const result = await runPageHealthCheck({
        projectDir: options.projectDir,
        baseUrl: args.baseUrl,
        serveCommand: args.serveCommand,
        servePort: args.port,
        routes: args.routes,
        screenshot: args.screenshot,
        concurrency: args.concurrency,
        // v3.10.0
        screenshotSelector: args.screenshotSelector,
        maxDiffPixels: args.maxDiffPixels,
        maxDiffPixelRatio: args.maxDiffPixelRatio,
        noMask: args.noMask,
        maskSelectors: args.maskSelectors,
        metrics: args.metrics,
        cwvThresholds: args.cwvThresholds,
        a11y: args.a11y,
        a11yTags: args.a11yTags,
        // v3.10.1
        browser: args.browser,
        device: args.device,
        viewport: args.viewport,
        viewportMobile: args.viewportMobile,
    });
    if (args.json) {
        return textResult(JSON.stringify(formatPageHealthJson(result), null, 2));
    }
    return textResult(formatPageHealthMarkdown(result));
}

function formatPageHealthMarkdown(result: Awaited<ReturnType<typeof runPageHealthCheck>>): string {
    const lines = [
        `# 页面健康检查`,
        ``,
        `- baseUrl: ${result.baseUrl}`,
        `- 检查路由: ${result.checkedRoutes.length}`,
        `- Issue 数: ${result.issues.length}`,
        `- 耗时: ${result.duration}ms`,
        ``,
    ];
    if (result.issues.length > 0) {
        lines.push(`## Issues`);
        for (const issue of result.issues) {
            lines.push(`- [${issue.severity}] ${issue.file}:${issue.line} ${issue.title}`);
        }
    }
    return lines.join("\n");
}

async function handleMiniProgram(
    args: import("./types.js").MiniProgramToolArgs,
    options: MCPServerOptions
): Promise<MCPToolResult> {
    const result = await runMiniProgramTest({
        projectDir: options.projectDir,
        platform: args.platform || "auto",
        screenshot: args.screenshot,
        updateBaseline: args.updateBaseline,
        performance: args.performance,
        performanceThresholds: args.performanceThresholds,
        // v3.12.0
        crossPlatformDiff: args.crossPlatformDiff,
        diffMode: args.diffMode,
        diffReferencePlatform: args.diffReferencePlatform,
        diffPages: args.diffPages,
        diffMaxPages: args.diffMaxPages,
        diffThresholdPixels: args.diffThresholdPixels,
        diffThresholdRatio: args.diffThresholdRatio,
    });
    if (args.json) {
        return textResult(JSON.stringify(formatMiniProgramJson(result), null, 2));
    }
    return textResult(formatMiniProgramReport(result));
}

async function handleAIFix(
    args: import("./types.js").AIFixToolArgs,
    options: MCPServerOptions
): Promise<MCPToolResult> {
    const moduleName = args.module || "all";
    const engine = createMcpEngine(options, { minSeverity: parseSeverity(args.severity) });
    registerModuleRules(engine, moduleName);

    const issues: Issue[] = [];
    if (moduleName === "all") {
        for (const mod of MODULES) {
            const r = await engine.scan(mod);
            issues.push(...r.issues.critical, ...r.issues.warning, ...r.issues.suggestion);
        }
    } else {
        const r = await engine.scan(moduleName);
        issues.push(...r.issues.critical, ...r.issues.warning, ...r.issues.suggestion);
    }

    // 只给没有自动修复的问题生成 AI 建议
    const candidates = issues.filter((i) => !i.fix).slice(0, args.maxSuggestions ?? 5);
    if (candidates.length === 0) {
        return textResult("No fixable issues without automatic fixes were found.");
    }

    const suggestions = await generateAIFixSuggestions(candidates, options.projectDir);
    if (args.json) {
        return textResult(JSON.stringify(suggestions, null, 2));
    }
    const lines = ["# AI 修复建议", ""];
    for (const s of suggestions) {
        lines.push(`- [${s.confidence}] ${s.issue.ruleId}: ${s.fix}`);
        lines.push(`  说明: ${s.explanation}`);
    }
    return textResult(lines.join("\n"));
}

async function handleGetProjectMeta(_args: Record<string, never>, options: MCPServerOptions): Promise<MCPToolResult> {
    const meta = detectProjectMeta(options.projectDir);
    return textResult(JSON.stringify(meta, null, 2));
}

async function handleIndexProject(
    args: import("./types.js").IndexProjectToolArgs,
    options: MCPServerOptions
): Promise<MCPToolResult> {
    // v3.14.0: 记录 Agent 心跳
    recordAgentHeartbeat(options.projectDir, args.agent);

    let indexer: ProjectIndexer;
    let builtByThisCall = false;

    if (args.action === "build") {
        let lock: Awaited<ReturnType<typeof acquireIndexLock>> | undefined;
        try {
            lock = await acquireIndexLock({ projectDir: options.projectDir, agent: args.agent });

            // 双检锁：可能其他进程已经建好
            const cached = projectIndexerCache.get(resolve(options.projectDir));
            if (cached?.isValid()) {
                indexer = cached;
            } else {
                indexer = new ProjectIndexer(options.projectDir);
                if (!indexer.isValid()) {
                    const files = await listSourceFiles(options.projectDir);
                    await indexer.buildIndex(files);
                    builtByThisCall = true;
                }
                projectIndexerCache.set(resolve(options.projectDir), indexer);
            }
        } finally {
            lock?.release();
        }
    } else {
        indexer = await ensureProjectIndexer(options.projectDir, args.agent);
    }

    const stats = indexer.getStats();
    const activeAgents = getAgentRegistry(options.projectDir).list();
    const payload = {
        valid: indexer.isValid(),
        stats,
        agents: activeAgents.length,
        builtByThisCall,
    };

    if (args.json) {
        return textResult(JSON.stringify(payload, null, 2));
    }
    return textResult(
        `# 项目索引\n\n- 有效: ${payload.valid}\n- 文件: ${stats.files}\n- 路由: ${stats.routes}\n- 符号: ${stats.symbols}\n- 活跃 Agent: ${payload.agents}${
            builtByThisCall ? "\n- 本次调用已重建索引" : ""
        }`
    );
}

// v3.14.0: 多 Agent 协作
async function handleRegisterAgent(
    args: import("./types.js").RegisterAgentToolArgs,
    options: MCPServerOptions
): Promise<MCPToolResult> {
    const registry = getAgentRegistry(options.projectDir);
    const info = registry.heartbeat({
        kind: args.agent,
        id: args.id,
        pid: process.pid,
    });

    if (args.json) {
        return textResult(JSON.stringify({ registered: true, agent: info }, null, 2));
    }

    return textResult(
        `# Agent 已注册\n\n- ID: ${info.id}\n- 类型: ${info.kind}\n- PID: ${info.pid}\n- 首次连接: ${new Date(info.connectedAt).toISOString()}\n- 最近心跳: ${new Date(info.lastSeenAt).toISOString()}`
    );
}

async function handleListAgents(
    args: import("./types.js").ListAgentsToolArgs,
    options: MCPServerOptions
): Promise<MCPToolResult> {
    const registry = getAgentRegistry(options.projectDir);
    const agents = registry.list();

    if (args.json) {
        return textResult(JSON.stringify({ agents }, null, 2));
    }

    if (agents.length === 0) {
        return textResult("# 活跃 Agent\n\n当前没有活跃的 Agent。");
    }

    const lines = ["# 活跃 Agent", ""];
    lines.push("| ID | 类型 | PID | 最近心跳 |");
    lines.push("|---|---|---|---|");
    for (const a of agents) {
        lines.push(`| ${a.id} | ${a.kind} | ${a.pid ?? "-"} | ${new Date(a.lastSeenAt).toISOString()} |`);
    }
    return textResult(lines.join("\n"));
}

async function handleRecommendTests(
    args: import("./types.js").RecommendTestsToolArgs,
    options: MCPServerOptions
): Promise<MCPToolResult> {
    const result = await recommendTests({
        projectDir: options.projectDir,
        staged: args.scope === "staged",
        diffRange: args.scope === "diff" ? args.diffRange : undefined,
        autoScope: args.scope === "auto" || !args.scope,
        changedFiles: args.scope === "explicit" ? args.changedFiles : undefined,
        minPriority: args.minPriority ?? 1,
        flakyThresholds: args.flakyThresholds,
    });

    if (args.json) {
        return textResult(JSON.stringify(formatRecommendationsJson(result), null, 2));
    }
    return textResult(formatRecommendations(result));
}
