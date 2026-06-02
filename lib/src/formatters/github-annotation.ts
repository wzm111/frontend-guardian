/**
 * GitHub Actions Annotation 格式化器
 *
 * 将 Issue 转换为 GitHub Actions 工作流命令格式，
 * 在 PR diff 中直接内联显示问题。
 *
 * 规范参考：https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions#setting-an-error-message
 */

import type { Issue, Severity } from "@/types.js";

/** severity → GitHub annotation 级别映射 */
function severityToAnnotation(severity: Severity): "error" | "warning" | "notice" {
    switch (severity) {
        case "critical":
            return "error";
        case "warning":
            return "warning";
        case "suggestion":
            return "notice";
    }
}

/**
 * 将单条 Issue 格式化为 GitHub Actions 命令
 * 格式：::error file=app.js,line=10,col=5::Missing semicolon
 */
export function formatIssueAnnotation(issue: Issue): string {
    const level = severityToAnnotation(issue.severity);
    const message = `${issue.title} (${issue.ruleId}) - ${issue.description}`;
    const parts: string[] = [`::${level}`];

    // 文件路径：使用相对路径
    if (issue.file) {
        parts[0] += ` file=${escapeProperty(issue.file)}`;
    }
    // 行号
    if (issue.line != null) {
        parts[0] += `,line=${issue.line}`;
    }
    // 列号
    if (issue.column != null) {
        parts[0] += `,col=${issue.column}`;
    }
    // 结束行号（GitHub 支持 endLine）
    if (issue.endLine != null && issue.endLine !== issue.line) {
        parts[0] += `,endLine=${issue.endLine}`;
    }

    parts[0] += `::${escapeData(message)}`;
    return parts.join("");
}

/**
 * 将 Issue 列表格式化为 GitHub Actions 命令列表
 */
export function formatIssuesAnnotations(issues: Issue[]): string[] {
    return issues.map(formatIssueAnnotation);
}

/**
 * 将所有 annotation 命令合并为单个字符串输出
 * 每条命令占一行，末尾空行分隔
 */
export function formatAllAnnotations(issues: Issue[]): string {
    return formatIssuesAnnotations(issues).join("\n") + "\n";
}

/**
 * 检测当前是否运行在 GitHub Actions 环境中
 */
export function isGitHubActions(): boolean {
    return process.env.GITHUB_ACTIONS === "true";
}

/**
 * 生成 GitHub Actions job summary（可选）
 * 写入 GITHUB_STEP_SUMMARY 文件，在 PR/Action 页面显示汇总
 */
export function writeJobSummary(issues: Issue[], summary: { totalFilesScanned: number; duration: number }): void {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryFile) return;

    const { writeFileSync } = require("node:fs");
    const critical = issues.filter((i) => i.severity === "critical").length;
    const warning = issues.filter((i) => i.severity === "warning").length;
    const suggestion = issues.filter((i) => i.severity === "suggestion").length;

    const md = [
        "## 🛡️ Frontend Guardian 扫描结果",
        "",
        "| 级别 | 数量 |",
        "|------|------|",
        `| 🔴 Critical | ${critical} |`,
        `| 🟡 Warning | ${warning} |`,
        `| 💡 Suggestion | ${suggestion} |`,
        `| **总计** | **${issues.length}** |`,
        "",
        `- 扫描文件数: ${summary.totalFilesScanned}`,
        `- 耗时: ${summary.duration}ms`,
        "",
    ].join("\n");

    try {
        writeFileSync(summaryFile, md + "\n", { flag: "a" });
    } catch {
        // 静默失败
    }
}

/** GitHub Actions 规范：属性值中的特殊字符需要转义 */
function escapeProperty(s: string): string {
    return s
        .replace(/%/g, "%25")
        .replace(/\r/g, "%0D")
        .replace(/\n/g, "%0A")
        .replace(/:/g, "%3A")
        .replace(/,/g, "%2C");
}

/** GitHub Actions 规范：消息正文中的特殊字符需要转义 */
function escapeData(s: string): string {
    return s
        .replace(/%/g, "%25")
        .replace(/\r/g, "%0D")
        .replace(/\n/g, "%0A");
}
