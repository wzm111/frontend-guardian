/**
 * v3.16.0: 可视化影响图单元测试
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectIndexer } from "../src/engine/indexer.js";
import {
    buildImpactGraph,
    formatImpactGraph,
    toDot,
    toMermaid,
} from "../src/utils/impact-graph.js";
import { formatRecommendationsJson, recommendTests } from "../src/utils/test-recommender.js";

describe("v3.16.0 — Impact Graph", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-impact-"));
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

    async function buildSampleIndex() {
        writeFile("package.json", JSON.stringify({ name: "test" }));
        writeFile("src/utils.ts", "export function add(a: number, b: number) { return a + b; }\n");
        writeFile(
            "src/utils.test.ts",
            'import { add } from "./utils";\ntest("add", () => { expect(add(1, 2)).toBe(3); });\n'
        );
        writeFile(
            "src/page.tsx",
            'import { add } from "./utils";\nexport default function Page() { return <div>{add(1,2)}</div>; }\n'
        );

        const indexer = new ProjectIndexer(tempDir);
        const files = ["src/utils.ts", "src/utils.test.ts", "src/page.tsx"].map((f) =>
            resolve(tempDir, f)
        );
        await indexer.buildIndex(files);
        return indexer;
    }

    it("buildImpactGraph() 应生成 changedFile / module / route / test 节点", async () => {
        const indexer = await buildSampleIndex();
        const routeMap = new Map([
            ["src/page.tsx", { path: "/page", file: "src/page.tsx", framework: "react" }],
        ]);
        const e2eCoverage = new Map<string, Set<string>>([
            ["/page", new Set([resolve(tempDir, "e2e/page.spec.ts")])],
        ]);

        const graph = buildImpactGraph({
            projectDir: tempDir,
            indexer,
            changedFiles: [resolve(tempDir, "src/utils.ts")],
            routeMap,
            e2eRouteCoverage: e2eCoverage,
        });

        expect(graph.changedFiles).toEqual(["src/utils.ts"]);
        expect(graph.nodes.some((n) => n.type === "changedFile")).toBe(true);
        expect(graph.nodes.some((n) => n.type === "module")).toBe(true);
        expect(graph.nodes.some((n) => n.type === "route")).toBe(true);
        expect(graph.nodes.some((n) => n.type === "test")).toBe(true);

        expect(graph.edges.some((e) => e.kind === "imports")).toBe(true);
        expect(graph.edges.some((e) => e.kind === "renders")).toBe(true);
        expect(graph.edges.some((e) => e.kind === "covers")).toBe(true);
    });

    it("toMermaid() 应以 flowchart TD 开头", async () => {
        const indexer = await buildSampleIndex();
        const graph = buildImpactGraph({
            projectDir: tempDir,
            indexer,
            changedFiles: [resolve(tempDir, "src/utils.ts")],
            routeMap: new Map(),
            e2eRouteCoverage: new Map(),
        });
        const mermaid = toMermaid(graph);
        expect(mermaid.startsWith("flowchart TD")).toBe(true);
        expect(mermaid).toContain("src/utils.ts");
    });

    it("toDot() 应以 digraph 开头", async () => {
        const indexer = await buildSampleIndex();
        const graph = buildImpactGraph({
            projectDir: tempDir,
            indexer,
            changedFiles: [resolve(tempDir, "src/utils.ts")],
            routeMap: new Map(),
            e2eRouteCoverage: new Map(),
        });
        const dot = toDot(graph);
        expect(dot.startsWith("digraph")).toBe(true);
        expect(dot).toContain('label="src/utils.ts"');
    });

    it("formatImpactGraph() 应按格式返回正确类型", async () => {
        const indexer = await buildSampleIndex();
        const graph = buildImpactGraph({
            projectDir: tempDir,
            indexer,
            changedFiles: [resolve(tempDir, "src/utils.ts")],
            routeMap: new Map(),
            e2eRouteCoverage: new Map(),
        });
        expect(typeof formatImpactGraph(graph, "mermaid")).toBe("string");
        expect(typeof formatImpactGraph(graph, "dot")).toBe("string");
        expect(typeof formatImpactGraph(graph, "json")).toBe("object");
    });

    it("recommendTests({ includeImpactGraph: true }) 应返回 impactGraph", async () => {
        writeFile("package.json", JSON.stringify({ name: "test", devDependencies: { jest: "^29.0.0" } }));
        writeFile("src/utils.ts", "export function add(a: number, b: number) { return a + b; }\n");
        writeFile(
            "src/utils.test.ts",
            'import { add } from "./utils";\ntest("add", () => { expect(add(1, 2)).toBe(3); });\n'
        );

        const result = await recommendTests({
            projectDir: tempDir,
            changedFiles: [resolve(tempDir, "src/utils.ts")],
            includeImpactGraph: true,
        });

        expect(result.impactGraph).toBeDefined();
        expect(result.impactGraph?.nodes.length).toBeGreaterThan(0);
        expect(result.impactGraph?.edges.length).toBeGreaterThan(0);
        expect(result.impactGraph?.changedFiles).toContain("src/utils.ts");
    });

    it("formatRecommendationsJson() 应保留 impactGraph 字段", async () => {
        writeFile("package.json", JSON.stringify({ name: "test" }));
        const result = await recommendTests({
            projectDir: tempDir,
            changedFiles: [],
            includeImpactGraph: true,
        });
        const json = formatRecommendationsJson(result) as Record<string, unknown>;
        expect(json).toHaveProperty("impactGraph");
    });
});
