/**
 * SmartCache 智能缓存引擎测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SmartCache } from "../src/engine/cache.js";
import type { Issue } from "../src/types.js";

const TEST_DIR = resolve(process.cwd(), "test-cache-project");

function cleanup() {
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }
}

function makeIssue(ruleId: string, line: number): Issue {
    return {
        ruleId,
        title: "Test",
        description: "Test issue",
        severity: "warning",
        file: "test.ts",
        line,
        column: 1,
    };
}

describe("SmartCache", () => {
    beforeEach(() => {
        cleanup();
        mkdirSync(TEST_DIR, { recursive: true });
    });

    afterEach(() => {
        cleanup();
    });

    it("should compute consistent hash", () => {
        const h1 = SmartCache.computeHash("hello world");
        const h2 = SmartCache.computeHash("hello world");
        const h3 = SmartCache.computeHash("different");

        expect(h1).toBe(h2);
        expect(h1).not.toBe(h3);
        expect(h1).toHaveLength(16);
    });

    it("should cache and retrieve issues", () => {
        const cache = new SmartCache(TEST_DIR);
        const file = resolve(TEST_DIR, "src", "test.ts");
        const content = "const x = 1;";
        const issues = [makeIssue("rule-1", 1), makeIssue("rule-2", 2)];

        expect(cache.isCached(file, content)).toBe(false);
        expect(cache.get(file)).toBeUndefined();

        cache.set(file, content, issues);

        expect(cache.isCached(file, content)).toBe(true);
        expect(cache.get(file)).toEqual(issues);
    });

    it("should invalidate cache when content changes", () => {
        const cache = new SmartCache(TEST_DIR);
        const file = resolve(TEST_DIR, "src", "test.ts");

        cache.set(file, "original", [makeIssue("rule-1", 1)]);
        expect(cache.isCached(file, "original")).toBe(true);
        expect(cache.isCached(file, "modified")).toBe(false);
    });

    it("should invalidate cache by pattern", () => {
        const cache = new SmartCache(TEST_DIR);
        const file1 = resolve(TEST_DIR, "src", "a.ts");
        const file2 = resolve(TEST_DIR, "src", "b.ts");
        const file3 = resolve(TEST_DIR, "lib", "c.ts");

        cache.set(file1, "a", [makeIssue("r1", 1)]);
        cache.set(file2, "b", [makeIssue("r2", 1)]);
        cache.set(file3, "c", [makeIssue("r3", 1)]);

        cache.invalidatePattern("**/src/**");

        expect(cache.isCached(file1, "a")).toBe(false);
        expect(cache.isCached(file2, "b")).toBe(false);
        expect(cache.isCached(file3, "c")).toBe(true);
    });

    it("should persist and reload cache", () => {
        const file = resolve(TEST_DIR, "src", "test.ts");
        const content = "const x = 1;";
        const issues = [makeIssue("rule-1", 1)];

        // 第一次实例：写入缓存
        const cache1 = new SmartCache(TEST_DIR);
        cache1.set(file, content, issues);
        cache1.save();

        // 第二次实例：读取缓存
        const cache2 = new SmartCache(TEST_DIR);
        expect(cache2.isCached(file, content)).toBe(true);
        expect(cache2.get(file)).toEqual(issues);
    });

    it("should report stats correctly", () => {
        const cache = new SmartCache(TEST_DIR);
        const file = resolve(TEST_DIR, "src", "test.ts");

        cache.set(file, "content", [makeIssue("r1", 1)]);

        const stats = cache.getStats();
        expect(stats.total).toBe(1);
        expect(stats.valid).toBe(1);
        expect(stats.expired).toBe(0);
    });

    it("should garbage collect expired entries", () => {
        const cache = new SmartCache(TEST_DIR, -1); // TTL = -1，立即过期
        const file = resolve(TEST_DIR, "src", "test.ts");

        cache.set(file, "content", [makeIssue("r1", 1)]);
        expect(cache.getStats().total).toBe(1);

        const removed = cache.gc();
        expect(removed).toBe(1);
        expect(cache.getStats().total).toBe(0);
    });
});
