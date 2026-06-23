/**
 * v3.11.1: 各平台小程序开发者工具 CLI 配置
 */

import type { MiniProgramCliConfig } from "./miniprogram-cli.js";
import type { MiniProgramPlatform } from "./miniprogram-detect.js";

/** 微信开发者工具 CLI 配置 */
export const wechatCliConfig: MiniProgramCliConfig = {
    platform: "wechat",
    envVar: "WECHAT_DEVTOOLS_CLI",
    defaultMacPath: "/Applications/wechatwebdevtools.app/Contents/MacOS/cli",
    defaultWinPaths: [
        "C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat",
        "C:\\Program Files\\Tencent\\微信web开发者工具\\cli.bat",
    ],
    cliName: "cli",
    label: "微信",
    downloadUrl: "https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html",
    autoCompileArgs: ["--auto"],
    previewArgs: ["--preview"],
    screenshotArgs: (outputPath: string) => ["--screenshot", "--path", outputPath],
};

/** 支付宝小程序开发者工具 CLI 配置
 *
 * 注：支付宝开发者工具 CLI 参数可能因版本而异，以下参数基于公开文档与常见约定，
 * 实际使用时应按本地安装版本验证。
 */
export const alipayCliConfig: MiniProgramCliConfig = {
    platform: "alipay",
    envVar: "ALIPAY_DEVTOOLS_CLI",
    defaultMacPath: "/Applications/支付宝小程序开发者工具.app/Contents/MacOS/cli",
    defaultWinPaths: [
        "C:\\Program Files (x86)\\Alipay\\小程序开发者工具\\cli.bat",
        "C:\\Program Files\\Alipay\\小程序开发者工具\\cli.bat",
    ],
    cliName: "cli",
    label: "支付宝",
    downloadUrl: "https://opendocs.alipay.com/mini/ide/download",
    autoCompileArgs: ["--build"],
    previewArgs: ["--preview"],
    screenshotArgs: (outputPath: string) => ["--screenshot", "--path", outputPath],
};

/** 抖音小程序开发者工具 CLI 配置
 *
 * 注：抖音（字节跳动）开发者工具 CLI 参数可能因版本而异，以下参数基于公开文档与常见约定，
 * 实际使用时应按本地安装版本验证。
 */
export const douyinCliConfig: MiniProgramCliConfig = {
    platform: "douyin",
    envVar: "DOUYIN_DEVTOOLS_CLI",
    defaultMacPath: "/Applications/字节跳动开发者工具.app/Contents/MacOS/cli",
    defaultWinPaths: [
        "C:\\Program Files (x86)\\Bytedance\\字节跳动开发者工具\\cli.bat",
        "C:\\Program Files\\Bytedance\\字节跳动开发者工具\\cli.bat",
    ],
    cliName: "cli",
    label: "抖音",
    downloadUrl: "https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/developer-tools/download",
    autoCompileArgs: ["--build"],
    previewArgs: ["--preview"],
    screenshotArgs: (outputPath: string) => ["--screenshot", "--path", outputPath],
};

/** 根据平台获取 CLI 配置 */
export function getCliConfig(platform: MiniProgramPlatform): MiniProgramCliConfig {
    switch (platform) {
        case "wechat":
            return wechatCliConfig;
        case "alipay":
            return alipayCliConfig;
        case "douyin":
            return douyinCliConfig;
    }
}
