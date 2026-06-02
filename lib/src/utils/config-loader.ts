/**
 * 配置文件加载工具
 * 支持 .frontend-guardian.yml 和 .frontend-guardian.json
 * 支持 extends 继承组织级基线配置
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import YAML from "yaml";
import type { ProjectConfig, RuleConfig } from "@/types.js";

export function loadConfig(projectDir: string, configFile?: string): ProjectConfig {
    // 1. 尝试指定配置文件
    let config: ProjectConfig = {};
    let configPath: string | undefined;

    if (configFile) {
        const customPath = resolve(projectDir, configFile);
        if (existsSync(customPath)) {
            config = parseConfigFile(customPath);
            configPath = customPath;
        }
    }

    // 2. 尝试默认配置文件
    if (!configPath) {
        const ymlPath = resolve(projectDir, ".frontend-guardian.yml");
        const jsonPath = resolve(projectDir, ".frontend-guardian.json");

        if (existsSync(ymlPath)) {
            config = parseConfigFile(ymlPath);
            configPath = ymlPath;
        } else if (existsSync(jsonPath)) {
            config = parseConfigFile(jsonPath);
            configPath = jsonPath;
        }
    }

    // 3. 处理 extends 继承
    if (config.extends) {
        const baseDir = configPath ? dirname(configPath) : projectDir;
        config = resolveExtends(config, baseDir);
    }

    return config;
}

function parseConfigFile(filePath: string): ProjectConfig {
    const content = readFileSync(filePath, "utf-8");

    if (filePath.endsWith(".json")) {
        return JSON.parse(content);
    }

    if (filePath.endsWith(".yml") || filePath.endsWith(".yaml")) {
        return YAML.parse(content) as ProjectConfig;
    }

    return {};
}

/**
 * 解析 extends 继承链
 * @param config 当前配置
 * @param baseDir 配置文件所在目录（用于解析相对路径）
 * @returns 合并后的配置
 */
function resolveExtends(config: ProjectConfig, baseDir: string): ProjectConfig {
    if (!config.extends) return config;

    const extendsPath = resolve(baseDir, config.extends);
    if (!existsSync(extendsPath)) {
        console.warn(`[frontend-guardian] extends 配置未找到: ${extendsPath}`);
        return config;
    }

    const baseConfig = parseConfigFile(extendsPath);

    // 递归处理继承链
    if (baseConfig.extends) {
        const parentDir = dirname(extendsPath);
        const resolvedBase = resolveExtends(baseConfig, parentDir);
        return mergeConfig(resolvedBase, config);
    }

    return mergeConfig(baseConfig, config);
}

/**
 * 合并配置：base 为基础，override 覆盖
 * - 简单字段：override 优先
 * - rules 数组：按 id 去重合并，override 覆盖同名规则
 * - customRules 数组：合并去重
 */
function mergeConfig(base: ProjectConfig, override: ProjectConfig): ProjectConfig {
    const merged: ProjectConfig = { ...base, ...override };

    // 合并 rules（按 id 去重，override 优先）
    const baseRules = base.rules ?? [];
    const overrideRules = override.rules ?? [];
    if (baseRules.length > 0 || overrideRules.length > 0) {
        const ruleMap = new Map<string, RuleConfig>();
        for (const r of baseRules) {
            ruleMap.set(r.id, r);
        }
        for (const r of overrideRules) {
            const existing = ruleMap.get(r.id);
            if (existing) {
                ruleMap.set(r.id, { ...existing, ...r });
            } else {
                ruleMap.set(r.id, r);
            }
        }
        merged.rules = Array.from(ruleMap.values());
    }

    // 合并 customRules（按 path 去重）
    const baseCustom = base.customRules ?? [];
    const overrideCustom = override.customRules ?? [];
    if (baseCustom.length > 0 || overrideCustom.length > 0) {
        const pathSet = new Set(baseCustom.map((c) => c.path));
        merged.customRules = [
            ...baseCustom,
            ...overrideCustom.filter((c) => !pathSet.has(c.path)),
        ];
    }

    // 合并嵌套配置对象（浅合并）
    mergeNested(merged, base, override, "i18n");
    mergeNested(merged, base, override, "component");
    mergeNested(merged, base, override, "hooks");
    mergeNested(merged, base, override, "platform");
    mergeNested(merged, base, override, "gate");
    mergeNested(merged, base, override, "aiContext");
    mergeNested(merged, base, override, "naming");

    // 合并 scan 配置（对象浅合并）
    if (base.scan || override.scan) {
        merged.scan = {
            ...base.scan,
            ...override.scan,
            includeExtensions: (override.scan?.includeExtensions ?? base.scan?.includeExtensions) as string[],
            excludeDirs: (override.scan?.excludeDirs ?? base.scan?.excludeDirs) as string[],
            excludePatterns: (override.scan?.excludePatterns ?? base.scan?.excludePatterns) as string[],
        };
    }

    return merged;
}

/**
 * 合并嵌套对象配置：base 为基础，override 覆盖
 */
function mergeNested<K extends keyof ProjectConfig>(
    merged: ProjectConfig,
    base: ProjectConfig,
    override: ProjectConfig,
    key: K,
): void {
    const baseVal = base[key];
    const overrideVal = override[key];
    if (baseVal && typeof baseVal === "object" && !Array.isArray(baseVal)) {
        if (overrideVal && typeof overrideVal === "object" && !Array.isArray(overrideVal)) {
            merged[key] = { ...baseVal, ...overrideVal } as ProjectConfig[K];
        } else if (overrideVal) {
            merged[key] = overrideVal;
        }
    } else if (overrideVal) {
        merged[key] = overrideVal;
    }
}
