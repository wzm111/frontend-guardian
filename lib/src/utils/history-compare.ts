/**
 * History Report Compare — 历史报告对比
 *
 * 功能：
 * 1. 对比两次扫描报告，输出新增/已修复/持续存在的问题明细
 * 2. 支持按文件+规则+行号精确匹配 issue
 * 3. 检测 severity 变化的问题
 * 4. 终端友好输出 + JSON 结构化输出
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Issue, Severity } from "@/types.js";
import type { FullReport } from "./history-report.js";

export type IssueStatus = "new" | "fixed" | "persistent" | "changed";

export interface ComparedIssue {
    issue: Issue;
    status: IssueStatus;
    previousSeverity?: Severity;
    previousIssue?: Issue;
}

export interface ReportRef {
    filename: string;
    timestamp: number;
    module: string;
    git?: { commit?: string; branch?: string };
}

export interface HistoryCompareResult {
    currentReport: ReportRef;
    previousReport: ReportRef;
    summary: {
        new: number;
        fixed: number;
        persistent: number;
        changed: number;
        totalCurrent: number;
        totalPrevious: number;
    };
    newIssues: ComparedIssue[];
    fixedIssues: ComparedIssue[];
    persistentIssues: ComparedIssue[];
    changedIssues: ComparedIssue[];
}

export interface HistoryCompareOptions {
    projectDir: string;
    current?: string;   // "latest" or filename
    previous?: string;  // "latest" or filename, defaults to second-latest
}

/** Issue 签名：用于跨报告精确匹配 */
function issueSignature(issue: Issue): string {
    return `${issue.file}|${issue.ruleId}|${issue.line}`;
}

/** 从 history 目录加载报告 */
function loadReport(projectDir: string, filename: string): FullReport | null {
    const reportsDir = resolve(projectDir, ".frontend-guardian", "history");
    try {
        const raw = readFileSync(resolve(reportsDir, filename), "utf-8");
        return JSON.parse(raw) as FullReport;
    } catch {
        return null;
    }
}

/** 列出所有报告文件（按时间倒序） */
function listReportFiles(projectDir: string): string[] {
    const reportsDir = resolve(projectDir, ".frontend-guardian", "history");
    try {
        if (!existsSync(reportsDir)) return [];
        return readdirSync(reportsDir)
            .filter((f) => f.endsWith(".json"))
            .sort()
            .reverse();
    } catch {
        return [];
    }
}

/** 查找报告文件（支持 "latest" 和模糊匹配） */
function resolveReportFile(projectDir: string, ref: string | undefined, exclude?: string): string | null {
    const files = listReportFiles(projectDir);
    if (files.length === 0) return null;

    if (!ref || ref === "latest") {
        if (exclude) {
            return files.find((f) => f !== exclude) ?? null;
        }
        return files[0];
    }

    // 精确匹配
    if (files.includes(ref)) return ref;

    // 前缀匹配（如 "20250601" 匹配 "20250601-120000.json"）
    const matches = files.filter((f) => f.startsWith(ref));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return matches[0]; // 取最新的

    return null;
}

/**
 * 对比两次历史报告
 */
export function compareHistoryReports(options: HistoryCompareOptions): HistoryCompareResult | null {
    const files = listReportFiles(options.projectDir);
    if (files.length === 0) return null;

    const currentFile = resolveReportFile(options.projectDir, options.current);
    if (!currentFile) return null;

    const previousFile = resolveReportFile(options.projectDir, options.previous, currentFile);
    if (!previousFile) return null;

    const current = loadReport(options.projectDir, currentFile);
    const previous = loadReport(options.projectDir, previousFile);

    if (!current || !previous) return null;

    const currentIssues = current.issues;
    const previousIssues = previous.issues;

    const currMap = new Map<string, Issue>();
    const prevMap = new Map<string, Issue>();

    for (const issue of currentIssues) {
        currMap.set(issueSignature(issue), issue);
    }
    for (const issue of previousIssues) {
        prevMap.set(issueSignature(issue), issue);
    }

    const newIssues: ComparedIssue[] = [];
    const fixedIssues: ComparedIssue[] = [];
    const persistentIssues: ComparedIssue[] = [];
    const changedIssues: ComparedIssue[] = [];

    // 当前报告中存在、previous 中不存在 → 新增
    for (const [sig, issue] of currMap) {
        if (!prevMap.has(sig)) {
            newIssues.push({ issue, status: "new" });
        } else {
            const prevIssue = prevMap.get(sig)!;
            if (prevIssue.severity !== issue.severity) {
                changedIssues.push({
                    issue,
                    status: "changed",
                    previousSeverity: prevIssue.severity,
                    previousIssue: prevIssue,
                });
            } else {
                persistentIssues.push({ issue, status: "persistent" });
            }
        }
    }

    // previous 中存在、当前不存在 → 已修复
    for (const [sig, issue] of prevMap) {
        if (!currMap.has(sig)) {
            fixedIssues.push({ issue, status: "fixed" });
        }
    }

    // 按 severity 排序
    const severityOrder = { critical: 0, warning: 1, suggestion: 2 };
    const sortBySeverity = (a: ComparedIssue, b: ComparedIssue) =>
        severityOrder[a.issue.severity] - severityOrder[b.issue.severity];

    newIssues.sort(sortBySeverity);
    fixedIssues.sort(sortBySeverity);
    persistentIssues.sort(sortBySeverity);
    changedIssues.sort(sortBySeverity);

    return {
        currentReport: {
            filename: currentFile,
            timestamp: current.timestamp,
            module: current.module,
            git: current.git,
        },
        previousReport: {
            filename: previousFile,
            timestamp: previous.timestamp,
            module: previous.module,
            git: previous.git,
        },
        summary: {
            new: newIssues.length,
            fixed: fixedIssues.length,
            persistent: persistentIssues.length,
            changed: changedIssues.length,
            totalCurrent: currentIssues.length,
            totalPrevious: previousIssues.length,
        },
        newIssues,
        fixedIssues,
        persistentIssues,
        changedIssues,
    };
}

/**
 * 终端友好的对比报告输出
 */
export function formatHistoryCompare(result: HistoryCompareResult): string {
    const lines: string[] = [];

    const formatDate = (ts: number) =>
        new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

    lines.push(`📊 历史报告对比`);
    lines.push(`   当前: ${result.currentReport.filename} (${formatDate(result.currentReport.timestamp)}) [${result.currentReport.module}]`);
    lines.push(`   对比: ${result.previousReport.filename} (${formatDate(result.previousReport.timestamp)}) [${result.previousReport.module}]`);
    lines.push("");

    // 摘要
    const { summary } = result;
    lines.push(`📈 变化摘要`);
    lines.push(`   当前报告: ${summary.totalCurrent} 个问题`);
    lines.push(`   对比报告: ${summary.totalPrevious} 个问题`);
    lines.push(`   新增: ${summary.new} | 已修复: ${summary.fixed} | 持续存在: ${summary.persistent} | 级别变化: ${summary.changed}`);
    lines.push("");

    // 新增问题
    if (result.newIssues.length > 0) {
        lines.push(`🆕 新增问题 (${result.newIssues.length})`);
        for (const ci of result.newIssues) {
            const sev = ci.issue.severity === "critical" ? "🔴" : ci.issue.severity === "warning" ? "🟡" : "💡";
            lines.push(`   ${sev} [${ci.issue.ruleId}] ${ci.issue.title}`);
            lines.push(`      📄 ${ci.issue.file}:${ci.issue.line}`);
        }
        lines.push("");
    }

    // 已修复问题
    if (result.fixedIssues.length > 0) {
        lines.push(`✅ 已修复问题 (${result.fixedIssues.length})`);
        for (const ci of result.fixedIssues) {
            const sev = ci.issue.severity === "critical" ? "🔴" : ci.issue.severity === "warning" ? "🟡" : "💡";
            lines.push(`   ${sev} [${ci.issue.ruleId}] ${ci.issue.title}`);
            lines.push(`      📄 ${ci.issue.file}:${ci.issue.line}`);
        }
        lines.push("");
    }

    // 级别变化
    if (result.changedIssues.length > 0) {
        lines.push(`🔄 严重级别变化 (${result.changedIssues.length})`);
        for (const ci of result.changedIssues) {
            lines.push(`   [${ci.issue.ruleId}] ${ci.issue.title}`);
            lines.push(`      📄 ${ci.issue.file}:${ci.issue.line}`);
            lines.push(`      ${ci.previousSeverity} → ${ci.issue.severity}`);
        }
        lines.push("");
    }

    // 持续存在
    if (result.persistentIssues.length > 0) {
        lines.push(`⏳ 持续存在的问题 (${result.persistentIssues.length})`);
        const bySeverity = { critical: 0, warning: 0, suggestion: 0 };
        for (const ci of result.persistentIssues) {
            bySeverity[ci.issue.severity]++;
        }
        lines.push(`   🔴 Critical: ${bySeverity.critical} | 🟡 Warning: ${bySeverity.warning} | 💡 Suggestion: ${bySeverity.suggestion}`);
        lines.push("");
    }

    return lines.join("\n");
}

/**
 * JSON 格式的对比结果
 */
export function formatHistoryCompareJson(result: HistoryCompareResult): object {
    return {
        currentReport: result.currentReport,
        previousReport: result.previousReport,
        summary: result.summary,
        newIssues: result.newIssues.map((ci) => ({
            ...ci.issue,
            status: ci.status,
        })),
        fixedIssues: result.fixedIssues.map((ci) => ({
            ...ci.issue,
            status: ci.status,
        })),
        changedIssues: result.changedIssues.map((ci) => ({
            ...ci.issue,
            status: ci.status,
            previousSeverity: ci.previousSeverity,
        })),
        persistentIssues: result.persistentIssues.map((ci) => ({
            ...ci.issue,
            status: ci.status,
        })),
    };
}
