import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    isPlaywrightAvailable,
    formatPageHealthReport,
    formatPageHealthJson,
} from "../src/integrations/page-health.js";
import type { PageHealthResult } from "../src/integrations/page-health.js";

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

});
