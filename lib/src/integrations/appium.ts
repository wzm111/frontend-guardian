/**
 * v4.0.0: Appium 移动端测试集成
 *
 * 调用 WebdriverIO（npx wdio run）执行 Appium 测试套件，
 * 解析 JSON 报告并将失败用例转换为 frontend-guardian Issue。
 */

import type { Issue } from "@/types.js";
import { TestHistoryReport } from "@/utils/test-history.js";
import type { ExternalTool } from "./base.js";
import { runCommand } from "./base.js";
import { detectAppium, parseWdioJsonReport, type WdioTestCase } from "./mobile-shared.js";

export interface AppiumTestCase extends WdioTestCase {}

const WDIO_CONFIG_NAMES = ["wdio.conf.js", "wdio.conf.ts", "wdio.conf.mjs", "wdio.conf.cjs"];

export function detectAppiumProject(projectDir: string): { wdioConfig?: string; hasAppium: boolean } {
    return detectAppium(projectDir);
}

export function parseAppiumWdioReport(stdout: string): AppiumTestCase[] {
    return parseWdioJsonReport(stdout);
}

export function runAppiumWdio(projectDir: string, wdioConfig: string): AppiumTestCase[] {
    const stdout = runCommand(
        `npx wdio run "${wdioConfig}" --reporters=json`,
        projectDir,
        300000
    );
    if (!stdout) return [];
    return parseAppiumWdioReport(stdout);
}

function recordAppiumReport(projectDir: string, cases: AppiumTestCase[]): void {
    try {
        const report = new TestHistoryReport(projectDir);
        report.recordRun(
            cases.map((c) => ({
                testFile: c.testName,
                status: c.state === "passed" ? "passed" : c.state === "skipped" ? "skipped" : "failed",
                duration: c.duration,
            }))
        );
    } catch {
        // ignore persistence failures
    }
}

export const appiumIntegration: ExternalTool = {
    name: "Appium",

    isAvailable(projectDir: string): boolean {
        return detectAppium(projectDir).hasAppium;
    },

    run(projectDir: string, _files?: string[]): Issue[] {
        const detected = detectAppiumProject(projectDir);

        if (!detected.wdioConfig) {
            return [
                {
                    ruleId: "appium-no-wdio-config",
                    title: "未找到 WebdriverIO 配置文件",
                    description:
                        "检测到 Appium 依赖，但未找到 wdio.conf.js / wdio.conf.ts。请创建 WebdriverIO 配置文件以运行 Appium 测试。",
                    severity: "suggestion",
                    file: "package.json",
                    line: 1,
                    column: 1,
                    meta: { tool: "appium" },
                },
            ];
        }

        const cases = runAppiumWdio(projectDir, detected.wdioConfig);
        recordAppiumReport(projectDir, cases);

        if (cases.length === 0) {
            return [
                {
                    ruleId: "appium-wdio-output-unparseable",
                    title: "无法解析 WebdriverIO 输出",
                    description:
                        "Appium / WebdriverIO 已执行，但未能解析 JSON reporter 输出。请确认 wdio.conf.* 中配置了 json reporter。",
                    severity: "warning",
                    file: detected.wdioConfig,
                    line: 1,
                    column: 1,
                    meta: { tool: "appium" },
                },
            ];
        }

        const issues: Issue[] = [];
        for (const c of cases) {
            if (c.state === "passed" || c.state === "skipped") continue;

            issues.push({
                ruleId: "appium-test-failed",
                title: `Appium 测试失败: ${c.testName}`,
                description: c.error || "Appium 测试用例执行失败",
                severity: "critical",
                file: c.file || detected.wdioConfig,
                line: 1,
                column: 1,
                source: c.error,
                meta: {
                    tool: "appium",
                    testName: c.testName,
                    device: c.device,
                    sessionId: c.sessionId,
                    duration: c.duration,
                },
            });
        }

        return issues;
    },
};

export { WDIO_CONFIG_NAMES };
