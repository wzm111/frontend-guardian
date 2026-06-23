/**
 * v3.11.1: 微信开发者工具 CLI 封装（基于通用 miniprogram-cli）
 *
 * 保留原有导出符号，内部委托给通用实现。
 */

import {
    findDevToolsCli,
    isDevToolsAvailable,
    parseCompileOutput,
    runAutoCompile,
    runDevTools,
    runScreenshot,
    type MiniProgramDevToolsRunOptions,
} from "./miniprogram-cli.js";
import { wechatCliConfig } from "./miniprogram-cli-configs.js";

export { wechatCliConfig };

/** 兼容旧接口：微信 CLI 运行选项 */
export interface WechatDevToolsRunOptions extends MiniProgramDevToolsRunOptions {}

/** 检测微信开发者工具 CLI 是否可用 */
export function isWechatDevToolsAvailable(): boolean {
    return isDevToolsAvailable(wechatCliConfig);
}

/** 查找可用的 cli 路径 */
export function findWechatDevToolsCli(): string | undefined {
    return findDevToolsCli(wechatCliConfig);
}

/** 调用微信开发者工具 CLI */
export function runWechatDevTools(options: WechatDevToolsRunOptions): string | null {
    return runDevTools(options, wechatCliConfig);
}

/** 编译并打开项目（--auto） */
export function wechatAutoCompile(projectDir: string, timeoutMs = 120000): string | null {
    return runAutoCompile(wechatCliConfig, projectDir, timeoutMs);
}

/** 生成预览二维码/链接 */
export function wechatPreview(projectDir: string, timeoutMs = 120000): string | null {
    return runDevTools({ projectDir, args: wechatCliConfig.previewArgs, timeoutMs }, wechatCliConfig);
}

/** 尝试截图并保存到指定路径（需要开发者工具版本支持 --screenshot） */
export function wechatScreenshot(projectDir: string, outputPath: string, timeoutMs = 60000): string | null {
    return runScreenshot(wechatCliConfig, projectDir, outputPath, timeoutMs);
}

/** 从编译输出中粗略统计 error / warning 数量 */
export function parseWechatCompileOutput(output: string): { errors: string[]; warnings: string[] } {
    return parseCompileOutput(output);
}
