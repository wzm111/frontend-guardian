/**
 * v2.4.0 — SmartFix 置信度系统 + docsUrl + 大文件跳过 测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createEngine } from "../src/engine/rule-engine.js";
import type { Issue, Rule, RuleContext } from "../src/types.js";

function createTempProject(): string {
    return mkdtempSync(join(tmpdir(), "fg-v24-test-"));
}

function cleanupTempProject(dir: string): void {
    try {
        rmSync(dir, { recursive: true, force: true });
    } catch { /* ignore */ }
}

function writeProjectFile(projectDir: string, relPath: string, content: string): void {
    const fullPath = join(projectDir, relPath);
    mkdirSync(resolve(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
}

/** 创建带置信度的测试规则 */
function createConfidenceRule(confidence: "high" | "medium" | "low"): Rule {
    return {
        id: "test-confidence",
        name: "test-confidence",
        description: "Test confidence",
        category: "test",
        severity: "warning",
        frameworks: ["react"],
        docsUrl: "https://docs.example.com/rules/test-confidence",
        execute: (context: RuleContext): Issue[] => {
            const issues: Issue[] = [];
            if (context.source.includes("FIX_ME")) {
                const idx = context.source.indexOf("FIX_ME");
                const lines = context.source.slice(0, idx).split("\n");
                const line = lines.length;
                const column = lines[lines.length - 1].length + 1;
                issues.push({
                    ruleId: "test-confidence",
                    title: "Need fix",
                    description: "Replace FIX_ME",
                    severity: "warning",
                    file: context.filePath,
                    line,
                    column,
                    fix: {
                        text: "FIXED",
                        start: { line, column },
                        end: { line, column: column + 6 },
                        confidence,
                        description: `This is a ${confidence} confidence fix`,
                    },
                });
            }
            return issues;
        },
    };
}

describe("SmartFix 置信度系统", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempProject();
    });

    afterEach(() => {
        cleanupTempProject(tempDir);
    });

    it("高置信度修复应自动应用", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const x = FIX_ME;\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        const rule = createConfidenceRule("high");
        engine.register(rule);

        const issues = rule.execute({
            filePath: file,
            source: "const x = FIX_ME;\n",
            config: {},
            projectMeta: { platforms: [], hasTypeScript: false, hasI18n: false, scripts: {}, packageManager: "npm", runtime: "node" },
            utils: {} as any,
        });

        const result = engine.applyFixes(issues);
        expect(result.fixedCount).toBe(1);
        expect(result.skippedByUser).toBe(0);
        expect(readFileSync(file, "utf-8")).toBe("const x = FIXED;\n");
    });

    it("中置信度修复应自动应用", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const x = FIX_ME;\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        const rule = createConfidenceRule("medium");
        engine.register(rule);

        const issues = rule.execute({
            filePath: file,
            source: "const x = FIX_ME;\n",
            config: {},
            projectMeta: { platforms: [], hasTypeScript: false, hasI18n: false, scripts: {}, packageManager: "npm", runtime: "node" },
            utils: {} as any,
        });

        const result = engine.applyFixes(issues);
        expect(result.fixedCount).toBe(1);
        expect(result.skippedByUser).toBe(0);
    });

    it("低置信度修复在自动模式下应被跳过", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const x = FIX_ME;\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        const rule = createConfidenceRule("low");
        engine.register(rule);

        const issues = rule.execute({
            filePath: file,
            source: "const x = FIX_ME;\n",
            config: {},
            projectMeta: { platforms: [], hasTypeScript: false, hasI18n: false, scripts: {}, packageManager: "npm", runtime: "node" },
            utils: {} as any,
        });

        const result = engine.applyFixes(issues);
        expect(result.fixedCount).toBe(0);
        expect(result.skippedByUser).toBe(1);
        expect(readFileSync(file, "utf-8")).toBe("const x = FIX_ME;\n");
    });

    it("默认置信度应为 high（自动应用）", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const x = FIX_ME;\n", "utf-8");

        const rule: Rule = {
            id: "test-default-confidence",
            name: "test-default-confidence",
            description: "Test",
            category: "test",
            severity: "warning",
            execute: (context: RuleContext): Issue[] => {
                return [{
                    ruleId: "test-default-confidence",
                    title: "Need fix",
                    description: "Replace",
                    severity: "warning",
                    file: context.filePath,
                    line: 1,
                    column: 11,
                    fix: {
                        text: "FIXED",
                        start: { line: 1, column: 11 },
                        end: { line: 1, column: 17 },
                        // 未设置 confidence，默认应为 high
                    },
                }];
            },
        };

        const engine = createEngine({ projectDir: tempDir });
        engine.register(rule);
        const issues = rule.execute({
            filePath: file,
            source: "const x = FIX_ME;\n",
            config: {},
            projectMeta: { platforms: [], hasTypeScript: false, hasI18n: false, scripts: {}, packageManager: "npm", runtime: "node" },
            utils: {} as any,
        });

        const result = engine.applyFixes(issues);
        expect(result.fixedCount).toBe(1);
        expect(result.skippedByUser).toBe(0);
    });
});

describe("docsUrl 规则文档链接", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempProject();
    });

    afterEach(() => {
        cleanupTempProject(tempDir);
    });

    it("规则 docsUrl 应传递到 Issue", async () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const x = FIX_ME;\n", "utf-8");

        const rule: Rule = {
            id: "test-docs-url",
            name: "test-docs-url",
            description: "Test docsUrl",
            category: "test",
            severity: "warning",
            docsUrl: "https://docs.example.com/rules/test-docs-url",
            execute: (): Issue[] => {
                return [{
                    ruleId: "test-docs-url",
                    title: "Test",
                    description: "Test",
                    severity: "warning",
                    file,
                    line: 1,
                    column: 1,
                }];
            },
        };

        const engine = createEngine({ projectDir: tempDir });
        engine.register(rule);

        const result = await engine.scan("test");
        const allIssues = [...result.issues.critical, ...result.issues.warning, ...result.issues.suggestion];
        expect(allIssues.length).toBe(1);
        expect(allIssues[0].docsUrl).toBe("https://docs.example.com/rules/test-docs-url");
    });

    it("Issue 已有 docsUrl 时不应被覆盖", async () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const x = FIX_ME;\n", "utf-8");

        const rule: Rule = {
            id: "test-docs-url-override",
            name: "test-docs-url-override",
            description: "Test",
            category: "test",
            severity: "warning",
            docsUrl: "https://docs.example.com/rules/rule-url",
            execute: (): Issue[] => {
                return [{
                    ruleId: "test-docs-url-override",
                    title: "Test",
                    description: "Test",
                    severity: "warning",
                    file,
                    line: 1,
                    column: 1,
                    docsUrl: "https://docs.example.com/rules/issue-url", // Issue 有自己的 docsUrl
                }];
            },
        };

        const engine = createEngine({ projectDir: tempDir });
        engine.register(rule);

        const result = await engine.scan("test");
        const allIssues = [...result.issues.critical, ...result.issues.warning, ...result.issues.suggestion];
        expect(allIssues[0].docsUrl).toBe("https://docs.example.com/rules/issue-url");
    });
});

describe("大文件智能跳过", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempProject();
    });

    afterEach(() => {
        cleanupTempProject(tempDir);
    });

    it("超过阈值的文件应被跳过", async () => {
        const file = join(tempDir, "large.js");
        // 写入超过 1KB 的内容
        const bigContent = "// padding\n".repeat(200); // ~2.4KB
        writeFileSync(file, bigContent, "utf-8");

        const engine = createEngine({
            projectDir: tempDir,
            skipLargeFilesThreshold: 1024, // 1KB
        });

        const rule: Rule = {
            id: "test-large-file",
            name: "test-large-file",
            description: "Test",
            category: "test",
            severity: "warning",
            execute: (): Issue[] => {
                return [{
                    ruleId: "test-large-file",
                    title: "Should not appear",
                    description: "Test",
                    severity: "warning",
                    file,
                    line: 1,
                    column: 1,
                }];
            },
        };

        engine.register(rule);
        const result = await engine.scan("test");
        expect(result.total).toBe(0);
        expect(result.filesScanned).toBe(0);
    });

    it("未超过阈值的文件应正常扫描", async () => {
        const file = join(tempDir, "small.js");
        writeFileSync(file, "const x = 1;\n", "utf-8");

        const engine = createEngine({
            projectDir: tempDir,
            skipLargeFilesThreshold: 1024, // 1KB
        });

        const rule: Rule = {
            id: "test-small-file",
            name: "test-small-file",
            description: "Test",
            category: "test",
            severity: "warning",
            execute: (): Issue[] => {
                return [{
                    ruleId: "test-small-file",
                    title: "Should appear",
                    description: "Test",
                    severity: "warning",
                    file,
                    line: 1,
                    column: 1,
                }];
            },
        };

        engine.register(rule);
        const result = await engine.scan("test");
        expect(result.total).toBe(1);
        expect(result.filesScanned).toBeGreaterThan(0);
    });

    it("阈值为 0 时不应跳过任何文件", async () => {
        const file = join(tempDir, "huge.js");
        const bigContent = "// padding\n".repeat(500);
        writeFileSync(file, bigContent, "utf-8");

        const engine = createEngine({
            projectDir: tempDir,
            skipLargeFilesThreshold: 0, // 不跳过
        });

        const rule: Rule = {
            id: "test-no-skip",
            name: "test-no-skip",
            description: "Test",
            category: "test",
            severity: "warning",
            execute: (): Issue[] => {
                return [{
                    ruleId: "test-no-skip",
                    title: "Should appear",
                    description: "Test",
                    severity: "warning",
                    file,
                    line: 1,
                    column: 1,
                }];
            },
        };

        engine.register(rule);
        const result = await engine.scan("test");
        expect(result.total).toBe(1);
    });

    it("默认阈值 500KB 不应跳过小文件", async () => {
        const file = join(tempDir, "normal.js");
        writeFileSync(file, "const x = 1;\n", "utf-8");

        const engine = createEngine({
            projectDir: tempDir,
            // 不设置 threshold，使用默认值 500KB
        });

        const rule: Rule = {
            id: "test-default-threshold",
            name: "test-default-threshold",
            description: "Test",
            category: "test",
            severity: "warning",
            execute: (): Issue[] => {
                return [{
                    ruleId: "test-default-threshold",
                    title: "Should appear",
                    description: "Test",
                    severity: "warning",
                    file,
                    line: 1,
                    column: 1,
                }];
            },
        };

        engine.register(rule);
        const result = await engine.scan("test");
        expect(result.total).toBe(1);
    });
});
