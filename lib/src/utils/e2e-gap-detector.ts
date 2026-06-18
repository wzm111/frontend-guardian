/**
 * E2E 测试覆盖缺口检测器（v3.6.0）
 *
 * 对比项目的页面路由/接口定义与现有 E2E 测试文件，发现未覆盖的页面和接口。
 * 不依赖 Playwright 运行时，纯文件系统扫描。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/** 缺口检测结果 */
export interface E2EGapResult {
    /** 未覆盖的页面路由 */
    uncoveredPages: UncoveredPage[];
    /** 未覆盖的 API 接口 */
    uncoveredApis: UncoveredApi[];
    /** 已覆盖的页面数 */
    coveredPages: number;
    /** 已覆盖的接口数 */
    coveredApis: number;
    /** 覆盖率百分比 */
    pageCoverage: number;
    /** API 覆盖率百分比 */
    apiCoverage: number;
    /** 建议生成的测试文件列表 */
    suggestions: TestSuggestion[];
}

export interface UncoveredPage {
    path: string;
    source: "router-config" | "pages-dir" | "app-dir";
    framework: string;
}

export interface UncoveredApi {
    path: string;
    method?: string;
    source: "api-dir" | "swagger" | "manual";
}

export interface TestSuggestion {
    targetType: "page" | "api";
    targetPath: string;
    suggestedFileName: string;
    reason: string;
}

export interface E2EGapOptions {
    /** 项目根目录 */
    projectDir: string;
    /** E2E 测试文件目录（默认 auto-detect） */
    e2eDir?: string;
    /** 路由配置文件路径 */
    routerConfig?: string;
    /** API 目录 */
    apiDir?: string;
    /** 页面目录 */
    pagesDir?: string;
}

/**
 * 检测 E2E 测试覆盖缺口
 */
export function detectE2EGaps(options: E2EGapOptions): E2EGapResult {
    const projectDir = resolve(options.projectDir);
    const e2eDir = options.e2eDir ? resolve(options.e2eDir) : findE2EDir(projectDir);

    // 收集已覆盖的页面和接口（从测试文件内容推断）
    const coveredPages = new Set<string>();
    const coveredApis = new Set<string>();

    if (e2eDir && existsSync(e2eDir)) {
        const testFiles = collectTestFiles(e2eDir);
        for (const file of testFiles) {
            const content = readFileSync(file, "utf-8");
            extractCoveredPaths(content, coveredPages, coveredApis);
        }
    }

    // 收集项目中的所有页面
    const allPages = collectProjectPages(projectDir, options.pagesDir);
    // 收集项目中的所有接口
    const allApis = collectProjectApis(projectDir, options.apiDir);

    const uncoveredPages: UncoveredPage[] = [];
    const uncoveredApis: UncoveredApi[] = [];
    const suggestions: TestSuggestion[] = [];

    for (const page of allPages) {
        const isCovered = Array.from(coveredPages).some((cp) => page.path.includes(cp) || cp.includes(page.path));
        if (!isCovered) {
            uncoveredPages.push(page);
            suggestions.push({
                targetType: "page",
                targetPath: page.path,
                suggestedFileName: suggestTestFileName(page.path, "page"),
                reason: `页面 ${page.path} 缺少 E2E 测试覆盖`,
            });
        }
    }

    for (const api of allApis) {
        const isCovered = Array.from(coveredApis).some((ca) => api.path.includes(ca) || ca.includes(api.path));
        if (!isCovered) {
            uncoveredApis.push(api);
            suggestions.push({
                targetType: "api",
                targetPath: api.path,
                suggestedFileName: suggestTestFileName(api.path, "api"),
                reason: `接口 ${api.path} 缺少 E2E 测试覆盖`,
            });
        }
    }

    const pageCoverage = allPages.length > 0 ? Math.round((coveredPages.size / allPages.length) * 100) : 100;
    const apiCoverage = allApis.length > 0 ? Math.round((coveredApis.size / allApis.length) * 100) : 100;

    return {
        uncoveredPages,
        uncoveredApis,
        coveredPages: coveredPages.size,
        coveredApis: coveredApis.size,
        pageCoverage,
        apiCoverage,
        suggestions,
    };
}

/** 查找 E2E 测试目录 */
function findE2EDir(projectDir: string): string | null {
    const candidates = ["tests/e2e", "e2e", "playwright-tests", "cypress/e2e", "src/e2e"];
    for (const dir of candidates) {
        const fullPath = join(projectDir, dir);
        if (existsSync(fullPath)) return fullPath;
    }
    return null;
}

/** 收集所有测试文件 */
export function collectTestFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectTestFiles(fullPath));
        } else if (/\.(spec|test|e2e)\.(ts|js|mjs)$/.test(entry.name)) {
            files.push(fullPath);
        }
    }
    return files;
}

/** 从测试文件内容提取覆盖的页面和接口 */
export function extractCoveredPaths(content: string, pages: Set<string>, apis: Set<string>): void {
    // 提取 page.goto / cy.visit 中的路径
    const gotoRegex = /(?:page\.goto|cy\.visit)\s*\(\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = gotoRegex.exec(content)) !== null) {
        pages.add(match[1]);
    }

    // 提取 waitForResponse / cy.intercept 中的接口路径
    const apiRegex =
        /(?:waitForResponse|cy\.intercept)\s*\([^)]*(?:url\s*=>\s*)?['"]([^'"]*(?:api|graphql|rest)[^'"]*)['"]/gi;
    while ((match = apiRegex.exec(content)) !== null) {
        apis.add(match[1]);
    }

    // 提取字符串中的 URL 路径（简化匹配）
    const urlRegex = /['"]\/(?:api|graphql|rest)[^'"]*['"]/g;
    while ((match = urlRegex.exec(content)) !== null) {
        const url = match[0].replace(/['"]/g, "");
        if (url.length > 4) apis.add(url);
    }
}

/** 收集项目中的所有页面 */
function collectProjectPages(projectDir: string, pagesDir?: string): UncoveredPage[] {
    const pages: UncoveredPage[] = [];

    // 1. 检测小程序页面（pages.json）
    const pagesJsonPath = join(projectDir, "pages.json");
    if (existsSync(pagesJsonPath)) {
        try {
            const pagesJson = JSON.parse(readFileSync(pagesJsonPath, "utf-8"));
            if (pagesJson.pages) {
                for (const page of pagesJson.pages) {
                    const path = typeof page === "string" ? page : page.path;
                    if (path) pages.push({ path, source: "router-config", framework: "uniapp" });
                }
            }
        } catch {
            /* ignore */
        }
    }

    // 2. 检测 Next.js / Nuxt 路由（pages/ 或 app/ 目录）
    const pagesDirPath = pagesDir ? resolve(pagesDir) : join(projectDir, "pages");
    const appDirPath = join(projectDir, "app");

    for (const dir of [pagesDirPath, appDirPath]) {
        if (existsSync(dir)) {
            const framework = dir.includes("app") ? "nextjs-app" : "nextjs-pages";
            collectRouteFiles(dir, projectDir, pages, framework);
        }
    }

    // 3. 检测 Vue/React 路由配置文件
    const routerFiles = ["src/router/index.ts", "src/router.ts", "router.config.ts"];
    for (const rf of routerFiles) {
        const rfPath = join(projectDir, rf);
        if (existsSync(rfPath)) {
            const content = readFileSync(rfPath, "utf-8");
            const pathRegex = /path\s*:\s*['"]([^'"]+)['"]/g;
            let match;
            while ((match = pathRegex.exec(content)) !== null) {
                if (!match[1].includes(":")) {
                    pages.push({ path: match[1], source: "router-config", framework: "vue" });
                }
            }
        }
    }

    return pages;
}

/** 递归收集路由文件 */
function collectRouteFiles(dir: string, projectDir: string, pages: UncoveredPage[], framework: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith("_") && !entry.name.startsWith(".")) {
            collectRouteFiles(fullPath, projectDir, pages, framework);
        } else if (entry.isFile() && /\.(tsx?|jsx?|vue)$/.test(entry.name)) {
            const routePath =
                "/" +
                relative(dir, fullPath)
                    .replace(/\\/g, "/")
                    .replace(/\.(tsx?|jsx?|vue)$/, "")
                    .replace(/\/index$/, "")
                    .replace(/\[\.{3}[^\]]+\]/g, "*")
                    .replace(/\[[^\]]+\]/g, ":param");
            if (routePath !== "/") {
                pages.push({ path: routePath, source: framework.includes("app") ? "app-dir" : "pages-dir", framework });
            }
        }
    }
}

/** 收集项目中的所有 API */
function collectProjectApis(projectDir: string, apiDir?: string): UncoveredApi[] {
    const apis: UncoveredApi[] = [];

    // 1. 检测 api/ 目录（Next.js 风格）
    const apiDirs = apiDir
        ? [resolve(apiDir)]
        : [join(projectDir, "api"), join(projectDir, "src/api"), join(projectDir, "server/api")];

    for (const dir of apiDirs) {
        if (existsSync(dir)) {
            collectApiFiles(dir, projectDir, apis);
        }
    }

    // 2. 检测 request.js / api.js 中的接口定义
    const requestFiles = ["api/request.js", "utils/request.js", "api/index.ts", "services/api.ts"];
    for (const rf of requestFiles) {
        const rfPath = join(projectDir, "src", rf);
        if (existsSync(rfPath)) {
            const content = readFileSync(rfPath, "utf-8");
            const apiRegex = /['"](\/(?:api|graphql|rest)[^'"]+)['"]/g;
            let match;
            while ((match = apiRegex.exec(content)) !== null) {
                apis.push({ path: match[1], source: "api-dir" });
            }
        }
    }

    return apis;
}

/** 递归收集 API 文件 */
function collectApiFiles(dir: string, projectDir: string, apis: UncoveredApi[]): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            collectApiFiles(fullPath, projectDir, apis);
        } else if (/\.(ts|js|mjs)$/.test(entry.name) && !/request\.(ts|js|mjs)$/.test(entry.name)) {
            const routePath =
                "/api/" +
                relative(dir, fullPath)
                    .replace(/\\/g, "/")
                    .replace(/\.(ts|js|mjs)$/, "")
                    .replace(/\/route$/, "")
                    .replace(/\[\.{3}[^\]]+\]/g, "*")
                    .replace(/\[[^\]]+\]/g, ":param");
            apis.push({ path: routePath, source: "api-dir" });
        }
    }
}

/** 生成建议的测试文件名 */
function suggestTestFileName(path: string, type: "page" | "api"): string {
    const sanitized = path
        .replace(/^\//, "")
        .replace(/\//g, "-")
        .replace(/:/g, "")
        .replace(/\*/g, "all")
        .replace(/\./g, "-")
        .toLowerCase();
    return type === "page" ? `${sanitized}.spec.ts` : `api-${sanitized}.spec.ts`;
}

/** 格式化缺口检测结果为终端报告 */
export function formatE2EGapReport(result: E2EGapResult): string {
    const lines: string[] = [];
    lines.push(`📊 E2E 测试覆盖缺口检测报告`);
    lines.push(
        `   页面覆盖率: ${result.pageCoverage}% (${result.coveredPages} / ${result.coveredPages + result.uncoveredPages.length})`
    );
    lines.push(
        `   接口覆盖率: ${result.apiCoverage}% (${result.coveredApis} / ${result.coveredApis + result.uncoveredApis.length})`
    );
    lines.push("");

    if (result.uncoveredPages.length > 0) {
        lines.push(`⚠️ 未覆盖的页面 (${result.uncoveredPages.length}):`);
        for (const page of result.uncoveredPages.slice(0, 10)) {
            lines.push(`   ${page.path} (${page.framework})`);
        }
        if (result.uncoveredPages.length > 10) {
            lines.push(`   ... 还有 ${result.uncoveredPages.length - 10} 个页面未覆盖`);
        }
        lines.push("");
    }

    if (result.uncoveredApis.length > 0) {
        lines.push(`⚠️ 未覆盖的接口 (${result.uncoveredApis.length}):`);
        for (const api of result.uncoveredApis.slice(0, 10)) {
            lines.push(`   ${api.path}`);
        }
        if (result.uncoveredApis.length > 10) {
            lines.push(`   ... 还有 ${result.uncoveredApis.length - 10} 个接口未覆盖`);
        }
        lines.push("");
    }

    if (result.suggestions.length > 0) {
        lines.push(`💡 建议生成的测试文件 (${result.suggestions.length}):`);
        for (const s of result.suggestions.slice(0, 5)) {
            lines.push(`   ${s.suggestedFileName} — ${s.reason}`);
        }
    }

    return lines.join("\n");
}

/** 格式化缺口检测结果为 JSON */
export function formatE2EGapJson(result: E2EGapResult): object {
    return {
        summary: {
            pageCoverage: result.pageCoverage,
            apiCoverage: result.apiCoverage,
            uncoveredPageCount: result.uncoveredPages.length,
            uncoveredApiCount: result.uncoveredApis.length,
        },
        uncoveredPages: result.uncoveredPages,
        uncoveredApis: result.uncoveredApis,
        suggestions: result.suggestions,
    };
}
