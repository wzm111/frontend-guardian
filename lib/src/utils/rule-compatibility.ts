/**
 * v3.18.0: 规则兼容性检查
 *
 * 检测规则间的冲突、缺失依赖、被取代但仍启用等情况。
 */

import type { Rule, RuleCompatibilityReport } from "@/types.js";
import pc from "picocolors";

/** 检查规则集的兼容性 */
export function checkRuleCompatibility(rules: Rule[]): RuleCompatibilityReport {
    const report: RuleCompatibilityReport = {
        conflicts: [],
        missingRequirements: [],
        superseded: [],
    };

    const enabledIds = new Set(rules.map((r) => r.id));

    for (const rule of rules) {
        // conflictsWith
        if (rule.conflictsWith) {
            for (const otherId of rule.conflictsWith) {
                if (enabledIds.has(otherId)) {
                    report.conflicts.push({
                        ruleId: rule.id,
                        conflictsWith: otherId,
                    });
                }
            }
        }

        // requires
        if (rule.requires) {
            for (const requiredId of rule.requires) {
                if (!enabledIds.has(requiredId)) {
                    report.missingRequirements.push({
                        ruleId: rule.id,
                        requires: requiredId,
                    });
                }
            }
        }

        // supersedes: 如果当前规则启用，且它取代的旧规则也启用了，则提示
        if (rule.supersedes) {
            for (const oldId of rule.supersedes) {
                if (enabledIds.has(oldId)) {
                    report.superseded.push({
                        ruleId: oldId,
                        supersededBy: rule.id,
                    });
                }
            }
        }
    }

    // 反向检查：被其他规则取代的旧规则是否仍启用
    for (const rule of rules) {
        for (const other of rules) {
            if (other.supersedes?.includes(rule.id)) {
                // 已在上面处理过，避免重复
                continue;
            }
        }
    }

    // 去重：conflicts 可能出现 A-B 和 B-A 重复
    const seenConflicts = new Set<string>();
    report.conflicts = report.conflicts.filter((c) => {
        const key = [c.ruleId, c.conflictsWith].sort().join("::");
        if (seenConflicts.has(key)) return false;
        seenConflicts.add(key);
        return true;
    });

    // 去重：superseded
    const seenSuperseded = new Set<string>();
    report.superseded = report.superseded.filter((s) => {
        const key = `${s.ruleId}->${s.supersededBy}`;
        if (seenSuperseded.has(key)) return false;
        seenSuperseded.add(key);
        return true;
    });

    return report;
}

/** 判断兼容性报告是否无问题 */
export function isCompatibilityReportClean(report: RuleCompatibilityReport): boolean {
    return (
        report.conflicts.length === 0 &&
        report.missingRequirements.length === 0 &&
        report.superseded.length === 0
    );
}

/** 格式化兼容性报告为终端文本 */
export function formatCompatibilityReport(report: RuleCompatibilityReport): string {
    if (isCompatibilityReportClean(report)) {
        return pc.green("✅ 当前规则集无兼容性问题");
    }

    const lines: string[] = [];
    lines.push(pc.cyan("🔍 规则兼容性检查"));
    lines.push("");

    if (report.conflicts.length > 0) {
        lines.push(pc.yellow("⚠️  冲突规则（同时启用可能给出矛盾建议）:"));
        for (const c of report.conflicts) {
            lines.push(`   • ${pc.white(c.ruleId)} ↔ ${pc.white(c.conflictsWith)}`);
        }
        lines.push("");
    }

    if (report.missingRequirements.length > 0) {
        lines.push(pc.yellow("⚠️  缺少前置依赖规则:"));
        for (const m of report.missingRequirements) {
            lines.push(`   • ${pc.white(m.ruleId)} 需要 ${pc.white(m.requires)}`);
        }
        lines.push("");
    }

    if (report.superseded.length > 0) {
        lines.push(pc.yellow("⚠️  被取代但仍启用的规则:"));
        for (const s of report.superseded) {
            lines.push(`   • ${pc.white(s.ruleId)} 已被 ${pc.white(s.supersededBy)} 取代`);
        }
        lines.push("");
    }

    return lines.join("\n");
}

/** 格式化兼容性报告为 JSON */
export function formatCompatibilityReportJson(report: RuleCompatibilityReport): string {
    return JSON.stringify(report, null, 2);
}
