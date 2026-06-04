/**
 * Baseline 管理器
 *
 * 支持已有问题不阻塞，仅关注新增问题的渐进式治理模式。
 * 适用于遗留项目首次接入 frontend-guardian。
 *
 * 使用方式：
 * 1. 首次运行：fg-core --baseline .fg-baseline.json --module all
 *    → 扫描全部问题并保存为 baseline 文件
 * 2. 后续运行：fg-core --baseline .fg-baseline.json --module all
 *    → 仅报告新增问题（与 baseline 对比）
 * 3. 定期刷新：删除 baseline 重新生成（清理已修复的遗留问题）
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { createHash } from "node:crypto";
import pc from "picocolors";
import type { Issue } from "@/types.js";

/** Baseline 文件格式 */
export interface BaselineFile {
    /** 格式版本 */
    version: string;
    /** 生成时间戳 */
    generatedAt: number;
    /** 已知问题列表 */
    issues: BaselineIssue[];
    /** 元数据 */
    meta?: {
        projectDir?: string;
        toolVersion?: string;
    };
}

/** Baseline 中的单条问题（精简字段，用于匹配） */
export interface BaselineIssue {
    file: string;
    ruleId: string;
    line: number;
    column: number;
    severity: Issue["severity"];
    title: string;
}

/** Baseline 对比结果 */
export interface BaselineResult {
    /** 新问题（不在 baseline 中） */
    newIssues: Issue[];
    /** 已知问题（在 baseline 中，本次仍出现） */
    knownIssues: Issue[];
    /** 已修复问题（在 baseline 中，本次未出现） */
    fixedIssues: BaselineIssue[];
    /** 总问题数 */
    totalIssues: number;
    /** 是否使用了 baseline */
    baselineLoaded: boolean;
}

/** 问题匹配键 */
function issueKey(issue: { file: string; ruleId: string; line: number; column?: number }): string {
    // 列号可选，允许小范围偏移（±5列）视为同一问题
    const col = issue.column != null ? Math.round(issue.column / 5) * 5 : 0;
    return `${issue.file}|${issue.ruleId}|${issue.line}|${col}`;
}

/** 判断路径是否为远程 URL */
function isRemoteUrl(path: string): boolean {
    return path.startsWith("http://") || path.startsWith("https://");
}

/** 获取远程 baseline 的本地缓存路径 */
function getCachedBaselinePath(url: string, cacheDir: string): string {
    const hash = createHash("sha256").update(url).digest("hex").slice(0, 16);
    const name = basename(url) || "baseline";
    return resolve(cacheDir, `${name}.${hash}.json`);
}

/** 下载远程 baseline */
export async function downloadBaseline(
    url: string,
    cacheDir?: string
): Promise<{ data: BaselineFile; cached: boolean; error?: string }> {
    const dir = cacheDir || resolve(process.cwd(), ".fg-cache");
    const cachePath = getCachedBaselinePath(url, dir);

    // 检查本地缓存（1 小时 TTL）
    if (existsSync(cachePath)) {
        const stat = readFileSync(cachePath, "utf-8");
        try {
            const cached = JSON.parse(stat) as { _downloadedAt: number; data: BaselineFile };
            const age = Date.now() - (cached._downloadedAt || 0);
            if (age < 3600_000) {
                return { data: cached.data, cached: true };
            }
        } catch {
            // 缓存格式错误，继续下载
        }
    }

    try {
        const response = await fetch(url, { redirect: "follow" });
        if (!response.ok) {
            return {
                data: { version: "1.0", generatedAt: Date.now(), issues: [] },
                cached: false,
                error: `HTTP ${response.status}: ${response.statusText}`,
            };
        }
        const data = (await response.json()) as BaselineFile;
        if (!data.version || !Array.isArray(data.issues)) {
            return {
                data: { version: "1.0", generatedAt: Date.now(), issues: [] },
                cached: false,
                error: "Invalid baseline format",
            };
        }

        // 写入缓存
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        writeFileSync(
            cachePath,
            JSON.stringify({ _downloadedAt: Date.now(), data }, null, 2),
            "utf-8"
        );

        return { data, cached: false };
    } catch (err) {
        return {
            data: { version: "1.0", generatedAt: Date.now(), issues: [] },
            cached: false,
            error: String(err),
        };
    }
}

/** 将 Issue 精简为 BaselineIssue */
export function toBaselineIssue(issue: Issue): BaselineIssue {
    return {
        file: issue.file,
        ruleId: issue.ruleId,
        line: issue.line,
        column: issue.column,
        severity: issue.severity,
        title: issue.title,
    };
}

/** 加载本地 baseline 文件（同步） */
export function loadBaseline(filePath: string): BaselineFile | null {
    try {
        if (!existsSync(filePath)) {
            return null;
        }
        const raw = readFileSync(filePath, "utf-8");
        const data = JSON.parse(raw) as BaselineFile;
        if (!data.version || !Array.isArray(data.issues)) {
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

/**
 * 加载 baseline（支持本地路径或远程 URL）
 * @param filePath 本地文件路径或远程 URL
 * @param cacheDir 远程 baseline 缓存目录（可选，默认 .fg-cache）
 */
export async function loadBaselineAsync(
    filePath: string,
    cacheDir?: string
): Promise<BaselineFile | null> {
    if (isRemoteUrl(filePath)) {
        const result = await downloadBaseline(filePath, cacheDir);
        if (result.error) {
            console.warn(`⚠️  远程 baseline 加载失败: ${result.error}`);
        }
        return result.data;
    }
    return loadBaseline(filePath);
}

/** 保存 baseline 文件 */
export function saveBaseline(
    filePath: string,
    issues: Issue[] | BaselineIssue[],
    meta?: BaselineFile["meta"]
): void {
    const baseline: BaselineFile = {
        version: "1.0",
        generatedAt: Date.now(),
        issues: issues.map((i) =>
            "description" in i ? toBaselineIssue(i as Issue) : (i as BaselineIssue)
        ),
        meta: {
            toolVersion: "2.3.0",
            ...meta,
        },
    };
    writeFileSync(filePath, JSON.stringify(baseline, null, 2), "utf-8");
}

/**
 * 将当前扫描结果与 baseline 对比
 * @param issues 当前扫描出的所有问题
 * @param baselinePath baseline 文件路径（绝对或相对）
 * @param projectDir 项目根目录（用于解析相对路径）
 * @returns BaselineResult 对比结果
 */
export function compareWithBaseline(
    issues: Issue[],
    baselinePath: string,
    projectDir: string
): BaselineResult {
    const resolvedPath = resolve(projectDir, baselinePath);
    const baseline = loadBaseline(resolvedPath);

    if (!baseline) {
        // baseline 文件不存在，返回全部问题作为 newIssues
        return {
            newIssues: issues,
            knownIssues: [],
            fixedIssues: [],
            totalIssues: issues.length,
            baselineLoaded: false,
        };
    }

    const baselineKeys = new Set(baseline.issues.map((i) => issueKey(i)));
    const currentKeys = new Set(issues.map((i) => issueKey(i)));

    const newIssues: Issue[] = [];
    const knownIssues: Issue[] = [];

    for (const issue of issues) {
        if (baselineKeys.has(issueKey(issue))) {
            knownIssues.push(issue);
        } else {
            newIssues.push(issue);
        }
    }

    const fixedIssues = baseline.issues.filter((i) => !currentKeys.has(issueKey(i)));

    return {
        newIssues,
        knownIssues,
        fixedIssues,
        totalIssues: issues.length,
        baselineLoaded: true,
    };
}

/**
 * 生成或更新 baseline 文件
 * 如果文件已存在则覆盖
 */
export function generateBaseline(
    issues: Issue[],
    baselinePath: string,
    projectDir: string,
    meta?: BaselineFile["meta"]
): void {
    const resolvedPath = resolve(projectDir, baselinePath);
    saveBaseline(resolvedPath, issues, meta);
}

/**
 * BaselineManager — 面向对象的封装
 *
 * 支持本地 baseline 文件或远程团队共享 baseline URL。
 * 远程 baseline 会自动下载并缓存到本地（1 小时 TTL）。
 */
export class BaselineManager {
    private baselinePath: string;
    private projectDir: string;
    private baseline: BaselineFile | null = null;
    private teamBaselineUrl?: string;
    private cacheDir: string;

    constructor(
        baselinePath: string,
        projectDir: string,
        options?: { teamBaselineUrl?: string; cacheDir?: string }
    ) {
        this.teamBaselineUrl = options?.teamBaselineUrl;
        this.cacheDir = options?.cacheDir || resolve(projectDir, ".fg-cache");
        this.projectDir = projectDir;

        if (this.teamBaselineUrl) {
            // 远程 baseline：缓存路径作为本地存储
            this.baselinePath = getCachedBaselinePath(this.teamBaselineUrl, this.cacheDir);
        } else {
            this.baselinePath = resolve(projectDir, baselinePath);
        }

        this.baseline = loadBaseline(this.baselinePath);
    }

    /**
     * 异步初始化（用于加载远程 baseline）
     * 若配置了 teamBaselineUrl，会下载并缓存远程 baseline。
     * 下载失败时回退到本地 baseline（如果存在）。
     */
    async init(): Promise<void> {
        if (!this.teamBaselineUrl) {
            return;
        }
        const result = await downloadBaseline(this.teamBaselineUrl, this.cacheDir);
        if (result.error) {
            console.warn(
                pc.yellow(`⚠️  团队 baseline 下载失败: ${result.error}，回退到本地 baseline`)
            );
            // 回退：尝试加载已缓存的本地 baseline（即使过期）
            this.baseline = loadBaseline(this.baselinePath);
            return;
        }
        // 将下载的 baseline 写入缓存路径
        saveBaseline(this.baselinePath, result.data.issues, result.data.meta);
        this.baseline = result.data;
        const source = result.cached ? "缓存" : "远程";
        console.log(pc.blue(`📥 团队 baseline 已加载（${source}）：${this.teamBaselineUrl}`));
    }

    /** 是否已加载有效的 baseline */
    isLoaded(): boolean {
        return this.baseline !== null;
    }

    /** 获取已加载的 baseline 内容 */
    getBaseline(): BaselineFile | null {
        return this.baseline;
    }

    /** 对比当前 issues，返回仅含新增问题的过滤结果 */
    filterNewIssues(issues: Issue[]): BaselineResult {
        return compareWithBaseline(issues, this.baselinePath, this.projectDir);
    }

    /** 将当前 issues 保存为 baseline（覆盖） */
    save(issues: Issue[], meta?: BaselineFile["meta"]): void {
        saveBaseline(this.baselinePath, issues, meta);
        this.baseline = loadBaseline(this.baselinePath);
    }

    /** 获取 baseline 文件路径 */
    getPath(): string {
        return this.baselinePath;
    }

    /** 获取团队 baseline URL（如配置） */
    getTeamBaselineUrl(): string | undefined {
        return this.teamBaselineUrl;
    }
}
