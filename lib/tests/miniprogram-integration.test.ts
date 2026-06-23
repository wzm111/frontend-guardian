/**
 * v3.11.1: 小程序自动化测试多平台集成测试
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
} from "../src/integrations/miniprogram.js";

vi.mock("../src/utils/miniprogram-cli.js", () => ({
    isDevToolsAvailable: vi.fn(),
    runAutoCompile: vi.fn(),
    runScreenshot: vi.fn(),
    parseCompileOutput: vi.fn((output: string) => {
        const errors = output.split("\n").filter((l) => l.startsWith("error:"));
        const warnings = output.split("\n").filter((l) => l.startsWith("warn:"));
        return { errors, warnings };
    }),
}));

import { isDevToolsAvailable, runAutoCompile, runScreenshot } from "../src/utils/miniprogram-cli.js";

const PLATFORMS = ["wechat", "alipay", "douyin"] as const;

describe("miniprogram integration", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-mp-int-"));
        vi.mocked(isDevToolsAvailable).mockReturnValue(false);
        vi.mocked(runAutoCompile).mockReturnValue(null);
        vi.mocked(runScreenshot).mockReturnValue(null);
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    function createPageFiles(pages: string[]) {
        for (const page of pages) {
            const file = join(tempDir, `${page}.js`);
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, "Page({})");
        }
    }

    function createWechatProject(pages: string[]) {
        writeFileSync(join(tempDir, "app.json"), JSON.stringify({ pages }));
        writeFileSync(join(tempDir, "project.config.json"), '{"appid":"test"}');
        createPageFiles(pages);
    }

    function createAlipayProject(pages: string[]) {
        writeFileSync(join(tempDir, "app.json"), JSON.stringify({ pages }));
        writeFileSync(join(tempDir, "mini.project.json"), '{"appid":"test"}');
        createPageFiles(pages);
    }

    function createDouyinProject(pages: string[]) {
        writeFileSync(join(tempDir, "app.json"), JSON.stringify({ pages }));
        writeFileSync(join(tempDir, "project.config.json"), '{"appid":"test","tt":{"appid":"test"}}');
        createPageFiles(pages);
    }

    function createMultiPlatformProject(pages: string[]) {
        writeFileSync(join(tempDir, "app.json"), JSON.stringify({ pages }));
        writeFileSync(join(tempDir, "project.config.json"), '{"appid":"test","tt":{"appid":"test"}}');
        writeFileSync(join(tempDir, "mini.project.json"), '{"appid":"test"}');
        createPageFiles(pages);
    }

    for (const platform of PLATFORMS) {
        it(`${platform}: 自动检测并检查页面存在性`, async () => {
            if (platform === "wechat") createWechatProject(["pages/index/index"]);
            if (platform === "alipay") createAlipayProject(["pages/index/index"]);
            if (platform === "douyin") createDouyinProject(["pages/index/index"]);

            const result = await runMiniProgramTest({ projectDir: tempDir, platform });

            expect(result.platform).toBe(platform);
            expect(result.checkedPages).toHaveLength(1);
            expect(result.checkedPages[0].path).toBe("pages/index/index");
            expect(result.issues.some((i) => i.ruleId === "miniprogram-devtools-missing")).toBe(true);
        });
    }

    it("支付宝项目使用 platform=alipay 检测", async () => {
        createAlipayProject(["pages/home/home"]);

        const result = await runMiniProgramTest({ projectDir: tempDir, platform: "alipay" });

        expect(result.platform).toBe("alipay");
        expect(result.checkedPages.every((p) => p.status === "ok")).toBe(true);
        expect(formatMiniProgramReport(result)).toContain("支付宝小程序自动化测试报告");
    });

    it("抖音项目使用 platform=douyin 检测", async () => {
        createDouyinProject(["pages/home/home"]);

        const result = await runMiniProgramTest({ projectDir: tempDir, platform: "douyin" });

        expect(result.platform).toBe("douyin");
        expect(formatMiniProgramReport(result)).toContain("抖音小程序自动化测试报告");
    });

    it("多平台项目使用 platform=all 合并结果", async () => {
        createMultiPlatformProject(["pages/index/index"]);

        const result = await runMiniProgramTest({ projectDir: tempDir, platform: "all" });

        expect(result.platform).toBe("multi");
        expect(result.platforms).toEqual(expect.arrayContaining(["wechat", "alipay", "douyin"]));
        expect(result.platforms).toHaveLength(3);
        expect(result.checkedPages).toHaveLength(3);
        expect(result.checkedPages.map((p) => p.platform).sort()).toEqual(["alipay", "douyin", "wechat"]);
        expect(formatMiniProgramReport(result)).toContain("多平台小程序自动化测试报告");
    });

    it("显式指定 platforms 数组", async () => {
        createMultiPlatformProject(["pages/index/index"]);

        const result = await runMiniProgramTest({
            projectDir: tempDir,
            platforms: ["wechat", "alipay"],
        });

        expect(result.platform).toBe("multi");
        expect(result.platforms).toEqual(["wechat", "alipay"]);
        expect(result.checkedPages).toHaveLength(2);
    });

    it("编译错误生成 critical issue", async () => {
        createWechatProject(["pages/index/index"]);
        vi.mocked(isDevToolsAvailable).mockReturnValue(true);
        vi.mocked(runAutoCompile).mockReturnValue("error: pages/index/index.js syntax error\nwarn: unused import");

        const result = await runMiniProgramTest({ projectDir: tempDir, platform: "wechat" });

        expect(result.issues.some((i) => i.ruleId === "miniprogram-compile-error")).toBe(true);
        expect(result.issues.some((i) => i.ruleId === "miniprogram-compile-warning")).toBe(true);
    });

    it("主包体积超过阈值生成 issue", async () => {
        createWechatProject(["pages/index/index"]);
        writeFileSync(join(tempDir, "big.js"), "x".repeat(100));

        const result = await runMiniProgramTest({ projectDir: tempDir, maxMainPackageSize: 50 });

        expect(result.issues.some((i) => i.ruleId === "miniprogram-main-package-oversize")).toBe(true);
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
});
