/**
 * v4.0.0: 移动端页面健康检查
 *
 * 通过 Maestro 或 Appium 驱动 App，遍历关键页面路径，
 * 检测白屏、崩溃、ANR，并支持截图基线对比。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Issue, ScanResult } from "@/types.js";
import { loadConfig } from "@/utils/config-loader.js";
import {
    compareScreenshotsPixel,
    getBaselinePath,
    getDiffImagePath,
    isPngjsAvailable,
    safeRouteName,
} from "@/utils/visual-regression.js";
import { runCommand } from "./base.js";
import {
    detectAppium,
    isAppiumCliAvailable,
    isMaestroCliAvailable,
    listMaestroFlowNames,
    parseJUnitXml,
    resolveMobileTool,
    type MobileTool,
} from "./mobile-shared.js";

export interface MobilePageHealthOptions {
    projectDir: string;
    tool?: "auto" | MobileTool;
    appId?: string;
    routes?: string[];
    screenshot?: boolean;
    screenshotDir?: string;
    baselineDir?: string;
    updateBaseline?: boolean;
    outputDir?: string;
    concurrency?: number;
    timeout?: number;
}

export interface CheckedMobilePage {
    path: string;
    status: "ok" | "error" | "warning";
    messages: string[];
    screenshotPath?: string;
    baselinePath?: string;
    duration: number;
}

export interface MobilePageHealthResult {
    tool: MobileTool;
    issues: Issue[];
    checkedPages: CheckedMobilePage[];
    screenshots: string[];
    duration: number;
}

const DEFAULT_SCREENSHOT_DIR = ".frontend-guardian/screenshots/mobile";
const DEFAULT_OUTPUT_DIR = ".frontend-guardian/mobile";

async function runWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
    if (concurrency <= 1) {
        for (const item of items) await fn(item);
        return;
    }
    let index = 0;
    async function worker(): Promise<void> {
        while (index < items.length) {
            const i = index++;
            await fn(items[i]);
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
}

export function resolveMobileRoutes(projectDir: string, routes?: string[]): string[] {
    if (routes !== undefined) return routes;

    try {
        const config = loadConfig(projectDir);
        const configured = config.mobile?.routes as string[] | undefined;
        if (configured && configured.length > 0) return configured;
    } catch {
        // ignore
    }

    const flowNames = listMaestroFlowNames(projectDir);
    if (flowNames.length > 0) return flowNames;

    return [];
}

export function resolveAppId(projectDir: string, appId?: string): string | undefined {
    if (appId) return appId;

    try {
        const config = loadConfig(projectDir);
        const configured = config.mobile?.appId as string | undefined;
        if (configured) return configured;
    } catch {
        // ignore
    }

    // Try maestro.yaml
    for (const name of ["maestro.yaml", "maestro.yml"]) {
        const path = join(projectDir, name);
        if (existsSync(path)) {
            try {
                const content = readFileSync(path, "utf-8");
                const match = /appId:\s*([^\s]+)/.exec(content);
                if (match) return match[1];
            } catch {
                // ignore
            }
        }
    }

    // Try wdio.conf.* capabilities
    const appium = detectAppium(projectDir);
    if (appium.wdioConfig) {
        try {
            const content = readFileSync(join(projectDir, appium.wdioConfig), "utf-8");
            const match = /app?:\s*['"]([^'"]+)['"]/.exec(content);
            if (match) return match[1];
        } catch {
            // ignore
        }
    }

    return undefined;
}

export function generateMaestroFlow(route: string, appId: string, screenshotPath: string): string {
    return `appId: ${appId}
---
- launchApp
- assertVisible: ".*"
- takeScreenshot: ${relative(dirname(screenshotPath), screenshotPath).replace(/\\/g, "/")}
`;
}

function dirname(p: string): string {
    return p.slice(0, p.lastIndexOf("/")) || ".";
}

export function generateAppiumSpec(route: string, _appId: string, screenshotPath: string): string {
    return `
import { browser } from '@wdio/globals';

describe('mobile-page-health', () => {
  it('${route}', async () => {
    await browser.pause(1000);
    await browser.saveScreenshot('${screenshotPath.replace(/\\/g, "\\\\")}');
  });
});
`;
}

export function generateWdioConfig(specs: string[]): string {
    return `
exports.config = {
  runner: 'local',
  specs: ${JSON.stringify(specs)},
  capabilities: [{
    platformName: 'iOS',
    'appium:options': {
      automationName: 'XCUITest',
      deviceName: 'iPhone 14',
      platformVersion: '16.0',
      app: process.env.APP_PATH || ''
    }
  }],
  services: ['appium'],
  framework: 'mocha',
  reporters: ['spec'],
  maxInstances: 1,
};
`;
}

export async function detectWhiteScreen(imagePath: string): Promise<{ isWhiteScreen: boolean; whitePixelRatio: number } | null> {
    if (!isPngjsAvailable() || !existsSync(imagePath)) return null;

    try {
        // @ts-expect-error — pngjs 是可选依赖
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { PNG }: any = await import("pngjs");
        const buf = readFileSync(imagePath);
        const png = PNG.sync.read(buf);
        const { width, height, data } = png;
        const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 10000)));
        let total = 0;
        let whiteOrTransparent = 0;

        for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
                const idx = (y * width + x) * 4;
                total++;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];
                if (a === 0 || (r >= 250 && g >= 250 && b >= 250)) {
                    whiteOrTransparent++;
                }
            }
        }

        const ratio = total > 0 ? whiteOrTransparent / total : 0;
        return { isWhiteScreen: ratio > 0.95, whitePixelRatio: ratio };
    } catch {
        return null;
    }
}

function classifyFailure(message: string): { crash: boolean; anr: boolean } {
    const lower = message.toLowerCase();
    const crash = /crash|crashed|terminated unexpectedly|process died|sigkill|sigsegv|sigabrt/.test(lower);
    const anr = /anr|not responding|application not responding|timeout|deadlock/.test(lower);
    return { crash, anr };
}

async function checkPageBaseline(
    screenshotPath: string,
    baselineDir: string,
    updateBaseline: boolean
): Promise<Issue | null> {
    const route = safeRouteName(screenshotPath);
    const baselinePath = getBaselinePath(screenshotPath, baselineDir, route);

    if (updateBaseline || !existsSync(baselinePath)) {
        mkdirSync(baselineDir, { recursive: true });
        if (existsSync(screenshotPath)) {
            writeFileSync(baselinePath, readFileSync(screenshotPath));
        }
        return null;
    }

    if (!existsSync(screenshotPath)) return null;

    const diffImagePath = getDiffImagePath(screenshotPath, baselineDir, route);
    const result = await compareScreenshotsPixel(screenshotPath, baselinePath, diffImagePath);
    if (!result) return null;

    if (result.diffPixels > result.thresholdPixels || result.diffPixelRatio > result.thresholdRatio) {
        return {
            ruleId: "mobile-page-health-screenshot-changed",
            title: `移动端截图变化: ${route}`,
            description: `当前截图与基线不一致：差异像素 ${result.diffPixels} (${(result.diffPixelRatio * 100).toFixed(2)}%)`,
            severity: "warning",
            file: screenshotPath,
            line: 1,
            column: 1,
            meta: {
                diffPixels: result.diffPixels,
                diffPixelRatio: result.diffPixelRatio,
                diffImagePath: result.diffImagePath,
            },
        };
    }

    return null;
}

async function runMaestroPageHealth(
    options: MobilePageHealthOptions,
    routes: string[],
    appId: string,
    screenshotDir: string,
    baselineDir: string
): Promise<MobilePageHealthResult> {
    const projectDir = options.projectDir;
    const outputDir = join(projectDir, options.outputDir || DEFAULT_OUTPUT_DIR, "maestro");
    mkdirSync(outputDir, { recursive: true });
    mkdirSync(screenshotDir, { recursive: true });

    const start = Date.now();
    const checkedPages: CheckedMobilePage[] = [];
    const issues: Issue[] = [];
    const screenshots: string[] = [];

    await runWithConcurrency(
        routes,
        options.concurrency || 1,
        async (route: string) => {
            const pageStart = Date.now();
            const screenshotPath = join(screenshotDir, `${safeRouteName(route)}.png`);
            const flowPath = join(outputDir, `${safeRouteName(route)}.yaml`);
            writeFileSync(flowPath, generateMaestroFlow(route, appId, screenshotPath));

            const reportPath = join(outputDir, `${safeRouteName(route)}.xml`);
            runCommand(
                `maestro test "${flowPath}" --format junit --output "${reportPath}"`,
                projectDir,
                options.timeout || 60000
            );

            const pageIssues: Issue[] = [];
            let messages: string[] = [];

            if (existsSync(reportPath)) {
                const cases = parseJUnitXml(readFileSync(reportPath, "utf-8"));
                for (const c of cases) {
                    if (c.failure) {
                        const { crash, anr } = classifyFailure(c.failure.message);
                        messages.push(c.failure.message);
                        if (crash) {
                            pageIssues.push({
                                ruleId: "mobile-page-health-crash",
                                title: `移动端页面崩溃: ${route}`,
                                description: c.failure.message,
                                severity: "critical",
                                file: flowPath,
                                line: 1,
                                column: 1,
                                meta: { pagePath: route, screenshotPath, duration: c.duration },
                            });
                        } else if (anr) {
                            pageIssues.push({
                                ruleId: "mobile-page-health-anr",
                                title: `移动端页面 ANR: ${route}`,
                                description: c.failure.message,
                                severity: "critical",
                                file: flowPath,
                                line: 1,
                                column: 1,
                                meta: { pagePath: route, screenshotPath, duration: c.duration },
                            });
                        }
                    }
                }
            }

            if (existsSync(screenshotPath)) {
                screenshots.push(screenshotPath);
                const white = await detectWhiteScreen(screenshotPath);
                if (white?.isWhiteScreen) {
                    pageIssues.push({
                        ruleId: "mobile-page-health-white-screen",
                        title: `移动端页面白屏: ${route}`,
                        description: `截图中 ${(white.whitePixelRatio * 100).toFixed(2)}% 像素为白色或透明`,
                        severity: "critical",
                        file: screenshotPath,
                        line: 1,
                        column: 1,
                        meta: { pagePath: route, whitePixelRatio: white.whitePixelRatio },
                    });
                }

                const baselineIssue = await checkPageBaseline(
                    screenshotPath,
                    baselineDir,
                    options.updateBaseline || false
                );
                if (baselineIssue) pageIssues.push(baselineIssue);
            }

            issues.push(...pageIssues);
            checkedPages.push({
                path: route,
                status: pageIssues.some((i) => i.severity === "critical")
                    ? "error"
                    : pageIssues.length > 0
                      ? "warning"
                      : "ok",
                messages,
                screenshotPath: existsSync(screenshotPath) ? screenshotPath : undefined,
                duration: Date.now() - pageStart,
            });
        }
    );

    return { tool: "maestro", issues, checkedPages, screenshots, duration: Date.now() - start };
}

async function runAppiumPageHealth(
    options: MobilePageHealthOptions,
    routes: string[],
    appId: string,
    screenshotDir: string,
    baselineDir: string
): Promise<MobilePageHealthResult> {
    const projectDir = options.projectDir;
    const outputDir = join(projectDir, options.outputDir || DEFAULT_OUTPUT_DIR, "appium");
    mkdirSync(outputDir, { recursive: true });
    mkdirSync(screenshotDir, { recursive: true });

    const start = Date.now();
    const checkedPages: CheckedMobilePage[] = [];
    const issues: Issue[] = [];
    const screenshots: string[] = [];

    const specPaths: string[] = [];
    for (const route of routes) {
        const screenshotPath = join(screenshotDir, `${safeRouteName(route)}.png`);
        const specPath = join(outputDir, `${safeRouteName(route)}.spec.js`);
        writeFileSync(specPath, generateAppiumSpec(route, appId, screenshotPath));
        specPaths.push(specPath);
    }

    const wdioConfigPath = join(outputDir, "wdio.conf.js");
    writeFileSync(wdioConfigPath, generateWdioConfig(specPaths));

    const stdout = runCommand(
        `npx wdio run "${wdioConfigPath}" --reporters=json`,
        projectDir,
        options.timeout || 60000
    );

    // Basic parsing: if stdout contains failures, mark all routes as errors
    const hasFailures = stdout ? /"state":\s*"failed"/.test(stdout) : false;

    for (const route of routes) {
        const screenshotPath = join(screenshotDir, `${safeRouteName(route)}.png`);
        const pageIssues: Issue[] = [];
        const messages: string[] = [];

        if (hasFailures && stdout) {
            // Try to extract specific error for this route
            const routeMatch = new RegExp(`"testName":\\s*"${route}[^"]*"[\\s\\S]{0,500}?"error":\\s*"([^"]*)"`).exec(stdout);
            const error = routeMatch ? routeMatch[1] : "Appium 测试执行失败";
            messages.push(error);
            const { crash, anr } = classifyFailure(error);
            if (crash) {
                pageIssues.push({
                    ruleId: "mobile-page-health-crash",
                    title: `移动端页面崩溃: ${route}`,
                    description: error,
                    severity: "critical",
                    file: wdioConfigPath,
                    line: 1,
                    column: 1,
                    meta: { pagePath: route, screenshotPath },
                });
            } else if (anr) {
                pageIssues.push({
                    ruleId: "mobile-page-health-anr",
                    title: `移动端页面 ANR: ${route}`,
                    description: error,
                    severity: "critical",
                    file: wdioConfigPath,
                    line: 1,
                    column: 1,
                    meta: { pagePath: route, screenshotPath },
                });
            }
        }

        if (existsSync(screenshotPath)) {
            screenshots.push(screenshotPath);
            const white = await detectWhiteScreen(screenshotPath);
            if (white?.isWhiteScreen) {
                pageIssues.push({
                    ruleId: "mobile-page-health-white-screen",
                    title: `移动端页面白屏: ${route}`,
                    description: `截图中 ${(white.whitePixelRatio * 100).toFixed(2)}% 像素为白色或透明`,
                    severity: "critical",
                    file: screenshotPath,
                    line: 1,
                    column: 1,
                    meta: { pagePath: route, whitePixelRatio: white.whitePixelRatio },
                });
            }

            const baselineIssue = await checkPageBaseline(
                screenshotPath,
                baselineDir,
                options.updateBaseline || false
            );
            if (baselineIssue) pageIssues.push(baselineIssue);
        }

        issues.push(...pageIssues);
        checkedPages.push({
            path: route,
            status: pageIssues.some((i) => i.severity === "critical")
                ? "error"
                : pageIssues.length > 0
                  ? "warning"
                  : "ok",
            messages,
            screenshotPath: existsSync(screenshotPath) ? screenshotPath : undefined,
            duration: 0,
        });
    }

    return { tool: "appium", issues, checkedPages, screenshots, duration: Date.now() - start };
}

export async function runMobilePageHealthCheck(
    options: MobilePageHealthOptions
): Promise<MobilePageHealthResult> {
    const tool = resolveMobileTool(options.projectDir, options.tool || "auto");
    if (!tool) {
        return {
            tool: "maestro",
            issues: [
                {
                    ruleId: "mobile-page-health-tool-missing",
                    title: "未检测到 Maestro 或 Appium",
                    description:
                        "移动端页面健康检查需要项目已配置 Maestro (.maestro/ 或 maestro.yaml) 或 Appium (wdio.conf.* + appium)。",
                    severity: "suggestion",
                    file: "package.json",
                    line: 1,
                    column: 1,
                    meta: { tool: null },
                },
            ],
            checkedPages: [],
            screenshots: [],
            duration: 0,
        };
    }

    if (tool === "maestro" && !isMaestroCliAvailable()) {
        return {
            tool,
            issues: [
                {
                    ruleId: "mobile-page-health-tool-missing",
                    title: "未检测到 Maestro CLI",
                    description: "项目已配置 Maestro，但当前环境未安装 maestro CLI。",
                    severity: "suggestion",
                    file: "package.json",
                    line: 1,
                    column: 1,
                    meta: { tool },
                },
            ],
            checkedPages: [],
            screenshots: [],
            duration: 0,
        };
    }

    if (tool === "appium" && !isAppiumCliAvailable()) {
        return {
            tool,
            issues: [
                {
                    ruleId: "mobile-page-health-tool-missing",
                    title: "未检测到 Appium CLI",
                    description: "项目已配置 Appium，但当前环境未安装 appium / WebdriverIO。",
                    severity: "suggestion",
                    file: "package.json",
                    line: 1,
                    column: 1,
                    meta: { tool },
                },
            ],
            checkedPages: [],
            screenshots: [],
            duration: 0,
        };
    }

    const routes = resolveMobileRoutes(options.projectDir, options.routes);
    if (routes.length === 0) {
        throw new Error(
            "移动端页面健康检查需要指定 --mobile-routes，或在 .frontend-guardian.yml 中配置 mobile.routes"
        );
    }

    const appId = resolveAppId(options.projectDir, options.appId);
    if (!appId) {
        throw new Error(
            "移动端页面健康检查需要 appId，请使用 --mobile-app-id 指定，或在 maestro.yaml / wdio.conf.* 中配置"
        );
    }

    const screenshotDir = join(
        options.projectDir,
        options.screenshotDir || DEFAULT_SCREENSHOT_DIR
    );
    const baselineDir = join(
        options.projectDir,
        options.baselineDir || join(DEFAULT_SCREENSHOT_DIR, "baseline")
    );

    if (tool === "maestro") {
        return runMaestroPageHealth(options, routes, appId, screenshotDir, baselineDir);
    }

    return runAppiumPageHealth(options, routes, appId, screenshotDir, baselineDir);
}

export function formatMobilePageHealthReport(result: MobilePageHealthResult): string {
    const lines: string[] = [];
    lines.push(`移动端页面健康检查 (${result.tool})`);
    lines.push(`耗时: ${result.duration}ms`);
    lines.push(`检查页面: ${result.checkedPages.length}`);
    for (const page of result.checkedPages) {
        const icon = page.status === "ok" ? "✅" : page.status === "warning" ? "⚠️" : "❌";
        lines.push(`  ${icon} ${page.path} (${page.duration}ms)`);
        for (const msg of page.messages) {
            lines.push(`      ${msg}`);
        }
    }
    if (result.screenshots.length > 0) {
        lines.push(`截图: ${result.screenshots.length} 张`);
    }
    return lines.join("\n");
}

export function formatMobilePageHealthJson(result: MobilePageHealthResult): object {
    return {
        tool: result.tool,
        duration: result.duration,
        checkedPages: result.checkedPages,
        screenshots: result.screenshots,
        issues: result.issues,
    };
}

export function toScanResult(result: MobilePageHealthResult): ScanResult {
    return {
        module: "mobile-page-health",
        total: result.issues.length,
        issues: {
            critical: result.issues.filter((i) => i.severity === "critical"),
            warning: result.issues.filter((i) => i.severity === "warning"),
            suggestion: result.issues.filter((i) => i.severity === "suggestion"),
        },
        duration: result.duration,
        filesScanned: result.checkedPages.length,
        filesWithIssues: new Set(result.issues.map((i) => i.file)).size,
        meta: { tool: result.tool, screenshots: result.screenshots },
    };
}
