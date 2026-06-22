/**
 * v3.10.1: page-health-profile 工具测试
 */

import { describe, expect, it } from "vitest";
import {
    buildProfileKey,
    buildViewportKey,
    DEFAULT_MOBILE_DEVICE,
    parseViewport,
    resolveBrowserTypes,
    sanitizeProfileName,
} from "../src/utils/page-health-profile.js";

describe("page-health-profile", () => {
    describe("resolveBrowserTypes", () => {
        it("默认返回 chromium", () => {
            expect(resolveBrowserTypes()).toEqual(["chromium"]);
        });

        it("返回指定浏览器", () => {
            expect(resolveBrowserTypes("firefox")).toEqual(["firefox"]);
            expect(resolveBrowserTypes("webkit")).toEqual(["webkit"]);
        });

        it("all 返回三种浏览器", () => {
            expect(resolveBrowserTypes("all")).toEqual(["chromium", "firefox", "webkit"]);
        });

        it("无效浏览器抛出错误", () => {
            expect(() => resolveBrowserTypes("ie6")).toThrow("不支持的浏览器");
        });
    });

    describe("parseViewport", () => {
        it("解析 WxH 字符串", () => {
            expect(parseViewport("390x844")).toEqual({ width: 390, height: 844 });
        });

        it("拒绝非法格式", () => {
            expect(() => parseViewport("390")).toThrow("视口格式无效");
            expect(() => parseViewport("390x844x100")).toThrow("视口格式无效");
            expect(() => parseViewport("abc")).toThrow("视口格式无效");
        });
    });

    describe("sanitizeProfileName", () => {
        it("转小写并替换非法字符", () => {
            expect(sanitizeProfileName("iPhone 14 Pro")).toBe("iphone-14-pro");
            expect(sanitizeProfileName("Pixel 7")).toBe("pixel-7");
        });

        it("去除首尾连字符", () => {
            expect(sanitizeProfileName("  iPad  ")).toBe("ipad");
        });
    });

    describe("buildViewportKey", () => {
        it("device 优先", () => {
            expect(buildViewportKey({ device: "iPhone 14 Pro" })).toBe("iphone-14-pro");
        });

        it("viewport 次之", () => {
            expect(buildViewportKey({ viewport: "390x844" })).toBe("390x844");
        });

        it("viewportMobile 使用默认移动设备", () => {
            expect(buildViewportKey({ viewportMobile: true })).toBe(sanitizeProfileName(DEFAULT_MOBILE_DEVICE));
        });

        it("无配置返回 desktop", () => {
            expect(buildViewportKey({})).toBe("desktop");
        });
    });

    describe("buildProfileKey", () => {
        it("组合 browser 与 viewport", () => {
            expect(buildProfileKey("firefox", { device: "iPhone 14 Pro" })).toBe("firefox/iphone-14-pro");
        });

        it("自定义视口", () => {
            expect(buildProfileKey("chromium", { viewport: "390x844" })).toBe("chromium/390x844");
        });

        it("桌面默认", () => {
            expect(buildProfileKey("webkit", {})).toBe("webkit/desktop");
        });
    });
});
