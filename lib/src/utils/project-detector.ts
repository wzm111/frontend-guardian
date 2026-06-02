/**
 * 项目元数据检测工具 (Phase 2: 智能化深度检测)
 *
 * 检测维度：
 * 1. 框架 & 版本 (react@18.2, vue@3.3, nextjs, nuxt...)
 * 2. 组件库 & 版本 (antd@5, element-plus, mui...)
 * 3. 构建工具 / Bundler (vite, webpack, rsbuild, turbopack...)
 * 4. 测试框架 (jest, vitest, cypress, playwright...)
 * 5. 状态管理 (redux, zustand, pinia, jotai...)
 * 6. 样式方案 (tailwind, styled-components, sass, less...)
 * 7. 路由 (react-router, vue-router, tanstack-router...)
 * 8. 包管理器 (npm/yarn/pnpm/bun — 通过 lockfile 推断)
 * 9. Linter / Formatter (eslint, biome, prettier, stylelint...)
 * 10. Monorepo 工具 (nx, turborepo, lerna, pnpm-workspace)
 * 11. 平台 (pc, h5, 小程序, app, harmony...)
 * 12. i18n (react-intl, vue-i18n, i18next...)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type {
    ProjectMeta,
    ProjectConfig,
    Framework,
    Platform,
    ComponentLib,
    Bundler,
    TestFramework,
    StateManager,
    StylingSolution,
    RouterLib,
    PackageManager,
    LinterTool,
    MonorepoTool,
    Runtime,
} from "../types.js";

export function detectProjectMeta(projectDir: string, config?: ProjectConfig): ProjectMeta {
    const pkgPath = resolve(projectDir, "package.json");
    const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf-8")) : {};
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const scripts = pkg.scripts || {};

    const frameworkInfo = detectFramework(projectDir, deps);
    const componentLibInfo = detectComponentLib(deps);
    const platforms = detectPlatforms(projectDir, frameworkInfo.framework, deps);
    const i18nInfo = detectI18n(deps);

    return {
        framework: frameworkInfo.framework,
        frameworkVersion: frameworkInfo.version,
        componentLib: componentLibInfo.componentLib,
        componentLibVersion: componentLibInfo.version,
        platforms,
        hasTypeScript: existsSync(resolve(projectDir, "tsconfig.json")) || deps["typescript"] !== undefined,
        hasI18n: i18nInfo.hasI18n,
        i18nLib: i18nInfo.i18nLib,
        scripts,

        // Phase 2: 深度检测
        bundler: detectBundler(deps)?.bundler,
        bundlerVersion: detectBundler(deps)?.version,
        testFramework: detectTestFramework(deps)?.testFramework,
        testFrameworkVersion: detectTestFramework(deps)?.version,
        stateManager: detectStateManager(deps)?.stateManager,
        stateManagerVersion: detectStateManager(deps)?.version,
        styling: detectStyling(deps)?.styling,
        stylingVersion: detectStyling(deps)?.version,
        router: detectRouter(deps)?.router,
        routerVersion: detectRouter(deps)?.version,
        packageManager: detectPackageManager(projectDir),
        linter: detectLinter(deps),
        monorepoTool: detectMonorepo(projectDir, deps),
        runtime: detectRuntime(pkg),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 框架检测
// ─────────────────────────────────────────────────────────────────────────────
function detectFramework(
    projectDir: string,
    deps: Record<string, string>
): { framework?: Framework; version?: string } {
    const fwOrder: { key: string; framework: Framework }[] = [
        { key: "next", framework: "nextjs" },
        { key: "nuxt", framework: "nuxt" },
        { key: "@dcloudio/uni-app", framework: "uniapp" },
        { key: "@tarojs/taro", framework: "taro" },
        { key: "react-native", framework: "react-native" },
        { key: "flutter", framework: "flutter" },
        { key: "react", framework: "react" },
        { key: "vue", framework: "vue" },
        { key: "svelte", framework: "svelte" },
        { key: "solid-js", framework: "solidjs" },
        { key: "astro", framework: "astro" },
    ];

    for (const { key, framework } of fwOrder) {
        if (deps[key]) {
            return { framework, version: deps[key] };
        }
    }

    // HarmonyOS (no typical npm dep, detect by file structure)
    if (existsSync(resolve(projectDir, "entry/src/main/ets")) || deps["@ohos/hvigor"]) {
        return { framework: "harmony" };
    }

    return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// 组件库检测
// ─────────────────────────────────────────────────────────────────────────────
function detectComponentLib(deps: Record<string, string>): {
    componentLib?: ComponentLib;
    version?: string;
} {
    const libMap: { key: string; lib: ComponentLib }[] = [
        { key: "antd", lib: "antd" },
        { key: "ant-design-vue", lib: "antd" },
        { key: "@ant-design/react-native", lib: "antd" },
        { key: "element-plus", lib: "element-plus" },
        { key: "@mui/material", lib: "mui" },
        { key: "vuetify", lib: "vuetify" },
        { key: "@nutui/nutui-react", lib: "nutui" },
        { key: "@nutui/nutui", lib: "nutui" },
        { key: "tdesign-react", lib: "tdesign" },
        { key: "tdesign-vue-next", lib: "tdesign" },
    ];

    for (const { key, lib } of libMap) {
        if (deps[key]) {
            return { componentLib: lib, version: deps[key] };
        }
    }

    return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// 平台检测
// ─────────────────────────────────────────────────────────────────────────────
function detectPlatforms(projectDir: string, framework?: Framework, deps?: Record<string, string>): Platform[] {
    const platforms: Platform[] = [];

    // 小程序
    if (existsSync(resolve(projectDir, "manifest.json")) && existsSync(resolve(projectDir, "pages.json"))) {
        platforms.push("wechat-mp", "h5", "app");
        return platforms;
    }
    if (existsSync(resolve(projectDir, "app.json")) && existsSync(resolve(projectDir, "project.config.json"))) {
        platforms.push("wechat-mp");
        return platforms;
    }
    if (existsSync(resolve(projectDir, "mini.project.json"))) {
        platforms.push("alipay-mp");
        return platforms;
    }

    // 多端框架
    if (framework === "uniapp") {
        platforms.push("wechat-mp", "h5", "app");
        return platforms;
    }
    if (framework === "taro") {
        platforms.push("wechat-mp", "h5");
        return platforms;
    }

    // PC / H5
    if (framework === "react" || framework === "vue" || framework === "nextjs" || framework === "nuxt") {
        platforms.push("pc", "h5");
    }

    // App
    if (framework === "flutter" || framework === "react-native") {
        platforms.push("app");
    }

    // HarmonyOS
    if (framework === "harmony") {
        platforms.push("harmony");
    }

    return platforms.length > 0 ? platforms : ["pc"];
}

// ─────────────────────────────────────────────────────────────────────────────
// i18n 检测
// ─────────────────────────────────────────────────────────────────────────────
function detectI18n(deps: Record<string, string>): { hasI18n: boolean; i18nLib?: string } {
    const i18nDeps = ["react-intl", "react-i18next", "vue-i18n", "i18next", "@dcloudio/uni-i18n", "@formatjs/intl"];
    const found = i18nDeps.find((d) => deps[d]);
    return { hasI18n: !!found, i18nLib: found };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bundler / Build Tool 检测
// ─────────────────────────────────────────────────────────────────────────────
function detectBundler(deps: Record<string, string>): { bundler?: Bundler; version?: string } | undefined {
    const bundlerMap: { key: string; bundler: Bundler }[] = [
        { key: "vite", bundler: "vite" },
        { key: "@rsbuild/core", bundler: "rsbuild" },
        { key: "webpack", bundler: "webpack" },
        { key: "@farmfe/core", bundler: "farm" },
        { key: "@rspack/core", bundler: "rspack" },
        { key: "parcel", bundler: "parcel" },
        { key: "esbuild", bundler: "esbuild" },
        { key: "rollup", bundler: "rollup" },
        { key: "wmr", bundler: "wmr" },
    ];

    // Next.js / Nuxt 自带 bundler
    if (deps["next"]) {
        return { bundler: "turbopack", version: deps["next"] };
    }
    if (deps["nuxt"]) {
        return { bundler: "vite", version: deps["nuxt"] };
    }

    for (const { key, bundler } of bundlerMap) {
        if (deps[key]) {
            return { bundler, version: deps[key] };
        }
    }

    return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// 测试框架检测
// ─────────────────────────────────────────────────────────────────────────────
function detectTestFramework(
    deps: Record<string, string>
): { testFramework?: TestFramework; version?: string } | undefined {
    const testMap: { key: string; tf: TestFramework }[] = [
        { key: "vitest", tf: "vitest" },
        { key: "jest", tf: "jest" },
        { key: "playwright", tf: "playwright" },
        { key: "cypress", tf: "cypress" },
        { key: "mocha", tf: "mocha" },
        { key: "karma", tf: "karma" },
        { key: "ava", tf: "ava" },
    ];

    for (const { key, tf } of testMap) {
        if (deps[key]) {
            return { testFramework: tf, version: deps[key] };
        }
    }

    return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// 状态管理检测
// ─────────────────────────────────────────────────────────────────────────────
function detectStateManager(
    deps: Record<string, string>
): { stateManager?: StateManager; version?: string } | undefined {
    const smMap: { key: string; sm: StateManager }[] = [
        { key: "zustand", sm: "zustand" },
        { key: "jotai", sm: "jotai" },
        { key: "recoil", sm: "recoil" },
        { key: "valtio", sm: "valtio" },
        { key: "mobx", sm: "mobx" },
        { key: "redux", sm: "redux" },
        { key: "pinia", sm: "pinia" },
        { key: "vuex", sm: "vuex" },
    ];

    for (const { key, sm } of smMap) {
        if (deps[key]) {
            return { stateManager: sm, version: deps[key] };
        }
    }

    return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// 样式方案检测
// ─────────────────────────────────────────────────────────────────────────────
function detectStyling(deps: Record<string, string>): { styling?: StylingSolution; version?: string } | undefined {
    const styleMap: { key: string; style: StylingSolution }[] = [
        { key: "tailwindcss", style: "tailwindcss" },
        { key: "styled-components", style: "styled-components" },
        { key: "@emotion/react", style: "emotion" },
        { key: "@emotion/styled", style: "emotion" },
        { key: "sass", style: "sass" },
        { key: "less", style: "less" },
        { key: "postcss-modules", style: "css-modules" },
        { key: "@vanilla-extract/css", style: "vanilla-extract" },
        { key: "unocss", style: "unocss" },
        { key: "windicss", style: "windicss" },
    ];

    for (const { key, style } of styleMap) {
        if (deps[key]) {
            return { styling: style, version: deps[key] };
        }
    }

    return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// 路由检测
// ─────────────────────────────────────────────────────────────────────────────
function detectRouter(deps: Record<string, string>): { router?: RouterLib; version?: string } | undefined {
    const routerMap: { key: string; router: RouterLib }[] = [
        { key: "react-router-dom", router: "react-router" },
        { key: "react-router", router: "react-router" },
        { key: "vue-router", router: "vue-router" },
        { key: "@tanstack/react-router", router: "tanstack-router" },
        { key: "wouter", router: "wouter" },
    ];

    for (const { key, router } of routerMap) {
        if (deps[key]) {
            return { router, version: deps[key] };
        }
    }

    return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// 包管理器检测 (通过 lockfile)
// ─────────────────────────────────────────────────────────────────────────────
function detectPackageManager(projectDir: string): PackageManager {
    if (existsSync(resolve(projectDir, "bun.lockb")) || existsSync(resolve(projectDir, "bun.lock"))) {
        return "bun";
    }
    if (existsSync(resolve(projectDir, "pnpm-lock.yaml"))) {
        return "pnpm";
    }
    if (existsSync(resolve(projectDir, "yarn.lock"))) {
        return "yarn";
    }
    return "npm";
}

// ─────────────────────────────────────────────────────────────────────────────
// Linter / Formatter 检测
// ─────────────────────────────────────────────────────────────────────────────
function detectLinter(deps: Record<string, string>): LinterTool | undefined {
    const linterMap: { key: string; linter: LinterTool }[] = [
        { key: "eslint", linter: "eslint" },
        { key: "@biomejs/biome", linter: "biome" },
        { key: "oxlint", linter: "oxlint" },
        { key: "prettier", linter: "prettier" },
        { key: "stylelint", linter: "stylelint" },
    ];

    for (const { key, linter } of linterMap) {
        if (deps[key]) {
            return linter;
        }
    }

    return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Monorepo 工具检测
// ─────────────────────────────────────────────────────────────────────────────
function detectMonorepo(projectDir: string, deps: Record<string, string>): MonorepoTool | undefined {
    if (existsSync(resolve(projectDir, "pnpm-workspace.yaml"))) {
        return "pnpm-workspace";
    }
    if (existsSync(resolve(projectDir, "nx.json"))) {
        return "nx";
    }
    if (existsSync(resolve(projectDir, "turbo.json"))) {
        return "turborepo";
    }
    if (deps["lerna"]) {
        return "lerna";
    }
    if (deps["@rushstack/rush-sdk"]) {
        return "rush";
    }

    return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime 检测
// ─────────────────────────────────────────────────────────────────────────────
function detectRuntime(pkg: Record<string, unknown>): Runtime {
    const engines = (pkg.engines as Record<string, string>) || {};

    if (pkg.packageManager) {
        const pm = String(pkg.packageManager);
        if (pm.startsWith("bun@")) return "bun";
    }

    if (engines.bun) return "bun";
    // Deno projects often use deno.json
    if (existsSync(resolve(process.cwd(), "deno.json")) || existsSync(resolve(process.cwd(), "deno.jsonc"))) {
        return "deno";
    }

    return "node";
}
