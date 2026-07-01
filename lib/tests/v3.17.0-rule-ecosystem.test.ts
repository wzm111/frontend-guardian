/**
 * v3.17.0 — 规则生态与扩展测试
 *
 * 覆盖规则模板生成器、市场索引、规则评分、自定义规则热重载。
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEngine } from "../src/engine/rule-engine.js";
import { RuleRegistry } from "../src/rules/registry.js";
import type { Rule } from "../src/types.js";
import { loadConfig } from "../src/utils/config-loader.js";
import {
    loadDefaultMarketIndexSync,
    loadMarketIndex,
    resolveMarketPackage,
} from "../src/utils/market-index.js";
import { generateRuleTemplate } from "../src/utils/rule-template-generator.js";
import {
    computeRuleScores,
    formatRuleScores,
    formatRuleScoresJson,
    recordFixSuccess,
    setRuleUserRating,
} from "../src/utils/rule-scoring.js";
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

describe("v3.17.0 rule ecosystem", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempProject();
    });

    afterEach(() => {
        cleanupTempProject(tempDir);
    });

    describe("rule-template-generator", () => {
        it("generates JS rule and test files", () => {
            const result = generateRuleTemplate({
                targetDir: join(tempDir, "rules"),
                ruleId: "no-console-log",
                category: "security",
                severity: "warning",
                includeFix: false,
                language: "js",
            });

            expect(existsSync(result.rulePath)).toBe(true);
            expect(existsSync(result.testPath)).toBe(true);
            expect(result.rulePath.endsWith("no-console-log.rule.js")).toBe(true);
            expect(result.testPath.endsWith("no-console-log.rule.test.ts")).toBe(true);

            const ruleContent = readFileSync(result.rulePath, "utf-8");
            expect(ruleContent).toContain('id: "no-console-log"');
            expect(ruleContent).toContain('category: "security"');
            expect(ruleContent).toContain('severity: "warning"');
            expect(ruleContent).not.toContain("// 可选：为 issue 提供自动修复方案");
        });

        it("generates TS rule file when language is ts", () => {
            const result = generateRuleTemplate({
                targetDir: join(tempDir, "rules"),
                ruleId: "no-debugger",
                category: "security",
                severity: "critical",
                includeFix: false,
                language: "ts",
            });

            expect(result.rulePath.endsWith("no-debugger.rule.ts")).toBe(true);
            const ruleContent = readFileSync(result.rulePath, "utf-8");
            expect(ruleContent).toContain('import type { Rule, RuleContext, Issue } from "frontend-guardian-core"');
        });

        it("includes fix placeholder when includeFix is true", () => {
            const result = generateRuleTemplate({
                targetDir: join(tempDir, "rules"),
                ruleId: "fix-demo",
                category: "style",
                severity: "suggestion",
                includeFix: true,
                language: "js",
            });

            const ruleContent = readFileSync(result.rulePath, "utf-8");
            expect(ruleContent).toContain("// 可选：为 issue 提供自动修复方案");
        });

        it("throws on invalid rule id", () => {
            expect(() =>
                generateRuleTemplate({
                    targetDir: join(tempDir, "rules"),
                    ruleId: "NoConsoleLog",
                    category: "security",
                    severity: "warning",
                    includeFix: false,
                    language: "js",
                })
            ).toThrow();
        });
    });

    describe("market-index", () => {
        it("loads default market index synchronously", () => {
            const index = loadDefaultMarketIndexSync();
            expect(index.version).toBe("1.0.0");
            expect(index.packages.length).toBeGreaterThan(0);
            expect(index.packages.some((p) => p.name === "react-hooks")).toBe(true);
        });

        it("resolves package by name", () => {
            const index = loadDefaultMarketIndexSync();
            const pkg = resolveMarketPackage("react-hooks", index);
            expect(pkg).toBeDefined();
            expect(pkg?.npmName).toBe("frontend-guardian-plugin-react-hooks");
        });

        it("returns undefined for unknown package", () => {
            const index = loadDefaultMarketIndexSync();
            expect(resolveMarketPackage("not-exist", index)).toBeUndefined();
        });

        it("loads default index asynchronously when no url", async () => {
            const index = await loadMarketIndex({ projectDir: tempDir });
            expect(index.packages.length).toBeGreaterThan(0);
        });
    });

    describe("config-loader market: extends", () => {
        it("warns but does not crash on unknown market alias", () => {
            writeProjectFile(tempDir, ".frontend-guardian.yml", "extends: market:unknown-alias\n");
            const config = loadConfig(tempDir);
            expect(config.extends).toBe("market:unknown-alias");
        });
    });

    describe("rule-scoring", () => {
        it("returns empty scores when no history", () => {
            const summary = computeRuleScores(tempDir);
            expect(summary.totalScans).toBe(0);
            expect(Object.keys(summary.scores).length).toBe(0);
        });

        it("computes usage counts from history reports", () => {
            const historyDir = join(tempDir, ".frontend-guardian", "history");
            mkdirSync(historyDir, { recursive: true });
            writeFileSync(
                join(historyDir, "20260701-120000.json"),
                JSON.stringify({
                    issues: [
                        { ruleId: "rule-a", file: "a.js", line: 1 },
                        { ruleId: "rule-a", file: "b.js", line: 2 },
                        { ruleId: "rule-b", file: "c.js", line: 3 },
                    ],
                }),
                "utf-8"
            );

            const summary = computeRuleScores(tempDir);
            expect(summary.totalScans).toBe(1);
            expect(summary.scores["rule-a"].usageCount).toBe(2);
            expect(summary.scores["rule-b"].usageCount).toBe(1);
        });

        it("records fix success and updates score", () => {
            recordFixSuccess("rule-a", true, tempDir);
            recordFixSuccess("rule-a", true, tempDir);
            recordFixSuccess("rule-a", false, tempDir);

            const summary = computeRuleScores(tempDir);
            expect(summary.scores["rule-a"].fixSuccessRate).toBeCloseTo(2 / 3, 5);
        });

        it("supports user rating", () => {
            setRuleUserRating("rule-a", 5, tempDir);
            const summary = computeRuleScores(tempDir);
            expect(summary.scores["rule-a"].userRating).toBe(5);
        });

        it("formats scores as JSON", () => {
            recordFixSuccess("rule-a", true, tempDir);
            const summary = computeRuleScores(tempDir);
            const json = formatRuleScoresJson(summary);
            expect(JSON.parse(json)).toHaveProperty("scores");
        });

        it("formats scores as terminal text", () => {
            const summary = computeRuleScores(tempDir);
            const text = formatRuleScores(summary);
            expect(typeof text).toBe("string");
        });
    });

    describe("RuleRegistry.reloadCustomRule", () => {
        it("reloads changed custom rule file", () => {
            const rulePath = join(tempDir, "custom-rule.js");
            writeFileSync(
                rulePath,
                `module.exports = { id: "custom-rule", name: "Custom Rule", description: "v1", severity: "warning", category: "security", defaultEnabled: true, execute: () => [] };`,
                "utf-8"
            );

            const registry = new RuleRegistry();
            registry.loadCustomRule(rulePath);
            expect(registry.getRaw("custom-rule")?.name).toBe("Custom Rule");

            writeFileSync(
                rulePath,
                `module.exports = { id: "custom-rule", name: "Custom Rule Updated", description: "v2", severity: "warning", category: "security", defaultEnabled: true, execute: () => [] };`,
                "utf-8"
            );

            registry.reloadCustomRule(rulePath);
            expect(registry.getRaw("custom-rule")?.name).toBe("Custom Rule Updated");
        });
    });

    describe("CLI flags", () => {
        it("--create-rule generates files", () => {
            const { exitCode, stdout } = runCLI(tempDir, [".", "--create-rule", "cli-demo", "--create-rule-dir", "./rules"]);
            expect(exitCode).toBe(0);
            expect(stdout).toContain("规则模板已生成");
            expect(existsSync(join(tempDir, "rules", "cli-demo.rule.js"))).toBe(true);
        });

        it("--market-index-json outputs valid JSON", () => {
            const { exitCode, stdout } = runCLI(tempDir, [".", "--market-index-json"]);
            expect(exitCode).toBe(0);
            const json = JSON.parse(stdout);
            expect(json.packages.length).toBeGreaterThan(0);
        });

        it("--rule-scores-json outputs valid JSON", () => {
            const { exitCode, stdout } = runCLI(tempDir, [".", "--rule-scores-json"]);
            expect(exitCode).toBe(0);
            const json = JSON.parse(stdout);
            expect(json).toHaveProperty("scores");
            expect(json).toHaveProperty("totalScans");
        });
    });

    describe("RuleEngine reloadCustomRule", () => {
        it("reloads custom rule via engine", () => {
            const rulePath = join(tempDir, "my-rule.js");
            writeFileSync(
                rulePath,
                `module.exports = { id: "my-rule", name: "My Rule", description: "v1", severity: "warning", category: "security", defaultEnabled: true, execute: (ctx) => [{ ruleId: "my-rule", title: "v1", description: "", severity: "warning", file: ctx.filePath, line: 1, column: 1 }] };`,
                "utf-8"
            );

            writeProjectFile(tempDir, ".frontend-guardian.yml", `customRules:\n  - path: ./my-rule.js\n`);
            writeProjectFile(tempDir, "src/example.js", "antipattern\n");

            const engine = createEngine({ projectDir: tempDir });
            const before = engine.scanSingleFile(join(tempDir, "src/example.js"));

            writeFileSync(
                rulePath,
                `module.exports = { id: "my-rule", name: "My Rule", description: "v2", severity: "warning", category: "security", defaultEnabled: true, execute: (ctx) => [{ ruleId: "my-rule", title: "v2", description: "", severity: "warning", file: ctx.filePath, line: 1, column: 1 }] };`,
                "utf-8"
            );

            engine.reloadCustomRule("./my-rule.js");
            const rule = (engine as any).registry.getRaw("my-rule") as Rule;
            expect(rule.description).toBe("v2");
        });
    });
});
