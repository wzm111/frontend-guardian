/**
 * ESLint 集成
 *
 * 调用 npx eslint --format json 并解析为 Issue 格式
 */

import type { Issue } from "@/types.js";
import type { ExternalTool } from "./base.js";
import { runCommand, eslintSeverityToFg, hasPackage } from "./base.js";

interface ESLintMessage {
    ruleId: string | null;
    severity: number;
    message: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    fix?: {
        range: [number, number];
        text: string;
    };
    suggestions?: Array<{
        desc: string;
        fix: {
            range: [number, number];
            text: string;
        };
    }>;
}

interface ESLintResult {
    filePath: string;
    messages: ESLintMessage[];
    errorCount: number;
    warningCount: number;
    fixableErrorCount: number;
    fixableWarningCount: number;
    source?: string;
}

export const eslintIntegration: ExternalTool = {
    name: "ESLint",

    isAvailable(projectDir: string): boolean {
        return hasPackage(projectDir, "eslint");
    },

    run(projectDir: string, files?: string[]): Issue[] {
        const target = files && files.length > 0 ? files.join(" ") : "src/";
        const stdout = runCommand(
            `npx eslint --format json --no-error-on-unmatched-pattern ${target}`,
            projectDir,
            120000
        );

        if (!stdout) {
            return [];
        }

        let results: ESLintResult[];
        try {
            results = JSON.parse(stdout);
        } catch {
            return [];
        }

        const issues: Issue[] = [];
        for (const result of results) {
            for (const msg of result.messages) {
                if (!msg.ruleId) continue; // 忽略解析错误（ruleId 为 null）

                const severity = eslintSeverityToFg(msg.severity);

                // 构建 Fix（如果 ESLint 提供了）
                let fix: Issue["fix"] = undefined;
                if (msg.fix) {
                    // ESLint fix 使用字符偏移，我们需要转换为行列
                    // 简单处理：使用 line/column 作为起始位置
                    fix = {
                        text: msg.fix.text,
                        start: { line: msg.line, column: msg.column },
                        end: { line: msg.endLine || msg.line, column: msg.endColumn || msg.column + 1 },
                    };
                }

                issues.push({
                    ruleId: `eslint-${msg.ruleId}`,
                    title: msg.ruleId,
                    description: msg.message,
                    severity,
                    file: result.filePath,
                    line: msg.line,
                    column: msg.column,
                    endLine: msg.endLine,
                    endColumn: msg.endColumn,
                    fix,
                    meta: {
                        tool: "eslint",
                        fixable: !!msg.fix,
                        suggestions: msg.suggestions?.map((s) => s.desc) || [],
                    },
                });
            }
        }

        return issues;
    },
};
