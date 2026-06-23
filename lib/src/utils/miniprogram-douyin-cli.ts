/**
 * v3.11.1: 抖音小程序开发者工具 CLI 封装（基于通用 miniprogram-cli）
 *
 * 注：抖音（字节跳动）开发者工具 CLI 参数可能因版本而异，以下实现按常见约定提供，
 * 未安装时仍执行静态检查并给出下载链接。
 */

import { findDevToolsCli, isDevToolsAvailable, runAutoCompile, runDevTools, runScreenshot } from "./miniprogram-cli.js";
import { douyinCliConfig } from "./miniprogram-cli-configs.js";

export { douyinCliConfig };

/** 检测抖音小程序开发者工具 CLI 是否可用 */
export function isDouyinDevToolsAvailable(): boolean {
    return isDevToolsAvailable(douyinCliConfig);
}

/** 查找可用的 cli 路径 */
export function findDouyinDevToolsCli(): string | undefined {
    return findDevToolsCli(douyinCliConfig);
}

/** 编译项目（--build） */
export function douyinAutoCompile(projectDir: string, timeoutMs = 120000): string | null {
    return runAutoCompile(douyinCliConfig, projectDir, timeoutMs);
}

/** 生成预览二维码/链接 */
export function douyinPreview(projectDir: string, timeoutMs = 120000): string | null {
    return runDevTools({ projectDir, args: douyinCliConfig.previewArgs, timeoutMs }, douyinCliConfig);
}

/** 尝试截图并保存到指定路径 */
export function douyinScreenshot(projectDir: string, outputPath: string, timeoutMs = 60000): string | null {
    return runScreenshot(douyinCliConfig, projectDir, outputPath, timeoutMs);
}
