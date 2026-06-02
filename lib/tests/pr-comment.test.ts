/**
 * PR/MR 评论 Markdown 生成器测试
 * v2.5.0
 */

import { describe, it, expect } from "vitest";
import {
    generatePRComment,
    generatePRCommentSummary,
    COMMENT_MARKER,
    isGuardianComment,
} from "@/formatters/pr-comment.js";
import type { Issue, ScanResult } from "@/types.js";

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

function makeScanResult(issues: Issue[] = []): ScanResult {
    return {
        module: "i18n",
        total: issues.length,
        issues: {
            critical: issues.filter((i) => i.severity === "critical"),
            warning: issues.filter((i) => i.severity === "warning"),
            suggestion: issues.filter((i) => i.severity === "suggestion"),
        },
        duration: 120,
        filesScanned: 42,
        filesWithIssues: new Set(issues.map((i) => i.file)).size,
    };
}

describe("generatePRComment", () => {
    it("包含隐藏标记", () => {
        const result = makeScanResult([]);
        const md = generatePRComment({ i18n: result }, { timestamp: "2026-06-02T00:00:00Z", duration: 100, filesScanned: 10 });
        expect(md).toContain(COMMENT_MARKER);
    });

    it("空结果显示汇总为 0", () => {
        const result = makeScanResult([]);
        const md = generatePRComment({ i18n: result }, { timestamp: "2026-06-02T00:00:00Z", duration: 100, filesScanned: 10 });
        expect(md).toContain("| **总计** | **0** |");
        expect(md).toContain("100ms");
        expect(md).toContain("10");
    });

    it("包含 commit SHA", () => {
        const result = makeScanResult([]);
        const md = generatePRComment(
            { i18n: result },
            { timestamp: "2026-06-02T00:00:00Z", commitSha: "abc123", duration: 100, filesScanned: 10 }
        );
        expect(md).toContain("abc123");
    });

    it("按严重级别统计正确", () => {
        const issues = [
            makeIssue({ severity: "critical", ruleId: "r1" }),
            makeIssue({ severity: "critical", ruleId: "r2" }),
            makeIssue({ severity: "warning", ruleId: "r3" }),
            makeIssue({ severity: "suggestion", ruleId: "r4" }),
        ];
        const result = makeScanResult(issues);
        const md = generatePRComment({ i18n: result }, { timestamp: "2026-06-02T00:00:00Z", duration: 100, filesScanned: 10 });
        expect(md).toContain("| 🔴 Critical | 2 |");
        expect(md).toContain("| 🟡 Warning | 1 |");
        expect(md).toContain("| 💡 Suggestion | 1 |");
        expect(md).toContain("| **总计** | **4** |");
    });

    it("多个模块分别展开", () => {
        const i18nResult = makeScanResult([makeIssue({ severity: "warning", ruleId: "i18n-1" })]);
        i18nResult.module = "i18n";
        const perfResult = makeScanResult([makeIssue({ severity: "critical", ruleId: "perf-1" })]);
        perfResult.module = "performance";

        const md = generatePRComment(
            { i18n: i18nResult, performance: perfResult },
            { timestamp: "2026-06-02T00:00:00Z", duration: 200, filesScanned: 50 }
        );
        expect(md).toContain("📦 i18n");
        expect(md).toContain("📦 performance");
        expect(md).toContain("| **总计** | **2** |");
    });

    it("空模块不显示", () => {
        const result = makeScanResult([]);
        const md = generatePRComment({ i18n: result }, { timestamp: "2026-06-02T00:00:00Z", duration: 100, filesScanned: 10 });
        expect(md).not.toContain("📦 i18n");
    });

    it("包含 issue 详情和 docsUrl", () => {
        const issues = [
            makeIssue({
                severity: "critical",
                ruleId: "sec-xss",
                title: "危险的 innerHTML",
                description: "存在 XSS 风险",
                file: "src/pages/Home.tsx",
                line: 42,
                source: 'element.innerHTML = userInput',
                docsUrl: "https://example.com/rules/sec-xss",
            }),
        ];
        const result = makeScanResult(issues);
        const md = generatePRComment({ security: result }, { timestamp: "2026-06-02T00:00:00Z", duration: 100, filesScanned: 10 });
        expect(md).toContain("危险的 innerHTML");
        expect(md).toContain("`[sec-xss]`");
        expect(md).toContain("src/pages/Home.tsx:42");
        expect(md).toContain("存在 XSS 风险");
        expect(md).toContain("element.innerHTML = userInput");
        expect(md).toContain("[查看规则说明](https://example.com/rules/sec-xss)");
    });

    it("修复结果汇总", () => {
        const result = makeScanResult([]);
        const md = generatePRComment(
            { i18n: result },
            { timestamp: "2026-06-02T00:00:00Z", duration: 100, filesScanned: 10 },
            { fixResult: { fixedCount: 3, filesModified: ["a.ts", "b.ts"] } }
        );
        expect(md).toContain("已自动修复 **3** 个问题");
        expect(md).toContain("2 个文件");
    });

    it("外部工具结果展开", () => {
        const result = makeScanResult([]);
        const md = generatePRComment(
            { i18n: result },
            { timestamp: "2026-06-02T00:00:00Z", duration: 100, filesScanned: 10 },
            {
                external: [
                    {
                        tool: "ESLint",
                        issues: [makeIssue({ severity: "warning", ruleId: "eslint/no-unused" })],
                    },
                ],
            }
        );
        expect(md).toContain("🔌 ESLint");
    });

    it("issue 超过 20 条时截断提示", () => {
        const issues = Array.from({ length: 25 }, (_, i) =>
            makeIssue({ severity: "warning", ruleId: `rule-${i}`, line: i + 1 })
        );
        const result = makeScanResult(issues);
        const md = generatePRComment({ i18n: result }, { timestamp: "2026-06-02T00:00:00Z", duration: 100, filesScanned: 10 });
        expect(md).toContain("还有 5 个问题未展示");
    });
});

describe("generatePRCommentSummary", () => {
    it("生成简短摘要", () => {
        const md = generatePRCommentSummary(5, 1, 3, 1, {
            timestamp: "2026-06-02T00:00:00Z",
            duration: 200,
            filesScanned: 30,
        });
        expect(md).toContain(COMMENT_MARKER);
        expect(md).toContain("| 🔴 Critical | 1 |");
        expect(md).toContain("| 🟡 Warning | 3 |");
        expect(md).toContain("| 💡 Suggestion | 1 |");
        expect(md).toContain("200ms");
        expect(md).toContain("30 files scanned");
    });
});

describe("isGuardianComment", () => {
    it("识别 guardian 评论", () => {
        expect(isGuardianComment("some text\n" + COMMENT_MARKER + "\nmore")).toBe(true);
    });

    it("拒绝非 guardian 评论", () => {
        expect(isGuardianComment("这是一段普通评论")).toBe(false);
        expect(isGuardianComment("")).toBe(false);
    });
});
