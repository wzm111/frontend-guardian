/**
 * Monorepo 工作区检测与解析
 *
 * v2.9.0 功能：
 * 1. 自动检测 monorepo 工具（pnpm / lerna / nx / yarn / npm workspaces）
 * 2. 解析 workspace 配置，获取所有子包路径
 * 3. 读取子包 package.json 元数据
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { globbySync } from "globby";

/** 支持的 monorepo 工具 */
export type MonorepoTool = "pnpm-workspace" | "lerna" | "nx" | "yarn-workspaces" | "npm-workspaces" | "rush" | "none";

/** Workspace 子包信息 */
export interface WorkspacePackage {
    /** 子包名称 */
    name: string;
    /** 子包目录（相对项目根目录） */
    path: string;
    /** 子包绝对路径 */
    absolutePath: string;
    /** package.json 中的版本 */
    version?: string;
    /** 依赖列表 */
    dependencies?: string[];
    /** devDependencies 列表 */
    devDependencies?: string[];
    /** peerDependencies 列表 */
    peerDependencies?: string[];
    /** 是否是 private 包 */
    private?: boolean;
}

/** Monorepo 检测结果 */
export interface MonorepoInfo {
    /** 是否是 monorepo */
    isMonorepo: boolean;
    /** 检测到的工具 */
    tool: MonorepoTool;
    /** 工具配置文件路径 */
    configPath?: string;
    /** 项目根目录 */
    rootDir: string;
    /** 所有子包 */
    packages: WorkspacePackage[];
    /** workspace 中包含的 glob 模式 */
    patterns?: string[];
}

/** 检测项目是否为 monorepo */
export function detectMonorepo(projectDir: string): MonorepoInfo {
    // 按优先级检测各种工具
    const pnpmWorkspace = resolve(projectDir, "pnpm-workspace.yaml");
    if (existsSync(pnpmWorkspace)) {
        return parsePnpmWorkspace(projectDir, pnpmWorkspace);
    }

    const lernaJson = resolve(projectDir, "lerna.json");
    if (existsSync(lernaJson)) {
        return parseLernaWorkspace(projectDir, lernaJson);
    }

    const nxJson = resolve(projectDir, "nx.json");
    if (existsSync(nxJson)) {
        return parseNxWorkspace(projectDir, nxJson);
    }

    const rushJson = resolve(projectDir, "rush.json");
    if (existsSync(rushJson)) {
        return parseRushWorkspace(projectDir, rushJson);
    }

    const packageJsonPath = resolve(projectDir, "package.json");
    if (existsSync(packageJsonPath)) {
        const pkg = readPackageJson(packageJsonPath);
        // npm / yarn workspaces
        if (pkg.workspaces) {
            return parseNpmWorkspaces(projectDir, pkg);
        }
    }

    return {
        isMonorepo: false,
        tool: "none",
        rootDir: projectDir,
        packages: [],
    };
}

/** 解析 pnpm-workspace.yaml */
function parsePnpmWorkspace(rootDir: string, configPath: string): MonorepoInfo {
    const content = readFileSync(configPath, "utf-8");
    const patterns: string[] = [];

    // 简单 YAML 解析：提取 packages 字段
    const packagesMatch = content.match(/packages:\s*\n((?:\s*-\s*[^\n]+\n?)*)/);
    if (packagesMatch) {
        const lines = packagesMatch[1].split("\n");
        for (const line of lines) {
            const match = line.match(/^\s*-\s*(.+)$/);
            if (match) {
                patterns.push(match[1].trim());
            }
        }
    }

    // 也支持单行格式 packages: ['apps/*', 'packages/*']
    const inlineMatch = content.match(/packages:\s*\[([^\]]+)\]/);
    if (inlineMatch) {
        const items = inlineMatch[1].split(",").map((s) => s.trim().replace(/['"]/g, ""));
        patterns.push(...items);
    }

    const packages = resolveWorkspacePackages(rootDir, patterns);

    return {
        isMonorepo: true,
        tool: "pnpm-workspace",
        configPath,
        rootDir,
        packages,
        patterns,
    };
}

/** 解析 lerna.json */
function parseLernaWorkspace(rootDir: string, configPath: string): MonorepoInfo {
    try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        const patterns: string[] = config.packages || ["packages/*"];
        const packages = resolveWorkspacePackages(rootDir, patterns);

        return {
            isMonorepo: true,
            tool: "lerna",
            configPath,
            rootDir,
            packages,
            patterns,
        };
    } catch {
        return { isMonorepo: false, tool: "none", rootDir, packages: [] };
    }
}

/** 解析 nx.json */
function parseNxWorkspace(rootDir: string, configPath: string): MonorepoInfo {
    try {
        // nx 使用 workspace.json 或 angular.json 定义项目
        const workspaceJsonPath = resolve(rootDir, "workspace.json");
        const angularJsonPath = resolve(rootDir, "angular.json");

        let projects: Record<string, string> = {};

        if (existsSync(workspaceJsonPath)) {
            const ws = JSON.parse(readFileSync(workspaceJsonPath, "utf-8"));
            projects = ws.projects || {};
        } else if (existsSync(angularJsonPath)) {
            const ng = JSON.parse(readFileSync(angularJsonPath, "utf-8"));
            projects = ng.projects || {};
        }

        const packages: WorkspacePackage[] = [];
        for (const [name, projectPath] of Object.entries(projects)) {
            const absPath = resolve(rootDir, projectPath as string);
            const pkgJsonPath = resolve(absPath, "package.json");
            if (existsSync(pkgJsonPath)) {
                const pkg = readPackageJson(pkgJsonPath);
                packages.push(createWorkspacePackage(pkg, projectPath as string, absPath));
            } else {
                packages.push({
                    name,
                    path: projectPath as string,
                    absolutePath: absPath,
                });
            }
        }

        return {
            isMonorepo: true,
            tool: "nx",
            configPath,
            rootDir,
            packages,
        };
    } catch {
        return { isMonorepo: false, tool: "none", rootDir, packages: [] };
    }
}

/** 解析 rush.json */
function parseRushWorkspace(rootDir: string, configPath: string): MonorepoInfo {
    try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        const projects = config.projects || [];
        const patterns: string[] = projects.map((p: { projectFolder: string }) => p.projectFolder);
        const packages = resolveWorkspacePackages(rootDir, patterns);

        return {
            isMonorepo: true,
            tool: "rush",
            configPath,
            rootDir,
            packages,
            patterns,
        };
    } catch {
        return { isMonorepo: false, tool: "none", rootDir, packages: [] };
    }
}

/** 解析 npm / yarn workspaces */
function parseNpmWorkspaces(rootDir: string, pkg: Record<string, unknown>): MonorepoInfo {
    const workspaces = pkg.workspaces;
    let patterns: string[] = [];

    if (Array.isArray(workspaces)) {
        patterns = workspaces;
    } else if (typeof workspaces === "object" && workspaces !== null) {
        patterns = (workspaces as { packages?: string[] }).packages || [];
    }

    const packages = resolveWorkspacePackages(rootDir, patterns);
    const tool = pkg.packageManager?.toString().startsWith("pnpm") ? "pnpm-workspace" : "yarn-workspaces";

    return {
        isMonorepo: true,
        tool: packages.length > 0 ? tool : "npm-workspaces",
        rootDir,
        packages,
        patterns,
    };
}

/** 根据 glob 模式解析 workspace 包 */
function resolveWorkspacePackages(rootDir: string, patterns: string[]): WorkspacePackage[] {
    const packages: WorkspacePackage[] = [];
    const seen = new Set<string>();

    for (const pattern of patterns) {
        // 将 glob 模式转换为实际路径
        const globPattern = pattern.endsWith("/") ? `${pattern}package.json` : `${pattern}/package.json`;
        try {
            const pkgPaths = globbySync(globPattern, { cwd: rootDir, onlyFiles: true });
            for (const pkgPath of pkgPaths) {
                const absPath = resolve(rootDir, dirname(pkgPath));
                const relPath = dirname(pkgPath);

                if (seen.has(absPath)) continue;
                seen.add(absPath);

                const pkg = readPackageJson(resolve(rootDir, pkgPath));
                packages.push(createWorkspacePackage(pkg, relPath, absPath));
            }
        } catch {
            // 忽略解析失败的包
        }
    }

    return packages;
}

/** 读取 package.json */
function readPackageJson(path: string): Record<string, unknown> {
    try {
        return JSON.parse(readFileSync(path, "utf-8"));
    } catch {
        return {};
    }
}

/** 创建 WorkspacePackage */
function createWorkspacePackage(pkg: Record<string, unknown>, relPath: string, absPath: string): WorkspacePackage {
    const deps = pkg.dependencies ? Object.keys(pkg.dependencies as Record<string, string>) : [];
    const devDeps = pkg.devDependencies ? Object.keys(pkg.devDependencies as Record<string, string>) : [];
    const peerDeps = pkg.peerDependencies ? Object.keys(pkg.peerDependencies as Record<string, string>) : [];

    return {
        name: (pkg.name as string) || relPath,
        path: relPath,
        absolutePath: absPath,
        version: pkg.version as string | undefined,
        dependencies: deps,
        devDependencies: devDeps,
        peerDependencies: peerDeps,
        private: pkg.private as boolean | undefined,
    };
}

/** 检测跨包依赖问题 */
export interface CrossPackageIssue {
    type: "circular-dependency" | "missing-dependency" | "unused-dependency" | "version-mismatch";
    package: string;
    relatedPackage?: string;
    message: string;
    severity: "critical" | "warning" | "suggestion";
}

/** 分析跨包依赖 */
export function analyzeCrossPackageDeps(packages: WorkspacePackage[]): CrossPackageIssue[] {
    const issues: CrossPackageIssue[] = [];
    const pkgMap = new Map(packages.map((p) => [p.name, p]));
    const pkgNames = new Set(packages.map((p) => p.name));

    for (const pkg of packages) {
        const allDeps = new Set([...(pkg.dependencies || []), ...(pkg.devDependencies || []), ...(pkg.peerDependencies || [])]);

        for (const dep of allDeps) {
            // 检测缺失的内部依赖
            if (dep.startsWith("@") || dep.includes("/")) {
                const scopeName = dep.split("/")[0];
                // 如果依赖的是 workspace 内的包但名称不匹配
                if (!pkgNames.has(dep) && pkgNames.has(scopeName)) {
                    issues.push({
                        type: "missing-dependency",
                        package: pkg.name,
                        relatedPackage: dep,
                        message: `包 "${pkg.name}" 依赖 "${dep}"，但该包不在 workspace 中`,
                        severity: "warning",
                    });
                }
            }
        }
    }

    // 检测循环依赖
    const visited = new Set<string>();
    const pathStack: string[] = [];

    function findCycle(pkgName: string): string[] | null {
        if (pathStack.includes(pkgName)) {
            const cycleStart = pathStack.indexOf(pkgName);
            return pathStack.slice(cycleStart);
        }
        if (visited.has(pkgName)) return null;

        visited.add(pkgName);
        pathStack.push(pkgName);

        const pkg = pkgMap.get(pkgName);
        if (pkg) {
            const allDeps = new Set([...(pkg.dependencies || []), ...(pkg.devDependencies || [])]);
            for (const dep of allDeps) {
                if (pkgNames.has(dep)) {
                    const cycle = findCycle(dep);
                    if (cycle) return cycle;
                }
            }
        }

        pathStack.pop();
        return null;
    }

    for (const pkg of packages) {
        if (!visited.has(pkg.name)) {
            const cycle = findCycle(pkg.name);
            if (cycle && cycle.length > 1) {
                issues.push({
                    type: "circular-dependency",
                    package: cycle[0],
                    message: `循环依赖 detected: ${cycle.join(" → ")} → ${cycle[0]}`,
                    severity: "critical",
                });
            }
        }
    }

    return issues;
}
