/**
 * v3.12.0: 小程序多平台截图差异对比测试
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatMiniProgramJson, runMiniProgramTest } from "../src/integrations/miniprogram.js";

vi.mock("../src/utils/miniprogram-cli.js", () => ({
    isDevToolsAvailable: vi.fn(),
    runAutoCompile: vi.fn(),
    runScreenshot: vi.fn(),
    runPerformance: vi.fn(),
    parseCompileOutput: vi.fn(() => ({ errors: [], warnings: [] })),
}));

vi.mock("../src/utils/visual-regression.js", () => ({
    isPixelmatchAvailable: vi.fn(() => true),
    isPngjsAvailable: vi.fn(() => true),
    compareScreenshotsPixel: vi.fn(),
    isVisualRegressionFailed: vi.fn((result, options) =>
        result ? result.diffPixels > (options?.maxDiffPixels ?? 100) : false
    ),
    safeRouteName: vi.fn((route) => route.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)),
    getCurrentScreenshotPath: vi.fn((dir, route, _selector, profile) =>
        join(dir, profile || "", `${route.replace(/\//g, "_")}.png`)
    ),
    getBaselinePath: vi.fn((dir, route, _selector, profile) =>
        join(dir, profile || "", `${route.replace(/\//g, "_")}.png`)
    ),
    getDiffImagePath: vi.fn((dir, route, _selector, profile) =>
        join(dir, profile || "", `${route.replace(/\//g, "_")}_diff.png`)
    ),
}));

import { isDevToolsAvailable, runScreenshot } from "../src/utils/miniprogram-cli.js";
import { compareScreenshotsPixel } from "../src/utils/visual-regression.js";

describe("miniprogram cross-platform diff", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-mp-xdiff-"));
        vi.mocked(isDevToolsAvailable).mockReturnValue(true);
        vi.mocked(runScreenshot).mockImplementation((_config, _projectDir, outputPath) => {
            const parent = dirname(outputPath);
            if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
            writeFileSync(outputPath, Buffer.from("fake-png"));
            return "screenshot ok";
        });
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    function createMultiPlatformProject(pages: string[]) {
        writeFileSync(join(tempDir, "app.json"), JSON.stringify({ pages }));
        writeFileSync(join(tempDir, "project.config.json"), '{"appid":"test","tt":{"appid":"test"}}');
        writeFileSync(join(tempDir, "mini.project.json"), '{"appid":"test"}');
        for (const page of pages) {
            const dir = join(tempDir, ...page.split("/").slice(0, -1));
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            writeFileSync(join(tempDir, `${page}.js`), "Page({})");
        }
    }

    it("reference mode: 以参考平台为基准对比其他平台", async () => {
        createMultiPlatformProject(["pages/index/index"]);
        vi.mocked(compareScreenshotsPixel).mockResolvedValue({
            diffPixels: 50,
            diffPixelRatio: 0.005,
            diffImagePath: join(tempDir, "diff.png"),
            thresholdPixels: 100,
            thresholdRatio: 0.01,
        });

        const result = await runMiniProgramTest({
            projectDir: tempDir,
            platform: "all",
            screenshot: true,
            crossPlatformDiff: true,
            diffMode: "reference",
            diffReferencePlatform: "wechat",
        });

        expect(result.platform).toBe("multi");
        expect(result.crossPlatformDiffs).toHaveLength(2);
        const diffs = result.crossPlatformDiffs ?? [];
        expect(diffs.every((d) => d.platformA === "wechat")).toBe(true);
        expect(result.issues.some((i) => i.ruleId === "miniprogram-cross-platform-screenshot-diff")).toBe(false);
    });

    it("pairwise mode: 两两对比所有平台", async () => {
        createMultiPlatformProject(["pages/index/index"]);
        vi.mocked(compareScreenshotsPixel).mockResolvedValue({
            diffPixels: 50,
            diffPixelRatio: 0.005,
            diffImagePath: join(tempDir, "diff.png"),
            thresholdPixels: 100,
            thresholdRatio: 0.01,
        });

        const result = await runMiniProgramTest({
            projectDir: tempDir,
            platform: "all",
            screenshot: true,
            crossPlatformDiff: true,
            diffMode: "pairwise",
        });

        expect(result.crossPlatformDiffs).toHaveLength(3);
    });

    it("差异超阈值时生成 issue", async () => {
        createMultiPlatformProject(["pages/index/index"]);
        vi.mocked(compareScreenshotsPixel).mockResolvedValue({
            diffPixels: 200,
            diffPixelRatio: 0.02,
            diffImagePath: join(tempDir, "diff.png"),
            thresholdPixels: 100,
            thresholdRatio: 0.01,
        });

        const result = await runMiniProgramTest({
            projectDir: tempDir,
            platform: "all",
            screenshot: true,
            crossPlatformDiff: true,
        });

        const diffs = result.crossPlatformDiffs ?? [];
        const failed = diffs.filter((d) => d.issue);
        expect(failed.length).toBe(2);
        expect(failed[0].issue?.ruleId).toBe("miniprogram-cross-platform-screenshot-diff");
        expect(result.issues.filter((i) => i.ruleId === "miniprogram-cross-platform-screenshot-diff").length).toBe(2);
    });

    it("diffMaxPages 限制对比页面数", async () => {
        createMultiPlatformProject(["pages/a/a", "pages/b/b", "pages/c/c"]);
        vi.mocked(compareScreenshotsPixel).mockResolvedValue({
            diffPixels: 50,
            diffPixelRatio: 0.005,
            diffImagePath: join(tempDir, "diff.png"),
            thresholdPixels: 100,
            thresholdRatio: 0.01,
        });

        const result = await runMiniProgramTest({
            projectDir: tempDir,
            platform: "all",
            screenshot: true,
            crossPlatformDiff: true,
            diffMaxPages: 2,
        });

        const diffs = result.crossPlatformDiffs ?? [];
        const pagePaths = [...new Set(diffs.map((d) => d.pagePath))];
        expect(pagePaths.length).toBe(2);
    });

    it("diffPages 覆盖自动检测页面", async () => {
        createMultiPlatformProject(["pages/a/a", "pages/b/b"]);
        vi.mocked(compareScreenshotsPixel).mockResolvedValue({
            diffPixels: 50,
            diffPixelRatio: 0.005,
            diffImagePath: join(tempDir, "diff.png"),
            thresholdPixels: 100,
            thresholdRatio: 0.01,
        });

        const result = await runMiniProgramTest({
            projectDir: tempDir,
            platform: "all",
            screenshot: true,
            crossPlatformDiff: true,
            diffPages: ["pages/b/b"],
        });

        const diffs = result.crossPlatformDiffs ?? [];
        const pagePaths = [...new Set(diffs.map((d) => d.pagePath))];
        expect(pagePaths).toEqual(["pages/b/b"]);
    });

    it("单平台模式下不执行跨平台对比", async () => {
        createMultiPlatformProject(["pages/index/index"]);

        const result = await runMiniProgramTest({
            projectDir: tempDir,
            platform: "wechat",
            screenshot: true,
            crossPlatformDiff: true,
        });

        expect(result.crossPlatformDiffs).toBeUndefined();
    });

    it("formatMiniProgramJson 包含 crossPlatformDiffs", async () => {
        createMultiPlatformProject(["pages/index/index"]);
        vi.mocked(compareScreenshotsPixel).mockResolvedValue({
            diffPixels: 50,
            diffPixelRatio: 0.005,
            diffImagePath: join(tempDir, "diff.png"),
            thresholdPixels: 100,
            thresholdRatio: 0.01,
        });

        const result = await runMiniProgramTest({
            projectDir: tempDir,
            platform: "all",
            screenshot: true,
            crossPlatformDiff: true,
        });
        const json = formatMiniProgramJson(result) as Record<string, unknown>;

        expect(json.crossPlatformDiffs).toBeDefined();
        expect((json.summary as Record<string, unknown>).crossPlatformDiffCount).toBe(2);
        expect((json.summary as Record<string, unknown>).crossPlatformDiffFailedCount).toBe(0);
    });
});
