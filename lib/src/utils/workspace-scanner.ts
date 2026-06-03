/**
 * Workspace Scanner — Monorepo 多包扫描与汇总
 *
 * v2.9.0 功能：
 * 1. 遍历 workspace 所有子包，分别执行扫描
 * 2. 汇总各包扫描结果
 * 3. 添加跨包依赖分析
 * 4. 生成统一报告
 */

import { resolve, relative } from "node:path";
import type { ScanResult, Issue, Rule } from "@/types.js";
import type { WorkspacePackage, MonorepoInfo, CrossPackageIssue } from "./monorepo.js";
import { detectMonorepo, analyzeCrossPackageDeps } from "./monorepo.js";
import { createEngine } from "@/engine/rule-engine.js";
import type { EngineOptions } from "@/engine/rule-engine.js";

/** Workspace 扫描结果 */
export interface WorkspaceScanResult {
    /** 项目根目录 */
    rootDir: string;
    /** monorepo 信息 */
    monorepo: MonorepoInfo;
    /** 各子包扫描结果 */
    packageResults: PackageScanResult[];
    /** 跨包依赖分析结果 */
    crossPackageIssues: CrossPackageIssue[];
    /** 汇总统计 */
    summary: WorkspaceSummary;
}

/** 单包扫描结果 */
export interface PackageScanResult {
    /** 包信息 */
    package: WorkspacePackage;
    /** 扫描结果 */
    result: ScanResult;
    /** 扫描的 issues（去重后） */
    issues: Issue[];
    /** 是否扫描成功 */
    success: boolean;
    /** 错误信息（扫描失败时） */
    error?: string;
}

/** Workspace 汇总统计 */
export interface WorkspaceSummary {
    /** 总包数 */
    totalPackages: number;
    /** 扫描成功的包数 */
    scannedPackages: number;
    /** 有问题的包数 */
    packagesWithIssues: number;
    /** 总 issue 数 */
    totalIssues: number;
    /** 按严重级别统计 */
    issuesBySeverity: { critical: number; warning: number; suggestion: number };
    /** 按模块统计 */
    issuesByModule: Record<string, number>;
    /** 总耗时 */
    totalDuration: number;
    /** 总扫描文件数 */
    totalFilesScanned: number;
}

/** Workspace 扫描选项 */
export interface WorkspaceScanOptions {
    /** 项目根目录 */
    projectDir: string;
    /** 扫描模块 */
    module?: string;
    /** 最低严重级别 */
    minSeverity?: string;
    /** 是否禁用聚类 */
    noCluster?: boolean;
    /** 是否运行外部工具 */
    external?: boolean;
    /** 是否启用缓存 */
    cache?: boolean;
    /** 配置文件路径 */
    configFile?: string;
    /** 扫描范围 */
    files?: string[];
    /** 排除模式 */
    exclude?: string[];
    /** 大文件跳过阈值 */
    skipLargeFilesThreshold?: number;
    /** 要注册的规则 */
    rules?: Rule[];
    /** 是否分析跨包依赖 */
    analyzeCrossDeps?: boolean;
    /** 仅扫描指定包 */
    onlyPackages?: string[];
    /** 跳过指定包 */
    skipPackages?: string[];
}

/**
 * 扫描整个 workspace
 */
export async function scanWorkspace(options: WorkspaceScanOptions): Promise<WorkspaceScanResult> {
    const monorepo = detectMonorepo(options.projectDir);

    if (!monorepo.isMonorepo) {
        throw new Error(`项目 "${options.projectDir}" 不是 monorepo。未检测到 workspace 配置。`);
    }

    const packageResults: PackageScanResult[] = [];
    let totalCritical = 0;
    let totalWarning = 0;
    let totalSuggestion = 0;
    let totalDuration = 0;
    let totalFilesScanned = 0;
    const issuesByModule: Record<string, number> = {};

    // 过滤要扫描的包
    let packagesToScan = monorepo.packages;
    if (options.onlyPackages && options.onlyPackages.length > 0) {
        packagesToScan = packagesToScan.filter((p) => options.onlyPackages!.includes(p.name));
    }
    if (options.skipPackages && options.skipPackages.length > 0) {
        packagesToScan = packagesToScan.filter((p) => !options.skipPackages!.includes(p.name));
    }

    for (const pkg of packagesToScan) {
        const scanModule = options.module || "all";
        const engineOptions: EngineOptions = {
            projectDir: pkg.absolutePath,
            minSeverity: (options.minSeverity as "critical" | "warning" | "suggestion") || "suggestion",
            files: options.files,
            exclude: options.exclude,
            configFile: options.configFile,
            cache: options.cache !== false,
            skipLargeFilesThreshold: options.skipLargeFilesThreshold,
        };

        const engine = createEngine(engineOptions);

        if (options.rules && options.rules.length > 0) {
            engine.registerAll(options.rules);
        }

        try {
            let result = await engine.scan(scanModule);

            if (!options.noCluster) {
                result = {
                    ...result,
                    issues: {
                        critical: engine.clusterIssues(result.issues.critical),
                        warning: engine.clusterIssues(result.issues.warning),
                        suggestion: engine.clusterIssues(result.issues.suggestion),
                    },
                    total:
                        engine.clusterIssues(result.issues.critical).length +
                        engine.clusterIssues(result.issues.warning).length +
                        engine.clusterIssues(result.issues.suggestion).length,
                };
            }

            const allIssues = [...result.issues.critical, ...result.issues.warning, ...result.issues.suggestion];

            // 调整文件路径为相对于根目录
            const adjustedIssues = allIssues.map((issue) => ({
                ...issue,
                file: relative(options.projectDir, resolve(pkg.absolutePath, issue.file)),
            }));

            const adjustedResult: ScanResult = {
                ...result,
                issues: {
                    critical: adjustedIssues.filter((i) => i.severity === "critical"),
                    warning: adjustedIssues.filter((i) => i.severity === "warning"),
                    suggestion: adjustedIssues.filter((i) => i.severity === "suggestion"),
                },
            };

            packageResults.push({
                package: pkg,
                result: adjustedResult,
                issues: adjustedIssues,
                success: true,
            });

            totalCritical += adjustedResult.issues.critical.length;
            totalWarning += adjustedResult.issues.warning.length;
            totalSuggestion += adjustedResult.issues.suggestion.length;
            totalDuration += result.duration;
            totalFilesScanned += result.filesScanned;
            issuesByModule[scanModule] = (issuesByModule[scanModule] || 0) + adjustedResult.total;
        } catch (err) {
            packageResults.push({
                package: pkg,
                result: {
                    module: scanModule,
                    total: 0,
                    issues: { critical: [], warning: [], suggestion: [] },
                    duration: 0,
                    filesScanned: 0,
                    filesWithIssues: 0,
                },
                issues: [],
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // 跨包依赖分析
    let crossPackageIssues: CrossPackageIssue[] = [];
    if (options.analyzeCrossDeps !== false) {
        crossPackageIssues = analyzeCrossPackageDeps(monorepo.packages);
    }

    const packagesWithIssues = packageResults.filter(
        (pr) => pr.result.total > 0 || (pr.error ? false : true && pr.result.total > 0)
    ).length;

    return {
        rootDir: options.projectDir,
        monorepo,
        packageResults,
        crossPackageIssues,
        summary: {
            totalPackages: packagesToScan.length,
            scannedPackages: packageResults.filter((pr) => pr.success).length,
            packagesWithIssues,
            totalIssues: totalCritical + totalWarning + totalSuggestion,
            issuesBySeverity: {
                critical: totalCritical,
                warning: totalWarning,
                suggestion: totalSuggestion,
            },
            issuesByModule,
            totalDuration,
            totalFilesScanned,
        },
    };
}

/**
 * 生成 workspace 扫描的终端输出
 */
export function formatWorkspaceReport(result: WorkspaceScanResult): string {
    const lines: string[] = [];
    const { summary, monorepo, packageResults, crossPackageIssues } = result;

    lines.push("📦 Monorepo Workspace 扫描报告");
    lines.push(`   工具: ${monorepo.tool} | 根目录: ${monorepo.rootDir}`);
    lines.push(`   共 ${summary.totalPackages} 个包，${summary.scannedPackages} 个扫描成功`);
    lines.push("");

    // 各包结果
    for (const pr of packageResults) {
        const pkg = pr.package;
        if (!pr.success) {
            lines.push(`   ❌ ${pkg.name} (${pkg.path})`);
            lines.push(`      扫描失败: ${pr.error}`);
            continue;
        }

        const { critical, warning, suggestion } = pr.result.issues;
        const total = critical.length + warning.length + suggestion.length;

        if (total === 0) {
            lines.push(`   ✅ ${pkg.name} (${pkg.path}) — 无问题`);
        } else {
            const parts: string[] = [];
            if (critical.length) parts.push(`🔴 ${critical.length}`);
            if (warning.length) parts.push(`🟡 ${warning.length}`);
            if (suggestion.length) parts.push(`💡 ${suggestion.length}`);
            lines.push(`   ⚠️  ${pkg.name} (${pkg.path}) — ${parts.join(" | ")}`);
        }
    }

    // 跨包依赖问题
    if (crossPackageIssues.length > 0) {
        lines.push("");
        lines.push("🔗 跨包依赖分析");
        for (const issue of crossPackageIssues) {
            const icon = issue.severity === "critical" ? "🔴" : issue.severity === "warning" ? "🟡" : "💡";
            lines.push(`   ${icon} [${issue.type}] ${issue.message}`);
        }
    }

    // 汇总
    lines.push("");
    lines.push("📊 汇总");
    lines.push(`   🔴 Critical: ${summary.issuesBySeverity.critical}`);
    lines.push(`   🟡 Warning: ${summary.issuesBySeverity.warning}`);
    lines.push(`   💡 Suggestion: ${summary.issuesBySeverity.suggestion}`);
    lines.push(`   ⏱️  总耗时: ${summary.totalDuration}ms | 扫描 ${summary.totalFilesScanned} 个文件`);

    return lines.join("\n");
}

/**
 * 生成 workspace 扫描的 JSON 输出
 */
export function formatWorkspaceJson(result: WorkspaceScanResult): object {
    return {
        monorepo: {
            tool: result.monorepo.tool,
            rootDir: result.monorepo.rootDir,
            packages: result.monorepo.packages.map((p) => ({ name: p.name, path: p.path })),
        },
        packageResults: result.packageResults.map((pr) => ({
            name: pr.package.name,
            path: pr.package.path,
            success: pr.success,
            error: pr.error,
            total: pr.result.total,
            issues: pr.result.issues,
            duration: pr.result.duration,
            filesScanned: pr.result.filesScanned,
        })),
        crossPackageIssues: result.crossPackageIssues,
        summary: result.summary,
    };
}
