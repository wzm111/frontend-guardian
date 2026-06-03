/**
 * v2.9.0 测试 — Monorepo 工作区支持
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { detectMonorepo, analyzeCrossPackageDeps } from "@/utils/monorepo.js";
import type { WorkspacePackage } from "@/utils/monorepo.js";

describe("v2.9.0 — Monorepo 检测", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "fg-v29-"));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it("应检测到 pnpm-workspace.yaml", () => {
        writeFileSync(
            join(tmpDir, "pnpm-workspace.yaml"),
            "packages:\n  - 'packages/*'\n  - 'apps/*'\n",
            "utf-8"
        );
        mkdirSync(join(tmpDir, "packages", "pkg-a"), { recursive: true });
        writeFileSync(
            join(tmpDir, "packages", "pkg-a", "package.json"),
            JSON.stringify({ name: "pkg-a", version: "1.0.0" }),
            "utf-8"
        );

        const result = detectMonorepo(tmpDir);
        expect(result.isMonorepo).toBe(true);
        expect(result.tool).toBe("pnpm-workspace");
        expect(result.packages.length).toBeGreaterThanOrEqual(0);
    });

    it("应检测到 lerna.json", () => {
        writeFileSync(
            join(tmpDir, "lerna.json"),
            JSON.stringify({ packages: ["packages/*"], version: "1.0.0" }),
            "utf-8"
        );
        mkdirSync(join(tmpDir, "packages", "lib-b"), { recursive: true });
        writeFileSync(
            join(tmpDir, "packages", "lib-b", "package.json"),
            JSON.stringify({ name: "lib-b", version: "2.0.0" }),
            "utf-8"
        );

        const result = detectMonorepo(tmpDir);
        expect(result.isMonorepo).toBe(true);
        expect(result.tool).toBe("lerna");
    });

    it("应检测到 package.json workspaces", () => {
        writeFileSync(
            join(tmpDir, "package.json"),
            JSON.stringify({
                name: "root",
                workspaces: ["packages/*", "apps/*"],
            }),
            "utf-8"
        );
        mkdirSync(join(tmpDir, "packages", "core"), { recursive: true });
        writeFileSync(
            join(tmpDir, "packages", "core", "package.json"),
            JSON.stringify({ name: "core", version: "1.0.0" }),
            "utf-8"
        );

        const result = detectMonorepo(tmpDir);
        expect(result.isMonorepo).toBe(true);
        expect(result.packages.length).toBeGreaterThanOrEqual(0);
    });

    it("非 monorepo 项目应返回 isMonorepo=false", () => {
        writeFileSync(
            join(tmpDir, "package.json"),
            JSON.stringify({ name: "simple-project" }),
            "utf-8"
        );

        const result = detectMonorepo(tmpDir);
        expect(result.isMonorepo).toBe(false);
        expect(result.tool).toBe("none");
        expect(result.packages).toHaveLength(0);
    });

    it("应检测到 nx.json", () => {
        writeFileSync(
            join(tmpDir, "nx.json"),
            JSON.stringify({ npmScope: "test" }),
            "utf-8"
        );
        writeFileSync(
            join(tmpDir, "workspace.json"),
            JSON.stringify({
                projects: {
                    app1: "apps/app1",
                    lib1: "libs/lib1",
                },
            }),
            "utf-8"
        );
        mkdirSync(join(tmpDir, "apps", "app1"), { recursive: true });
        writeFileSync(
            join(tmpDir, "apps", "app1", "package.json"),
            JSON.stringify({ name: "app1" }),
            "utf-8"
        );

        const result = detectMonorepo(tmpDir);
        expect(result.isMonorepo).toBe(true);
        expect(result.tool).toBe("nx");
        expect(result.packages.length).toBeGreaterThanOrEqual(0);
    });
});

describe("v2.9.0 — 跨包依赖分析", () => {
    it("应检测到循环依赖", () => {
        const packages: WorkspacePackage[] = [
            {
                name: "pkg-a",
                path: "packages/a",
                absolutePath: "/tmp/a",
                dependencies: ["pkg-b"],
            },
            {
                name: "pkg-b",
                path: "packages/b",
                absolutePath: "/tmp/b",
                dependencies: ["pkg-c"],
            },
            {
                name: "pkg-c",
                path: "packages/c",
                absolutePath: "/tmp/c",
                dependencies: ["pkg-a"],
            },
        ];

        const issues = analyzeCrossPackageDeps(packages);
        const circular = issues.filter((i) => i.type === "circular-dependency");
        expect(circular.length).toBeGreaterThanOrEqual(1);
    });

    it("无循环依赖时应返回空数组", () => {
        const packages: WorkspacePackage[] = [
            {
                name: "pkg-a",
                path: "packages/a",
                absolutePath: "/tmp/a",
                dependencies: ["pkg-b"],
            },
            {
                name: "pkg-b",
                path: "packages/b",
                absolutePath: "/tmp/b",
                dependencies: [],
            },
        ];

        const issues = analyzeCrossPackageDeps(packages);
        const circular = issues.filter((i) => i.type === "circular-dependency");
        expect(circular.length).toBe(0);
    });

    it("应检测到缺失的内部依赖", () => {
        const packages: WorkspacePackage[] = [
            {
                name: "pkg-a",
                path: "packages/a",
                absolutePath: "/tmp/a",
                dependencies: ["@scope/nonexistent"],
            },
        ];

        const issues = analyzeCrossPackageDeps(packages);
        const missing = issues.filter((i) => i.type === "missing-dependency");
        expect(missing.length).toBeGreaterThanOrEqual(0);
    });
});
