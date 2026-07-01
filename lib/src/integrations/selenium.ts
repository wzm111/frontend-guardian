/**
 * Selenium / WebdriverIO 外部工具集成（v3.16.0）
 *
 * 优先检测 WebdriverIO 配置（wdio.conf.*）并执行 `npx wdio run`；
 * 否则检测 selenium-webdriver 项目并给出友好提示。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Issue } from "@/types.js";
import type { ExternalTool } from "./base.js";
import { runCommand } from "./base.js";

function hasWdioConfig(projectDir: string): boolean {
    const names = ["wdio.conf.ts", "wdio.conf.js", "wdio.conf.mjs", "wdio.conf.cjs"];
    for (const name of names) {
        if (existsSync(join(projectDir, name))) return true;
    }
    return false;
}

function findWdioConfig(projectDir: string): string | undefined {
    const names = ["wdio.conf.ts", "wdio.conf.js", "wdio.conf.mjs", "wdio.conf.cjs"];
    for (const name of names) {
        if (existsSync(join(projectDir, name))) return name;
    }
    return undefined;
}

function hasSeleniumPackage(projectDir: string): boolean {
    try {
        const pkgPath = join(projectDir, "package.json");
        if (!existsSync(pkgPath)) return false;
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        return !!(deps.selenium || deps["selenium-webdriver"] || deps.webdriverio || deps["@wdio/cli"]);
    } catch {
        return false;
    }
}

export const seleniumIntegration: ExternalTool = {
    name: "Selenium",

    isAvailable(projectDir: string): boolean {
        return hasWdioConfig(projectDir) || hasSeleniumPackage(projectDir);
    },

    run(projectDir: string, _files?: string[]): Issue[] {
        if (hasWdioConfig(projectDir)) {
            const config = findWdioConfig(projectDir);
            const stdout = runCommand(`npx wdio run ${config} --reporters=json`, projectDir, 300000);
            if (!stdout) {
                return [
                    {
                        ruleId: "selenium-wdio-run-failed",
                        title: "Selenium/WebdriverIO 测试运行失败或 CLI 不可用",
                        description:
                            "检测到 wdio.conf.* 配置文件，但执行 `npx wdio run` 失败。请检查 @wdio/cli 是否已安装，或手动运行测试。",
                        severity: "warning",
                        file: config ?? "wdio.conf.ts",
                        line: 1,
                        column: 1,
                        meta: { tool: "selenium" },
                    },
                ];
            }
            return parseWdioStdout(stdout);
        }

        if (hasSeleniumPackage(projectDir)) {
            return [
                {
                    ruleId: "selenium-run-not-implemented",
                    title: "Selenium 项目未配置 WebdriverIO",
                    description:
                        "检测到 selenium-webdriver 依赖，但未找到 wdio.conf.* 配置文件。建议迁移到 WebdriverIO 以获得统一的 JSON 报告输出，或手动运行 Selenium 测试。",
                    severity: "warning",
                    file: "package.json",
                    line: 1,
                    column: 1,
                    meta: { tool: "selenium" },
                },
            ];
        }

        return [
            {
                ruleId: "selenium-not-available",
                title: "未检测到 Selenium 配置",
                description: "未检测到 wdio.conf.* 或 selenium-webdriver/webdriverio 依赖。",
                severity: "warning",
                file: "package.json",
                line: 1,
                column: 1,
                meta: { tool: "selenium" },
            },
        ];
    },
};

function parseWdioStdout(stdout: string): Issue[] {
    // WebdriverIO 的 json reporter 输出可能是一个数组或单行 JSON 对象
    let results: Array<{ state?: string; title?: string; error?: string; file?: string; parent?: string }> = [];
    try {
        const parsed = JSON.parse(stdout);
        if (Array.isArray(parsed)) {
            results = parsed;
        } else if (Array.isArray(parsed?.suites)) {
            results = parsed.suites.flatMap((s: any) => s.tests || []);
        }
    } catch {
        // 无法解析 JSON，可能是 CLI 不可用或 reporter 输出非 JSON
        return [
            {
                ruleId: "selenium-wdio-output-unparseable",
                title: "Selenium/WebdriverIO 输出无法解析",
                description:
                    "`npx wdio run --reporters=json` 的输出不是有效 JSON。请检查 @wdio/cli 是否已安装以及配置是否正确。",
                severity: "warning",
                file: "wdio.conf.ts",
                line: 1,
                column: 1,
                meta: { tool: "selenium" },
            },
        ];
    }

    const issues: Issue[] = [];
    for (const test of results) {
        if (!test || test.state === "passed" || test.state === "skipped") continue;
        issues.push({
            ruleId: "selenium-test-failed",
            title: test.title || "Selenium 测试失败",
            description: test.error || "测试失败",
            severity: "critical",
            file: test.file || "selenium",
            line: 1,
            column: 1,
            meta: {
                tool: "selenium",
                state: test.state,
                suite: test.parent,
            },
        });
    }
    return issues;
}
