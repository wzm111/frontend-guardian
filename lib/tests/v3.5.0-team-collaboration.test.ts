import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── CODEOWNERS ──
import {
    parseCodeowners,
    matchOwner,
    loadCodeowners,
    CodeownersParser,
} from "../src/utils/codeowners.js";

// ── Notification ──
import {
    buildNotificationPayload,
    detectNotificationConfig,
} from "../src/utils/notification.js";

// ── Remote Baseline ──
import { downloadBaseline, loadBaselineAsync } from "../src/utils/baseline.js";

describe("v3.5.0 — Enterprise Team Collaboration", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-v35-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    describe("CODEOWNERS parser", () => {
        it("should parse GitHub-style CODEOWNERS", () => {
            const content = `
# Global owner
* @global-owner

# JS files
*.js @js-owner

# Source directory
/src/ @src-team

# Specific file
/docs/README.md @docs-team @backup-owner
            `;
            const entries = parseCodeowners(content);
            expect(entries).toHaveLength(4);
            expect(entries[0]).toEqual({ pattern: "*", owners: ["@global-owner"] });
            expect(entries[2]).toEqual({ pattern: "/src/", owners: ["@src-team"] });
            expect(entries[3]).toEqual({
                pattern: "/docs/README.md",
                owners: ["@docs-team", "@backup-owner"],
            });
        });

        it("should skip empty lines and comments", () => {
            const content = `
# This is a comment

* @owner
# Another comment
*.ts @ts-owner
            `;
            const entries = parseCodeowners(content);
            expect(entries).toHaveLength(2);
        });

        it("should skip lines without owners", () => {
            const content = `
* @owner
*.js no-owner-here
*.ts @ts-owner
            `;
            const entries = parseCodeowners(content);
            expect(entries).toHaveLength(2);
        });

        it("should match owner by glob pattern", () => {
            const entries = [
                { pattern: "*", owners: ["@global"] },
                { pattern: "*.js", owners: ["@js-team"] },
                { pattern: "/src/", owners: ["@src-team"] },
                { pattern: "/docs/", owners: ["@docs-team"] },
            ];

            expect(matchOwner("app.js", entries)).toBe("js-team");
            expect(matchOwner("src/utils/helper.ts", entries)).toBe("src-team");
            expect(matchOwner("docs/guide.md", entries)).toBe("docs-team");
            expect(matchOwner("random.txt", entries)).toBe("global");
        });

        it("later rules should override earlier ones", () => {
            const entries = [
                { pattern: "*", owners: ["@global"] },
                { pattern: "*.js", owners: ["@js-team"] },
            ];
            expect(matchOwner("app.js", entries)).toBe("js-team");
        });

        it("should load CODEOWNERS from .github/CODEOWNERS", () => {
            const githubDir = join(tempDir, ".github");
            mkdirSync(githubDir);
            writeFileSync(join(githubDir, "CODEOWNERS"), "* @team-lead\n");

            const result = loadCodeowners(tempDir);
            expect(result.entries).toHaveLength(1);
            expect(result.entries[0].owners).toEqual(["@team-lead"]);
            expect(result.sourcePath).toBe(".github/CODEOWNERS");
        });

        it("should load CODEOWNERS from root CODEOWNERS", () => {
            writeFileSync(join(tempDir, "CODEOWNERS"), "* @root-owner\n");

            const result = loadCodeowners(tempDir);
            expect(result.entries).toHaveLength(1);
            expect(result.sourcePath).toBe("CODEOWNERS");
        });

        it("should return empty entries when no CODEOWNERS found", () => {
            const result = loadCodeowners(tempDir);
            expect(result.entries).toHaveLength(0);
            expect(result.sourcePath).toBeUndefined();
        });

        it("CodeownersParser should provide OO interface", () => {
            writeFileSync(join(tempDir, "CODEOWNERS"), "* @lead\n/src/ @dev-team\n");

            const parser = new CodeownersParser(tempDir);
            expect(parser.hasCodeowners()).toBe(true);
            expect(parser.getSourcePath()).toBe("CODEOWNERS");
            expect(parser.getOwner("app.js")).toBe("lead");
            expect(parser.getOwner("src/main.ts")).toBe("dev-team");
            expect(parser.getOwner("README.md")).toBe("lead");
        });
    });

    describe("Notification system", () => {
        it("should build notification payload from scan results", () => {
            const results = [
                {
                    module: "i18n",
                    total: 3,
                    issues: {
                        critical: [
                            { file: "a.js", line: 1, column: 1, ruleId: "r1", title: "T1", description: "D1", severity: "critical" as const },
                        ],
                        warning: [
                            { file: "b.js", line: 2, column: 1, ruleId: "r2", title: "T2", description: "D2", severity: "warning" as const },
                        ],
                        suggestion: [
                            { file: "c.js", line: 3, column: 1, ruleId: "r3", title: "T3", description: "D3", severity: "suggestion" as const },
                        ],
                    },
                    duration: 100,
                    filesScanned: 10,
                    filesWithIssues: 3,
                },
            ];

            const payload = buildNotificationPayload(results, {
                project: "/my-project",
                duration: 500,
                gatePassed: true,
                reportUrl: "https://example.com/report",
            });

            expect(payload.project).toBe("/my-project");
            expect(payload.modules).toEqual(["i18n"]);
            expect(payload.totalIssues).toBe(3);
            expect(payload.issuesBySeverity).toEqual({ critical: 1, warning: 1, suggestion: 1 });
            expect(payload.duration).toBe(500);
            expect(payload.gatePassed).toBe(true);
            expect(payload.reportUrl).toBe("https://example.com/report");
            expect(payload.topIssues).toHaveLength(3);
            expect(payload.topIssues[0].severity).toBe("critical");
        });

        it("should take top 5 most severe issues", () => {
            const issues = Array.from({ length: 10 }, (_, i) => ({
                file: `f${i}.js`,
                line: i + 1,
                column: 1,
                ruleId: `r${i}`,
                title: `T${i}`,
                description: "D",
                severity: (i < 3 ? "critical" : i < 7 ? "warning" : "suggestion") as "critical" | "warning" | "suggestion",
            }));

            const results = [
                {
                    module: "security",
                    total: 10,
                    issues: {
                        critical: issues.filter((i) => i.severity === "critical"),
                        warning: issues.filter((i) => i.severity === "warning"),
                        suggestion: issues.filter((i) => i.severity === "suggestion"),
                    },
                    duration: 100,
                    filesScanned: 10,
                    filesWithIssues: 10,
                },
            ];

            const payload = buildNotificationPayload(results, { project: "p", duration: 100 });
            expect(payload.topIssues).toHaveLength(5);
        });

        it("should detect notification config from environment variables", () => {
            const originalEnv = { ...process.env };
            process.env.FG_NOTIFY_SLACK = "https://hooks.slack.com/test";
            process.env.FG_NOTIFY_FEISHU = "https://open.feishu.cn/test";

            const config = detectNotificationConfig();
            expect(config.slack?.enabled).toBe(true);
            expect(config.slack?.webhook).toBe("https://hooks.slack.com/test");
            expect(config.feishu?.enabled).toBe(true);
            expect(config.dingtalk).toBeUndefined();

            Object.assign(process.env, originalEnv);
        });
    });

    describe("Remote baseline", () => {
        it("should return fallback baseline on network error", async () => {
            const result = await downloadBaseline("https://invalid-domain-xyz.test/baseline.json");
            expect(result.error).toBeTruthy();
            expect(result.data.version).toBe("1.0");
            expect(result.data.issues).toEqual([]);
            expect(result.cached).toBe(false);
        });

        it("should return fallback baseline on HTTP error", async () => {
            // Using a URL that returns 404
            const result = await downloadBaseline("https://httpbin.org/status/404");
            expect(result.error).toContain("HTTP 404");
            expect(result.data.issues).toEqual([]);
        });

        it("loadBaselineAsync should support local file", async () => {
            const baselinePath = join(tempDir, "baseline.json");
            writeFileSync(
                baselinePath,
                JSON.stringify({ version: "1.0", generatedAt: Date.now(), issues: [] })
            );

            const result = await loadBaselineAsync(baselinePath);
            expect(result).not.toBeNull();
            expect(result?.version).toBe("1.0");
        });

        it("loadBaselineAsync should return fallback for missing local file", async () => {
            const result = await loadBaselineAsync(join(tempDir, "nonexistent.json"));
            expect(result).toBeNull();
        });
    });
});

import { mkdirSync as fsMkdirSync } from "node:fs";

function mkdirSync(path: string) {
    fsMkdirSync(path, { recursive: true });
}
