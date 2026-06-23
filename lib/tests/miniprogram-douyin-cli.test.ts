/**
 * v3.11.1: 抖音小程序开发者工具 CLI 配置测试
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
    existsSync: vi.fn(),
}));

import { existsSync } from "node:fs";
import {
    douyinCliConfig,
    findDouyinDevToolsCli,
    isDouyinDevToolsAvailable,
} from "../src/utils/miniprogram-douyin-cli.js";

describe("miniprogram-douyin-cli", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.DOUYIN_DEVTOOLS_CLI;
    });

    it("配置应包含抖音平台标识", () => {
        expect(douyinCliConfig.platform).toBe("douyin");
        expect(douyinCliConfig.label).toBe("抖音");
        expect(douyinCliConfig.envVar).toBe("DOUYIN_DEVTOOLS_CLI");
        expect(douyinCliConfig.autoCompileArgs).toContain("--build");
    });

    it("未安装时返回不可用", () => {
        vi.mocked(existsSync).mockReturnValue(false);
        expect(isDouyinDevToolsAvailable()).toBe(false);
        expect(findDouyinDevToolsCli()).toBeUndefined();
    });

    it("通过环境变量路径找到 CLI", () => {
        process.env.DOUYIN_DEVTOOLS_CLI = "/douyin/cli";
        vi.mocked(existsSync).mockImplementation((p) => p === "/douyin/cli");

        expect(findDouyinDevToolsCli()).toBe("/douyin/cli");
        expect(isDouyinDevToolsAvailable()).toBe(true);
    });
});
