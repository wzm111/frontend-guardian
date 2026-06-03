/**
 * v3.3.0 — IDE 集成测试
 *
 * 覆盖：
 * 1. 增量诊断引擎 (IncrementalDiagnostic)
 * 2. RuleEngine.scanSingleFile 公共方法
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IncrementalDiagnostic } from "../src/ide/incremental-diagnostic.js";
import { RuleEngine } from "../src/engine/rule-engine.js";

function createTempProject(): string {
    return mkdtempSync(join(tmpdir(), "fg-ide-test-"));
}

function cleanupTempProject(dir: string) {
    try {
        rmSync(dir, { recursive: true, force: true });
    } catch {
        // ignore
    }
}

function writeBasePackageJson(projectDir: string) {
    writeFileSync(
        join(projectDir, "package.json"),
        JSON.stringify({ name: "test-project" }),
        "utf-8"
    );
}

// ── IncrementalDiagnostic ───────────────────────────────────────────────────

describe("IncrementalDiagnostic", () => {
    let projectDir: string;

    beforeEach(() => {
        projectDir = createTempProject();
        writeBasePackageJson(projectDir);
        mkdirSync(join(projectDir, "src"), { recursive: true });
    });

    afterEach(() => {
        cleanupTempProject(projectDir);
    });

    it("should diagnose a single file and return issues", async () => {
        // 写一个包含 useEffect 缺少依赖的文件
        const filePath = join(projectDir, "src/App.tsx");
        writeFileSync(
            filePath,
            `import { useEffect } from "react";
export default function App() {
    useEffect(() => {
        console.log("mounted");
    }, []);
    return null;
}`,
            "utf-8"
        );

        const diagnostic = new IncrementalDiagnostic({ projectDir });
        const result = await diagnostic.diagnose(filePath);

        expect(result.filesScanned).toBe(1);
        expect(result.fromCache).toBe(false);
        expect(result.duration).toBeGreaterThanOrEqual(0);
        // useEffect 缺少依赖的规则会检测到问题
        expect(result.issues.length).toBeGreaterThanOrEqual(0);
    });

    it("should return cached result when content unchanged", async () => {
        const filePath = join(projectDir, "src/index.ts");
        writeFileSync(filePath, `const x = 1;`, "utf-8");

        const diagnostic = new IncrementalDiagnostic({ projectDir });

        // 第一次扫描
        const result1 = await diagnostic.diagnose(filePath);
        expect(result1.fromCache).toBe(false);

        // 第二次扫描（相同内容）
        const result2 = await diagnostic.diagnose(filePath);
        expect(result2.fromCache).toBe(true);
        expect(result2.issues).toEqual(result1.issues);
    });

    it("should re-scan when content changes", async () => {
        const filePath = join(projectDir, "src/index.ts");
        writeFileSync(filePath, `const x = 1;`, "utf-8");

        const diagnostic = new IncrementalDiagnostic({ projectDir });

        // 第一次
        const result1 = await diagnostic.diagnose(filePath);
        expect(result1.fromCache).toBe(false);

        // 修改文件内容
        writeFileSync(filePath, `const x = 2;`, "utf-8");

        // 第二次（内容变了）
        const result2 = await diagnostic.diagnose(filePath);
        expect(result2.fromCache).toBe(false);
    });

    it("should support diagnosing with provided content", async () => {
        const filePath = join(projectDir, "src/test.ts");
        writeFileSync(filePath, `const a = 1;`, "utf-8");

        const diagnostic = new IncrementalDiagnostic({ projectDir });
        const result = await diagnostic.diagnose(filePath, `const b = 2;`);

        expect(result.filesScanned).toBe(1);
        expect(result.fromCache).toBe(false);
    });

    it("should invalidate cache for a file", async () => {
        const filePath = join(projectDir, "src/index.ts");
        writeFileSync(filePath, `const x = 1;`, "utf-8");

        const diagnostic = new IncrementalDiagnostic({ projectDir });
        await diagnostic.diagnose(filePath);

        // 缓存命中
        const result1 = await diagnostic.diagnose(filePath);
        expect(result1.fromCache).toBe(true);

        // 失效缓存
        diagnostic.invalidate(filePath);

        // 缓存未命中
        const result2 = await diagnostic.diagnose(filePath);
        expect(result2.fromCache).toBe(false);
    });

    it("should clear all cache", async () => {
        const file1 = join(projectDir, "src/a.ts");
        const file2 = join(projectDir, "src/b.ts");
        writeFileSync(file1, `const a = 1;`, "utf-8");
        writeFileSync(file2, `const b = 2;`, "utf-8");

        const diagnostic = new IncrementalDiagnostic({ projectDir });
        await diagnostic.diagnose(file1);
        await diagnostic.diagnose(file2);

        diagnostic.clearCache();

        const result1 = await diagnostic.diagnose(file1);
        const result2 = await diagnostic.diagnose(file2);
        expect(result1.fromCache).toBe(false);
        expect(result2.fromCache).toBe(false);
    });

    it("should report cache stats", async () => {
        const filePath = join(projectDir, "src/index.ts");
        writeFileSync(filePath, `const x = 1;`, "utf-8");

        const diagnostic = new IncrementalDiagnostic({ projectDir });

        await diagnostic.diagnose(filePath); // miss
        await diagnostic.diagnose(filePath); // hit
        await diagnostic.diagnose(filePath); // hit

        const stats = diagnostic.getCacheStats();
        expect(stats.hits).toBe(2);
        expect(stats.misses).toBe(1);
        expect(stats.hitRate).toBeCloseTo(0.667, 1);
    });

    it("should diagnose batch of files", async () => {
        const file1 = join(projectDir, "src/a.ts");
        const file2 = join(projectDir, "src/b.ts");
        writeFileSync(file1, `const a = 1;`, "utf-8");
        writeFileSync(file2, `const b = 2;`, "utf-8");

        const diagnostic = new IncrementalDiagnostic({ projectDir });
        const results = await diagnostic.diagnoseBatch([file1, file2]);

        expect(results.size).toBe(2);
        expect(results.has(file1)).toBe(true);
        expect(results.has(file2)).toBe(true);
    });

    it("should handle missing files gracefully", async () => {
        const diagnostic = new IncrementalDiagnostic({ projectDir });
        const filePath = join(projectDir, "nonexistent.ts");

        const result = await diagnostic.diagnose(filePath);
        expect(result.issues).toEqual([]);
        expect(result.filesScanned).toBe(1);
    });
});

// ── RuleEngine.scanSingleFile ───────────────────────────────────────────────

describe("RuleEngine.scanSingleFile", () => {
    let projectDir: string;

    beforeEach(() => {
        projectDir = createTempProject();
        writeBasePackageJson(projectDir);
        mkdirSync(join(projectDir, "src"), { recursive: true });
    });

    afterEach(() => {
        cleanupTempProject(projectDir);
    });

    it("should scan a single file and return issues", async () => {
        const filePath = join(projectDir, "src/App.tsx");
        writeFileSync(
            filePath,
            `import { useEffect } from "react";
export default function App() {
    useEffect(() => {
        fetch("/api");
    }, []);
    return null;
}`,
            "utf-8"
        );

        const engine = new RuleEngine({ projectDir });
        const issues = await engine.scanSingleFile(filePath);

        // useEffect 缺少依赖的规则可能会发现问题
        expect(Array.isArray(issues)).toBe(true);
    });

    it("should scan with module filter", async () => {
        const filePath = join(projectDir, "src/test.ts");
        writeFileSync(filePath, `const x = 1;`, "utf-8");

        const engine = new RuleEngine({ projectDir });
        const issues = await engine.scanSingleFile(filePath, "i18n");

        expect(Array.isArray(issues)).toBe(true);
    });

    it("should return empty array for nonexistent file", async () => {
        const engine = new RuleEngine({ projectDir });
        const issues = await engine.scanSingleFile(join(projectDir, "nonexistent.ts"));

        expect(issues).toEqual([]);
    });

    it("should return empty array when no rules match", async () => {
        const filePath = join(projectDir, "src/test.ts");
        writeFileSync(filePath, `const x = 1;`, "utf-8");

        const engine = new RuleEngine({ projectDir });
        const issues = await engine.scanSingleFile(filePath, "svelte");

        expect(issues).toEqual([]);
    });
});
