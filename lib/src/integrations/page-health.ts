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

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Issue } from "@/types.js";
import { ProjectIndexer } from "@/engine/indexer.js";


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
    /** 截图保存目录 */
    screenshotDir?: string;
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
}

export interface PageHealthResult {
    /** 发现的 Issue */
    issues: Issue[];
    /** 每个路由的检查结果 */
    checkedRoutes: CheckedRoute[];
    /** 截图文件路径 */
    screenshots: string[];
    /** 总耗时（毫秒） */
    duration: number;
    /** 使用的 baseUrl */
    baseUrl: string;
}

// ── 常量 ───────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_SERVE_PORT = 5173;
const SCREENSHOT_DIR = ".frontend-guardian/screenshots";

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
export async function startDevServer(
    command: string,
    port: number,
    projectDir: string
): Promise<ChildProcess> {
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

    // 动态导入 Playwright（避免在模块加载时失败）
    // @ts-ignore — playwright 是可选依赖，运行时检测
    const pw = await import("playwright");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromium = (pw as any).chromium;

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
            "未检测到路由。请先运行 `fg-core . --build-index` 建立索引，" +
                "或通过 --routes 指定要检查的路由"
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
        throw new Error(
            "必须指定 --base-url 或 --serve（自动启动 dev server）"
        );
    }

    // 4. 准备截图目录
    const screenshotDir = options.screenshotDir
        ? resolve(projectDir, options.screenshotDir)
        : resolve(projectDir, SCREENSHOT_DIR);

    if (options.screenshot !== false) {
        if (!existsSync(screenshotDir)) {
            mkdirSync(screenshotDir, { recursive: true });
        }
    }

    // 5. 启动浏览器
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
    });

    const checkedRoutes: CheckedRoute[] = [];
    const issues: Issue[] = [];
    const screenshots: string[] = [];

    const checkConsole = options.checkConsole !== false;
    const checkWhiteScreen = options.checkWhiteScreen !== false;
    const checkResources = options.checkResources !== false;
    const timeout = options.timeout || DEFAULT_TIMEOUT;

    try {
        for (const route of routes) {
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
                    resourceErrors.push(
                        `${request.url()} — ${failure?.errorText || "unknown"}`
                    );
                });
            }

            let httpStatus: number | undefined;
            let hasContent = true;
            let status: CheckedRoute["status"] = "ok";
            const messages: string[] = [];

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
            } catch (err) {
                status = "error";
                messages.push(`导航失败: ${err instanceof Error ? err.message : String(err)}`);
            }

            // 截图
            if (options.screenshot !== false) {
                const safeName = route.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
                const screenshotPath = join(screenshotDir, `${safeName}.png`);
                try {
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                    screenshots.push(screenshotPath);
                } catch {
                    // 截图失败不阻断
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
            };

            checkedRoutes.push(checkedRoute);

            // 生成 Issue
            if (status !== "ok") {
                issues.push(...routeToIssues(checkedRoute, projectDir, consoleErrors, resourceErrors));
            }
        }
    } finally {
        await browser.close();
        if (serverProcess) {
            serverProcess.kill();
        }
    }

    return {
        issues,
        checkedRoutes,
        screenshots,
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
                url: route.url,
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
            meta: {
                url: route.url,
            },
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
                url: route.url,
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
                url: route.url,
                resourceCount: resourceErrors.length,
                resources: uniqueResources,
            },
        });
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
            meta: {
                url: route.url,
            },
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
    lines.push("");

    for (const route of result.checkedRoutes) {
        const icon = route.status === "ok" ? "✅" : route.status === "warning" ? "⚠️" : "❌";
        lines.push(`   ${icon} ${route.path}`);
        if (route.httpStatus) {
            lines.push(`      HTTP: ${route.httpStatus}`);
        }
        if (route.consoleErrors > 0) {
            lines.push(`      控制台 Error: ${route.consoleErrors}`);
        }
        if (route.resourceErrors > 0) {
            lines.push(`      资源失败: ${route.resourceErrors}`);
        }
        if (!route.hasContent) {
            lines.push(`      ⚠️  页面可能白屏`);
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
        },
        routes: result.checkedRoutes,
        issues: result.issues,
        screenshots: result.screenshots,
    };
}
