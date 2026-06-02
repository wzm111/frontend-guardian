/**
 * HistoryReport 历史报告测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { HistoryReport } from "../src/utils/history-report.js";
import type { Issue, ScanResult } from "../src/types.js";

const TEST_DIR = resolve(process.cwd(), "test-history-project");

function cleanup() {
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }
}

function makeResult(module: string, counts: { c: number; w: number; s: number }): ScanResult {
    return {
        module,
        total: counts.c + counts.w + counts.s,
        issues: {
            critical: Array.from({ length: counts.c }, (_, i) => ({
                ruleId: `rule-c-${i}`,
                title: "Critical",
                description: "desc",
                severity: "critical",
                file: "a.ts",
                line: i + 1,
                column: 1,
            })),
            warning: Array.from({ length: counts.w }, (_, i) => ({
                ruleId: `rule-w-${i}`,
                title: "Warning",
                description: "desc",
                severity: "warning",
                file: "a.ts",
                line: i + 100,
                column: 1,
            })),
            suggestion: Array.from({ length: counts.s }, (_, i) => ({
                ruleId: `rule-s-${i}`,
                title: "Suggestion",
                description: "desc",
                severity: "suggestion",
                file: "a.ts",
                line: i + 200,
                column: 1,
            })),
        },
        duration: 100,
        filesScanned: 10,
        filesWithIssues: counts.c + counts.w + counts.s > 0 ? 1 : 0,
    };
}

describe("HistoryReport", () => {
    beforeEach(() => {
        cleanup();
        mkdirSync(TEST_DIR, { recursive: true });
    });

    afterEach(() => {
        cleanup();
    });

    it("should record scan results", () => {
        const report = new HistoryReport(TEST_DIR);
        const result = makeResult("i18n", { c: 1, w: 2, s: 0 });
        const issues = [...result.issues.critical, ...result.issues.warning];

        report.record(result, issues);
        const entries = report.getEntries();

        expect(entries).toHaveLength(1);
        expect(entries[0].module).toBe("i18n");
        expect(entries[0].counts.critical).toBe(1);
        expect(entries[0].counts.warning).toBe(2);
        expect(entries[0].signatures).toHaveLength(3);
    });

    it("should detect new issues vs previous scan", () => {
        const report = new HistoryReport(TEST_DIR);

        // 第一次扫描：2 个问题
        const result1 = makeResult("hooks", { c: 0, w: 2, s: 0 });
        const issues1 = [...result1.issues.warning];
        report.record(result1, issues1);

        // 第二次扫描：1 个老问题 + 1 个新问题
        const oldIssue = issues1[0];
        const newIssue: Issue = {
            ...issues1[1],
            ruleId: "new-rule",
            line: 999,
        };
        // 只保留第一个问题作为"已修复"
        const result2 = makeResult("hooks", { c: 0, w: 2, s: 0 });
        const issues2 = [oldIssue, newIssue];
        report.record(result2, issues2);

        const sigs2 = issues2.map((i) => `${i.file}|${i.ruleId}|${i.line}`);
        const analysis = report.analyze("hooks", sigs2);

        expect(analysis.totalScans).toBe(2);
        expect(analysis.newIssues.length).toBe(1);
        expect(analysis.fixedIssues.length).toBe(1);
        expect(analysis.persistentIssues.length).toBe(1);
    });

    it("should persist across instances", () => {
        const report1 = new HistoryReport(TEST_DIR);
        const result = makeResult("security", { c: 1, w: 0, s: 0 });
        report1.record(result, result.issues.critical);

        const report2 = new HistoryReport(TEST_DIR);
        expect(report2.getEntries()).toHaveLength(1);
    });

    it("should limit to 100 entries", () => {
        const report = new HistoryReport(TEST_DIR);
        const result = makeResult("i18n", { c: 0, w: 0, s: 0 });

        for (let i = 0; i < 105; i++) {
            report.record(result, []);
        }

        expect(report.getEntries()).toHaveLength(100);
    });

    it("should clear history", () => {
        const report = new HistoryReport(TEST_DIR);
        const result = makeResult("i18n", { c: 0, w: 1, s: 0 });
        report.record(result, result.issues.warning);
        expect(report.getEntries()).toHaveLength(1);

        report.clear();
        expect(report.getEntries()).toHaveLength(0);
    });
});
