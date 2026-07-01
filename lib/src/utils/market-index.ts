/**
 * v3.17.0: 规则市场索引加载器
 *
 * 默认读取包内 market/index.json，支持通过 URL 远程覆盖。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MarketIndex, MarketPackage } from "@/types.js";
import pc from "picocolors";

const DEFAULT_INDEX_VERSION = "1.0.0";

function getDefaultIndexPath(): string {
    return resolve(__dirname, "..", "..", "market", "index.json");
}

function validateIndex(data: unknown): MarketIndex {
    if (!data || typeof data !== "object") {
        throw new Error("市场索引格式不正确");
    }
    const index = data as MarketIndex;
    if (typeof index.version !== "string") {
        index.version = DEFAULT_INDEX_VERSION;
    }
    if (!Array.isArray(index.packages)) {
        index.packages = [];
    }
    return index;
}

/** 同步加载默认市场索引（用于 config-loader 等同步路径） */
export function loadDefaultMarketIndexSync(): MarketIndex {
    const defaultPath = getDefaultIndexPath();
    try {
        if (existsSync(defaultPath)) {
            const raw = readFileSync(defaultPath, "utf-8");
            return validateIndex(JSON.parse(raw));
        }
    } catch (err) {
        console.warn(pc.yellow(`⚠️  默认市场索引加载失败: ${(err as Error).message}`));
    }
    return { version: DEFAULT_INDEX_VERSION, updatedAt: new Date().toISOString(), packages: [] };
}

export interface LoadMarketIndexOptions {
    /** 远程索引 URL，优先级最高 */
    url?: string;
    /** 项目目录，用于保存远程索引缓存 */
    projectDir?: string;
    /** 是否强制离线（不使用远程 URL） */
    offline?: boolean;
}

/** 异步加载市场索引（支持远程覆盖） */
export async function loadMarketIndex(options: LoadMarketIndexOptions = {}): Promise<MarketIndex> {
    const { url, projectDir, offline } = options;

    if (url && !offline) {
        try {
            const remote = await fetchRemoteIndex(url, projectDir);
            if (remote) return remote;
        } catch (err) {
            console.warn(pc.yellow(`⚠️  远程市场索引加载失败: ${(err as Error).message}`));
        }
    }

    // 尝试本地缓存的远程索引
    if (projectDir && url && !offline) {
        const cached = getCachedIndexPath(projectDir);
        try {
            if (existsSync(cached)) {
                const raw = readFileSync(cached, "utf-8");
                return validateIndex(JSON.parse(raw));
            }
        } catch {
            // 忽略缓存读取错误
        }
    }

    return loadDefaultMarketIndexSync();
}

async function fetchRemoteIndex(url: string, projectDir?: string): Promise<MarketIndex | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const index = validateIndex(data);

        if (projectDir) {
            cacheRemoteIndex(projectDir, index);
        }

        return index;
    } catch (err) {
        clearTimeout(timeout);
        throw err;
    }
}

function getCachedIndexPath(projectDir: string): string {
    return resolve(projectDir, ".frontend-guardian", "market-index.json");
}

function cacheRemoteIndex(projectDir: string, index: MarketIndex): void {
    try {
        const dir = resolve(projectDir, ".frontend-guardian");
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        writeFileSync(getCachedIndexPath(projectDir), JSON.stringify(index, null, 2), "utf-8");
    } catch {
        // 缓存失败不影响主流程
    }
}

/** 在市场索引中按别名查找包 */
export function resolveMarketPackage(name: string, index: MarketIndex): MarketPackage | undefined {
    return index.packages.find((pkg) => pkg.name === name);
}

/** 列出市场索引中所有包 */
export function listMarketPackages(index: MarketIndex): MarketPackage[] {
    return [...index.packages];
}

/** 格式化市场索引为终端表格 */
export function formatMarketIndex(index: MarketIndex): string {
    const lines: string[] = [];
    lines.push(pc.cyan("📦 规则市场索引"));
    lines.push(pc.gray(`   版本: ${index.version} | 更新: ${index.updatedAt} | 包数: ${index.packages.length}`));
    lines.push("");

    if (index.packages.length === 0) {
        lines.push(pc.gray("   暂无可用规则包"));
        return lines.join("\n");
    }

    for (const pkg of index.packages) {
        lines.push(pc.white(`   • ${pkg.name}`));
        lines.push(pc.gray(`     npm: ${pkg.npmName}`));
        lines.push(pc.gray(`     ${pkg.description}`));
        if (pkg.categories && pkg.categories.length > 0) {
            lines.push(pc.gray(`     分类: ${pkg.categories.join(", ")}`));
        }
        if (pkg.tags && pkg.tags.length > 0) {
            lines.push(pc.gray(`     标签: ${pkg.tags.join(", ")}`));
        }
        lines.push("");
    }

    return lines.join("\n");
}

/** 格式化市场索引为 JSON */
export function formatMarketIndexJson(index: MarketIndex): string {
    return JSON.stringify(index, null, 2);
}
