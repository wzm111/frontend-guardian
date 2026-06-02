import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
    formatIssueAnnotation,
    formatIssuesAnnotations,
    formatAllAnnotations,
    isGitHubActions,
    writeJobSummary,
} from "@/formatters/github-annotation.js";
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

describe("formatIssueAnnotation", () => {
    it("格式化 basic annotation", () => {
        const issue = makeIssue();
        const annotation = formatIssueAnnotation(issue);
        expect(annotation).toContain("::warning");
        expect(annotation).toContain("file=src/app.tsx");
        expect(annotation).toContain("line=10");
        expect(annotation).toContain("col=5");
        expect(annotation).toContain("Test Issue (test-rule) - A test issue");
    });

    it("critical 映射为 error", () => {
        const issue = makeIssue({ severity: "critical" });
        expect(formatIssueAnnotation(issue)).toContain("::error");
    });

    it("warning 映射为 warning", () => {
        const issue = makeIssue({ severity: "warning" });
        expect(formatIssueAnnotation(issue)).toContain("::warning");
    });

    it("suggestion 映射为 notice", () => {
        const issue = makeIssue({ severity: "suggestion" });
        expect(formatIssueAnnotation(issue)).toContain("::notice");
    });

    it("包含 endLine", () => {
        const issue = makeIssue({ endLine: 15 });
        const annotation = formatIssueAnnotation(issue);
        expect(annotation).toContain("endLine=15");
    });

    it("不包含等于 startLine 的 endLine", () => {
        const issue = makeIssue({ line: 10, endLine: 10 });
        const annotation = formatIssueAnnotation(issue);
        expect(annotation).not.toContain("endLine");
    });

    it("特殊字符转义", () => {
        const issue = makeIssue({
            file: "src/app:test.tsx",
            description: "line1\nline2%100",
        });
        const annotation = formatIssueAnnotation(issue);
        // 属性中的冒号应被转义
        expect(annotation).toContain("file=src/app%3Atest.tsx");
        // 数据中的换行和百分号应被转义
        expect(annotation).toContain("line1%0Aline2%25100");
    });
});

describe("formatIssuesAnnotations", () => {
    it("返回多条 annotation", () => {
        const issues = [makeIssue({ line: 1 }), makeIssue({ line: 2 })];
        const annotations = formatIssuesAnnotations(issues);
        expect(annotations).toHaveLength(2);
        expect(annotations[0]).toContain("line=1");
        expect(annotations[1]).toContain("line=2");
    });
});

describe("formatAllAnnotations", () => {
    it("返回带换行的字符串", () => {
        const issues = [makeIssue(), makeIssue()];
        const str = formatAllAnnotations(issues);
        expect(str.split("\n")).toHaveLength(3); // 2 条 + 末尾空行
    });
});

describe("isGitHubActions", () => {
    const originalEnv = process.env.GITHUB_ACTIONS;

    beforeEach(() => {
        delete process.env.GITHUB_ACTIONS;
    });

    afterEach(() => {
        if (originalEnv !== undefined) {
            process.env.GITHUB_ACTIONS = originalEnv;
        } else {
            delete process.env.GITHUB_ACTIONS;
        }
    });

    it("GITHUB_ACTIONS=true 时返回 true", () => {
        process.env.GITHUB_ACTIONS = "true";
        expect(isGitHubActions()).toBe(true);
    });

    it("无环境变量时返回 false", () => {
        expect(isGitHubActions()).toBe(false);
    });

    it("GITHUB_ACTIONS=其他值时返回 false", () => {
        process.env.GITHUB_ACTIONS = "1";
        expect(isGitHubActions()).toBe(false);
    });
});

describe("writeJobSummary", () => {
    const originalFile = process.env.GITHUB_STEP_SUMMARY;

    afterEach(() => {
        if (originalFile !== undefined) {
            process.env.GITHUB_STEP_SUMMARY = originalFile;
        } else {
            delete process.env.GITHUB_STEP_SUMMARY;
        }
    });

    it("无 GITHUB_STEP_SUMMARY 时静默返回", () => {
        delete process.env.GITHUB_STEP_SUMMARY;
        expect(() =>
            writeJobSummary([makeIssue({ severity: "critical" })], { totalFilesScanned: 10, duration: 100 })
        ).not.toThrow();
    });

    it("写入 Markdown 汇总", () => {
        const tmpFile = "/tmp/test-summary-" + Date.now() + ".md";
        process.env.GITHUB_STEP_SUMMARY = tmpFile;
        const issues = [
            makeIssue({ severity: "critical" }),
            makeIssue({ severity: "warning" }),
            makeIssue({ severity: "suggestion" }),
        ];
        writeJobSummary(issues, { totalFilesScanned: 10, duration: 100 });
        const { readFileSync } = require("node:fs");
        const content = readFileSync(tmpFile, "utf-8");
        expect(content).toContain("Frontend Guardian 扫描结果");
        expect(content).toContain("1"); // critical count
        expect(content).toContain("10"); // files scanned
        // cleanup
        require("node:fs").unlinkSync(tmpFile);
    });
});
