/**
 * v3.10.1: 页面健康检查浏览器/视口 profile 工具
 *
 * 纯函数：负责解析 --browser / --device / --viewport / --viewport-mobile，
 * 生成统一的 profile key，便于基线目录隔离和单元测试。
 */

export type BrowserName = "chromium" | "firefox" | "webkit";

export const DEFAULT_MOBILE_DEVICE = "iPhone 14 Pro";

const VALID_BROWSERS: BrowserName[] = ["chromium", "firefox", "webkit"];

/** 将用户输入的浏览器参数解析为引擎列表 */
export function resolveBrowserTypes(browser?: string): BrowserName[] {
    if (!browser) {
        return ["chromium"];
    }
    if (browser === "all") {
        return [...VALID_BROWSERS];
    }
    if ((VALID_BROWSERS as string[]).includes(browser)) {
        return [browser as BrowserName];
    }
    throw new Error(`不支持的浏览器: ${browser}。可选: ${VALID_BROWSERS.join(", ")}, all`);
}

/** 解析 "WxH" 视口字符串 */
export function parseViewport(viewport: string): { width: number; height: number } {
    const match = viewport.match(/^(\d+)x(\d+)$/);
    if (!match) {
        throw new Error(`视口格式无效: ${viewport}，应为 WxH（如 390x844）`);
    }
    return {
        width: parseInt(match[1], 10),
        height: parseInt(match[2], 10),
    };
}

/** 将设备/视口名称转换为目录安全的短 key */
export function sanitizeProfileName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
}

interface ViewportOptions {
    device?: string;
    viewport?: string;
    viewportMobile?: boolean;
}

/** 根据 device / viewport / viewportMobile 生成视口 key */
export function buildViewportKey(options: ViewportOptions): string {
    if (options.device) {
        return sanitizeProfileName(options.device);
    }
    if (options.viewport) {
        return options.viewport;
    }
    if (options.viewportMobile) {
        return sanitizeProfileName(DEFAULT_MOBILE_DEVICE);
    }
    return "desktop";
}

/** 生成 browser/viewport 组合 profile key，用于基线目录隔离 */
export function buildProfileKey(browser: BrowserName, options: ViewportOptions): string {
    return `${browser}/${buildViewportKey(options)}`;
}
