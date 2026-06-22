/**
 * v3.10.0: 视觉回归工具测试
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as visualRegression from "../src/utils/visual-regression.js";

vi.mock("pixelmatch", () => ({
    default: vi.fn(),
}));

vi.mock("pngjs", () => ({
    PNG: {
        sync: {
            read: vi.fn(),
            write: vi.fn((png: { data: Buffer }) => png.data),
        },
    },
}));

describe("visual-regression", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-vr-"));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("naming helpers", () => {
        it("safeRouteName 替换非法字符", () => {
            expect(visualRegression.safeRouteName("/user/profile")).toBe("_user_profile");
            expect(visualRegression.safeRouteName("/")).toBe("_");
        });

        it("selectorHash 返回固定长度", () => {
            expect(visualRegression.selectorHash("#main")).toHaveLength(6);
            expect(visualRegression.selectorHash("#main")).not.toBe(visualRegression.selectorHash("#app"));
        });

        it("getScreenshotKey 无选择器时只包含路由", () => {
            expect(visualRegression.getScreenshotKey("/home")).toBe("_home");
        });

        it("getScreenshotKey 包含选择器哈希", () => {
            const key = visualRegression.getScreenshotKey("/home", "#main");
            expect(key.startsWith("_home__sel")).toBe(true);
        });

        it("路径生成工具使用正确目录", () => {
            expect(visualRegression.getCurrentScreenshotPath("/tmp/shots", "/home")).toBe("/tmp/shots/_home.png");
            expect(visualRegression.getBaselinePath("/tmp/shots/baseline", "/home")).toBe("/tmp/shots/baseline/_home.png");
            expect(visualRegression.getDiffImagePath("/tmp/shots/diff", "/home")).toBe("/tmp/shots/diff/_home.png");
        });
    });

    describe("availability", () => {
        it("未安装时返回 false", () => {
            vi.stubGlobal("require", { resolve: vi.fn(() => { throw new Error("not found"); }) });
            expect(visualRegression.isPixelmatchAvailable()).toBe(false);
            expect(visualRegression.isPngjsAvailable()).toBe(false);
            vi.unstubAllGlobals();
        });
    });

    describe("compareScreenshotsPixel", () => {
        it("无基线时返回 null", async () => {
            const current = join(tempDir, "current.png");
            writeFileSync(current, Buffer.from("png"));
            const baseline = join(tempDir, "baseline.png");
            const diff = join(tempDir, "diff.png");

            const result = await visualRegression.compareScreenshotsPixel(current, baseline, diff);
            expect(result).toBeNull();
        });

        it.skip("尺寸不匹配时返回全差异", async () => {
            // 需要本地安装 pixelmatch + pngjs 后启用
            const { PNG } = await import("pngjs");
            (PNG.sync.read as ReturnType<typeof vi.fn>).mockImplementation((buf: Buffer) => {
                if (buf.toString().includes("current")) return { data: Buffer.alloc(100), width: 10, height: 10 };
                return { data: Buffer.alloc(400), width: 20, height: 20 };
            });

            const current = join(tempDir, "current.png");
            const baseline = join(tempDir, "baseline.png");
            const diff = join(tempDir, "diff.png");
            writeFileSync(current, Buffer.from("current"));
            writeFileSync(baseline, Buffer.from("baseline"));

            const result = await visualRegression.compareScreenshotsPixel(current, baseline, diff);
            expect(result).not.toBeNull();
            expect(result?.diffPixelRatio).toBe(1);
        });

        it.skip("差异低于阈值时仍返回结果", async () => {
            // 需要本地安装 pixelmatch + pngjs 后启用
            const { PNG } = await import("pngjs");
            (PNG.sync.read as ReturnType<typeof vi.fn>).mockReturnValue({ data: Buffer.alloc(100), width: 5, height: 5 });
            const { default: pixelmatch } = await import("pixelmatch");
            (pixelmatch as ReturnType<typeof vi.fn>).mockReturnValue(10);

            const current = join(tempDir, "current.png");
            const baseline = join(tempDir, "baseline.png");
            const diff = join(tempDir, "diff.png");
            writeFileSync(current, Buffer.from("current"));
            writeFileSync(baseline, Buffer.from("baseline"));

            const result = await visualRegression.compareScreenshotsPixel(current, baseline, diff, {
                maxDiffPixels: 100,
            });
            expect(result?.diffPixels).toBe(10);
            expect(result?.diffPixelRatio).toBe(10 / 25);
        });
    });

    describe("isVisualRegressionFailed", () => {
        it("超过像素阈值时返回 true", () => {
            expect(
                visualRegression.isVisualRegressionFailed(
                    {
                        diffPixels: 101,
                        diffPixelRatio: 0,
                        diffImagePath: "/diff.png",
                        thresholdPixels: 100,
                        thresholdRatio: 0.01,
                    },
                    { maxDiffPixels: 100 }
                )
            ).toBe(true);
        });

        it("超过比例阈值时返回 true", () => {
            expect(
                visualRegression.isVisualRegressionFailed(
                    {
                        diffPixels: 0,
                        diffPixelRatio: 0.02,
                        diffImagePath: "/diff.png",
                        thresholdPixels: 100,
                        thresholdRatio: 0.01,
                    },
                    { maxDiffPixelRatio: 0.01 }
                )
            ).toBe(true);
        });
    });
});
