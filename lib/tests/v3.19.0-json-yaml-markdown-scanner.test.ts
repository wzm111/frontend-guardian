/**
 * v3.19.0 — JSON/YAML/Markdown 扫描器测试
 *
 * 覆盖 data-scanner 中所有规则与 CLI --module data 集成。
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dataRules } from "../src/scanners/data-scanner.js";
import type { Rule } from "../src/types.js";
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
    const rule = dataRules.find((r) => r.id === id);
    if (!rule) throw new Error(`Rule not found: ${id}`);
    return rule;
}

describe("v3.19.0 json/yaml/markdown scanner", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempProject();
    });

    afterEach(() => {
        cleanupTempProject(tempDir);
    });

    describe("json rules", () => {
        it("reports invalid JSON syntax", () => {
            const rule = getRule("json-invalid-syntax");
            const ctx = createMinimalContext(
                '{\n  "name": "app"\n  "version": "1.0"\n}',
                join(tempDir, "config.json")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBeGreaterThan(0);
            expect(issues[0].ruleId).toBe("json-invalid-syntax");
            expect(issues[0].severity).toBe("critical");
        });

        it("reports reasonable position for invalid JSON", () => {
            const rule = getRule("json-invalid-syntax");
            const ctx = createMinimalContext('{\n  "name": "app",\n}', join(tempDir, "config.json"));
            const issues = rule.execute(ctx);
            expect(issues.length).toBeGreaterThan(0);
            expect(issues[0].line).toBeGreaterThanOrEqual(1);
        });

        it("reports trailing comma in object", () => {
            const rule = getRule("json-trailing-comma");
            const ctx = createMinimalContext(
                '{\n  "name": "app",\n}',
                join(tempDir, "config.json")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("json-trailing-comma");
        });

        it("reports trailing comma in array", () => {
            const rule = getRule("json-trailing-comma");
            const ctx = createMinimalContext('[1, 2,]', join(tempDir, "config.json"));
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("json-trailing-comma");
        });

        it("does not report trailing comma inside string", () => {
            const rule = getRule("json-trailing-comma");
            const ctx = createMinimalContext('["a,", "b,"]', join(tempDir, "config.json"));
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(0);
        });

        it("detects duplicate keys at same level", () => {
            const rule = getRule("json-duplicate-key");
            const ctx = createMinimalContext(
                '{\n  "name": "a",\n  "name": "b"\n}',
                join(tempDir, "config.json")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("json-duplicate-key");
            expect(issues[0].title).toContain("name");
        });

        it("does not flag same key in nested objects", () => {
            const rule = getRule("json-duplicate-key");
            const ctx = createMinimalContext(
                '{\n  "name": "a",\n  "nested": {\n    "name": "b"\n  }\n}',
                join(tempDir, "config.json")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(0);
        });
    });

    describe("yaml rules", () => {
        it("reports invalid YAML syntax", () => {
            const rule = getRule("yaml-invalid-syntax");
            const ctx = createMinimalContext(
                "name: app\n  version: 1", // invalid indent
                join(tempDir, "config.yml")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBeGreaterThan(0);
            expect(issues[0].ruleId).toBe("yaml-invalid-syntax");
            expect(issues[0].severity).toBe("critical");
        });

        it("detects duplicate mapping keys", () => {
            const rule = getRule("yaml-duplicate-key");
            const ctx = createMinimalContext(
                "name: app\nname: other\n",
                join(tempDir, "config.yaml")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("yaml-duplicate-key");
        });

        it("detects empty value key", () => {
            const rule = getRule("yaml-empty-value");
            const ctx = createMinimalContext(
                "name: app\nsecret:\n",
                join(tempDir, "config.yaml")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("yaml-empty-value");
            expect(issues[0].title).toContain("secret");
        });

        it("does not report explicit null as empty value", () => {
            const rule = getRule("yaml-empty-value");
            const ctx = createMinimalContext(
                "name: app\nsecret: ~\n",
                join(tempDir, "config.yaml")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(0);
        });
    });

    describe("markdown rules", () => {
        it("detects TODO placeholder link", () => {
            const rule = getRule("markdown-no-todo-link");
            const ctx = createMinimalContext(
                "# Doc\n\nSee [details](TODO).\n",
                join(tempDir, "README.md")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("markdown-no-todo-link");
        });

        it("detects empty link", () => {
            const rule = getRule("markdown-empty-link");
            const ctx = createMinimalContext(
                "# Doc\n\nSee [details]().\n",
                join(tempDir, "README.md")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("markdown-empty-link");
        });

        it("detects duplicate heading at same level", () => {
            const rule = getRule("markdown-duplicate-heading");
            const ctx = createMinimalContext(
                "## Setup\n\nText\n\n## Setup\n",
                join(tempDir, "README.md")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("markdown-duplicate-heading");
        });

        it("allows same heading text at different levels", () => {
            const rule = getRule("markdown-duplicate-heading");
            const ctx = createMinimalContext(
                "# Setup\n\n## Setup\n",
                join(tempDir, "README.md")
            );
            const issues = rule.execute(ctx);
            expect(issues.length).toBe(0);
        });
    });

    describe("CLI --module data", () => {
        it("scans json files", () => {
            writeProjectFile(tempDir, "config.json", '{\n  "name": "app",\n  "name": "other"\n}');
            const { exitCode, stdout } = runCLI(tempDir, [".", "--module", "data", "--files", "config.json"]);
            expect(exitCode).toBe(0);
            expect(stdout).toContain("json-duplicate-key");
        });

        it("scans yaml files", () => {
            writeProjectFile(tempDir, "config.yaml", "name: app\nname: other\n");
            const { exitCode, stdout } = runCLI(tempDir, [".", "--module", "data", "--files", "config.yaml"]);
            expect(exitCode).toBe(0);
            expect(stdout).toContain("yaml-duplicate-key");
        });

        it("scans markdown files", () => {
            writeProjectFile(tempDir, "README.md", "# Doc\n\nSee [details](TODO).\n");
            const { exitCode, stdout } = runCLI(tempDir, [".", "--module", "data", "--files", "README.md"]);
            expect(exitCode).toBe(0);
            expect(stdout).toContain("markdown-no-todo-link");
        });
    });
});
