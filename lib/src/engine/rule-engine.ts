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

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
} from '../types.js';
import { parseAST, getImports } from '../utils/ast-parser.js';
import { detectProjectMeta } from '../utils/project-detector.js';
import { loadConfig } from '../utils/config-loader.js';
import { globby } from 'globby';
import pc from 'picocolors';

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
}

export class RuleEngine {
  private rules: Map<string, Rule> = new Map();
  private config: ProjectConfig = {};
  private projectMeta: ProjectMeta;
  private options: EngineOptions;

  constructor(options: EngineOptions) {
    this.options = options;
    this.config = loadConfig(options.projectDir, options.configFile);
    this.projectMeta = detectProjectMeta(options.projectDir, this.config);
  }

  /** 注册规则 */
  register(rule: Rule): this {
    this.rules.set(rule.id, rule);
    return this;
  }

  /** 批量注册 */
  registerAll(rules: Rule[]): this {
    for (const rule of rules) {
      this.register(rule);
    }
    return this;
  }

  /** 注销规则 */
  unregister(ruleId: string): this {
    this.rules.delete(ruleId);
    return this;
  }

  /** 获取所有已注册规则 */
  getRules(): Rule[] {
    return Array.from(this.rules.values());
  }

  /** 根据条件过滤规则 */
  filterRules(options?: {
    category?: string;
    framework?: string;
    platform?: string;
    componentLib?: string;
  }): Rule[] {
    return this.getRules().filter((rule) => {
      if (options?.category && rule.category !== options.category) return false;
      if (options?.framework && rule.frameworks && !rule.frameworks.includes(options.framework as any)) return false;
      if (options?.platform && rule.platforms && !rule.platforms.includes(options.platform as any)) return false;
      if (options?.componentLib && rule.componentLibs && !rule.componentLibs.includes(options.componentLib as any)) return false;
      return true;
    });
  }

  /** 执行扫描 */
  async scan(module: string): Promise<ScanResult> {
    const startTime = Date.now();
    const issues: Record<Severity, Issue[]> = {
      critical: [],
      warning: [],
      suggestion: [],
    };

    // 获取扫描文件列表
    const files = await this.getScanFiles();
    let filesWithIssues = 0;

    // 过滤出当前模块相关的规则
    const activeRules = this.filterRules({
      category: module,
      framework: this.projectMeta.framework,
      platform: this.projectMeta.platforms[0],
      componentLib: this.projectMeta.componentLib,
    });

    console.log(pc.blue(`🔍 [${module}] 扫描 ${files.length} 个文件，${activeRules.length} 条规则...`));

    // 并行扫描文件
    for (const file of files) {
      const fileIssues = await this.scanFile(file, activeRules);
      if (fileIssues.length > 0) {
        filesWithIssues++;
        for (const issue of fileIssues) {
          // severity 过滤
          const severityOrder = { critical: 3, warning: 2, suggestion: 1 };
          const minSev = this.options.minSeverity || 'suggestion';
          if (severityOrder[issue.severity] >= severityOrder[minSev]) {
            issues[issue.severity].push(issue);
          }
        }
      }
    }

    const total = issues.critical.length + issues.warning.length + issues.suggestion.length;

    return {
      module,
      total,
      issues,
      duration: Date.now() - startTime,
      filesScanned: files.length,
      filesWithIssues,
    };
  }

  /** 扫描单个文件 */
  private async scanFile(filePath: string, rules: Rule[]): Promise<Issue[]> {
    const allIssues: Issue[] = [];

    try {
      const source = readFileSync(filePath, 'utf-8');
      const utils = this.createUtils(filePath, source);
      const context: RuleContext = {
        filePath,
        source,
        config: this.config,
        projectMeta: this.projectMeta,
        utils,
      };

      for (const rule of rules) {
        try {
          const result = await rule.execute(context);
          allIssues.push(...result);
        } catch (err) {
          console.error(pc.red(`  Rule "${rule.id}" failed on ${filePath}:`), err);
        }
      }
    } catch (err) {
      // 文件读取失败，静默跳过
    }

    return allIssues;
  }

  /** 获取扫描文件列表 */
  private async getScanFiles(): Promise<string[]> {
    if (this.options.files && this.options.files.length > 0) {
      return this.options.files;
    }

    const include = this.config.scan?.includeExtensions || ['.js', '.ts', '.jsx', '.tsx', '.vue'];
    const exclude = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      ...(this.options.exclude || []),
      ...(this.config.scan?.excludeDirs?.map(d => `**/${d}/**`) || []),
    ];

    const patterns = include.map(ext => `**/*${ext}`);
    return globby(patterns, {
      cwd: this.options.projectDir,
      ignore: exclude,
      absolute: true,
    });
  }

  /** 创建 RuleUtils */
  private createUtils(filePath: string, source: string): RuleUtils {
    const lineOffsets = this.computeLineOffsets(source);

    return {
      parseAST: (src: string, options?: ParseOptions) => parseAST(src, options),
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
      if (source[i] === '\n') {
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
   * @returns 修复统计
   */
  applyFixes(issues: Issue[]): { fixedCount: number; filesModified: string[]; errors: string[] } {
    let fixedCount = 0;
    const filesModified: string[] = [];
    const errors: string[] = [];

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
        let source = readFileSync(filePath, 'utf-8');
        const originalSource = source;

        // 按行号倒序排列，从文件末尾开始修复，避免行号偏移
        const sorted = [...fileIssues].sort((a, b) => {
          const lineDiff = (b.fix!.start.line || 0) - (a.fix!.start.line || 0);
          if (lineDiff !== 0) return lineDiff;
          return (b.fix!.start.column || 0) - (a.fix!.start.column || 0);
        });

        for (const issue of sorted) {
          const fix = issue.fix!;
          source = this.applySingleFix(source, fix);
        }

        if (source !== originalSource) {
          writeFileSync(filePath, source, 'utf-8');
          filesModified.push(filePath);
          fixedCount += fileIssues.length;
        }
      } catch (err) {
        errors.push(`修复 ${filePath} 失败: ${err}`);
      }
    }

    return { fixedCount, filesModified, errors };
  }

  /** 对单文件应用单个修复 */
  private applySingleFix(source: string, fix: NonNullable<Issue['fix']>): string {
    const lines = source.split('\n');
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
      return lines.join('\n');
    }

    // 多行修复：替换从 start 到 end 的所有内容
    const startIdx = startLine - 1;
    const endIdx = endLine - 1;
    if (startIdx < 0 || endIdx >= lines.length) return source;

    const before = lines[startIdx].slice(0, Math.max(0, startCol - 1));
    const after = lines[endIdx].slice(Math.max(0, endCol - 1));
    const newLines = fix.text.split('\n');

    // 合并首尾
    newLines[0] = before + newLines[0];
    newLines[newLines.length - 1] = newLines[newLines.length - 1] + after;

    // 替换行范围
    lines.splice(startIdx, endIdx - startIdx + 1, ...newLines);
    return lines.join('\n');
  }
}

/** 创建默认引擎实例 */
export function createEngine(options: EngineOptions): RuleEngine {
  return new RuleEngine(options);
}
