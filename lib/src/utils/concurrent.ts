/**
 * Concurrent execution utilities — 并发控制工具
 *
 * v2.1.0: 提供受控并发的 Promise.all 替代方案，避免大项目 OOM。
 * v3.2.0: 增加自适应并发算法，根据项目规模和 CPU 动态调整。
 */

import { availableParallelism } from "node:os";

/** 获取合理的默认并发数（CPU 核心数） */
export function getDefaultConcurrency(): number {
    try {
        return availableParallelism();
    } catch {
        return 4;
    }
}

/**
 * v3.2.0: 自适应并发数
 *
 * 根据文件数、规则数和 CPU 核心数动态调整并发度：
 * - 小项目（< 50 文件）：降低并发，避免调度开销 > 并行收益
 * - 中项目（50-500 文件）：按 CPU 核心数标准并行
 * - 大项目（> 500 文件）：允许超线程，提升吞吐量
 * - 超大项目（> 2000 文件）：进一步放宽上限
 *
 * 规则数越多，单文件处理时间越长，越需要高并发隐藏延迟。
 *
 * @param totalFiles  扫描文件总数
 * @param totalRules  活跃规则总数
 * @param cpuCores    CPU 核心数（默认自动检测）
 * @returns 推荐并发数
 */
export function getAdaptiveConcurrency(
    totalFiles: number,
    totalRules: number,
    cpuCores?: number
): number {
    const cpu = cpuCores ?? getDefaultConcurrency();

    // 文件规模因子
    let fileFactor: number;
    if (totalFiles <= 20) {
        fileFactor = 0.5; // 极小项目：半并发，避免过度调度
    } else if (totalFiles <= 50) {
        fileFactor = 0.75; // 小项目
    } else if (totalFiles <= 200) {
        fileFactor = 1.0; // 中项目
    } else if (totalFiles <= 500) {
        fileFactor = 1.25; // 较大项目
    } else if (totalFiles <= 2000) {
        fileFactor = 1.5; // 大项目
    } else {
        fileFactor = 2.0; // 超大项目
    }

    // 规则数因子：规则越多，单文件处理越慢，需要更多并发
    let ruleFactor: number;
    if (totalRules <= 5) {
        ruleFactor = 0.75;
    } else if (totalRules <= 15) {
        ruleFactor = 1.0;
    } else if (totalRules <= 30) {
        ruleFactor = 1.25;
    } else {
        ruleFactor = 1.5;
    }

    // 计算推荐并发数，确保至少 1，不超过安全上限
    const recommended = Math.max(1, Math.round(cpu * fileFactor * ruleFactor));
    const hardCap = Math.max(32, cpu * 4); // 硬上限，防止极端情况 OOM

    return Math.min(recommended, hardCap);
}

/**
 * 受控并发的 map 操作
 * @param items   待处理数组
 * @param concurrency 最大并发数
 * @param fn      处理函数
 * @returns       按原顺序的结果数组
 */
export async function concurrentMap<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    if (items.length === 0) return [];

    const results: R[] = new Array(items.length);
    let index = 0;
    let error: unknown = null;

    async function worker(): Promise<void> {
        while (index < items.length && !error) {
            const currentIndex = index++;
            try {
                results[currentIndex] = await fn(items[currentIndex], currentIndex);
            } catch (err) {
                error = err;
                throw err;
            }
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);

    return results;
}
