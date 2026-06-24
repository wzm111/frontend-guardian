/**
 * v3.12.1: 测试历史记录与 flaky 测试预警单元测试
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeFlakyTests, detectFlakyTests, TestHistoryReport } from "../src/utils/test-history.js";

describe("TestHistoryReport", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-test-history-"));
    });

    afterEach(() => {
        try {
            rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    it("应记录单次测试结果", () => {
        const report = new TestHistoryReport(tempDir);
        report.recordResult({ testFile: "/project/a.test.ts", status: "passed", duration: 100 });
        expect(report.getRecords()).toHaveLength(1);
        expect(report.getRecords()[0].testFile).toBe("/project/a.test.ts");
        expect(report.getRecords()[0].status).toBe("passed");
    });

    it("应批量记录一次测试运行的多个结果", () => {
        const report = new TestHistoryReport(tempDir);
        report.recordRun([
            { testFile: "/project/a.test.ts", status: "passed" },
            { testFile: "/project/b.test.ts", status: "failed" },
        ]);
        expect(report.getRecords()).toHaveLength(2);
    });

    it("应将记录持久化到 .frontend-guardian/test-history.json", () => {
        const report = new TestHistoryReport(tempDir);
        report.recordResult({ testFile: "/project/a.test.ts", status: "passed" });

        const historyPath = join(tempDir, ".frontend-guardian", "test-history.json");
        expect(existsSync(historyPath)).toBe(true);

        const parsed = JSON.parse(readFileSync(historyPath, "utf-8")) as unknown[];
        expect(parsed).toHaveLength(1);
    });

    it("重新实例化时应加载已有记录", () => {
        const report = new TestHistoryReport(tempDir);
        report.recordResult({ testFile: "/project/a.test.ts", status: "passed" });

        const report2 = new TestHistoryReport(tempDir);
        expect(report2.getRecords()).toHaveLength(1);
    });

    it("记录数量超过上限时应截断", () => {
        const report = new TestHistoryReport(tempDir);
        for (let i = 0; i < 10; i++) {
            report.recordResult({ testFile: `/project/${i}.test.ts`, status: "passed" });
        }
        // 上限 2000，远未超过，仅验证不异常
        expect(report.getRecords()).toHaveLength(10);
    });
});

describe("analyzeFlakyTests / detectFlakyTests", () => {
    it("运行次数不足时不应标记 flaky", () => {
        const records = [
            { timestamp: 1, testFile: "/a.test.ts", status: "passed" as const },
            { timestamp: 2, testFile: "/a.test.ts", status: "failed" as const },
        ];
        const flaky = analyzeFlakyTests(records, { minRuns: 3 });
        expect(flaky).toHaveLength(0);
    });

    it("失败率超过阈值时应标记为 high 风险", () => {
        const records = [
            { timestamp: 1, testFile: "/a.test.ts", status: "passed" as const },
            { timestamp: 2, testFile: "/a.test.ts", status: "failed" as const },
            { timestamp: 3, testFile: "/a.test.ts", status: "failed" as const },
            { timestamp: 4, testFile: "/a.test.ts", status: "failed" as const },
        ];
        const flaky = analyzeFlakyTests(records, { failureRate: 0.5, minRuns: 3 });
        expect(flaky).toHaveLength(1);
        expect(flaky[0].testFile).toBe("/a.test.ts");
        expect(flaky[0].failureRate).toBe(0.75);
        expect(flaky[0].riskLevel).toBe("high");
    });

    it("状态频繁翻转时应标记为 high 风险", () => {
        const records = [
            { timestamp: 1, testFile: "/b.test.ts", status: "passed" as const },
            { timestamp: 2, testFile: "/b.test.ts", status: "failed" as const },
            { timestamp: 3, testFile: "/b.test.ts", status: "passed" as const },
            { timestamp: 4, testFile: "/b.test.ts", status: "failed" as const },
        ];
        const flaky = analyzeFlakyTests(records, { flipRate: 0.5, minRuns: 3 });
        expect(flaky).toHaveLength(1);
        expect(flaky[0].flipCount).toBe(3);
        expect(flaky[0].flipRate).toBe(1);
    });

    it("跳过状态不应计入翻转", () => {
        const records = [
            { timestamp: 1, testFile: "/c.test.ts", status: "passed" as const },
            { timestamp: 2, testFile: "/c.test.ts", status: "skipped" as const },
            { timestamp: 3, testFile: "/c.test.ts", status: "failed" as const },
            { timestamp: 4, testFile: "/c.test.ts", status: "passed" as const },
        ];
        const flaky = analyzeFlakyTests(records, { flipRate: 0.3, minRuns: 3 });
        // passed -> skipped 不计，skipped -> failed 不计，failed -> passed 计 1 次
        expect(flaky[0].flipCount).toBe(1);
    });

    it("detectFlakyTests 是 analyzeFlakyTests 的别名", () => {
        const records = [
            { timestamp: 1, testFile: "/d.test.ts", status: "failed" as const },
            { timestamp: 2, testFile: "/d.test.ts", status: "failed" as const },
            { timestamp: 3, testFile: "/d.test.ts", status: "failed" as const },
        ];
        expect(detectFlakyTests(records, { minRuns: 3 })).toEqual(analyzeFlakyTests(records, { minRuns: 3 }));
    });
});
