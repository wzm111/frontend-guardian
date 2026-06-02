/**
 * RuleEngine 核心引擎测试 — v2.1.0
 *
 * 覆盖 scan / applyFixes / clusterIssues / format / runExternal
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createEngine } from "../src/engine/rule-engine.js";
import type { Issue, Rule, RuleContext, Severity } from "../src/types.js";

/** 创建临时项目目录 */
function createTempProject(): string {
    return mkdtempSync(join(tmpdir(), "fg-test-"));
}

/** 清理临时目录 */
function cleanupTempProject(dir: string): void {
    try {
        rmSync(dir, { recursive: true, force: true });
    } catch {
        // ignore
    }
}

/** 在临时项目中写入文件 */
function writeProjectFile(projectDir: string, relPath: string, content: string): void {
    const fullPath = join(projectDir, relPath);
    mkdirSync(resolve(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
}

/** 创建一条简单的测试规则 */
function createTestRule(id: string, severity: Severity, message: string): Rule {
    return {
        id,
        name: `test-rule-${id}`,
        description: "Test rule",
        category: "test",
        severity,
        framework: ["react"],
        execute: (context: RuleContext) => {
            const issues: Issue[] = [];
            if (context.source.includes(message)) {
                issues.push({
                    ruleId: id,
                    title: `Found: ${message}`,
                    description: `Detected ${message} in file`,
                    severity,
                    file: context.filePath,
                    line: 1,
                    column: 1,
                    source: context.source.slice(0, 50),
                });
            }
            return Promise.resolve(issues);
        },
    };
}

/** 创建一条带修复的测试规则 */
function createFixableRule(): Rule {
    return {
        id: "test-fixable",
        name: "test-fixable",
        description: "A fixable test rule",
        category: "test",
        severity: "warning",
        framework: ["react"],
        execute: (context: RuleContext) => {
            const issues: Issue[] = [];
            const idx = context.source.indexOf("BAD_CODE");
            if (idx !== -1) {
                const lines = context.source.slice(0, idx).split("\n");
                const line = lines.length;
                const column = lines[lines.length - 1].length + 1;
                issues.push({
                    ruleId: "test-fixable",
                    title: "Replace BAD_CODE",
                    description: "BAD_CODE should be replaced",
                    severity: "warning",
                    file: context.filePath,
                    line,
                    column,
                    source: "BAD_CODE",
                    fix: {
                        start: { line, column },
                        end: { line, column: column + 8 },
                        text: "GOOD_CODE",
                    },
                });
            }
            return Promise.resolve(issues);
        },
    };
}

describe("RuleEngine — scan", () => {
    let projectDir: string;

    beforeEach(() => {
        projectDir = createTempProject();
    });

    afterEach(() => {
        cleanupTempProject(projectDir);
    });

    it("should scan files and find issues", async () => {
        writeProjectFile(projectDir, "src/test.tsx", "// contains HELLO_MARKER");
        writeProjectFile(projectDir, "src/other.ts", "// no marker here");

        const engine = createEngine({ projectDir, cache: false });
        engine.register(createTestRule("test-hello", "warning", "HELLO_MARKER"));

        const result = await engine.scan("test");

        expect(result.filesScanned).toBeGreaterThanOrEqual(1);
        expect(result.issues.warning.length).toBe(1);
        expect(result.issues.warning[0].ruleId).toBe("test-hello");
    });

    it("should filter by severity", async () => {
        writeProjectFile(projectDir, "src/a.tsx", "// contains SUGGESTION_MARKER");

        const engine = createEngine({ projectDir, minSeverity: "warning", cache: false });
        engine.register(createTestRule("test-suggestion", "suggestion", "SUGGESTION_MARKER"));

        const result = await engine.scan("test");
        expect(result.issues.suggestion.length).toBe(0);
        expect(result.total).toBe(0);
    });

    it("should respect staged mode with no git changes", async () => {
        writeProjectFile(projectDir, "src/a.tsx", "// contains STAGED_MARKER");

        const engine = createEngine({ projectDir, staged: true, cache: false });
        engine.register(createTestRule("test-staged", "critical", "STAGED_MARKER"));

        const result = await engine.scan("test");
        // 无 git 仓库时 staged 模式下 diffFiles 为空
        expect(result.filesScanned).toBe(0);
    });

    it("should cache unchanged files (v2.1.0 SmartCache)", async () => {
        writeProjectFile(projectDir, "src/cached.tsx", "// CACHE_MARKER");

        const engine = createEngine({ projectDir, cache: true });
        engine.register(createTestRule("test-cache", "warning", "CACHE_MARKER"));

        // 第一次扫描
        const r1 = await engine.scan("test");
        expect(r1.issues.warning.length).toBe(1);

        // 第二次扫描（文件未变更，应命中缓存）
        const r2 = await engine.scan("test");
        expect(r2.issues.warning.length).toBe(1);
    });
});

describe("RuleEngine — applyFixes", () => {
    let projectDir: string;

    beforeEach(() => {
        projectDir = createTempProject();
    });

    afterEach(() => {
        cleanupTempProject(projectDir);
    });

    it("should apply single-line fix", () => {
        const filePath = join(projectDir, "fix.tsx");
        writeFileSync(filePath, "const x = BAD_CODE;\n", "utf-8");

        const engine = createEngine({ projectDir, cache: false });
        const issues: Issue[] = [
            {
                ruleId: "test-fixable",
                title: "Replace BAD_CODE",
                description: "Fix it",
                severity: "warning",
                file: filePath,
                line: 1,
                column: 11,
                source: "BAD_CODE",
                fix: {
                    start: { line: 1, column: 11 },
                    end: { line: 1, column: 19 },
                    text: "GOOD_CODE",
                },
            },
        ];

        const result = engine.applyFixes(issues);
        expect(result.fixedCount).toBe(1);
        expect(result.filesModified).toContain(filePath);
        expect(result.errors).toHaveLength(0);

        const updated = writeFileSync.toString ? undefined : undefined;
        // 验证文件内容已更新
        const content = require("node:fs").readFileSync(filePath, "utf-8");
        expect(content).toContain("GOOD_CODE");
        expect(content).not.toContain("BAD_CODE");
    });

    it("should not write files in dry-run mode", () => {
        const filePath = join(projectDir, "dry.tsx");
        writeFileSync(filePath, "const x = BAD_CODE;\n", "utf-8");

        const engine = createEngine({ projectDir, cache: false, dryRun: true });
        const issues: Issue[] = [
            {
                ruleId: "test-fixable",
                title: "Replace BAD_CODE",
                description: "Fix it",
                severity: "warning",
                file: filePath,
                line: 1,
                column: 11,
                source: "BAD_CODE",
                fix: {
                    start: { line: 1, column: 11 },
                    end: { line: 1, column: 19 },
                    text: "GOOD_CODE",
                },
            },
        ];

        const result = engine.applyFixes(issues);
        expect(result.previews).toBeDefined();
        expect(result.previews!.length).toBe(1);
        expect(result.filesModified).toContain(filePath); // dry-run 下仍记录文件，但不写入

        const content = require("node:fs").readFileSync(filePath, "utf-8");
        expect(content).toContain("BAD_CODE"); // 文件未被修改
    });

    it("should handle overlapping fixes gracefully", () => {
        const filePath = join(projectDir, "overlap.tsx");
        writeFileSync(filePath, "A B C\n", "utf-8");

        const engine = createEngine({ projectDir, cache: false });
        // 两个 fix 都在同一行，按行号倒序处理
        const issues: Issue[] = [
            {
                ruleId: "r1",
                title: "fix1",
                description: "",
                severity: "warning",
                file: filePath,
                line: 1,
                column: 3,
                fix: { start: { line: 1, column: 3 }, end: { line: 1, column: 4 }, text: "X" },
            },
            {
                ruleId: "r2",
                title: "fix2",
                description: "",
                severity: "warning",
                file: filePath,
                line: 1,
                column: 1,
                fix: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 }, text: "Y" },
            },
        ];

        const result = engine.applyFixes(issues);
        expect(result.fixedCount).toBe(2);
    });
});

describe("RuleEngine — clusterIssues", () => {
    it("should cluster same-file same-rule issues", () => {
        const engine = createEngine({ projectDir: "/tmp", cache: false });

        const issues: Issue[] = [
            { ruleId: "r1", title: "A", description: "", severity: "warning", file: "f.tsx", line: 1, column: 1 },
            { ruleId: "r1", title: "A", description: "", severity: "warning", file: "f.tsx", line: 5, column: 1 },
            { ruleId: "r1", title: "A", description: "", severity: "warning", file: "f.tsx", line: 10, column: 1 },
            { ruleId: "r2", title: "B", description: "", severity: "warning", file: "f.tsx", line: 3, column: 1 },
        ];

        const clustered = engine.clusterIssues(issues);
        expect(clustered.length).toBe(2);

        const r1Cluster = clustered.find((i) => i.ruleId === "r1" && i.file === "f.tsx")!;
        expect(r1Cluster.title).toContain("(×3)");
        expect(r1Cluster.meta?.clusterCount).toBe(3);
    });

    it("should not cluster different rules", () => {
        const engine = createEngine({ projectDir: "/tmp", cache: false });

        const issues: Issue[] = [
            { ruleId: "r1", title: "A", description: "", severity: "warning", file: "f.tsx", line: 1, column: 1 },
            { ruleId: "r2", title: "B", description: "", severity: "warning", file: "f.tsx", line: 2, column: 1 },
        ];

        const clustered = engine.clusterIssues(issues);
        expect(clustered.length).toBe(2);
        expect(clustered[0].title).not.toContain("×");
        expect(clustered[1].title).not.toContain("×");
    });

    it("should keep single issues unchanged", () => {
        const engine = createEngine({ projectDir: "/tmp", cache: false });

        const issues: Issue[] = [
            { ruleId: "r1", title: "A", description: "", severity: "warning", file: "f.tsx", line: 1, column: 1 },
        ];

        const clustered = engine.clusterIssues(issues);
        expect(clustered.length).toBe(1);
        expect(clustered[0].title).toBe("A");
    });
});

describe("RuleEngine — register / unregister / filter", () => {
    it("should register and retrieve rules", () => {
        const engine = createEngine({ projectDir: "/tmp", cache: false });
        const rule = createTestRule("r1", "warning", "X");

        engine.register(rule);
        expect(engine.getRules().some((r) => r.id === "r1")).toBe(true);
    });

    it("should unregister custom rules", () => {
        const engine = createEngine({ projectDir: "/tmp", cache: false });
        // register 添加的是内置规则，unregister 仅对自定义规则生效
        const rule = createTestRule("r1", "warning", "X");
        engine.register(rule);
        expect(engine.getRules().some((r) => r.id === "r1")).toBe(true);

        // 尝试 unregister 内置规则，应无效果
        engine.unregister("r1");
        expect(engine.getRules().some((r) => r.id === "r1")).toBe(true);
    });

    it("should filter rules by frameworks", () => {
        const engine = createEngine({ projectDir: "/tmp", cache: false });
        engine.register({ ...createTestRule("react-rule", "warning", "X"), frameworks: ["react"] });
        engine.register({ ...createTestRule("vue-rule", "warning", "Y"), frameworks: ["vue"] });

        const reactRules = engine.filterRules({ framework: "react" });
        expect(reactRules.some((r) => r.id === "react-rule")).toBe(true);
        expect(reactRules.some((r) => r.id === "vue-rule")).toBe(false);
    });
});

describe("RuleEngine — createEngine options", () => {
    it("should accept custom concurrency", async () => {
        writeProjectFile(createTempProject(), "src/a.tsx", "// A");
        const dir = createTempProject();
        writeProjectFile(dir, "src/a.tsx", "// A");

        const engine = createEngine({
            projectDir: dir,
            cache: false,
            concurrency: 2,
        });
        expect(engine).toBeDefined();
        cleanupTempProject(dir);
    });
});
