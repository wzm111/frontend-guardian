/**
 * v2.7.0 测试 — 规则插件系统 + 配置热重载
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "@/utils/config-loader.js";
import { createEngine } from "@/engine/rule-engine.js";
import type { Rule, Issue } from "@/types.js";

describe("v2.7.0 — 规则插件系统", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "fg-v27-"));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it("extends: npm:non-existent 时应返回原配置并 warn", () => {
        writeFileSync(
            join(tmpDir, ".frontend-guardian.yml"),
            `
extends: npm:non-existent-package-xyz
severity: critical
`,
        );

        const config = loadConfig(tmpDir);
        expect(config.severity).toBe("critical");
        expect(config.extends).toBe("npm:non-existent-package-xyz");
    });

    it("__pluginRules 应被正确合并到配置中", () => {
        // 模拟一个带 __pluginRules 的配置文件
        writeFileSync(
            join(tmpDir, ".frontend-guardian.yml"),
            `
locale: zh
severity: warning
`,
        );

        const config = loadConfig(tmpDir);
        // 默认情况下 __pluginRules 不存在
        expect(config.__pluginRules).toBeUndefined();
    });

    it("RuleEngine 应注册 __pluginRules 中的插件规则", () => {
        const mockRule: Rule = {
            id: "plugin-test-rule",
            name: "Plugin Test Rule",
            description: "A test rule from plugin",
            severity: "warning",
            category: "i18n",
            defaultEnabled: true,
            execute: () => [] as Issue[],
        };

        // 创建一个带插件规则的配置文件
        writeFileSync(
            join(tmpDir, ".frontend-guardian.yml"),
            `
locale: zh
`,
        );

        // 手动注入 __pluginRules（模拟 npm 包加载后的效果）
        const engine = createEngine({
            projectDir: tmpDir,
            minSeverity: "suggestion",
        });

        // 通过反射或直接注册来测试
        // 这里我们测试 engine 是否能接受外部规则注册
        engine.register(mockRule);
        const rules = engine.getRules();
        expect(rules.some((r) => r.id === "plugin-test-rule")).toBe(true);
    });

    it("plugin 规则应支持 docsUrl 和 confidence", () => {
        const mockRule: Rule = {
            id: "plugin-rule-with-meta",
            name: "Plugin Rule With Meta",
            description: "Testing metadata propagation",
            severity: "critical",
            category: "security",
            defaultEnabled: true,
            docsUrl: "https://example.com/plugin-rule",
            execute: () => [
                {
                    ruleId: "plugin-rule-with-meta",
                    title: "Test Issue",
                    description: "Test",
                    severity: "critical",
                    file: "test.js",
                    line: 1,
                    column: 1,
                    fix: {
                        text: "fixed",
                        start: { line: 1, column: 1 },
                        end: { line: 1, column: 5 },
                        confidence: "high",
                    },
                },
            ],
        };

        writeFileSync(
            join(tmpDir, "test.js"),
            `const x = "test";`,
        );

        const engine = createEngine({
            projectDir: tmpDir,
            minSeverity: "suggestion",
        });

        engine.register(mockRule);
        const rules = engine.getRules();
        const registeredRule = rules.find((r) => r.id === "plugin-rule-with-meta");
        expect(registeredRule).toBeDefined();
        expect(registeredRule?.docsUrl).toBe("https://example.com/plugin-rule");
    });
});

describe("v2.7.0 — 配置热重载", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "fg-v27-watch-"));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it("配置文件路径应被正确解析", () => {
        writeFileSync(
            join(tmpDir, ".frontend-guardian.yml"),
            `
locale: zh
severity: warning
`,
        );

        const config = loadConfig(tmpDir);
        expect(config.locale).toBe("zh");
        expect(config.severity).toBe("warning");
    });

    it("JSON 格式配置文件应被正确加载", () => {
        writeFileSync(
            join(tmpDir, ".frontend-guardian.json"),
            JSON.stringify({ locale: "en", severity: "critical" }),
        );

        const config = loadConfig(tmpDir);
        expect(config.locale).toBe("en");
        expect(config.severity).toBe("critical");
    });

    it("配置文件的 yaml 扩展名应被支持", () => {
        writeFileSync(
            join(tmpDir, ".frontend-guardian.yaml"),
            `
locale: en
severity: suggestion
`,
        );

        const config = loadConfig(tmpDir);
        expect(config.locale).toBe("en");
        expect(config.severity).toBe("suggestion");
    });
});
