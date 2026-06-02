/**
 * Formatter Integration — 代码格式化器集成
 *
 * 功能：
 * 1. 自动检测项目使用的格式化工具（Biome / Prettier）
 * 2. 使用项目已有配置，无配置时回退到默认
 * 3. 支持 --format 单独运行，或 --fix --format 修复后自动格式化
 *
 * 检测优先级：
 * 1. biome.json / biome.jsonc → Biome
 * 2. .prettierrc / prettier.config.* → Prettier
 * 3. 无配置 → 默认 Biome（4空格/120字符/双引号）
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import { runCommand } from "./base.js";

export interface FormatResult {
    /** 格式化器名称 */
    formatter: string;
    /** 格式化文件数 */
    formatted: number;
    /** 未变更文件数 */
    unchanged: number;
    /** 错误信息 */
    errors: string[];
    /** 耗时 ms */
    duration: number;
}

export interface FormatterTool {
    name: string;
    isAvailable(projectDir: string): boolean;
    format(projectDir: string, files?: string[]): FormatResult;
}

/** 检测项目使用的格式化器 */
export function detectFormatter(projectDir: string): FormatterTool | null {
    if (biomeFormatter.isAvailable(projectDir)) {
        return biomeFormatter;
    }
    if (prettierFormatter.isAvailable(projectDir)) {
        return prettierFormatter;
    }
    // 无配置时默认用 Biome
    if (hasBiomeCli(projectDir)) {
        return biomeFormatter;
    }
    return null;
}

/** 运行格式化 */
export function runFormat(projectDir: string, files?: string[]): FormatResult {
    const formatter = detectFormatter(projectDir);
    if (!formatter) {
        return {
            formatter: "none",
            formatted: 0,
            unchanged: 0,
            errors: ["未检测到可用的格式化工具（Biome 或 Prettier）"],
            duration: 0,
        };
    }
    return formatter.format(projectDir, files);
}

// ── Biome Formatter ────────────────────────────────────────────────────────

const biomeFormatter: FormatterTool = {
    name: "Biome",
    isAvailable(projectDir: string): boolean {
        return (
            existsSync(resolve(projectDir, "biome.json")) ||
            existsSync(resolve(projectDir, "biome.jsonc")) ||
            hasBiomeCli(projectDir)
        );
    },
    format(projectDir: string, files?: string[]): FormatResult {
        const start = Date.now();
        const errors: string[] = [];
        let formatted = 0;
        let unchanged = 0;

        // 确保有配置文件
        ensureBiomeConfig(projectDir);

        const fileArgs = files && files.length > 0 ? files.join(" ") : ".";
        const output = runCommand(
            `npx biome format --write ${fileArgs}`,
            projectDir,
            120000
        );

        if (output === null) {
            errors.push("Biome format 执行失败");
        } else {
            // Biome 输出格式: "Formatted 3 files in 12ms"
            const match = output.match(/Formatted\s+(\d+)\s+file/i);
            if (match) {
                formatted = parseInt(match[1], 10);
            }
            // 检查 unchanged
            const unchangedMatch = output.match(/unchanged\s+(\d+)/i);
            if (unchangedMatch) {
                unchanged = parseInt(unchangedMatch[1], 10);
            }
            // 如果没匹配到 formatted，可能全部未变更
            if (!match && output.includes("unchanged")) {
                const allMatch = output.match(/(\d+)\s+files?\s+unchanged/i);
                if (allMatch) {
                    unchanged = parseInt(allMatch[1], 10);
                }
            }
        }

        return {
            formatter: "Biome",
            formatted,
            unchanged,
            errors,
            duration: Date.now() - start,
        };
    },
};

// ── Prettier Formatter ─────────────────────────────────────────────────────

const prettierFormatter: FormatterTool = {
    name: "Prettier",
    isAvailable(projectDir: string): boolean {
        return (
            existsSync(resolve(projectDir, ".prettierrc")) ||
            existsSync(resolve(projectDir, ".prettierrc.json")) ||
            existsSync(resolve(projectDir, ".prettierrc.js")) ||
            existsSync(resolve(projectDir, ".prettierrc.mjs")) ||
            existsSync(resolve(projectDir, ".prettierrc.cjs")) ||
            existsSync(resolve(projectDir, ".prettierrc.yaml")) ||
            existsSync(resolve(projectDir, ".prettierrc.yml")) ||
            existsSync(resolve(projectDir, "prettier.config.js")) ||
            existsSync(resolve(projectDir, "prettier.config.mjs")) ||
            existsSync(resolve(projectDir, "prettier.config.cjs")) ||
            hasPrettierCli(projectDir)
        );
    },
    format(projectDir: string, files?: string[]): FormatResult {
        const start = Date.now();
        const errors: string[] = [];
        let formatted = 0;
        let unchanged = 0;

        const fileArgs = files && files.length > 0 ? files.join(" ") : "**/*.{js,ts,jsx,tsx,vue,svelte,css,scss,less,json,md}";
        const output = runCommand(
            `npx prettier --write --log-level warn ${fileArgs}`,
            projectDir,
            120000
        );

        if (output === null) {
            errors.push("Prettier 执行失败");
        } else {
            // Prettier 输出每行一个文件路径
            const lines = output.split("\n").filter((l) => l.trim());
            formatted = lines.length;
        }

        return {
            formatter: "Prettier",
            formatted,
            unchanged,
            errors,
            duration: Date.now() - start,
        };
    },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function hasBiomeCli(projectDir: string): boolean {
    const result = runCommand("npx biome --version 2>/dev/null || echo NOT_FOUND", projectDir, 5000);
    return result !== null && !result.includes("NOT_FOUND");
}

function hasPrettierCli(projectDir: string): boolean {
    const result = runCommand("npx prettier --version 2>/dev/null || echo NOT_FOUND", projectDir, 5000);
    return result !== null && !result.includes("NOT_FOUND");
}

/** 如果项目没有 biome.json，生成一个默认配置 */
function ensureBiomeConfig(projectDir: string): void {
    const configPath = resolve(projectDir, "biome.json");
    if (existsSync(configPath)) return;

    const defaultConfig = {
        "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
        formatter: {
            enabled: true,
            indentStyle: "space",
            indentWidth: 4,
            lineWidth: 120,
        },
        javascript: {
            formatter: {
                quoteStyle: "double",
                trailingCommas: "all",
            },
        },
        files: {
            ignore: ["node_modules", "dist", "build", ".git", "coverage"],
        },
    };

    try {
        const fs = require("node:fs");
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 4), "utf-8");
        console.log(pc.blue(`   📝 已生成默认 Biome 配置: ${configPath}`));
    } catch {
        // 静默失败
    }
}
