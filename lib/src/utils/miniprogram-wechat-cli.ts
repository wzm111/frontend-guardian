/**
 * v3.11.0: 微信开发者工具 CLI 封装
 *
 * 负责查找 `cli` 可执行文件、检测是否安装，以及调用命令。
 * 微信开发者工具为可选外部工具，未安装时给出友好提示。
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

export const WECHAT_DEVTOOLS_ENV_VAR = "WECHAT_DEVTOOLS_CLI";

/** macOS 默认安装路径 */
export const WECHAT_DEVTOOLS_CLI_MAC = "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";

/** Windows 默认安装路径（候选） */
export const WECHAT_DEVTOOLS_CLI_WIN_CANDIDATES = [
    "C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat",
    "C:\\Program Files\\Tencent\\微信web开发者工具\\cli.bat",
];

/** 返回候选的 cli 路径列表 */
export function getWechatDevToolsCliCandidates(): string[] {
    const candidates: string[] = [];

    // 1. 环境变量优先
    if (process.env[WECHAT_DEVTOOLS_ENV_VAR]) {
        candidates.push(process.env[WECHAT_DEVTOOLS_ENV_VAR] as string);
    }

    // 2. 默认安装路径
    candidates.push(WECHAT_DEVTOOLS_CLI_MAC);
    candidates.push(...WECHAT_DEVTOOLS_CLI_WIN_CANDIDATES);

    return candidates;
}

/** 检测微信开发者工具 CLI 是否可用 */
export function isWechatDevToolsAvailable(): boolean {
    return !!findWechatDevToolsCli();
}

/** 查找可用的 cli 路径 */
export function findWechatDevToolsCli(): string | undefined {
    for (const candidate of getWechatDevToolsCliCandidates()) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    // 3. 尝试 PATH 中的 cli（Linux / 自定义安装）
    try {
        const which = process.platform === "win32" ? "where cli" : "which cli";
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

export interface WechatDevToolsRunOptions {
    /** 项目目录 */
    projectDir: string;
    /** 额外传递给 cli 的参数 */
    args: string[];
    /** 超时时间（毫秒） */
    timeoutMs?: number;
}

/**
 * 调用微信开发者工具 CLI
 * @returns stdout 内容，失败时返回 null
 */
export function runWechatDevTools(options: WechatDevToolsRunOptions): string | null {
    const cli = findWechatDevToolsCli();
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
    } catch (err: any) {
        if (err.stdout) {
            return err.stdout as string;
        }
        return null;
    }
}

/** 编译并打开项目（--auto） */
export function wechatAutoCompile(projectDir: string, timeoutMs = 120000): string | null {
    return runWechatDevTools({ projectDir, args: ["--auto"], timeoutMs });
}

/** 生成预览二维码/链接 */
export function wechatPreview(projectDir: string, timeoutMs = 120000): string | null {
    return runWechatDevTools({ projectDir, args: ["--preview"], timeoutMs });
}

/** 尝试截图并保存到指定路径（需要开发者工具版本支持 --screenshot） */
export function wechatScreenshot(projectDir: string, outputPath: string, timeoutMs = 60000): string | null {
    return runWechatDevTools({ projectDir, args: ["--screenshot", "--path", outputPath], timeoutMs });
}

/** 从编译输出中粗略统计 error / warning 数量 */
export function parseWechatCompileOutput(output: string): { errors: string[]; warnings: string[] } {
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
