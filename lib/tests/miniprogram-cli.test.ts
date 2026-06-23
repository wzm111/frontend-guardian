/**
 * v3.11.1: 通用小程序开发者工具 CLI 封装测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
    existsSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
    execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
    findDevToolsCli,
    isDevToolsAvailable,
    parseCompileOutput,
    runAutoCompile,
    runDevTools,
    runPerformance,
    runScreenshot,
} from "../src/utils/miniprogram-cli.js";
import { alipayCliConfig, douyinCliConfig, wechatCliConfig } from "../src/utils/miniprogram-cli-configs.js";

describe("miniprogram-cli", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.WECHAT_DEVTOOLS_CLI;
        delete process.env.ALIPAY_DEVTOOLS_CLI;
        delete process.env.DOUYIN_DEVTOOLS_CLI;
    });

    it("未安装时返回不可用", () => {
        vi.mocked(existsSync).mockReturnValue(false);
        vi.mocked(execSync).mockImplementation(() => {
            throw new Error("not found");
        });
        expect(isDevToolsAvailable(wechatCliConfig)).toBe(false);
        expect(findDevToolsCli(wechatCliConfig)).toBeUndefined();
    });

    it("通过环境变量路径找到微信 CLI", () => {
        process.env.WECHAT_DEVTOOLS_CLI = "/custom/cli";
        vi.mocked(existsSync).mockImplementation((p) => p === "/custom/cli");

        expect(findDevToolsCli(wechatCliConfig)).toBe("/custom/cli");
        expect(isDevToolsAvailable(wechatCliConfig)).toBe(true);
    });

    it("通过环境变量路径找到支付宝 CLI", () => {
        process.env.ALIPAY_DEVTOOLS_CLI = "/alipay/cli";
        vi.mocked(existsSync).mockImplementation((p) => p === "/alipay/cli");

        expect(findDevToolsCli(alipayCliConfig)).toBe("/alipay/cli");
        expect(isDevToolsAvailable(alipayCliConfig)).toBe(true);
    });

    it("通过环境变量路径找到抖音 CLI", () => {
        process.env.DOUYIN_DEVTOOLS_CLI = "/douyin/cli";
        vi.mocked(existsSync).mockImplementation((p) => p === "/douyin/cli");

        expect(findDevToolsCli(douyinCliConfig)).toBe("/douyin/cli");
        expect(isDevToolsAvailable(douyinCliConfig)).toBe(true);
    });

    it("调用 CLI 并返回输出", () => {
        process.env.WECHAT_DEVTOOLS_CLI = "/custom/cli";
        vi.mocked(existsSync).mockImplementation((p) => p === "/custom/cli");
        vi.mocked(execSync).mockReturnValue("compile success");

        const output = runDevTools({ projectDir: "/project", args: ["--auto"] }, wechatCliConfig);
        expect(output).toBe("compile success");
        expect(execSync).toHaveBeenCalled();
    });

    it("按配置执行自动编译命令", () => {
        process.env.ALIPAY_DEVTOOLS_CLI = "/alipay/cli";
        vi.mocked(existsSync).mockImplementation((p) => p === "/alipay/cli");
        vi.mocked(execSync).mockReturnValue("alipay build success");

        const output = runAutoCompile(alipayCliConfig, "/project");
        expect(output).toBe("alipay build success");
    });

    it("按配置执行截图命令", () => {
        process.env.DOUYIN_DEVTOOLS_CLI = "/douyin/cli";
        vi.mocked(existsSync).mockImplementation((p) => p === "/douyin/cli");
        vi.mocked(execSync).mockReturnValue("screenshot ok");

        const output = runScreenshot(douyinCliConfig, "/project", "/tmp/s.png");
        expect(output).toBe("screenshot ok");
    });

    it("未配置 performanceArgs 时 runPerformance 返回 null", () => {
        process.env.WECHAT_DEVTOOLS_CLI = "/custom/cli";
        vi.mocked(existsSync).mockImplementation((p) => p === "/custom/cli");
        vi.mocked(execSync).mockReturnValue("{}");

        const output = runPerformance(wechatCliConfig, "/project");
        expect(output).toBeNull();
        expect(execSync).not.toHaveBeenCalled();
    });

    it("配置 performanceArgs 时按配置执行性能采集命令", () => {
        const perfConfig = { ...wechatCliConfig, performanceArgs: ["--performance"] };
        process.env.WECHAT_DEVTOOLS_CLI = "/custom/cli";
        vi.mocked(existsSync).mockImplementation((p) => p === "/custom/cli");
        vi.mocked(execSync).mockReturnValue('{"startupTimeMs": 1200, "fps": 60}');

        const output = runPerformance(perfConfig, "/project");
        expect(output).toBe('{"startupTimeMs": 1200, "fps": 60}');
        expect(execSync).toHaveBeenCalled();
    });

    it("解析编译输出中的错误与警告", () => {
        const output = [
            "[INFO] compiling...",
            "error: page not found",
            "[ERROR] syntax error at line 3",
            "warn: deprecated API",
            "[WARN] unused variable",
        ].join("\n");
        const result = parseCompileOutput(output);
        expect(result.errors).toHaveLength(2);
        expect(result.warnings).toHaveLength(2);
        expect(result.errors[0]).toContain("page not found");
    });
});
