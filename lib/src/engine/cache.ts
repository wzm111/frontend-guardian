/**
 * SmartCache — 智能增量扫描缓存引擎
 *
 * 设计目标：
 * 1. 基于文件内容 SHA-256 哈希，只扫描变更文件
 * 2. 缓存持久化到 .frontend-guardian/cache.json
 * 3. 自动过期策略（默认 7 天）
 * 4. 兼容 --staged / --diff 增量模式
 * 5. v3.2.0: AST 内存缓存 LRU 淘汰策略，防止大项目 OOM
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Issue } from "@/types.js";

export interface CacheEntry {
    /** 文件内容 SHA-256 */
    hash: string;
    /** 扫描结果 */
    issues: Issue[];
    /** 缓存时间戳 */
    timestamp: number;
    /** 规则版本（规则变更时缓存失效） */
    ruleVersion: string;
}

export interface CacheManifest {
    /** 引擎版本 */
    version: string;
    /** 项目目录 */
    projectDir: string;
    /** 文件到缓存条目的映射 */
    entries: Record<string, CacheEntry>;
    /** 上次全量扫描时间 */
    lastFullScan: number;
}

/** 缓存默认存活时间（7 天） */
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000;
/** 引擎版本，规则变更时递增使缓存失效 */
const ENGINE_VERSION = "3.2.0";
/** v3.2.0: AST 内存缓存默认最大条目数 */
const DEFAULT_AST_CACHE_SIZE = 200;

export class SmartCache {
    private manifest: CacheManifest;
    private cacheDir: string;
    private cacheFile: string;
    private ttl: number;
    /** v2.1.0: 内存级 AST 缓存（无需持久化，进程内复用） */
    private astCache = new Map<string, { hash: string; ast: unknown }>();
    /** v3.2.0: AST 缓存最大条目数 */
    private maxAstCacheSize: number;

    constructor(projectDir: string, ttl: number = DEFAULT_TTL, maxAstCacheSize?: number) {
        this.cacheDir = resolve(projectDir, ".frontend-guardian");
        this.cacheFile = resolve(this.cacheDir, "cache.json");
        this.ttl = ttl;
        this.maxAstCacheSize = maxAstCacheSize ?? DEFAULT_AST_CACHE_SIZE;
        this.manifest = this.loadManifest();
    }

    /** 计算文件内容哈希 */
    static computeHash(content: string): string {
        return createHash("sha256").update(content).digest("hex").slice(0, 16);
    }

    /** 检查文件是否已缓存且未过期 */
    isCached(filePath: string, content: string): boolean {
        const entry = this.manifest.entries[filePath];
        if (!entry) return false;

        // 内容变更
        const hash = SmartCache.computeHash(content);
        if (entry.hash !== hash) return false;

        // 规则版本变更
        if (entry.ruleVersion !== ENGINE_VERSION) return false;

        // 缓存过期
        const now = Date.now();
        if (now - entry.timestamp > this.ttl) return false;

        return true;
    }

    /** 从缓存获取文件扫描结果 */
    get(filePath: string): Issue[] | undefined {
        const entry = this.manifest.entries[filePath];
        return entry?.issues;
    }

    /** 缓存文件扫描结果 */
    set(filePath: string, content: string, issues: Issue[]): void {
        this.manifest.entries[filePath] = {
            hash: SmartCache.computeHash(content),
            issues,
            timestamp: Date.now(),
            ruleVersion: ENGINE_VERSION,
        };
    }

    /** 删除缓存条目 */
    invalidate(filePath: string): void {
        delete this.manifest.entries[filePath];
    }

    /** 批量使缓存失效（glob 模式） */
    invalidatePattern(pattern: string): void {
        const regex = new RegExp(pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"));
        for (const key of Object.keys(this.manifest.entries)) {
            if (regex.test(key)) {
                delete this.manifest.entries[key];
            }
        }
    }

    /** 保存缓存到磁盘 */
    save(): void {
        try {
            if (!existsSync(this.cacheDir)) {
                mkdirSync(this.cacheDir, { recursive: true });
            }
            writeFileSync(this.cacheFile, JSON.stringify(this.manifest, null, 2), "utf-8");
        } catch {
            // 缓存写入失败静默处理
        }
    }

    /** 获取缓存统计 */
    getStats(): { total: number; valid: number; expired: number } {
        const now = Date.now();
        let valid = 0;
        let expired = 0;

        for (const entry of Object.values(this.manifest.entries)) {
            if (now - entry.timestamp > this.ttl || entry.ruleVersion !== ENGINE_VERSION) {
                expired++;
            } else {
                valid++;
            }
        }

        return { total: Object.keys(this.manifest.entries).length, valid, expired };
    }

    // ── v2.1.0: AST 内存缓存 ──────────────────────────────────────────────

    /** 获取缓存的 AST（内存级，不持久化）— v3.2.0 增加 LRU 淘汰 */
    getAst(filePath: string, content: string): unknown | undefined {
        const cached = this.astCache.get(filePath);
        if (!cached) return undefined;

        const hash = SmartCache.computeHash(content);
        if (cached.hash !== hash) {
            this.astCache.delete(filePath);
            return undefined;
        }

        // v3.2.0: LRU — 访问后移到末尾（最新）
        this.astCache.delete(filePath);
        this.astCache.set(filePath, cached);

        return cached.ast;
    }

    /** 缓存 AST 解析结果 — v3.2.0 增加 LRU 淘汰 */
    setAst(filePath: string, content: string, ast: unknown): void {
        // v3.2.0: 超出上限时淘汰最久未访问的条目（Map 头部）
        if (this.astCache.size >= this.maxAstCacheSize && !this.astCache.has(filePath)) {
            const firstKey = this.astCache.keys().next().value as string | undefined;
            if (firstKey) {
                this.astCache.delete(firstKey);
            }
        }

        // 删除旧条目（如果存在），然后重新插入到末尾（最新）
        this.astCache.delete(filePath);
        this.astCache.set(filePath, {
            hash: SmartCache.computeHash(content),
            ast,
        });
    }

    /** v3.2.0: 获取 AST 缓存当前大小 */
    getAstCacheSize(): number {
        return this.astCache.size;
    }

    /** v3.2.0: 获取 AST 缓存上限 */
    getAstCacheLimit(): number {
        return this.maxAstCacheSize;
    }

    /** 清理过期缓存 */
    gc(): number {
        const now = Date.now();
        let removed = 0;

        for (const [key, entry] of Object.entries(this.manifest.entries)) {
            if (now - entry.timestamp > this.ttl || entry.ruleVersion !== ENGINE_VERSION) {
                delete this.manifest.entries[key];
                removed++;
            }
        }

        return removed;
    }

    /** 加载缓存 manifest */
    private loadManifest(): CacheManifest {
        try {
            if (existsSync(this.cacheFile)) {
                const raw = readFileSync(this.cacheFile, "utf-8");
                const manifest = JSON.parse(raw) as CacheManifest;
                if (manifest.version === ENGINE_VERSION && manifest.projectDir === this.cacheDir) {
                    return manifest;
                }
            }
        } catch {
            // 缓存读取失败，返回空 manifest
        }

        return {
            version: ENGINE_VERSION,
            projectDir: this.cacheDir,
            entries: {},
            lastFullScan: 0,
        };
    }
}
