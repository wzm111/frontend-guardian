/**
 * v3.3.0: 增量诊断引擎 — IDE 集成核心
 *
 * 为 IDE 提供毫秒级单文件诊断能力：
 * 1. 复用 RuleEngine 的规则执行逻辑
 * 2. 文件内容缓存，避免重复解析
 * 3. 增量更新：只重新扫描变更的文件
 * 4. 目标：单文件诊断 < 100ms
 */

import type { Issue, Severity } from "@/types.js";
import { RuleEngine } from "@/engine/rule-engine.js";
import type { EngineOptions } from "@/engine/rule-engine.js";

export interface DiagnosticResult {
    /** 诊断发现的 issues */
    issues: Issue[];
    /** 扫描耗时（毫秒） */
    duration: number;
    /** 是否来自缓存 */
    fromCache: boolean;
    /** 扫描的文件数 */
    filesScanned: number;
}

export interface IncrementalDiagnosticOptions {
    /** 项目根目录 */
    projectDir: string;
    /** 最低 severity */
    minSeverity?: Severity;
    /** 配置文件路径 */
    configFile?: string;
    /** 是否启用缓存 */
    cache?: boolean;
}

/**
 * 增量诊断引擎
 *
 * 维护一个 RuleEngine 实例，对单个文件进行快速诊断。
 * 适用于 IDE 场景：文件保存/内容变更时触发扫描。
 */
export class IncrementalDiagnostic {
    private engine: RuleEngine;
    private projectDir: string;
    /** 文件内容缓存：filePath → content */
    private contentCache = new Map<string, string>();
    /** 诊断结果缓存：filePath → Issue[] */
    private diagnosticCache = new Map<string, Issue[]>();
    /** 缓存命中统计 */
    private cacheHits = 0;
    private cacheMisses = 0;

    constructor(options: IncrementalDiagnosticOptions) {
        this.projectDir = options.projectDir;

        const engineOptions: EngineOptions = {
            projectDir: options.projectDir,
            minSeverity: options.minSeverity,
            configFile: options.configFile,
            cache: options.cache !== false,
            // IDE 场景不需要大文件跳过（IDE 文件通常不大）
            skipLargeFilesThreshold: -1,
        };

        this.engine = new RuleEngine(engineOptions);
    }

    /**
     * 对单个文件进行诊断
     * @param filePath 文件绝对路径
     * @param content  文件内容（可选，不传则读取文件）
     * @param module   指定模块扫描（可选）
     * @returns 诊断结果
     */
    async diagnose(filePath: string, content?: string, module?: string): Promise<DiagnosticResult> {
        const startTime = Date.now();
        const currentContent = content ?? this.readFile(filePath);

        // 检查内容缓存：内容未变更则直接返回缓存结果
        const cachedContent = this.contentCache.get(filePath);
        if (cachedContent === currentContent) {
            const cachedResult = this.diagnosticCache.get(filePath);
            if (cachedResult) {
                this.cacheHits++;
                return {
                    issues: cachedResult,
                    duration: Date.now() - startTime,
                    fromCache: true,
                    filesScanned: 0,
                };
            }
        }

        this.cacheMisses++;

        // 内容变更或首次扫描：执行规则扫描
        const issues = await this.engine.scanSingleFile(filePath, module);

        // 更新缓存
        this.contentCache.set(filePath, currentContent);
        this.diagnosticCache.set(filePath, issues);

        return {
            issues,
            duration: Date.now() - startTime,
            fromCache: false,
            filesScanned: 1,
        };
    }

    /**
     * 批量诊断多个文件
     * @param filePaths 文件路径列表
     * @returns 每个文件的诊断结果
     */
    async diagnoseBatch(filePaths: string[]): Promise<Map<string, DiagnosticResult>> {
        const results = new Map<string, DiagnosticResult>();

        for (const filePath of filePaths) {
            const result = await this.diagnose(filePath);
            results.set(filePath, result);
        }

        return results;
    }

    /**
     * 使文件缓存失效（文件被外部修改时调用）
     */
    invalidate(filePath: string): void {
        this.contentCache.delete(filePath);
        this.diagnosticCache.delete(filePath);
    }

    /**
     * 清空所有缓存
     */
    clearCache(): void {
        this.contentCache.clear();
        this.diagnosticCache.clear();
        this.cacheHits = 0;
        this.cacheMisses = 0;
    }

    /**
     * 获取缓存统计
     */
    getCacheStats(): { hits: number; misses: number; hitRate: number } {
        const total = this.cacheHits + this.cacheMisses;
        return {
            hits: this.cacheHits,
            misses: this.cacheMisses,
            hitRate: total > 0 ? this.cacheHits / total : 0,
        };
    }

    /** 读取文件内容 */
    private readFile(filePath: string): string {
        try {
            const { readFileSync } = require("node:fs");
            return readFileSync(filePath, "utf-8");
        } catch {
            return "";
        }
    }
}

/**
 * 快速创建增量诊断引擎
 */
export function createIncrementalDiagnostic(options: IncrementalDiagnosticOptions): IncrementalDiagnostic {
    return new IncrementalDiagnostic(options);
}
