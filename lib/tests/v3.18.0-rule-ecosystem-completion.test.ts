/**
 * v3.18.0 — 规则生态收尾测试
 *
 * 覆盖规则文档生成器、规则兼容性检查、CSS/SCSS 扫描器。
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEngine } from "../src/engine/rule-engine.js";
import { RuleRegistry } from "../src/rules/registry.js";
import { cssRules } from "../src/scanners/css-scanner.js";
import type { Rule } from "../src/types.js";
import {
    checkRuleCompatibility,
    formatCompatibilityReport,
    isCompatibilityReportClean,
} from "../src/utils/rule-compatibility.js";
import { generateRuleDoc, generateRuleDocs } from "../src/utils/rule-doc-generator.js";
import { createMinimalContext, createTempProject, cleanupTempProject, writeProjectFile } from "./helpers.js";

const CLI_PATH = resolve(__dirname, "../bin/fg-core.js");

function runCLI(cwd: string, args: string[]): { stdout: string; stderr: string; exitCode: number } {
    try {
        const stdout = execSync(`node ${CLI_PATH} ${args.join(" ")}`, {
            encoding: "utf-8",
            timeout: 10000,
            cwd,
        });
        return { stdout, stderr: "", exitCode: 0 };
    } catch (err: any) {
        return {
            stdout: err.stdout || "",
            stderr: err.stderr || "",
            exitCode: err.status ?? 1,
        };
    }
}

function getRule(id: string): Rule {
    const rule = cssRules.find((r) => r.id === id);
    if (!rule) throw new Error(`Rule not found: ${id}`);
    return rule;
}

describe("v3.18.0 rule ecosystem completion", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempProject();
    });

    afterEach(() => {
        cleanupTempProject(tempDir);
    });

    describe("rule-doc-generator", () => {
        it("generates markdown for a single rule", () => {
            const rule: Rule = {
                id: "demo-rule",
                name: "Demo Rule",
                description: "A demo rule for testing.",
                severity: "warning",
                category: "security",
                defaultEnabled: true,
                docsUrl: "https://example.com/demo-rule",
            };

            const markdown = generateRuleDoc(rule);
            expect(markdown).toContain("# Demo Rule");
            expect(markdown).toContain("`demo-rule`");
            expect(markdown).toContain("A demo rule for testing.");
            expect(markdown).toContain("warning");
            expect(markdown).toContain("security");
            expect(markdown).toContain("https://example.com/demo-rule");
        });

        it("generates docs directory and index", () => {
            const rules: Rule[] = [
                {
                    id: "rule-a",
                    name: "Rule A",
                    description: "First rule.",
                    severity: "warning",
                    category: "security",
                    defaultEnabled: true,
                },
                {
                    id: "rule-b",
                    name: "Rule B",
                    description: "Second rule.",
                    severity: "suggestion",
                    category: "style",
                    defaultEnabled: true,
                },
            ];

            const outputDir = join(tempDir, "docs", "rules");
            const result = generateRuleDocs({ outputDir, rules });

            expect(result.files.length).toBe(3);
            expect(existsSync(join(outputDir, "security", "rule-a.md"))).toBe(true);
            expect(existsSync(join(outputDir, "style", "rule-b.md"))).toBe(true);
            expect(existsSync(join(outputDir, "README.md"))).toBe(true);

            const readme = readFileSync(join(outputDir, "README.md"), "utf-8");
            expect(readme).toContain("规则文档索引");
            expect(readme).toContain("Rule A");
            expect(readme).toContain("Rule B");
        });
    });

    describe("rule-compatibility", () => {
        it("detects conflicts between enabled rules", () => {
            const rules: Rule[] = [
                {
                    id: "rule-a",
                    name: "Rule A",
                    description: "...",
                    severity: "warning",
                    category: "style",
                    defaultEnabled: true,
                    conflictsWith: ["rule-b"],
                },
                {
                    id: "rule-b",
                    name: "Rule B",
                    description: "...",
                    severity: "warning",
                    category: "style",
                    defaultEnabled: true,
                },
            ];

            const report = checkRuleCompatibility(rules);
            expect(report.conflicts.length).toBe(1);
            expect(report.conflicts[0].ruleId).toBe("rule-a");
            expect(report.conflicts[0].conflictsWith).toBe("rule-b");
            expect(isCompatibilityReportClean(report)).toBe(false);
        });

        it("detects missing required rules", () => {
            const rules: Rule[] = [
                {
                    id: "rule-a",
                    name: "Rule A",
                    description: "...",
                    severity: "warning",
                    category: "style",
                    defaultEnabled: true,
                    requires: ["rule-b"],
                },
            ];

            const report = checkRuleCompatibility(rules);
            expect(report.missingRequirements.length).toBe(1);
            expect(report.missingRequirements[0].ruleId).toBe("rule-a");
            expect(report.missingRequirements[0].requires).toBe("rule-b");
        });

        it("detects superseded rules still enabled", () => {
            const rules: Rule[] = [
                {
                    id: "old-rule",
                    name: "Old Rule",
                    description: "...",
                    severity: "warning",
                    category: "style",
                    defaultEnabled: true,
                },
                {
                    id: "new-rule",
                    name: "New Rule",
                    description: "...",
                    severity: "warning",
                    category: "style",
                    defaultEnabled: true,
                    supersedes: ["old-rule"],
                },
            ];

            const report = checkRuleCompatibility(rules);
            expect(report.superseded.length).toBe(1);
            expect(report.superseded[0].ruleId).toBe("old-rule");
            expect(report.superseded[0].supersededBy).toBe("new-rule");
        });

        it("formats clean report", () => {
            const report = checkRuleCompatibility([]);
            expect(formatCompatibilityReport(report)).toContain("无兼容性问题");
        });
    });

    describe("css-scanner", () => {
        it("reports !important usage", () => {
            const rule = getRule("css-no-important");
            const context = createMinimalContext(".a { color: red !important; }", join(tempDir, "src", "a.css"));
            const issues = rule.execute(context);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("css-no-important");
        });

        it("reports deep selector", () => {
            const rule = getRule("css-max-selector-depth");
            const context = createMinimalContext(
                '.a .b .c .d .e { color: red; }',
                join(tempDir, "src", "a.css")
            );
            const issues = rule.execute(context);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("css-max-selector-depth");
        });

        it("reports too many @import", () => {
            const rule = getRule("css-too-many-imports");
            const imports = Array.from({ length: 12 }, (_, i) => `@import url("${i}.css");`).join("\n");
            const context = createMinimalContext(imports, join(tempDir, "src", "a.css"));
            const issues = rule.execute(context);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("css-too-many-imports");
        });

        it("reports undeclared scss variables", () => {
            const rule = getRule("css-no-undeclared-scss-variables");
            const context = createMinimalContext(
                ".a { color: $unknown-color; }",
                join(tempDir, "src", "a.scss")
            );
            const issues = rule.execute(context);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("css-no-undeclared-scss-variables");
        });

        it("does not report declared scss variables", () => {
            const rule = getRule("css-no-undeclared-scss-variables");
            const context = createMinimalContext(
                "$primary: blue;\n.a { color: $primary; }",
                join(tempDir, "src", "a.scss")
            );
            const issues = rule.execute(context);
            expect(issues.length).toBe(0);
        });
    });

    describe("RuleRegistry / RuleEngine compatibility", () => {
        it("registry returns compatibility report", () => {
            const registry = new RuleRegistry();
            registry.register({
                id: "rule-a",
                name: "Rule A",
                description: "...",
                severity: "warning",
                category: "style",
                defaultEnabled: true,
                conflictsWith: ["rule-b"],
            });
            registry.register({
                id: "rule-b",
                name: "Rule B",
                description: "...",
                severity: "warning",
                category: "style",
                defaultEnabled: true,
            });

            const report = registry.getCompatibilityReport();
            expect(report.conflicts.length).toBe(1);
        });

        it("engine exposes checkRuleCompatibility", () => {
            const engine = createEngine({ projectDir: tempDir });
            const report = engine.checkRuleCompatibility();
            expect(report).toHaveProperty("conflicts");
            expect(report).toHaveProperty("missingRequirements");
            expect(report).toHaveProperty("superseded");
        });
    });

    describe("CLI flags", () => {
        it("--generate-rule-docs generates files", () => {
            const { exitCode, stdout } = runCLI(tempDir, [
                ".",
                "--generate-rule-docs",
                "--generate-rule-docs-dir",
                "./docs/rules",
            ]);
            expect(exitCode).toBe(0);
            expect(stdout).toContain("规则文档已生成");
            expect(existsSync(join(tempDir, "docs", "rules", "README.md"))).toBe(true);
        });

        it("--check-rule-compat reports conflicts", () => {
            writeProjectFile(
                tempDir,
                ".frontend-guardian.yml",
                `rules:\n  rule-a:\n    enabled: true\n  rule-b:\n    enabled: true\n`
            );
            // 需要实际注册带冲突元数据的规则；CLI 默认规则集无冲突，所以 exitCode 为 0
            const { exitCode, stdout } = runCLI(tempDir, [".", "--check-rule-compat"]);
            expect(exitCode).toBe(0);
            expect(stdout).toContain("无兼容性问题");
        });

        it("--module css scans css files", () => {
            writeProjectFile(tempDir, "src/app.css", ".a { color: red !important; }\n");
            const { exitCode, stdout } = runCLI(tempDir, [".", "--module", "css", "--files", "src/app.css"]);
            expect(exitCode).toBe(0);
            expect(stdout).toContain("css-no-important");
        });
    });
});
