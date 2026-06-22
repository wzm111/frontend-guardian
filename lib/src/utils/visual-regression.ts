/**
 * v3.10.0: 视觉回归工具
 *
 * 提供像素级截图对比、差异图生成、元素级截图路径命名。
 * pixelmatch 与 pngjs 为可选依赖，未安装时 page-health 会回退到 SHA256 哈希比对。
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface VisualRegressionOptions {
    /** 最大绝对差异像素数（默认 100） */
    maxDiffPixels?: number;
    /** 最大差异像素比例（默认 0.01 = 1%） */
    maxDiffPixelRatio?: number;
}

export interface VisualRegressionResult {
    /** 差异像素数 */
    diffPixels: number;
    /** 差异像素比例 */
    diffPixelRatio: number;
    /** 差异图保存路径 */
    diffImagePath: string;
    /** 使用的绝对阈值 */
    thresholdPixels: number;
    /** 使用的比例阈值 */
    thresholdRatio: number;
}

const DEFAULT_MAX_DIFF_PIXELS = 100;
const DEFAULT_MAX_DIFF_PIXEL_RATIO = 0.01;

/** 判断 pixelmatch 是否可用 */
export function isPixelmatchAvailable(): boolean {
    try {
        const pmPath = require.resolve("pixelmatch");
        return !!pmPath;
    } catch {
        return false;
    }
}

/** 判断 pngjs 是否可用 */
export function isPngjsAvailable(): boolean {
    try {
        const pngPath = require.resolve("pngjs");
        return !!pngPath;
    } catch {
        return false;
    }
}

/** 生成路由安全的文件名 */
export function safeRouteName(route: string): string {
    return route.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

/** 对选择器生成短哈希后缀 */
export function selectorHash(selector: string): string {
    return createHash("sha256").update(selector).digest("hex").slice(0, 6);
}

/** 生成截图 key（含可选元素选择器后缀） */
export function getScreenshotKey(route: string, selector?: string): string {
    const base = safeRouteName(route);
    if (!selector) return base;
    return `${base}__sel${selectorHash(selector)}`;
}

/**
 * 像素级对比两张 PNG 截图
 *
 * @returns 对比结果；无基线、尺寸不匹配或解码失败时返回 null
 */
export async function compareScreenshotsPixel(
    currentPath: string,
    baselinePath: string,
    diffImagePath: string,
    options: VisualRegressionOptions = {}
): Promise<VisualRegressionResult | null> {
    if (!existsSync(baselinePath)) return null;
    if (!isPixelmatchAvailable() || !isPngjsAvailable()) return null;

    const thresholdPixels = options.maxDiffPixels ?? DEFAULT_MAX_DIFF_PIXELS;
    const thresholdRatio = options.maxDiffPixelRatio ?? DEFAULT_MAX_DIFF_PIXEL_RATIO;

    try {
        // @ts-ignore — pngjs 是可选依赖，运行时检测
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { PNG }: any = await import("pngjs");
        // @ts-ignore — pixelmatch 是可选依赖，运行时检测
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { default: pixelmatch }: any = await import("pixelmatch");

        const currentBuf = readFileSync(currentPath);
        const baselineBuf = readFileSync(baselinePath);

        const current = PNG.sync.read(currentBuf);
        const baseline = PNG.sync.read(baselineBuf);

        if (current.width !== baseline.width || current.height !== baseline.height) {
            const maxPixels = Math.max(current.width * current.height, baseline.width * baseline.height);
            return {
                diffPixels: maxPixels,
                diffPixelRatio: 1,
                diffImagePath,
                thresholdPixels,
                thresholdRatio,
            };
        }

        const { width, height } = current;
        const diff = new PNG({ width, height });

        const diffPixels = pixelmatch(
            current.data,
            baseline.data,
            diff.data,
            width,
            height,
            { threshold: 0.1, includeAA: true }
        ) as number;

        const diffDir = dirname(diffImagePath);
        if (diffDir && !existsSync(diffDir)) {
            mkdirSync(diffDir, { recursive: true });
        }
        writeFileSync(diffImagePath, PNG.sync.write(diff));

        const totalPixels = width * height;
        const diffPixelRatio = totalPixels > 0 ? diffPixels / totalPixels : 0;

        return {
            diffPixels,
            diffPixelRatio,
            diffImagePath,
            thresholdPixels,
            thresholdRatio,
        };
    } catch {
        return null;
    }
}

/** 判断差异是否超过阈值 */
export function isVisualRegressionFailed(
    result: VisualRegressionResult,
    options: VisualRegressionOptions = {}
): boolean {
    const maxDiffPixels = options.maxDiffPixels ?? DEFAULT_MAX_DIFF_PIXELS;
    const maxDiffPixelRatio = options.maxDiffPixelRatio ?? DEFAULT_MAX_DIFF_PIXEL_RATIO;
    return result.diffPixels > maxDiffPixels || result.diffPixelRatio > maxDiffPixelRatio;
}

/**
 * 生成建议的差异图路径
 */
export function getDiffImagePath(diffDir: string, route: string, selector?: string): string {
    const key = getScreenshotKey(route, selector);
    return join(diffDir, `${key}.png`);
}

/**
 * 生成建议的基线图路径
 */
export function getBaselinePath(baselineDir: string, route: string, selector?: string): string {
    const key = getScreenshotKey(route, selector);
    return join(baselineDir, `${key}.png`);
}

/**
 * 生成建议的当前截图路径
 */
export function getCurrentScreenshotPath(screenshotDir: string, route: string, selector?: string): string {
    const key = getScreenshotKey(route, selector);
    return join(screenshotDir, `${key}.png`);
}
