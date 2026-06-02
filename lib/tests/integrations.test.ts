/**
 * 外部工具集成测试 — v2.2.0
 *
 * Mock ESLint / TypeScript / Stylelint 输出，验证转换逻辑
 */

import { describe, it, expect } from "vitest";
import { eslintSeverityToFg, hasPackage, runCommand } from "../src/integrations/base.js";

describe("eslintSeverityToFg", () => {
    it("应将 2/error 映射为 critical", () => {
        expect(eslintSeverityToFg(2)).toBe("critical");
    });

    it("应将 1/warn 映射为 warning", () => {
        expect(eslintSeverityToFg(1)).toBe("warning");
    });

    it("应将 0 映射为 suggestion", () => {
        expect(eslintSeverityToFg(0)).toBe("suggestion");
    });

    it("未知 severity 应默认为 suggestion", () => {
        expect(eslintSeverityToFg(999)).toBe("suggestion");
    });
});

describe("runCommand", () => {
    it("应成功执行简单命令并返回 stdout", () => {
        const result = runCommand("echo hello", ".");
        expect(result).not.toBeNull();
        expect(result).toContain("hello");
    });

    it("失败的命令（有 stdout）应返回 stdout 内容", () => {
        const result = runCommand("node -e \"console.log('output'); process.exit(1)\"", ".");
        expect(result).not.toBeNull();
        expect(result).toContain("output");
    });

    it("不存在的命令应返回 null", () => {
        const result = runCommand("nonexistent_command_xyz_12345", ".");
        expect(result).toBeNull();
    });
});

describe("hasPackage", () => {
    it("应能检测到 node 包（全局可用）", () => {
        const result = hasPackage(".", "node");
        expect(result).toBe(true);
    });

    it("不存在的包应返回 false", () => {
        const result = hasPackage(".", "nonexistent-pkg-xyz-12345");
        expect(result).toBe(false);
    }, 15000);
});
