#!/usr/bin/env node
/**
 * Watch Mode — 文件变更自动增量扫描
 *
 * Usage: fg-core <project-dir> --watch [--module <name>]
 */

import { watch } from "node:fs";
import { statSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import pc from "picocolors";

/**
 * 启动 watch 模式
 * @param {Object} options - CLI 选项
 * @param {Function} scanFn - 扫描函数 (options, cacheInstance) => Promise<void>
 * @param {Object} cacheInstance - SmartCache 实例（可选，用于复用缓存）
 */
export async function runWatchMode(options, scanFn, cacheInstance) {
    const projectDir = options.projectDir;
    const includeExts = new Set([".js", ".ts", ".jsx", ".tsx", ".vue", ".svelte", ".css", ".scss", ".less"]);

    console.log(pc.cyan("👀 Watch 模式已启动"));
    console.log(pc.gray(`   项目: ${projectDir}`));
    console.log(pc.gray(`   模块: ${options.module}`));
    if (cacheInstance && options.cache !== false) {
        console.log(pc.gray("   缓存: 已启用（Watch 模式复用）"));
    }
    console.log(pc.gray("   按 Ctrl+C 退出\n"));

    // 防抖：200ms 内多次变更只扫描一次
    let debounceTimer = null;
    const changedFiles = new Set();

    // 首次扫描（复用 cacheInstance）
    await scanFn({ ...options, watch: false }, cacheInstance);
    console.log(pc.gray("\n⏳ 等待文件变更...\n"));

    function handleChange(filePath) {
        const ext = filePath.slice(filePath.lastIndexOf("."));
        if (!includeExts.has(ext)) return;
        if (filePath.includes("node_modules")) return;
        if (filePath.includes(".git")) return;

        changedFiles.add(filePath);

        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(async () => {
            const files = Array.from(changedFiles);
            changedFiles.clear();

            console.clear();
            console.log(pc.cyan(`📝 检测到 ${files.length} 个文件变更`));
            for (const f of files) {
                console.log(pc.gray(`   - ${relative(projectDir, f)}`));
            }
            console.log("");

            const watchOptions = {
                ...options,
                files,
                watch: false,
            };

            try {
                await scanFn(watchOptions, cacheInstance);
            } catch (err) {
                console.error(pc.red("扫描失败:"), err.message || err);
            }

            console.log(pc.gray("\n⏳ 等待文件变更...\n"));
        }, 300);
    }

    // 递归监听 src 目录和配置文件
    const watchDirs = [resolve(projectDir, "src")];
    if (!existsSync(watchDirs[0])) {
        watchDirs[0] = projectDir;
    }

    // v2.7.0: 监听配置文件变更，实现热重载
    const configFiles = [
        resolve(projectDir, ".frontend-guardian.yml"),
        resolve(projectDir, ".frontend-guardian.yaml"),
        resolve(projectDir, ".frontend-guardian.json"),
    ].filter((f) => existsSync(f));

    const watchers = [];

    function addWatcher(dir) {
        try {
            const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
                if (!filename) return;
                const fullPath = resolve(dir, filename);
                if (!existsSync(fullPath)) return;
                try {
                    const stat = statSync(fullPath);
                    if (stat.isDirectory()) return;
                } catch {
                    return;
                }
                handleChange(fullPath);
            });
            watchers.push(watcher);
        } catch {
            // 某些环境不支持递归 watch
        }
    }

    for (const dir of watchDirs) {
        if (existsSync(dir)) {
            addWatcher(dir);
        }
    }

    // v2.7.0: 监听配置文件变更
    for (const configPath of configFiles) {
        try {
            const configWatcher = watch(configPath, (eventType) => {
                console.log(pc.yellow(`\n⚡ 配置文件变更 detected: ${relative(projectDir, configPath)}`));
                console.log(pc.gray("   正在重新加载配置并扫描...\n"));
                // 清除缓存确保重新读取配置
                if (cacheInstance) {
                    cacheInstance.invalidatePattern(".*");
                }
                // 触发全量重新扫描
                changedFiles.clear();
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(async () => {
                    console.clear();
                    try {
                        await scanFn({ ...options, watch: false }, cacheInstance);
                    } catch (err) {
                        console.error(pc.red("扫描失败:"), err.message || err);
                    }
                    console.log(pc.gray("\n⏳ 等待文件变更...\n"));
                }, 300);
            });
            watchers.push(configWatcher);
        } catch {
            // 某些环境不支持文件级 watch
        }
    }

    // 保持进程运行
    process.on("SIGINT", () => {
        console.log(pc.gray("\n👋 Watch 模式已停止"));
        for (const w of watchers) {
            w.close();
        }
        process.exit(0);
    });

    // 永不 resolve，保持运行
    return new Promise(() => {});
}
