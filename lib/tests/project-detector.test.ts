/**
 * Project Detector 测试 — v2.2.0
 *
 * 覆盖 detectProjectMeta 及所有 detect* 子函数
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectProjectMeta } from "../src/utils/project-detector.js";

let tempDir: string;

beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "fg-detect-"));
});

afterEach(() => {
    try {
        rmSync(tempDir, { recursive: true, force: true });
    } catch {
        // ignore
    }
});

/** 写入 package.json */
function writePkg(deps: Record<string, string>, devDeps?: Record<string, string>, extra?: Record<string, unknown>) {
    const pkg: Record<string, unknown> = {
        name: "test-project",
        dependencies: deps,
        ...(devDeps ? { devDependencies: devDeps } : {}),
        ...extra,
    };
    writeFileSync(join(tempDir, "package.json"), JSON.stringify(pkg), "utf-8");
}

describe("detectProjectMeta — 框架检测", () => {
    it("应检测 React 项目", () => {
        writePkg({ react: "^18.2.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.framework).toBe("react");
        expect(meta.frameworkVersion).toBe("^18.2.0");
    });

    it("应检测 Vue 项目", () => {
        writePkg({ vue: "^3.3.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.framework).toBe("vue");
    });

    it("应检测 Next.js 项目", () => {
        writePkg({ next: "14.0.0", react: "18.2.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.framework).toBe("nextjs");
    });

    it("应检测 Nuxt 项目", () => {
        writePkg({ nuxt: "^3.0.0", vue: "^3.3.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.framework).toBe("nuxt");
    });

    it("应检测 Svelte 项目", () => {
        writePkg({ svelte: "^4.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.framework).toBe("svelte");
    });

    it("应检测 uni-app 项目", () => {
        writePkg({ "@dcloudio/uni-app": "^3.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.framework).toBe("uniapp");
    });

    it("应检测 Taro 项目", () => {
        writePkg({ "@tarojs/taro": "^3.6.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.framework).toBe("taro");
    });

    it("应检测 React Native 项目", () => {
        writePkg({ "react-native": "0.72.0", react: "18.2.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.framework).toBe("react-native");
    });

    it("应检测 HarmonyOS 项目（通过文件结构）", () => {
        writePkg({});
        const etsDir = join(tempDir, "entry", "src", "main", "ets");
        mkdirSync(etsDir, { recursive: true });
        const meta = detectProjectMeta(tempDir);
        expect(meta.framework).toBe("harmony");
    });

    it("无 package.json 时不应崩溃", () => {
        const meta = detectProjectMeta(tempDir);
        expect(meta.framework).toBeUndefined();
    });
});

describe("detectProjectMeta — 组件库检测", () => {
    it("应检测 Ant Design", () => {
        writePkg({ antd: "^5.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.componentLib).toBe("antd");
    });

    it("应检测 Element Plus", () => {
        writePkg({ "element-plus": "^2.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.componentLib).toBe("element-plus");
    });

    it("应检测 MUI", () => {
        writePkg({ "@mui/material": "^5.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.componentLib).toBe("mui");
    });
});

describe("detectProjectMeta — 平台检测", () => {
    it("React 项目默认应有 pc + h5", () => {
        writePkg({ react: "^18.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.platforms).toContain("pc");
        expect(meta.platforms).toContain("h5");
    });

    it("uni-app 应有 wechat-mp + h5 + app", () => {
        writePkg({ "@dcloudio/uni-app": "^3.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.platforms).toEqual(["wechat-mp", "h5", "app"]);
    });

    it("应检测微信小程序项目（manifest.json + pages.json）", () => {
        writePkg({});
        writeFileSync(join(tempDir, "manifest.json"), "{}", "utf-8");
        writeFileSync(join(tempDir, "pages.json"), "[]", "utf-8");
        const meta = detectProjectMeta(tempDir);
        expect(meta.platforms).toContain("wechat-mp");
    });

    it("应检测支付宝小程序（mini.project.json）", () => {
        writePkg({});
        writeFileSync(join(tempDir, "mini.project.json"), "{}", "utf-8");
        const meta = detectProjectMeta(tempDir);
        expect(meta.platforms).toContain("alipay-mp");
    });

    it("HarmonyOS 应返回 harmony", () => {
        writePkg({});
        const etsDir = join(tempDir, "entry", "src", "main", "ets");
        mkdirSync(etsDir, { recursive: true });
        const meta = detectProjectMeta(tempDir);
        expect(meta.platforms).toContain("harmony");
    });

    it("无匹配时应默认返回 pc", () => {
        writePkg({});
        const meta = detectProjectMeta(tempDir);
        expect(meta.platforms).toEqual(["pc"]);
    });
});

describe("detectProjectMeta — TypeScript 检测", () => {
    it("存在 tsconfig.json 时应标记 hasTypeScript", () => {
        writePkg({});
        writeFileSync(join(tempDir, "tsconfig.json"), "{}", "utf-8");
        const meta = detectProjectMeta(tempDir);
        expect(meta.hasTypeScript).toBe(true);
    });

    it("依赖中包含 typescript 时应标记 hasTypeScript", () => {
        writePkg({}, { typescript: "^5.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.hasTypeScript).toBe(true);
    });

    it("无 TS 时应标记 false", () => {
        writePkg({});
        const meta = detectProjectMeta(tempDir);
        expect(meta.hasTypeScript).toBe(false);
    });
});

describe("detectProjectMeta — i18n 检测", () => {
    it("应检测 react-i18next", () => {
        writePkg({ "react-i18next": "^13.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.hasI18n).toBe(true);
        expect(meta.i18nLib).toBe("react-i18next");
    });

    it("应检测 vue-i18n", () => {
        writePkg({ "vue-i18n": "^9.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.hasI18n).toBe(true);
        expect(meta.i18nLib).toBe("vue-i18n");
    });

    it("无 i18n 时应标记 false", () => {
        writePkg({});
        const meta = detectProjectMeta(tempDir);
        expect(meta.hasI18n).toBe(false);
    });
});

describe("detectProjectMeta — Bundler 检测", () => {
    it("应检测 Vite", () => {
        writePkg({ vite: "^5.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.bundler).toBe("vite");
    });

    it("应检测 Webpack", () => {
        writePkg({ webpack: "^5.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.bundler).toBe("webpack");
    });

    it("应检测 rsbuild", () => {
        writePkg({ "@rsbuild/core": "^0.5.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.bundler).toBe("rsbuild");
    });

    it("Next.js 应返回 turbopack", () => {
        writePkg({ next: "14.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.bundler).toBe("turbopack");
    });

    it("Nuxt 应返回 vite", () => {
        writePkg({ nuxt: "^3.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.bundler).toBe("vite");
    });

    it("无 bundler 时应为 undefined", () => {
        writePkg({});
        const meta = detectProjectMeta(tempDir);
        expect(meta.bundler).toBeUndefined();
    });
});

describe("detectProjectMeta — 测试框架检测", () => {
    it("应检测 Vitest", () => {
        writePkg({}, { vitest: "^1.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.testFramework).toBe("vitest");
    });

    it("应检测 Jest", () => {
        writePkg({}, { jest: "^29.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.testFramework).toBe("jest");
    });

    it("应检测 Playwright", () => {
        writePkg({}, { playwright: "^1.40.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.testFramework).toBe("playwright");
    });
});

describe("detectProjectMeta — 状态管理检测", () => {
    it("应检测 Redux", () => {
        writePkg({ redux: "^5.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.stateManager).toBe("redux");
    });

    it("应检测 Pinia", () => {
        writePkg({ pinia: "^2.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.stateManager).toBe("pinia");
    });

    it("应检测 Zustand", () => {
        writePkg({ zustand: "^4.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.stateManager).toBe("zustand");
    });
});

describe("detectProjectMeta — 样式方案检测", () => {
    it("应检测 Tailwind", () => {
        writePkg({}, { tailwindcss: "^3.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.styling).toBe("tailwindcss");
    });

    it("应检测 styled-components", () => {
        writePkg({ "styled-components": "^6.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.styling).toBe("styled-components");
    });

    it("应检测 Sass", () => {
        writePkg({}, { sass: "^1.60.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.styling).toBe("sass");
    });
});

describe("detectProjectMeta — 路由检测", () => {
    it("应检测 react-router-dom", () => {
        writePkg({ "react-router-dom": "^6.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.router).toBe("react-router");
    });

    it("应检测 vue-router", () => {
        writePkg({ "vue-router": "^4.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.router).toBe("vue-router");
    });

    it("应检测 tanstack-router", () => {
        writePkg({ "@tanstack/react-router": "^1.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.router).toBe("tanstack-router");
    });
});

describe("detectProjectMeta — 包管理器检测", () => {
    it("应检测 pnpm", () => {
        writePkg({});
        writeFileSync(join(tempDir, "pnpm-lock.yaml"), "", "utf-8");
        const meta = detectProjectMeta(tempDir);
        expect(meta.packageManager).toBe("pnpm");
    });

    it("应检测 yarn", () => {
        writePkg({});
        writeFileSync(join(tempDir, "yarn.lock"), "", "utf-8");
        const meta = detectProjectMeta(tempDir);
        expect(meta.packageManager).toBe("yarn");
    });

    it("应检测 bun", () => {
        writePkg({});
        writeFileSync(join(tempDir, "bun.lockb"), "", "utf-8");
        const meta = detectProjectMeta(tempDir);
        expect(meta.packageManager).toBe("bun");
    });

    it("无 lockfile 时应默认 npm", () => {
        writePkg({});
        const meta = detectProjectMeta(tempDir);
        expect(meta.packageManager).toBe("npm");
    });
});

describe("detectProjectMeta — Linter 检测", () => {
    it("应检测 ESLint", () => {
        writePkg({}, { eslint: "^9.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.linter).toBe("eslint");
    });

    it("应检测 Biome", () => {
        writePkg({}, { "@biomejs/biome": "^1.5.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.linter).toBe("biome");
    });

    it("应检测 Prettier", () => {
        writePkg({}, { prettier: "^3.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.linter).toBe("prettier");
    });
});

describe("detectProjectMeta — Monorepo 检测", () => {
    it("应检测 pnpm workspace", () => {
        writePkg({});
        writeFileSync(join(tempDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'", "utf-8");
        const meta = detectProjectMeta(tempDir);
        expect(meta.monorepoTool).toBe("pnpm-workspace");
    });

    it("应检测 Turborepo", () => {
        writePkg({});
        writeFileSync(join(tempDir, "turbo.json"), "{}", "utf-8");
        const meta = detectProjectMeta(tempDir);
        expect(meta.monorepoTool).toBe("turborepo");
    });

    it("应检测 Nx", () => {
        writePkg({});
        writeFileSync(join(tempDir, "nx.json"), "{}", "utf-8");
        const meta = detectProjectMeta(tempDir);
        expect(meta.monorepoTool).toBe("nx");
    });

    it("应检测 Lerna（通过依赖）", () => {
        writePkg({}, { lerna: "^7.0.0" });
        const meta = detectProjectMeta(tempDir);
        expect(meta.monorepoTool).toBe("lerna");
    });

    it("无 monorepo 时应为 undefined", () => {
        writePkg({});
        const meta = detectProjectMeta(tempDir);
        expect(meta.monorepoTool).toBeUndefined();
    });
});

describe("detectProjectMeta — Runtime 检测", () => {
    it("应检测 Bun runtime", () => {
        writePkg({}, {}, { engines: { bun: "^1.0.0" } });
        const meta = detectProjectMeta(tempDir);
        expect(meta.runtime).toBe("bun");
    });

    it("应检测 Deno runtime（deno.json）", () => {
        writePkg({});
        writeFileSync(join(tempDir, "deno.json"), "{}", "utf-8");
        const meta = detectProjectMeta(tempDir);
        expect(meta.runtime).toBe("deno");
    });

    it("默认应为 node", () => {
        writePkg({});
        const meta = detectProjectMeta(tempDir);
        expect(meta.runtime).toBe("node");
    });
});

describe("detectProjectMeta — scripts 保留", () => {
    it("应保留 package.json scripts", () => {
        writePkg({}, {}, { scripts: { build: "tsc", test: "vitest" } });
        const meta = detectProjectMeta(tempDir);
        expect(meta.scripts).toEqual({ build: "tsc", test: "vitest" });
    });
});
