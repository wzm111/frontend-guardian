/**
 * v3.11.1: 通用小程序开发者工具 CLI 封装
 *
 * 负责查找 `cli` 可执行文件、检测是否安装，以及调用命令。
 * 开发者工具为可选外部工具，未安装时给出友好提示。
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { MiniProgramPlatform } from "./miniprogram-detect.js";

export interface MiniProgramCliConfig {
    /** 平台标识 */
    platform: MiniProgramPlatform;
    /** 环境变量名 */
    envVar: string;
    /** macOS 默认安装路径 */
    defaultMacPath: string;
    /** Windows 默认安装路径（候选） */
    defaultWinPaths: string[];
    /** CLI 可执行文件名 */
    cliName: string;
    /** 用户提示用的中文名 */
    label: string;
    /** 开发者工具下载链接 */
    downloadUrl: string;
    /** 自动编译命令参数 */
    autoCompileArgs: string[];
    /** 预览命令参数 */
    previewArgs: string[];
    /** 截图命令参数构造 */
    screenshotArgs: (outputPath: string) => string[];
    /** 性能采集命令参数（可选；平台 CLI 不一定支持） */
    performanceArgs?: string[];
}

export interface MiniProgramDevToolsRunOptions {
    /** 项目目录 */
    projectDir: string;
    /** 额外传递给 cli 的参数 */
    args: string[];
    /** 超时时间（毫秒） */
    timeoutMs?: number;
}

/** 返回候选的 cli 路径列表 */
export function getDevToolsCliCandidates(config: MiniProgramCliConfig): string[] {
    const candidates: string[] = [];

    // 1. 环境变量优先
    if (process.env[config.envVar]) {
        candidates.push(process.env[config.envVar] as string);
    }

    // 2. 默认安装路径
    candidates.push(config.defaultMacPath);
    candidates.push(...config.defaultWinPaths);

    return candidates;
}

/** 检测指定平台开发者工具 CLI 是否可用 */
export function isDevToolsAvailable(config: MiniProgramCliConfig): boolean {
    return !!findDevToolsCli(config);
}

/** 查找可用的 cli 路径 */
export function findDevToolsCli(config: MiniProgramCliConfig): string | undefined {
    for (const candidate of getDevToolsCliCandidates(config)) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    // 3. 尝试 PATH 中的 cli（Linux / 自定义安装）
    try {
        const which = process.platform === "win32" ? `where ${config.cliName}` : `which ${config.cliName}`;
        const found = execSync(which, { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] })
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)[0];
        if (found && existsSync(found)) {
            return found;
        }
    } catch {
        // ignore
    }

    return undefined;
}

/**
 * 调用指定平台开发者工具 CLI
 * @returns stdout 内容，失败时返回 null
 */
export function runDevTools(options: MiniProgramDevToolsRunOptions, config: MiniProgramCliConfig): string | null {
    const cli = findDevToolsCli(config);
    if (!cli) {
        return null;
    }

    const args = [...options.args, "--project", options.projectDir];
    const cmd = `"${cli}" ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`;

    try {
        return execSync(cmd, {
            cwd: options.projectDir,
            encoding: "utf-8",
            timeout: options.timeoutMs ?? 120000,
            stdio: ["pipe", "pipe", "pipe"],
        });
    } catch (err: unknown) {
        if (err instanceof Error && "stdout" in err && typeof (err as { stdout?: string }).stdout === "string") {
            return (err as { stdout: string }).stdout;
        }
        return null;
    }
}

/** 自动编译 */
export function runAutoCompile(config: MiniProgramCliConfig, projectDir: string, timeoutMs = 120000): string | null {
    return runDevTools({ projectDir, args: config.autoCompileArgs, timeoutMs }, config);
}

/** 生成预览 */
export function runPreview(config: MiniProgramCliConfig, projectDir: string, timeoutMs = 120000): string | null {
    return runDevTools({ projectDir, args: config.previewArgs, timeoutMs }, config);
}

/** 截图 */
export function runScreenshot(
    config: MiniProgramCliConfig,
    projectDir: string,
    outputPath: string,
    timeoutMs = 60000
): string | null {
    return runDevTools({ projectDir, args: config.screenshotArgs(outputPath), timeoutMs }, config);
}

/** 性能采集；平台未配置 performanceArgs 时返回 null */
export function runPerformance(config: MiniProgramCliConfig, projectDir: string, timeoutMs = 120000): string | null {
    if (!config.performanceArgs || config.performanceArgs.length === 0) {
        return null;
    }
    return runDevTools({ projectDir, args: config.performanceArgs, timeoutMs }, config);
}

/** 从编译输出中粗略统计 error / warning 数量 */
export function parseCompileOutput(output: string): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const lines = output.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // 匹配常见错误/警告前缀：error: / warn: / [error] / [warn]
        if (/^(error|\[error\]|\[ERR\]|\[ERROR\])/i.test(trimmed)) {
            errors.push(trimmed);
        } else if (/^(warn|warning|\[warn\]|\[WARN\]|\[WARNING\])/i.test(trimmed)) {
            warnings.push(trimmed);
        }
    }

    return { errors, warnings };
}
