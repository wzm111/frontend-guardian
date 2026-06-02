/**
 * 配置文件初始化工具
 * 一键生成 .frontend-guardian.yml 智能默认配置
 */

import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ProjectMeta, Framework, Platform } from "@/types.js";

/**
 * 生成默认配置 YAML 内容
 * 基于项目检测结果提供智能默认值
 */
export function generateDefaultConfig(meta?: ProjectMeta): string {
    const framework = meta?.framework;
    const componentLib = meta?.componentLib;
    const platforms = meta?.platforms ?? [];
    const hasTs = meta?.hasTypeScript ?? true;
    const hasI18n = meta?.hasI18n ?? false;
    const i18nLib = meta?.i18nLib;

    const lines: string[] = [
        "# frontend-guardian 配置文件",
        "# 文档: https://github.com/wzm111/frontend-guardian#configuration",
        "",
        "# ============================================================================",
        "# 基础配置",
        "# ============================================================================",
        "",
        "# 报告语言: zh | en",
        "locale: zh",
        "",
        "# 最低输出严重级别: critical | warning | suggestion",
        "severity: warning",
        "",
    ];

    // i18n 配置
    if (hasI18n) {
        lines.push(
            "",
            "# ============================================================================",
            "# i18n 治理配置",
            "# ============================================================================",
            "i18n:",
            `  sourceLocale: ${getDefaultLocale(i18nLib)}`,
            "  targetLocales:",
            "    - en-US",
            "  format: json",
            "  keyPattern: '^[a-z][a-zA-Z0-9]*(\\.[a-z][a-zA-Z0-9]*)*$'",
            "  extractPaths:",
            "    - src/**",
            "  ignorePaths:",
            '    - "**/*.test.*"',
            '    - "**/*.spec.*"',
            '    - "**/*.d.ts"',
            '  interpolationPattern: "\\{([^}]+)\\}"',
            "  translateProvider: openai",
        );
    }

    // 组件配置
    if (framework && framework !== "flutter" && framework !== "react-native" && framework !== "harmony") {
        lines.push(
            "",
            "# ============================================================================",
            "# 组件医生配置",
            "# ============================================================================",
            "component:",
            `  library: ${componentLib ?? "auto"}`,
            "  themeTokenPrefix: \"--\"",
            "  maxSelectOptions: 100",
            "  checkA11y: true",
            "  checkPerf: true",
        );
    }

    // Hooks 配置（React/Vue/Svelte 框架）
    if (framework && ["react", "vue", "svelte", "solidjs", "nextjs", "nuxt", "uniapp", "taro"].includes(framework)) {
        lines.push(
            "",
            "# ============================================================================",
            "# Hooks / Composables 配置",
            "# ============================================================================",
            "hooks:",
            "  maxEffectDeps: 5",
            "  checkClosure: true",
            "  checkCustomHookNaming: true",
            "  checkVueComposables: " + (framework === "vue" || framework === "nuxt" ? "true" : "false"),
        );
    }

    // 平台配置
    if (platforms.length > 0) {
        const mpPlatforms = platforms.filter((p) => ["wechat-mp", "alipay-mp", "douyin-mp"].includes(p));
        const hasMobile = platforms.includes("h5") || platforms.includes("app");
        const hasHarmony = platforms.includes("harmony");

        if (mpPlatforms.length > 0 || hasMobile || hasHarmony) {
            lines.push(
                "",
                "# ============================================================================",
                "# 多端平台适配配置",
                "# ============================================================================",
                "platform:",
            );

            if (platforms.length > 0) {
                lines.push("  targets:");
                for (const p of platforms) {
                    lines.push(`    - ${p}`);
                }
            }

            if (mpPlatforms.length > 0) {
                lines.push(
                    "  mp:",
                    `    type: ${getMpType(mpPlatforms[0])}`,
                    "    maxMainPackageSize: 2097152  # 2MB",
                    "    maxSubPackageSize: 2097152   # 2MB",
                    "    maxBase64ImageSize: 10240    # 10KB",
                    "    maxPageStack: 10",
                );
            }

            if (hasMobile) {
                lines.push(
                    "  mobile:",
                    "    minTouchTarget: 44",
                    "    checkSafeArea: true",
                    "    checkClickDelay: true",
                    "    checkKeyboard: true",
                );
            }

            if (hasHarmony) {
                lines.push(
                    "  harmony:",
                    '    strictTypeCheck: true',
                    '    arktsVersion: "1.1"',
                );
            }
        }
    }

    // CI 门禁配置
    lines.push(
        "",
        "# ============================================================================",
        "# CI/CD 门禁配置",
        "# ============================================================================",
        "gate:",
        "  enabled: true",
        "  critical:",
        "    max: 0",
        "  warning:",
        "    max: 10",
        "  suggestion:",
        "    max: 20",
        "  blockPipeline: true",
    );

    // 扫描范围配置
    const extensions = getDefaultExtensions(framework, hasTs);
    lines.push(
        "",
        "# ============================================================================",
        "# 扫描范围配置",
        "# ============================================================================",
        "scan:",
        "  includeExtensions:",
    );
    for (const ext of extensions) {
        lines.push(`    - ${ext}`);
    }
    lines.push(
        "  excludeDirs:",
        "    - node_modules",
        "    - dist",
        "    - build",
        "    - .git",
        "    - coverage",
        "    - .claude",
        "  excludePatterns:",
        '    - "*.min.js"',
        '    - "*.test.*"',
        '    - "*.spec.*"',
        '    - "*.config.*"',
    );

    // 规则配置
    lines.push(
        "",
        "# ============================================================================",
        "# 规则配置（可选）",
        "# 可覆盖规则默认参数、调整严重级别、禁用特定规则",
        "# ============================================================================",
        "rules:",
        "  # 示例：禁用某规则",
        "  # - id: hooks-state-lifting",
        "  #   enabled: false",
        "",
        "  # 示例：调整严重级别",
        "  # - id: component-token",
        "  #   severity: warning",
        "",
        "  # 示例：参数化规则",
        "  # - id: hooks-effect-deps",
        "  #   severity: warning",
        "  #   params:",
        "  #     maxDeps: 7",
    );

    // 自定义规则
    lines.push(
        "",
        "# ============================================================================",
        "# 自定义规则（可选）",
        "# ============================================================================",
        "customRules:",
        "  # - path: ./rules/my-company-rule.js",
    );

    return lines.join("\n");
}

/**
 * 初始化配置文件
 * @param projectDir 项目根目录
 * @param meta 项目元数据（可选，用于智能默认值）
 * @param force 是否覆盖已存在的配置文件
 * @returns 操作结果
 */
export function initConfig(
    projectDir: string,
    meta?: ProjectMeta,
    force = false,
): { created: boolean; path: string; existed: boolean } {
    const configPath = resolve(projectDir, ".frontend-guardian.yml");
    const existed = existsSync(configPath);

    if (existed && !force) {
        return { created: false, path: configPath, existed: true };
    }

    const content = generateDefaultConfig(meta);
    writeFileSync(configPath, content, "utf-8");

    return { created: true, path: configPath, existed };
}

// ── 辅助函数 ───────────────────────────────────────────────────────────────

function getDefaultLocale(i18nLib?: string): string {
    if (i18nLib?.includes("zh") || i18nLib?.includes("cn")) return "zh-CN";
    return "zh-CN";
}

function getMpType(platform: Platform): string {
    switch (platform) {
        case "wechat-mp":
            return "wechat";
        case "alipay-mp":
            return "alipay";
        case "douyin-mp":
            return "douyin";
        default:
            return "wechat";
    }
}

function getDefaultExtensions(framework?: Framework, hasTs = true): string[] {
    const extensions: string[] = [];

    if (hasTs) {
        extensions.push(".ts", ".tsx");
    } else {
        extensions.push(".js", ".jsx");
    }

    if (framework === "vue" || framework === "nuxt" || framework === "uniapp") {
        extensions.push(".vue");
    }

    if (framework === "svelte") {
        extensions.push(".svelte");
    }

    if (framework === "solidjs" || framework === "astro") {
        extensions.push(".tsx");
    }

    extensions.push(".css", ".scss", ".less", ".json");

    if (framework === "harmony") {
        extensions.push(".ets");
    }

    return [...new Set(extensions)];
}
