/**
 * 外部工具集成基础层
 *
 * Phase 4 核心能力：将 ESLint / TypeScript / Stylelint 等外部工具的输出
 * 统一转换为 frontend-guardian 的 Issue 格式，实现一站式治理。
 */

import { execSync } from "node:child_process";
import type { Issue, Severity } from "../types.js";
import pc from "picocolors";

/** 外部工具集成接口 */
export interface ExternalTool {
    /** 工具名称 */
    name: string;
    /** 检测该工具是否可在项目中使用 */
    isAvailable(projectDir: string): boolean;
    /** 执行检查并返回统一 Issue 列表 */
    run(projectDir: string, files?: string[]): Issue[];
}

/** 外部工具执行结果 */
export interface ExternalToolResult {
    tool: string;
    issues: Issue[];
    duration: number;
    stdout?: string;
    stderr?: string;
}

/**
 * 执行 shell 命令并捕获输出
 * @returns stdout 内容，失败时返回 null
 */
export function runCommand(cmd: string, cwd: string, timeoutMs = 60000): string | null {
    try {
        return execSync(cmd, {
            cwd,
            encoding: "utf-8",
            timeout: timeoutMs,
            stdio: ["pipe", "pipe", "pipe"],
        });
    } catch (err: any) {
        // 很多 linter 在发现问题时返回非零退出码，但 stdout 仍有有效输出
        if (err.stdout) {
            return err.stdout as string;
        }
        return null;
    }
}

/**
 * 将 ESLint severity (1/2) 映射为 frontend-guardian Severity
 */
export function eslintSeverityToFg(severity: number): Severity {
    switch (severity) {
        case 2:
            return "critical";
        case 1:
            return "warning";
        default:
            return "suggestion";
    }
}

/**
 * 检查项目是否安装了某 npm 包（本地或全局）
 */
export function hasPackage(projectDir: string, pkgName: string): boolean {
    const result = runCommand(
        `npx --no-install ${pkgName} --version 2>/dev/null || echo "NOT_FOUND"`,
        projectDir,
        5000
    );
    return result !== null && !result.includes("NOT_FOUND") && !result.includes("cannot find");
}

/**
 * 检查项目中是否有配置文件
 */
export function hasConfigFile(projectDir: string, filenames: string[]): boolean {
    for (const name of filenames) {
        try {
            execSync(`test -f "${name}"`, { cwd: projectDir, stdio: "ignore" });
            return true;
        } catch {
            // continue
        }
    }
    return false;
}

/** 运行所有可用的外部工具 */
export function runAllExternalTools(projectDir: string, tools: ExternalTool[], files?: string[]): ExternalToolResult[] {
    const results: ExternalToolResult[] = [];

    for (const tool of tools) {
        if (!tool.isAvailable(projectDir)) {
            continue;
        }

        const start = Date.now();
        try {
            const issues = tool.run(projectDir, files);
            results.push({
                tool: tool.name,
                issues,
                duration: Date.now() - start,
            });
            console.log(pc.blue(`🔌 [${tool.name}] 发现 ${issues.length} 个问题`));
        } catch (err) {
            results.push({
                tool: tool.name,
                issues: [],
                duration: Date.now() - start,
                stderr: String(err),
            });
            console.log(pc.yellow(`⚠️  [${tool.name}] 执行失败: ${err}`));
        }
    }

    return results;
}
