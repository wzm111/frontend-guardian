/**
 * RuleRegistry — 规则注册中心
 *
 * Phase 3 核心组件：
 * 1. 统一管理内置规则 + 自定义规则
 * 2. 支持配置驱动（启用/禁用/调整 severity/参数化）
 * 3. 支持热加载用户自定义 JS 规则文件
 * 4. 框架抽象：规则按 category 分组，引擎按需取用
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Rule, RuleConfig, RuleCategory, Severity, ScanStrategy } from "@/types.js";
import pc from "picocolors";

/** 规则注册中心 */
export class RuleRegistry {
    /** 内置规则（原始定义，不可变） */
    private builtInRules = new Map<string, Rule>();
    /** 自定义规则（从外部 JS 文件加载） */
    private customRules = new Map<string, Rule>();
    /** 配置覆盖（id → RuleConfig） */
    private configOverrides = new Map<string, RuleConfig>();

    /** 注册单条规则 */
    register(rule: Rule): this {
        this.builtInRules.set(rule.id, rule);
        return this;
    }

    /** 批量注册规则 */
    registerAll(rules: Rule[]): this {
        for (const rule of rules) {
            this.register(rule);
        }
        return this;
    }

    /** 注销规则（仅对自定义规则有效，内置规则不可注销） */
    unregister(ruleId: string): this {
        this.customRules.delete(ruleId);
        return this;
    }

    /** 获取单条规则（原始定义，未应用配置） */
    getRaw(ruleId: string): Rule | undefined {
        return this.customRules.get(ruleId) || this.builtInRules.get(ruleId);
    }

    /** 获取所有已注册规则 ID */
    getRuleIds(): string[] {
        const ids = new Set<string>();
        for (const id of this.builtInRules.keys()) ids.add(id);
        for (const id of this.customRules.keys()) ids.add(id);
        return Array.from(ids);
    }

    /** ───────────────────────────────────────────────────────────────────────── */
    /** 配置驱动                                                                      */
    /** ───────────────────────────────────────────────────────────────────────── */

    /**
     * 从配置加载规则覆盖
     * @param configs 规则配置列表（来自 .frontend-guardian.yml 的 rules: 节点）
     */
    loadFromConfig(configs: RuleConfig[]): void {
        for (const cfg of configs) {
            if (!cfg.id) {
                console.warn(pc.yellow(`⚠️ RuleRegistry: 规则配置缺少 id，已跳过`));
                continue;
            }
            this.configOverrides.set(cfg.id, cfg);
        }
    }

    /**
     * 加载自定义规则文件
     * @param filePath 规则文件路径（相对或绝对）
     * @param projectDir 项目根目录（用于解析相对路径）
     */
    loadCustomRule(filePath: string, projectDir?: string): boolean {
        const absolutePath = projectDir ? resolve(projectDir, filePath) : resolve(filePath);

        if (!existsSync(absolutePath)) {
            console.warn(pc.yellow(`⚠️ RuleRegistry: 自定义规则文件不存在: ${absolutePath}`));
            return false;
        }

        try {
            // 清除 require 缓存，支持热重载
            delete require.cache[require.resolve(absolutePath)];
            const mod = require(absolutePath);
            const rule: Rule = mod.default || mod;

            if (!rule || !rule.id || typeof rule.execute !== "function") {
                console.warn(
                    pc.yellow(`⚠️ RuleRegistry: 自定义规则文件格式不正确（需导出 Rule 对象）: ${absolutePath}`)
                );
                return false;
            }

            this.customRules.set(rule.id, rule);
            return true;
        } catch (err) {
            console.warn(pc.yellow(`⚠️ RuleRegistry: 加载自定义规则失败: ${absolutePath}`), err);
            return false;
        }
    }

    /** 加载多个自定义规则文件 */
    loadCustomRules(paths: string[], projectDir?: string): { loaded: string[]; failed: string[] } {
        const loaded: string[] = [];
        const failed: string[] = [];

        for (const p of paths) {
            if (this.loadCustomRule(p, projectDir)) {
                loaded.push(p);
            } else {
                failed.push(p);
            }
        }

        return { loaded, failed };
    }

    /** ───────────────────────────────────────────────────────────────────────── */
    /** 规则取用                                                                      */
    /** ───────────────────────────────────────────────────────────────────────── */

    /**
     * 获取应用了配置覆盖后的规则
     * @returns 规则副本（severity/params 已按配置调整）
     */
    getRule(ruleId: string): Rule | undefined {
        const raw = this.getRaw(ruleId);
        if (!raw) return undefined;

        const override = this.configOverrides.get(ruleId);
        if (!override) return raw;

        return this.applyOverride(raw, override);
    }

    /**
     * 获取所有启用的规则
     * @param category 可选：按分类过滤
     */
    getActiveRules(category?: RuleCategory): Rule[] {
        const allIds = this.getRuleIds();
        const result: Rule[] = [];

        for (const id of allIds) {
            const override = this.configOverrides.get(id);

            // 被配置显式禁用的规则跳过
            if (override?.enabled === false) continue;

            const rule = this.getRule(id);
            if (!rule) continue;

            // 默认禁用的规则（显式 false），除非配置显式启用，否则跳过
            if (rule.defaultEnabled === false && override?.enabled !== true) continue;

            if (category && rule.category !== category) continue;

            result.push(rule);
        }

        return result;
    }

    /**
     * 按条件过滤规则（框架/平台/组件库）
     * 与 RuleEngine.filterRules 保持一致
     */
    filterRules(options?: { category?: string; framework?: string; platform?: string; componentLib?: string }): Rule[] {
        return this.getActiveRules().filter((rule) => {
            if (options?.category && rule.category !== options.category) return false;
            if (options?.framework && rule.frameworks && !rule.frameworks.includes(options.framework as any))
                return false;
            if (options?.platform && rule.platforms && !rule.platforms.includes(options.platform as any)) return false;
            if (
                options?.componentLib &&
                rule.componentLibs &&
                !rule.componentLibs.includes(options.componentLib as any)
            )
                return false;
            return true;
        });
    }

    /** 清除所有配置覆盖（重置为默认状态） */
    clearOverrides(): void {
        this.configOverrides.clear();
    }

    /** 清除所有自定义规则 */
    clearCustomRules(): void {
        this.customRules.clear();
    }

    /**
     * v3.5.0: 应用扫描策略分级
     * - strict:  启用所有规则（包括默认禁用的），severity 不降级
     * - standard: 默认行为，无额外覆盖
     * - loose:   禁用所有 suggestion 级别规则
     */
    applyStrategy(strategy: ScanStrategy): void {
        if (strategy === "strict") {
            for (const [id, rule] of this.builtInRules) {
                if (!rule.defaultEnabled) {
                    this.configOverrides.set(id, { id, enabled: true });
                }
            }
        } else if (strategy === "loose") {
            for (const [id, rule] of this.builtInRules) {
                if (rule.severity === "suggestion") {
                    this.configOverrides.set(id, { id, enabled: false });
                }
            }
            // 同时禁用 security 和 accessibility 中标记为 suggestion 的规则
            for (const [id, rule] of this.customRules) {
                if (rule.severity === "suggestion") {
                    this.configOverrides.set(id, { id, enabled: false });
                }
            }
        }
        // standard: 不做任何额外覆盖
    }

    /** ───────────────────────────────────────────────────────────────────────── */
    /** 内部工具                                                                      */
    /** ───────────────────────────────────────────────────────────────────────── */

    /** 将配置覆盖应用到规则，返回新副本 */
    private applyOverride(rule: Rule, override: RuleConfig): Rule {
        const cloned: Rule = { ...rule };

        if (override.severity) {
            cloned.severity = override.severity as Severity;
        }

        // 将 params 存入 meta，规则 execute 可通过 context.config 读取
        if (override.params && Object.keys(override.params).length > 0) {
            cloned.meta = {
                ...rule.meta,
                ...override.params,
                _paramsOverride: override.params,
            };
        }

        return cloned;
    }
}

/** 创建空的规则注册中心 */
export function createRegistry(): RuleRegistry {
    return new RuleRegistry();
}
