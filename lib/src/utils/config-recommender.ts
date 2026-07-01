/**
 * v3.15.0: 配置推荐器
 *
 * 根据项目规模、框架和文件结构自动推荐最优配置。
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { globbySync } from "globby";
import YAML from "yaml";
import { getAdaptiveConcurrency } from "./concurrent.js";
import { detectProjectMeta } from "./project-detector.js";

export interface RecommendedConfig {
    /** 项目目录 */
    projectDir: string;
    /** 检测到的主要框架 */
    framework?: string;
    /** 检测到的主平台 */
    platform?: string;
    /** 源文件总数（含 JS/TS/Vue/Svelte 等） */
    fileCount: number;
    /** 推荐扫描扩展名 */
    includeExtensions: string[];
    /** 推荐排除目录 */
    excludeDirs: string[];
    /** 推荐并发数 */
    concurrency: number;
    /** 缓存 TTL（小时） */
    cacheTtlHours: number;
    /** 推荐启用的模块 */
    enabledModules: string[];
    /** 推荐扫描策略 */
    strategy: "strict" | "standard" | "loose";
    /** 推荐理由 */
    reasons: string[];
}

const DEFAULT_EXTENSIONS = [".js", ".ts", ".jsx", ".tsx"];
const OPTIONAL_EXTENSIONS = [".vue", ".svelte"];

/**
 * 推荐项目配置
 */
export function recommendConfig(projectDir: string): RecommendedConfig {
    const meta = detectProjectMeta(projectDir, {});
    const reasons: string[] = [];

    // 1. 统计源文件数
    const allPatterns = ["**/*.{js,ts,jsx,tsx,vue,svelte,json,yaml,yml,md,markdown}"];
    const defaultExclude = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**", "**/coverage/**"];
    const allFiles = globbySync(allPatterns, {
        cwd: projectDir,
        ignore: defaultExclude,
        absolute: true,
    });
    const fileCount = allFiles.length;

    // 2. 推荐 includeExtensions
    const includeExtensions = [...DEFAULT_EXTENSIONS];
    for (const ext of OPTIONAL_EXTENSIONS) {
        const hasExt = allFiles.some((f) => f.endsWith(ext));
        if (hasExt) {
            includeExtensions.push(ext);
            reasons.push(`检测到 ${ext} 文件，已加入扫描扩展名`);
        }
    }

    // v3.19.0: 检测 JSON/YAML/Markdown 文件
    const dataExts = [".json", ".yaml", ".yml", ".md", ".markdown"];
    for (const ext of dataExts) {
        const hasExt = allFiles.some((f) => f.endsWith(ext));
        if (hasExt && !includeExtensions.includes(ext)) {
            includeExtensions.push(ext);
            reasons.push(`检测到 ${ext} 文件，已加入扫描扩展名`);
        }
    }

    // v3.20.0: 检测后端语言文件
    const backendExts = [".go", ".rs"];
    for (const ext of backendExts) {
        const hasExt = allFiles.some((f) => f.endsWith(ext));
        if (hasExt && !includeExtensions.includes(ext)) {
            includeExtensions.push(ext);
            reasons.push(`检测到 ${ext} 文件，已加入扫描扩展名`);
        }
    }

    // 3. 推荐 excludeDirs（只推荐实际存在的目录）
    const candidateExcludeDirs = ["node_modules", "dist", "build", "coverage", ".git", "public", "out", ".next"];
    const excludeDirs = candidateExcludeDirs.filter((d) => existsDir(resolve(projectDir, d)));

    // 4. 推荐并发数
    const concurrency = getAdaptiveConcurrency(fileCount, 20);
    reasons.push(`项目共 ${fileCount} 个源文件，推荐并发数 ${concurrency}`);

    // 5. 推荐启用的模块
    const enabledModules = buildEnabledModules(meta, projectDir, fileCount, reasons, allFiles);

    // 6. 缓存策略
    const cacheTtlHours = fileCount > 1000 ? 336 : 168;
    if (fileCount > 1000) {
        reasons.push("大项目建议延长缓存 TTL 至 14 天，减少重复解析");
    }

    // 7. 扫描策略
    const strategy: RecommendedConfig["strategy"] = fileCount > 2000 ? "loose" : "standard";
    if (strategy === "loose") {
        reasons.push("超大项目建议使用 loose 策略，避免首次接入时问题过多");
    }

    return {
        projectDir,
        framework: meta.framework,
        platform: meta.platforms[0],
        fileCount,
        includeExtensions,
        excludeDirs,
        concurrency,
        cacheTtlHours,
        enabledModules,
        strategy,
        reasons,
    };
}

/**
 * 将推荐配置渲染为 YAML 字符串（可直接写入 .frontend-guardian.yml）
 */
export function formatRecommendedConfig(config: RecommendedConfig): string {
    const yamlConfig = {
        scan: {
            includeExtensions: config.includeExtensions,
            excludeDirs: config.excludeDirs,
        },
        concurrency: config.concurrency,
        cacheTtlHours: config.cacheTtlHours,
        strategy: config.strategy,
        modules: config.enabledModules,
    };

    const lines: string[] = [];
    lines.push(pc.cyan("🔧 推荐配置"));
    lines.push(pc.gray(`   项目: ${config.projectDir}`));
    if (config.framework) {
        lines.push(pc.gray(`   框架: ${config.framework}`));
    }
    lines.push(pc.gray(`   源文件数: ${config.fileCount}`));
    lines.push("");
    lines.push(pc.cyan("   推荐理由:"));
    for (const r of config.reasons) {
        lines.push(pc.gray(`      • ${r}`));
    }
    lines.push("");
    lines.push(pc.cyan("   建议写入 .frontend-guardian.yml 的内容:"));
    lines.push("```yaml");
    lines.push(YAML.stringify(yamlConfig));
    lines.push("```");
    return lines.join("\n");
}

/** 构建推荐启用的模块列表 */
function buildEnabledModules(
    meta: ReturnType<typeof detectProjectMeta>,
    projectDir: string,
    fileCount: number,
    reasons: string[],
    allFiles: string[]
): string[] {
    const modules = new Set<string>([
        "i18n",
        "component",
        "hooks",
        "performance",
        "a11y",
        "security",
        "naming",
        "cross-file",
        "data",
        "backend",
    ]);

    const framework = meta.framework;
    const platforms = meta.platforms || [];

    // 多端/小程序项目启用 platform 模块
    if (
        platforms.some((p) => ["wechat-mp", "alipay-mp", "douyin-mp", "harmony", "app"].includes(p)) ||
        ["uniapp", "taro"].includes(framework || "")
    ) {
        modules.add("platform");
        reasons.push("检测到多端/小程序项目，启用 platform 模块");
    }

    // 检测到测试框架时启用 e2e 模块
    if (meta.testFramework) {
        modules.add("e2e");
        reasons.push(`检测到测试框架 ${meta.testFramework}，启用 e2e 模块`);
    }

    // Svelte 项目启用 svelte 模块
    if (framework === "svelte" || existsSync(resolve(projectDir, "svelte.config.js"))) {
        modules.add("svelte");
        reasons.push("检测到 Svelte 项目，启用 svelte 模块");
    }

    // 小项目可以关闭较重的 cross-file 分析
    if (fileCount < 50) {
        modules.delete("cross-file");
        reasons.push("小项目（<50 文件）建议关闭 cross-file 分析以减少开销");
    }

    // 检测到后端语言文件时启用 backend 模块
    if (allFiles.some((f: string) => f.endsWith(".go") || f.endsWith(".rs"))) {
        modules.add("backend");
        reasons.push("检测到 Go/Rust 后端文件，启用 backend 模块");
    }

    return Array.from(modules);
}

/** 判断路径是否为目录 */
function existsDir(p: string): boolean {
    try {
        return existsSync(p) && statSync(p).isDirectory();
    } catch {
        return false;
    }
}

// 延迟导入 picocolors 避免循环依赖
import pc from "picocolors";
