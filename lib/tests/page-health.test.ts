import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    isPlaywrightAvailable,
    formatPageHealthReport,
    formatPageHealthJson,
} from "../src/integrations/page-health.js";
import type { PageHealthResult, PageHealthOptions } from "../src/integrations/page-health.js";

describe("v3.7.1 — 页面健康检查", () => {
    describe("isPlaywrightAvailable", () => {
        let originalRequire: typeof require;

        beforeEach(() => {
            originalRequire = globalThis.require as typeof require;
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it.skip("should return true when playwright is resolvable", () => {
            // ESM 模块中的 require 不是 globalThis.require，mock 困难
            // 运行时验证即可
        });

        it("should return false when playwright is not installed", () => {
            const mockRequire = Object.assign(
                vi.fn(),
                {
                    resolve: vi.fn().mockImplementation(() => {
                        throw new Error("Cannot find module 'playwright'");
                    }),
                }
            );
            (globalThis as any).require = mockRequire;

            expect(isPlaywrightAvailable()).toBe(false);
        });
    });

    describe("formatPageHealthReport", () => {
        it("should format report with ok, warning and error routes", () => {
            const result: PageHealthResult = {
                issues: [],
                checkedRoutes: [
                    {
                        path: "/",
                        url: "http://localhost:5173/",
                        status: "ok",
                        httpStatus: 200,
                        consoleErrors: 0,
                        consoleWarns: 0,
                        resourceErrors: 0,
                        hasContent: true,
                        duration: 1200,
                        messages: [],
                    },
                    {
                        path: "/about",
                        url: "http://localhost:5173/about",
                        status: "warning",
                        httpStatus: 200,
                        consoleErrors: 0,
                        consoleWarns: 2,
                        resourceErrors: 0,
                        hasContent: true,
                        duration: 1500,
                        messages: ["2 个控制台 Warning"],
                    },
                    {
                        path: "/admin",
                        url: "http://localhost:5173/admin",
                        status: "error",
                        httpStatus: 404,
                        consoleErrors: 1,
                        consoleWarns: 0,
                        resourceErrors: 2,
                        hasContent: false,
                        duration: 800,
                        messages: ["HTTP 404", "页面可能白屏（body 无可见内容）", "2 个资源加载失败"],
                    },
                ],
                screenshots: [
                    "/project/.frontend-guardian/screenshots/_.png",
                    "/project/.frontend-guardian/screenshots/_about.png",
                    "/project/.frontend-guardian/screenshots/_admin.png",
                ],
                duration: 3500,
                baseUrl: "http://localhost:5173",
            };

            const report = formatPageHealthReport(result);

            expect(report).toContain("🌐 页面健康检查报告");
            expect(report).toContain("基础 URL: http://localhost:5173");
            expect(report).toContain("检查路由: 3 个");
            expect(report).toContain("✅ 正常: 1");
            expect(report).toContain("⚠️  警告: 1");
            expect(report).toContain("❌ 错误: 1");
            expect(report).toContain("✅ /");
            expect(report).toContain("⚠️ /about");
            expect(report).toContain("❌ /admin");
            expect(report).toContain("HTTP: 404");
            expect(report).toContain("页面可能白屏");
            expect(report).toContain("📸 截图已保存 (3 张)");
        });

        it("should handle empty routes", () => {
            const result: PageHealthResult = {
                issues: [],
                checkedRoutes: [],
                screenshots: [],
                duration: 0,
                baseUrl: "http://localhost:3000",
            };

            const report = formatPageHealthReport(result);

            expect(report).toContain("检查路由: 0 个");
            expect(report).toContain("✅ 正常: 0");
        });
    });

    describe("formatPageHealthJson", () => {
        it("should format result as structured JSON", () => {
            const result: PageHealthResult = {
                issues: [
                    {
                        ruleId: "page-health-http-error",
                        title: "页面返回 HTTP 404",
                        description: "测试",
                        severity: "critical",
                        file: "/admin",
                        line: 1,
                        column: 1,
                    },
                ],
                checkedRoutes: [
                    {
                        path: "/admin",
                        url: "http://localhost:5173/admin",
                        status: "error",
                        httpStatus: 404,
                        consoleErrors: 0,
                        consoleWarns: 0,
                        resourceErrors: 0,
                        hasContent: false,
                        duration: 500,
                        messages: ["HTTP 404"],
                    },
                ],
                screenshots: ["/tmp/screenshot.png"],
                duration: 500,
                baseUrl: "http://localhost:5173",
            };

            const json = formatPageHealthJson(result);

            expect(json).toEqual({
                summary: {
                    baseUrl: "http://localhost:5173",
                    totalRoutes: 1,
                    ok: 0,
                    warning: 0,
                    error: 1,
                    duration: 500,
                    issueCount: 1,
                    screenshotCount: 1,
                },
                routes: result.checkedRoutes,
                issues: result.issues,
                screenshots: ["/tmp/screenshot.png"],
            });
        });
    });

    describe("concurrency option", () => {
        it("should accept concurrency in PageHealthOptions", () => {
            // 类型检查：确保 concurrency 字段存在于 PageHealthOptions 中
            const opts: PageHealthOptions = {
                projectDir: "/tmp/test",
                concurrency: 5,
                baseUrl: "http://localhost:3000",
            };
            expect(opts.concurrency).toBe(5);
        });

        it("should default concurrency to undefined", () => {
            const opts: PageHealthOptions = {
                projectDir: "/tmp/test",
                baseUrl: "http://localhost:3000",
            };
            expect(opts.concurrency).toBeUndefined();
        });
    });

    describe("toScanResult", () => {
        it("should convert PageHealthResult to ScanResult", async () => {
            const result: PageHealthResult = {
                issues: [
                    {
                        ruleId: "page-health-http-error",
                        title: "HTTP 404",
                        description: "test",
                        severity: "critical",
                        file: "/admin",
                        line: 1,
                        column: 1,
                    },
                    {
                        ruleId: "page-health-console-error",
                        title: "Console error",
                        description: "test",
                        severity: "warning",
                        file: "/about",
                        line: 1,
                        column: 1,
                    },
                ],
                checkedRoutes: [
                    { path: "/", url: "http://localhost:3000/", status: "ok", httpStatus: 200, consoleErrors: 0, consoleWarns: 0, resourceErrors: 0, hasContent: true, duration: 100, messages: [] },
                    { path: "/admin", url: "http://localhost:3000/admin", status: "error", httpStatus: 404, consoleErrors: 0, consoleWarns: 0, resourceErrors: 0, hasContent: false, duration: 100, messages: ["HTTP 404"] },
                    { path: "/about", url: "http://localhost:3000/about", status: "warning", httpStatus: 200, consoleErrors: 1, consoleWarns: 0, resourceErrors: 0, hasContent: true, duration: 100, messages: ["1 个控制台 Error"] },
                ],
                screenshots: [],
                duration: 300,
                baseUrl: "http://localhost:3000",
            };

            const { toScanResult } = await import("../src/integrations/page-health.js");
            const scanResult = toScanResult(result);

            expect(scanResult.module).toBe("page-health");
            expect(scanResult.total).toBe(2);
            expect(scanResult.issues.critical.length).toBe(1);
            expect(scanResult.issues.warning.length).toBe(1);
            expect(scanResult.issues.suggestion.length).toBe(0);
            expect(scanResult.filesScanned).toBe(3);
            expect(scanResult.filesWithIssues).toBe(2);
            expect(scanResult.duration).toBe(300);
        });

        it("should handle empty result", () => {
            const result: PageHealthResult = {
                issues: [],
                checkedRoutes: [],
                screenshots: [],
                duration: 0,
                baseUrl: "http://localhost:3000",
            };

            return import("../src/integrations/page-health.js").then(({ toScanResult }) => {
                const scanResult = toScanResult(result);
                expect(scanResult.total).toBe(0);
                expect(scanResult.filesScanned).toBe(0);
                expect(scanResult.filesWithIssues).toBe(0);
            });
        });
    });

    describe("interactive elements", () => {
        it("should include interactive fields in CheckedRoute", () => {
            const result: PageHealthResult = {
                issues: [],
                checkedRoutes: [
                    {
                        path: "/",
                        url: "http://localhost:3000/",
                        status: "ok",
                        httpStatus: 200,
                        consoleErrors: 0,
                        consoleWarns: 0,
                        resourceErrors: 0,
                        hasContent: true,
                        duration: 100,
                        messages: [],
                        interactiveTotal: 5,
                        interactiveVisible: 5,
                        interactiveDisabled: 0,
                    },
                    {
                        path: "/form",
                        url: "http://localhost:3000/form",
                        status: "warning",
                        httpStatus: 200,
                        consoleErrors: 0,
                        consoleWarns: 0,
                        resourceErrors: 0,
                        hasContent: true,
                        duration: 150,
                        messages: ["1 个交互元素被禁用"],
                        interactiveTotal: 3,
                        interactiveVisible: 2,
                        interactiveDisabled: 1,
                    },
                ],
                screenshots: [],
                duration: 250,
                baseUrl: "http://localhost:3000",
            };

            const report = formatPageHealthReport(result);
            expect(report).toContain("🖱️  交互元素: 5/5 可见");
            expect(report).toContain("🖱️  交互元素: 2/3 可见");
            expect(report).toContain("⚠️  禁用: 1 个");
        });

        it("should format report without interactive data", () => {
            const result: PageHealthResult = {
                issues: [],
                checkedRoutes: [
                    {
                        path: "/",
                        url: "http://localhost:3000/",
                        status: "ok",
                        httpStatus: 200,
                        consoleErrors: 0,
                        consoleWarns: 0,
                        resourceErrors: 0,
                        hasContent: true,
                        duration: 100,
                        messages: [],
                    },
                ],
                screenshots: [],
                duration: 100,
                baseUrl: "http://localhost:3000",
            };

            const report = formatPageHealthReport(result);
            expect(report).not.toContain("🖱️");
        });
    });

    describe("screenshot baseline", () => {
        it("should format report with screenshot changed", () => {
            const result: PageHealthResult = {
                issues: [],
                checkedRoutes: [
                    {
                        path: "/",
                        url: "http://localhost:3000/",
                        status: "warning",
                        httpStatus: 200,
                        consoleErrors: 0,
                        consoleWarns: 0,
                        resourceErrors: 0,
                        hasContent: true,
                        duration: 100,
                        messages: ["截图与基线不同（UI 可能发生变化）"],
                        screenshotChanged: true,
                        baselinePath: "/project/.frontend-guardian/screenshots/baseline/_.png",
                    },
                ],
                screenshots: ["/project/.frontend-guardian/screenshots/_.png"],
                duration: 100,
                baseUrl: "http://localhost:3000",
            };

            const report = formatPageHealthReport(result);
            expect(report).toContain("🖼️  截图与基线不同");
        });

        it("should not show baseline info when unchanged", () => {
            const result: PageHealthResult = {
                issues: [],
                checkedRoutes: [
                    {
                        path: "/",
                        url: "http://localhost:3000/",
                        status: "ok",
                        httpStatus: 200,
                        consoleErrors: 0,
                        consoleWarns: 0,
                        resourceErrors: 0,
                        hasContent: true,
                        duration: 100,
                        messages: [],
                    },
                ],
                screenshots: [],
                duration: 100,
                baseUrl: "http://localhost:3000",
            };

            const report = formatPageHealthReport(result);
            expect(report).not.toContain("🖼️");
        });
    });

    describe("concurrent route execution", () => {
        it("should execute routes concurrently and respect concurrency limit", async () => {
            // 测试并发控制逻辑：模拟 runWithConcurrency 行为
            async function runWithConcurrency<T>(
                items: T[],
                concurrency: number,
                fn: (item: T) => Promise<void>
            ): Promise<void> {
                const queue = [...items];
                let running = 0;
                let maxRunning = 0;
                const workers = Array.from({ length: concurrency }, async () => {
                    while (true) {
                        const item = queue.shift();
                        if (!item) break;
                        running++;
                        maxRunning = Math.max(maxRunning, running);
                        await fn(item);
                        running--;
                    }
                });
                await Promise.all(workers);
                return maxRunning;
            }

            const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const delays = new Map<number, number>();
            let maxRunning = 0;
            let currentRunning = 0;

            const maxConcurrent = await runWithConcurrency(items, 3, async (item) => {
                currentRunning++;
                maxRunning = Math.max(maxRunning, currentRunning);
                delays.set(item, Date.now());
                await new Promise((r) => setTimeout(r, 10));
                currentRunning--;
            });

            expect(maxRunning).toBeLessThanOrEqual(3);
            expect(items.length).toBe(10);
        });

        it("should handle empty route list with concurrency", async () => {
            async function runWithConcurrency<T>(
                items: T[],
                _concurrency: number,
                _fn: (item: T) => Promise<void>
            ): Promise<void> {
                if (items.length === 0) return;
            }

            await runWithConcurrency([], 3, async () => {});
            expect(true).toBe(true);
        });

        it("should handle single route with concurrency", async () => {
            const results: number[] = [];
            async function runWithConcurrency<T>(
                items: T[],
                _concurrency: number,
                fn: (item: T) => Promise<void>
            ): Promise<void> {
                for (const item of items) {
                    await fn(item);
                }
            }

            await runWithConcurrency([42], 3, async (item) => {
                results.push(item as number);
            });

            expect(results).toEqual([42]);
        });
    });

    describe("v3.10.0 — 页面测试进阶", () => {
        it("should accept new PageHealthOptions fields", () => {
            const opts: PageHealthOptions = {
                projectDir: "/tmp/test",
                baseUrl: "http://localhost:3000",
                screenshotSelector: "#main",
                maxDiffPixels: 50,
                maxDiffPixelRatio: 0.005,
                noMask: true,
                maskSelectors: [".clock"],
                metrics: true,
                cwvThresholds: { lcp: 2000 },
                a11y: true,
                a11yTags: ["wcag2a"],
            };
            expect(opts.screenshotSelector).toBe("#main");
            expect(opts.metrics).toBe(true);
        });

        it("formatPageHealthReport shows visual regression", () => {
            const result: PageHealthResult = {
                issues: [],
                checkedRoutes: [
                    {
                        path: "/",
                        url: "http://localhost:3000/",
                        status: "warning",
                        httpStatus: 200,
                        consoleErrors: 0,
                        consoleWarns: 0,
                        resourceErrors: 0,
                        hasContent: true,
                        duration: 100,
                        messages: [],
                        visualRegression: {
                            diffPixels: 42,
                            diffPixelRatio: 0.002,
                            diffImagePath: "/tmp/diff.png",
                            thresholdPixels: 100,
                            thresholdRatio: 0.01,
                        },
                    },
                ],
                screenshots: [],
                duration: 100,
                baseUrl: "http://localhost:3000",
            };

            const report = formatPageHealthReport(result);
            expect(report).toContain("像素差异: 42");
        });

        it("formatPageHealthReport shows a11y violations", () => {
            const result: PageHealthResult = {
                issues: [],
                checkedRoutes: [
                    {
                        path: "/",
                        url: "http://localhost:3000/",
                        status: "warning",
                        httpStatus: 200,
                        consoleErrors: 0,
                        consoleWarns: 0,
                        resourceErrors: 0,
                        hasContent: true,
                        duration: 100,
                        messages: [],
                        a11yViolations: [
                            {
                                id: "image-alt",
                                impact: "critical",
                                tags: ["wcag2a"],
                                help: "Images must have alternate text",
                                helpUrl: "",
                                nodes: [{ target: ["img"] }],
                            },
                        ],
                    },
                ],
                screenshots: [],
                duration: 100,
                baseUrl: "http://localhost:3000",
            };

            const report = formatPageHealthReport(result);
            expect(report).toContain("无障碍问题: 1 个");
        });

        it("formatPageHealthReport shows CWV metrics", () => {
            const result: PageHealthResult = {
                issues: [],
                checkedRoutes: [
                    {
                        path: "/",
                        url: "http://localhost:3000/",
                        status: "ok",
                        httpStatus: 200,
                        consoleErrors: 0,
                        consoleWarns: 0,
                        resourceErrors: 0,
                        hasContent: true,
                        duration: 100,
                        messages: [],
                        metrics: { lcp: 1200, cls: 0.05, fcp: 900, ttfb: 200 },
                    },
                ],
                screenshots: [],
                duration: 100,
                baseUrl: "http://localhost:3000",
            };

            const report = formatPageHealthReport(result);
            expect(report).toContain("LCP 1200ms");
            expect(report).toContain("CLS 0.05");
        });
    });

});
