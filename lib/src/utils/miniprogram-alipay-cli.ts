/**
 * v3.11.1: 支付宝小程序开发者工具 CLI 封装（基于通用 miniprogram-cli）
 *
 * 注：支付宝开发者工具 CLI 参数可能因版本而异，以下实现按常见约定提供，
 * 未安装时仍执行静态检查并给出下载链接。
 */

import { findDevToolsCli, isDevToolsAvailable, runAutoCompile, runDevTools, runScreenshot } from "./miniprogram-cli.js";
import { alipayCliConfig } from "./miniprogram-cli-configs.js";

export { alipayCliConfig };

/** 检测支付宝小程序开发者工具 CLI 是否可用 */
export function isAlipayDevToolsAvailable(): boolean {
    return isDevToolsAvailable(alipayCliConfig);
}

/** 查找可用的 cli 路径 */
export function findAlipayDevToolsCli(): string | undefined {
    return findDevToolsCli(alipayCliConfig);
}

/** 编译项目（--build） */
export function alipayAutoCompile(projectDir: string, timeoutMs = 120000): string | null {
    return runAutoCompile(alipayCliConfig, projectDir, timeoutMs);
}

/** 生成预览二维码/链接 */
export function alipayPreview(projectDir: string, timeoutMs = 120000): string | null {
    return runDevTools({ projectDir, args: alipayCliConfig.previewArgs, timeoutMs }, alipayCliConfig);
}

/** 尝试截图并保存到指定路径 */
export function alipayScreenshot(projectDir: string, outputPath: string, timeoutMs = 60000): string | null {
    return runScreenshot(alipayCliConfig, projectDir, outputPath, timeoutMs);
}
