/**
 * FileWatcher — 文件系统监听与索引自动同步（v3.7.0）
 *
 * 基于 Node.js fs.watch（跨平台），监听项目源文件变更，
 * 自动调用 ProjectIndexer.updateIndex() 增量更新索引。
 *
 * 使用 debounce 策略避免频繁触发（默认 500ms）。
 */

import { watch, type FSWatcher } from "node:fs";
import { resolve, extname } from "node:path";
import { existsSync } from "node:fs";
import { ProjectIndexer } from "@/engine/indexer.js";

export interface WatchOptions {
    /** 项目根目录 */
    projectDir: string;
    /** 要监听的扩展名列表（默认 JS/TS/Vue） */
    extensions?: string[];
    /** 排除的目录 */
    excludeDirs?: string[];
    /** 防抖延迟（毫秒，默认 500） */
    debounceMs?: number;
    /** 变更回调 */
    onChange?: (changedFiles: string[], deletedFiles: string[]) => void;
    /** 索引更新完成回调 */
    onIndexUpdate?: (stats: { files: number; routes: number; symbols: number }) => void;
    /** 错误回调 */
    onError?: (err: Error) => void;
}

/** 支持的扩展名 */
const DEFAULT_EXTENSIONS = [".js", ".ts", ".jsx", ".tsx", ".vue"];

/** 默认排除的目录 */
const DEFAULT_EXCLUDE_DIRS = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".frontend-guardian",
];

export class FileWatcher {
    private projectDir: string;
    private extensions: Set<string>;
    private excludeDirs: Set<string>;
    private debounceMs: number;
    private indexer: ProjectIndexer;
    private watchers = new Map<string, FSWatcher>();
    private pendingChanges = new Set<string>();
    private pendingDeletes = new Set<string>();
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private onChange?: WatchOptions["onChange"];
    private onIndexUpdate?: WatchOptions["onIndexUpdate"];
    private onError?: WatchOptions["onError"];
    private isRunning = false;

    constructor(options: WatchOptions) {
        this.projectDir = resolve(options.projectDir);
        this.extensions = new Set(options.extensions || DEFAULT_EXTENSIONS);
        this.excludeDirs = new Set([
            ...DEFAULT_EXCLUDE_DIRS,
            ...(options.excludeDirs || []),
        ]);
        this.debounceMs = options.debounceMs || 500;
        this.indexer = new ProjectIndexer(this.projectDir);
        this.onChange = options.onChange;
        this.onIndexUpdate = options.onIndexUpdate;
        this.onError = options.onError;
    }

    /** 启动文件监听 */
    async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        // 首次启动时建立索引（如果索引不存在或已过期）
        if (!this.indexer.isValid()) {
            const files = this.getAllSourceFiles();
            await this.indexer.buildIndex(files);
            const stats = this.indexer.getStats();
            this.onIndexUpdate?.(stats);
        }

        // 监听项目根目录下的所有源文件
        this.watchDirectory(this.projectDir);
    }

    /** 停止文件监听 */
    stop(): void {
        this.isRunning = false;

        // 清除防抖定时器
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        // 关闭所有 watcher
        for (const [, watcher] of this.watchers) {
            try {
                watcher.close();
            } catch {
                // 忽略关闭错误
            }
        }
        this.watchers.clear();
    }

    /** 获取索引器实例（用于外部查询） */
    getIndexer(): ProjectIndexer {
        return this.indexer;
    }

    /** 是否正在运行 */
    isActive(): boolean {
        return this.isRunning;
    }

    // ── 私有方法 ──────────────────────────────────────────────────────────

    /** 递归监听目录 */
    private watchDirectory(dir: string): void {
        if (this.shouldExclude(dir)) return;

        try {
            const watcher = watch(dir, { recursive: true, persistent: true }, (eventType, filename) => {
                if (!filename) return;

                const fullPath = resolve(dir, filename);

                // 排除检查
                if (this.shouldExclude(fullPath)) return;

                // 扩展名检查
                const ext = extname(filename);
                if (!this.extensions.has(ext)) return;

                if (eventType === "rename") {
                    // rename 事件可能是创建或删除
                    if (existsSync(fullPath)) {
                        this.pendingChanges.add(fullPath);
                    } else {
                        this.pendingDeletes.add(fullPath);
                    }
                } else {
                    // change 事件
                    this.pendingChanges.add(fullPath);
                }

                this.scheduleUpdate();
            });

            this.watchers.set(dir, watcher);
        } catch (err) {
            this.onError?.(err as Error);
        }
    }

    /** 检查路径是否应该被排除 */
    private shouldExclude(filePath: string): boolean {
        const normalized = filePath.replace(/\\/g, "/");
        for (const dir of this.excludeDirs) {
            if (normalized.includes(`/${dir}/`) || normalized.endsWith(`/${dir}`)) {
                return true;
            }
        }
        return false;
    }

    /** 调度索引更新（防抖） */
    private scheduleUpdate(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.processPendingChanges();
        }, this.debounceMs);
    }

    /** 处理待更新的变更 */
    private async processPendingChanges(): Promise<void> {
        const changed = Array.from(this.pendingChanges);
        const deleted = Array.from(this.pendingDeletes);

        this.pendingChanges.clear();
        this.pendingDeletes.clear();

        if (changed.length === 0 && deleted.length === 0) return;

        try {
            // 过滤掉已删除的文件（可能 rename 后又被 change）
            const validChanged = changed.filter((f) => existsSync(f));
            const validDeleted = deleted.filter((f) => !existsSync(f));

            await this.indexer.updateIndex(validChanged, validDeleted);
            const stats = this.indexer.getStats();

            this.onChange?.(validChanged, validDeleted);
            this.onIndexUpdate?.(stats);
        } catch (err) {
            this.onError?.(err as Error);
        }
    }

    /** 获取项目内所有源文件 */
    private getAllSourceFiles(): string[] {
        const files: string[] = [];
        this.collectFiles(this.projectDir, files);
        return files;
    }

    /** 递归收集源文件 */
    private collectFiles(dir: string, result: string[]): void {
        if (this.shouldExclude(dir)) return;

        try {
            const entries = require("node:fs").readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = resolve(dir, entry.name);
                if (entry.isDirectory()) {
                    this.collectFiles(fullPath, result);
                } else if (entry.isFile()) {
                    const ext = extname(entry.name);
                    if (this.extensions.has(ext)) {
                        result.push(fullPath);
                    }
                }
            }
        } catch {
            // 忽略读取错误
        }
    }
}

/** 创建并启动文件监听的便捷函数 */
export async function watchProject(options: WatchOptions): Promise<FileWatcher> {
    const watcher = new FileWatcher(options);
    await watcher.start();
    return watcher;
}
