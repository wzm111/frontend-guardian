/**
 * Concurrent execution utilities — 并发控制工具
 *
 * v2.1.0: 提供受控并发的 Promise.all 替代方案，避免大项目 OOM。
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
