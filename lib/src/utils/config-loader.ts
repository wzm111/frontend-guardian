/**
 * 配置文件加载工具
 * 支持 .frontend-guardian.yml 和 .frontend-guardian.json
 * 支持 extends 继承组织级基线配置
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import YAML from "yaml";
import type { ProjectConfig, RuleConfig, Rule } from "@/types.js";
import pc from "picocolors";

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
        const yamlPath = resolve(projectDir, ".frontend-guardian.yaml");
        const jsonPath = resolve(projectDir, ".frontend-guardian.json");

        if (existsSync(ymlPath)) {
            config = parseConfigFile(ymlPath);
            configPath = ymlPath;
        } else if (existsSync(yamlPath)) {
            config = parseConfigFile(yamlPath);
            configPath = yamlPath;
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

    let baseConfig: ProjectConfig;
    let pluginRules: Rule[] | undefined;

    // v2.7.0: 支持 npm:package-name 格式从 npm 包加载配置
    if (config.extends.startsWith("npm:")) {
        const packageName = config.extends.slice(4);
        const loaded = loadNpmPackage(packageName);
        baseConfig = loaded.config;
        pluginRules = loaded.rules;
    } else {
        const extendsPath = resolve(baseDir, config.extends);
        if (!existsSync(extendsPath)) {
            console.warn(pc.yellow(`⚠️  extends 配置未找到: ${extendsPath}`));
            return config;
        }
        baseConfig = parseConfigFile(extendsPath);
    }

    // v2.7.0: 将 npm 包规则暂存到内部字段
    if (pluginRules && pluginRules.length > 0) {
        baseConfig.__pluginRules = pluginRules;
    }

    // 递归处理继承链
    if (baseConfig.extends) {
        const parentDir = baseDir;
        const resolvedBase = resolveExtends(baseConfig, parentDir);
        // 合并 npm 包规则
        if (pluginRules && pluginRules.length > 0) {
            resolvedBase.__pluginRules = pluginRules;
        }
        return mergeConfig(resolvedBase, config);
    }

    return mergeConfig(baseConfig, config);
}

/**
 * v2.7.0: 从 npm 包加载配置和规则
 * 规则包遵循 frontend-guardian-plugin-* 命名约定
 * 包导出格式: { config?: ProjectConfig, rules?: Rule[] }
 */
function loadNpmPackage(packageName: string): { config: ProjectConfig; rules?: Rule[] } {
    try {
        // 尝试 require 加载（支持 CommonJS 和 ESM 的 default export）
        const mod = require(packageName);
        const pkg = mod.default || mod;

        if (!pkg || typeof pkg !== "object") {
            console.warn(pc.yellow(`⚠️  npm 包 "${packageName}" 导出格式不正确`));
            return { config: {} };
        }

        const config: ProjectConfig = pkg.config || pkg;
        const rules: Rule[] | undefined = pkg.rules;

        if (rules && Array.isArray(rules) && rules.length > 0) {
            // 验证规则格式
            const validRules = rules.filter((r) => {
                if (!r || !r.id || typeof r.execute !== "function") {
                    console.warn(pc.yellow(`⚠️  插件 "${packageName}" 中的规则格式不正确，已跳过: ${r?.id || "unknown"}`));
                    return false;
                }
                return true;
            });
            if (validRules.length > 0) {
                console.log(pc.blue(`🔌 已从 npm 包加载 ${validRules.length} 个规则: ${packageName}`));
            }
            return { config, rules: validRules };
        }

        return { config };
    } catch (err: any) {
        console.warn(pc.yellow(`⚠️  无法加载 npm 包 "${packageName}": ${err.message || err}`));
        console.log(pc.gray(`   请确保已安装: npm install ${packageName}`));
        return { config: {} };
    }
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

    // v2.7.0: 合并 npm 插件规则（base + override）
    const basePluginRules = base.__pluginRules ?? [];
    const overridePluginRules = override.__pluginRules ?? [];
    if (basePluginRules.length > 0 || overridePluginRules.length > 0) {
        const ruleMap = new Map<string, Rule>();
        for (const r of basePluginRules) {
            ruleMap.set(r.id, r);
        }
        for (const r of overridePluginRules) {
            ruleMap.set(r.id, r);
        }
        merged.__pluginRules = Array.from(ruleMap.values());
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
