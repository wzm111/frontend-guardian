/**
 * v3.11.2: 小程序性能采集工具测试
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MiniProgramProjectInfo } from "../src/utils/miniprogram-detect.js";
import {
    checkPerformanceThresholds,
    collectBuildMetrics,
    collectSetDataMetrics,
    DEFAULT_MINIPROGRAM_PERFORMANCE_THRESHOLDS,
    formatPerformanceMetrics,
    mergeSetDataMetrics,
    parsePerformanceOutput,
} from "../src/utils/miniprogram-performance.js";

describe("miniprogram-performance", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-mp-perf-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    function createProjectInfo(
        pages: string[],
        subPackages?: { root: string; pages: string[] }[]
    ): MiniProgramProjectInfo {
        return {
            platform: "wechat",
            projectDir: tempDir,
            appJsonPath: join(tempDir, "app.json"),
            pagesJsonPath: undefined,
            projectConfigPath: join(tempDir, "project.config.json"),
            pages,
            subPackages,
        };
    }

    it("collectBuildMetrics 计算主包与页面体积", () => {
        writeFileSync(join(tempDir, "app.js"), "App({})");
        writeFileSync(join(tempDir, "app.json"), '{"pages":["pages/index/index"]}');
        mkdirSync(join(tempDir, "pages/index"), { recursive: true });
        writeFileSync(join(tempDir, "pages/index/index.js"), "Page({})");
        writeFileSync(join(tempDir, "pages/index/index.wxml"), "<view>hello</view>");

        const info = createProjectInfo(["pages/index/index"]);
        const data = collectBuildMetrics({ projectDir: tempDir, projectInfo: info, compileDurationMs: 1234 });

        expect(data.platform).toBe("wechat");
        expect(data.compileDurationMs).toBe(1234);
        expect(data.mainPackageSizeBytes).toBeGreaterThan(0);
        expect(data.pages).toHaveLength(1);
        expect(data.pages[0].path).toBe("pages/index/index");
        expect(data.pages[0].sizeBytes).toBeGreaterThan(0);
    });

    it("collectBuildMetrics 计算分包体积", () => {
        mkdirSync(join(tempDir, "packageA"), { recursive: true });
        writeFileSync(join(tempDir, "packageA/page.js"), "Page({})");
        writeFileSync(join(tempDir, "app.json"), '{"pages":["pages/index/index"]}');
        mkdirSync(join(tempDir, "pages/index"), { recursive: true });
        writeFileSync(join(tempDir, "pages/index/index.js"), "Page({})");

        const info = createProjectInfo(["pages/index/index"], [{ root: "packageA", pages: ["packageA/page"] }]);
        const data = collectBuildMetrics({ projectDir: tempDir, projectInfo: info, compileDurationMs: 0 });

        expect(data.subPackages).toHaveLength(1);
        expect(data.subPackages[0].root).toBe("packageA");
        expect(data.subPackages[0].sizeBytes).toBeGreaterThan(0);
    });

    it("collectSetDataMetrics 统计 setData 调用", () => {
        mkdirSync(join(tempDir, "pages/index"), { recursive: true });
        writeFileSync(
            join(tempDir, "pages/index/index.js"),
            `Page({
                onLoad() {
                    this.setData({ a: 1, b: 2 });
                    this.setData({ c: 3 });
                },
                onReady() {
                    this.setData({ large: 'x'.repeat(5000) });
                }
            })`
        );

        const info = createProjectInfo(["pages/index/index"]);
        const metrics = collectSetDataMetrics(info);

        expect(metrics).toHaveLength(1);
        expect(metrics[0].page).toBe("pages/index/index");
        expect(metrics[0].callCount).toBe(3);
        expect(metrics[0].maxPayloadBytes).toBeGreaterThan(metrics[0].avgPayloadBytes);
    });

    it("checkPerformanceThresholds 对超标项生成 issue", () => {
        const data = collectBuildMetrics({
            projectDir: tempDir,
            projectInfo: createProjectInfo(["pages/index/index"]),
            compileDurationMs: 0,
        });
        data.mainPackageSizeBytes = 10 * 1024 * 1024; // 10 MB

        const issues = checkPerformanceThresholds(data, DEFAULT_MINIPROGRAM_PERFORMANCE_THRESHOLDS, {
            projectDir: tempDir,
        });

        expect(issues.some((i) => i.ruleId === "miniprogram-perf-main-package-size")).toBe(true);
    });

    it("checkPerformanceThresholds 支持自定义阈值", () => {
        const data = collectBuildMetrics({
            projectDir: tempDir,
            projectInfo: createProjectInfo(["pages/index/index"]),
            compileDurationMs: 0,
        });
        data.startupTimeMs = 1500;

        const issuesDefault = checkPerformanceThresholds(data, DEFAULT_MINIPROGRAM_PERFORMANCE_THRESHOLDS, {
            projectDir: tempDir,
        });
        expect(issuesDefault.some((i) => i.ruleId === "miniprogram-perf-startup-time")).toBe(false);

        const issuesCustom = checkPerformanceThresholds(data, { startup: 1000 }, { projectDir: tempDir });
        expect(issuesCustom.some((i) => i.ruleId === "miniprogram-perf-startup-time")).toBe(true);
    });

    it("parsePerformanceOutput 解析 JSON 输出", () => {
        const result = parsePerformanceOutput('{"startupTimeMs": 1200, "fps": 55}');
        expect(result.startupTimeMs).toBe(1200);
        expect(result.fps).toBe(55);
    });

    it("parsePerformanceOutput 解析文本输出", () => {
        const result = parsePerformanceOutput("startup: 2300ms\nfps: 28");
        expect(result.startupTimeMs).toBe(2300);
        expect(result.fps).toBe(28);
    });

    it("mergeSetDataMetrics 合并到性能数据", () => {
        const data = collectBuildMetrics({
            projectDir: tempDir,
            projectInfo: createProjectInfo(["pages/index/index"]),
            compileDurationMs: 0,
        });
        const merged = mergeSetDataMetrics(data, [
            {
                page: "pages/index/index",
                callCount: 5,
                totalPayloadBytes: 1000,
                avgPayloadBytes: 200,
                maxPayloadBytes: 300,
            },
        ]);

        expect(merged.setDataMetrics).toHaveLength(1);
        expect(merged.setDataMetrics[0].callCount).toBe(5);
    });

    it("formatPerformanceMetrics 返回终端行", () => {
        const data = collectBuildMetrics({
            projectDir: tempDir,
            projectInfo: createProjectInfo(["pages/index/index"]),
            compileDurationMs: 100,
        });
        const lines = formatPerformanceMetrics(data);

        expect(lines.length).toBeGreaterThan(0);
        expect(lines.some((l) => l.includes("编译耗时"))).toBe(true);
        expect(lines.some((l) => l.includes("主包体积"))).toBe(true);
    });
});
