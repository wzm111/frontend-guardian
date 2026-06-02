/**
 * History Report — 扫描历史记录与趋势分析
 *
 * 功能：
 * 1. 每次扫描后自动记录结果
 * 2. 对比历史数据，高亮新问题 / 已修复问题
 * 3. 生成趋势图表数据（JSON）
 * 4. 团队治理追踪
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Issue, ScanResult } from "../types.js";

export interface HistoryEntry {
    /** 扫描时间戳 */
    timestamp: number;
    /** 扫描模块 */
    module: string;
    /** 各严重级别问题数 */
    counts: { critical: number; warning: number; suggestion: number };
    /** 问题签名列表（用于对比） */
    signatures: string[];
    /** 扫描文件数 */
    filesScanned: number;
    /** 扫描耗时 ms */
    duration: number;
    /** 提交 hash（如果有） */
    commit?: string;
    /** 分支 */
    branch?: string;
}

export interface TrendAnalysis {
    /** 总扫描次数 */
    totalScans: number;
    /** 最新扫描时间 */
    lastScan: number;
    /** 趋势：各严重级别问题数变化 */
    trend: Array<{
        timestamp: number;
        critical: number;
        warning: number;
        suggestion: number;
    }>;
    /** 新问题（本次 vs 上次） */
    newIssues: string[];
    /** 已修复问题（上次存在本次不存在） */
    fixedIssues: string[];
    /** 持续存在的问题 */
    persistentIssues: string[];
}

/** 问题签名：file|ruleId|line 的哈希，用于跨扫描对比 */
function issueSignature(issue: Issue): string {
    return `${issue.file}|${issue.ruleId}|${issue.line}`;
}

export class HistoryReport {
    private historyDir: string;
    private historyFile: string;
    private entries: HistoryEntry[];

    constructor(projectDir: string) {
        this.historyDir = resolve(projectDir, ".frontend-guardian");
        this.historyFile = resolve(this.historyDir, "history.json");
        this.entries = this.loadEntries();
    }

    /**
     * 记录一次扫描结果
     */
    record(result: ScanResult, allIssues: Issue[]): void {
        const signatures = allIssues.map(issueSignature);

        const entry: HistoryEntry = {
            timestamp: Date.now(),
            module: result.module,
            counts: {
                critical: result.issues.critical.length,
                warning: result.issues.warning.length,
                suggestion: result.issues.suggestion.length,
            },
            signatures,
            filesScanned: result.filesScanned,
            duration: result.duration,
        };

        // 尝试获取 git 信息
        try {
            const { execSync } = require("node:child_process");
            entry.commit = execSync("git rev-parse --short HEAD", {
                cwd: this.historyDir.replace("/.frontend-guardian", ""),
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "ignore"],
            }).trim();
            entry.branch = execSync("git branch --show-current", {
                cwd: this.historyDir.replace("/.frontend-guardian", ""),
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "ignore"],
            }).trim();
        } catch {
            // 非 git 项目，忽略
        }

        this.entries.push(entry);

        // 只保留最近 100 条记录
        if (this.entries.length > 100) {
            this.entries = this.entries.slice(-100);
        }

        this.save();
    }

    /**
     * 分析趋势：对比本次与上一次同模块扫描
     */
    analyze(module: string, currentSignatures: string[]): TrendAnalysis {
        const moduleEntries = this.entries.filter((e) => e.module === module);
        const totalScans = moduleEntries.length;

        if (totalScans < 2) {
            return {
                totalScans,
                lastScan: moduleEntries[moduleEntries.length - 1]?.timestamp || Date.now(),
                trend: moduleEntries.map((e) => ({
                    timestamp: e.timestamp,
                    critical: e.counts.critical,
                    warning: e.counts.warning,
                    suggestion: e.counts.suggestion,
                })),
                newIssues: [],
                fixedIssues: [],
                persistentIssues: currentSignatures,
            };
        }

        const previous = moduleEntries[moduleEntries.length - 2];
        const prevSet = new Set(previous.signatures);
        const currSet = new Set(currentSignatures);

        const newIssues = currentSignatures.filter((s) => !prevSet.has(s));
        const fixedIssues = previous.signatures.filter((s) => !currSet.has(s));
        const persistentIssues = currentSignatures.filter((s) => prevSet.has(s));

        return {
            totalScans,
            lastScan: previous.timestamp,
            trend: moduleEntries.map((e) => ({
                timestamp: e.timestamp,
                critical: e.counts.critical,
                warning: e.counts.warning,
                suggestion: e.counts.suggestion,
            })),
            newIssues,
            fixedIssues,
            persistentIssues,
        };
    }

    /** 获取所有历史记录 */
    getEntries(): HistoryEntry[] {
        return [...this.entries];
    }

    /** 清空历史 */
    clear(): void {
        this.entries = [];
        this.save();
    }

    private loadEntries(): HistoryEntry[] {
        try {
            if (existsSync(this.historyFile)) {
                const raw = readFileSync(this.historyFile, "utf-8");
                return JSON.parse(raw) as HistoryEntry[];
            }
        } catch {
            // 读取失败返回空
        }
        return [];
    }

    private save(): void {
        try {
            if (!existsSync(this.historyDir)) {
                mkdirSync(this.historyDir, { recursive: true });
            }
            writeFileSync(this.historyFile, JSON.stringify(this.entries, null, 2), "utf-8");
        } catch {
            // 静默失败
        }
    }
}
