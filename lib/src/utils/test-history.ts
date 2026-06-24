/**
 * v3.12.1: 测试历史记录与 flaky 测试预警
 *
 * 记录每次测试运行的结果，基于历史数据计算失败率与状态翻转率，
 * 标记高 flakiness 风险的测试，供 `--recommend-tests` 输出预警。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/** 单次测试运行记录 */
export interface TestRunRecord {
    /** 记录时间戳 */
    timestamp: number;
    /** 测试文件绝对路径 */
    testFile: string;
    /** 运行结果 */
    status: "passed" | "failed" | "skipped";
    /** 运行耗时 ms（可选） */
    duration?: number;
}

/** flaky 检测结果 */
export interface FlakyTestInfo {
    /** 测试文件绝对路径 */
    testFile: string;
    /** 总运行次数 */
    totalRuns: number;
    /** 通过次数 */
    passCount: number;
    /** 失败次数 */
    failCount: number;
    /** 跳过次数 */
    skipCount: number;
    /** 失败率 0-1 */
    failureRate: number;
    /** 相邻运行状态翻转次数 */
    flipCount: number;
    /** 翻转率 0-1 */
    flipRate: number;
    /** 风险等级 */
    riskLevel: "high" | "medium" | "low";
}

/** flaky 检测阈值 */
export interface FlakyTestThresholds {
    /** 失败率阈值，默认 0.2 */
    failureRate?: number;
    /** 状态翻转率阈值，默认 0.15 */
    flipRate?: number;
    /** 最少运行次数才参与计算，默认 3 */
    minRuns?: number;
}

const DEFAULT_THRESHOLDS: Required<FlakyTestThresholds> = {
    failureRate: 0.2,
    flipRate: 0.15,
    minRuns: 3,
};

const MAX_RECORDS = 2000;

/** 测试历史记录管理 */
export class TestHistoryReport {
    private historyDir: string;
    private historyFile: string;
    private records: TestRunRecord[];

    constructor(projectDir: string) {
        this.historyDir = resolve(projectDir, ".frontend-guardian");
        this.historyFile = resolve(this.historyDir, "test-history.json");
        this.records = this.loadRecords();
    }

    /** 记录单次测试结果 */
    recordResult(record: Omit<TestRunRecord, "timestamp">): void {
        this.records.push({
            ...record,
            timestamp: Date.now(),
        });
        this.trim();
        this.save();
    }

    /** 批量记录一次测试运行的多个结果 */
    recordRun(results: Omit<TestRunRecord, "timestamp">[]): void {
        const now = Date.now();
        for (const r of results) {
            this.records.push({ ...r, timestamp: now });
        }
        this.trim();
        this.save();
    }

    /** 获取所有原始记录 */
    getRecords(): TestRunRecord[] {
        return [...this.records];
    }

    /** 清空历史 */
    clear(): void {
        this.records = [];
        this.save();
    }

    /**
     * 检测 flaky 测试
     * @param thresholds 阈值配置
     */
    detectFlakyTests(thresholds?: FlakyTestThresholds): FlakyTestInfo[] {
        return analyzeFlakyTests(this.records, thresholds);
    }

    private trim(): void {
        if (this.records.length > MAX_RECORDS) {
            this.records = this.records.slice(-MAX_RECORDS);
        }
    }

    private loadRecords(): TestRunRecord[] {
        try {
            if (existsSync(this.historyFile)) {
                const raw = readFileSync(this.historyFile, "utf-8");
                const parsed = JSON.parse(raw) as TestRunRecord[];
                if (Array.isArray(parsed)) return parsed;
            }
        } catch {
            // 读取失败视为无历史
        }
        return [];
    }

    private save(): void {
        try {
            if (!existsSync(this.historyDir)) {
                mkdirSync(this.historyDir, { recursive: true });
            }
            writeFileSync(this.historyFile, JSON.stringify(this.records, null, 2), "utf-8");
        } catch {
            // 静默失败，避免影响主流程
        }
    }
}

/** 从记录中检测 flaky 测试 */
export function analyzeFlakyTests(records: TestRunRecord[], thresholds?: FlakyTestThresholds): FlakyTestInfo[] {
    const opts = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const byFile = new Map<string, TestRunRecord[]>();

    for (const record of records) {
        if (!record.testFile) continue;
        const list = byFile.get(record.testFile);
        if (list) {
            list.push(record);
        } else {
            byFile.set(record.testFile, [record]);
        }
    }

    const flaky: FlakyTestInfo[] = [];

    for (const [testFile, fileRecords] of byFile) {
        // 按时间排序，用于计算翻转
        const sorted = [...fileRecords].sort((a, b) => a.timestamp - b.timestamp);
        const totalRuns = sorted.length;
        if (totalRuns < opts.minRuns) continue;

        const passCount = sorted.filter((r) => r.status === "passed").length;
        const failCount = sorted.filter((r) => r.status === "failed").length;
        const skipCount = sorted.filter((r) => r.status === "skipped").length;

        const failureRate = failCount / totalRuns;

        let flipCount = 0;
        for (let i = 1; i < sorted.length; i++) {
            if (
                sorted[i].status !== sorted[i - 1].status &&
                sorted[i].status !== "skipped" &&
                sorted[i - 1].status !== "skipped"
            ) {
                flipCount++;
            }
        }
        // 翻转率基于相邻非跳过运行对数
        const nonSkipPairs = totalRuns - skipCount - 1;
        const flipRate = nonSkipPairs > 0 ? flipCount / nonSkipPairs : 0;

        let riskLevel: FlakyTestInfo["riskLevel"] = "low";
        if (failureRate >= opts.failureRate || flipRate >= opts.flipRate) {
            riskLevel = "high";
        } else if (failureRate >= opts.failureRate / 2 || flipRate >= opts.flipRate / 2) {
            riskLevel = "medium";
        }

        if (riskLevel === "high") {
            flaky.push({
                testFile,
                totalRuns,
                passCount,
                failCount,
                skipCount,
                failureRate,
                flipCount,
                flipRate,
                riskLevel,
            });
        }
    }

    // 按失败率降序、翻转率降序排列
    return flaky.sort((a, b) => {
        const rateDiff = b.failureRate - a.failureRate;
        if (rateDiff !== 0) return rateDiff;
        return b.flipRate - a.flipRate;
    });
}

/** 独立工具函数：从记录中检测 flaky 测试（兼容旧命名） */
export function detectFlakyTests(records: TestRunRecord[], thresholds?: FlakyTestThresholds): FlakyTestInfo[] {
    return analyzeFlakyTests(records, thresholds);
}
