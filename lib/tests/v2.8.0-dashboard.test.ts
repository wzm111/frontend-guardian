/**
 * v2.8.0 测试 — 数据洞察与可视化
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HistoryReport } from "@/utils/history-report.js";
import { generateDashboard } from "@/utils/dashboard.js";
import type { ScanResult, Issue } from "@/types.js";

describe("v2.8.0 — 扫描结果持久化", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "fg-v28-"));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it("saveFullReport 应保存完整报告到 history/ 目录", () => {
        const hr = new HistoryReport(tmpDir);
        const result: ScanResult = {
            module: "i18n",
            total: 3,
            issues: {
                critical: [{ ruleId: "r1", title: "T1", description: "D1", severity: "critical", file: "a.js", line: 1, column: 1 }],
                warning: [{ ruleId: "r2", title: "T2", description: "D2", severity: "warning", file: "a.js", line: 2, column: 1 }],
                suggestion: [{ ruleId: "r3", title: "T3", description: "D3", severity: "suggestion", file: "a.js", line: 3, column: 1 }],
            },
            duration: 100,
            filesScanned: 5,
            filesWithIssues: 2,
        };
        const allIssues: Issue[] = [...result.issues.critical, ...result.issues.warning, ...result.issues.suggestion];
        const filename = hr.saveFullReport(result, allIssues);

        expect(filename).toMatch(/^\d{8}-\d{6}\.json$/);
        const reportPath = join(tmpDir, ".frontend-guardian", "history", filename);
        expect(existsSync(reportPath)).toBe(true);

        const raw = readFileSync(reportPath, "utf-8");
        const parsed = JSON.parse(raw);
        expect(parsed.module).toBe("i18n");
        expect(parsed.issues).toHaveLength(3);
        expect(parsed.result.total).toBe(3);
    });

    it("listReports 应列出所有历史报告", () => {
        const hr = new HistoryReport(tmpDir);
        const result: ScanResult = {
            module: "i18n",
            total: 1,
            issues: { critical: [], warning: [], suggestion: [{ ruleId: "r1", title: "T1", description: "D1", severity: "suggestion", file: "a.js", line: 1, column: 1 }] },
            duration: 50,
            filesScanned: 1,
            filesWithIssues: 1,
        };
        hr.saveFullReport(result, result.issues.suggestion);

        const list = hr.listReports();
        expect(list.length).toBeGreaterThanOrEqual(1);
        expect(list[0].module).toBe("i18n");
        expect(list[0].counts.suggestion).toBe(1);
    });

    it("loadReport 应加载指定报告", () => {
        const hr = new HistoryReport(tmpDir);
        const result: ScanResult = {
            module: "security",
            total: 2,
            issues: {
                critical: [{ ruleId: "s1", title: "S1", description: "D1", severity: "critical", file: "b.js", line: 1, column: 1 }],
                warning: [],
                suggestion: [],
            },
            duration: 200,
            filesScanned: 10,
            filesWithIssues: 1,
        };
        const filename = hr.saveFullReport(result, result.issues.critical);
        const loaded = hr.loadReport(filename);

        expect(loaded).not.toBeNull();
        expect(loaded!.module).toBe("security");
        expect(loaded!.issues).toHaveLength(1);
    });
});

describe("v2.8.0 — 趋势看板", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "fg-v28-dash-"));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it("generateDashboard 应生成 HTML 文件", () => {
        const reports = [
            {
                timestamp: Date.now() - 86400000,
                timestampIso: new Date(Date.now() - 86400000).toISOString(),
                module: "i18n",
                issues: [],
                result: {
                    module: "i18n",
                    total: 5,
                    issues: { critical: [], warning: [{ ruleId: "w1", title: "W1", description: "D", severity: "warning", file: "a.js", line: 1, column: 1 }], suggestion: [] },
                    duration: 100,
                    filesScanned: 10,
                    filesWithIssues: 1,
                },
                git: undefined,
            },
            {
                timestamp: Date.now(),
                timestampIso: new Date().toISOString(),
                module: "i18n",
                issues: [],
                result: {
                    module: "i18n",
                    total: 3,
                    issues: { critical: [], warning: [{ ruleId: "w1", title: "W1", description: "D", severity: "warning", file: "a.js", line: 1, column: 1 }], suggestion: [] },
                    duration: 120,
                    filesScanned: 10,
                    filesWithIssues: 1,
                },
                git: undefined,
            },
        ];

        const outputPath = join(tmpDir, "dashboard.html");
        const result = generateDashboard(reports as any, { projectDir: tmpDir, outputPath });

        expect(result).toBe(outputPath);
        expect(existsSync(outputPath)).toBe(true);

        const html = readFileSync(outputPath, "utf-8");
        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("趋势看板");
        expect(html).toContain("<canvas");
        expect(html).toContain("<script>");
    });

    it("空报告应返回空字符串", () => {
        const result = generateDashboard([], { projectDir: tmpDir });
        expect(result).toBe("");
    });
});
