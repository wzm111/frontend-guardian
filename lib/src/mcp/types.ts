/**
 * v3.8.0: MCP Server 专用类型
 */

import type { MCPServerOptions } from "./mcp-server.js";

/** 当前暴露的 MCP 工具名称 */
export type MCPToolName =
    | "scan"
    | "fix"
    | "e2e-run"
    | "e2e-detect-gaps"
    | "list-rules"
    | "scan-file"
    | "page-health"
    | "mini-program"
    | "ai-fix"
    | "get-project-meta"
    | "index-project"
    | "recommend-tests"
    // v3.14.0
    | "register-agent"
    | "list-agents"
    // v3.14.1
    | "get-usage-guidance"
    | "get-agent-preferences"
    | "set-agent-preferences";

/** v3.13.0: 编辑器上下文范围（1-based，含端点） */
export interface ScanContextRange {
    startLine: number;
    startColumn?: number;
    endLine?: number;
    endColumn?: number;
}

/** v3.13.0: 编辑器上下文 */
export interface ScanContext {
    file: string;
    range?: ScanContextRange;
    content?: string;
    expand?: boolean;
}

/** v3.14.0: 支持的 AI Agent 类型 */
export type AgentKind = "claude" | "cursor" | "copilot" | "kimi" | "generic";

/** v3.14.0: Agent 会话信息 */
export interface AgentInfo {
    id: string;
    kind: AgentKind;
    pid?: number;
    connectedAt: number;
    lastSeenAt: number;
    // v3.14.1
    guidanceVersion?: string;
    lastGuidanceAt?: number;
}

/** v3.14.0: register-agent 工具参数 */
export interface RegisterAgentToolArgs {
    agent: AgentKind;
    id?: string;
    json?: boolean;
}

/** v3.14.0: list-agents 工具参数 */
export interface ListAgentsToolArgs {
    json?: boolean;
}

/** v3.14.1: get-usage-guidance 工具参数 */
export interface GetUsageGuidanceToolArgs {
    agent?: AgentKind;
    id?: string;
    json?: boolean;
}

/** v3.14.1: get-agent-preferences 工具参数 */
export interface GetAgentPreferencesToolArgs {
    agent?: AgentKind;
    id?: string;
    json?: boolean;
}

/** v3.14.1: set-agent-preferences 工具参数 */
export interface SetAgentPreferencesToolArgs {
    agent?: AgentKind;
    id?: string;
    defaultOutput?: "json" | "markdown";
    defaultModules?: string[];
    ignoredRules?: string[];
    json?: boolean;
}

/** scan 工具参数 */
export interface ScanToolArgs {
    module?: string;
    severity?: "critical" | "warning" | "suggestion";
    files?: string[];
    staged?: boolean;
    diff?: string;
    autoScope?: boolean;
    external?: boolean;
    fix?: boolean;
    dryRun?: boolean;
    json?: boolean;
    // v3.13.0
    context?: ScanContext;
    // v3.14.0
    agent?: AgentKind;
}

/** fix 工具参数 */
export interface FixToolArgs {
    module?: string;
    severity?: "critical" | "warning" | "suggestion";
    files?: string[];
    staged?: boolean;
    diff?: string;
    dryRun?: boolean;
    json?: boolean;
    // v3.13.0
    context?: ScanContext;
    // v3.14.0
    agent?: AgentKind;
}

/** e2e-run 工具参数 */
export interface E2ERunToolArgs {
    json?: boolean;
}

/** e2e-detect-gaps 工具参数 */
export interface E2EDetectGapsToolArgs {
    json?: boolean;
}

/** list-rules 工具参数 */
export interface ListRulesToolArgs {
    module?: string;
    framework?: string;
    platform?: string;
    componentLib?: string;
}

/** scan-file 工具参数 */
export interface ScanFileToolArgs {
    filePath: string;
    module?: string;
}

/** page-health 工具参数 */
export interface PageHealthToolArgs {
    baseUrl?: string;
    serveCommand?: string;
    port?: number;
    routes?: string[];
    screenshot?: boolean;
    concurrency?: number;
    json?: boolean;
    // v3.10.0
    screenshotSelector?: string;
    maxDiffPixels?: number;
    maxDiffPixelRatio?: number;
    noMask?: boolean;
    maskSelectors?: string[];
    metrics?: boolean;
    cwvThresholds?: {
        lcp?: number;
        cls?: number;
        fcp?: number;
        ttfb?: number;
        inp?: number;
    };
    a11y?: boolean;
    a11yTags?: string[];
    // v3.10.1
    browser?: "chromium" | "firefox" | "webkit" | "all";
    device?: string;
    viewport?: string;
    viewportMobile?: boolean;
    // v3.14.1
    agent?: AgentKind;
    aiVision?: boolean;
    aiVisionStrict?: boolean;
    recordVideo?: boolean;
    videoDir?: string;
}

/** mini-program 工具参数 */
export interface MiniProgramToolArgs {
    platform?: "wechat" | "alipay" | "douyin" | "auto" | "all";
    screenshot?: boolean;
    updateBaseline?: boolean;
    json?: boolean;
    // v3.11.2
    performance?: boolean;
    performanceThresholds?: {
        startup?: number;
        fps?: number;
        setDataCount?: number;
        setDataPayloadBytes?: number;
        packageSize?: number;
        pageSize?: number;
    };
    // v3.12.0
    crossPlatformDiff?: boolean;
    diffMode?: "reference" | "pairwise";
    diffReferencePlatform?: "wechat" | "alipay" | "douyin";
    diffPages?: string[];
    diffMaxPages?: number;
    diffThresholdPixels?: number;
    diffThresholdRatio?: number;
}

/** ai-fix 工具参数 */
export interface AIFixToolArgs {
    module?: string;
    severity?: "critical" | "warning" | "suggestion";
    maxSuggestions?: number;
    json?: boolean;
}

/** index-project 工具参数 */
export interface IndexProjectToolArgs {
    action?: "build" | "status";
    json?: boolean;
    // v3.14.0
    agent?: AgentKind;
}

/** recommend-tests 工具参数 */
export interface RecommendTestsToolArgs {
    scope?: "staged" | "diff" | "auto" | "explicit";
    diffRange?: string;
    changedFiles?: string[];
    minPriority?: number;
    json?: boolean;
    flakyThresholds?: {
        failureRate?: number;
        flipRate?: number;
        minRuns?: number;
    };
}

/** 工具分发器接受的参数 */
export type MCPToolArgs =
    | ScanToolArgs
    | FixToolArgs
    | E2ERunToolArgs
    | E2EDetectGapsToolArgs
    | ListRulesToolArgs
    | ScanFileToolArgs
    | PageHealthToolArgs
    | MiniProgramToolArgs
    | AIFixToolArgs
    | IndexProjectToolArgs
    | RecommendTestsToolArgs
    // v3.14.0
    | RegisterAgentToolArgs
    | ListAgentsToolArgs
    // v3.14.1
    | GetUsageGuidanceToolArgs
    | GetAgentPreferencesToolArgs
    | SetAgentPreferencesToolArgs
    | Record<string, never>;

/** 工具调用返回结构 */
export interface MCPToolResult {
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
}

/** 工具处理上下文 */
export interface MCPToolContext {
    options: MCPServerOptions;
}

export type { MCPServerOptions };
