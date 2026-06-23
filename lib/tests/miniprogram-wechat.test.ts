/**
 * v3.11.0: 微信小程序自动化测试集成测试
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    formatMiniProgramJson,
    formatMiniProgramReport,
    runMiniProgramTest,
    toScanResult,
} from "../src/integrations/miniprogram-wechat.js";

vi.mock("../src/utils/miniprogram-wechat-cli.js", () => ({
    isWechatDevToolsAvailable: vi.fn(),
    wechatAutoCompile: vi.fn(),
    wechatScreenshot: vi.fn(),
    parseWechatCompileOutput: vi.fn((output: string) => {
        const errors = output.split("\n").filter((l) => l.startsWith("error:"));
        const warnings = output.split("\n").filter((l) => l.startsWith("warn:"));
        return { errors, warnings };
    }),
}));

import {
    isWechatDevToolsAvailable,
    wechatAutoCompile,
    wechatScreenshot,
} from "../src/utils/miniprogram-wechat-cli.js";

describe("miniprogram-wechat integration", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-mp-int-"));
        vi.mocked(isWechatDevToolsAvailable).mockReturnValue(false);
        vi.mocked(wechatAutoCompile).mockReturnValue(null);
        vi.mocked(wechatScreenshot).mockReturnValue(null);
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    function createWechatProject(pages: string[], subPackages?: Array<{ root: string; pages: string[] }>) {
        writeFileSync(
            join(tempDir, "app.json"),
            JSON.stringify({ pages, subPackages: subPackages || [] })
        );
        writeFileSync(join(tempDir, "project.config.json"), '{"appid":"test"}');

        for (const page of pages) {
            const file = join(tempDir, `${page}.js`);
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, "Page({})");
        }
        if (subPackages) {
            for (const pkg of subPackages) {
                for (const page of pkg.pages) {
                    const file = join(tempDir, pkg.root, `${page}.js`);
                    mkdirSync(dirname(file), { recursive: true });
                    writeFileSync(file, "Page({})");
                }
            }
        }
    }

    it("自动检测微信项目并检查页面存在性", async () => {
        createWechatProject(["pages/index/index", "pages/logs/logs"]);

        const result = await runMiniProgramTest({ projectDir: tempDir });

        expect(result.platform).toBe("wechat");
        expect(result.checkedPages).toHaveLength(2);
        expect(result.checkedPages.every((p) => p.status === "ok")).toBe(true);
        expect(result.issues.some((i) => i.ruleId === "miniprogram-devtools-missing")).toBe(true);
    });

    it("缺少源码文件的页面标记为 error", async () => {
        writeFileSync(join(tempDir, "app.json"), '{"pages":["pages/index/index","pages/missing/missing"]}');
        writeFileSync(join(tempDir, "project.config.json"), '{"appid":"test"}');
        mkdirSync(join(tempDir, "pages/index"), { recursive: true });
        writeFileSync(join(tempDir, "pages/index/index.js"), "Page({})");

        const result = await runMiniProgramTest({ projectDir: tempDir });

        const missing = result.checkedPages.find((p) => p.path === "pages/missing/missing");
        expect(missing?.status).toBe("error");
        expect(result.issues.some((i) => i.ruleId === "miniprogram-page-missing")).toBe(true);
    });

    it("编译错误生成 critical issue", async () => {
        createWechatProject(["pages/index/index"]);
        vi.mocked(isWechatDevToolsAvailable).mockReturnValue(true);
        vi.mocked(wechatAutoCompile).mockReturnValue("error: pages/index/index.js syntax error\nwarn: unused import");

        const result = await runMiniProgramTest({ projectDir: tempDir });

        expect(result.issues.some((i) => i.ruleId === "miniprogram-compile-error")).toBe(true);
        expect(result.issues.some((i) => i.ruleId === "miniprogram-compile-warning")).toBe(true);
    });

    it("主包体积超过阈值生成 issue", async () => {
        createWechatProject(["pages/index/index"]);
        // 写入大文件让主包超过 1 字节阈值
        writeFileSync(join(tempDir, "big.js"), "x".repeat(100));

        const result = await runMiniProgramTest({ projectDir: tempDir, maxMainPackageSize: 50 });

        expect(result.issues.some((i) => i.ruleId === "miniprogram-main-package-oversize")).toBe(true);
    });

    it("formatMiniProgramReport 输出关键信息", async () => {
        createWechatProject(["pages/index/index"]);
        const result = await runMiniProgramTest({ projectDir: tempDir });

        const report = formatMiniProgramReport(result);
        expect(report).toContain("微信小程序自动化测试报告");
        expect(report).toContain("pages/index/index");
        expect(report).toContain("检查页面:");
    });

    it("formatMiniProgramJson 返回结构化数据", async () => {
        createWechatProject(["pages/index/index"]);
        const result = await runMiniProgramTest({ projectDir: tempDir });

        const json = formatMiniProgramJson(result) as any;
        expect(json.summary.platform).toBe("wechat");
        expect(json.summary.totalPages).toBe(1);
        expect(Array.isArray(json.pages)).toBe(true);
        expect(Array.isArray(json.issues)).toBe(true);
    });

    it("toScanResult 转换结果", async () => {
        createWechatProject(["pages/index/index"]);
        const result = await runMiniProgramTest({ projectDir: tempDir });
        const scan = toScanResult(result);

        expect(scan.module).toBe("mini-program");
        expect(scan.filesScanned).toBe(result.checkedPages.length);
        expect(scan.total).toBe(result.issues.length);
    });
});
