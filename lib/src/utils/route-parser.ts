/**
 * RouteParser — 框架路由自动解析（v3.7.0）
 *
 * 自动检测并解析多种前端框架的路由配置：
 * - Next.js (pages/ | app/)
 * - Nuxt (pages/)
 * - React Router (配置式路由)
 * - Vue Router (配置式路由)
 * - UniApp (pages.json)
 * - Taro (app.config.js | pages.json)
 *
 * 输出统一格式的 RouteInfo，供索引器和 E2E 覆盖缺口检测使用。
 */

import { relative, basename, extname } from "node:path";
import { readFileSync } from "node:fs";
import type { RouteInfo } from "@/engine/indexer.js";

export type Framework = "nextjs" | "nuxt" | "react-router" | "vue-router" | "uniapp" | "taro" | "unknown";

export interface ParsedRoutes {
    framework: Framework;
    routes: RouteInfo[];
}

// ── 入口检测 ──────────────────────────────────────────────────────────────

/**
 * 检测项目使用的路由框架
 * 基于文件路径和目录结构推断
 */
export function detectRouteFramework(projectDir: string, filePath: string): Framework {
    const relPath = relative(projectDir, filePath);
    const baseName = basename(filePath);

    // Nuxt (优先检测 .vue 文件)
    if (relPath.startsWith("pages/") && baseName.endsWith(".vue")) {
        return "nuxt";
    }

    // Next.js
    if (relPath.startsWith("pages/") || relPath.startsWith("app/")) {
        return "nextjs";
    }

    // Nuxt (.ts/.js 文件)
    if (relPath.startsWith("pages/") && (baseName.endsWith(".ts") || baseName.endsWith(".js"))) {
        return "nuxt";
    }

    // UniApp
    if (baseName === "pages.json") {
        return "uniapp";
    }

    // Taro
    if (baseName === "app.config.js" || baseName === "app.config.ts") {
        return "taro";
    }

    // Vue Router 配置（优先检测，避免 router.ts 被 route 匹配）
    if (baseName.includes("router") && (baseName.endsWith(".ts") || baseName.endsWith(".js"))) {
        return "vue-router";
    }

    // React Router 配置
    if (baseName.includes("route") && (baseName.endsWith(".ts") || baseName.endsWith(".js") || baseName.endsWith(".tsx") || baseName.endsWith(".jsx"))) {
        return "react-router";
    }

    return "unknown";
}

// ── 路由解析 ──────────────────────────────────────────────────────────────

/**
 * 解析文件中的路由定义
 * @param projectDir 项目根目录
 * @param filePath 文件绝对路径
 * @param content 文件内容（可选，不传则自动读取）
 * @returns 解析出的路由列表
 */
export function parseRoutes(
    projectDir: string,
    filePath: string,
    content?: string
): ParsedRoutes {
    const framework = detectRouteFramework(projectDir, filePath);
    const source = content ?? readFileSync(filePath, "utf-8");
    const relPath = relative(projectDir, filePath);

    switch (framework) {
        case "nextjs":
            return { framework, routes: parseNextJsRoutes(relPath) };
        case "nuxt":
            return { framework, routes: parseNuxtRoutes(relPath) };
        case "uniapp":
            return { framework, routes: parseUniAppRoutes(source, relPath) };
        case "taro":
            return { framework, routes: parseTaroRoutes(source, relPath) };
        case "react-router":
            return { framework, routes: parseReactRouterConfig(source, relPath) };
        case "vue-router":
            return { framework, routes: parseVueRouterConfig(source, relPath) };
        default:
            return { framework: "unknown", routes: [] };
    }
}

// ── Next.js ───────────────────────────────────────────────────────────────

/**
 * 解析 Next.js 文件系统路由
 * pages/index.tsx       → /
 * pages/about.tsx       → /about
 * pages/blog/[slug].tsx → /blog/:slug
 * pages/blog/[...slug]  → /blog/*
 * app/blog/page.tsx     → /blog
 */
export function parseNextJsRoutes(relPath: string): RouteInfo[] {
    const routes: RouteInfo[] = [];

    // 只处理 pages/ 或 app/ 目录下的文件
    if (!relPath.startsWith("pages/") && !relPath.startsWith("app/")) {
        return routes;
    }

    // 忽略非页面文件
    const ext = extname(relPath);
    if (![".tsx", ".jsx", ".ts", ".js"].includes(ext)) {
        return routes;
    }

    let routePath = relPath;

    if (relPath.startsWith("pages/")) {
        routePath = relPath
            .replace(/^pages\//, "")
            .replace(ext, "")
            .replace(/\[\.\.\.([^\]]+)\]/g, ":$1*")   // [...slug] → :slug*
            .replace(/\[\[([^\]]+)\]\]/g, ":$1?")      // [[slug]] → :slug?
            .replace(/\[([^\]]+)\]/g, ":$1");          // [slug] → :slug
    } else if (relPath.startsWith("app/")) {
        routePath = relPath
            .replace(/^app\//, "")
            .replace(/\/page\.(tsx|jsx|ts|js)$/, "")
            .replace(/\/layout\.(tsx|jsx|ts|js)$/, "")
            .replace(/\/loading\.(tsx|jsx|ts|js)$/, "")
            .replace(/\/error\.(tsx|jsx|ts|js)$/, "")
            .replace(/\[\.\.\.([^\]]+)\]/g, ":$1*")
            .replace(/\[\[([^\]]+)\]\]/g, ":$1?")
            .replace(/\[([^\]]+)\]/g, ":$1");
    }

    // 忽略特殊文件
    if (routePath.startsWith("_") || routePath.includes("/_")) {
        return routes;
    }

    // 构建最终路径
    if (!routePath.startsWith("/")) {
        routePath = "/" + routePath;
    }
    if (routePath.endsWith("/index")) {
        routePath = routePath.slice(0, -5); // 移除末尾的 index
    }
    if (routePath === "" || routePath === "/") {
        routePath = "/";
    }

    routes.push({
        path: routePath,
        file: relPath,
        framework: "nextjs",
    });

    return routes;
}

// ── Nuxt ──────────────────────────────────────────────────────────────────

/**
 * 解析 Nuxt 文件系统路由
 * pages/index.vue       → /
 * pages/about.vue       → /about
 * pages/blog/[slug].vue → /blog/:slug
 * pages/blog/[...slug]  → /blog/:slug(.*)
 */
export function parseNuxtRoutes(relPath: string): RouteInfo[] {
    const routes: RouteInfo[] = [];

    if (!relPath.startsWith("pages/")) {
        return routes;
    }

    const ext = extname(relPath);
    if (![".vue", ".ts", ".js"].includes(ext)) {
        return routes;
    }

    let routePath = relPath
        .replace(/^pages\//, "")
        .replace(ext, "")
        .replace(/\[\.\.\.([^\]]+)\]/g, ":$1(.*)")    // [...slug] → :slug(.*)
        .replace(/\[\[([^\]]+)\]\]/g, ":$1?")          // [[slug]] → :slug?
        .replace(/\[([^\]]+)\]/g, ":$1");               // [slug] → :slug

    if (!routePath.startsWith("/")) {
        routePath = "/" + routePath;
    }
    if (routePath.endsWith("/index")) {
        routePath = routePath.slice(0, -5);
    }
    if (routePath === "" || routePath === "/") {
        routePath = "/";
    }

    routes.push({
        path: routePath,
        file: relPath,
        framework: "nuxt",
    });

    return routes;
}

// ── UniApp ────────────────────────────────────────────────────────────────

/**
 * 解析 UniApp pages.json
 */
export function parseUniAppRoutes(content: string, relPath: string): RouteInfo[] {
    const routes: RouteInfo[] = [];

    try {
        const config = JSON.parse(content);

        // 主包页面
        if (config.pages && Array.isArray(config.pages)) {
            for (const page of config.pages) {
                if (page.path) {
                    routes.push({
                        path: "/" + page.path,
                        file: relPath,
                        framework: "uniapp",
                    });
                }
            }
        }

        // 分包页面
        if (config.subPackages && Array.isArray(config.subPackages)) {
            for (const pkg of config.subPackages) {
                const root = pkg.root || "";
                if (pkg.pages && Array.isArray(pkg.pages)) {
                    for (const page of pkg.pages) {
                        const pagePath = typeof page === "string" ? page : page.path;
                        if (pagePath) {
                            routes.push({
                                path: "/" + root + "/" + pagePath,
                                file: relPath,
                                framework: "uniapp",
                            });
                        }
                    }
                }
            }
        }
    } catch {
        // JSON 解析失败，忽略
    }

    return routes;
}

// ── Taro ──────────────────────────────────────────────────────────────────

/**
 * 解析 Taro app.config.js / app.config.ts
 */
export function parseTaroRoutes(content: string, relPath: string): RouteInfo[] {
    const routes: RouteInfo[] = [];

    // 尝试从 JS/TS 文件中提取 pages 数组
    const pagesMatch = content.match(/pages\s*:\s*(\[[\s\S]*?\])/);
    if (pagesMatch) {
        try {
            // 安全解析：只提取字符串数组
            const pagePaths = pagesMatch[1].match(/['"]([^'"]+)['"]/g);
            if (pagePaths) {
                for (const p of pagePaths) {
                    const path = p.replace(/['"]/g, "").trim();
                    if (path) {
                        routes.push({
                            path: "/" + path,
                            file: relPath,
                            framework: "taro",
                        });
                    }
                }
            }
        } catch {
            // 解析失败
        }
    }

    return routes;
}

// ── React Router ──────────────────────────────────────────────────────────

/**
 * 解析 React Router 配置式路由
 * 支持 Route 组件和 createBrowserRouter/createRoutesFromElements
 */
export function parseReactRouterConfig(content: string, relPath: string): RouteInfo[] {
    const routes: RouteInfo[] = [];

    // 匹配 path + element/component 模式
    // path: "/about", element: <About />
    // { path: "/", element: <Home /> }
    // <Route path="/about" element={<About />} />

    const routeRegex = /path\s*:\s*["']([^"']+)["']|path\s*=\s*["']([^"']+)["']/g;
    let match: RegExpExecArray | null;

    while ((match = routeRegex.exec(content)) !== null) {
        const path = match[1] || match[2];
        if (!path) continue;

        // 尝试在当前位置后查找组件名
        const after = content.slice(match.index, Math.min(match.index + 200, content.length));
        const componentMatch = after.match(/element\s*[:=]\s*[<{]?\s*([A-Z][a-zA-Z0-9]*)/);

        routes.push({
            path,
            component: componentMatch?.[1],
            file: relPath,
            framework: "react-router",
        });
    }

    return routes;
}

// ── Vue Router ────────────────────────────────────────────────────────────

/**
 * 解析 Vue Router 配置
 * { path: '/about', component: About }
 * { path: '/user/:id', component: () => import('./User.vue') }
 */
export function parseVueRouterConfig(content: string, relPath: string): RouteInfo[] {
    const routes: RouteInfo[] = [];

    const routeRegex = /path\s*:\s*["']([^"']+)["']/g;
    let match: RegExpExecArray | null;

    while ((match = routeRegex.exec(content)) !== null) {
        const path = match[1];
        if (!path) continue;

        const after = content.slice(match.index, Math.min(match.index + 300, content.length));
        const componentMatch = after.match(/component\s*:\s*(?:\(\s*\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)|([A-Z][a-zA-Z0-9]*))/);

        routes.push({
            path,
            component: componentMatch?.[1] || componentMatch?.[2],
            file: relPath,
            framework: "vue-router",
        });
    }

    return routes;
}

// ── 批量解析 ──────────────────────────────────────────────────────────────

/**
 * 批量解析项目中的所有路由
 * @param projectDir 项目根目录
 * @param filePaths 要扫描的文件列表（相对路径）
 * @returns 所有解析出的路由（按框架分组）
 */
export function parseAllRoutes(projectDir: string, filePaths: string[]): Map<Framework, RouteInfo[]> {
    const result = new Map<Framework, RouteInfo[]>();

    for (const relPath of filePaths) {
        const framework = detectRouteFramework(projectDir, relPath);
        if (framework === "unknown") continue;

        try {
            const content = readFileSync(resolve(projectDir, relPath), "utf-8");
            const parsed = parseRoutes(projectDir, relPath, content);

            if (parsed.routes.length > 0) {
                const existing = result.get(framework) || [];
                result.set(framework, [...existing, ...parsed.routes]);
            }
        } catch {
            // 读取失败则跳过
        }
    }

    return result;
}

import { resolve } from "node:path";

/**
 * 查找项目中可能包含路由定义的文件
 * @param projectDir 项目根目录
 * @returns 可能的文件列表（相对路径）
 */
export function findRouteFiles(projectDir: string): string[] {
    const patterns = [
        "pages.json",
        "app.config.js",
        "app.config.ts",
        "src/router/**/*.{ts,js}",
        "src/routes/**/*.{ts,js}",
        "router/**/*.{ts,js}",
        "routes/**/*.{ts,js}",
    ];

    const found: string[] = [];

    for (const pattern of patterns) {
        try {
            const { globbySync } = require("globby");
            const matches = globbySync(pattern, {
                cwd: projectDir,
                absolute: false,
            });
            found.push(...matches);
        } catch {
            // globby 不可用则跳过
        }
    }

    // 自动检测 pages/ 和 app/ 目录
    try {
        const { readdirSync, statSync } = require("node:fs");
        const dirs = ["pages", "app"];
        for (const dir of dirs) {
            const fullDir = resolve(projectDir, dir);
            if (statSync(fullDir).isDirectory()) {
                // 找到该目录下的所有文件
                const collect = (d: string) => {
                    const entries = readdirSync(d, { withFileTypes: true });
                    for (const entry of entries) {
                        const full = resolve(d, entry.name);
                        if (entry.isDirectory()) {
                            collect(full);
                        } else {
                            found.push(relative(projectDir, full));
                        }
                    }
                };
                collect(fullDir);
            }
        }
    } catch {
        // 目录不存在
    }

    return [...new Set(found)];
}
