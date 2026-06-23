/**
 * v3.11.2: 小程序性能采集工具
 *
 * 采集维度：
 * 1. 构建指标：主包/分包/页面体积、编译耗时
 * 2. 源码静态指标：setData 调用次数与大对象字面量
 * 3. 运行时指标（CLI）：平台 CLI 支持性能参数时解析其输出
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { Issue } from "@/types.js";
import type { MiniProgramPlatform, MiniProgramProjectInfo } from "./miniprogram-detect.js";
import { getDirectorySize, getSubPackageSize } from "./miniprogram-fs.js";

// ── 类型 ───────────────────────────────────────────────────────────────────

export interface MiniProgramPerformanceThresholds {
    /** 启动时间阈值（毫秒） */
    startup: number;
    /** 最低可接受 FPS */
    fps: number;
    /** 单页 setData 调用次数阈值 */
    setDataCount: number;
    /** setData 平均负载阈值（字节） */
    setDataPayloadBytes: number;
    /** 主包/分包体积阈值（字节） */
    packageSize: number;
    /** 单页总体积阈值（字节） */
    pageSize: number;
}

export interface MiniProgramPagePerformance {
    /** 页面路由 */
    path: string;
    /** 页面相关文件总大小 */
    sizeBytes: number;
    /** JS/TS 逻辑文件大小 */
    jsSizeBytes: number;
    /** 模板文件大小（wxml / axml / ttml） */
    wxmlSizeBytes: number;
    /** 样式文件大小（wxss / acss / ttss） */
    styleSizeBytes: number;
    /** 页面目录下图片资源大小 */
    imageSizeBytes: number;
}

export interface SetDataMetric {
    /** 页面路由 */
    page: string;
    /** setData 调用次数 */
    callCount: number;
    /** 总负载估算（字节） */
    totalPayloadBytes: number;
    /** 平均负载估算（字节） */
    avgPayloadBytes: number;
    /** 最大单次负载估算（字节） */
    maxPayloadBytes: number;
}

export interface MiniProgramPerformanceData {
    /** 平台 */
    platform: MiniProgramPlatform;
    /** 编译耗时（毫秒） */
    compileDurationMs: number;
    /** 主包体积（字节） */
    mainPackageSizeBytes: number;
    /** 分包体积列表 */
    subPackages: { root: string; sizeBytes: number }[];
    /** 页面性能数据 */
    pages: MiniProgramPagePerformance[];
    /** 运行时启动时间（可选，需 CLI 支持） */
    startupTimeMs?: number;
    /** 运行时 FPS（可选，需 CLI 支持） */
    fps?: number;
    /** setData 统计 */
    setDataMetrics: SetDataMetric[];
}

export interface PerformanceCheckContext {
    projectDir: string;
    projectInfo: MiniProgramProjectInfo;
    compileDurationMs: number;
}

// ── 常量 ───────────────────────────────────────────────────────────────────

export const DEFAULT_MINIPROGRAM_PERFORMANCE_THRESHOLDS: MiniProgramPerformanceThresholds = {
    startup: 2000,
    fps: 30,
    setDataCount: 50,
    setDataPayloadBytes: 10 * 1024,
    packageSize: 2 * 1024 * 1024,
    pageSize: 500 * 1024,
};

const EXCLUDED_DIRS = new Set(["node_modules", ".git", ".frontend-guardian", "dist", "build", "unpackage", "coverage"]);

const JS_EXTS = [".js", ".ts"];
const WXML_EXTS = [".wxml", ".axml", ".ttml"];
const STYLE_EXTS = [".wxss", ".acss", ".ttss"];
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"];

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileSize(filePath: string): number {
    try {
        return statSync(filePath).size;
    } catch {
        return 0;
    }
}

/** 计算页面目录下各类文件大小 */
function getPageDirectorySize(pageDir: string): {
    size: number;
    js: number;
    wxml: number;
    style: number;
    image: number;
} {
    let size = 0;
    let js = 0;
    let wxml = 0;
    let style = 0;
    let image = 0;

    function walk(dir: string) {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (EXCLUDED_DIRS.has(entry.name)) continue;
                walk(fullPath);
            } else {
                const s = getFileSize(fullPath);
                size += s;
                const ext = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
                if (JS_EXTS.includes(ext)) js += s;
                else if (WXML_EXTS.includes(ext)) wxml += s;
                else if (STYLE_EXTS.includes(ext)) style += s;
                else if (IMAGE_EXTS.includes(ext)) image += s;
            }
        }
    }

    try {
        walk(pageDir);
    } catch {
        // 目录可能不存在（页面由单文件构成），直接返回 0
    }

    return { size, js, wxml, style, image };
}

/** 收集构建指标 */
export function collectBuildMetrics(context: PerformanceCheckContext): MiniProgramPerformanceData {
    const { projectDir, projectInfo } = context;

    const mainPackageSizeBytes = getDirectorySize(projectDir);

    const subPackages: { root: string; sizeBytes: number }[] = [];
    if (projectInfo.subPackages) {
        for (const pkg of projectInfo.subPackages) {
            subPackages.push({
                root: pkg.root,
                sizeBytes: getSubPackageSize(projectDir, pkg.root),
            });
        }
    }

    const pages: MiniProgramPagePerformance[] = [];
    for (const pagePath of projectInfo.pages) {
        const pageDir = resolve(projectDir, dirname(pagePath));
        const sizes = getPageDirectorySize(pageDir);
        pages.push({
            path: pagePath,
            sizeBytes: sizes.size,
            jsSizeBytes: sizes.js,
            wxmlSizeBytes: sizes.wxml,
            styleSizeBytes: sizes.style,
            imageSizeBytes: sizes.image,
        });
    }

    return {
        platform: projectInfo.platform,
        compileDurationMs: context.compileDurationMs,
        mainPackageSizeBytes,
        subPackages,
        pages,
        setDataMetrics: [],
    };
}

/** 估算 setData 单次负载（简化版：对象字面量字符数 × 2 字节） */
function estimatePayload(source: string, startIndex: number): number {
    let braceDepth = 0;
    let inString: string | null = null;
    let escaped = false;
    let endIndex = -1;

    for (let i = startIndex; i < source.length; i++) {
        const ch = source[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === "\\") {
            escaped = true;
            continue;
        }
        if (inString) {
            if (ch === inString) inString = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
            inString = ch;
            continue;
        }
        if (ch === "{") braceDepth++;
        else if (ch === "}") {
            braceDepth--;
            if (braceDepth === 0) {
                endIndex = i + 1;
                break;
            }
        }
    }

    if (endIndex <= startIndex) return 0;
    // 按 UTF-16 字符数估算，实际 JSON 序列化后可能更小或更大
    return (endIndex - startIndex) * 2;
}

/** 收集 setData 静态指标 */
export function collectSetDataMetrics(projectInfo: MiniProgramProjectInfo): SetDataMetric[] {
    const metricsByPage = new Map<string, SetDataMetric>();

    for (const pagePath of projectInfo.pages) {
        const pageDir = resolve(projectInfo.projectDir, dirname(pagePath));
        let callCount = 0;
        let totalPayloadBytes = 0;
        let maxPayloadBytes = 0;

        for (const ext of JS_EXTS) {
            const filePath = join(pageDir, basename(pagePath) + ext);
            if (!statSync(filePath, { throwIfNoEntry: false })) continue;

            const source = readFileSync(filePath, "utf-8");
            const regex = /\.\s*setData\s*\(/g;
            let match: RegExpExecArray | null = regex.exec(source);
            while (match !== null) {
                callCount++;
                const payload = estimatePayload(source, match.index + match[0].length - 1);
                totalPayloadBytes += payload;
                if (payload > maxPayloadBytes) maxPayloadBytes = payload;
                match = regex.exec(source);
            }
        }

        if (callCount > 0) {
            metricsByPage.set(pagePath, {
                page: pagePath,
                callCount,
                totalPayloadBytes,
                avgPayloadBytes: Math.round(totalPayloadBytes / callCount),
                maxPayloadBytes,
            });
        }
    }

    return Array.from(metricsByPage.values()).sort((a, b) => a.page.localeCompare(b.page));
}

/** 合并 setData 静态指标到性能数据中 */
export function mergeSetDataMetrics(
    data: MiniProgramPerformanceData,
    setDataMetrics: SetDataMetric[]
): MiniProgramPerformanceData {
    return { ...data, setDataMetrics };
}

/** 解析平台 CLI 返回的性能输出（JSON 或文本） */
export function parsePerformanceOutput(
    output: string
): Partial<Pick<MiniProgramPerformanceData, "startupTimeMs" | "fps">> {
    const result: Partial<Pick<MiniProgramPerformanceData, "startupTimeMs" | "fps">> = {};
    if (!output) return result;

    // 优先尝试 JSON 输出
    try {
        const json = JSON.parse(output);
        if (typeof json.startupTimeMs === "number") result.startupTimeMs = json.startupTimeMs;
        if (typeof json.startup === "number") result.startupTimeMs = json.startup;
        if (typeof json.fps === "number") result.fps = json.fps;
        return result;
    } catch {
        // 回退到文本解析
    }

    const startupMatch = output.match(/startup[:=\s]+(\d+(?:\.\d+)?)\s*(ms|毫秒)?/i);
    if (startupMatch) result.startupTimeMs = Math.round(Number.parseFloat(startupMatch[1]));

    const fpsMatch = output.match(/fps[:=\s]+(\d+(?:\.\d+)?)/i);
    if (fpsMatch) result.fps = Math.round(Number.parseFloat(fpsMatch[1]));

    return result;
}

/** 根据阈值生成性能 issue */
export function checkPerformanceThresholds(
    data: MiniProgramPerformanceData,
    thresholds?: Partial<MiniProgramPerformanceThresholds>,
    baseMeta?: Record<string, unknown>
): Issue[] {
    const issues: Issue[] = [];
    const t: MiniProgramPerformanceThresholds = {
        ...DEFAULT_MINIPROGRAM_PERFORMANCE_THRESHOLDS,
        ...thresholds,
    };
    const meta = { ...baseMeta, platform: data.platform };
    const projectFile = ((baseMeta as Record<string, unknown>).projectDir ?? data.platform) as string;

    if (data.mainPackageSizeBytes > t.packageSize) {
        issues.push({
            ruleId: "miniprogram-perf-main-package-size",
            title: "小程序主包体积超过性能阈值",
            description: `主包大小 ${formatBytes(data.mainPackageSizeBytes)}，超过阈值 ${formatBytes(t.packageSize)}。建议启用分包、压缩资源或移除未使用代码。`,
            severity: "warning",
            file: projectFile,
            line: 1,
            column: 1,
            meta: { ...meta, sizeBytes: data.mainPackageSizeBytes, threshold: t.packageSize },
        });
    }

    for (const pkg of data.subPackages) {
        if (pkg.sizeBytes > t.packageSize) {
            issues.push({
                ruleId: "miniprogram-perf-subpackage-size",
                title: `小程序分包 ${pkg.root} 体积超过性能阈值`,
                description: `分包 ${pkg.root} 大小 ${formatBytes(pkg.sizeBytes)}，超过阈值 ${formatBytes(t.packageSize)}。`,
                severity: "warning",
                file: projectFile,
                line: 1,
                column: 1,
                meta: { ...meta, subPackageRoot: pkg.root, sizeBytes: pkg.sizeBytes, threshold: t.packageSize },
            });
        }
    }

    for (const page of data.pages) {
        if (page.sizeBytes > t.pageSize) {
            issues.push({
                ruleId: "miniprogram-perf-page-complexity",
                title: `小程序页面 ${page.path} 体积过大`,
                description: `页面 ${page.path} 相关文件总大小 ${formatBytes(page.sizeBytes)}，超过阈值 ${formatBytes(t.pageSize)}。建议拆分页面或减少资源体积。`,
                severity: "warning",
                file: projectFile,
                line: 1,
                column: 1,
                meta: { ...meta, pagePath: page.path, sizeBytes: page.sizeBytes, threshold: t.pageSize },
            });
        }
    }

    if (data.startupTimeMs !== undefined && data.startupTimeMs > t.startup) {
        issues.push({
            ruleId: "miniprogram-perf-startup-time",
            title: "小程序启动时间超过阈值",
            description: `启动耗时 ${data.startupTimeMs}ms，超过阈值 ${t.startup}ms。建议减少主包体积、延迟加载非必要资源。`,
            severity: "warning",
            file: projectFile,
            line: 1,
            column: 1,
            meta: { ...meta, startupTimeMs: data.startupTimeMs, threshold: t.startup },
        });
    }

    if (data.fps !== undefined && data.fps < t.fps) {
        issues.push({
            ruleId: "miniprogram-perf-fps",
            title: "小程序运行帧率低于阈值",
            description: `运行 FPS ${data.fps}，低于阈值 ${t.fps}。建议检查复杂动画、setData 频率或列表渲染性能。`,
            severity: "warning",
            file: projectFile,
            line: 1,
            column: 1,
            meta: { ...meta, fps: data.fps, threshold: t.fps },
        });
    }

    for (const sd of data.setDataMetrics) {
        if (sd.callCount > t.setDataCount) {
            issues.push({
                ruleId: "miniprogram-perf-setdata-cost",
                title: `页面 ${sd.page} setData 调用次数过多`,
                description: `页面 ${sd.page} 发现 ${sd.callCount} 次 setData 调用，超过阈值 ${t.setDataCount}。建议合并 setData、减少不必要的视图更新。`,
                severity: "warning",
                file: projectFile,
                line: 1,
                column: 1,
                meta: { ...meta, pagePath: sd.page, callCount: sd.callCount, threshold: t.setDataCount },
            });
        }
        if (sd.avgPayloadBytes > t.setDataPayloadBytes) {
            issues.push({
                ruleId: "miniprogram-perf-large-setdata",
                title: `页面 ${sd.page} setData 平均负载过大`,
                description: `页面 ${sd.page} setData 平均负载 ${formatBytes(sd.avgPayloadBytes)}，超过阈值 ${formatBytes(t.setDataPayloadBytes)}。建议减少单次 setData 数据量。`,
                severity: "warning",
                file: projectFile,
                line: 1,
                column: 1,
                meta: {
                    ...meta,
                    pagePath: sd.page,
                    avgPayloadBytes: sd.avgPayloadBytes,
                    threshold: t.setDataPayloadBytes,
                },
            });
        }
    }

    return issues;
}

/** 终端展示性能指标 */
export function formatPerformanceMetrics(data: MiniProgramPerformanceData): string[] {
    const lines: string[] = [];
    lines.push("   📊 性能指标");
    lines.push(`      编译耗时: ${data.compileDurationMs}ms`);
    lines.push(`      主包体积: ${formatBytes(data.mainPackageSizeBytes)}`);
    if (data.subPackages.length > 0) {
        lines.push(`      分包数量: ${data.subPackages.length}`);
        for (const pkg of data.subPackages) {
            lines.push(`        - ${pkg.root}: ${formatBytes(pkg.sizeBytes)}`);
        }
    }
    if (data.startupTimeMs !== undefined) {
        lines.push(`      启动时间: ${data.startupTimeMs}ms`);
    }
    if (data.fps !== undefined) {
        lines.push(`      运行帧率: ${data.fps} FPS`);
    }
    if (data.setDataMetrics.length > 0) {
        lines.push(`      setData 统计: ${data.setDataMetrics.length} 个页面`);
        for (const sd of data.setDataMetrics.slice(0, 5)) {
            lines.push(
                `        - ${sd.page}: ${sd.callCount} 次，平均 ${formatBytes(sd.avgPayloadBytes)}，最大 ${formatBytes(sd.maxPayloadBytes)}`
            );
        }
        if (data.setDataMetrics.length > 5) {
            lines.push(`        ... 还有 ${data.setDataMetrics.length - 5} 个页面`);
        }
    }
    return lines;
}
