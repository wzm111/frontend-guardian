/**
 * v3.9.0: 智能测试推荐
 *
 * 基于变更文件 + 项目索引的反向依赖图，自动推荐需要运行的测试文件。
 * - Priority 1: 测试文件直接 import 了变更文件
 * - Priority 2: 变更文件通过 import 链间接影响测试文件
 * - Priority 3: 变更文件影响某个路由，E2E 测试覆盖该路由
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { globby } from "globby";
import pc from "picocolors";
import { ProjectIndexer, type RouteInfo } from "@/engine/indexer.js";
import type { TestFramework } from "@/types.js";
import { collectTestFiles, extractCoveredPaths } from "@/utils/e2e-gap-detector.js";
import { detectProjectMeta } from "@/utils/project-detector.js";
import { type FlakyTestInfo, type FlakyTestThresholds, TestHistoryReport } from "@/utils/test-history.js";

export interface RecommendTestsOptions {
    /** 项目根目录 */
    projectDir: string;
    /** 显式变更文件（绝对路径） */
    changedFiles?: string[];
    /** 仅 staged */
    staged?: boolean;
    /** git diff range */
    diffRange?: string;
    /** 智能范围：未提交修改 → 最近 5 次提交 */
    autoScope?: boolean;
    /** 最小优先级：1 直接 | 2 传递 | 3 路由相关，默认 1 */
    minPriority?: number;
    /** flaky 检测阈值 */
    flakyThresholds?: FlakyTestThresholds;
}

export interface TestRecommendation {
    /** 推荐测试文件绝对路径 */
    testFile: string;
    /** 推荐理由 */
    reason: string;
    /** 优先级：1 最高 */
    priority: number;
    /** 触发此推荐的变更文件 */
    triggeredBy: string[];
    /** 测试类型 */
    testType: "unit" | "integration" | "e2e";
    /** 建议运行的命令 */
    suggestedCommand?: string;
    /** flaky 风险信息（如果有历史数据） */
    flakyRisk?: FlakyTestInfo;
}

export interface RecommendTestsResult {
    /** 输入的变更文件 */
    changedFiles: string[];
    /** 变更范围类型 */
    scope: "explicit" | "staged" | "diff" | "auto";
    /** 检测到的测试框架 */
    testFramework?: TestFramework;
    /** 项目中测试文件总数 */
    totalTestFiles: number;
    /** 推荐运行的测试 */
    recommendations: TestRecommendation[];
    /** 未被任何测试覆盖的变更 */
    uncoveredChanges: { file: string; reason: string }[];
    /** 高 flaky 风险测试 */
    flakyTests: FlakyTestInfo[];
    /** 汇总 */
    summary: {
        direct: number;
        transitive: number;
        routeRelated: number;
        uncovered: number;
        flaky: number;
    };
}

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".vue"]);

/** 判断是否为测试文件 */
function isTestFile(filePath: string): boolean {
    return /[\\/](?:e2e|cypress)[\\/]/.test(filePath) || /\.(test|spec|e2e)\.(ts|tsx|js|jsx|mjs)$/.test(filePath);
}

/** 判断是否为源码文件 */
function isSourceFile(filePath: string): boolean {
    if (filePath.includes("node_modules")) return false;
    if (isTestFile(filePath)) return false;
    return SOURCE_EXTS.has(extname(filePath));
}

/** 运行 git 命令并返回文件列表 */
function runGit(projectDir: string, cmd: string): string[] {
    try {
        const output = execSync(cmd, {
            cwd: projectDir,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "ignore"],
        });
        return output
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((f) => resolve(projectDir, f));
    } catch {
        return [];
    }
}

/** 智能推断变更范围（复用 RuleEngine 语义） */
function getAutoScopeFiles(projectDir: string): string[] {
    const files = new Set<string>();

    for (const cmd of ["git diff --name-only --diff-filter=ACM", "git diff --cached --name-only --diff-filter=ACM"]) {
        for (const f of runGit(projectDir, cmd)) {
            files.add(f);
        }
    }

    if (files.size === 0) {
        for (const f of runGit(projectDir, "git diff --name-only --diff-filter=ACM HEAD~5...HEAD")) {
            files.add(f);
        }
    }

    return Array.from(files);
}

/** 根据选项获取变更文件 */
function resolveChangedFiles(
    options: RecommendTestsOptions,
    projectDir: string
): { files: string[]; scope: RecommendTestsResult["scope"] } {
    if (options.changedFiles && options.changedFiles.length > 0) {
        return { files: options.changedFiles.map((f) => resolve(projectDir, f)), scope: "explicit" };
    }

    if (options.staged) {
        return { files: runGit(projectDir, "git diff --cached --name-only --diff-filter=ACM"), scope: "staged" };
    }

    if (options.diffRange) {
        return {
            files: runGit(projectDir, `git diff --name-only --diff-filter=ACM ${options.diffRange}`),
            scope: "diff",
        };
    }

    if (options.autoScope) {
        return { files: getAutoScopeFiles(projectDir), scope: "auto" };
    }

    return { files: [], scope: "auto" };
}

/** 确保索引有效，返回 ProjectIndexer 与文件列表 */
async function ensureIndexer(projectDir: string): Promise<{ indexer: ProjectIndexer; allFiles: string[] }> {
    const indexer = new ProjectIndexer(projectDir);

    const files = await globby(["**/*.{js,ts,jsx,tsx,vue}"], {
        cwd: projectDir,
        ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**", "**/coverage/**"],
        absolute: true,
    });

    if (!indexer.isValid()) {
        await indexer.buildIndex(files);
    }

    return { indexer, allFiles: files };
}

/** 推断测试类型 */
function inferTestType(testFile: string): "unit" | "integration" | "e2e" {
    if (/[\\/](?:e2e|cypress)[\\/]/.test(testFile) || /\.e2e\./.test(testFile)) {
        return "e2e";
    }
    if (/[\\/](?:integration|__tests__)[\\/]/.test(testFile)) {
        return "integration";
    }
    return "unit";
}

/** 生成建议运行命令 */
function suggestCommand(testFile: string, framework: TestFramework | undefined, projectDir: string): string {
    const relPath = relative(projectDir, testFile);
    switch (framework) {
        case "vitest":
            return `npx vitest run ${relPath}`;
        case "jest":
            return `npx jest ${relPath}`;
        case "playwright":
            return `npx playwright test ${relPath}`;
        case "cypress":
            return `npx cypress run --spec ${relPath}`;
        case "mocha":
            return `npx mocha ${relPath}`;
        case "ava":
            return `npx ava ${relPath}`;
        default:
            return `node ${relPath}`;
    }
}

/** 构建路由文件映射 */
function buildRouteMap(indexer: ProjectIndexer): Map<string, RouteInfo> {
    const map = new Map<string, RouteInfo>();
    for (const route of indexer.getRoutes()) {
        map.set(route.file, route);
    }
    return map;
}

/** 查找 E2E 测试覆盖的路由映射 */
function buildE2ERouteCoverageMap(projectDir: string): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();

    const e2eDirs = ["tests/e2e", "e2e", "playwright-tests", "cypress/e2e", "src/e2e"];
    for (const dir of e2eDirs) {
        const fullDir = resolve(projectDir, dir);
        if (!existsSync(fullDir)) continue;

        for (const testFile of collectTestFiles(fullDir)) {
            const content = readFileSync(testFile, "utf-8");
            const pages = new Set<string>();
            const apis = new Set<string>();
            extractCoveredPaths(content, pages, apis);

            for (const page of pages) {
                const normalized = normalizeRoute(page);
                if (!map.has(normalized)) {
                    map.set(normalized, new Set<string>());
                }
                map.get(normalized)?.add(testFile);
            }
        }
    }

    return map;
}

/** 路由 path 标准化 */
function normalizeRoute(path: string): string {
    let p = path.trim();
    if (!p.startsWith("/")) p = `/${p}`;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p;
}

/** 向推荐结果 map 中插入一条推荐 */
function addRecommendation(
    map: Map<string, TestRecommendation>,
    testFile: string,
    priority: number,
    reason: string,
    triggeredBy: string,
    testType: "unit" | "integration" | "e2e",
    projectDir: string,
    framework: TestFramework | undefined
): void {
    const existing = map.get(testFile);
    if (existing) {
        if (priority < existing.priority) {
            existing.priority = priority;
            existing.reason = reason;
            existing.testType = testType;
        }
        if (!existing.triggeredBy.includes(triggeredBy)) {
            existing.triggeredBy.push(triggeredBy);
        }
        return;
    }

    map.set(testFile, {
        testFile,
        reason,
        priority,
        triggeredBy: [triggeredBy],
        testType,
        suggestedCommand: suggestCommand(testFile, framework, projectDir),
    });
}

/** 主入口 */
export async function recommendTests(options: RecommendTestsOptions): Promise<RecommendTestsResult> {
    const projectDir = resolve(options.projectDir);
    const meta = detectProjectMeta(projectDir);
    const framework = meta.testFramework;

    const { files: rawChangedFiles, scope } = resolveChangedFiles(options, projectDir);
    const changedFiles = rawChangedFiles.filter(isSourceFile);

    const { indexer, allFiles } = await ensureIndexer(projectDir);
    const routeMap = buildRouteMap(indexer);

    const totalTestFiles = allFiles.filter(isTestFile).length;

    const recommendationMap = new Map<string, TestRecommendation>();
    const e2eRouteCoverage = buildE2ERouteCoverageMap(projectDir);

    for (const changedFile of changedFiles) {
        const relChanged = relative(projectDir, changedFile);

        // Priority 1: 直接 import 了变更文件的测试
        for (const importer of indexer.getImporters(changedFile)) {
            if (isTestFile(importer)) {
                addRecommendation(
                    recommendationMap,
                    importer,
                    1,
                    `测试文件直接 import 了变更文件 ${relChanged}`,
                    changedFile,
                    inferTestType(importer),
                    projectDir,
                    framework
                );
            }
        }

        // Priority 2: 传递影响的测试
        for (const importer of indexer.getTransitiveImporters(changedFile)) {
            if (isTestFile(importer) && !indexer.getImporters(changedFile).includes(importer)) {
                addRecommendation(
                    recommendationMap,
                    importer,
                    2,
                    `变更文件 ${relChanged} 通过 import 链间接影响该测试`,
                    changedFile,
                    inferTestType(importer),
                    projectDir,
                    framework
                );
            }
        }

        // Priority 3: 路由相关 E2E 测试
        const impactedRoutes = new Set<string>();
        const changedRoute = routeMap.get(relChanged);
        if (changedRoute) {
            impactedRoutes.add(normalizeRoute(changedRoute.path));
        }
        for (const importer of indexer.getTransitiveImporters(changedFile)) {
            const relImporter = relative(projectDir, importer);
            const route = routeMap.get(relImporter);
            if (route) {
                impactedRoutes.add(normalizeRoute(route.path));
            }
        }

        for (const routePath of impactedRoutes) {
            const coveringTests = e2eRouteCoverage.get(routePath);
            if (coveringTests) {
                for (const testFile of coveringTests) {
                    addRecommendation(
                        recommendationMap,
                        testFile,
                        3,
                        `E2E 测试覆盖受影响路由 ${routePath}`,
                        changedFile,
                        "e2e",
                        projectDir,
                        framework
                    );
                }
            }
        }
    }

    const minPriority = options.minPriority ?? 1;
    const recommendations = Array.from(recommendationMap.values())
        .filter((r) => r.priority <= minPriority)
        .sort((a, b) => a.priority - b.priority || a.testFile.localeCompare(b.testFile));

    // 去重 triggeredBy
    for (const rec of recommendations) {
        rec.triggeredBy = [...new Set(rec.triggeredBy)];
    }

    // v3.12.1: 基于历史数据检测 flaky 测试
    const testHistory = new TestHistoryReport(projectDir);
    const flakyTests = testHistory.detectFlakyTests(options.flakyThresholds);
    const flakyMap = new Map(flakyTests.map((f) => [f.testFile, f]));
    for (const rec of recommendations) {
        const flaky = flakyMap.get(rec.testFile);
        if (flaky) {
            rec.flakyRisk = flaky;
        }
    }

    // 计算 uncovered changes
    const coveredChangedFiles = new Set<string>();
    for (const rec of recommendations) {
        for (const f of rec.triggeredBy) {
            coveredChangedFiles.add(f);
        }
    }
    const uncoveredChanges = changedFiles
        .filter((f) => !coveredChangedFiles.has(f))
        .map((f) => ({ file: f, reason: "没有测试文件 import 或覆盖该变更" }));

    const summary = {
        direct: recommendations.filter((r) => r.priority === 1).length,
        transitive: recommendations.filter((r) => r.priority === 2).length,
        routeRelated: recommendations.filter((r) => r.priority === 3).length,
        uncovered: uncoveredChanges.length,
        flaky: recommendations.filter((r) => r.flakyRisk).length,
    };

    return {
        changedFiles,
        scope,
        testFramework: framework,
        totalTestFiles,
        recommendations,
        uncoveredChanges,
        flakyTests,
        summary,
    };
}

/** 文本报告 */
export function formatRecommendations(result: RecommendTestsResult): string {
    const lines: string[] = [];
    lines.push(pc.cyan("🎯 智能测试推荐"));
    lines.push(pc.gray(`   变更范围: ${result.scope}`));
    lines.push(pc.gray(`   变更文件: ${result.changedFiles.length}`));
    lines.push(pc.gray(`   测试框架: ${result.testFramework ?? "未检测"}`));
    lines.push(pc.gray(`   项目测试文件: ${result.totalTestFiles}`));
    lines.push("");

    if (result.recommendations.length === 0) {
        lines.push(pc.green("   ✅ 未发现需要运行的测试"));
    } else {
        lines.push(pc.cyan(`   推荐运行 ${result.recommendations.length} 个测试：`));
        lines.push("");

        for (const rec of result.recommendations) {
            const priorityLabel = rec.priority === 1 ? "直接" : rec.priority === 2 ? "传递" : "路由";
            const priorityColor = rec.priority === 1 ? pc.red : rec.priority === 2 ? pc.yellow : pc.blue;
            const displayPath = relative(process.cwd(), rec.testFile);
            const flakyBadge = rec.flakyRisk ? pc.yellow(" [flaky]") : "";
            lines.push(priorityColor(`   [P${rec.priority} ${priorityLabel}] ${displayPath}${flakyBadge}`));
            lines.push(pc.gray(`      原因: ${rec.reason}`));
            if (rec.flakyRisk) {
                lines.push(
                    pc.yellow(
                        `      ⚠️ flaky 风险: 失败率 ${(rec.flakyRisk.failureRate * 100).toFixed(1)}%，翻转率 ${(rec.flakyRisk.flipRate * 100).toFixed(1)}% (${rec.flakyRisk.totalRuns} 次历史运行)`
                    )
                );
            }
            lines.push(pc.gray(`      命令: ${rec.suggestedCommand}`));
        }
    }

    if (result.flakyTests.length > 0) {
        lines.push("");
        lines.push(pc.yellow(`   🌀 ${result.flakyTests.length} 个测试存在 flaky 风险：`));
        for (const f of result.flakyTests) {
            const displayPath = relative(process.cwd(), f.testFile);
            lines.push(
                pc.gray(
                    `      - ${displayPath}: 失败率 ${(f.failureRate * 100).toFixed(1)}%，翻转率 ${(f.flipRate * 100).toFixed(1)}%`
                )
            );
        }
    }

    if (result.uncoveredChanges.length > 0) {
        lines.push("");
        lines.push(pc.yellow(`   ⚠️  ${result.uncoveredChanges.length} 个变更未被任何测试覆盖：`));
        for (const u of result.uncoveredChanges) {
            lines.push(pc.gray(`      - ${relative("", u.file) || u.file}`));
        }
    }

    lines.push("");
    lines.push(pc.cyan("   汇总"));
    lines.push(
        pc.gray(
            `      直接: ${result.summary.direct} | 传递: ${result.summary.transitive} | 路由: ${result.summary.routeRelated} | 未覆盖: ${result.summary.uncovered} | flaky: ${result.summary.flaky}`
        )
    );

    return lines.join("\n");
}

/** JSON 格式化 */
export function formatRecommendationsJson(result: RecommendTestsResult): object {
    return {
        changedFiles: result.changedFiles,
        scope: result.scope,
        testFramework: result.testFramework,
        totalTestFiles: result.totalTestFiles,
        recommendations: result.recommendations.map((r) => ({
            testFile: r.testFile,
            priority: r.priority,
            reason: r.reason,
            triggeredBy: r.triggeredBy,
            testType: r.testType,
            suggestedCommand: r.suggestedCommand,
            flakyRisk: r.flakyRisk,
        })),
        uncoveredChanges: result.uncoveredChanges,
        flakyTests: result.flakyTests,
        summary: result.summary,
    };
}
