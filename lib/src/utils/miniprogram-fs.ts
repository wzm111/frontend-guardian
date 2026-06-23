/**
 * v3.11.2: 小程序文件系统工具
 *
 * 供 miniprogram.ts 与 miniprogram-performance.ts 复用，避免循环依赖。
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export const PAGE_EXTENSIONS = [".vue", ".js", ".ts", ".wxml", ".axml", ".ttml", ".json"];

export const EXCLUDED_DIRS = new Set([
    "node_modules",
    ".git",
    ".frontend-guardian",
    "dist",
    "build",
    "unpackage",
    "coverage",
]);

/** 递归计算目录大小（排除常见非源码目录） */
export function getDirectorySize(dir: string): number {
    let total = 0;

    function walk(current: string) {
        const entries = readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(current, entry.name);
            if (entry.isDirectory()) {
                if (EXCLUDED_DIRS.has(entry.name)) continue;
                walk(fullPath);
            } else {
                try {
                    total += statSync(fullPath).size;
                } catch {
                    // ignore
                }
            }
        }
    }

    walk(dir);
    return total;
}

/** 计算单个子包目录大小 */
export function getSubPackageSize(projectDir: string, root: string): number {
    const subDir = resolve(projectDir, root);
    if (!existsSync(subDir)) return 0;
    return getDirectorySize(subDir);
}

/** 检查页面源码文件是否存在 */
export function findPageSourceFile(projectDir: string, pagePath: string): string | undefined {
    const base = resolve(projectDir, pagePath);
    for (const ext of PAGE_EXTENSIONS) {
        const candidate = base + ext;
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}
