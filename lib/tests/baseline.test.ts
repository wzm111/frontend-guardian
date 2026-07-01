import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    BaselineManager,
    compareWithBaseline,
    generateBaseline,
    loadBaseline,
    saveBaseline,
    toBaselineIssue,
} from "@/utils/baseline.js";
import type { Issue } from "@/types.js";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
    return {
        ruleId: "test-rule",
        title: "Test Issue",
        description: "A test issue",
        severity: "warning",
        file: "src/app.tsx",
        line: 10,
        column: 5,
        ...overrides,
    };
}

describe("toBaselineIssue", () => {
    it("精简 Issue 为 BaselineIssue", () => {
        const issue = makeIssue({ file: "src/a.tsx", ruleId: "rule-1", line: 5, column: 3, severity: "critical", title: "Bad" });
        const baseline = toBaselineIssue(issue);
        expect(baseline).toEqual({
            file: "src/a.tsx",
            ruleId: "rule-1",
            line: 5,
            column: 3,
            severity: "critical",
            title: "Bad",
        });
    });
});

describe("saveBaseline / loadBaseline", () => {
    let tempDir: string;
    let baselinePath: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-baseline-test-"));
        baselinePath = join(tempDir, "baseline.json");
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    it("保存并加载 baseline", () => {
        const issues = [makeIssue({ file: "a.tsx", line: 1 }), makeIssue({ file: "b.tsx", line: 2 })];
        saveBaseline(baselinePath, issues, { projectDir: tempDir });
        expect(existsSync(baselinePath)).toBe(true);

        const loaded = loadBaseline(baselinePath);
        expect(loaded).not.toBeNull();
        expect(loaded!.version).toBe("1.0");
        expect(loaded!.issues).toHaveLength(2);
        expect(loaded!.meta!.toolVersion).toBe("2.3.0");
    });

    it("v3.15.0: saveBaseline 应与已有 baseline 增量合并，避免重复记录", () => {
        const issues1 = [makeIssue({ file: "a.tsx", line: 1 }), makeIssue({ file: "b.tsx", line: 2 })];
        saveBaseline(baselinePath, issues1, { projectDir: tempDir });
        expect(loadBaseline(baselinePath)!.issues).toHaveLength(2);

        const issues2 = [makeIssue({ file: "b.tsx", line: 2 }), makeIssue({ file: "c.tsx", line: 3 })];
        saveBaseline(baselinePath, issues2, { projectDir: tempDir });
        const loaded = loadBaseline(baselinePath)!;
        expect(loaded.issues).toHaveLength(3);
        const files = loaded.issues.map((i) => i.file).sort();
        expect(files).toEqual(["a.tsx", "b.tsx", "c.tsx"]);
    });

    it("加载无效 JSON 返回 null", () => {
        writeFileSync(baselinePath, "not json", "utf-8");
        expect(loadBaseline(baselinePath)).toBeNull();
    });

    it("加载缺少 version 字段的文件返回 null", () => {
        writeFileSync(baselinePath, JSON.stringify({ issues: [] }), "utf-8");
        expect(loadBaseline(baselinePath)).toBeNull();
    });
});

describe("compareWithBaseline", () => {
    let tempDir: string;
    let baselinePath: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-baseline-test-"));
        baselinePath = join(tempDir, "baseline.json");
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    it("无 baseline 时返回全部为 newIssues", () => {
        const issues = [makeIssue()];
        const result = compareWithBaseline(issues, "nonexistent.json", tempDir);
        expect(result.baselineLoaded).toBe(false);
        expect(result.newIssues).toHaveLength(1);
        expect(result.knownIssues).toHaveLength(0);
        expect(result.fixedIssues).toHaveLength(0);
    });

    it("已知问题被分类为 knownIssues", () => {
        const known = [makeIssue({ file: "a.tsx", ruleId: "r1", line: 10, column: 5 })];
        saveBaseline(baselinePath, known);

        const current = [makeIssue({ file: "a.tsx", ruleId: "r1", line: 10, column: 5 })];
        const result = compareWithBaseline(current, baselinePath, tempDir);
        expect(result.baselineLoaded).toBe(true);
        expect(result.newIssues).toHaveLength(0);
        expect(result.knownIssues).toHaveLength(1);
        expect(result.fixedIssues).toHaveLength(0);
    });

    it("新增问题被分类为 newIssues", () => {
        const known = [makeIssue({ file: "a.tsx", ruleId: "r1", line: 10 })];
        saveBaseline(baselinePath, known);

        const current = [
            makeIssue({ file: "a.tsx", ruleId: "r1", line: 10 }),
            makeIssue({ file: "b.tsx", ruleId: "r2", line: 20 }),
        ];
        const result = compareWithBaseline(current, baselinePath, tempDir);
        expect(result.newIssues).toHaveLength(1);
        expect(result.newIssues[0].file).toBe("b.tsx");
        expect(result.knownIssues).toHaveLength(1);
        expect(result.fixedIssues).toHaveLength(0);
    });

    it("已修复问题被分类为 fixedIssues", () => {
        const known = [
            makeIssue({ file: "a.tsx", ruleId: "r1", line: 10 }),
            makeIssue({ file: "b.tsx", ruleId: "r2", line: 20 }),
        ];
        saveBaseline(baselinePath, known);

        const current = [makeIssue({ file: "a.tsx", ruleId: "r1", line: 10 })];
        const result = compareWithBaseline(current, baselinePath, tempDir);
        expect(result.newIssues).toHaveLength(0);
        expect(result.knownIssues).toHaveLength(1);
        expect(result.fixedIssues).toHaveLength(1);
        expect(result.fixedIssues[0].file).toBe("b.tsx");
    });

    it("列号相近（±5）视为同一问题", () => {
        const known = [makeIssue({ file: "a.tsx", ruleId: "r1", line: 10, column: 7 })];
        saveBaseline(baselinePath, known);

        // column 5 在 ±5 范围内
        const current = [makeIssue({ file: "a.tsx", ruleId: "r1", line: 10, column: 5 })];
        const result = compareWithBaseline(current, baselinePath, tempDir);
        expect(result.knownIssues).toHaveLength(1);
        expect(result.newIssues).toHaveLength(0);
    });

    it("列号相差超过 5 视为不同问题", () => {
        const known = [makeIssue({ file: "a.tsx", ruleId: "r1", line: 10, column: 20 })];
        saveBaseline(baselinePath, known);

        const current = [makeIssue({ file: "a.tsx", ruleId: "r1", line: 10, column: 5 })];
        const result = compareWithBaseline(current, baselinePath, tempDir);
        expect(result.newIssues).toHaveLength(1);
    });
});

describe("generateBaseline", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-baseline-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    it("生成 baseline 文件", () => {
        const path = join(tempDir, "fg-baseline.json");
        const issues = [makeIssue()];
        generateBaseline(issues, "fg-baseline.json", tempDir);
        expect(existsSync(path)).toBe(true);
        const loaded = loadBaseline(path);
        expect(loaded!.issues).toHaveLength(1);
    });
});

describe("BaselineManager", () => {
    let tempDir: string;
    let baselinePath: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-baseline-test-"));
        baselinePath = join(tempDir, "baseline.json");
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    it("isLoaded 在 baseline 不存在时返回 false", () => {
        const mgr = new BaselineManager("nonexistent.json", tempDir);
        expect(mgr.isLoaded()).toBe(false);
    });

    it("isLoaded 在 baseline 存在时返回 true", () => {
        saveBaseline(baselinePath, [makeIssue()]);
        const mgr = new BaselineManager("baseline.json", tempDir);
        expect(mgr.isLoaded()).toBe(true);
    });

    it("filterNewIssues 返回过滤结果", () => {
        saveBaseline(baselinePath, [makeIssue({ file: "a.tsx", ruleId: "r1", line: 10 })]);
        const mgr = new BaselineManager("baseline.json", tempDir);
        const result = mgr.filterNewIssues([makeIssue({ file: "b.tsx", ruleId: "r2", line: 20 })]);
        expect(result.newIssues).toHaveLength(1);
        expect(result.knownIssues).toHaveLength(0);
    });

    it("save 覆盖 baseline 文件", () => {
        const mgr = new BaselineManager("baseline.json", tempDir);
        mgr.save([makeIssue({ file: "c.tsx" })]);
        expect(mgr.isLoaded()).toBe(true);
        const loaded = mgr.getBaseline()!;
        expect(loaded.issues).toHaveLength(1);
        expect(loaded.issues[0].file).toBe("c.tsx");
    });

    it("getPath 返回绝对路径", () => {
        const mgr = new BaselineManager("baseline.json", tempDir);
        expect(mgr.getPath()).toBe(baselinePath);
    });
});
