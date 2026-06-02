import { describe, it, expect } from "vitest";
import { generateSarif, formatSarif } from "@/formatters/sarif.js";
import type { Issue } from "@/types.js";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
    return {
        ruleId: "test-rule",
        title: "Test Issue",
        description: "A test issue description",
        severity: "warning",
        file: "src/app.tsx",
        line: 10,
        column: 5,
        ...overrides,
    };
}

describe("generateSarif", () => {
    it("生成基本 SARIF 结构", () => {
        const report = generateSarif([]);
        expect(report.$schema).toContain("sarif-schema-2.1.0");
        expect(report.version).toBe("2.1.0");
        expect(report.runs).toHaveLength(1);
        expect(report.runs[0].tool.driver.name).toBe("Frontend Guardian");
        expect(report.runs[0].results).toHaveLength(0);
    });

    it("包含自定义工具信息", () => {
        const report = generateSarif([], { toolName: "Custom Tool", toolVersion: "1.0.0" });
        expect(report.runs[0].tool.driver.name).toBe("Custom Tool");
        expect(report.runs[0].tool.driver.version).toBe("1.0.0");
    });

    it("包含项目目录", () => {
        const report = generateSarif([], { projectDir: "/home/user/project" });
        expect(report.runs[0].invocations).toBeDefined();
        expect(report.runs[0].invocations![0].workingDirectory!.uri).toBe("/home/user/project");
    });

    it("将 critical 映射为 error 级别", () => {
        const issues = [makeIssue({ severity: "critical" })];
        const report = generateSarif(issues);
        expect(report.runs[0].results[0].level).toBe("error");
    });

    it("将 warning 映射为 warning 级别", () => {
        const issues = [makeIssue({ severity: "warning" })];
        const report = generateSarif(issues);
        expect(report.runs[0].results[0].level).toBe("warning");
    });

    it("将 suggestion 映射为 note 级别", () => {
        const issues = [makeIssue({ severity: "suggestion" })];
        const report = generateSarif(issues);
        expect(report.runs[0].results[0].level).toBe("note");
    });

    it("包含正确的位置信息", () => {
        const issues = [
            makeIssue({ file: "src/pages/Home.tsx", line: 42, column: 8, endLine: 42, endColumn: 20 }),
        ];
        const report = generateSarif(issues);
        const location = report.runs[0].results[0].locations[0].physicalLocation;
        expect(location.artifactLocation.uri).toBe("src/pages/Home.tsx");
        expect(location.artifactLocation.uriBaseId).toBe("PROJECT_ROOT");
        expect(location.region.startLine).toBe(42);
        expect(location.region.startColumn).toBe(8);
        expect(location.region.endLine).toBe(42);
        expect(location.region.endColumn).toBe(20);
    });

    it("包含源代码片段", () => {
        const issues = [makeIssue({ source: "const x = 1;" })];
        const report = generateSarif(issues);
        const region = report.runs[0].results[0].locations[0].physicalLocation.region;
        expect(region.snippet!.text).toBe("const x = 1;");
    });

    it("无源代码片段时不包含 snippet 字段", () => {
        const issues = [makeIssue({ source: undefined })];
        const report = generateSarif(issues);
        const region = report.runs[0].results[0].locations[0].physicalLocation.region;
        expect(region.snippet).toBeUndefined();
    });

    it("包含 fix 信息", () => {
        const issues = [
            makeIssue({
                fix: {
                    text: "const y = 2;",
                    start: { line: 10, column: 5 },
                    end: { line: 10, column: 16 },
                },
            }),
        ];
        const report = generateSarif(issues);
        const fixes = report.runs[0].results[0].fixes!;
        expect(fixes).toHaveLength(1);
        expect(fixes[0].description.text).toBe("Test Issue");
        expect(fixes[0].artifactChanges[0].replacements[0].insertedContent.text).toBe("const y = 2;");
    });

    it("去重生成规则定义", () => {
        const issues = [
            makeIssue({ ruleId: "rule-a", title: "Rule A" }),
            makeIssue({ ruleId: "rule-a", title: "Rule A" }),
            makeIssue({ ruleId: "rule-b", title: "Rule B" }),
        ];
        const report = generateSarif(issues);
        expect(report.runs[0].tool.driver.rules).toHaveLength(2);
        const ruleIds = report.runs[0].tool.driver.rules!.map((r) => r.id);
        expect(ruleIds).toContain("rule-a");
        expect(ruleIds).toContain("rule-b");
    });

    it("ruleIndex 正确映射", () => {
        const issues = [
            makeIssue({ ruleId: "rule-a" }),
            makeIssue({ ruleId: "rule-b" }),
            makeIssue({ ruleId: "rule-a" }),
        ];
        const report = generateSarif(issues);
        const results = report.runs[0].results;
        expect(results[0].ruleIndex).toBeDefined();
        expect(results[1].ruleIndex).toBeDefined();
        // rule-a 应该对应相同的 ruleIndex
        expect(results[0].ruleIndex).toBe(results[2].ruleIndex);
    });

    it("消息包含标题和描述", () => {
        const issues = [makeIssue({ title: "Bad Practice", description: "Don't do this" })];
        const report = generateSarif(issues);
        expect(report.runs[0].results[0].message.text).toBe("Bad Practice: Don't do this");
    });
});

describe("formatSarif", () => {
    it("返回格式化的 JSON 字符串", () => {
        const issues = [makeIssue()];
        const str = formatSarif(issues);
        expect(typeof str).toBe("string");
        const parsed = JSON.parse(str);
        expect(parsed.version).toBe("2.1.0");
        expect(parsed.runs[0].results).toHaveLength(1);
    });

    it("使用 2 空格缩进", () => {
        const str = formatSarif([]);
        expect(str).toContain("{\n  \"$schema\"");
    });
});
