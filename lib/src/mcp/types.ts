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
    | "recommend-tests";

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
}

/** mini-program 工具参数 */
export interface MiniProgramToolArgs {
    platform?: "wechat" | "alipay" | "douyin" | "auto";
    screenshot?: boolean;
    updateBaseline?: boolean;
    json?: boolean;
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
}

/** recommend-tests 工具参数 */
export interface RecommendTestsToolArgs {
    scope?: "staged" | "diff" | "auto" | "explicit";
    diffRange?: string;
    changedFiles?: string[];
    minPriority?: number;
    json?: boolean;
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
