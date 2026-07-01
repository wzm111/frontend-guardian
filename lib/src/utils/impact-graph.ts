/**
 * v3.16.0: 可视化影响图
 *
 * 基于 ProjectIndexer 的反向依赖图，构建“变更文件 → 模块 → 路由 → 测试”的影响图，
 * 支持 JSON / Mermaid / DOT 三种输出格式。
 */

import { relative } from "node:path";
import type { ProjectIndexer, RouteInfo } from "@/engine/indexer.js";
import type { TestRecommendation } from "@/utils/test-recommender.js";

export type ImpactNodeType = "changedFile" | "module" | "route" | "test";
export type ImpactEdgeKind = "imports" | "renders" | "covers";
export type ImpactGraphFormat = "json" | "mermaid" | "dot";

export interface ImpactNode {
    /** 节点唯一 ID */
    id: string;
    /** 节点类型 */
    type: ImpactNodeType;
    /** 展示标签 */
    label: string;
    /** 关联文件相对路径 */
    file?: string;
    /** 路由路径（仅 route 节点） */
    route?: string;
    /** 框架（仅 route/test 节点） */
    framework?: string;
    /** 优先级（仅 test 节点） */
    priority?: number;
    /** 额外元数据 */
    meta?: Record<string, unknown>;
}

export interface ImpactEdge {
    /** 起点节点 ID */
    from: string;
    /** 终点节点 ID */
    to: string;
    /** 边类型 */
    kind: ImpactEdgeKind;
    /** 展示标签 */
    label?: string;
}

export interface ImpactGraph {
    /** 节点列表 */
    nodes: ImpactNode[];
    /** 边列表 */
    edges: ImpactEdge[];
    /** 变更文件相对路径 */
    changedFiles: string[];
}

export interface BuildImpactGraphOptions {
    /** 项目根目录 */
    projectDir: string;
    /** 项目索引器 */
    indexer: ProjectIndexer;
    /** 变更文件绝对路径 */
    changedFiles: string[];
    /** 路由映射 */
    routeMap: Map<string, RouteInfo>;
    /** E2E 路由覆盖映射 */
    e2eRouteCoverage: Map<string, Set<string>>;
    /** 推荐结果映射（用于补充 test 节点元数据） */
    recommendations?: Map<string, TestRecommendation>;
}

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".vue"]);

/** 简化版测试文件判断（避免与 test-recommender 循环依赖） */
function isTestFile(filePath: string): boolean {
    return /[\\/](?:e2e|cypress|selenium|wdio|katalon)[\\/]/.test(filePath) ||
        /\.(test|spec|e2e|cy)\.(ts|tsx|js|jsx|mjs)$/.test(filePath);
}

/** 判断是否为源码文件 */
function isSourceFile(filePath: string): boolean {
    if (filePath.includes("node_modules")) return false;
    if (isTestFile(filePath)) return false;
    return SOURCE_EXTS.has(filePath.slice(filePath.lastIndexOf(".")));
}

/** 路由 path 标准化 */
function normalizeRoute(path: string): string {
    let p = path.trim();
    if (!p.startsWith("/")) p = `/${p}`;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p;
}

function addNode(map: Map<string, ImpactNode>, node: ImpactNode): void {
    if (!map.has(node.id)) {
        map.set(node.id, node);
    }
}

function addEdge(
    map: Map<string, ImpactEdge>,
    from: string,
    to: string,
    kind: ImpactEdgeKind,
    label?: string
): void {
    const key = `${from}|${to}|${kind}`;
    if (!map.has(key)) {
        map.set(key, { from, to, kind, label });
    }
}

function getTestMeta(
    testFile: string,
    recommendations?: Map<string, TestRecommendation>
): { priority?: number; testType?: string } {
    const rec = recommendations?.get(testFile);
    return { priority: rec?.priority, testType: rec?.testType };
}

/** 构建影响图 */
export function buildImpactGraph(options: BuildImpactGraphOptions): ImpactGraph {
    const { projectDir, indexer, changedFiles, routeMap, e2eRouteCoverage, recommendations } = options;
    const nodes = new Map<string, ImpactNode>();
    const edges = new Map<string, ImpactEdge>();

    const relChangedFiles = changedFiles.map((f) => relative(projectDir, f));

    // 1. 添加变更文件节点
    for (const file of relChangedFiles) {
        addNode(nodes, {
            id: `changed:${file}`,
            type: "changedFile",
            label: file,
            file,
        });
    }

    // 2. 遍历每个变更文件，展开依赖链
    for (const changedFile of changedFiles) {
        const relChanged = relative(projectDir, changedFile);
        const changedId = `changed:${relChanged}`;

        // 2.1 直接 import 了变更文件的测试
        const directImporters = indexer.getImporters(changedFile);
        for (const importer of directImporters) {
            const relImporter = relative(projectDir, importer);
            if (isTestFile(relImporter)) {
                const meta = getTestMeta(importer, recommendations);
                addNode(nodes, {
                    id: `test:${relImporter}`,
                    type: "test",
                    label: relImporter,
                    file: relImporter,
                    priority: meta.priority,
                    meta: meta.testType ? { testType: meta.testType } : undefined,
                });
                addEdge(edges, changedId, `test:${relImporter}`, "imports", "直接 import");
            }
        }

        // 2.2 传递依赖：变更文件 → 模块/路由 → 测试
        const transitiveImporters = indexer.getTransitiveImporters(changedFile);
        for (const importer of transitiveImporters) {
            const relImporter = relative(projectDir, importer);
            if (isTestFile(relImporter)) continue; // 测试节点已在直接依赖中处理或作为 route 覆盖处理

            const route = routeMap.get(relImporter);
            if (route) {
                // 模块节点
                addNode(nodes, {
                    id: `module:${relImporter}`,
                    type: "module",
                    label: relImporter,
                    file: relImporter,
                });
                addEdge(edges, changedId, `module:${relImporter}`, "imports");

                // 路由节点
                addNode(nodes, {
                    id: `route:${route.path}`,
                    type: "route",
                    label: route.path,
                    route: route.path,
                    framework: route.framework,
                });
                addEdge(edges, `module:${relImporter}`, `route:${route.path}`, "renders");

                // 覆盖该路由的测试
                const coveringTests = e2eRouteCoverage.get(normalizeRoute(route.path));
                if (coveringTests) {
                    for (const testFile of coveringTests) {
                        const relTest = relative(projectDir, testFile);
                        const meta = getTestMeta(testFile, recommendations);
                        addNode(nodes, {
                            id: `test:${relTest}`,
                            type: "test",
                            label: relTest,
                            file: relTest,
                            priority: meta.priority,
                            meta: meta.testType ? { testType: meta.testType } : undefined,
                        });
                        addEdge(edges, `route:${route.path}`, `test:${relTest}`, "covers");
                    }
                }
            } else if (isSourceFile(relImporter)) {
                // 普通模块节点
                addNode(nodes, {
                    id: `module:${relImporter}`,
                    type: "module",
                    label: relImporter,
                    file: relImporter,
                });
                addEdge(edges, changedId, `module:${relImporter}`, "imports");
            }
        }
    }

    return {
        nodes: Array.from(nodes.values()),
        edges: Array.from(edges.values()),
        changedFiles: relChangedFiles,
    };
}

/** 格式化影响图为指定格式 */
export function formatImpactGraph(graph: ImpactGraph, format: ImpactGraphFormat): object | string {
    switch (format) {
        case "mermaid":
            return toMermaid(graph);
        case "dot":
            return toDot(graph);
        case "json":
        default:
            return graph;
    }
}

function escapeMermaidId(id: string): string {
    // Mermaid 节点 ID 只能包含字母、数字、下划线，其他字符替换
    return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function escapeMermaidLabel(label: string): string {
    return label.replace(/"/g, "\\\"");
}

/** 转换为 Mermaid flowchart */
export function toMermaid(graph: ImpactGraph): string {
    const lines: string[] = ["flowchart TD"];

    for (const node of graph.nodes) {
        const id = escapeMermaidId(node.id);
        const icon =
            node.type === "changedFile"
                ? "📝"
                : node.type === "module"
                    ? "📦"
                    : node.type === "route"
                        ? "🗺️"
                        : "🧪";
        const label = escapeMermaidLabel(node.label);
        lines.push(`    ${id}["${icon} ${label}"]`);
    }

    for (const edge of graph.edges) {
        const from = escapeMermaidId(edge.from);
        const to = escapeMermaidId(edge.to);
        const label = edge.label ? `|${escapeMermaidLabel(edge.label)}|` : "";
        lines.push(`    ${from} -->${label} ${to}`);
    }

    return lines.join("\n");
}

function escapeDotId(id: string): string {
    return `"${id.replace(/"/g, '\\"')}"`;
}

function escapeDotLabel(label: string): string {
    return label.replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/** 转换为 Graphviz DOT */
export function toDot(graph: ImpactGraph): string {
    const lines: string[] = ["digraph ImpactGraph {"];
    lines.push("    rankdir=LR;");
    lines.push("    node [shape=box, style=rounded];");

    const shapeMap: Record<ImpactNodeType, string> = {
        changedFile: "ellipse",
        module: "box",
        route: "diamond",
        test: "box",
    };

    const colorMap: Record<ImpactNodeType, string> = {
        changedFile: "#ffcc99",
        module: "#99ccff",
        route: "#ccffcc",
        test: "#ffccff",
    };

    for (const node of graph.nodes) {
        const id = escapeDotId(node.id);
        const label = escapeDotLabel(node.label);
        const shape = shapeMap[node.type];
        const color = colorMap[node.type];
        lines.push(`    ${id} [label="${label}", shape=${shape}, fillcolor="${color}", style="rounded,filled"];`);
    }

    for (const edge of graph.edges) {
        const from = escapeDotId(edge.from);
        const to = escapeDotId(edge.to);
        const label = edge.label ? `, label="${escapeDotLabel(edge.label)}"` : "";
        lines.push(`    ${from} -> ${to} [color="#666666"${label}];`);
    }

    lines.push("}");
    return lines.join("\n");
}
