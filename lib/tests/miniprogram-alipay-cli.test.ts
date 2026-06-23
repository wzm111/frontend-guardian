/**
 * v3.11.1: 支付宝小程序开发者工具 CLI 配置测试
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
    existsSync: vi.fn(),
}));

import { existsSync } from "node:fs";
import {
    alipayCliConfig,
    findAlipayDevToolsCli,
    isAlipayDevToolsAvailable,
} from "../src/utils/miniprogram-alipay-cli.js";

describe("miniprogram-alipay-cli", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.ALIPAY_DEVTOOLS_CLI;
    });

    it("配置应包含支付宝平台标识", () => {
        expect(alipayCliConfig.platform).toBe("alipay");
        expect(alipayCliConfig.label).toBe("支付宝");
        expect(alipayCliConfig.envVar).toBe("ALIPAY_DEVTOOLS_CLI");
        expect(alipayCliConfig.autoCompileArgs).toContain("--build");
    });

    it("未安装时返回不可用", () => {
        vi.mocked(existsSync).mockReturnValue(false);
        expect(isAlipayDevToolsAvailable()).toBe(false);
        expect(findAlipayDevToolsCli()).toBeUndefined();
    });

    it("通过环境变量路径找到 CLI", () => {
        process.env.ALIPAY_DEVTOOLS_CLI = "/alipay/cli";
        vi.mocked(existsSync).mockImplementation((p) => p === "/alipay/cli");

        expect(findAlipayDevToolsCli()).toBe("/alipay/cli");
        expect(isAlipayDevToolsAvailable()).toBe(true);
    });
});
