/**
 * Katalon Studio 外部工具集成（v3.16.0）
 *
 * 检测 Katalon 项目（*.prj、Test Cases/、Scripts/）并尝试通过 katalon CLI 运行。
 * 若 CLI 不存在，返回友好提示而非崩溃。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Issue } from "@/types.js";
import type { ExternalTool } from "./base.js";
import { runCommand } from "./base.js";

function findPrjFile(projectDir: string): string | undefined {
    try {
        const entries = readdirSync(projectDir);
        return entries.find((e) => e.endsWith(".prj"));
    } catch {
        return undefined;
    }
}

function hasKatalonDirs(projectDir: string): boolean {
    return ["Test Cases", "Scripts", "Object Repository"].some((d) => existsSync(join(projectDir, d)));
}

function hasKatalonPackage(projectDir: string): boolean {
    try {
        const pkgPath = join(projectDir, "package.json");
        if (!existsSync(pkgPath)) return false;
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        return !!(deps["@katalon/testops"] || deps.katalon);
    } catch {
        return false;
    }
}

function isKatalonCliAvailable(): boolean {
    const result = runCommand("katalon --version 2>/dev/null || echo NOT_FOUND", process.cwd(), 5000);
    return result !== null && !result.includes("NOT_FOUND");
}

export const katalonIntegration: ExternalTool = {
    name: "Katalon",

    isAvailable(projectDir: string): boolean {
        return !!findPrjFile(projectDir) || hasKatalonDirs(projectDir) || hasKatalonPackage(projectDir);
    },

    run(projectDir: string, _files?: string[]): Issue[] {
        if (!isKatalonCliAvailable()) {
            return [
                {
                    ruleId: "katalon-cli-missing",
                    title: "未检测到 Katalon CLI",
                    description:
                        "检测到 Katalon 项目文件，但系统未安装 katalon 命令。请下载 Katalon Runtime Engine 并确保 katalon 在 PATH 中。",
                    severity: "warning",
                    file: findPrjFile(projectDir) || "katalon",
                    line: 1,
                    column: 1,
                    meta: { tool: "katalon" },
                },
            ];
        }

        const prj = findPrjFile(projectDir);
        if (!prj) {
            return [
                {
                    ruleId: "katalon-project-missing",
                    title: "未找到 Katalon 项目文件",
                    description: "未找到 .prj 文件，无法运行 Katalon 测试。",
                    severity: "warning",
                    file: "katalon",
                    line: 1,
                    column: 1,
                    meta: { tool: "katalon" },
                },
            ];
        }

        const stdout = runCommand(
            `katalon -runMode=console -projectPath="${join(projectDir, prj)}" -reportFolder="${join(projectDir, ".frontend-guardian", "katalon-reports")}"`,
            projectDir,
            600000
        );

        return parseKatalonStdout(stdout || "", prj);
    },
};

function parseKatalonStdout(stdout: string, projectFile: string): Issue[] {
    const issues: Issue[] = [];

    // 简单解析失败用例：匹配 ERROR / FAILED 行
    const lines = stdout.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (/^ERROR|^FAILED|Test Cases\/.*FAILED/i.test(trimmed)) {
            issues.push({
                ruleId: "katalon-test-failed",
                title: trimmed.slice(0, 120),
                description: trimmed,
                severity: "critical",
                file: projectFile,
                line: 1,
                column: 1,
                meta: { tool: "katalon" },
            });
        }
    }

    return issues;
}
