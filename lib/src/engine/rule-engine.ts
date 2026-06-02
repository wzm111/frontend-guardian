/**
 * RuleEngine — 可插拔规则引擎核心
 *
 * 设计目标：
 * 1. 支持注册/注销规则（插件化）
 * 2. 按 severity 过滤
 * 3. 按 framework/platform/componentLib 条件执行
 * 4. 并行扫描多文件
 * 5. 支持增量扫描（git diff）
 */

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import type {
    Rule,
    RuleContext,
    Issue,
    Severity,
    ScanResult,
    ProjectConfig,
    ProjectMeta,
    RuleUtils,
    ParseOptions,
    Position,
    FixPreview,
} from "@/types.js";
import { parseAST, getImports } from "@/utils/ast-parser.js";
import type { ParseResult } from "@babel/parser";
import type { File } from "@babel/types";
import { detectProjectMeta } from "@/utils/project-detector.js";
import { loadConfig } from "@/utils/config-loader.js";
import { RuleRegistry, createRegistry } from "@/rules/registry.js";
import { globby } from "globby";
import pc from "picocolors";
import type { ExternalTool, ExternalToolResult } from "@/integrations/index.js";
import { runAllExternalTools } from "@/integrations/index.js";
import { SmartCache } from "./cache.js";
import { HistoryReport } from "@/utils/history-report.js";
import { runFormat } from "@/integrations/formatter.js";
import { concurrentMap, getDefaultConcurrency } from "@/utils/concurrent.js";

export interface EngineOptions {
    /** 项目根目录 */
    projectDir: string;
    /** 最低 severity */
    minSeverity?: Severity;
    /** 仅检查这些文件 */
    files?: string[];
    /** 排除模式 */
    exclude?: string[];
    /** 并行度 */
    concurrency?: number;
    /** 配置文件路径 */
    configFile?: string;
    /** 仅扫描 git staged 文件 */
    staged?: boolean;
    /** git diff 范围，如 main...feature */
    diffRange?: string;
    /** 智能扫描范围：自动检测未提交/最近修改的文件 */
    autoScope?: boolean;
    /** 是否运行外部工具集成（ESLint / TypeScript / Stylelint） */
    external?: boolean;
    /** 是否启用智能缓存 */
    cache?: boolean;
    /** 缓存 TTL（毫秒，默认 7 天） */
    cacheTtl?: number;
    /** 修复预览模式（只展示不写入） */
    dryRun?: boolean;
    /** 交互式修复模式（逐条确认） */
    interactive?: boolean;
    /** 大文件跳过阈值（字节，默认 500KB = 512000） */
    skipLargeFilesThreshold?: number;
    /** v2.6.0: 外部传入的 SmartCache 实例（用于 Watch 模式复用缓存） */
    cacheInstance?: SmartCache;
}

export class RuleEngine {
    private registry: RuleRegistry;
    private config: ProjectConfig = {};
    private projectMeta: ProjectMeta;
    private options: EngineOptions;
    private cache?: SmartCache;
    private history: HistoryReport;

    constructor(options: EngineOptions) {
        this.options = options;
        this.config = loadConfig(options.projectDir, options.configFile);
        this.projectMeta = detectProjectMeta(options.projectDir, this.config);
        this.registry = createRegistry();

        // Phase 3: 从配置加载规则覆盖和自定义规则
        this.loadConfigRules();

        // Phase 5: 初始化智能缓存
        if (options.cache !== false) {
            this.cache = options.cacheInstance ?? new SmartCache(options.projectDir, options.cacheTtl);
        }

        // Phase 6: 初始化历史报告
        this.history = new HistoryReport(options.projectDir);
    }

    /** ── Phase 3: 配置驱动规则加载 ── */
    private loadConfigRules(): void {
        // 1. 加载规则配置覆盖（启用/禁用/severity/params）
        if (this.config.rules && this.config.rules.length > 0) {
            this.registry.loadFromConfig(this.config.rules);
        }

        // 2. 加载自定义规则文件
        if (this.config.customRules && this.config.customRules.length > 0) {
            const paths = this.config.customRules.map((c) => c.path);
            const result = this.registry.loadCustomRules(paths, this.options.projectDir);
            if (result.loaded.length > 0) {
                console.log(pc.blue(`🔌 已加载 ${result.loaded.length} 个自定义规则`));
            }
            if (result.failed.length > 0) {
                console.log(pc.yellow(`⚠️  ${result.failed.length} 个自定义规则加载失败`));
            }
        }
    }

    /** 注册规则 */
    register(rule: Rule): this {
        this.registry.register(rule);
        return this;
    }

    /** 批量注册 */
    registerAll(rules: Rule[]): this {
        this.registry.registerAll(rules);
        return this;
    }

    /** 注销规则 */
    unregister(ruleId: string): this {
        this.registry.unregister(ruleId);
        return this;
    }

    /** 获取所有已注册规则（应用配置覆盖后） */
    getRules(): Rule[] {
        return this.registry.getActiveRules();
    }

    /** 根据条件过滤规则 */
    filterRules(options?: { category?: string; framework?: string; platform?: string; componentLib?: string }): Rule[] {
        return this.registry.filterRules(options);
    }

    /** 模块名到规则 category 的映射 */
    private moduleToCategory(module: string): string {
        const map: Record<string, string> = {
            a11y: "accessibility",
            naming: "style",
            "cross-file": "architecture",
        };
        return map[module] || module;
    }

    /** 执行扫描 */
    async scan(module: string): Promise<ScanResult> {
        const startTime = Date.now();
        const issues: Record<Severity, Issue[]> = {
            critical: [],
            warning: [],
            suggestion: [],
        };

        // 先根据 projectMeta 过滤规则，无匹配规则则跳过 glob
        const category = this.moduleToCategory(module);
        const activeRules = this.filterRules({
            category,
            framework: this.projectMeta.framework,
            platform: this.projectMeta.platforms[0],
            componentLib: this.projectMeta.componentLib,
        });

        if (activeRules.length === 0) {
            return {
                module,
                total: 0,
                issues,
                duration: 0,
                filesScanned: 0,
                filesWithIssues: 0,
            };
        }

        // 获取扫描文件列表
        const files = await this.getScanFiles();
        let filesWithIssues = 0;

        console.log(pc.blue(`🔍 [${module}] 扫描 ${files.length} 个文件，${activeRules.length} 条规则...`));

        // v2.1.0: 受控并发并行扫描
        const concurrency = this.options.concurrency ?? getDefaultConcurrency();
        const fileResults = await concurrentMap(files, concurrency, (file) =>
            this.scanFile(file, activeRules)
        );

        let filesSkipped = 0;
        for (const { issues: fileIssues, skipped } of fileResults) {
            if (skipped) {
                filesSkipped++;
                continue;
            }
            if (fileIssues.length > 0) {
                filesWithIssues++;
                for (const issue of fileIssues) {
                    // severity 过滤
                    const severityOrder = { critical: 3, warning: 2, suggestion: 1 };
                    const minSev = this.options.minSeverity || "suggestion";
                    if (severityOrder[issue.severity] >= severityOrder[minSev]) {
                        issues[issue.severity].push(issue);
                    }
                }
            }
        }

        const total = issues.critical.length + issues.warning.length + issues.suggestion.length;
        const filesScanned = files.length - filesSkipped;

        // Phase 5: 保存缓存并输出统计
        if (this.cache) {
            this.cache.save();
            const stats = this.cache.getStats();
            if (stats.total > 0) {
                console.log(pc.gray(`   💾 缓存: ${stats.valid} 命中 / ${stats.expired} 过期 / ${stats.total} 总计`));
            }
        }

        const result: ScanResult = {
            module,
            total,
            issues,
            duration: Date.now() - startTime,
            filesScanned,
            filesWithIssues,
        };

        // Phase 6: 记录扫描历史并输出趋势
        const allIssues = [...issues.critical, ...issues.warning, ...issues.suggestion];
        this.history.record(result, allIssues);

        const trend = this.history.analyze(module, allIssues.map((i) => `${i.file}|${i.ruleId}|${i.line}`));
        if (trend.totalScans > 1) {
            if (trend.newIssues.length > 0) {
                console.log(pc.yellow(`   📈 新增 ${trend.newIssues.length} 个问题（对比上次扫描）`));
            }
            if (trend.fixedIssues.length > 0) {
                console.log(pc.green(`   ✅ 已修复 ${trend.fixedIssues.length} 个问题（对比上次扫描）`));
            }
        }

        return result;
    }

    /** 扫描单个文件（带智能缓存 + 大文件跳过） */
    private async scanFile(filePath: string, rules: Rule[]): Promise<{ issues: Issue[]; skipped?: boolean }> {
        try {
            // v2.4.0: 大文件智能跳过
            const threshold = this.options.skipLargeFilesThreshold ?? 512_000;
            if (threshold > 0) {
                try {
                    const stats = statSync(filePath);
                    if (stats.size > threshold) {
                        console.log(
                            pc.yellow(
                                `   ⚠️ 跳过超大文件: ${filePath} (${(stats.size / 1024).toFixed(1)}KB > ${(threshold / 1024).toFixed(0)}KB)`
                            )
                        );
                        return { issues: [], skipped: true };
                    }
                } catch {
                    // stat 失败继续尝试读取
                }
            }

            const source = readFileSync(filePath, "utf-8");

            // Phase 5: 智能缓存命中检查
            if (this.cache?.isCached(filePath, source)) {
                const cached = this.cache.get(filePath);
                if (cached) {
                    return { issues: cached };
                }
            }

            const allIssues: Issue[] = [];
            const utils = this.createUtils(filePath, source);
            const context: RuleContext = {
                filePath,
                source,
                config: this.config,
                projectMeta: this.projectMeta,
                utils,
                sharedCache: new Map(),
            };

            for (const rule of rules) {
                try {
                    const result = await rule.execute(context);
                    // v2.4.0: 为每个 issue 注入 docsUrl
                    for (const issue of result) {
                        if (rule.docsUrl && !issue.docsUrl) {
                            issue.docsUrl = rule.docsUrl;
                        }
                    }
                    allIssues.push(...result);
                } catch (err) {
                    console.error(pc.red(`  Rule "${rule.id}" failed on ${filePath}:`), err);
                }
            }

            // Phase 5: 缓存结果
            this.cache?.set(filePath, source, allIssues);

            return { issues: allIssues };
        } catch (err) {
            // 文件读取失败，静默跳过
            return { issues: [] };
        }
    }

    /** 获取扫描文件列表 */
    private async getScanFiles(): Promise<string[]> {
        // 增量扫描：git staged / diff 范围 / auto-scope
        if (this.options.staged || this.options.diffRange || this.options.autoScope) {
            const diffFiles = this.options.autoScope
                ? this.getAutoScopeFiles()
                : this.getDiffFiles();
            if (diffFiles.length === 0) {
                if (this.options.autoScope) {
                    // auto-scope 无结果时回退到全量扫描
                    console.log(pc.yellow("⚠️  未检测到修改文件，回退到全量扫描"));
                }
                return [];
            }
            // 过滤出符合扩展名的文件
            const include = this.config.scan?.includeExtensions || [".js", ".ts", ".jsx", ".tsx", ".vue"];
            const filtered = diffFiles.filter((f) => include.some((ext) => f.endsWith(ext)));
            if (this.options.autoScope && filtered.length > 0) {
                console.log(pc.cyan(`🔍 智能扫描范围: ${filtered.length} 个文件`));
            }
            return filtered;
        }

        if (this.options.files && this.options.files.length > 0) {
            return this.options.files;
        }

        const include = this.config.scan?.includeExtensions || [".js", ".ts", ".jsx", ".tsx", ".vue"];
        const exclude = [
            "**/node_modules/**",
            "**/dist/**",
            "**/build/**",
            "**/.git/**",
            "**/coverage/**",
            ...(this.options.exclude || []),
            ...(this.config.scan?.excludeDirs?.map((d) => `**/${d}/**`) || []),
        ];

        const patterns = include.map((ext) => `**/*${ext}`);
        return globby(patterns, {
            cwd: this.options.projectDir,
            ignore: exclude,
            absolute: true,
        });
    }

    /** 通过 git 获取变更文件列表 */
    private getDiffFiles(): string[] {
        try {
            let cmd: string;
            if (this.options.staged) {
                cmd = "git diff --cached --name-only --diff-filter=ACM";
            } else if (this.options.diffRange) {
                cmd = `git diff --name-only --diff-filter=ACM ${this.options.diffRange}`;
            } else {
                return [];
            }

            const output = execSync(cmd, {
                cwd: this.options.projectDir,
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "ignore"],
            });

            return output
                .trim()
                .split("\n")
                .filter(Boolean)
                .map((f) => resolve(this.options.projectDir, f));
        } catch {
            return [];
        }
    }

    /** 智能推断扫描范围：未提交修改 → 最近 5 次提交 → 全量 */
    private getAutoScopeFiles(): string[] {
        try {
            const files = new Set<string>();

            // 1. 未提交的修改（unstaged + staged）
            for (const cmd of [
                "git diff --name-only --diff-filter=ACM",
                "git diff --cached --name-only --diff-filter=ACM",
            ]) {
                try {
                    const output = execSync(cmd, {
                        cwd: this.options.projectDir,
                        encoding: "utf-8",
                        stdio: ["pipe", "pipe", "ignore"],
                    });
                    output
                        .trim()
                        .split("\n")
                        .filter(Boolean)
                        .forEach((f) => files.add(resolve(this.options.projectDir, f)));
                } catch {
                    // 忽略单条命令失败
                }
            }

            // 2. 无未提交修改时，回退到最近 5 次提交
            if (files.size === 0) {
                try {
                    const output = execSync("git diff --name-only --diff-filter=ACM HEAD~5...HEAD", {
                        cwd: this.options.projectDir,
                        encoding: "utf-8",
                        stdio: ["pipe", "pipe", "ignore"],
                    });
                    output
                        .trim()
                        .split("\n")
                        .filter(Boolean)
                        .forEach((f) => files.add(resolve(this.options.projectDir, f)));
                } catch {
                    // 可能不足 5 次提交，忽略
                }
            }

            return Array.from(files);
        } catch {
            return [];
        }
    }

    /** 创建 RuleUtils */
    private createUtils(filePath: string, source: string): RuleUtils {
        const lineOffsets = this.computeLineOffsets(source);
        const cache = this.cache;

        return {
            // v2.1.0: parseAST 注入 AST 缓存，同一文件未变更时跳过重新解析
            parseAST: (src: string, options?: ParseOptions) => {
                if (cache && src === source) {
                    const cached = cache.getAst(filePath, source);
                    if (cached) return cached as ParseResult<File>;
                }
                const ast = parseAST(src, options);
                if (cache && ast && src === source) {
                    cache.setAst(filePath, source, ast);
                }
                return ast;
            },
            getImports: (ast: unknown) => getImports(ast as any),
            reportPosition: (offset: number): Position => {
                let line = 1;
                let column = 1;
                for (let i = 0; i < lineOffsets.length; i++) {
                    if (offset < lineOffsets[i]) {
                        line = i;
                        column = offset - (lineOffsets[i - 1] || 0) + 1;
                        break;
                    }
                    if (i === lineOffsets.length - 1) {
                        line = lineOffsets.length;
                        column = offset - lineOffsets[i] + 1;
                    }
                }
                return { line, column };
            },
            getSourceSnippet: (start: number, end: number): string => {
                return source.slice(start, end);
            },
        };
    }

    /** 计算每行起始偏移 */
    private computeLineOffsets(source: string): number[] {
        const offsets: number[] = [0];
        for (let i = 0; i < source.length; i++) {
            if (source[i] === "\n") {
                offsets.push(i + 1);
            }
        }
        return offsets;
    }

    // ---------------------------------------------------------------------------
    // 自动修复
    // ---------------------------------------------------------------------------

    /**
     * 应用所有可修复的问题
     * @param issues 包含 fix 字段的 Issue 列表
     * @returns 修复统计（dryRun 模式下 filesModified 为空，fixedCount 为预览数量）
     */
    applyFixes(issues: Issue[]): { fixedCount: number; filesModified: string[]; errors: string[]; previews?: FixPreview[]; skippedByUser?: number } {
        const dryRun = this.options.dryRun;
        const interactive = this.options.interactive;
        let fixedCount = 0;
        let skippedByUser = 0;
        const filesModified: string[] = [];
        const errors: string[] = [];
        const previews: FixPreview[] = [];

        // 按文件分组
        const byFile = new Map<string, Issue[]>();
        for (const issue of issues) {
            if (!issue.fix) continue;
            const list = byFile.get(issue.file) || [];
            list.push(issue);
            byFile.set(issue.file, list);
        }

        for (const [filePath, fileIssues] of byFile) {
            try {
                let source = readFileSync(filePath, "utf-8");
                const originalSource = source;

                // 按行号倒序排列，从文件末尾开始修复，避免行号偏移
                const sorted = [...fileIssues].sort((a, b) => {
                    const lineDiff = (b.fix!.start.line || 0) - (a.fix!.start.line || 0);
                    if (lineDiff !== 0) return lineDiff;
                    return (b.fix!.start.column || 0) - (a.fix!.start.column || 0);
                });

                for (const issue of sorted) {
                    const fix = issue.fix!;
                    const confidence = fix.confidence ?? "high";
                    const patched = this.applySingleFix(source, fix);

                    if (dryRun) {
                        // 生成 diff 预览
                        const diff = this.makeDiffPreview(source, patched, fix);
                        previews.push({
                            file: filePath,
                            ruleId: issue.ruleId,
                            title: issue.title,
                            diff,
                        });
                        fixedCount++;
                        source = patched;
                        continue;
                    }

                    if (interactive) {
                        // v2.4.0: 交互式修复模式 — 逐条确认
                        const shouldApply = this.promptForFix(issue, confidence, source, patched);
                        if (shouldApply) {
                            const before = source;
                            source = patched;
                            if (source !== before) {
                                fixedCount++;
                            }
                        } else {
                            skippedByUser++;
                        }
                    } else {
                        // 自动修复：低置信度自动跳过
                        if (confidence === "low") {
                            skippedByUser++;
                            continue;
                        }
                        const before = source;
                        source = patched;
                        if (source !== before) {
                            fixedCount++;
                        }
                    }
                }

                if (source !== originalSource) {
                    if (!dryRun) {
                        writeFileSync(filePath, source, "utf-8");
                    }
                    filesModified.push(filePath);
                }
            } catch (err) {
                errors.push(`修复 ${filePath} 失败: ${err}`);
            }
        }

        const result: { fixedCount: number; filesModified: string[]; errors: string[]; previews?: FixPreview[]; skippedByUser?: number } =
            { fixedCount, filesModified, errors, skippedByUser };
        if (dryRun) {
            result.previews = previews;
        }
        return result;
    }

    /**
     * v2.4.0: 交互式修复 — 向用户展示 diff 并询问是否应用
     * 同步阻塞式输入（基于 readline），适用于 CLI 场景
     */
    private promptForFix(issue: Issue, confidence: string, original: string, patched: string): boolean {
        const diff = this.makeDiffPreview(original, patched, issue.fix!);
        const confidenceIcon = confidence === "high" ? pc.green("●") : confidence === "medium" ? pc.yellow("●") : pc.red("●");
        const confidenceLabel = confidence === "high" ? "高置信度" : confidence === "medium" ? "中置信度" : "低置信度";

        console.log(pc.cyan(`\n  📄 ${issue.file}:${issue.line}`));
        console.log(pc.yellow(`     [${issue.ruleId}] ${issue.title}`));
        console.log(pc.gray(`     置信度: ${confidenceIcon} ${confidenceLabel}`));
        if (issue.fix?.description) {
            console.log(pc.gray(`     说明: ${issue.fix.description}`));
        }
        console.log(diff);
        console.log(pc.gray("     选项: [y] 应用  [n] 跳过  [a] 全部应用  [q] 退出"));

        // 使用同步 readline 读取用户输入
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
            // 简单同步读取（适用于 Node.js CLI）
            const answer = this.readSyncLine(rl);
            const trimmed = answer.trim().toLowerCase();
            if (trimmed === "a") {
                // 全部应用：关闭交互模式，后续自动应用
                this.options.interactive = false;
                return true;
            }
            if (trimmed === "q") {
                console.log(pc.gray("     已退出交互式修复"));
                process.exit(0);
            }
            return trimmed === "y" || trimmed === "yes" || trimmed === "";
        } finally {
            rl.close();
        }
    }

    /** 同步读取一行输入 */
    private readSyncLine(rl: import("node:readline").Interface): string {
        const { stdin, stdout } = process;
        stdin.setRawMode?.(true);
        stdin.resume();
        let result = "";
        const buf = Buffer.alloc(1);
        while (true) {
            const bytesRead = (stdin as any).readSync ? (stdin as any).readSync(buf) : 0;
            if (bytesRead === 0) continue;
            const char = buf.toString("utf8");
            if (char === "\n" || char === "\r") break;
            if (char === "") process.exit(0); // Ctrl+C
            result += char;
            stdout.write(char);
        }
        stdout.write("\n");
        stdin.setRawMode?.(false);
        stdin.pause();
        return result;
    }

    /** 对单文件应用单个修复 */
    private applySingleFix(source: string, fix: NonNullable<Issue["fix"]>): string {
        const lines = source.split("\n");
        const { line: startLine, column: startCol } = fix.start;
        const { line: endLine, column: endCol } = fix.end;

        // 单行修复
        if (startLine === endLine) {
            const idx = startLine - 1;
            if (idx < 0 || idx >= lines.length) return source;
            const targetLine = lines[idx];
            const before = targetLine.slice(0, Math.max(0, startCol - 1));
            const after = targetLine.slice(Math.max(0, endCol - 1));
            lines[idx] = before + fix.text + after;
            return lines.join("\n");
        }

        // 多行修复：替换从 start 到 end 的所有内容
        const startIdx = startLine - 1;
        const endIdx = endLine - 1;
        if (startIdx < 0 || endIdx >= lines.length) return source;

        const before = lines[startIdx].slice(0, Math.max(0, startCol - 1));
        const after = lines[endIdx].slice(Math.max(0, endCol - 1));
        const newLines = fix.text.split("\n");

        // 合并首尾
        newLines[0] = before + newLines[0];
        newLines[newLines.length - 1] = newLines[newLines.length - 1] + after;

        // 替换行范围
        lines.splice(startIdx, endIdx - startIdx + 1, ...newLines);
        return lines.join("\n");
    }

    /** 生成 diff 预览（dry-run 模式） */
    private makeDiffPreview(original: string, patched: string, fix: NonNullable<Issue["fix"]>): string {
        const origLines = original.split("\n");
        const patchedLines = patched.split("\n");
        const { line: startLine } = fix.start;
        const { line: endLine } = fix.end;

        // 展示变更前后的上下文（前后各2行）
        const contextBefore = Math.max(0, startLine - 3);
        const contextAfter = Math.min(origLines.length, endLine + 2);

        const lines: string[] = [];
        for (let i = contextBefore; i < contextAfter; i++) {
            const orig = origLines[i] || "";
            const patch = patchedLines[i] || "";
            if (i >= startLine - 1 && i < endLine) {
                lines.push(pc.red(`- ${orig}`));
            }
            if (i >= startLine - 1 && i < startLine - 1 + fix.text.split("\n").length) {
                const patchLines = patch.split("\n");
                const idx = i - (startLine - 1);
                if (patchLines[idx]) {
                    lines.push(pc.green(`+ ${patchLines[idx]}`));
                }
            }
            if (i < startLine - 1 || i >= endLine) {
                lines.push(pc.gray(`  ${orig}`));
            }
        }
        return lines.join("\n");
    }

    /** 清理过期缓存 */
    gcCache(): number {
        return this.cache?.gc() ?? 0;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Phase 5/6: 代码格式化（对被扫描项目）
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * 格式化被扫描项目的代码
     * 自动检测 Biome / Prettier，使用项目已有配置或生成默认配置
     * @param files 指定文件列表（undefined 则格式化全部）
     */
    format(files?: string[]): import("../integrations/formatter.js").FormatResult {
        return runFormat(this.options.projectDir, files);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Issue 聚类 (Phase 2: 智能化)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * 将相似 Issue 聚类为聚合 Issue
     * 按 (file, ruleId) 分组，同一文件同一规则的多个 Issue 合并为一个
     */
    clusterIssues(issues: Issue[]): Issue[] {
        const groups = new Map<string, Issue[]>();

        for (const issue of issues) {
            const key = `${issue.file}|${issue.ruleId}`;
            const list = groups.get(key) || [];
            list.push(issue);
            groups.set(key, list);
        }

        const clustered: Issue[] = [];
        for (const [, groupIssues] of groups) {
            if (groupIssues.length === 1) {
                clustered.push(groupIssues[0]);
                continue;
            }

            // 按行号排序，取第一个作为代表
            const sorted = [...groupIssues].sort((a, b) => a.line - b.line || a.column - b.column);
            const representative = sorted[0];
            const allLines = sorted.map((i) => i.line);

            clustered.push({
                ...representative,
                title: `${representative.title} (×${groupIssues.length})`,
                description: `${representative.description}\n\n聚类详情：在 ${groupIssues.length} 处发现同类问题（行: ${allLines.join(", ")}）`,
                meta: {
                    ...representative.meta,
                    clusterCount: groupIssues.length,
                    clusteredLines: allLines,
                    clusteredRuleId: representative.ruleId,
                },
            });
        }

        return clustered;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Phase 4: 外部工具集成 (ESLint / TypeScript / Stylelint)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * 运行外部工具集成检查
     * 自动检测项目中可用的工具（ESLint / TypeScript / Stylelint）并执行
     */
    runExternal(tools?: ExternalTool[]): ExternalToolResult[] {
        const targetTools = tools || this.getDefaultExternalTools();
        if (targetTools.length === 0) {
            return [];
        }

        console.log(pc.cyan("🔌 运行外部工具集成..."));

        // 获取当前扫描文件列表（用于增量模式）
        const scanFiles = this.options.staged || this.options.diffRange ? this.getDiffFiles() : undefined;

        return runAllExternalTools(this.options.projectDir, targetTools, scanFiles);
    }

    /** 获取默认的外部工具列表 */
    private getDefaultExternalTools(): ExternalTool[] {
        // 动态导入避免循环依赖
        const { allExternalTools } = require("../integrations/index.js");
        return allExternalTools;
    }
}

/** 创建默认引擎实例 */
export function createEngine(options: EngineOptions): RuleEngine {
    return new RuleEngine(options);
}
