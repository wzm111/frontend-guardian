/**
 * v3.17.0: 规则评分系统
 *
 * 基于本地扫描历史（history/*.json）和显式记录（rule-scores.json）
 * 计算规则综合评分：使用率、准确率、修复成功率、用户评分。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Issue, RuleScore, RuleScoreSummary } from "@/types.js";
import pc from "picocolors";

const RULE_SCORES_FILE = "rule-scores.json";

interface PersistedRuleScore {
    accuracy?: number;
    fixSuccess?: { success: number; total: number };
    userRating?: number;
    updatedAt?: string;
}

interface PersistedScores {
    scores: Record<string, PersistedRuleScore>;
}

function getScoresPath(projectDir: string): string {
    return resolve(projectDir, ".frontend-guardian", RULE_SCORES_FILE);
}

function loadPersistedScores(projectDir: string): PersistedScores {
    const path = getScoresPath(projectDir);
    try {
        if (existsSync(path)) {
            const raw = readFileSync(path, "utf-8");
            return JSON.parse(raw) as PersistedScores;
        }
    } catch {
        // 读取失败返回空
    }
    return { scores: {} };
}

function savePersistedScores(projectDir: string, data: PersistedScores): void {
    try {
        const dir = resolve(projectDir, ".frontend-guardian");
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        writeFileSync(getScoresPath(projectDir), JSON.stringify(data, null, 2), "utf-8");
    } catch {
        // 保存失败不阻断
    }
}

/** 从历史报告目录统计每条规则的 usageCount */
function collectUsageFromHistory(projectDir: string): { usage: Map<string, number>; totalScans: number } {
    const usage = new Map<string, number>();
    let totalScans = 0;
    const reportsDir = resolve(projectDir, ".frontend-guardian", "history");

    try {
        if (!existsSync(reportsDir)) {
            return { usage, totalScans };
        }
        const { readdirSync } = require("node:fs");
        const files = readdirSync(reportsDir).filter((f: string) => f.endsWith(".json"));
        for (const filename of files) {
            try {
                const raw = readFileSync(resolve(reportsDir, filename), "utf-8");
                const report = JSON.parse(raw) as { issues?: Issue[] };
                if (!report.issues) continue;
                totalScans++;
                for (const issue of report.issues) {
                    usage.set(issue.ruleId, (usage.get(issue.ruleId) || 0) + 1);
                }
            } catch {
                // 单条报告失败忽略
            }
        }
    } catch {
        // 目录不存在或读取失败
    }

    return { usage, totalScans };
}

function computeCompositeScore(input: {
    usageCount: number;
    maxUsage: number;
    accuracy?: number;
    fixSuccessRate?: number;
    userRating?: number;
}): number {
    const usageNorm = input.maxUsage > 0 ? Math.min(input.usageCount / input.maxUsage, 1) : 0;
    const accuracy = input.accuracy ?? 0;
    const fixSuccess = input.fixSuccessRate ?? 0;
    const userRatingNorm = input.userRating ? input.userRating / 5 : 0;

    const score = 40 * usageNorm + 30 * accuracy + 20 * fixSuccess + 10 * userRatingNorm;
    return Math.round(Math.max(0, Math.min(100, score)));
}

/** 计算项目规则评分 */
export function computeRuleScores(projectDir: string): RuleScoreSummary {
    const { usage, totalScans } = collectUsageFromHistory(projectDir);
    const persisted = loadPersistedScores(projectDir);

    const maxUsage = usage.size > 0 ? Math.max(...usage.values()) : 0;
    const scores: Record<string, RuleScore> = {};

    // 合并 usage 和 persisted 中所有出现过的 ruleId
    const allRuleIds = new Set<string>([...usage.keys(), ...Object.keys(persisted.scores)]);

    for (const ruleId of allRuleIds) {
        const usageCount = usage.get(ruleId) || 0;
        const p = persisted.scores[ruleId] || {};
        const fixTotal = p.fixSuccess?.total ?? 0;
        const fixSuccessRate = fixTotal > 0 ? (p.fixSuccess?.success ?? 0) / fixTotal : undefined;

        const score = computeCompositeScore({
            usageCount,
            maxUsage,
            accuracy: p.accuracy,
            fixSuccessRate,
            userRating: p.userRating,
        });

        scores[ruleId] = {
            ruleId,
            score,
            usageCount,
            accuracy: p.accuracy,
            fixSuccessRate,
            userRating: p.userRating,
            updatedAt: new Date().toISOString(),
        };
    }

    return { scores, totalScans };
}

/** 记录一次自动修复的成功或失败 */
export function recordFixSuccess(ruleId: string, success: boolean, projectDir: string): void {
    const data = loadPersistedScores(projectDir);
    if (!data.scores[ruleId]) {
        data.scores[ruleId] = {};
    }
    const entry = data.scores[ruleId];
    if (!entry.fixSuccess) {
        entry.fixSuccess = { success: 0, total: 0 };
    }
    entry.fixSuccess.total += 1;
    if (success) {
        entry.fixSuccess.success += 1;
    }
    entry.updatedAt = new Date().toISOString();
    savePersistedScores(projectDir, data);
}

/** 设置规则的用户评分（1-5） */
export function setRuleUserRating(ruleId: string, rating: number, projectDir: string): void {
    const clamped = Math.max(1, Math.min(5, rating));
    const data = loadPersistedScores(projectDir);
    if (!data.scores[ruleId]) {
        data.scores[ruleId] = {};
    }
    data.scores[ruleId].userRating = clamped;
    data.scores[ruleId].updatedAt = new Date().toISOString();
    savePersistedScores(projectDir, data);
}

/** 终端表格输出评分 */
export function formatRuleScores(summary: RuleScoreSummary): string {
    const lines: string[] = [];
    lines.push(pc.cyan("⭐ 规则评分"));
    lines.push(pc.gray(`   参与统计扫描数: ${summary.totalScans}`));
    lines.push("");

    const scores = Object.values(summary.scores).sort((a, b) => b.score - a.score);
    if (scores.length === 0) {
        lines.push(pc.gray("   暂无规则评分数据"));
        return lines.join("\n");
    }

    lines.push(
        pc.gray(
            `   ${"规则 ID".padEnd(35)} ${"评分".padStart(5)} ${"使用".padStart(6)} ${"准确率".padStart(6)} ${"修复率".padStart(6)} ${"用户".padStart(5)}`
        )
    );
    for (const s of scores) {
        const accuracy = s.accuracy !== undefined ? `${(s.accuracy * 100).toFixed(0)}%` : "-";
        const fix = s.fixSuccessRate !== undefined ? `${(s.fixSuccessRate * 100).toFixed(0)}%` : "-";
        const rating = s.userRating !== undefined ? String(s.userRating) : "-";
        lines.push(
            pc.gray(
                `   ${s.ruleId.padEnd(35)} ${String(s.score).padStart(5)} ${String(s.usageCount).padStart(6)} ${accuracy.padStart(6)} ${fix.padStart(6)} ${rating.padStart(5)}`
            )
        );
    }

    return lines.join("\n");
}

/** JSON 输出评分 */
export function formatRuleScoresJson(summary: RuleScoreSummary): string {
    return JSON.stringify(summary, null, 2);
}
