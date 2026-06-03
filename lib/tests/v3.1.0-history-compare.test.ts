/**
 * v3.1.0 测试 — 历史报告对比
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareHistoryReports, formatHistoryCompare, formatHistoryCompareJson } from "@/utils/history-compare.js";
import type { Issue, Severity } from "@/types.js";

describe("v3.1.0 — 历史报告对比", () => {
    let tmpDir: string;
    let historyDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "fg-v31-hc-"));
        historyDir = join(tmpDir, ".frontend-guardian", "history");
        mkdirSync(historyDir, { recursive: true });
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    function createReport(filename: string, issues: Issue[], module: string = "all", timestamp: number = Date.now()) {
        const report = {
            timestamp,
            timestampIso: new Date(timestamp).toISOString(),
            module,
            issues,
            result: {
                module,
                total: issues.length,
                issues: {
                    critical: issues.filter((i) => i.severity === "critical"),
                    warning: issues.filter((i) => i.severity === "warning"),
                    suggestion: issues.filter((i) => i.severity === "suggestion"),
                },
                duration: 100,
                filesScanned: 10,
                filesWithIssues: new Set(issues.map((i) => i.file)).size,
            },
        };
        writeFileSync(join(historyDir, filename), JSON.stringify(report, null, 2), "utf-8");
    }

    function makeIssue(ruleId: string, file: string, line: number, severity: Severity = "warning"): Issue {
        return {
            ruleId,
            title: `Test ${ruleId}`,
            description: "Test issue",
            severity,
            file,
            line,
            column: 1,
        };
    }

    it("无历史报告时应返回 null", () => {
        const result = compareHistoryReports({ projectDir: tmpDir });
        expect(result).toBeNull();
    });

    it("只有一份报告时应返回 null（无法对比）", () => {
        createReport("20250601-120000.json", [makeIssue("rule-a", "a.js", 1)]);
        const result = compareHistoryReports({ projectDir: tmpDir });
        expect(result).toBeNull();
    });

    it("应正确识别新增问题", () => {
        createReport("20250601-120000.json", [
            makeIssue("rule-a", "a.js", 1),
            makeIssue("rule-b", "b.js", 2),
        ]);
        createReport("20250601-130000.json", [
            makeIssue("rule-a", "a.js", 1),
            makeIssue("rule-b", "b.js", 2),
            makeIssue("rule-c", "c.js", 3),
        ]);

        const result = compareHistoryReports({ projectDir: tmpDir });
        expect(result).not.toBeNull();
        expect(result!.summary.new).toBe(1);
        expect(result!.newIssues[0].issue.ruleId).toBe("rule-c");
        expect(result!.summary.fixed).toBe(0);
        expect(result!.summary.persistent).toBe(2);
    });

    it("应正确识别已修复问题", () => {
        createReport("20250601-120000.json", [
            makeIssue("rule-a", "a.js", 1),
            makeIssue("rule-b", "b.js", 2),
        ]);
        createReport("20250601-130000.json", [
            makeIssue("rule-a", "a.js", 1),
        ]);

        const result = compareHistoryReports({ projectDir: tmpDir });
        expect(result).not.toBeNull();
        expect(result!.summary.fixed).toBe(1);
        expect(result!.fixedIssues[0].issue.ruleId).toBe("rule-b");
        expect(result!.summary.new).toBe(0);
        expect(result!.summary.persistent).toBe(1);
    });

    it("应正确识别严重级别变化的问题", () => {
        createReport("20250601-120000.json", [
            makeIssue("rule-a", "a.js", 1, "warning"),
        ]);
        createReport("20250601-130000.json", [
            makeIssue("rule-a", "a.js", 1, "critical"),
        ]);

        const result = compareHistoryReports({ projectDir: tmpDir });
        expect(result).not.toBeNull();
        expect(result!.summary.changed).toBe(1);
        expect(result!.changedIssues[0].previousSeverity).toBe("warning");
        expect(result!.changedIssues[0].issue.severity).toBe("critical");
        expect(result!.summary.persistent).toBe(0);
    });

    it("应支持指定报告文件名对比", () => {
        createReport("20250601-100000.json", [
            makeIssue("rule-a", "a.js", 1),
        ]);
        createReport("20250601-120000.json", [
            makeIssue("rule-a", "a.js", 1),
            makeIssue("rule-b", "b.js", 2),
        ]);
        createReport("20250601-130000.json", [
            makeIssue("rule-a", "a.js", 1),
            makeIssue("rule-b", "b.js", 2),
            makeIssue("rule-c", "c.js", 3),
        ]);

        // 指定 current 为中间报告，previous 为最早报告
        const result = compareHistoryReports({
            projectDir: tmpDir,
            current: "20250601-120000.json",
            previous: "20250601-100000.json",
        });
        expect(result).not.toBeNull();
        expect(result!.summary.new).toBe(1); // rule-b
        expect(result!.summary.fixed).toBe(0);
    });

    it("应支持前缀匹配报告文件名", () => {
        createReport("20250601-100000.json", [makeIssue("rule-a", "a.js", 1)]);
        createReport("20250601-120000.json", [makeIssue("rule-a", "a.js", 1), makeIssue("rule-b", "b.js", 2)]);

        const result = compareHistoryReports({
            projectDir: tmpDir,
            current: "20250601-10",
        });
        expect(result).not.toBeNull();
        // current = 20250601-10 匹配最早报告，previous = 最新报告(120000)
        expect(result!.currentReport.filename).toBe("20250601-100000.json");
    });

    it("formatHistoryCompare 应生成终端友好的输出", () => {
        createReport("20250601-120000.json", [
            makeIssue("rule-a", "a.js", 1, "warning"),
        ]);
        createReport("20250601-130000.json", [
            makeIssue("rule-a", "a.js", 1, "warning"),
            makeIssue("rule-b", "b.js", 2, "critical"),
        ]);

        const result = compareHistoryReports({ projectDir: tmpDir })!;
        const output = formatHistoryCompare(result);
        expect(output).toContain("历史报告对比");
        expect(output).toContain("新增问题");
        expect(output).toContain("rule-b");
        expect(output).toContain("持续存在的问题");
    });

    it("formatHistoryCompareJson 应生成结构化 JSON", () => {
        createReport("20250601-120000.json", [makeIssue("rule-a", "a.js", 1)]);
        createReport("20250601-130000.json", [
            makeIssue("rule-a", "a.js", 1),
            makeIssue("rule-b", "b.js", 2),
        ]);

        const result = compareHistoryReports({ projectDir: tmpDir })!;
        const json = formatHistoryCompareJson(result);
        expect(json).toHaveProperty("currentReport");
        expect(json).toHaveProperty("previousReport");
        expect(json).toHaveProperty("summary");
        expect(json).toHaveProperty("newIssues");
        expect(json).toHaveProperty("fixedIssues");
        expect(json).toHaveProperty("persistentIssues");
        expect(Array.isArray((json as any).newIssues)).toBe(true);
    });

    it("应按 severity 排序", () => {
        createReport("20250601-120000.json", []);
        createReport("20250601-130000.json", [
            makeIssue("rule-c", "c.js", 3, "suggestion"),
            makeIssue("rule-a", "a.js", 1, "critical"),
            makeIssue("rule-b", "b.js", 2, "warning"),
        ]);

        const result = compareHistoryReports({ projectDir: tmpDir })!;
        expect(result.newIssues[0].issue.severity).toBe("critical");
        expect(result.newIssues[1].issue.severity).toBe("warning");
        expect(result.newIssues[2].issue.severity).toBe("suggestion");
    });
});
