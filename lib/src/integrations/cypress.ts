/**
 * Cypress 外部工具集成（v3.16.0）
 *
 * 调用 `npx cypress run --reporter=json` 执行 E2E 测试，
 * 解析 JSON 报告并将失败的测试用例转换为 frontend-guardian Issue 格式。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Issue } from "@/types.js";
import { TestHistoryReport } from "@/utils/test-history.js";
import type { ExternalTool } from "./base.js";
import { runCommand } from "./base.js";

interface CypressRun {
    stats?: {
        failures?: number;
    };
    tests?: CypressTest[];
}

interface CypressTest {
    title: string[];
    state: "passed" | "failed" | "pending" | "skipped";
    displayError?: string;
    attempts?: CypressAttempt[];
}

interface CypressAttempt {
    state: "passed" | "failed" | "pending" | "skipped";
    error?: {
        message?: string;
        stack?: string;
    };
}

function hasCypressConfig(projectDir: string): boolean {
    const names = ["cypress.config.ts", "cypress.config.js", "cypress.config.mjs", "cypress.config.cjs", "cypress.json"];
    for (const name of names) {
        if (existsSync(join(projectDir, name))) return true;
    }
    return false;
}

function parseCypressJson(stdout: string): CypressRun | null {
    try {
        return JSON.parse(stdout) as CypressRun;
    } catch {
        return null;
    }
}

export const cypressIntegration: ExternalTool = {
    name: "Cypress",

    isAvailable(projectDir: string): boolean {
        if (hasCypressConfig(projectDir)) return true;
        try {
            const pkgPath = join(projectDir, "package.json");
            if (existsSync(pkgPath)) {
                const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
                const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                if (deps.cypress) return true;
            }
        } catch {
            // ignore
        }
        return false;
    },

    run(projectDir: string, _files?: string[]): Issue[] {
        const stdout = runCommand("npx cypress run --reporter=json --quiet", projectDir, 300000);
        if (!stdout) {
            return [];
        }

        const report = parseCypressJson(stdout);
        if (!report || !report.tests) {
            return [];
        }

        const issues: Issue[] = [];
        for (const test of report.tests) {
            if (test.state === "passed" || test.state === "skipped" || test.state === "pending") continue;

            const error = test.attempts?.find((a) => a.state === "failed")?.error;
            const title = test.title.join(" > ");
            issues.push({
                ruleId: "cypress-test-failed",
                title,
                description: error?.message || test.displayError || "测试失败",
                severity: "critical",
                file: "cypress",
                line: 1,
                column: 1,
                source: error?.stack || error?.message || test.displayError,
                meta: {
                    tool: "cypress",
                    testTitle: title,
                    state: test.state,
                },
            });
        }

        recordCypressReport(projectDir, report);
        return issues;
    },
};

function recordCypressReport(projectDir: string, report: CypressRun): void {
    try {
        const records: { testFile: string; status: "passed" | "failed" | "skipped"; duration?: number }[] = [];
        if (report.tests) {
            const failed = report.tests.some((t) => t.state === "failed");
            const passed = report.tests.some((t) => t.state === "passed");
            const status: "passed" | "failed" | "skipped" = failed ? "failed" : passed ? "passed" : "skipped";
            records.push({
                testFile: "cypress",
                status,
            });
        }
        if (records.length > 0) {
            new TestHistoryReport(projectDir).recordRun(records);
        }
    } catch {
        // ignore
    }
}
