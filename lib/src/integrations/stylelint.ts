/**
 * Stylelint 集成
 *
 * 调用 npx stylelint --formatter json 并解析 CSS 规范问题为 Issue 格式
 */

import type { Issue, Severity } from "@/types.js";
import type { ExternalTool } from "./base.js";
import { runCommand, hasPackage } from "./base.js";

interface StylelintWarning {
    line: number;
    column: number;
    rule: string;
    severity: string; // "error" | "warning"
    text: string;
    url?: string;
}

interface StylelintResult {
    source: string;
    warnings: StylelintWarning[];
    errored: boolean;
    deprecations: unknown[];
    invalidOptionWarnings: unknown[];
    parseErrors: unknown[];
}

function slSeverityToFg(severity: string): Severity {
    switch (severity) {
        case "error":
            return "critical";
        case "warning":
            return "warning";
        default:
            return "suggestion";
    }
}

export const stylelintIntegration: ExternalTool = {
    name: "Stylelint",

    isAvailable(projectDir: string): boolean {
        return hasPackage(projectDir, "stylelint");
    },

    run(projectDir: string, files?: string[]): Issue[] {
        const patterns = files && files.length > 0 ? files.join(" ") : '"src/**/*.{css,scss,less,sass}"';

        const stdout = runCommand(`npx stylelint ${patterns} --formatter json --allow-empty-input`, projectDir, 120000);

        if (!stdout) {
            return [];
        }

        let results: StylelintResult[];
        try {
            results = JSON.parse(stdout);
        } catch {
            return [];
        }

        const issues: Issue[] = [];
        for (const result of results) {
            for (const warning of result.warnings) {
                issues.push({
                    ruleId: `stylelint-${warning.rule}`,
                    title: warning.rule,
                    description: warning.text.replace(/\s*\(.*\)\s*$/, ""), // 去掉末尾的 URL 提示
                    severity: slSeverityToFg(warning.severity),
                    file: result.source,
                    line: warning.line,
                    column: warning.column,
                    meta: {
                        tool: "stylelint",
                        url: warning.url,
                    },
                });
            }
        }

        return issues;
    },
};
