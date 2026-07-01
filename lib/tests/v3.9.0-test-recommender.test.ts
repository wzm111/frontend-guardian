/**
 * v3.9.0: 智能测试推荐单元测试
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatRecommendations, formatRecommendationsJson, recommendTests } from "../src/utils/test-recommender.js";

describe("v3.9.0 — Intelligent Test Recommendation", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-recommend-"));
    });

    afterEach(() => {
        try {
            rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    function writeFile(relPath: string, content: string) {
        const fullPath = join(tempDir, relPath);
        mkdirSync(resolve(fullPath, ".."), { recursive: true });
        writeFileSync(fullPath, content, "utf-8");
    }

    it("应推荐直接 import 变更文件的测试", async () => {
        writeFile("package.json", JSON.stringify({ name: "test", devDependencies: { jest: "^29.0.0" } }));
        writeFile("src/utils.ts", "export function add(a: number, b: number) { return a + b; }\n");
        writeFile(
            "src/utils.test.ts",
            'import { add } from "./utils";\ntest("add", () => { expect(add(1, 2)).toBe(3); });\n'
        );

        const result = await recommendTests({
            projectDir: tempDir,
            changedFiles: [join(tempDir, "src/utils.ts")],
        });

        expect(result.recommendations.length).toBe(1);
        expect(result.recommendations[0].testFile).toContain("utils.test.ts");
        expect(result.recommendations[0].priority).toBe(1);
        expect(result.recommendations[0].testType).toBe("unit");
        expect(result.summary.direct).toBe(1);
        expect(result.uncoveredChanges.length).toBe(0);
    });

    it("应推荐传递影响的测试", async () => {
        writeFile("package.json", JSON.stringify({ name: "test", devDependencies: { jest: "^29.0.0" } }));
        writeFile("src/a.ts", "export function a() { return 1; }\n");
        writeFile("src/b.ts", 'import { a } from "./a";\nexport function b() { return a(); }\n');
        writeFile("src/b.test.ts", 'import { b } from "./b";\ntest("b", () => { expect(b()).toBe(1); });\n');

        const result = await recommendTests({
            projectDir: tempDir,
            changedFiles: [join(tempDir, "src/a.ts")],
            minPriority: 2,
        });

        expect(result.recommendations.length).toBe(1);
        expect(result.recommendations[0].testFile).toContain("b.test.ts");
        expect(result.recommendations[0].priority).toBe(2);
        expect(result.summary.transitive).toBe(1);
    });

    it("应检测未被测试覆盖的变更", async () => {
        writeFile("package.json", JSON.stringify({ name: "test", devDependencies: { jest: "^29.0.0" } }));
        writeFile("src/orphan.ts", "export function orphan() { return 1; }\n");

        const result = await recommendTests({
            projectDir: tempDir,
            changedFiles: [join(tempDir, "src/orphan.ts")],
        });

        expect(result.recommendations.length).toBe(0);
        expect(result.uncoveredChanges.length).toBe(1);
        expect(result.uncoveredChanges[0].file).toContain("orphan.ts");
        expect(result.summary.uncovered).toBe(1);
    });

    it("应自动识别 vitest 框架", async () => {
        writeFile("package.json", JSON.stringify({ name: "test", devDependencies: { vitest: "^1.0.0" } }));
        writeFile("src/math.ts", "export const PI = 3.14;\n");
        writeFile("src/math.spec.ts", 'import { PI } from "./math";\ntest("PI", () => { expect(PI).toBe(3.14); });\n');

        const result = await recommendTests({
            projectDir: tempDir,
            changedFiles: [join(tempDir, "src/math.ts")],
        });

        expect(result.testFramework).toBe("vitest");
        expect(result.recommendations.length).toBe(1);
        expect(result.recommendations[0].suggestedCommand).toContain("vitest run");
    });

    it("文本报告应包含关键信息", async () => {
        writeFile("package.json", JSON.stringify({ name: "test" }));
        const result = await recommendTests({ projectDir: tempDir, changedFiles: [] });
        const report = formatRecommendations(result);
        expect(report).toContain("智能测试推荐");
        expect(report).toContain("变更文件");
    });

    it("JSON 报告应包含必要字段", async () => {
        writeFile("package.json", JSON.stringify({ name: "test" }));
        const result = await recommendTests({ projectDir: tempDir, changedFiles: [] });
        const json = formatRecommendationsJson(result);
        expect(json).toHaveProperty("changedFiles");
        expect(json).toHaveProperty("recommendations");
        expect(json).toHaveProperty("summary");
        expect(json).toHaveProperty("uncoveredChanges");
    });

    it("v3.12.1: 应基于历史数据标记 flaky 测试", async () => {
        writeFile("package.json", JSON.stringify({ name: "test", devDependencies: { jest: "^29.0.0" } }));
        writeFile("src/utils.ts", "export function add(a: number, b: number) { return a + b; }\n");
        writeFile(
            "src/utils.test.ts",
            'import { add } from "./utils";\ntest("add", () => { expect(add(1, 2)).toBe(3); });\n'
        );

        // 构造测试历史：该测试失败率较高
        const historyDir = join(tempDir, ".frontend-guardian");
        mkdirSync(historyDir, { recursive: true });
        const testFile = join(tempDir, "src/utils.test.ts");
        const history = [
            { timestamp: 1, testFile, status: "passed" },
            { timestamp: 2, testFile, status: "failed" },
            { timestamp: 3, testFile, status: "failed" },
            { timestamp: 4, testFile, status: "failed" },
        ];
        writeFileSync(join(historyDir, "test-history.json"), JSON.stringify(history), "utf-8");

        const result = await recommendTests({
            projectDir: tempDir,
            changedFiles: [join(tempDir, "src/utils.ts")],
            flakyThresholds: { failureRate: 0.5, minRuns: 3 },
        });

        expect(result.recommendations.length).toBe(1);
        expect(result.recommendations[0].flakyRisk).toBeDefined();
        expect(result.recommendations[0].flakyRisk?.failureRate).toBe(0.75);
        expect(result.flakyTests.length).toBe(1);
        expect(result.summary.flaky).toBe(1);

        const report = formatRecommendations(result);
        expect(report).toContain("flaky");

        const json = formatRecommendationsJson(result) as Record<string, unknown>;
        expect(json.flakyTests).toHaveLength(1);
    });

    it("v3.16.0: includeImpactGraph: true 时 result.impactGraph 应包含 nodes/edges", async () => {
        writeFile("package.json", JSON.stringify({ name: "test", devDependencies: { jest: "^29.0.0" } }));
        writeFile("src/utils.ts", "export function add(a: number, b: number) { return a + b; }\n");
        writeFile(
            "src/utils.test.ts",
            'import { add } from "./utils";\ntest("add", () => { expect(add(1, 2)).toBe(3); });\n'
        );

        const result = await recommendTests({
            projectDir: tempDir,
            changedFiles: [join(tempDir, "src/utils.ts")],
            includeImpactGraph: true,
        });

        expect(result.impactGraph).toBeDefined();
        expect(result.impactGraph?.nodes.length).toBeGreaterThan(0);
        expect(result.impactGraph?.edges.length).toBeGreaterThan(0);
        expect(result.impactGraph?.changedFiles).toContain("src/utils.ts");
    });
});
