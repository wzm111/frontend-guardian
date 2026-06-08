/**
 * ProjectIndexer — 项目级增量索引系统（v3.7.0）
 *
 * 设计目标：
 * 1. 预索引项目文件结构（符号、import、路由），加速后续扫描
 * 2. 基于文件哈希快速检测变更，只重新索引变更文件
 * 3. 反向依赖图：快速定位"修改文件会影响谁"
 * 4. 框架路由自动解析：React Router / Vue Router / Next.js / Nuxt / UniApp
 * 5. 持久化到 `.frontend-guardian/index/index.json`，跨会话复用
 *
 * 与 SmartCache 的区别：
 * - SmartCache 缓存扫描结果（Issue[]），按规则版本失效
 * - ProjectIndexer 缓存文件结构（符号、import、路由），按文件内容哈希失效
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, relative, basename, extname } from "node:path";
import { parseAST, getImports, walkAST } from "@/utils/ast-parser.js";
import type { ImportInfo } from "@/types.js";
import type { ParseResult } from "@babel/parser";
import type { File as BabelFile } from "@babel/types";

// ── 常量 ───────────────────────────────────────────────────────────────────

/** 索引版本，索引结构变更时递增 */
const INDEX_VERSION = "3.7.0";
/** 索引目录名 */
const INDEX_DIR = ".frontend-guardian/index";
/** 索引文件名 */
const INDEX_FILE = "index.json";

// ── 类型 ───────────────────────────────────────────────────────────────────

/** 符号信息 */
export interface SymbolInfo {
    name: string;
    kind: "function" | "class" | "variable" | "hook" | "component";
    line: number;
    column: number;
}

/** 路由信息 */
export interface RouteInfo {
    path: string;
    component?: string;
    file: string;
    framework: string;
}

/** 单个文件的索引 */
export interface FileIndex {
    /** 文件相对路径 */
    path: string;
    /** 文件内容 SHA-256 哈希（前 16 位） */
    hash: string;
    /** 最后索引时间 */
    indexedAt: number;
    /** 导入的文件列表（相对路径） */
    imports: string[];
    /** 导出的符号名列表 */
    exports: string[];
    /** 符号表 */
    symbols: SymbolInfo[];
    /** 路由信息（如果该文件定义了路由） */
    route?: RouteInfo;
}

/** 项目级索引 */
export interface ProjectIndex {
    /** 索引版本 */
    version: string;
    /** 项目目录 */
    projectDir: string;
    /** 创建时间 */
    createdAt: number;
    /** 更新时间 */
    updatedAt: number;
    /** 文件索引映射（相对路径 → FileIndex） */
    files: Record<string, FileIndex>;
    /** 反向依赖图：文件 → 导入它的文件列表（相对路径） */
    reverseImports: Record<string, string[]>;
    /** 路由表 */
    routes: RouteInfo[];
}

// ── 核心类 ─────────────────────────────────────────────────────────────────

export class ProjectIndexer {
    private index: ProjectIndex;
    private indexDir: string;
    private indexFilePath: string;
    private projectDir: string;

    constructor(projectDir: string) {
        this.projectDir = resolve(projectDir);
        this.indexDir = resolve(this.projectDir, INDEX_DIR);
        this.indexFilePath = resolve(this.indexDir, INDEX_FILE);
        this.index = this.loadIndex();
    }

    // ── 状态查询 ──────────────────────────────────────────────────────────

    /** 索引是否有效（版本匹配且有数据） */
    isValid(): boolean {
        return (
            this.index.version === INDEX_VERSION &&
            this.index.projectDir === this.projectDir &&
            Object.keys(this.index.files).length > 0
        );
    }

    /** 获取索引统计 */
    getStats(): { files: number; routes: number; symbols: number } {
        let symbolCount = 0;
        for (const file of Object.values(this.index.files)) {
            symbolCount += file.symbols.length;
        }
        return {
            files: Object.keys(this.index.files).length,
            routes: this.index.routes.length,
            symbols: symbolCount,
        };
    }

    // ── 变更检测 ──────────────────────────────────────────────────────────

    /**
     * 对比当前文件系统与索引，返回变更文件列表
     * @param files 当前项目中的文件列表（绝对路径）
     * @returns 变更/新增/删除的文件列表（绝对路径）
     */
    getChangedFiles(files: string[]): { changed: string[]; deleted: string[] } {
        const indexedPaths = new Set(Object.keys(this.index.files));
        const currentPaths = new Set<string>();
        const changed: string[] = [];

        for (const file of files) {
            const relPath = relative(this.projectDir, file);
            currentPaths.add(relPath);

            const fileIndex = this.index.files[relPath];
            try {
                const content = readFileSync(file, "utf-8");
                const hash = this.computeHash(content);
                if (!fileIndex || fileIndex.hash !== hash) {
                    changed.push(file);
                }
            } catch {
                // 读取失败视为变更
                changed.push(file);
            }
        }

        // 检测已删除的文件
        const deleted: string[] = [];
        for (const relPath of indexedPaths) {
            if (!currentPaths.has(relPath)) {
                deleted.push(resolve(this.projectDir, relPath));
            }
        }

        return { changed, deleted };
    }

    // ── 索引构建 ──────────────────────────────────────────────────────────

    /**
     * 全量建立索引
     * @param files 项目源文件列表（绝对路径）
     */
    async buildIndex(files: string[]): Promise<void> {
        this.index = {
            version: INDEX_VERSION,
            projectDir: this.projectDir,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            files: {},
            reverseImports: {},
            routes: [],
        };

        // 批量索引文件
        for (const file of files) {
            await this._indexSingleFile(file);
        }

        this.buildReverseImports();
        this.save();
    }

    /**
     * 增量更新索引
     * @param changedFiles 变更文件列表（绝对路径）
     * @param deletedFiles 已删除文件列表（绝对路径）
     */
    async updateIndex(changedFiles: string[], deletedFiles: string[] = []): Promise<void> {
        // 移除已删除的文件
        for (const file of deletedFiles) {
            const relPath = relative(this.projectDir, file);
            const fileIndex = this.index.files[relPath];
            delete this.index.files[relPath];

            // 同时从路由表中移除
            if (fileIndex?.route) {
                this.index.routes = this.index.routes.filter((r) => r.file !== relPath);
            }
        }

        // 更新变更文件
        for (const file of changedFiles) {
            // 如果旧索引中有路由，先从路由表中移除
            const oldRelPath = relative(this.projectDir, file);
            if (this.index.files[oldRelPath]?.route) {
                this.index.routes = this.index.routes.filter((r) => r.file !== oldRelPath);
            }
            await this._indexSingleFile(file);
        }

        this.buildReverseImports();
        this.index.updatedAt = Date.now();
        this.save();
    }

    // ── 依赖图查询 ────────────────────────────────────────────────────────

    /**
     * 获取导入某个文件的所有文件（上游依赖方）
     * @param filePath 文件绝对路径
     * @returns 导入该文件的文件列表（绝对路径）
     */
    getImporters(filePath: string): string[] {
        const relPath = relative(this.projectDir, filePath);
        const importers = this.index.reverseImports[relPath] || [];
        return importers.map((p) => resolve(this.projectDir, p));
    }

    /**
     * 获取文件的直接依赖（下游）
     * @param filePath 文件绝对路径
     * @returns 该文件导入的文件列表（绝对路径）
     */
    getDependencies(filePath: string): string[] {
        const relPath = relative(this.projectDir, filePath);
        const fileIndex = this.index.files[relPath];
        if (!fileIndex) return [];
        return fileIndex.imports.map((p) => resolve(this.projectDir, p));
    }

    /**
     * 获取文件的完整依赖链（递归上游）
     * @param filePath 文件绝对路径
     * @returns 所有导入该文件的文件（包括间接导入）
     */
    getTransitiveImporters(filePath: string): string[] {
        const relPath = relative(this.projectDir, filePath);
        const result = new Set<string>();
        const queue = [relPath];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;
            visited.add(current);

            const importers = this.index.reverseImports[current] || [];
            for (const importer of importers) {
                result.add(importer);
                queue.push(importer);
            }
        }

        return Array.from(result).map((p) => resolve(this.projectDir, p));
    }

    // ── 路由查询 ──────────────────────────────────────────────────────────

    /** 获取项目路由表 */
    getRoutes(): RouteInfo[] {
        return [...this.index.routes];
    }

    /** 按路径查找路由 */
    findRouteByPath(path: string): RouteInfo | undefined {
        return this.index.routes.find((r) => r.path === path);
    }

    /** 按组件名查找路由 */
    findRouteByComponent(component: string): RouteInfo | undefined {
        return this.index.routes.find((r) => r.component === component);
    }

    // ── 符号查询 ──────────────────────────────────────────────────────────

    /** 获取文件中的符号列表 */
    getSymbols(filePath: string): SymbolInfo[] {
        const relPath = relative(this.projectDir, filePath);
        return this.index.files[relPath]?.symbols || [];
    }

    /** 搜索项目中定义的符号 */
    findSymbol(name: string): { file: string; symbol: SymbolInfo }[] {
        const results: { file: string; symbol: SymbolInfo }[] = [];
        for (const [relPath, fileIndex] of Object.entries(this.index.files)) {
            for (const symbol of fileIndex.symbols) {
                if (symbol.name === name) {
                    results.push({ file: resolve(this.projectDir, relPath), symbol });
                }
            }
        }
        return results;
    }

    /** 获取文件的导出列表 */
    getExports(filePath: string): string[] {
        const relPath = relative(this.projectDir, filePath);
        return this.index.files[relPath]?.exports || [];
    }

    // ── 索引持久化 ────────────────────────────────────────────────────────

    /** 保存索引到磁盘 */
    save(): void {
        try {
            if (!existsSync(this.indexDir)) {
                mkdirSync(this.indexDir, { recursive: true });
            }
            writeFileSync(this.indexFilePath, JSON.stringify(this.index, null, 2), "utf-8");
        } catch {
            // 保存失败静默处理
        }
    }

    /** 清理索引（删除所有索引数据） */
    clean(): void {
        this.index = {
            version: INDEX_VERSION,
            projectDir: this.projectDir,
            createdAt: 0,
            updatedAt: 0,
            files: {},
            reverseImports: {},
            routes: [],
        };
        this.save();
    }

    // ── 私有方法 ──────────────────────────────────────────────────────────

    /** 索引单个文件 */
    private async _indexSingleFile(filePath: string): Promise<void> {
        try {
            const content = readFileSync(filePath, "utf-8");
            const relPath = relative(this.projectDir, filePath);
            const hash = this.computeHash(content);
            const ext = extname(filePath);

            // 解析 AST
            const ast = parseAST(content, { ext });

            // 提取 imports
            const importInfos = ast ? getImports(ast) : [];
            const imports = this.resolveImports(filePath, importInfos);

            // 提取 exports 和 symbols
            const { exports, symbols } = this.extractSymbols(ast, content);

            // 检测路由
            const route = this.detectRoute(filePath, content);

            this.index.files[relPath] = {
                path: relPath,
                hash,
                indexedAt: Date.now(),
                imports,
                exports,
                symbols,
                route,
            };

            // 如果是路由，加入路由表
            if (route) {
                const existingIndex = this.index.routes.findIndex((r) => r.file === relPath);
                if (existingIndex >= 0) {
                    this.index.routes[existingIndex] = route;
                } else {
                    this.index.routes.push(route);
                }
            }
        } catch {
            // 索引失败静默处理
        }
    }

    /** 解析 import 路径为相对路径 */
    private resolveImports(filePath: string, imports: ImportInfo[]): string[] {
        const resolved: string[] = [];
        const baseDir = dirname(filePath);

        for (const imp of imports) {
            if (imp.source.startsWith(".")) {
                const resolvedPath = this.resolveImportPath(baseDir, imp.source);
                if (resolvedPath) {
                    const relPath = relative(this.projectDir, resolvedPath);
                    resolved.push(relPath);
                }
            }
        }

        return resolved;
    }

    /** 解析 import 源路径为绝对路径 */
    private resolveImportPath(baseDir: string, source: string): string | undefined {
        const exts = [".ts", ".tsx", ".js", ".jsx", ".vue"];

        // 直接尝试（含扩展名）
        for (const ext of exts) {
            const path = resolve(baseDir, source + ext);
            if (existsSync(path)) return path;
        }

        // 尝试 index 文件
        for (const ext of exts) {
            const path = resolve(baseDir, source, "index" + ext);
            if (existsSync(path)) return path;
        }

        return undefined;
    }

    /** 从 AST 提取符号信息 */
    private extractSymbols(ast: ParseResult<BabelFile> | null, content: string): { exports: string[]; symbols: SymbolInfo[] } {
        const exports: string[] = [];
        const symbols: SymbolInfo[] = [];

        if (!ast) return { exports, symbols };

        // 导出声明
        walkAST(ast, "ExportNamedDeclaration", (node: any) => {
            if (node.declaration) {
                if (node.declaration.id?.name) {
                    // FunctionDeclaration / ClassDeclaration
                    const name = node.declaration.id.name;
                    exports.push(name);
                    symbols.push({
                        name,
                        kind: this.inferSymbolKind(node.declaration),
                        line: node.loc?.start?.line || 0,
                        column: node.loc?.start?.column || 0,
                    });
                } else if (node.declaration.declarations) {
                    // VariableDeclaration: export const x = 1, y = 2
                    for (const decl of node.declaration.declarations) {
                        if (decl.id?.name) {
                            const name = decl.id.name;
                            exports.push(name);
                            symbols.push({
                                name,
                                kind: "variable",
                                line: decl.loc?.start?.line || node.loc?.start?.line || 0,
                                column: decl.loc?.start?.column || node.loc?.start?.column || 0,
                            });
                        }
                    }
                }
            }
            for (const spec of node.specifiers || []) {
                if (spec.exported?.name) {
                    exports.push(spec.exported.name);
                }
            }
        });

        // 默认导出
        walkAST(ast, "ExportDefaultDeclaration", (node: any) => {
            if (node.declaration?.id?.name) {
                exports.push(node.declaration.id.name);
            } else {
                exports.push("default");
            }
        });

        // 检测 hooks（useXxx 命名约定）
        const hookPattern = /(?:^|\s)(use[A-Z][a-zA-Z0-9]*)\s*\(/g;
        let match: RegExpExecArray | null;
        while ((match = hookPattern.exec(content)) !== null) {
            const name = match[1];
            if (!symbols.find((s) => s.name === name)) {
                const before = content.slice(0, match.index);
                const line = before.split("\n").length;
                const lastNewline = before.lastIndexOf("\n");
                const column = lastNewline >= 0 ? match.index - lastNewline : match.index + 1;
                symbols.push({
                    name,
                    kind: "hook",
                    line,
                    column,
                });
            }
        }

        // 检测组件（大写开头的函数声明）
        walkAST(ast, "FunctionDeclaration", (node: any) => {
            const name = node.id?.name;
            if (name && /^[A-Z]/.test(name) && !symbols.find((s) => s.name === name)) {
                symbols.push({
                    name,
                    kind: "component",
                    line: node.loc?.start?.line || 0,
                    column: node.loc?.start?.column || 0,
                });
            }
        });

        // 检测组件（大写开头的箭头函数变量）
        walkAST(ast, "VariableDeclarator", (node: any) => {
            const name = node.id?.name;
            if (name && /^[A-Z]/.test(name) && node.init?.type === "ArrowFunctionExpression") {
                if (!symbols.find((s) => s.name === name)) {
                    symbols.push({
                        name,
                        kind: "component",
                        line: node.loc?.start?.line || 0,
                        column: node.loc?.start?.column || 0,
                    });
                }
            }
        });

        return { exports, symbols };
    }

    /** 推断符号类型 */
    private inferSymbolKind(node: any): SymbolInfo["kind"] {
        switch (node.type) {
            case "FunctionDeclaration":
            case "ArrowFunctionExpression":
                return "function";
            case "ClassDeclaration":
                return "class";
            default:
                return "variable";
        }
    }

    // ── 路由检测 ──────────────────────────────────────────────────────────

    /** 检测文件是否包含路由定义 */
    private detectRoute(filePath: string, content: string): RouteInfo | undefined {
        const relPath = relative(this.projectDir, filePath);
        const baseName = basename(filePath);

        // Next.js: pages/ 或 app/ 目录
        if (relPath.startsWith("pages/") || relPath.startsWith("app/")) {
            return this.parseNextJsRoute(relPath);
        }

        // Nuxt: pages/ 目录
        if (relPath.startsWith("pages/") && (baseName.endsWith(".vue") || baseName.endsWith(".ts"))) {
            return this.parseNuxtRoute(relPath);
        }

        // UniApp: pages.json
        if (baseName === "pages.json") {
            return this.parseUniAppRoutes(content, relPath);
        }

        // React Router 配置
        if (content.includes("react-router") || content.includes("createBrowserRouter")) {
            return this.parseReactRouterConfig(content, relPath);
        }

        // Vue Router 配置
        if (content.includes("vue-router") || content.includes("createRouter")) {
            return this.parseVueRouterConfig(content, relPath);
        }

        return undefined;
    }

    private parseNextJsRoute(relPath: string): RouteInfo | undefined {
        let routePath = relPath
            .replace(/^pages\//, "")
            .replace(/^app\//, "")
            .replace(/\/page\.(tsx|jsx|ts|js)$/, "")
            .replace(/\.(tsx|jsx|ts|js|vue)$/, "")
            .replace(/\[([^\]]+)\]/g, ":$1")
            .replace(/index$/, "");

        if (!routePath.startsWith("/")) routePath = "/" + routePath;
        if (routePath === "/" || routePath === "") routePath = "/";

        return {
            path: routePath,
            file: relPath,
            framework: "nextjs",
        };
    }

    private parseNuxtRoute(relPath: string): RouteInfo | undefined {
        let routePath = relPath
            .replace(/^pages\//, "")
            .replace(/\.(vue|ts|js)$/, "")
            .replace(/\[([^\]]+)\]/g, ":$1")
            .replace(/index$/, "");

        if (!routePath.startsWith("/")) routePath = "/" + routePath;

        return {
            path: routePath,
            file: relPath,
            framework: "nuxt",
        };
    }

    private parseUniAppRoutes(content: string, relPath: string): RouteInfo | undefined {
        try {
            const config = JSON.parse(content);
            if (config.pages && Array.isArray(config.pages)) {
                // 返回第一个页面作为代表，详细路由在路由表中展开
                const firstPage = config.pages[0];
                if (firstPage?.path) {
                    return {
                        path: "/" + firstPage.path,
                        file: relPath,
                        framework: "uniapp",
                    };
                }
            }
        } catch {
            // JSON 解析失败
        }
        return undefined;
    }

    private parseReactRouterConfig(content: string, relPath: string): RouteInfo | undefined {
        // 简化：检测 Route 组件或 createBrowserRouter
        const pathMatch = content.match(/path\s*:\s*["']([^"']+)["']/);
        if (pathMatch) {
            const componentMatch = content.match(/element\s*:\s*<?\s*([A-Z][a-zA-Z0-9]*)/);
            return {
                path: pathMatch[1],
                component: componentMatch?.[1],
                file: relPath,
                framework: "react-router",
            };
        }
        return undefined;
    }

    private parseVueRouterConfig(content: string, relPath: string): RouteInfo | undefined {
        const pathMatch = content.match(/path\s*:\s*["']([^"']+)["']/);
        if (pathMatch) {
            const componentMatch = content.match(/component\s*:\s*['"]?([^'"]+)['"]?/);
            return {
                path: pathMatch[1],
                component: componentMatch?.[1],
                file: relPath,
                framework: "vue-router",
            };
        }
        return undefined;
    }

    // ── 依赖图构建 ────────────────────────────────────────────────────────

    /** 构建反向依赖图（文件 → 导入它的文件） */
    private buildReverseImports(): void {
        this.index.reverseImports = {};

        for (const [filePath, fileIndex] of Object.entries(this.index.files)) {
            for (const imp of fileIndex.imports) {
                if (!this.index.reverseImports[imp]) {
                    this.index.reverseImports[imp] = [];
                }
                if (!this.index.reverseImports[imp].includes(filePath)) {
                    this.index.reverseImports[imp].push(filePath);
                }
            }
        }
    }

    // ── 工具方法 ──────────────────────────────────────────────────────────

    /** 计算文件内容 SHA-256 哈希（取前 16 位） */
    private computeHash(content: string): string {
        return createHash("sha256").update(content).digest("hex").slice(0, 16);
    }

    /** 加载索引 */
    private loadIndex(): ProjectIndex {
        try {
            if (existsSync(this.indexFilePath)) {
                const raw = readFileSync(this.indexFilePath, "utf-8");
                const index = JSON.parse(raw) as ProjectIndex;
                if (index.version === INDEX_VERSION && index.projectDir === this.projectDir) {
                    return index;
                }
            }
        } catch {
            // 加载失败
        }

        return {
            version: INDEX_VERSION,
            projectDir: this.projectDir,
            createdAt: 0,
            updatedAt: 0,
            files: {},
            reverseImports: {},
            routes: [],
        };
    }
}
