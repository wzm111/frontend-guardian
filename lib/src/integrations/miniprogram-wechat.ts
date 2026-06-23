/**
 * v3.11.0: 微信小程序自动化测试
 *
 * 通过微信开发者工具 CLI 对小程序项目进行编译检查、页面存在性检查、
 * 包体积检查与可选截图基线对比。
 *
 * 设计哲学：微信开发者工具为可选外部工具，未安装时仍可进行静态检查，
 * 并给出下载链接提示。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Issue, ScanResult } from "@/types.js";
import {
    type DashboardClientConfig,
    type DashboardUploadResult,
    uploadToDashboardServer,
} from "@/utils/dashboard-client.js";
import {
    type MiniProgramPlatform,
    type MiniProgramProjectInfo,
    detectMiniProgramPlatform,
    getMiniProgramDevToolsDownloadUrl,
    getMiniProgramPlatformLabel,
    resolveMiniProgramProject,
} from "@/utils/miniprogram-detect.js";
import {
    isWechatDevToolsAvailable,
    parseWechatCompileOutput,
    wechatAutoCompile,
    wechatScreenshot,
} from "@/utils/miniprogram-wechat-cli.js";
import {
    compareScreenshotsPixel,
    getBaselinePath,
    getCurrentScreenshotPath,
    isPixelmatchAvailable,
    isPngjsAvailable,
    isVisualRegressionFailed,
    safeRouteName,
} from "@/utils/visual-regression.js";

// ── 类型 ───────────────────────────────────────────────────────────────────

export interface MiniProgramOptions {
    /** 项目根目录 */
    projectDir: string;
    /** 小程序平台；auto 时自动检测 */
    platform?: MiniProgramPlatform | "auto";
    /** 是否截图（需要开发者工具支持） */
    screenshot?: boolean;
    /** 是否更新基线截图 */
    updateBaseline?: boolean;
    /** 截图保存目录 */
    screenshotDir?: string;
    /** 基线截图目录 */
    baselineDir?: string;
    /** 主包大小阈值（字节，默认 2MB） */
    maxMainPackageSize?: number;
    /** 分包大小阈值（字节，默认 2MB） */
    maxSubPackageSize?: number;
    /** 显式指定要检查的页面（默认从 app.json/pages.json 读取） */
    pages?: string[];
    /** 编译/截图超时（毫秒） */
    timeout?: number;
    /** 页面检查并发数（默认 3） */
    concurrency?: number;
    /** 上报到的 dashboard server URL */
    server?: string;
    /** dashboard server auth token */
    authToken?: string;
}

export interface CheckedMiniProgramPage {
    /** 页面路由 */
    path: string;
    /** 检查结果状态 */
    status: "ok" | "error" | "warning";
    /** 错误/提示信息 */
    messages: string[];
    /** 页面源码文件路径 */
    sourcePath?: string;
    /** 截图是否与基线不同 */
    screenshotChanged?: boolean;
    /** 当前截图路径 */
    screenshotPath?: string;
    /** 基线截图路径 */
    baselinePath?: string;
}

export interface MiniProgramResult {
    /** 测试的平台 */
    platform: MiniProgramPlatform;
    /** 项目目录 */
    projectDir: string;
    /** 发现的 Issue */
    issues: Issue[];
    /** 检查的页面 */
    checkedPages: CheckedMiniProgramPage[];
    /** 截图文件路径 */
    screenshots: string[];
    /** 总耗时（毫秒） */
    duration: number;
}

// ── 常量 ───────────────────────────────────────────────────────────────────

const DEFAULT_MAX_MAIN_PACKAGE_SIZE = 2 * 1024 * 1024; // 2MB
const DEFAULT_MAX_SUB_PACKAGE_SIZE = 2 * 1024 * 1024; // 2MB
const DEFAULT_SCREENSHOT_DIR = ".frontend-guardian/screenshots/miniprogram";
const SCREENSHOT_PROFILE = "miniprogram/wechat";
const PAGE_EXTENSIONS = [".vue", ".js", ".ts", ".wxml", ".axml", ".ttml", ".json"];

const EXCLUDED_DIRS = new Set([
    "node_modules",
    ".git",
    ".frontend-guardian",
    "dist",
    "build",
    "unpackage",
    "coverage",
]);

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** 递归计算目录大小（排除常见非源码目录） */
export function getDirectorySize(dir: string): number {
    let total = 0;

    function walk(current: string) {
        const entries = readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(current, entry.name);
            if (entry.isDirectory()) {
                if (EXCLUDED_DIRS.has(entry.name)) continue;
                walk(fullPath);
            } else {
                try {
                    total += statSync(fullPath).size;
                } catch {
                    // ignore
                }
            }
        }
    }

    walk(dir);
    return total;
}

/** 计算单个子包目录大小 */
export function getSubPackageSize(projectDir: string, root: string): number {
    const subDir = resolve(projectDir, root);
    if (!existsSync(subDir)) return 0;
    return getDirectorySize(subDir);
}

/** 检查页面源码文件是否存在 */
export function findPageSourceFile(projectDir: string, pagePath: string): string | undefined {
    const base = resolve(projectDir, pagePath);
    for (const ext of PAGE_EXTENSIONS) {
        const candidate = base + ext;
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

/** 并发控制辅助 */
async function runWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
    const queue = [...items];
    const workers = Array.from({ length: concurrency }, async () => {
        while (true) {
            const item = queue.shift();
            if (!item) break;
            try {
                await fn(item);
            } catch {
                // 单个任务失败不阻断其他任务
            }
        }
    });
    await Promise.all(workers);
}

// ── 核心检查 ─────────────────────────────────────────────────────────────────

interface PackageSizeCheckResult {
    issues: Issue[];
}

/** 检查主包与分包体积 */
function checkPackageSizes(
    projectInfo: MiniProgramProjectInfo,
    options: MiniProgramOptions,
    baseMeta: Record<string, unknown>
): PackageSizeCheckResult {
    const issues: Issue[] = [];
    const mainLimit = options.maxMainPackageSize ?? DEFAULT_MAX_MAIN_PACKAGE_SIZE;
    const subLimit = options.maxSubPackageSize ?? DEFAULT_MAX_SUB_PACKAGE_SIZE;
    const platformLabel = getMiniProgramPlatformLabel(projectInfo.platform);

    const mainSize = getDirectorySize(projectInfo.projectDir);
    if (mainSize > mainLimit) {
        issues.push({
            ruleId: "miniprogram-main-package-oversize",
            title: `${platformLabel}小程序主包体积超过限制`,
            description: `主包（源码）大小 ${formatBytes(mainSize)}，超过阈值 ${formatBytes(mainLimit)}。建议启用分包或移除非必要资源。`,
            severity: "critical",
            file: projectInfo.projectConfigPath || projectInfo.appJsonPath || projectInfo.projectDir,
            line: 1,
            column: 1,
            meta: { ...baseMeta, size: mainSize, limit: mainLimit },
        });
    }

    if (projectInfo.subPackages) {
        for (const pkg of projectInfo.subPackages) {
            const size = getSubPackageSize(projectInfo.projectDir, pkg.root);
            if (size > subLimit) {
                issues.push({
                    ruleId: "miniprogram-sub-package-oversize",
                    title: `${platformLabel}小程序分包体积超过限制`,
                    description: `分包 ${pkg.root} 大小 ${formatBytes(size)}，超过阈值 ${formatBytes(subLimit)}。`,
                    severity: "warning",
                    file: projectInfo.projectConfigPath || projectInfo.appJsonPath || projectInfo.projectDir,
                    line: 1,
                    column: 1,
                    meta: { ...baseMeta, subPackageRoot: pkg.root, size, limit: subLimit },
                });
            }
        }
    }

    return { issues };
}

/** 检查页面源码是否存在 */
async function checkPages(
    projectInfo: MiniProgramProjectInfo,
    pages: string[],
    concurrency: number
): Promise<CheckedMiniProgramPage[]> {
    const checked: CheckedMiniProgramPage[] = [];

    await runWithConcurrency(pages, concurrency, async (page) => {
        const sourcePath = findPageSourceFile(projectInfo.projectDir, page);
        if (sourcePath) {
            checked.push({
                path: page,
                status: "ok",
                messages: [],
                sourcePath,
            });
        } else {
            checked.push({
                path: page,
                status: "error",
                messages: ["未找到页面对应的源码文件"],
            });
        }
    });

    return checked.sort((a, b) => a.path.localeCompare(b.path));
}

/** 编译检查 */
function runCompileCheck(
    projectInfo: MiniProgramProjectInfo,
    options: MiniProgramOptions,
    baseMeta: Record<string, unknown>
): { issues: Issue[]; output: string | null } {
    const issues: Issue[] = [];

    if (projectInfo.platform !== "wechat") {
        // P0 仅微信实现编译检查；支付宝/抖音在 P1 扩展
        return { issues, output: null };
    }

    if (!isWechatDevToolsAvailable()) {
        return { issues, output: null };
    }

    const output = wechatAutoCompile(projectInfo.projectDir, options.timeout ?? 120000);
    if (!output) {
        return { issues, output: null };
    }

    const { errors, warnings } = parseWechatCompileOutput(output);

    for (const error of errors) {
        issues.push({
            ruleId: "miniprogram-compile-error",
            title: "小程序编译错误",
            description: error,
            severity: "critical",
            file: projectInfo.projectConfigPath || projectInfo.projectDir,
            line: 1,
            column: 1,
            meta: { ...baseMeta, output: error },
        });
    }

    for (const warning of warnings) {
        issues.push({
            ruleId: "miniprogram-compile-warning",
            title: "小程序编译警告",
            description: warning,
            severity: "warning",
            file: projectInfo.projectConfigPath || projectInfo.projectDir,
            line: 1,
            column: 1,
            meta: { ...baseMeta, output: warning },
        });
    }

    return { issues, output };
}

/** 对首页进行截图冒烟测试 */
async function runScreenshotSmoke(
    projectInfo: MiniProgramProjectInfo,
    options: MiniProgramOptions,
    baseMeta: Record<string, unknown>
): Promise<{ checkedPage?: CheckedMiniProgramPage; issue?: Issue; screenshotPath?: string }> {
    if (!options.screenshot || projectInfo.platform !== "wechat") {
        return {};
    }

    if (!isWechatDevToolsAvailable()) {
        return {
            issue: {
                ruleId: "miniprogram-screenshot-skipped",
                title: "小程序截图因缺少微信开发者工具已跳过",
                description: `未检测到微信开发者工具 CLI。如需截图，请安装并配置环境变量 ${process.env["WECHAT_DEVTOOLS_CLI"]} 或将其加入 PATH。下载地址：${getMiniProgramDevToolsDownloadUrl("wechat")}`,
                severity: "suggestion",
                file: projectInfo.projectDir,
                line: 1,
                column: 1,
                meta: baseMeta,
            },
        };
    }

    const firstPage = options.pages?.[0] || projectInfo.pages[0];
    if (!firstPage) {
        return {};
    }

    const screenshotDir = options.screenshotDir || join(projectInfo.projectDir, DEFAULT_SCREENSHOT_DIR);
    const baselineDir = options.baselineDir || join(screenshotDir, "baseline");
    const diffDir = join(screenshotDir, "diff");

    for (const dir of [screenshotDir, baselineDir, diffDir]) {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }

    const screenshotPath = getCurrentScreenshotPath(screenshotDir, firstPage, undefined, SCREENSHOT_PROFILE);
    const baselinePath = getBaselinePath(baselineDir, firstPage, undefined, SCREENSHOT_PROFILE);

    const output = wechatScreenshot(projectInfo.projectDir, screenshotPath, options.timeout ?? 60000);
    if (!output || !existsSync(screenshotPath)) {
        return {
            issue: {
                ruleId: "miniprogram-screenshot-failed",
                title: "小程序首页截图失败",
                description: "调用微信开发者工具 --screenshot 未生成截图。当前版本的开发者工具可能不支持该命令。",
                severity: "warning",
                file: projectInfo.projectDir,
                line: 1,
                column: 1,
                meta: baseMeta,
            },
        };
    }

    if (options.updateBaseline) {
        const baselineParent = dirname(baselinePath);
        if (!existsSync(baselineParent)) mkdirSync(baselineParent, { recursive: true });
        writeFileSync(baselinePath, readFileSync(screenshotPath));
        return {
            checkedPage: {
                path: firstPage,
                status: "ok",
                messages: ["已更新基线截图"],
                screenshotPath,
                baselinePath,
            },
            screenshotPath,
        };
    }

    if (!existsSync(baselinePath)) {
        return {
            checkedPage: {
                path: firstPage,
                status: "warning",
                messages: ["缺少基线截图，本次已保存当前截图，请确认后使用 --miniprogram-update-baseline 更新基线"],
                screenshotPath,
                baselinePath,
            },
            screenshotPath,
        };
    }

    if (isPixelmatchAvailable() && isPngjsAvailable()) {
        const diffPath = join(diffDir, `${safeRouteName(firstPage)}.png`);
        const regression = await compareScreenshotsPixel(screenshotPath, baselinePath, diffPath);
        if (regression && isVisualRegressionFailed(regression)) {
            return {
                checkedPage: {
                    path: firstPage,
                    status: "warning",
                    messages: [
                        `截图与基线不同：差异像素 ${regression.diffPixels} (${(regression.diffPixelRatio * 100).toFixed(2)}%)`,
                    ],
                    screenshotChanged: true,
                    screenshotPath,
                    baselinePath,
                },
                issue: {
                    ruleId: "miniprogram-screenshot-changed",
                    title: "小程序首页截图与基线不同",
                    description: `首页 ${firstPage} 截图差异像素 ${regression.diffPixels}，比例 ${(regression.diffPixelRatio * 100).toFixed(2)}%。`,
                    severity: "warning",
                    file: projectInfo.projectDir,
                    line: 1,
                    column: 1,
                    meta: { ...baseMeta, diffPixels: regression.diffPixels, diffPixelRatio: regression.diffPixelRatio },
                },
                screenshotPath,
            };
        }
    }

    return {
        checkedPage: {
            path: firstPage,
            status: "ok",
            messages: ["截图与基线一致"],
            screenshotPath,
            baselinePath,
        },
        screenshotPath,
    };
}

// ── 主入口 ───────────────────────────────────────────────────────────────────

/**
 * 运行小程序自动化测试
 */
export async function runMiniProgramTest(options: MiniProgramOptions): Promise<MiniProgramResult> {
    const start = Date.now();
    const platform =
        options.platform && options.platform !== "auto"
            ? options.platform
            : detectMiniProgramPlatform(options.projectDir);

    if (!platform) {
        throw new Error(
            `无法识别 ${options.projectDir} 的小程序类型。请确保目录下存在以下文件之一：\n` +
                "  微信: app.json + project.config.json 或 manifest.json + pages.json\n" +
                "  支付宝: mini.project.json\n" +
                "  抖音: project.config.json（含 tt 字段）"
        );
    }

    const projectInfo = resolveMiniProgramProject(options.projectDir, platform);
    if (!projectInfo) {
        throw new Error(`解析 ${platform} 小程序项目失败`);
    }

    const baseMeta: Record<string, unknown> = {
        platform,
        projectDir: options.projectDir,
    };

    const issues: Issue[] = [];
    const screenshots: string[] = [];
    const checkedPages: CheckedMiniProgramPage[] = [];

    const pages = options.pages?.length ? options.pages : projectInfo.pages;
    if (pages.length === 0) {
        issues.push({
            ruleId: "miniprogram-no-pages",
            title: "未检测到小程序页面",
            description: "在 app.json / pages.json 中未找到 pages 字段，请检查项目结构。",
            severity: "warning",
            file: projectInfo.appJsonPath || projectInfo.pagesJsonPath || projectInfo.projectDir,
            line: 1,
            column: 1,
            meta: baseMeta,
        });
    }

    // 包体积检查
    const sizeResult = checkPackageSizes(projectInfo, options, baseMeta);
    issues.push(...sizeResult.issues);

    // 页面存在性检查
    if (pages.length > 0) {
        const pageChecks = await checkPages(projectInfo, pages, options.concurrency || 3);
        checkedPages.push(...pageChecks);

        for (const page of pageChecks) {
            if (page.status === "error") {
                issues.push({
                    ruleId: "miniprogram-page-missing",
                    title: `小程序页面源码缺失: ${page.path}`,
                    description: page.messages[0],
                    severity: "critical",
                    file: projectInfo.appJsonPath || projectInfo.pagesJsonPath || projectInfo.projectDir,
                    line: 1,
                    column: 1,
                    meta: { ...baseMeta, pagePath: page.path },
                });
            }
        }
    }

    // 编译检查
    const compileResult = runCompileCheck(projectInfo, options, baseMeta);
    issues.push(...compileResult.issues);

    // 缺少开发者工具时给出建议
    if (platform === "wechat" && !isWechatDevToolsAvailable()) {
        issues.push({
            ruleId: "miniprogram-devtools-missing",
            title: "未检测到微信开发者工具",
            description: `已完成的检查为静态检查。如需编译/截图验证，请安装微信开发者工具并加入 PATH，或设置环境变量 WECHAT_DEVTOOLS_CLI。下载地址：${getMiniProgramDevToolsDownloadUrl("wechat")}`,
            severity: "suggestion",
            file: projectInfo.projectDir,
            line: 1,
            column: 1,
            meta: baseMeta,
        });
    }

    // 首页截图冒烟
    const screenshotResult = await runScreenshotSmoke(projectInfo, options, baseMeta);
    if (screenshotResult.issue) {
        issues.push(screenshotResult.issue);
    }
    if (screenshotResult.checkedPage) {
        const existing = checkedPages.find((p) => p.path === screenshotResult.checkedPage!.path);
        if (existing) {
            Object.assign(existing, screenshotResult.checkedPage);
        } else {
            checkedPages.push(screenshotResult.checkedPage);
        }
    }
    if (screenshotResult.screenshotPath) {
        screenshots.push(screenshotResult.screenshotPath);
    }

    return {
        platform,
        projectDir: options.projectDir,
        issues,
        checkedPages,
        screenshots,
        duration: Date.now() - start,
    };
}

// ── 格式化输出 ─────────────────────────────────────────────────────────────────

/**
 * 将结果格式化为终端报告
 */
export function formatMiniProgramReport(result: MiniProgramResult): string {
    const platformLabel = getMiniProgramPlatformLabel(result.platform);
    const lines: string[] = [];

    lines.push(`🛰️  ${platformLabel}小程序自动化测试报告`);
    lines.push(`   项目目录: ${result.projectDir}`);
    lines.push(`   检查页面: ${result.checkedPages.length} 个`);
    lines.push(`   总耗时: ${result.duration}ms`);
    lines.push("");

    const okCount = result.checkedPages.filter((p) => p.status === "ok").length;
    const warnCount = result.checkedPages.filter((p) => p.status === "warning").length;
    const errorCount = result.checkedPages.filter((p) => p.status === "error").length;

    lines.push(`   ✅ 正常: ${okCount} | ⚠️  警告: ${warnCount} | ❌ 错误: ${errorCount}`);
    lines.push("");

    for (const page of result.checkedPages) {
        const icon = page.status === "ok" ? "✅" : page.status === "warning" ? "⚠️" : "❌";
        lines.push(`   ${icon} ${page.path}`);
        if (page.messages.length > 0) {
            for (const msg of page.messages) {
                lines.push(`      ${msg}`);
            }
        }
        if (page.screenshotPath) {
            lines.push(`      📸 ${page.screenshotPath}`);
        }
    }

    const issueCount = result.issues.filter((i) =>
        ["miniprogram-main-package-oversize", "miniprogram-sub-package-oversize"].includes(i.ruleId)
    ).length;
    if (issueCount > 0) {
        lines.push("");
        lines.push(`   📦 包体积问题: ${issueCount} 个`);
    }

    if (result.screenshots.length > 0) {
        lines.push("");
        lines.push(`   🖼️  截图已保存 (${result.screenshots.length} 张)`);
    }

    return lines.join("\n");
}

/**
 * 将结果格式化为 JSON
 */
export function formatMiniProgramJson(result: MiniProgramResult): object {
    return {
        summary: {
            platform: result.platform,
            projectDir: result.projectDir,
            totalPages: result.checkedPages.length,
            ok: result.checkedPages.filter((p) => p.status === "ok").length,
            warning: result.checkedPages.filter((p) => p.status === "warning").length,
            error: result.checkedPages.filter((p) => p.status === "error").length,
            duration: result.duration,
            issueCount: result.issues.length,
            screenshotCount: result.screenshots.length,
        },
        pages: result.checkedPages,
        issues: result.issues,
        screenshots: result.screenshots,
    };
}

// ── Dashboard 上报 ─────────────────────────────────────────────────────────

/**
 * 将 MiniProgramResult 转换为 ScanResult
 */
export function toScanResult(result: MiniProgramResult): ScanResult {
    const critical = result.issues.filter((i) => i.severity === "critical");
    const warning = result.issues.filter((i) => i.severity === "warning");
    const suggestion = result.issues.filter((i) => i.severity === "suggestion");

    return {
        module: "mini-program",
        total: result.issues.length,
        issues: { critical, warning, suggestion },
        duration: result.duration,
        filesScanned: result.checkedPages.length,
        filesWithIssues: result.checkedPages.filter((p) => p.status !== "ok").length,
    };
}

/**
 * 将小程序测试结果上报到治理看板服务器
 */
export async function uploadMiniProgramResult(
    result: MiniProgramResult,
    config: DashboardClientConfig
): Promise<DashboardUploadResult> {
    const projectName = result.projectDir.split("/").pop() || "unknown";

    const payload = {
        projectName,
        projectPath: result.projectDir,
        module: "mini-program",
        result: toScanResult(result),
        issues: result.issues,
        meta: {
            duration: result.duration,
            filesScanned: result.checkedPages.length,
            platform: result.platform,
            screenshotCount: result.screenshots.length,
        },
    };

    return uploadToDashboardServer(payload, config);
}
