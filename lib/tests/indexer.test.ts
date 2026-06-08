import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProjectIndexer } from "../src/engine/indexer.js";

describe("v3.7.0 — ProjectIndexer", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-index-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    describe("buildIndex", () => {
        it("should build index for a simple project", async () => {
            // 创建模拟项目结构
            writeFileSync(join(tempDir, "index.ts"), 'export const app = "hello";');
            writeFileSync(join(tempDir, "utils.ts"), "export function add(a: number, b: number) { return a + b; }");

            const indexer = new ProjectIndexer(tempDir);
            await indexer.buildIndex([join(tempDir, "index.ts"), join(tempDir, "utils.ts")]);

            expect(indexer.isValid()).toBe(true);
            const stats = indexer.getStats();
            expect(stats.files).toBe(2);
            expect(stats.symbols).toBeGreaterThan(0);
        });

        it("should detect exports", async () => {
            writeFileSync(
                join(tempDir, "math.ts"),
                `export function add(a: number, b: number) { return a + b; }\nexport const PI = 3.14;\nexport default function main() {}`
            );

            const indexer = new ProjectIndexer(tempDir);
            await indexer.buildIndex([join(tempDir, "math.ts")]);

            const exports = indexer.getExports(join(tempDir, "math.ts"));
            expect(exports).toContain("add");
            expect(exports).toContain("PI");
            // export default function main() {} → 导出名为 main
            expect(exports).toContain("main");
        });

        it("should detect imports", async () => {
            writeFileSync(join(tempDir, "utils.ts"), "export function helper() { return 42; }");
            writeFileSync(join(tempDir, "main.ts"), 'import { helper } from "./utils";\nconsole.log(helper());');

            const indexer = new ProjectIndexer(tempDir);
            await indexer.buildIndex([join(tempDir, "utils.ts"), join(tempDir, "main.ts")]);

            const deps = indexer.getDependencies(join(tempDir, "main.ts"));
            expect(deps.length).toBeGreaterThan(0);
        });

        it("should build reverse import graph", async () => {
            writeFileSync(join(tempDir, "utils.ts"), "export function helper() { return 42; }");
            writeFileSync(join(tempDir, "a.ts"), 'import { helper } from "./utils";');
            writeFileSync(join(tempDir, "b.ts"), 'import { helper } from "./utils";');

            const indexer = new ProjectIndexer(tempDir);
            await indexer.buildIndex([join(tempDir, "utils.ts"), join(tempDir, "a.ts"), join(tempDir, "b.ts")]);

            const importers = indexer.getImporters(join(tempDir, "utils.ts"));
            expect(importers.length).toBe(2);
        });
    });

    describe("getChangedFiles", () => {
        it("should detect changed files", async () => {
            const filePath = join(tempDir, "test.ts");
            writeFileSync(filePath, "export const x = 1;");

            const indexer = new ProjectIndexer(tempDir);
            await indexer.buildIndex([filePath]);

            // 修改文件
            writeFileSync(filePath, "export const x = 2;");

            const { changed, deleted } = indexer.getChangedFiles([filePath]);
            expect(changed.length).toBe(1);
            expect(deleted.length).toBe(0);
        });

        it("should detect deleted files", async () => {
            const filePath = join(tempDir, "test.ts");
            writeFileSync(filePath, "export const x = 1;");

            const indexer = new ProjectIndexer(tempDir);
            await indexer.buildIndex([filePath]);

            // 删除文件
            rmSync(filePath);

            const { changed, deleted } = indexer.getChangedFiles([]);
            expect(changed.length).toBe(0);
            expect(deleted.length).toBe(1);
        });
    });

    describe("updateIndex", () => {
        it("should incrementally update index", async () => {
            const file1 = join(tempDir, "a.ts");
            const file2 = join(tempDir, "b.ts");
            writeFileSync(file1, "export const a = 1;");
            writeFileSync(file2, "export const b = 2;");

            const indexer = new ProjectIndexer(tempDir);
            await indexer.buildIndex([file1, file2]);

            // 修改 file1
            writeFileSync(file1, "export const a = 3;");
            await indexer.updateIndex([file1], []);

            expect(indexer.isValid()).toBe(true);
            const stats = indexer.getStats();
            expect(stats.files).toBe(2);
        });
    });

    describe("getTransitiveImporters", () => {
        it("should find transitive importers", async () => {
            writeFileSync(join(tempDir, "base.ts"), "export function base() {}");
            writeFileSync(join(tempDir, "mid.ts"), 'import { base } from "./base";');
            writeFileSync(join(tempDir, "top.ts"), 'import { base } from "./mid";');

            const indexer = new ProjectIndexer(tempDir);
            await indexer.buildIndex([
                join(tempDir, "base.ts"),
                join(tempDir, "mid.ts"),
                join(tempDir, "top.ts"),
            ]);

            const importers = indexer.getTransitiveImporters(join(tempDir, "base.ts"));
            expect(importers.length).toBeGreaterThan(0);
        });
    });

    describe("findSymbol", () => {
        it("should find symbols by name", async () => {
            writeFileSync(join(tempDir, "math.ts"), "export function add() {}\nexport function subtract() {}");

            const indexer = new ProjectIndexer(tempDir);
            await indexer.buildIndex([join(tempDir, "math.ts")]);

            const results = indexer.findSymbol("add");
            expect(results.length).toBe(1);
            expect(results[0].symbol.name).toBe("add");
        });
    });

    describe("clean", () => {
        it("should clear all index data", async () => {
            writeFileSync(join(tempDir, "test.ts"), "export const x = 1;");

            const indexer = new ProjectIndexer(tempDir);
            await indexer.buildIndex([join(tempDir, "test.ts")]);
            expect(indexer.isValid()).toBe(true);

            indexer.clean();
            expect(indexer.isValid()).toBe(false);
            expect(indexer.getStats().files).toBe(0);
        });
    });
});
