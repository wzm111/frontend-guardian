/**
 * v3.11.0: 小程序项目检测与页面路由解析
 *
 * 纯函数：负责根据文件结构自动识别微信/支付宝/抖音小程序，
 * 并从 app.json / pages.json 中读取页面路由。
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** 支持的小程序平台 */
export type MiniProgramPlatform = "wechat" | "alipay" | "douyin";

export interface MiniProgramProjectInfo {
    /** 检测到的平台 */
    platform: MiniProgramPlatform;
    /** 项目根目录 */
    projectDir: string;
    /** app.json 路径（微信原生 / 抖音 / 支付宝原生） */
    appJsonPath?: string;
    /** pages.json 路径（UniApp 转小程序） */
    pagesJsonPath?: string;
    /** project.config.json 路径（微信 / 抖音） */
    projectConfigPath?: string;
    /** mini.project.json 路径（支付宝） */
    miniProjectJsonPath?: string;
    /** 主包页面路由列表 */
    pages: string[];
    /** 分包配置 */
    subPackages?: Array<{ root: string; pages: string[] }>;
}

/** 判断是否为微信小程序项目 */
export function isWechatMiniProgram(projectDir: string): boolean {
    return (
        (existsSync(resolve(projectDir, "app.json")) && existsSync(resolve(projectDir, "project.config.json"))) ||
        (existsSync(resolve(projectDir, "manifest.json")) && existsSync(resolve(projectDir, "pages.json")))
    );
}

/** 判断是否为支付宝小程序项目 */
export function isAlipayMiniProgram(projectDir: string): boolean {
    return existsSync(resolve(projectDir, "mini.project.json"));
}

/** 判断是否为抖音小程序项目 */
export function isDouyinMiniProgram(projectDir: string): boolean {
    if (!existsSync(resolve(projectDir, "project.config.json"))) {
        return false;
    }
    try {
        const raw = readFileSync(resolve(projectDir, "project.config.json"), "utf-8");
        const config = JSON.parse(raw);
        // 抖音小程序的 project.config.json 通常包含 tt 字段
        return !!(config && (config.tt || config.miniprogramRoot || /tt/i.test(JSON.stringify(config))));
    } catch {
        return false;
    }
}

/** 自动检测小程序平台，无法识别时返回 null */
export function detectMiniProgramPlatform(projectDir: string): MiniProgramPlatform | null {
    if (isAlipayMiniProgram(projectDir)) return "alipay";
    if (isDouyinMiniProgram(projectDir)) return "douyin";
    if (isWechatMiniProgram(projectDir)) return "wechat";
    return null;
}

/** 解析 JSON 文件，失败时返回 undefined */
function readJson(path: string): unknown | undefined {
    try {
        return JSON.parse(readFileSync(path, "utf-8"));
    } catch {
        return undefined;
    }
}

/** 从 pages.json（UniApp）读取 pages 与 subPackages */
function readPagesJson(projectDir: string): { pages: string[]; subPackages?: MiniProgramProjectInfo["subPackages"] } | undefined {
    const pagesPath = resolve(projectDir, "pages.json");
    if (!existsSync(pagesPath)) return undefined;
    const data = readJson(pagesPath);
    if (!data || typeof data !== "object") return undefined;

    const pages = Array.isArray((data as Record<string, unknown>).pages)
        ? ((data as Record<string, unknown>).pages as Array<{ path: string } | string>)
              .map((p) => (typeof p === "string" ? p : p.path))
              .filter((p): p is string => typeof p === "string")
        : [];

    const subPackages = Array.isArray((data as Record<string, unknown>).subPackages)
        ? ((data as Record<string, unknown>).subPackages as Array<{ root: string; pages: Array<{ path: string } | string> }>)
              .map((pkg) => ({
                  root: pkg.root,
                  pages: pkg.pages
                      .map((p) => (typeof p === "string" ? p : p.path))
                      .filter((p): p is string => typeof p === "string"),
              }))
              .filter((pkg) => pkg.root && pkg.pages.length > 0)
        : undefined;

    return { pages, subPackages };
}

/** 从 app.json 读取 pages 与 subPackages */
function readAppJson(projectDir: string): { pages: string[]; subPackages?: MiniProgramProjectInfo["subPackages"] } | undefined {
    const appPath = resolve(projectDir, "app.json");
    if (!existsSync(appPath)) return undefined;
    const data = readJson(appPath);
    if (!data || typeof data !== "object") return undefined;

    const pages = Array.isArray((data as Record<string, unknown>).pages)
        ? ((data as Record<string, unknown>).pages as string[]).filter((p) => typeof p === "string")
        : [];

    const subPackages = Array.isArray((data as Record<string, unknown>).subPackages)
        ? ((data as Record<string, unknown>).subPackages as Array<{ root: string; pages: string[] }>)
              .map((pkg) => ({
                  root: pkg.root,
                  pages: (pkg.pages || []).filter((p) => typeof p === "string"),
              }))
              .filter((pkg) => pkg.root && pkg.pages.length > 0)
        : undefined;

    return { pages, subPackages };
}

/** 读取小程序项目的页面路由 */
export function readMiniProgramPages(
    projectDir: string,
    platform: MiniProgramPlatform
): { pages: string[]; subPackages?: MiniProgramProjectInfo["subPackages"] } {
    // UniApp 优先读取 pages.json
    const fromPagesJson = readPagesJson(projectDir);
    if (fromPagesJson && fromPagesJson.pages.length > 0) {
        return fromPagesJson;
    }
    // 原生微信/支付宝/抖音读取 app.json
    const fromAppJson = readAppJson(projectDir);
    if (fromAppJson) {
        return fromAppJson;
    }
    // 兜底：支付宝没有 app.json 的情况，但通常有 pages 目录，P1 再补全
    return { pages: [] };
}

/** 解析小程序项目，返回完整项目信息 */
export function resolveMiniProgramProject(projectDir: string, platform?: MiniProgramPlatform): MiniProgramProjectInfo | null {
    const detected = platform ? platform : detectMiniProgramPlatform(projectDir);
    if (!detected) return null;

    const pagesResult = readMiniProgramPages(projectDir, detected);

    return {
        platform: detected,
        projectDir,
        appJsonPath: existsSync(resolve(projectDir, "app.json")) ? resolve(projectDir, "app.json") : undefined,
        pagesJsonPath: existsSync(resolve(projectDir, "pages.json")) ? resolve(projectDir, "pages.json") : undefined,
        projectConfigPath:
            detected === "wechat" || detected === "douyin"
                ? existsSync(resolve(projectDir, "project.config.json"))
                    ? resolve(projectDir, "project.config.json")
                    : undefined
                : undefined,
        miniProjectJsonPath:
            detected === "alipay"
                ? existsSync(resolve(projectDir, "mini.project.json"))
                    ? resolve(projectDir, "mini.project.json")
                    : undefined
                : undefined,
        pages: pagesResult.pages,
        subPackages: pagesResult.subPackages,
    };
}

/** 获取平台中文名 */
export function getMiniProgramPlatformLabel(platform: MiniProgramPlatform): string {
    switch (platform) {
        case "wechat":
            return "微信";
        case "alipay":
            return "支付宝";
        case "douyin":
            return "抖音";
    }
}

/** 获取平台开发者工具下载链接 */
export function getMiniProgramDevToolsDownloadUrl(platform: MiniProgramPlatform): string {
    switch (platform) {
        case "wechat":
            return "https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html";
        case "alipay":
            return "https://opendocs.alipay.com/mini/ide/download";
        case "douyin":
            return "https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/developer-tools/download";
    }
}
