/**
 * v3.17.0: 规则模板生成器
 *
 * 根据用户输入生成规则文件与对应测试文件模板。
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CreateRuleOptions, RuleCategory, Severity } from "@/types.js";

const RULE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface GeneratedRuleFiles {
    rulePath: string;
    testPath: string;
}

function validateOptions(options: CreateRuleOptions): void {
    if (!options.ruleId || !RULE_ID_PATTERN.test(options.ruleId)) {
        throw new Error(
            `规则 ID 必须是 kebab-case 格式（如 no-console-log），收到: ${options.ruleId}`
        );
    }
    const validCategories: RuleCategory[] = [
        "i18n",
        "component",
        "hooks",
        "platform",
        "performance",
        "accessibility",
        "security",
        "style",
        "architecture",
        "e2e",
        "mobile",
    ];
    if (!validCategories.includes(options.category)) {
        throw new Error(`不支持的规则分类: ${options.category}`);
    }
    const validSeverities: Severity[] = ["critical", "warning", "suggestion"];
    if (!validSeverities.includes(options.severity)) {
        throw new Error(`不支持的严重级别: ${options.severity}`);
    }
}

function generateRuleFile(options: CreateRuleOptions): string {
    const { ruleId, category, severity, includeFix, language } = options;
    const typeImports = language === "ts" ? 'import type { Rule, RuleContext, Issue } from "frontend-guardian-core";\n' : "";
    const exportPrefix = language === "ts" ? "export default " : "module.exports = ";

    const fixBlock = includeFix
        ? `
    // 可选：为 issue 提供自动修复方案
    // fix: {
    //     text: "",                 // 替换后的文本
    //     start: { line: 1, column: 1 },
    //     end: { line: 1, column: 10 },
    //     confidence: "high",
    //     description: "修复说明",
    // },
`
        : "";

    return `${typeImports}/**
 * ${ruleId}
 *
 * TODO: 补充规则说明
 */

${exportPrefix}{
    id: "${ruleId}",
    name: "${toTitle(ruleId)}",
    description: "TODO: 描述规则检测的内容、触发条件和修复建议",
    severity: "${severity}",
    category: "${category}",
    defaultEnabled: true,
    docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/${ruleId}.md",
    execute(context${language === "ts" ? ": RuleContext" : ""})${language === "ts" ? ": Issue[]" : ""} {
        const issues${language === "ts" ? ": Issue[]" : ""} = [];

        // TODO: 实现规则检测逻辑
        // 示例：检查 source 中是否包含某个反模式
        if (context.source.includes("TODO_ANTIPATTERN")) {
            issues.push({
                ruleId: "${ruleId}",
                title: "发现 TODO 反模式",
                description: "请补充具体的问题描述",
                severity: "${severity}",
                file: context.filePath,
                line: 1,
                column: 1,
                source: context.source.slice(0, 80),${fixBlock}
            });
        }

        return issues;
    },
};
`;
}

function generateTestFile(options: CreateRuleOptions): string {
    const { ruleId, language } = options;
    const ext = language === "ts" ? ".ts" : ".js";
    const ruleImport = language === "ts"
        ? `import ${toCamelCase(ruleId)} from "./${ruleId}.rule${ext}";`
        : `const ${toCamelCase(ruleId)} = require("./${ruleId}.rule${ext}");`;

    return `import { describe, it, expect } from "vitest";
import { createMinimalContext } from "../../tests/helpers.js";
${ruleImport}

describe("${ruleId}", () => {
    it("should report issue when antipattern is found", () => {
        const context = createMinimalContext("TODO_ANTIPATTERN example", "src/example.js");
        const issues = ${toCamelCase(ruleId)}.execute(context);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0].ruleId).toBe("${ruleId}");
    });

    it("should not report issue for clean code", () => {
        const context = createMinimalContext("const valid = true;", "src/example.js");
        const issues = ${toCamelCase(ruleId)}.execute(context);
        expect(issues.length).toBe(0);
    });
});
`;
}

function toTitle(ruleId: string): string {
    return ruleId
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

function toCamelCase(ruleId: string): string {
    return ruleId
        .split("-")
        .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
        .join("");
}

/**
 * 生成规则模板文件
 * @returns 生成的规则文件与测试文件路径
 */
export function generateRuleTemplate(options: CreateRuleOptions): GeneratedRuleFiles {
    validateOptions(options);

    if (!existsSync(options.targetDir)) {
        mkdirSync(options.targetDir, { recursive: true });
    }

    const ext = options.language === "ts" ? ".ts" : ".js";
    const rulePath = resolve(options.targetDir, `${options.ruleId}.rule${ext}`);
    const testPath = resolve(options.targetDir, `${options.ruleId}.rule.test.ts`);

    if (existsSync(rulePath)) {
        throw new Error(`规则文件已存在: ${rulePath}`);
    }

    writeFileSync(rulePath, generateRuleFile(options), "utf-8");
    writeFileSync(testPath, generateTestFile(options), "utf-8");

    return { rulePath, testPath };
}
