/**
 * v3.11.0: 小程序项目检测测试
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    detectMiniProgramPlatform,
    getMiniProgramDevToolsDownloadUrl,
    getMiniProgramPlatformLabel,
    isAlipayMiniProgram,
    isDouyinMiniProgram,
    isWechatMiniProgram,
    readMiniProgramPages,
    resolveMiniProgramProject,
} from "../src/utils/miniprogram-detect.js";

describe("miniprogram-detect", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-mp-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    describe("isWechatMiniProgram", () => {
        it("识别原生微信小程序", () => {
            writeFileSync(join(tempDir, "app.json"), '{"pages":["pages/index/index"]}');
            writeFileSync(join(tempDir, "project.config.json"), '{"appid":"test"}');
            expect(isWechatMiniProgram(tempDir)).toBe(true);
        });

        it("识别 UniApp 转微信小程序", () => {
            writeFileSync(join(tempDir, "manifest.json"), '{"name":"test"}');
            writeFileSync(join(tempDir, "pages.json"), '{"pages":[{"path":"pages/index/index"}]}');
            expect(isWechatMiniProgram(tempDir)).toBe(true);
        });

        it("非小程序目录返回 false", () => {
            expect(isWechatMiniProgram(tempDir)).toBe(false);
        });
    });

    describe("isAlipayMiniProgram", () => {
        it("识别支付宝小程序", () => {
            writeFileSync(join(tempDir, "mini.project.json"), '{"miniprogramRoot":"./"}');
            expect(isAlipayMiniProgram(tempDir)).toBe(true);
        });
    });

    describe("isDouyinMiniProgram", () => {
        it("识别抖音小程序", () => {
            writeFileSync(join(tempDir, "project.config.json"), '{"tt":{"appid":"test"}}');
            expect(isDouyinMiniProgram(tempDir)).toBe(true);
        });

        it("普通 project.config.json 不识别为抖音", () => {
            writeFileSync(join(tempDir, "project.config.json"), '{"appid":"test"}');
            expect(isDouyinMiniProgram(tempDir)).toBe(false);
        });
    });

    describe("detectMiniProgramPlatform", () => {
        it("支付宝优先于微信", () => {
            // 同时存在 mini.project.json 与 app.json+project.config.json 时支付宝优先
            writeFileSync(join(tempDir, "app.json"), '{}');
            writeFileSync(join(tempDir, "project.config.json"), '{}');
            writeFileSync(join(tempDir, "mini.project.json"), '{}');
            expect(detectMiniProgramPlatform(tempDir)).toBe("alipay");
        });

        it("无法识别返回 null", () => {
            expect(detectMiniProgramPlatform(tempDir)).toBeNull();
        });
    });

    describe("readMiniProgramPages", () => {
        it("从 pages.json 读取 UniApp 路由", () => {
            writeFileSync(
                join(tempDir, "pages.json"),
                JSON.stringify({
                    pages: [{ path: "pages/index/index" }, { path: "pages/user/user" }],
                    subPackages: [{ root: "pages/order", pages: ["list", "detail"] }],
                })
            );
            const result = readMiniProgramPages(tempDir, "wechat");
            expect(result.pages).toEqual(["pages/index/index", "pages/user/user"]);
            expect(result.subPackages).toHaveLength(1);
            expect(result.subPackages![0].pages).toEqual(["list", "detail"]);
        });

        it("从 app.json 读取原生路由", () => {
            writeFileSync(
                join(tempDir, "app.json"),
                JSON.stringify({
                    pages: ["pages/index/index", "pages/logs/logs"],
                    subPackages: [{ root: "pages/shop", pages: ["index", "cart"] }],
                })
            );
            const result = readMiniProgramPages(tempDir, "wechat");
            expect(result.pages).toEqual(["pages/index/index", "pages/logs/logs"]);
        });

        it("无配置返回空数组", () => {
            expect(readMiniProgramPages(tempDir, "wechat")).toEqual({ pages: [] });
        });
    });

    describe("resolveMiniProgramProject", () => {
        it("解析微信小程序项目信息", () => {
            writeFileSync(join(tempDir, "app.json"), '{"pages":["pages/index/index"]}');
            writeFileSync(join(tempDir, "project.config.json"), '{"appid":"test"}');
            const info = resolveMiniProgramProject(tempDir);
            expect(info).not.toBeNull();
            expect(info?.platform).toBe("wechat");
            expect(info?.pages).toEqual(["pages/index/index"]);
            expect(info?.appJsonPath).toBe(join(tempDir, "app.json"));
            expect(info?.projectConfigPath).toBe(join(tempDir, "project.config.json"));
        });
    });

    describe("labels and urls", () => {
        it("返回中文平台名", () => {
            expect(getMiniProgramPlatformLabel("wechat")).toBe("微信");
            expect(getMiniProgramPlatformLabel("alipay")).toBe("支付宝");
            expect(getMiniProgramPlatformLabel("douyin")).toBe("抖音");
        });

        it("返回下载链接", () => {
            expect(getMiniProgramDevToolsDownloadUrl("wechat")).toContain("weixin.qq.com");
            expect(getMiniProgramDevToolsDownloadUrl("alipay")).toContain("alipay.com");
        });
    });
});
