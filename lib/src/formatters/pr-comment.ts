/**
 * PR/MR 评论 Markdown 生成器
 *
 * 将扫描结果格式化为结构化的 Markdown 评论，嵌入隐藏标记用于去重。
 * 支持 GitHub PR 和 GitLab MR 两种格式。
 */

import type { Issue, ScanResult } from "@/types.js";

/** 评论隐藏标记前缀（用于去重识别） */
export const COMMENT_MARKER = "<!-- frontend-guardian:scan-report -->";

/** 评论元数据（嵌入在隐藏 HTML 注释中） */
export interface CommentMeta {
    /** 扫描时间戳 ISO */
    timestamp: string;
    /** 扫描 commit SHA */
    commitSha?: string;
    /** 扫描耗时 ms */
    duration: number;
    /** 扫描文件数 */
    filesScanned: number;
}

/** 生成 PR/MR 评论 Markdown */
export function generatePRComment(
    allResults: Record<string, ScanResult>,
    meta: CommentMeta,
    options?: {
        /** 外部工具结果 */
        external?: Array<{ tool: string; issues: Issue[] }>;
        /** 修复结果 */
        fixResult?: { fixedCount: number; filesModified: string[] } | null;
    }
): string {
    const lines: string[] = [];

    // ── 隐藏标记（去重用）
    lines.push(COMMENT_MARKER);
    lines.push(`<!-- timestamp: ${meta.timestamp} -->`);
    if (meta.commitSha) {
        lines.push(`<!-- commit: ${meta.commitSha} -->`);
    }
    lines.push("");

    // ── 标题
    lines.push("## 🛡️ Frontend Guardian 扫描结果");
    lines.push("");

    // ── 汇总
    let totalCritical = 0;
    let totalWarning = 0;
    let totalSuggestion = 0;
    let totalIssues = 0;
    let totalFilesWithIssues = 0;

    for (const r of Object.values(allResults)) {
        totalCritical += r.issues.critical.length;
        totalWarning += r.issues.warning.length;
        totalSuggestion += r.issues.suggestion.length;
        totalIssues += r.total;
        totalFilesWithIssues += r.filesWithIssues;
    }

    if (options?.external) {
        for (const er of options.external) {
            for (const issue of er.issues) {
                if (issue.severity === "critical") totalCritical++;
                else if (issue.severity === "warning") totalWarning++;
                else totalSuggestion++;
            }
            totalIssues += er.issues.length;
        }
    }

    lines.push("| 级别 | 数量 |");
    lines.push("|------|------|");
    lines.push(`| 🔴 Critical | ${totalCritical} |`);
    lines.push(`| 🟡 Warning | ${totalWarning} |`);
    lines.push(`| 💡 Suggestion | ${totalSuggestion} |`);
    lines.push(`| **总计** | **${totalIssues}** |`);
    lines.push("");
    lines.push(`- ⏱️ 扫描耗时: ${meta.duration}ms`);
    lines.push(`- 📄 扫描文件数: ${meta.filesScanned}`);
    lines.push(`- 📁 问题文件数: ${totalFilesWithIssues}`);
    if (meta.commitSha) {
        lines.push(`- 🔗 Commit: \`${meta.commitSha}\``);
    }
    lines.push("");

    // ── 修复汇总
    if (options?.fixResult && options.fixResult.fixedCount > 0) {
        lines.push(
            `> ✅ 已自动修复 **${options.fixResult.fixedCount}** 个问题（${options.fixResult.filesModified.length} 个文件）`
        );
        lines.push("");
    }

    // ── 按模块展开详情
    for (const [mod, result] of Object.entries(allResults)) {
        if (result.total === 0) continue;

        const modTotal = result.total;
        const modCritical = result.issues.critical.length;
        const modWarning = result.issues.warning.length;
        const modSuggestion = result.issues.suggestion.length;

        lines.push(`<details>`);
        lines.push(
            `<summary><b>📦 ${mod}</b> — ${modTotal} 个问题 ` +
                `(🔴${modCritical} 🟡${modWarning} 💡${modSuggestion})</summary>`
        );
        lines.push("");

        for (const severity of ["critical", "warning", "suggestion"] as const) {
            const issues = result.issues[severity];
            if (issues.length === 0) continue;

            const emoji = severity === "critical" ? "🔴" : severity === "warning" ? "🟡" : "💡";
            lines.push(`#### ${emoji} ${severity.toUpperCase()} (${issues.length})`);
            lines.push("");

            for (const issue of issues.slice(0, 20)) {
                // 最多展示 20 条，避免评论过长
                lines.push(`**${issue.title}** \`[${issue.ruleId}]\``);
                lines.push(`- 📄 \`${issue.file}:${issue.line}\``);
                lines.push(`- ${issue.description}`);
                if (issue.source) {
                    lines.push(`- \`\`\``);
                    lines.push(issue.source);
                    lines.push(`\`\`\``);
                }
                if (issue.docsUrl) {
                    lines.push(`- 📖 [查看规则说明](${issue.docsUrl})`);
                }
                lines.push("");
            }

            if (issues.length > 20) {
                lines.push(`> … 还有 ${issues.length - 20} 个问题未展示，请在完整报告中查看。`);
                lines.push("");
            }
        }

        lines.push(`</details>`);
        lines.push("");
    }

    // ── 外部工具结果
    if (options?.external) {
        for (const er of options.external) {
            if (er.issues.length === 0) continue;
            lines.push(`<details>`);
            lines.push(`<summary><b>🔌 ${er.tool}</b> — ${er.issues.length} 个问题</summary>`);
            lines.push("");
            for (const issue of er.issues.slice(0, 10)) {
                const emoji =
                    issue.severity === "critical" ? "🔴" : issue.severity === "warning" ? "🟡" : "💡";
                lines.push(`${emoji} **${issue.title}** \`${issue.file}:${issue.line}\``);
                lines.push(`  ${issue.description}`);
                lines.push("");
            }
            if (er.issues.length > 10) {
                lines.push(`> … 还有 ${er.issues.length - 10} 个问题未展示。`);
                lines.push("");
            }
            lines.push(`</details>`);
            lines.push("");
        }
    }

    // ── 页脚
    lines.push("---");
    lines.push("*由 [Frontend Guardian](https://github.com/wzm111/frontend-guardian) 自动生成*");

    return lines.join("\n");
}

/**
 * 从已有评论内容中提取隐藏标记
 * 返回 true 表示这是 frontend-guardian 生成的评论
 */
export function isGuardianComment(body: string): boolean {
    return body.includes(COMMENT_MARKER);
}

/**
 * 生成评论的简短摘要（用于无法发长评论时的 fallback）
 */
export function generatePRCommentSummary(
    totalIssues: number,
    totalCritical: number,
    totalWarning: number,
    totalSuggestion: number,
    meta: CommentMeta
): string {
    const lines: string[] = [];
    lines.push(COMMENT_MARKER);
    lines.push("");
    lines.push("## 🛡️ Frontend Guardian 扫描结果");
    lines.push("");
    lines.push(`| 级别 | 数量 |`);
    lines.push(`|------|------|`);
    lines.push(`| 🔴 Critical | ${totalCritical} |`);
    lines.push(`| 🟡 Warning | ${totalWarning} |`);
    lines.push(`| 💡 Suggestion | ${totalSuggestion} |`);
    lines.push(`| **总计** | **${totalIssues}** |`);
    lines.push("");
    lines.push(`⏱️ ${meta.duration}ms | 📄 ${meta.filesScanned} files scanned`);
    lines.push("");
    lines.push("---");
    lines.push("*由 [Frontend Guardian](https://github.com/wzm111/frontend-guardian) 自动生成*");
    return lines.join("\n");
}
