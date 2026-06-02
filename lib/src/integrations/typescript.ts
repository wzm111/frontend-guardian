/**
 * TypeScript 集成
 *
 * 调用 npx tsc --noEmit 并解析类型错误为 Issue 格式
 */

import type { Issue, Severity } from "../types.js";
import type { ExternalTool } from "./base.js";
import { runCommand } from "./base.js";

/** TSC 错误码分类：关键类型错误 */
const CRITICAL_CODES = new Set([
    2322, // Type 'X' is not assignable to type 'Y'
    2345, // Argument of type 'X' is not assignable to parameter of type 'Y'
    2321, // Excess property checks
    2531, // Object is possibly 'null'
    2532, // Object is possibly 'undefined'
    2533, // Object is possibly 'null' or 'undefined'
    2571, // Object is of type 'unknown'
    18046, // 'X' is of type 'unknown'
    18047, // 'X' is possibly 'null'
    18048, // 'X' is possibly 'undefined'
    7006, // Parameter 'X' implicitly has an 'any' type
    7008, // Member 'X' implicitly has an 'any' type
    7017, // Element implicitly has an 'any' type because index expression is not of type 'number'
    7019, // Element implicitly has an 'any' type because expression of type 'X' can't be used to index type 'Y'
]);

const WARNING_CODES = new Set([
    6133, // 'X' is declared but its value is never read
    6196, // 'X' is declared but never used
    2578, // Unused '@ts-expect-error' directive
    7027, // Unreachable code detected
    7030, // Not all code paths return a value
]);

function tscCodeToSeverity(code: number): Severity {
    if (CRITICAL_CODES.has(code)) return "critical";
    if (WARNING_CODES.has(code)) return "warning";
    return "suggestion";
}

export const typescriptIntegration: ExternalTool = {
    name: "TypeScript",

    isAvailable(projectDir: string): boolean {
        // 检查 tsconfig.json 是否存在
        try {
            const fs = require("node:fs");
            return fs.existsSync(require("node:path").join(projectDir, "tsconfig.json"));
        } catch {
            return false;
        }
    },

    run(projectDir: string, files?: string[]): Issue[] {
        // 如果指定了文件列表，只检查这些文件
        const cmd = files && files.length > 0
            ? `npx tsc --noEmit ${files.join(" ")}`
            : "npx tsc --noEmit";

        const stdout = runCommand(cmd, projectDir, 180000);

        if (!stdout) {
            return [];
        }

        const issues: Issue[] = [];
        const lines = stdout.split("\n");

        // 解析 TSC 错误输出格式：
        // src/file.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
        const errorRegex = /^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/;

        for (const line of lines) {
            const match = line.match(errorRegex);
            if (!match) continue;

            const [, filePath, lineStr, colStr, category, codeStr, message] = match;
            const code = parseInt(codeStr, 10);
            const lineNum = parseInt(lineStr, 10);
            const colNum = parseInt(colStr, 10);
            const severity = tscCodeToSeverity(code);

            issues.push({
                ruleId: `tsc-TS${code}`,
                title: `TS${code}: ${message.slice(0, 60)}`,
                description: message,
                severity,
                file: filePath,
                line: lineNum,
                column: colNum,
                meta: {
                    tool: "typescript",
                    code,
                    category,
                },
            });
        }

        return issues;
    },
};
