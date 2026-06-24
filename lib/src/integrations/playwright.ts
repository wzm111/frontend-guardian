/**
 * Playwright 外部工具集成（v3.6.1）
 *
 * 调用 `npx playwright test --reporter=json` 执行 E2E 测试，
 * 解析 JSON 报告并将失败的测试用例转换为 frontend-guardian Issue 格式。
 *
 * 设计理念：skill 作为统一入口，用户无需记忆多个命令。
 * `fg-core . --external` 自动触发 Playwright 测试并聚合结果。
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Issue } from "@/types.js";
import { TestHistoryReport } from "@/utils/test-history.js";
import type { ExternalTool } from "./base.js";
import { runCommand } from "./base.js";

/** Playwright JSON 报告结构（简化） */
interface PlaywrightReport {
    config?: unknown;
    suites?: PlaywrightSuite[];
    errors?: PlaywrightError[];
}

interface PlaywrightSuite {
    title: string;
    file: string;
    specs: PlaywrightSpec[];
}

interface PlaywrightSpec {
    title: string;
    ok: boolean;
    tests: PlaywrightTest[];
}

interface PlaywrightTest {
    projectName: string;
    results: PlaywrightResult[];
}

interface PlaywrightResult {
    status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted";
    duration: number;
    error?: {
        message?: string;
        stack?: string;
        location?: {
            file: string;
            line: number;
            column: number;
        };
    };
    retry?: number;
    steps?: PlaywrightStep[];
}

interface PlaywrightStep {
    title: string;
    duration: number;
    error?: {
        message?: string;
        stack?: string;
    };
}

interface PlaywrightError {
    message?: string;
    stack?: string;
    location?: {
        file: string;
        line: number;
        column: number;
    };
}

/** 检测项目是否配置了 Playwright */
function hasPlaywrightConfig(projectDir: string): boolean {
    const configNames = [
        "playwright.config.ts",
        "playwright.config.js",
        "playwright.config.mjs",
        "playwright.config.cjs",
    ];
    for (const name of configNames) {
        if (existsSync(join(projectDir, name))) {
            return true;
        }
    }
    return false;
}

/** 从错误堆栈中提取文件路径和行号 */
function extractLocationFromStack(stack: string | undefined): { file?: string; line?: number; column?: number } {
    if (!stack) return {};
    // 匹配堆栈中的文件路径和行号
    // 例如：at /project/tests/login.spec.ts:15:23
    const match = stack.match(/at\s+(?:.*\s+\()?(.+?):(\d+):(\d+)\)?/);
    if (match) {
        return {
            file: match[1],
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10),
        };
    }
    return {};
}

export const playwrightIntegration: ExternalTool = {
    name: "Playwright",

    isAvailable(projectDir: string): boolean {
        // 优先检查配置文件，避免全局安装的 playwright 包导致误判
        if (hasPlaywrightConfig(projectDir)) {
            return true;
        }
        // 检查 package.json 中是否有 @playwright/test 依赖
        try {
            const pkgPath = join(projectDir, "package.json");
            if (existsSync(pkgPath)) {
                const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
                const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                if (deps["@playwright/test"] || deps.playwright) {
                    return true;
                }
            }
        } catch {
            // ignore
        }
        return false;
    },

    run(projectDir: string, _files?: string[]): Issue[] {
        // 执行 Playwright 测试，输出 JSON 报告
        // --reporter=json 输出到 stdout
        // --quiet 减少噪音输出
        const stdout = runCommand(
            "npx playwright test --reporter=json --quiet",
            projectDir,
            300000 // 5 分钟超时，E2E 测试可能较慢
        );

        if (!stdout) {
            return [];
        }

        let report: PlaywrightReport;
        try {
            report = JSON.parse(stdout);
        } catch {
            // JSON 解析失败，可能是 Playwright 未安装或配置错误
            return [];
        }

        const issues: Issue[] = [];

        // 解析 suites 中的失败测试
        if (report.suites) {
            for (const suite of report.suites) {
                for (const spec of suite.specs) {
                    if (spec.ok) continue; // 跳过通过的测试

                    for (const test of spec.tests) {
                        for (const result of test.results) {
                            if (result.status === "passed" || result.status === "skipped") continue;

                            const errorMsg = result.error?.message || "测试失败";
                            const stack = result.error?.stack || "";
                            const location = result.error?.location || extractLocationFromStack(stack);

                            // 从错误堆栈中提取文件和行号
                            const loc = location || extractLocationFromStack(stack);

                            issues.push({
                                ruleId: "playwright-test-failed",
                                title: `${spec.title} (${test.projectName})`,
                                description: formatErrorDescription(errorMsg, stack, result.steps),
                                severity: "critical",
                                file: loc.file || suite.file,
                                line: loc.line || 1,
                                column: loc.column || 1,
                                source: errorMsg,
                                meta: {
                                    tool: "playwright",
                                    testTitle: spec.title,
                                    suiteTitle: suite.title,
                                    projectName: test.projectName,
                                    status: result.status,
                                    duration: result.duration,
                                    retry: result.retry,
                                    file: suite.file,
                                },
                            });
                        }
                    }
                }
            }
        }

        // 解析全局 errors（如 beforeAll/afterAll 钩子失败）
        if (report.errors) {
            for (const error of report.errors) {
                const loc = error.location || extractLocationFromStack(error.stack);
                issues.push({
                    ruleId: "playwright-setup-error",
                    title: "Playwright 全局错误",
                    description: error.message || "未知错误",
                    severity: "critical",
                    file: loc.file || "",
                    line: loc.line || 1,
                    column: loc.column || 1,
                    source: error.stack || error.message,
                    meta: {
                        tool: "playwright",
                        stack: error.stack,
                    },
                });
            }
        }

        // v3.12.1: 记录测试历史，用于 flaky 测试预警
        recordPlaywrightReport(projectDir, report);

        return issues;
    },
};

/** 将 Playwright JSON 报告结果记录到测试历史 */
function recordPlaywrightReport(projectDir: string, report: PlaywrightReport): void {
    try {
        const records: { testFile: string; status: "passed" | "failed" | "skipped"; duration?: number }[] = [];

        if (report.suites) {
            for (const suite of report.suites) {
                const suiteFile = suite.file;
                if (!suiteFile) continue;

                let failed = false;
                let passed = false;
                let totalDuration = 0;

                for (const spec of suite.specs) {
                    for (const test of spec.tests) {
                        for (const result of test.results) {
                            totalDuration += result.duration || 0;
                            if (
                                result.status === "failed" ||
                                result.status === "timedOut" ||
                                result.status === "interrupted"
                            ) {
                                failed = true;
                            } else if (result.status === "passed") {
                                passed = true;
                            }
                        }
                    }
                }

                const status: "passed" | "failed" | "skipped" = failed ? "failed" : passed ? "passed" : "skipped";
                records.push({
                    testFile: suiteFile.startsWith("/") ? suiteFile : resolve(projectDir, suiteFile),
                    status,
                    duration: totalDuration,
                });
            }
        }

        if (records.length > 0) {
            new TestHistoryReport(projectDir).recordRun(records);
        }
    } catch {
        // 记录历史失败不应影响主流程
    }
}

/** 格式化错误描述，包含堆栈和步骤信息 */
function formatErrorDescription(message: string, stack: string, steps?: PlaywrightStep[]): string {
    const parts: string[] = [message];

    if (steps && steps.length > 0) {
        const failedStep = steps.find((s) => s.error);
        if (failedStep) {
            parts.push(`\n失败步骤: ${failedStep.title} (${failedStep.duration}ms)`);
            if (failedStep.error?.message) {
                parts.push(`  错误: ${failedStep.error.message}`);
            }
        }
    }

    // 只保留堆栈的前 5 行，避免过长
    if (stack) {
        const stackLines = stack.split("\n").slice(0, 5);
        parts.push(`\n堆栈:\n${stackLines.join("\n")}`);
    }

    return parts.join("");
}
