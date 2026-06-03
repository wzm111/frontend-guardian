/**
 * v3.2.0 — 性能与体验优化测试
 *
 * 覆盖：
 * 1. 并行度自适应 (getAdaptiveConcurrency)
 * 2. AST 缓存 LRU 淘汰策略 (SmartCache LRU)
 * 3. 增量扫描 import 图分析 (RuleEngine expandIncrementalFiles / buildImportGraph)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { SmartCache } from "../src/engine/cache.js";
import { getAdaptiveConcurrency } from "../src/utils/concurrent.js";
import { RuleEngine } from "../src/engine/rule-engine.js";
import { writeBasePackageJson, writeProjectFile } from "./helpers.js";

// ── getAdaptiveConcurrency ──────────────────────────────────────────────────

describe("getAdaptiveConcurrency", () => {
    it("should return lower concurrency for tiny projects", () => {
        const cpu = 8;
        // 10 文件，3 条规则 → 小项目
        const c = getAdaptiveConcurrency(10, 3, cpu);
        expect(c).toBeLessThanOrEqual(cpu);
        expect(c).toBeGreaterThanOrEqual(1);
    });

    it("should scale up for large projects", () => {
        const cpu = 8;
        // 2000 文件，40 条规则 → 超大项目
        const c = getAdaptiveConcurrency(2000, 40, cpu);
        expect(c).toBeGreaterThan(cpu); // 应该超线程
    });

    it("should respect hard cap", () => {
        const cpu = 32;
        // 超大项目也不应超过硬上限
        const c = getAdaptiveConcurrency(10000, 100, cpu);
        expect(c).toBeLessThanOrEqual(Math.max(32, cpu * 4));
    });

    it("should increase with more rules", () => {
        const cpu = 8;
        const files = 500;
        const c1 = getAdaptiveConcurrency(files, 5, cpu);
        const c2 = getAdaptiveConcurrency(files, 50, cpu);
        expect(c2).toBeGreaterThanOrEqual(c1);
    });

    it("should use auto-detected CPU when not specified", () => {
        const c = getAdaptiveConcurrency(100, 10);
        expect(c).toBeGreaterThanOrEqual(1);
    });

    it("should return at least 1", () => {
        expect(getAdaptiveConcurrency(0, 0, 1)).toBeGreaterThanOrEqual(1);
    });
});

// ── SmartCache LRU ──────────────────────────────────────────────────────────

const TEST_DIR = resolve(process.cwd(), "test-cache-lru");

function cleanupLru() {
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }
}

describe("SmartCache LRU", () => {
    beforeEach(() => {
        cleanupLru();
        mkdirSync(TEST_DIR, { recursive: true });
    });

    afterEach(() => {
        cleanupLru();
    });

    it("should evict oldest entry when AST cache exceeds limit", () => {
        const cache = new SmartCache(TEST_DIR, undefined, 3); // 上限 3
        const ast = { type: "File" };

        cache.setAst("/a.js", "content-a", ast);
        cache.setAst("/b.js", "content-b", ast);
        cache.setAst("/c.js", "content-c", ast);
        expect(cache.getAstCacheSize()).toBe(3);

        // 插入第 4 个，应淘汰最旧的 /a.js
        cache.setAst("/d.js", "content-d", ast);
        expect(cache.getAstCacheSize()).toBe(3);
        expect(cache.getAst("/a.js", "content-a")).toBeUndefined();
        expect(cache.getAst("/d.js", "content-d")).toBeDefined();
    });

    it("should move accessed entry to newest position", () => {
        const cache = new SmartCache(TEST_DIR, undefined, 3);
        const ast = { type: "File" };

        cache.setAst("/a.js", "content-a", ast);
        cache.setAst("/b.js", "content-b", ast);
        cache.setAst("/c.js", "content-c", ast);

        // 访问 /a.js，使其变为最新
        cache.getAst("/a.js", "content-a");

        // 插入新条目，应淘汰 /b.js（因为现在 /a.js 是最新的）
        cache.setAst("/d.js", "content-d", ast);
        expect(cache.getAst("/a.js", "content-a")).toBeDefined();
        expect(cache.getAst("/b.js", "content-b")).toBeUndefined();
    });

    it("should update existing entry without eviction", () => {
        const cache = new SmartCache(TEST_DIR, undefined, 3);
        const ast = { type: "File" };

        cache.setAst("/a.js", "content-a", ast);
        cache.setAst("/b.js", "content-b", ast);

        // 更新 /a.js（相同 key，不同内容）
        cache.setAst("/a.js", "content-a2", ast);
        expect(cache.getAstCacheSize()).toBe(2);
    });

    it("should invalidate AST when content changes", () => {
        const cache = new SmartCache(TEST_DIR);
        const ast = { type: "File" };

        cache.setAst("/a.js", "original", ast);
        expect(cache.getAst("/a.js", "original")).toBeDefined();
        expect(cache.getAst("/a.js", "modified")).toBeUndefined();
    });

    it("should report correct cache size and limit", () => {
        const cache = new SmartCache(TEST_DIR, undefined, 5);
        expect(cache.getAstCacheLimit()).toBe(5);
        expect(cache.getAstCacheSize()).toBe(0);

        cache.setAst("/a.js", "a", { type: "File" });
        expect(cache.getAstCacheSize()).toBe(1);
    });
});

// ── 增量扫描 import 图 ──────────────────────────────────────────────────────

function createTempProject(): string {
    return mkdtempSync(join(tmpdir(), "fg-import-test-"));
}

function cleanupTempProject(dir: string) {
    try {
        rmSync(dir, { recursive: true, force: true });
    } catch {
        // ignore
    }
}

describe("Incremental Import Graph", () => {
    let projectDir: string;

    beforeEach(() => {
        projectDir = createTempProject();
        writeBasePackageJson(projectDir);
    });

    afterEach(() => {
        cleanupTempProject(projectDir);
    });

    it("should expand changed files to include importers", () => {
        // 构建依赖链: App.tsx → utils.ts
        writeProjectFile(projectDir, "src/utils.ts", `export const helper = () => "hello";`);
        writeProjectFile(
            projectDir,
            "src/App.tsx",
            `import { helper } from "./utils";
export default function App() { return helper(); }`
        );
        writeProjectFile(
            projectDir,
            "src/index.ts",
            `console.log("entry point");`
        );

        const engine = new RuleEngine({
            projectDir,
            incrementalImportGraph: true,
        });

        // 模拟增量扫描：只变更了 utils.ts
        const changedFiles = [resolve(projectDir, "src/utils.ts")];
        const includeExts = [".ts", ".tsx", ".js", ".jsx"];

        // 通过反射调用私有方法
        const expanded = (engine as any).expandIncrementalFiles(changedFiles, includeExts);

        // 应包含 utils.ts 本身，以及导入它的 App.tsx
        expect(expanded).toContain(resolve(projectDir, "src/utils.ts"));
        expect(expanded).toContain(resolve(projectDir, "src/App.tsx"));
        // index.ts 不依赖 utils.ts，不应包含
        expect(expanded).not.toContain(resolve(projectDir, "src/index.ts"));
    });

    it("should handle transitive dependencies", () => {
        // 链式依赖: App.tsx → Button.tsx → utils.ts
        writeProjectFile(projectDir, "src/utils.ts", `export const style = {};`);
        writeProjectFile(
            projectDir,
            "src/Button.tsx",
            `import { style } from "./utils";
export const Button = () => null;`
        );
        writeProjectFile(
            projectDir,
            "src/App.tsx",
            `import { Button } from "./Button";
export default function App() { return Button(); }`
        );

        const engine = new RuleEngine({
            projectDir,
            incrementalImportGraph: true,
        });

        const changedFiles = [resolve(projectDir, "src/utils.ts")];
        const includeExts = [".ts", ".tsx", ".js", ".jsx"];
        const expanded = (engine as any).expandIncrementalFiles(changedFiles, includeExts);

        // utils.ts 变更 → Button.tsx 受影响 → App.tsx 也受影响
        expect(expanded).toContain(resolve(projectDir, "src/utils.ts"));
        expect(expanded).toContain(resolve(projectDir, "src/Button.tsx"));
        expect(expanded).toContain(resolve(projectDir, "src/App.tsx"));
    });

    it("should return original files when import graph fails", () => {
        const engine = new RuleEngine({
            projectDir,
            incrementalImportGraph: true,
        });

        // 空项目，globby 找不到文件
        const changedFiles = [resolve(projectDir, "src/nofile.ts")];
        const includeExts = [".ts"];
        const expanded = (engine as any).expandIncrementalFiles(changedFiles, includeExts);

        // 回退到原始列表
        expect(expanded).toEqual(changedFiles);
    });

    it("should skip expansion for huge projects", () => {
        // 创建大量文件（超过 5000 阈值）
        for (let i = 0; i < 10; i++) {
            writeProjectFile(projectDir, `src/file${i}.ts`, `export const x${i} = ${i};`);
        }

        const engine = new RuleEngine({
            projectDir,
            incrementalImportGraph: true,
        });

        // Mock getAllSourceFilesSync 返回超大数量
        const origMethod = (engine as any).getAllSourceFilesSync;
        (engine as any).getAllSourceFilesSync = () => new Array(6000).fill("/fake.ts");

        const changedFiles = [resolve(projectDir, "src/file0.ts")];
        const includeExts = [".ts"];
        const expanded = (engine as any).expandIncrementalFiles(changedFiles, includeExts);

        // 超大项目应跳过扩展
        expect(expanded).toEqual(changedFiles);

        // 恢复
        (engine as any).getAllSourceFilesSync = origMethod;
    });

    it("should build import graph correctly", () => {
        writeProjectFile(projectDir, "src/a.ts", `import { b } from "./b";\nimport { c } from "./c";`);
        writeProjectFile(projectDir, "src/b.ts", `export const b = 1;`);
        writeProjectFile(projectDir, "src/c.ts", `import { b } from "./b";\nexport const c = 2;`);

        const engine = new RuleEngine({
            projectDir,
            incrementalImportGraph: true,
        });

        const allFiles = [
            resolve(projectDir, "src/a.ts"),
            resolve(projectDir, "src/b.ts"),
            resolve(projectDir, "src/c.ts"),
        ];
        const { importMap, reverseMap } = (engine as any).buildImportGraph(allFiles);

        // a.ts 导入 b.ts 和 c.ts
        expect(importMap.get(allFiles[0])?.has(allFiles[1])).toBe(true); // a → b
        expect(importMap.get(allFiles[0])?.has(allFiles[2])).toBe(true); // a → c

        // c.ts 导入 b.ts
        expect(importMap.get(allFiles[2])?.has(allFiles[1])).toBe(true); // c → b

        // reverse: b.ts 被 a.ts 和 c.ts 导入
        expect(reverseMap.get(allFiles[1])?.has(allFiles[0])).toBe(true); // b ← a
        expect(reverseMap.get(allFiles[1])?.has(allFiles[2])).toBe(true); // b ← c

        // reverse: c.ts 只被 a.ts 导入
        expect(reverseMap.get(allFiles[2])?.has(allFiles[0])).toBe(true); // c ← a
        expect(reverseMap.get(allFiles[2])?.has(allFiles[2])).toBe(false); // c 不导入自己
    });

    it("should handle index file resolution", () => {
        writeProjectFile(projectDir, "src/utils/index.ts", `export const util = () => {};`);
        writeProjectFile(
            projectDir,
            "src/App.tsx",
            `import { util } from "./utils";`
        );

        const engine = new RuleEngine({
            projectDir,
            incrementalImportGraph: true,
        });

        const allFiles = [
            resolve(projectDir, "src/utils/index.ts"),
            resolve(projectDir, "src/App.tsx"),
        ];
        const { importMap } = (engine as any).buildImportGraph(allFiles);

        // App.tsx 导入 ./utils 应解析到 ./utils/index.ts
        expect(importMap.get(allFiles[1])?.has(allFiles[0])).toBe(true);
    });

    it("should ignore node_modules imports", () => {
        writeProjectFile(
            projectDir,
            "src/App.tsx",
            `import React from "react";\nimport { helper } from "./helper";`
        );
        writeProjectFile(projectDir, "src/helper.ts", `export const helper = () => {};`);

        const engine = new RuleEngine({
            projectDir,
            incrementalImportGraph: true,
        });

        const allFiles = [
            resolve(projectDir, "src/App.tsx"),
            resolve(projectDir, "src/helper.ts"),
        ];
        const { importMap } = (engine as any).buildImportGraph(allFiles);

        // node_modules import 应被忽略
        expect(importMap.get(allFiles[0])?.has(allFiles[1])).toBe(true); // ./helper 保留
        expect(importMap.get(allFiles[0])?.size).toBe(1); // 只有 1 个相对路径 import
    });
});
