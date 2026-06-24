/**
 * v3.11.1: 小程序自动化测试（多平台统一入口）
 *
 * 通过微信/支付宝/抖音开发者工具 CLI 对小程序项目进行编译检查、页面存在性检查、
 * 包体积检查与可选截图基线对比。
 *
 * 设计哲学：开发者工具为可选外部工具，未安装时仍可进行静态检查，
 * 并给出对应平台的下载链接提示。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Issue, ScanResult } from "@/types.js";
import {
    type DashboardClientConfig,
    type DashboardUploadResult,
    uploadToDashboardServer,
} from "@/utils/dashboard-client.js";
import {
    isDevToolsAvailable,
    parseCompileOutput,
    runAutoCompile,
    runPerformance,
    runScreenshot,
} from "@/utils/miniprogram-cli.js";
import { getCliConfig } from "@/utils/miniprogram-cli-configs.js";
import {
    detectMiniProgramPlatform,
    detectMiniProgramPlatforms,
    getMiniProgramPlatformLabel,
    type MiniProgramPlatform,
    type MiniProgramProjectInfo,
    resolveMiniProgramProject,
} from "@/utils/miniprogram-detect.js";
import { findPageSourceFile, getDirectorySize, getSubPackageSize } from "@/utils/miniprogram-fs.js";
import {
    checkPerformanceThresholds,
    collectBuildMetrics,
    collectSetDataMetrics,
    DEFAULT_MINIPROGRAM_PERFORMANCE_THRESHOLDS,
    formatPerformanceMetrics,
    type MiniProgramPerformanceData,
    type MiniProgramPerformanceThresholds,
    mergeSetDataMetrics,
    parsePerformanceOutput,
} from "@/utils/miniprogram-performance.js";
import {
    compareScreenshotsPixel,
    getBaselinePath,
    getCurrentScreenshotPath,
    getDiffImagePath,
    isPixelmatchAvailable,
    isPngjsAvailable,
    isVisualRegressionFailed,
    safeRouteName,
    type VisualRegressionResult,
} from "@/utils/visual-regression.js";

// 从性能工具库重导出类型，供 public API 使用
export type {
    MiniProgramPagePerformance,
    MiniProgramPerformanceData,
    MiniProgramPerformanceThresholds,
    SetDataMetric,
} from "@/utils/miniprogram-performance.js";

// ── 类型 ───────────────────────────────────────────────────────────────────

export interface MiniProgramOptions {
    /** 项目根目录 */
    projectDir: string;
    /** 小程序平台；auto 时自动检测，all 时检测所有已识别平台 */
    platform?: MiniProgramPlatform | "auto" | "all";
    /** 显式指定多个平台（优先级高于 platform） */
    platforms?: MiniProgramPlatform[];
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
    /** 是否启用性能采集 */
    performance?: boolean;
    /** 性能阈值覆盖 */
    performanceThresholds?: Partial<MiniProgramPerformanceThresholds>;
    // v3.12.0: 跨平台截图对比
    /** 启用跨平台截图对比 */
    crossPlatformDiff?: boolean;
    /** 对比模式：reference（以参考平台为基准）| pairwise（两两对比） */
    diffMode?: "reference" | "pairwise";
    /** 参考平台（默认 wechat） */
    diffReferencePlatform?: MiniProgramPlatform;
    /** 指定要对比的页面（默认取 app.json pages 前 N 个） */
    diffPages?: string[];
    /** 最大对比页面数（默认 10） */
    diffMaxPages?: number;
    /** 差异像素阈值 */
    diffThresholdPixels?: number;
    /** 差异比例阈值 */
    diffThresholdRatio?: number;
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
    /** 所属平台（多平台汇总时填充） */
    platform?: MiniProgramPlatform;
}

/** 跨平台截图对比结果（v3.12.0） */
export interface CrossPlatformDiffResult {
    /** 页面路由 */
    pagePath: string;
    /** 平台 A */
    platformA: MiniProgramPlatform;
    /** 平台 B */
    platformB: MiniProgramPlatform;
    /** 差异结果 */
    diffResult: VisualRegressionResult | null;
    /** 生成的 issue（差异超阈值时） */
    issue?: Issue;
}

export interface MiniProgramResult {
    /** 测试的平台；多平台时为 "multi" */
    platform: MiniProgramPlatform | "multi";
    /** 多平台时包含所有平台 */
    platforms?: MiniProgramPlatform[];
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
    /** 性能数据（启用 --miniprogram-performance 时填充；多平台时为数组） */
    performanceData?: MiniProgramPerformanceData | MiniProgramPerformanceData[];
    /** 跨平台截图对比结果（v3.12.0，多平台时填充） */
    crossPlatformDiffs?: CrossPlatformDiffResult[];
}

/** 单平台运行时排除 platform/platforms 的选项 */
type SinglePlatformOptions = Omit<MiniProgramOptions, "platform" | "platforms">;

// ── 常量 ───────────────────────────────────────────────────────────────────

const DEFAULT_MAX_MAIN_PACKAGE_SIZE = 2 * 1024 * 1024; // 2MB
const DEFAULT_MAX_SUB_PACKAGE_SIZE = 2 * 1024 * 1024; // 2MB
const DEFAULT_SCREENSHOT_DIR = ".frontend-guardian/screenshots/miniprogram";
const DEFAULT_DIFF_MAX_PAGES = 10;
const DEFAULT_DIFF_REFERENCE_PLATFORM: MiniProgramPlatform = "wechat";

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getScreenshotProfile(platform: MiniProgramPlatform): string {
    return `miniprogram/${platform}`;
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
    options: SinglePlatformOptions,
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
    options: SinglePlatformOptions,
    baseMeta: Record<string, unknown>
): { issues: Issue[]; output: string | null; durationMs: number } {
    const issues: Issue[] = [];
    const config = getCliConfig(projectInfo.platform);

    if (!isDevToolsAvailable(config)) {
        return { issues, output: null, durationMs: 0 };
    }

    const compileStart = Date.now();
    const output = runAutoCompile(config, projectInfo.projectDir, options.timeout ?? 120000);
    const durationMs = Date.now() - compileStart;
    if (!output) {
        return { issues, output: null, durationMs };
    }

    const { errors, warnings } = parseCompileOutput(output);

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

    return { issues, output, durationMs };
}

/** 性能检查 */
function runPerformanceCheck(
    projectInfo: MiniProgramProjectInfo,
    options: SinglePlatformOptions,
    baseMeta: Record<string, unknown>,
    compileDurationMs: number
): { data: MiniProgramPerformanceData; issues: Issue[]; suggestion?: Issue } {
    const config = getCliConfig(projectInfo.platform);

    // 1. 构建指标 + setData 静态指标（不依赖开发者工具）
    let data = collectBuildMetrics({
        projectDir: projectInfo.projectDir,
        projectInfo,
        compileDurationMs,
    });
    const setDataMetrics = collectSetDataMetrics(projectInfo);
    data = mergeSetDataMetrics(data, setDataMetrics);

    // 2. 尝试通过 CLI 采集运行时指标
    let runtimeParsed = false;
    if (isDevToolsAvailable(config) && config.performanceArgs && config.performanceArgs.length > 0) {
        const output = runPerformance(config, projectInfo.projectDir, options.timeout ?? 120000);
        if (output) {
            const runtime = parsePerformanceOutput(output);
            if (runtime.startupTimeMs !== undefined) data.startupTimeMs = runtime.startupTimeMs;
            if (runtime.fps !== undefined) data.fps = runtime.fps;
            runtimeParsed = true;
        }
    }

    // 3. 阈值检查
    const thresholds = {
        ...DEFAULT_MINIPROGRAM_PERFORMANCE_THRESHOLDS,
        ...options.performanceThresholds,
    };
    const issues = checkPerformanceThresholds(data, thresholds, baseMeta);

    // 4. 平台未配置性能参数时给出 suggestion
    let suggestion: Issue | undefined;
    if (!runtimeParsed && (!config.performanceArgs || config.performanceArgs.length === 0)) {
        suggestion = {
            ruleId: "miniprogram-performance-runtime-unavailable",
            title: `${config.label}开发者工具 CLI 暂不支持运行时性能采集`,
            description: `已返回构建指标与 setData 静态分析结果。如需运行时启动时间/FPS，请查阅${config.label}开发者工具官方文档确认 CLI 性能参数。`,
            severity: "suggestion",
            file: projectInfo.projectDir,
            line: 1,
            column: 1,
            meta: baseMeta,
        };
    }

    return { data, issues, suggestion };
}

/** 对指定页面列表进行截图 */
async function runScreenshotForPages(
    projectInfo: MiniProgramProjectInfo,
    options: SinglePlatformOptions,
    pages: string[],
    baseMeta: Record<string, unknown>
): Promise<{ checkedPages: CheckedMiniProgramPage[]; issues: Issue[]; screenshots: string[] }> {
    const config = getCliConfig(projectInfo.platform);
    const checkedPages: CheckedMiniProgramPage[] = [];
    const issues: Issue[] = [];
    const screenshots: string[] = [];

    const screenshotDir = options.screenshotDir || join(projectInfo.projectDir, DEFAULT_SCREENSHOT_DIR);
    const baselineDir = options.baselineDir || join(screenshotDir, "baseline");
    const diffDir = join(screenshotDir, "diff");

    for (const dir of [screenshotDir, baselineDir, diffDir]) {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }

    const profile = getScreenshotProfile(projectInfo.platform);

    for (const page of pages) {
        const screenshotPath = getCurrentScreenshotPath(screenshotDir, page, undefined, profile);
        const baselinePath = getBaselinePath(baselineDir, page, undefined, profile);

        const output = runScreenshot(config, projectInfo.projectDir, screenshotPath, options.timeout ?? 60000);
        if (!output || !existsSync(screenshotPath)) {
            issues.push({
                ruleId: "miniprogram-screenshot-failed",
                title: `小程序页面 ${page} 截图失败`,
                description: `调用${config.label}开发者工具 --screenshot 未生成截图。当前版本的开发者工具可能不支持该命令。`,
                severity: "warning",
                file: projectInfo.projectDir,
                line: 1,
                column: 1,
                meta: { ...baseMeta, pagePath: page },
            });
            checkedPages.push({
                path: page,
                status: "warning",
                messages: ["截图失败"],
                platform: projectInfo.platform,
            });
            continue;
        }

        screenshots.push(screenshotPath);

        if (options.updateBaseline) {
            const baselineParent = dirname(baselinePath);
            if (!existsSync(baselineParent)) mkdirSync(baselineParent, { recursive: true });
            writeFileSync(baselinePath, readFileSync(screenshotPath));
            checkedPages.push({
                path: page,
                status: "ok",
                messages: ["已更新基线截图"],
                screenshotPath,
                baselinePath,
                platform: projectInfo.platform,
            });
            continue;
        }

        if (!existsSync(baselinePath)) {
            checkedPages.push({
                path: page,
                status: "warning",
                messages: ["缺少基线截图，本次已保存当前截图，请确认后使用 --miniprogram-update-baseline 更新基线"],
                screenshotPath,
                baselinePath,
                platform: projectInfo.platform,
            });
            continue;
        }

        if (isPixelmatchAvailable() && isPngjsAvailable()) {
            const diffPath = getDiffImagePath(diffDir, page, undefined, profile);
            const regression = await compareScreenshotsPixel(screenshotPath, baselinePath, diffPath, {
                maxDiffPixels: options.diffThresholdPixels,
                maxDiffPixelRatio: options.diffThresholdRatio,
            });
            if (
                regression &&
                isVisualRegressionFailed(regression, {
                    maxDiffPixels: options.diffThresholdPixels,
                    maxDiffPixelRatio: options.diffThresholdRatio,
                })
            ) {
                checkedPages.push({
                    path: page,
                    status: "warning",
                    messages: [
                        `截图与基线不同：差异像素 ${regression.diffPixels} (${(regression.diffPixelRatio * 100).toFixed(2)}%)`,
                    ],
                    screenshotChanged: true,
                    screenshotPath,
                    baselinePath,
                    platform: projectInfo.platform,
                });
                issues.push({
                    ruleId: "miniprogram-screenshot-changed",
                    title: `小程序页面 ${page} 截图与基线不同`,
                    description: `页面 ${page} 截图差异像素 ${regression.diffPixels}，比例 ${(regression.diffPixelRatio * 100).toFixed(2)}%。`,
                    severity: "warning",
                    file: projectInfo.projectDir,
                    line: 1,
                    column: 1,
                    meta: {
                        ...baseMeta,
                        pagePath: page,
                        diffPixels: regression.diffPixels,
                        diffPixelRatio: regression.diffPixelRatio,
                    },
                });
                continue;
            }
        }

        checkedPages.push({
            path: page,
            status: "ok",
            messages: ["截图与基线一致"],
            screenshotPath,
            baselinePath,
            platform: projectInfo.platform,
        });
    }

    return { checkedPages, issues, screenshots };
}

/** 对首页进行截图冒烟测试 */
async function runScreenshotSmoke(
    projectInfo: MiniProgramProjectInfo,
    options: SinglePlatformOptions,
    baseMeta: Record<string, unknown>
): Promise<{ checkedPages?: CheckedMiniProgramPage[]; issues?: Issue[]; screenshots?: string[] }> {
    if (!options.screenshot) {
        return {};
    }

    const config = getCliConfig(projectInfo.platform);

    if (!isDevToolsAvailable(config)) {
        return {
            issues: [
                {
                    ruleId: "miniprogram-screenshot-skipped",
                    title: `小程序截图因缺少${config.label}开发者工具已跳过`,
                    description: `未检测到${config.label}开发者工具 CLI。如需截图，请安装并配置环境变量 ${config.envVar} 或将其加入 PATH。下载地址：${config.downloadUrl}`,
                    severity: "suggestion",
                    file: projectInfo.projectDir,
                    line: 1,
                    column: 1,
                    meta: baseMeta,
                },
            ],
        };
    }

    const pages = options.crossPlatformDiff
        ? (options.diffPages ?? projectInfo.pages).slice(0, options.diffMaxPages ?? DEFAULT_DIFF_MAX_PAGES)
        : ([options.pages?.[0] || projectInfo.pages[0]].filter(Boolean) as string[]);

    if (pages.length === 0) {
        return {};
    }

    return runScreenshotForPages(projectInfo, options, pages, baseMeta);
}

/** 解析本次需要测试的平台列表 */
function resolvePlatforms(options: MiniProgramOptions): MiniProgramPlatform[] {
    if (options.platforms?.length) {
        return options.platforms;
    }

    if (options.platform === "all") {
        const detected = detectMiniProgramPlatforms(options.projectDir);
        if (detected.length === 0) {
            throw new Error(
                `无法识别 ${options.projectDir} 的小程序类型。请确保目录下存在以下文件之一：\n` +
                    "  微信: app.json + project.config.json 或 manifest.json + pages.json\n" +
                    "  支付宝: mini.project.json\n" +
                    "  抖音: project.config.json（含 tt 字段）"
            );
        }
        return detected;
    }

    if (options.platform && options.platform !== "auto") {
        return [options.platform];
    }

    const detected = detectMiniProgramPlatform(options.projectDir);
    if (!detected) {
        throw new Error(
            `无法识别 ${options.projectDir} 的小程序类型。请确保目录下存在以下文件之一：\n` +
                "  微信: app.json + project.config.json 或 manifest.json + pages.json\n" +
                "  支付宝: mini.project.json\n" +
                "  抖音: project.config.json（含 tt 字段）"
        );
    }
    return [detected];
}

/** 单平台测试 */
async function runSingleMiniProgramTest(
    platform: MiniProgramPlatform,
    options: SinglePlatformOptions
): Promise<MiniProgramResult> {
    const start = Date.now();

    const projectInfo = resolveMiniProgramProject(options.projectDir, platform);
    if (!projectInfo) {
        throw new Error(`解析 ${platform} 小程序项目失败`);
    }

    const config = getCliConfig(platform);
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

    // 性能检查
    let performanceData: MiniProgramPerformanceData | undefined;
    if (options.performance) {
        const perfResult = runPerformanceCheck(projectInfo, options, baseMeta, compileResult.durationMs);
        performanceData = perfResult.data;
        issues.push(...perfResult.issues);
        if (perfResult.suggestion) {
            issues.push(perfResult.suggestion);
        }
    }

    // 缺少开发者工具时给出建议
    if (!isDevToolsAvailable(config)) {
        issues.push({
            ruleId: "miniprogram-devtools-missing",
            title: `未检测到${config.label}开发者工具`,
            description: `已完成的检查为静态检查。如需编译/截图验证，请安装${config.label}开发者工具并加入 PATH，或设置环境变量 ${config.envVar}。下载地址：${config.downloadUrl}`,
            severity: "suggestion",
            file: projectInfo.projectDir,
            line: 1,
            column: 1,
            meta: baseMeta,
        });
    }

    // 截图冒烟（v3.12.0 支持多页面）
    const screenshotResult = await runScreenshotSmoke(projectInfo, options, baseMeta);
    if (screenshotResult.issues) {
        issues.push(...screenshotResult.issues);
    }
    if (screenshotResult.checkedPages) {
        for (const page of screenshotResult.checkedPages) {
            const existing = checkedPages.find((p) => p.path === page.path);
            if (existing) {
                Object.assign(existing, page);
            } else {
                checkedPages.push(page);
            }
        }
    }
    if (screenshotResult.screenshots) {
        screenshots.push(...screenshotResult.screenshots);
    }

    return {
        platform,
        projectDir: options.projectDir,
        issues,
        checkedPages,
        screenshots,
        duration: Date.now() - start,
        performanceData,
    };
}

/** 跨平台截图差异对比（v3.12.0） */
async function runCrossPlatformDiff(
    results: MiniProgramResult[],
    options: SinglePlatformOptions,
    baseMeta: Record<string, unknown>
): Promise<{ diffs: CrossPlatformDiffResult[]; issues: Issue[] }> {
    const diffs: CrossPlatformDiffResult[] = [];
    const issues: Issue[] = [];

    const mode = options.diffMode || "reference";
    const reference = options.diffReferencePlatform || DEFAULT_DIFF_REFERENCE_PLATFORM;
    const thresholdPixels = options.diffThresholdPixels;
    const thresholdRatio = options.diffThresholdRatio;

    // pagePath -> platform -> screenshotPath
    const screenshotMap = new Map<string, Map<MiniProgramPlatform, string>>();
    for (const r of results) {
        if (r.platform === "multi") continue;
        const platform = r.platform as MiniProgramPlatform;
        for (const page of r.checkedPages) {
            if (!page.screenshotPath) continue;
            if (!screenshotMap.has(page.path)) {
                screenshotMap.set(page.path, new Map());
            }
            screenshotMap.get(page.path)?.set(platform, page.screenshotPath);
        }
    }

    const screenshotDir = options.screenshotDir || join(options.projectDir, DEFAULT_SCREENSHOT_DIR);
    const crossDir = join(screenshotDir, "cross-platform");
    if (!existsSync(crossDir)) mkdirSync(crossDir, { recursive: true });

    const visualOpts = {
        maxDiffPixels: thresholdPixels,
        maxDiffPixelRatio: thresholdRatio,
    };

    for (const [pagePath, platformMap] of screenshotMap) {
        const platforms = Array.from(platformMap.keys());
        if (platforms.length < 2) continue;

        if (mode === "reference") {
            const refPath = platformMap.get(reference);
            if (!refPath) continue;

            for (const [platform, screenshotPath] of platformMap) {
                if (platform === reference) continue;

                const diffImagePath = join(
                    crossDir,
                    `reference-${reference}`,
                    safeRouteName(pagePath),
                    `${platform}_diff.png`
                );
                const diffParent = dirname(diffImagePath);
                if (!existsSync(diffParent)) mkdirSync(diffParent, { recursive: true });

                const diffResult = await compareScreenshotsPixel(refPath, screenshotPath, diffImagePath, visualOpts);
                const result: CrossPlatformDiffResult = {
                    pagePath,
                    platformA: reference,
                    platformB: platform,
                    diffResult,
                };

                if (diffResult && isVisualRegressionFailed(diffResult, visualOpts)) {
                    const issue: Issue = {
                        ruleId: "miniprogram-cross-platform-screenshot-diff",
                        title: `小程序跨平台截图差异: ${pagePath} (${reference} vs ${platform})`,
                        description: `页面 ${pagePath} 在 ${reference} 与 ${platform} 平台截图差异像素 ${diffResult.diffPixels}，比例 ${(diffResult.diffPixelRatio * 100).toFixed(2)}%。差异图: ${diffImagePath}`,
                        severity: "warning",
                        file: options.projectDir,
                        line: 1,
                        column: 1,
                        meta: {
                            ...baseMeta,
                            pagePath,
                            referencePlatform: reference,
                            comparePlatform: platform,
                            diffPixels: diffResult.diffPixels,
                            diffPixelRatio: diffResult.diffPixelRatio,
                            diffImagePath,
                        },
                    };
                    result.issue = issue;
                    issues.push(issue);
                }

                diffs.push(result);
            }
        } else {
            // pairwise
            for (let i = 0; i < platforms.length; i++) {
                for (let j = i + 1; j < platforms.length; j++) {
                    const platformA = platforms[i];
                    const platformB = platforms[j];
                    const pathA = platformMap.get(platformA);
                    const pathB = platformMap.get(platformB);
                    if (!pathA || !pathB) continue;

                    const diffImagePath = join(
                        crossDir,
                        "pairwise",
                        safeRouteName(pagePath),
                        `${platformA}_vs_${platformB}_diff.png`
                    );
                    const diffParent = dirname(diffImagePath);
                    if (!existsSync(diffParent)) mkdirSync(diffParent, { recursive: true });

                    const diffResult = await compareScreenshotsPixel(pathA, pathB, diffImagePath, visualOpts);
                    const result: CrossPlatformDiffResult = {
                        pagePath,
                        platformA,
                        platformB,
                        diffResult,
                    };

                    if (diffResult && isVisualRegressionFailed(diffResult, visualOpts)) {
                        const issue: Issue = {
                            ruleId: "miniprogram-cross-platform-screenshot-diff",
                            title: `小程序跨平台截图差异: ${pagePath} (${platformA} vs ${platformB})`,
                            description: `页面 ${pagePath} 在 ${platformA} 与 ${platformB} 平台截图差异像素 ${diffResult.diffPixels}，比例 ${(diffResult.diffPixelRatio * 100).toFixed(2)}%。差异图: ${diffImagePath}`,
                            severity: "warning",
                            file: options.projectDir,
                            line: 1,
                            column: 1,
                            meta: {
                                ...baseMeta,
                                pagePath,
                                platformA,
                                platformB,
                                diffPixels: diffResult.diffPixels,
                                diffPixelRatio: diffResult.diffPixelRatio,
                                diffImagePath,
                            },
                        };
                        result.issue = issue;
                        issues.push(issue);
                    }

                    diffs.push(result);
                }
            }
        }
    }

    return { diffs, issues };
}

// ── 主入口 ───────────────────────────────────────────────────────────────────

/**
 * 运行小程序自动化测试
 */
export async function runMiniProgramTest(options: MiniProgramOptions): Promise<MiniProgramResult> {
    const platforms = resolvePlatforms(options);

    // 单平台时直接返回，保持向后兼容
    if (platforms.length === 1) {
        const single: SinglePlatformOptions = options;
        return runSingleMiniProgramTest(platforms[0], single);
    }

    const singleOptions: SinglePlatformOptions = options;
    const results: MiniProgramResult[] = [];
    for (const platform of platforms) {
        results.push(await runSingleMiniProgramTest(platform, singleOptions));
    }

    const merged: MiniProgramResult = {
        platform: "multi",
        platforms,
        projectDir: options.projectDir,
        issues: [],
        checkedPages: [],
        screenshots: [],
        duration: 0,
        performanceData: [],
    };

    for (const r of results) {
        merged.issues.push(...r.issues);
        merged.checkedPages.push(...r.checkedPages.map((p) => ({ ...p, platform: r.platform as MiniProgramPlatform })));
        merged.screenshots.push(...r.screenshots);
        merged.duration += r.duration;
        if (r.performanceData) {
            const arr = Array.isArray(r.performanceData) ? r.performanceData : [r.performanceData];
            (merged.performanceData as MiniProgramPerformanceData[]).push(...arr);
        }
    }

    if ((merged.performanceData as MiniProgramPerformanceData[]).length === 0) {
        delete merged.performanceData;
    }

    // v3.12.0: 跨平台截图差异对比
    if (options.crossPlatformDiff && platforms.length > 1) {
        const diffResult = await runCrossPlatformDiff(results, singleOptions, { projectDir: options.projectDir });
        if (diffResult.diffs.length > 0) {
            merged.crossPlatformDiffs = diffResult.diffs;
            merged.issues.push(...diffResult.issues);
        }
    }

    return merged;
}

// ── 格式化输出 ─────────────────────────────────────────────────────────────────

/**
 * 将结果格式化为终端报告
 */
export function formatMiniProgramReport(result: MiniProgramResult): string {
    const lines: string[] = [];

    if (result.platform === "multi" && result.platforms) {
        lines.push(`🛰️  多平台小程序自动化测试报告`);
        lines.push(`   平台: ${result.platforms.map(getMiniProgramPlatformLabel).join(", ")}`);
    } else {
        const platformLabel = getMiniProgramPlatformLabel(result.platform as MiniProgramPlatform);
        lines.push(`🛰️  ${platformLabel}小程序自动化测试报告`);
    }

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
        const prefix = page.platform ? `[${getMiniProgramPlatformLabel(page.platform)}] ` : "";
        const icon = page.status === "ok" ? "✅" : page.status === "warning" ? "⚠️" : "❌";
        lines.push(`   ${icon} ${prefix}${page.path}`);
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

    if (result.performanceData) {
        lines.push("");
        const dataArr = Array.isArray(result.performanceData) ? result.performanceData : [result.performanceData];
        for (const data of dataArr) {
            lines.push(...formatPerformanceMetrics(data));
        }
    }

    // v3.12.0: 跨平台截图对比
    if (result.crossPlatformDiffs && result.crossPlatformDiffs.length > 0) {
        lines.push("");
        lines.push(`   🔍 跨平台截图对比 (${result.crossPlatformDiffs.length} 组)`);
        const failedCount = result.crossPlatformDiffs.filter((d) => d.issue).length;
        if (failedCount > 0) {
            lines.push(`   ⚠️  发现差异: ${failedCount} 组`);
        } else {
            lines.push(`   ✅ 所有平台截图一致`);
        }
        for (const diff of result.crossPlatformDiffs) {
            const icon = diff.issue ? "⚠️" : "✅";
            lines.push(`   ${icon} ${diff.pagePath} (${diff.platformA} vs ${diff.platformB})`);
            if (diff.diffResult) {
                lines.push(
                    `      差异像素: ${diff.diffResult.diffPixels} (${(diff.diffResult.diffPixelRatio * 100).toFixed(2)}%)`
                );
                lines.push(`      差异图: ${diff.diffResult.diffImagePath}`);
            }
        }
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
            platforms: result.platforms,
            projectDir: result.projectDir,
            totalPages: result.checkedPages.length,
            ok: result.checkedPages.filter((p) => p.status === "ok").length,
            warning: result.checkedPages.filter((p) => p.status === "warning").length,
            error: result.checkedPages.filter((p) => p.status === "error").length,
            duration: result.duration,
            issueCount: result.issues.length,
            screenshotCount: result.screenshots.length,
            crossPlatformDiffCount: result.crossPlatformDiffs?.length ?? 0,
            crossPlatformDiffFailedCount: result.crossPlatformDiffs?.filter((d) => d.issue).length ?? 0,
        },
        pages: result.checkedPages,
        issues: result.issues,
        screenshots: result.screenshots,
        performanceData: result.performanceData,
        crossPlatformDiffs: result.crossPlatformDiffs?.map((d) => ({
            pagePath: d.pagePath,
            platformA: d.platformA,
            platformB: d.platformB,
            diffPixels: d.diffResult?.diffPixels,
            diffPixelRatio: d.diffResult?.diffPixelRatio,
            diffImagePath: d.diffResult?.diffImagePath,
            hasIssue: !!d.issue,
        })),
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
        meta: {
            crossPlatformDiffCount: result.crossPlatformDiffs?.length,
            crossPlatformDiffFailedCount: result.crossPlatformDiffs?.filter((d) => d.issue).length,
        },
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
            platforms: result.platforms,
            screenshotCount: result.screenshots.length,
            crossPlatformDiffCount: result.crossPlatformDiffs?.length,
            crossPlatformDiffFailedCount: result.crossPlatformDiffs?.filter((d) => d.issue).length,
            performanceData: result.performanceData
                ? Array.isArray(result.performanceData)
                    ? result.performanceData.map((d) => ({
                          platform: d.platform,
                          compileDurationMs: d.compileDurationMs,
                          mainPackageSizeBytes: d.mainPackageSizeBytes,
                          subPackageCount: d.subPackages.length,
                          pageCount: d.pages.length,
                          startupTimeMs: d.startupTimeMs,
                          fps: d.fps,
                          setDataPageCount: d.setDataMetrics.length,
                      }))
                    : {
                          platform: result.performanceData.platform,
                          compileDurationMs: result.performanceData.compileDurationMs,
                          mainPackageSizeBytes: result.performanceData.mainPackageSizeBytes,
                          subPackageCount: result.performanceData.subPackages.length,
                          pageCount: result.performanceData.pages.length,
                          startupTimeMs: result.performanceData.startupTimeMs,
                          fps: result.performanceData.fps,
                          setDataPageCount: result.performanceData.setDataMetrics.length,
                      }
                : undefined,
        },
    };

    return uploadToDashboardServer(payload, config);
}
