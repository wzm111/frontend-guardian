/**
 * v3.11.0: 微信开发者工具 CLI 封装测试
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
    existsSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
    execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
    findWechatDevToolsCli,
    isWechatDevToolsAvailable,
    parseWechatCompileOutput,
    runWechatDevTools,
} from "../src/utils/miniprogram-wechat-cli.js";

describe("miniprogram-wechat-cli", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.WECHAT_DEVTOOLS_CLI;
    });

    it("未安装时返回不可用", () => {
        vi.mocked(existsSync).mockReturnValue(false);
        vi.mocked(execSync).mockImplementation(() => {
            throw new Error("not found");
        });
        expect(isWechatDevToolsAvailable()).toBe(false);
        expect(findWechatDevToolsCli()).toBeUndefined();
    });

    it("通过环境变量路径找到 CLI", () => {
        process.env.WECHAT_DEVTOOLS_CLI = "/custom/cli";
        vi.mocked(existsSync).mockImplementation((p) => p === "/custom/cli");

        expect(findWechatDevToolsCli()).toBe("/custom/cli");
        expect(isWechatDevToolsAvailable()).toBe(true);
    });

    it("调用 CLI 并返回输出", () => {
        process.env.WECHAT_DEVTOOLS_CLI = "/custom/cli";
        vi.mocked(existsSync).mockImplementation((p) => p === "/custom/cli");
        vi.mocked(execSync).mockReturnValue("compile success");

        const output = runWechatDevTools({ projectDir: "/project", args: ["--auto"] });
        expect(output).toBe("compile success");
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
        const result = parseWechatCompileOutput(output);
        expect(result.errors).toHaveLength(2);
        expect(result.warnings).toHaveLength(2);
        expect(result.errors[0]).toContain("page not found");
    });
});
