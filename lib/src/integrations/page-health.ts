/**
 * Page Health Check — 页面运行时健康检查（v3.7.1）
 *
 * 结合 webapp-testing skill 的侦察-行动模式，对项目路由进行运行时验证：
 * 1. 启动浏览器（Playwright），访问每个路由
 * 2. 等待 networkidle，确保动态内容加载完成
 * 3. 捕获控制台日志、资源加载失败、页面白屏
 * 4. 截图保存，供人工核查
 * 5. 将异常转换为 frontend-guardian Issue 格式
 *
 * 设计哲学：Playwright 是可选依赖，未安装时给出友好提示，不强制引入。
 */

import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ProjectIndexer } from "@/engine/indexer.js";
import type { Issue, ScanResult } from "@/types.js";
import {
    type CoreWebVitalsResult,
    checkCWVThresholds,
    extractCoreWebVitals,
    isLighthouseAvailable,
    runLighthouseForUrl,
} from "@/utils/lighthouse-metrics.js";
import {
    type BrowserName,
    buildProfileKey,
    DEFAULT_MOBILE_DEVICE,
    parseViewport,
    resolveBrowserTypes,
} from "@/utils/page-health-profile.js";
import { type AxeViolation, axeViolationsToIssues, isAxeCoreAvailable, runAxeOnPage } from "@/utils/runtime-a11y.js";
import {
    compareScreenshotsPixel,
    getBaselinePath,
    getCurrentScreenshotPath,
    getDiffImagePath,
    isPixelmatchAvailable,
    isPngjsAvailable,
    type VisualRegressionResult,
} from "@/utils/visual-regression.js";
import { analyzeVisualRegression, type AIVisionResult } from "@/utils/ai-vision.js";

export type { BrowserName } from "@/utils/page-health-profile.js";

import {
    type DashboardClientConfig,
    type DashboardUploadResult,
    uploadToDashboardServer,
} from "@/utils/dashboard-client.js";

// ── 类型 ───────────────────────────────────────────────────────────────────

export interface PageHealthOptions {
    /** 项目根目录 */
    projectDir: string;
    /** 要检查的路由列表（不传则自动从索引获取） */
    routes?: string[];
    /** 基础 URL（如 http://localhost:5173） */
    baseUrl?: string;
    /** 启动 dev server 的命令（如 "npm run dev"） */
    serveCommand?: string;
    /** dev server 端口 */
    servePort?: number;
    /** 单个页面检查超时（毫秒） */
    timeout?: number;
    /** 是否截图 */
    screenshot?: boolean;
    /** 是否检查控制台错误 */
    checkConsole?: boolean;
    /** 是否检查白屏 */
    checkWhiteScreen?: boolean;
    /** 是否检查资源加载失败 */
    checkResources?: boolean;
    /** 是否检查交互元素（button/link/input 可点击性） */
    checkInteractive?: boolean;
    /** 截图保存目录 */
    screenshotDir?: string;
    /** 并发检查的页面数量（默认 3） */
    concurrency?: number;
    /** 上报到的 dashboard server URL */
    server?: string;
    /** dashboard server auth token */
    authToken?: string;
    /** 是否更新基线截图 */
    updateBaseline?: boolean;
    /** 基线截图目录 */
    baselineDir?: string;

    // ── v3.10.0 页面测试进阶 ──
    /** 元素级截图选择器（默认全页截图） */
    screenshotSelector?: string;
    /** 视觉回归最大差异像素数（默认 100） */
    maxDiffPixels?: number;
    /** 视觉回归最大差异像素比例（默认 0.01） */
    maxDiffPixelRatio?: number;
    /** 禁用动态内容遮罩 */
    noMask?: boolean;
    /** 额外遮罩选择器 */
    maskSelectors?: string[];
    /** 启用 Lighthouse Core Web Vitals */
    metrics?: boolean;
    /** CWV 阈值覆盖 */
    cwvThresholds?: {
        lcp?: number;
        cls?: number;
        fcp?: number;
        ttfb?: number;
        inp?: number;
    };
    /** 启用运行时无障碍检测 */
    a11y?: boolean;
    /** axe-core 过滤标签 */
    a11yTags?: string[];

    // ── v3.10.1 跨浏览器与移动端视口 ──
    /** 浏览器引擎，默认 chromium；all 会依次跑 chromium/firefox/webkit */
    browser?: BrowserName | "all";
    /** Playwright 设备名称，如 "iPhone 14 Pro" */
    device?: string;
    /** 自定义视口尺寸，如 "390x844" */
    viewport?: string;
    /** 使用移动端预设视口（iPhone 14 Pro） */
    viewportMobile?: boolean;

    // ── v3.14.1 ──
    /** 启用 LLM Vision 判断截图差异是否为噪声 */
    aiVision?: boolean;
    /** 即使 AI Vision 判断为噪声也上报 visual regression issue */
    aiVisionStrict?: boolean;
    /** 录制页面操作视频 */
    recordVideo?: boolean;
    /** 视频保存目录（可选，默认 .frontend-guardian/videos/） */
    videoDir?: string;
}

export interface CheckedRoute {
    /** 路由路径 */
    path: string;
    /** 完整访问 URL */
    url: string;
    /** 检查结果状态 */
    status: "ok" | "error" | "warning";
    /** HTTP 状态码 */
    httpStatus?: number;
    /** 控制台 Error 数量 */
    consoleErrors: number;
    /** 控制台 Warning 数量 */
    consoleWarns: number;
    /** 资源加载失败数量 */
    resourceErrors: number;
    /** 页面是否有可见内容 */
    hasContent: boolean;
    /** 检查耗时（毫秒） */
    duration: number;
    /** 错误信息列表 */
    messages: string[];
    /** 交互元素总数 */
    interactiveTotal?: number;
    /** 可见的交互元素数 */
    interactiveVisible?: number;
    /** 不可用的交互元素数 */
    interactiveDisabled?: number;
    /** 截图是否与基线不同 */
    screenshotChanged?: boolean;
    /** 基线截图路径 */
    baselinePath?: string;
    /** v3.10.0: 像素级视觉回归结果 */
    visualRegression?: VisualRegressionResult;
    /** v3.10.0: Lighthouse Core Web Vitals */
    metrics?: CoreWebVitalsResult;
    /** v3.10.0: axe-core 运行时无障碍问题 */
    a11yViolations?: AxeViolation[];
    /** v3.10.1: 浏览器引擎 */
    browser?: BrowserName;
    /** v3.10.1: 视口/设备标识 */
    viewport?: string;
    /** v3.14.1: AI 视觉分析结果 */
    aiVisionResult?: AIVisionResult;
    /** v3.14.1: 视频回放路径 */
    videoPath?: string;
}

export interface PageHealthResult {
    /** 发现的 Issue */
    issues: Issue[];
    /** 每个路由的检查结果 */
    checkedRoutes: CheckedRoute[];
    /** 截图文件路径 */
    screenshots: string[];
    /** v3.14.1: 视频文件路径 */
    videos?: string[];
    /** 总耗时（毫秒） */
    duration: number;
    /** 使用的 baseUrl */
    baseUrl: string;
}

interface ProfileResult {
    issues: Issue[];
    checkedRoutes: CheckedRoute[];
    screenshots: string[];
    videos: string[];
}

// ── 常量 ───────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_SERVE_PORT = 5173;
const SCREENSHOT_DIR = ".frontend-guardian/screenshots";

/** v3.10.0: 内置不稳定元素遮罩选择器 */
const BUILT_IN_MASK_SELECTORS = [
    '[data-testid="timestamp"]',
    '[data-testid="date"]',
    ".ad-banner",
    ".live-clock",
    "[data-random]",
    ".dynamic-time",
];

// ── 截图对比辅助 ───────────────────────────────────────────────────────────

function hashFile(filePath: string): string {
    const buf = readFileSync(filePath);
    return createHash("sha256").update(buf).digest("hex");
}

function compareScreenshotHash(currentPath: string, baselinePath: string): boolean {
    if (!existsSync(baselinePath)) return false;
    try {
        return hashFile(currentPath) === hashFile(baselinePath);
    } catch {
        return false;
    }
}

// ── v3.10.0 动态内容遮罩 ───────────────────────────────────────────────────

/**
 * 在页面上对不稳定元素应用统一灰色遮罩
 */
async function applyMasking(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page: any,
    extraSelectors?: string[]
): Promise<void> {
    const selectors = [...BUILT_IN_MASK_SELECTORS, ...(extraSelectors || [])];
    if (selectors.length === 0) return;

    const css = `
        ${selectors.join(", ")} {
            background-color: #c0c0c0 !important;
            background-image: none !important;
            color: #c0c0c0 !important;
            border-color: #c0c0c0 !important;
            text-shadow: none !important;
            box-shadow: none !important;
            opacity: 1 !important;
        }
    `;

    try {
        await page.addStyleTag({ content: css });
    } catch {
        // 遮罩失败不阻断后续检查
    }
}

// ── 核心函数 ───────────────────────────────────────────────────────────────

/**
 * 检查 Playwright 是否可用
 */
export function isPlaywrightAvailable(): boolean {
    try {
        // 尝试 require playwright 包
        const pwPath = require.resolve("playwright");
        return !!pwPath;
    } catch {
        return false;
    }
}

/**
 * 启动 dev server 并等待端口就绪
 */
export async function startDevServer(command: string, port: number, projectDir: string): Promise<ChildProcess> {
    const parts = command.split(" ");
    const [cmd, ...args] = parts;

    const child = spawn(cmd, args, {
        cwd: projectDir,
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
    });

    // 等待端口就绪（轮询检查）
    const ready = await waitForPort(port, 30000);
    if (!ready) {
        child.kill();
        throw new Error(`Dev server 未在 30 秒内在端口 ${port} 就绪`);
    }

    return child;
}

/**
 * 轮询等待端口就绪
 */
async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const net = await import("node:net");
            const socket = net.createConnection(port, "127.0.0.1");
            await new Promise<void>((resolve, reject) => {
                socket.once("connect", () => {
                    socket.destroy();
                    resolve();
                });
                socket.once("error", reject);
            });
            return true;
        } catch {
            await sleep(500);
        }
    }
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 并发控制辅助函数 —— 限制同时运行的异步任务数量
 */
async function runWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
    const queue = [...items];
    const workers = Array.from({ length: concurrency }, async () => {
        while (true) {
            const item = queue.shift();
            if (!item) break;
            try {
                await fn(item);
            } catch {
                // 单个任务失败不阻断其他任务（错误已在 fn 内处理）
            }
        }
    });
    await Promise.all(workers);
}

/** 当显式指定 browser/device/viewport/viewportMobile 时，需要按 profile 隔离基线 */
function shouldIsolateProfiles(options: PageHealthOptions): boolean {
    return !!(options.browser || options.device || options.viewport || options.viewportMobile);
}

/** 根据 device / viewport / viewportMobile 构造 Playwright context options */
function buildContextOptions(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pw: any,
    options: PageHealthOptions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
    const deviceName = options.device || (options.viewportMobile ? DEFAULT_MOBILE_DEVICE : undefined);

    if (deviceName) {
        const device = pw.devices?.[deviceName];
        if (!device) {
            const available = Object.keys(pw.devices || {})
                .slice(0, 10)
                .join(", ");
            throw new Error(`未找到 Playwright 设备: ${deviceName}。可用示例: ${available}...`);
        }
        if (options.viewport) {
            const viewport = parseViewport(options.viewport);
            return { ...device, viewport };
        }
        return { ...device };
    }

    if (options.viewport) {
        const viewport = parseViewport(options.viewport);
        return { viewport };
    }

    return { viewport: { width: 1280, height: 720 } };
}

async function runPageHealthProfile(
    browserType: BrowserName,
    routes: string[],
    options: PageHealthOptions,
    baseUrl: string,
    screenshotDir: string,
    baselineDir: string,
    diffDir: string
): Promise<ProfileResult> {
    // 动态导入 Playwright（避免在模块加载时失败）
    // @ts-expect-error — playwright 是可选依赖，运行时检测
    const pw = await import("playwright");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const browserLauncher = (pw as any)[browserType];

    const browser = await browserLauncher.launch({ headless: true });
    const contextOptions = buildContextOptions(pw, options);

    const profileKey = shouldIsolateProfiles(options)
        ? buildProfileKey(browserType, {
              device: options.device,
              viewport: options.viewport,
              viewportMobile: options.viewportMobile,
          })
        : undefined;

    const viewportKey = profileKey ? profileKey.split("/")[1] : undefined;

    // v3.14.1: 录制页面操作视频
    let videoDir: string | undefined;
    if (options.recordVideo) {
        const timestamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
        videoDir = resolve(screenshotDir, "..", "videos", timestamp, browserType, viewportKey || "default");
        if (!existsSync(videoDir)) {
            mkdirSync(videoDir, { recursive: true });
        }
        contextOptions.recordVideo = {
            dir: videoDir,
            size: contextOptions.viewport || { width: 1280, height: 720 },
        };
    }

    const context = await browser.newContext(contextOptions);

    const checkedRoutes: CheckedRoute[] = [];
    const issues: Issue[] = [];
    const screenshots: string[] = [];
    const videos: string[] = [];

    const checkConsole = options.checkConsole !== false;
    const checkWhiteScreen = options.checkWhiteScreen !== false;
    const checkResources = options.checkResources !== false;
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    const concurrency = options.concurrency || 3;

    const checkRoute = async (route: string) => {
        const pageStart = Date.now();
        const url = baseUrl + (route.startsWith("/") ? route : "/" + route);

        const page = await context.newPage();

        // 收集控制台日志和资源错误
        const consoleErrors: string[] = [];
        const consoleWarns: string[] = [];
        const resourceErrors: string[] = [];

        if (checkConsole) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            page.on("console", (msg: any) => {
                const text: string = msg.text();
                if (msg.type() === "error") {
                    consoleErrors.push(text);
                } else if (msg.type() === "warning") {
                    consoleWarns.push(text);
                }
            });
        }

        if (checkResources) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            page.on("requestfailed", (request: any) => {
                const failure = request.failure();
                resourceErrors.push(`${request.url()} — ${failure?.errorText || "unknown"}`);
            });
        }

        let httpStatus: number | undefined;
        let hasContent = true;
        let status: CheckedRoute["status"] = "ok";
        const messages: string[] = [];
        let interactiveTotal = 0;
        let interactiveVisible = 0;
        let interactiveDisabled = 0;
        let a11yViolations: AxeViolation[] | undefined;

        try {
            // 导航到页面并等待加载
            const response = await page.goto(url, {
                waitUntil: "networkidle",
                timeout,
            });

            httpStatus = response?.status();

            // HTTP 错误
            if (httpStatus && httpStatus >= 400) {
                status = "error";
                messages.push(`HTTP ${httpStatus}`);
            }

            // 白屏检测
            if (checkWhiteScreen) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const bodyText = await (page as any).evaluate(() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const body = (globalThis as any).document.body;
                    return body ? body.innerText.trim().length : 0;
                });
                hasContent = bodyText > 0;
                if (!hasContent) {
                    status = status === "error" ? "error" : "warning";
                    messages.push("页面可能白屏（body 无可见内容）");
                }
            }

            // 交互元素检测
            const checkInteractive = options.checkInteractive !== false;
            if (checkInteractive && hasContent) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const interactive = await (page as any).evaluate(() => {
                    const doc = (globalThis as any).document;
                    const selectors =
                        'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="radio"]';
                    const elements = doc.querySelectorAll(selectors);
                    let total = 0;
                    let visible = 0;
                    let disabled = 0;
                    for (const el of Array.from(elements)) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const htmlEl = el as any;
                        // 只统计可见区域尺寸 > 0 的元素
                        const rect = htmlEl.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0) continue;
                        total++;
                        const style = (globalThis as any).getComputedStyle(htmlEl);
                        const isVisible =
                            style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const isDisabled =
                            (htmlEl as any).disabled ||
                            htmlEl.getAttribute("aria-disabled") === "true" ||
                            htmlEl.getAttribute("disabled") !== null;
                        if (isVisible) visible++;
                        if (isDisabled) disabled++;
                    }
                    return { total, visible, disabled };
                });
                interactiveTotal = interactive.total;
                interactiveVisible = interactive.visible;
                interactiveDisabled = interactive.disabled;
                if (interactiveTotal > 0 && interactiveDisabled > 0) {
                    status = status === "error" ? "error" : "warning";
                    messages.push(`${interactiveDisabled} 个交互元素被禁用`);
                }
            }

            // 资源加载失败
            if (resourceErrors.length > 0) {
                status = status === "error" ? "error" : "warning";
                messages.push(`${resourceErrors.length} 个资源加载失败`);
            }

            // 控制台错误
            if (consoleErrors.length > 0) {
                status = status === "error" ? "error" : "warning";
                messages.push(`${consoleErrors.length} 个控制台 Error`);
            }

            // 控制台警告（不升级状态，只记录）
            if (consoleWarns.length > 0) {
                if (status === "ok") status = "warning";
                messages.push(`${consoleWarns.length} 个控制台 Warning`);
            }

            // v3.10.0: 动态内容遮罩
            if (!options.noMask) {
                await applyMasking(page, options.maskSelectors);
            }

            // v3.10.0: 运行时无障碍检测
            if (options.a11y && isAxeCoreAvailable()) {
                try {
                    const axeResult = await runAxeOnPage(page, options.a11yTags);
                    a11yViolations = axeResult.violations;
                    if (a11yViolations.length > 0) {
                        status = status === "error" ? "error" : "warning";
                        messages.push(`${a11yViolations.length} 个运行时无障碍问题`);
                    }
                } catch {
                    // axe 运行失败不阻断
                }
            }
        } catch (err) {
            status = "error";
            messages.push(`导航失败: ${err instanceof Error ? err.message : String(err)}`);
        }

        // 截图 + 基线对比
        let screenshotChanged = false;
        let baselinePath: string | undefined;
        let visualRegression: VisualRegressionResult | null | undefined;
        if (options.screenshot !== false) {
            const screenshotSelector = options.screenshotSelector;
            const screenshotPath = getCurrentScreenshotPath(screenshotDir, route, screenshotSelector, profileKey);
            baselinePath = getBaselinePath(baselineDir, route, screenshotSelector, profileKey);

            try {
                // 确保 profile 子目录存在
                const screenshotParent = dirname(screenshotPath);
                if (screenshotParent && !existsSync(screenshotParent)) {
                    mkdirSync(screenshotParent, { recursive: true });
                }

                if (screenshotSelector) {
                    // 元素级截图
                    await page.locator(screenshotSelector).screenshot({ path: screenshotPath });
                } else {
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                }
                screenshots.push(screenshotPath);

                // 基线目录
                const baselineParent = dirname(baselinePath);
                if (baselineParent && !existsSync(baselineParent)) {
                    mkdirSync(baselineParent, { recursive: true });
                }

                if (options.updateBaseline) {
                    const { copyFileSync } = await import("node:fs");
                    copyFileSync(screenshotPath, baselinePath);
                } else if (existsSync(baselinePath)) {
                    // 优先使用像素级对比
                    if (isPixelmatchAvailable() && isPngjsAvailable()) {
                        const diffImagePath = getDiffImagePath(diffDir, route, screenshotSelector, profileKey);
                        visualRegression = await compareScreenshotsPixel(screenshotPath, baselinePath, diffImagePath, {
                            maxDiffPixels: options.maxDiffPixels,
                            maxDiffPixelRatio: options.maxDiffPixelRatio,
                        });
                        if (
                            visualRegression &&
                            (visualRegression.diffPixels > visualRegression.thresholdPixels ||
                                visualRegression.diffPixelRatio > visualRegression.thresholdRatio)
                        ) {
                            // v3.14.1: AI 视觉降噪
                            let aiResult: AIVisionResult | null = null;
                            if (options.aiVision) {
                                aiResult = await analyzeVisualRegression({
                                    currentPath: screenshotPath,
                                    baselinePath,
                                    diffPath: diffImagePath,
                                });
                            }

                            if (aiResult && !aiResult.isAnomaly) {
                                if (options.aiVisionStrict) {
                                    screenshotChanged = true;
                                    status = status === "error" ? "error" : "warning";
                                    messages.push(`AI 判断为噪声，但 strict 模式仍上报: ${aiResult.description}`);
                                } else {
                                    messages.push(`AI 视觉已忽略噪声: ${aiResult.description}`);
                                }
                            } else {
                                screenshotChanged = true;
                                status = status === "error" ? "error" : "warning";
                                messages.push(aiResult?.description || "截图与基线存在像素级差异（UI 可能发生变化）");
                            }
                            visualRegression.aiVisionResult = aiResult ?? undefined;
                        }
                    } else {
                        // 回退到 SHA256 哈希比对
                        const same = compareScreenshotHash(screenshotPath, baselinePath);
                        if (!same) {
                            screenshotChanged = true;
                            status = status === "error" ? "error" : "warning";
                            messages.push("截图与基线不同（UI 可能发生变化）");
                        }
                    }
                }
            } catch {
                // 截图失败不阻断
            }
        }

        // v3.14.1: 获取视频路径
        let videoPath: string | undefined;
        if (options.recordVideo) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const video = (page as any).video?.();
                if (video) {
                    videoPath = await video.path();
                    if (videoPath) {
                        videos.push(videoPath);
                    }
                }
            } catch {
                // 视频路径获取失败不阻断
            }
        }

        await page.close();

        const pageDuration = Date.now() - pageStart;

        const checkedRoute: CheckedRoute = {
            path: route,
            url,
            status,
            httpStatus,
            consoleErrors: consoleErrors.length,
            consoleWarns: consoleWarns.length,
            resourceErrors: resourceErrors.length,
            hasContent,
            duration: pageDuration,
            messages,
            interactiveTotal,
            interactiveVisible,
            interactiveDisabled,
            screenshotChanged,
            baselinePath,
            visualRegression: visualRegression ?? undefined,
            a11yViolations,
            browser: browserType,
            viewport: viewportKey,
            videoPath,
        };

        checkedRoutes.push(checkedRoute);

        // 生成 Issue
        if (status !== "ok") {
            issues.push(...routeToIssues(checkedRoute, options.projectDir, consoleErrors, resourceErrors));
        }
    };

    try {
        await runWithConcurrency(routes, concurrency, checkRoute);

        // v3.10.0: Lighthouse Core Web Vitals 采集（仅 Chromium 支持）
        if (options.metrics && browserType === "chromium" && isLighthouseAvailable() && checkedRoutes.length > 0) {
            const wsEndpoint = browser.wsEndpoint?.() as string | undefined;
            const port = wsEndpoint ? Number(new URL(wsEndpoint).port) : 0;
            if (port > 0) {
                const contextLh = await browser.newContext(contextOptions);
                try {
                    for (const checkedRoute of checkedRoutes) {
                        const route = checkedRoute.path;
                        const url = baseUrl + (route.startsWith("/") ? route : "/" + route);
                        try {
                            const runnerResult = await runLighthouseForUrl(url, port);
                            const cwv = extractCoreWebVitals(runnerResult);
                            checkedRoute.metrics = cwv;
                            const cwvIssues = checkCWVThresholds(cwv, options.cwvThresholds, route, url);
                            issues.push(...cwvIssues);
                        } catch {
                            // Lighthouse 单路由失败不阻断
                        }
                    }
                } finally {
                    await contextLh.close();
                }
            }
        }
    } finally {
        await context.close();
        await browser.close();
    }

    return { issues, checkedRoutes, screenshots, videos };
}

/**
 * 运行页面健康检查
 *
 * @returns 检查结果（Issue 列表 + 路由详情）
 */
export async function runPageHealthCheck(options: PageHealthOptions): Promise<PageHealthResult> {
    const start = Date.now();
    const projectDir = resolve(options.projectDir);

    // 1. 检测 Playwright
    if (!isPlaywrightAvailable()) {
        throw new Error(
            "未检测到 Playwright。请安装: npm install -D playwright\n" +
                "然后安装浏览器: npx playwright install chromium"
        );
    }

    // 2. 确定要检查的路由
    let routes = options.routes || [];
    if (routes.length === 0) {
        const indexer = new ProjectIndexer(projectDir);
        if (indexer.isValid()) {
            const indexedRoutes = indexer.getRoutes();
            routes = indexedRoutes.map((r) => r.path);
        }
    }

    if (routes.length === 0) {
        throw new Error(
            "未检测到路由。请先运行 `fg-core . --build-index` 建立索引，" + "或通过 --routes 指定要检查的路由"
        );
    }

    // 3. 确定 baseUrl
    let baseUrl = options.baseUrl;
    let serverProcess: ChildProcess | null = null;

    if (!baseUrl && options.serveCommand) {
        const port = options.servePort || DEFAULT_SERVE_PORT;
        serverProcess = await startDevServer(options.serveCommand, port, projectDir);
        baseUrl = `http://localhost:${port}`;
    }

    if (!baseUrl) {
        throw new Error("必须指定 --base-url 或 --serve（自动启动 dev server）");
    }

    // 4. 准备截图目录
    const screenshotDir = options.screenshotDir
        ? resolve(projectDir, options.screenshotDir)
        : resolve(projectDir, SCREENSHOT_DIR);

    const baselineDir = options.baselineDir
        ? resolve(projectDir, options.baselineDir)
        : join(screenshotDir, "baseline");
    const diffDir = join(screenshotDir, "diff");

    if (options.screenshot !== false) {
        if (!existsSync(screenshotDir)) {
            mkdirSync(screenshotDir, { recursive: true });
        }
    }

    // 5. 依次跑每个浏览器 profile
    const browserTypes = resolveBrowserTypes(options.browser);
    const allIssues: Issue[] = [];
    const allCheckedRoutes: CheckedRoute[] = [];
    const allScreenshots: string[] = [];
    const allVideos: string[] = [];

    for (const browserType of browserTypes) {
        const profileResult = await runPageHealthProfile(
            browserType,
            routes,
            options,
            baseUrl,
            screenshotDir,
            baselineDir,
            diffDir
        );
        allIssues.push(...profileResult.issues);
        allCheckedRoutes.push(...profileResult.checkedRoutes);
        allScreenshots.push(...profileResult.screenshots);
        allVideos.push(...profileResult.videos);
    }

    if (serverProcess) {
        serverProcess.kill();
    }

    return {
        issues: allIssues,
        checkedRoutes: allCheckedRoutes,
        screenshots: allScreenshots,
        videos: allVideos,
        duration: Date.now() - start,
        baseUrl,
    };
}

/**
 * 将路由检查结果转换为 Issue 列表
 */
function routeToIssues(
    route: CheckedRoute,
    projectDir: string,
    consoleErrors: string[],
    resourceErrors: string[]
): Issue[] {
    const issues: Issue[] = [];
    const baseMeta = {
        url: route.url,
        ...(route.browser !== undefined ? { browser: route.browser } : {}),
        ...(route.viewport !== undefined ? { viewport: route.viewport } : {}),
        ...(route.videoPath ? { videoPath: route.videoPath } : {}),
    };

    // HTTP 错误
    if (route.httpStatus && route.httpStatus >= 400) {
        issues.push({
            ruleId: "page-health-http-error",
            title: `页面返回 HTTP ${route.httpStatus}`,
            description: `路由 ${route.path} 返回 HTTP ${route.httpStatus}，页面可能不存在或服务器异常。`,
            severity: "critical",
            file: route.path,
            line: 1,
            column: 1,
            meta: {
                ...baseMeta,
                httpStatus: route.httpStatus,
            },
        });
    }

    // 白屏
    if (!route.hasContent) {
        issues.push({
            ruleId: "page-health-white-screen",
            title: "页面可能白屏",
            description: `路由 ${route.path} 加载后 body 无可见内容，可能为白屏或 JS 渲染异常。`,
            severity: "critical",
            file: route.path,
            line: 1,
            column: 1,
            meta: baseMeta,
        });
    }

    // 控制台错误
    if (consoleErrors.length > 0) {
        const uniqueErrors = [...new Set(consoleErrors)].slice(0, 5);
        issues.push({
            ruleId: "page-health-console-error",
            title: `页面控制台报错 (${consoleErrors.length} 个)`,
            description:
                `路由 ${route.path} 控制台出现 Error 日志。前 ${uniqueErrors.length} 条:\n` +
                uniqueErrors.map((e) => `  - ${e}`).join("\n"),
            severity: "warning",
            file: route.path,
            line: 1,
            column: 1,
            meta: {
                ...baseMeta,
                errorCount: consoleErrors.length,
                errors: uniqueErrors,
            },
        });
    }

    // 资源加载失败
    if (resourceErrors.length > 0) {
        const uniqueResources = [...new Set(resourceErrors)].slice(0, 5);
        issues.push({
            ruleId: "page-health-resource-error",
            title: `资源加载失败 (${resourceErrors.length} 个)`,
            description:
                `路由 ${route.path} 有资源加载失败。前 ${uniqueResources.length} 个:\n` +
                uniqueResources.map((r) => `  - ${r}`).join("\n"),
            severity: "warning",
            file: route.path,
            line: 1,
            column: 1,
            meta: {
                ...baseMeta,
                resourceCount: resourceErrors.length,
                resources: uniqueResources,
            },
        });
    }

    // 交互元素被禁用
    if ((route.interactiveDisabled ?? 0) > 0) {
        issues.push({
            ruleId: "page-health-interactive-disabled",
            title: `交互元素被禁用 (${route.interactiveDisabled} 个)`,
            description:
                `路由 ${route.path} 检测到 ${route.interactiveDisabled} 个交互元素（button/link/input）被禁用。\n` +
                `总交互元素: ${route.interactiveTotal}，可见: ${route.interactiveVisible}，禁用: ${route.interactiveDisabled}`,
            severity: "warning",
            file: route.path,
            line: 1,
            column: 1,
            meta: {
                ...baseMeta,
                interactiveTotal: route.interactiveTotal,
                interactiveVisible: route.interactiveVisible,
                interactiveDisabled: route.interactiveDisabled,
            },
        });
    }

    // v3.10.0: 像素级视觉回归
    if (route.visualRegression) {
        const aiDesc = route.aiVisionResult?.description;
        const aiNoise = route.aiVisionResult && !route.aiVisionResult.isAnomaly;
        issues.push({
            ruleId: aiNoise ? "page-health-visual-regression-noise" : "page-health-visual-regression",
            title: aiNoise ? "截图差异被 AI 判断为噪声" : "截图与基线存在像素级差异",
            description:
                `路由 ${route.path} 的当前截图与基线截图存在像素级差异。` +
                `差异像素: ${route.visualRegression.diffPixels} ` +
                `(${Math.round(route.visualRegression.diffPixelRatio * 10000) / 100}%)。` +
                (aiDesc ? `\nAI 视觉分析: ${aiDesc}` : ""),
            severity: aiNoise ? "suggestion" : "warning",
            file: route.path,
            line: 1,
            column: 1,
            meta: {
                ...baseMeta,
                diffPixels: route.visualRegression.diffPixels,
                diffPixelRatio: route.visualRegression.diffPixelRatio,
                diffImagePath: route.visualRegression.diffImagePath,
                baselinePath: route.baselinePath,
                thresholdPixels: route.visualRegression.thresholdPixels,
                thresholdRatio: route.visualRegression.thresholdRatio,
                aiVisionResult: route.aiVisionResult,
            },
        });
    }

    // 截图与基线不同（SHA256 回退场景）
    if (route.screenshotChanged && !route.visualRegression) {
        issues.push({
            ruleId: "page-health-screenshot-changed",
            title: "截图与基线不同",
            description:
                `路由 ${route.path} 的当前截图与基线截图不一致，UI 可能发生了变化。\n` +
                (route.baselinePath ? `基线路径: ${route.baselinePath}` : ""),
            severity: "warning",
            file: route.path,
            line: 1,
            column: 1,
            meta: {
                ...baseMeta,
                baselinePath: route.baselinePath,
            },
        });
    }

    // v3.10.0: 运行时无障碍问题
    if (route.a11yViolations && route.a11yViolations.length > 0) {
        const a11yIssues = axeViolationsToIssues(route.a11yViolations, route.path, route.url);
        for (const issue of a11yIssues) {
            issue.meta = { ...issue.meta, ...baseMeta };
        }
        issues.push(...a11yIssues);
    }

    // 导航失败（非 HTTP 错误，而是超时/连接失败等）
    if (route.status === "error" && !route.httpStatus && route.messages.some((m) => m.includes("导航失败"))) {
        issues.push({
            ruleId: "page-health-navigation-failed",
            title: "页面导航失败",
            description: `路由 ${route.path} 无法访问: ${route.messages.find((m) => m.includes("导航失败"))}`,
            severity: "critical",
            file: route.path,
            line: 1,
            column: 1,
            meta: baseMeta,
        });
    }

    return issues;
}

// ── 格式化输出 ─────────────────────────────────────────────────────────────

/**
 * 格式化页面健康检查结果为终端报告
 */
export function formatPageHealthReport(result: PageHealthResult): string {
    const lines: string[] = [];
    lines.push("🌐 页面健康检查报告");
    lines.push(`   基础 URL: ${result.baseUrl}`);
    lines.push(`   检查路由: ${result.checkedRoutes.length} 个`);
    lines.push(`   总耗时: ${result.duration}ms`);
    lines.push("");

    const okCount = result.checkedRoutes.filter((r) => r.status === "ok").length;
    const warnCount = result.checkedRoutes.filter((r) => r.status === "warning").length;
    const errorCount = result.checkedRoutes.filter((r) => r.status === "error").length;

    lines.push(`   ✅ 正常: ${okCount} | ⚠️  警告: ${warnCount} | ❌ 错误: ${errorCount}`);

    // v3.10.1: 浏览器/视口汇总
    const profiles = new Set<string>();
    for (const route of result.checkedRoutes) {
        if (route.browser) {
            profiles.add(`${route.browser}/${route.viewport || "desktop"}`);
        }
    }
    if (profiles.size > 0) {
        lines.push(`   🖥️  浏览器/视口: ${Array.from(profiles).join(", ")}`);
    }

    lines.push("");

    for (const route of result.checkedRoutes) {
        const icon = route.status === "ok" ? "✅" : route.status === "warning" ? "⚠️" : "❌";
        const browserPrefix = route.browser ? `[${route.browser}] ` : "";
        lines.push(`   ${icon} ${browserPrefix}${route.path}`);
        if (route.viewport) {
            lines.push(`      视口: ${route.viewport}`);
        }
        if (route.httpStatus) {
            lines.push(`      HTTP: ${route.httpStatus}`);
        }
        if (route.consoleErrors > 0) {
            lines.push(`      控制台 Error: ${route.consoleErrors}`);
        }
        if (route.resourceErrors > 0) {
            lines.push(`      资源失败: ${route.resourceErrors}`);
        }
        if (route.interactiveTotal !== undefined && route.interactiveTotal > 0) {
            lines.push(`      🖱️  交互元素: ${route.interactiveVisible ?? 0}/${route.interactiveTotal} 可见`);
            if ((route.interactiveDisabled ?? 0) > 0) {
                lines.push(`      ⚠️  禁用: ${route.interactiveDisabled} 个`);
            }
        }
        if (!route.hasContent) {
            lines.push(`      ⚠️  页面可能白屏`);
        }
        if (route.screenshotChanged) {
            lines.push(`      🖼️  截图与基线不同`);
        }
        if (route.visualRegression) {
            lines.push(
                `      🖼️  像素差异: ${route.visualRegression.diffPixels} (${Math.round(route.visualRegression.diffPixelRatio * 10000) / 100}%)`
            );
        }
        if (route.a11yViolations && route.a11yViolations.length > 0) {
            lines.push(`      ♿ 无障碍问题: ${route.a11yViolations.length} 个`);
        }
        if (route.videoPath) {
            lines.push(`      🎥 视频回放: ${route.videoPath}`);
        }
        if (route.metrics) {
            const m = route.metrics;
            const parts: string[] = [];
            if (m.lcp !== undefined) parts.push(`LCP ${m.lcp}ms`);
            if (m.cls !== undefined) parts.push(`CLS ${m.cls}`);
            if (m.fcp !== undefined) parts.push(`FCP ${m.fcp}ms`);
            if (m.ttfb !== undefined) parts.push(`TTFB ${m.ttfb}ms`);
            if (m.inp !== undefined) parts.push(`INP ${m.inp}ms`);
            if (parts.length > 0) {
                lines.push(`      ⚡ ${parts.join(" | ")}`);
            }
        }
        if (route.duration > 5000) {
            lines.push(`      ⏱️  加载耗时: ${route.duration}ms`);
        }
    }

    if (result.screenshots.length > 0) {
        lines.push("");
        lines.push(`   📸 截图已保存 (${result.screenshots.length} 张)`);
        for (const s of result.screenshots.slice(0, 5)) {
            lines.push(`      ${s}`);
        }
        if (result.screenshots.length > 5) {
            lines.push(`      ... 还有 ${result.screenshots.length - 5} 张`);
        }
    }

    return lines.join("\n");
}

/**
 * 格式化页面健康检查结果为 JSON
 */
export function formatPageHealthJson(result: PageHealthResult): object {
    return {
        summary: {
            baseUrl: result.baseUrl,
            totalRoutes: result.checkedRoutes.length,
            ok: result.checkedRoutes.filter((r) => r.status === "ok").length,
            warning: result.checkedRoutes.filter((r) => r.status === "warning").length,
            error: result.checkedRoutes.filter((r) => r.status === "error").length,
            duration: result.duration,
            issueCount: result.issues.length,
            screenshotCount: result.screenshots.length,
            videoCount: result.videos?.length ?? 0,
        },
        routes: result.checkedRoutes,
        issues: result.issues,
        screenshots: result.screenshots,
        videos: result.videos || [],
    };
}

// ── Dashboard 上报 ─────────────────────────────────────────────────────────

/**
 * 将 PageHealthResult 转换为 ScanResult（供 dashboard server 消费）
 */
export function toScanResult(result: PageHealthResult): ScanResult {
    const critical = result.issues.filter((i) => i.severity === "critical");
    const warning = result.issues.filter((i) => i.severity === "warning");
    const suggestion = result.issues.filter((i) => i.severity === "suggestion");

    return {
        module: "page-health",
        total: result.issues.length,
        issues: { critical, warning, suggestion },
        duration: result.duration,
        filesScanned: result.checkedRoutes.length,
        filesWithIssues: result.checkedRoutes.filter((r) => r.status !== "ok").length,
    };
}

/**
 * 将页面健康检查结果上报到治理看板服务器
 *
 * @param result PageHealthResult
 * @param projectDir 项目目录
 * @param config Dashboard server 配置
 * @returns 上报结果
 */
export async function uploadPageHealthResult(
    result: PageHealthResult,
    projectDir: string,
    config: DashboardClientConfig
): Promise<DashboardUploadResult> {
    const projectName = projectDir.split("/").pop() || "unknown";

    const payload = {
        projectName,
        projectPath: projectDir,
        module: "page-health",
        result: toScanResult(result),
        issues: result.issues,
        meta: {
            duration: result.duration,
            filesScanned: result.checkedRoutes.length,
            baseUrl: result.baseUrl,
            screenshotCount: result.screenshots.length,
        },
    };

    return uploadToDashboardServer(payload, config);
}
