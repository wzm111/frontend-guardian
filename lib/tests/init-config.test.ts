/**
 * init-config 测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateDefaultConfig, initConfig } from "@/utils/init-config.js";
import type { ProjectMeta } from "@/types.js";

describe("generateDefaultConfig", () => {
    it("应生成通用模板（无 meta）", () => {
        const yaml = generateDefaultConfig();
        expect(yaml).toContain("frontend-guardian 配置文件");
        expect(yaml).toContain("locale: zh");
        expect(yaml).toContain("severity: warning");
        expect(yaml).toContain("gate:");
        expect(yaml).toContain("scan:");
        expect(yaml).toContain("rules:");
        expect(yaml).toContain("customRules:");
        // 无项目 meta 时不应包含 i18n 配置
        expect(yaml).not.toContain("i18n:");
    });

    it("React 项目应包含 hooks 配置和组件配置", () => {
        const meta: ProjectMeta = {
            framework: "react",
            componentLib: "antd",
            platforms: ["pc"],
            hasTypeScript: true,
            hasI18n: false,
            scripts: {},
            packageManager: "npm",
            runtime: "node",
        };
        const yaml = generateDefaultConfig(meta);
        expect(yaml).toContain("component:");
        expect(yaml).toContain("library: antd");
        expect(yaml).toContain("hooks:");
        expect(yaml).toContain("checkVueComposables: false");
        expect(yaml).toContain(".ts");
        expect(yaml).toContain(".tsx");
    });

    it("Vue 项目应包含 Vue Composables 配置", () => {
        const meta: ProjectMeta = {
            framework: "vue",
            platforms: ["pc"],
            hasTypeScript: true,
            hasI18n: false,
            scripts: {},
            packageManager: "npm",
            runtime: "node",
        };
        const yaml = generateDefaultConfig(meta);
        expect(yaml).toContain("checkVueComposables: true");
        expect(yaml).toContain(".vue");
    });

    it("i18n 项目应包含 i18n 配置", () => {
        const meta: ProjectMeta = {
            framework: "react",
            platforms: ["pc"],
            hasTypeScript: true,
            hasI18n: true,
            i18nLib: "react-i18next",
            scripts: {},
            packageManager: "npm",
            runtime: "node",
        };
        const yaml = generateDefaultConfig(meta);
        expect(yaml).toContain("i18n:");
        expect(yaml).toContain("sourceLocale: zh-CN");
        expect(yaml).toContain("translateProvider: openai");
    });

    it("小程序项目应包含 platform 配置", () => {
        const meta: ProjectMeta = {
            framework: "uniapp",
            platforms: ["wechat-mp", "h5"],
            hasTypeScript: true,
            hasI18n: false,
            scripts: {},
            packageManager: "npm",
            runtime: "node",
        };
        const yaml = generateDefaultConfig(meta);
        expect(yaml).toContain("platform:");
        expect(yaml).toContain("wechat-mp");
        expect(yaml).toContain("h5");
        expect(yaml).toContain("mp:");
        expect(yaml).toContain("type: wechat");
        expect(yaml).toContain("mobile:");
    });

    it("鸿蒙项目应包含 .ets 扩展名", () => {
        const meta: ProjectMeta = {
            framework: "harmony",
            platforms: ["harmony"],
            hasTypeScript: true,
            hasI18n: false,
            scripts: {},
            packageManager: "npm",
            runtime: "node",
        };
        const yaml = generateDefaultConfig(meta);
        expect(yaml).toContain(".ets");
        expect(yaml).toContain("harmony:");
    });

    it("Svelte 项目应包含 .svelte 扩展名", () => {
        const meta: ProjectMeta = {
            framework: "svelte",
            platforms: ["pc"],
            hasTypeScript: true,
            hasI18n: false,
            scripts: {},
            packageManager: "npm",
            runtime: "node",
        };
        const yaml = generateDefaultConfig(meta);
        expect(yaml).toContain(".svelte");
    });

    it("纯 JS 项目不应包含 TS 扩展名", () => {
        const meta: ProjectMeta = {
            framework: "react",
            platforms: ["pc"],
            hasTypeScript: false,
            hasI18n: false,
            scripts: {},
            packageManager: "npm",
            runtime: "node",
        };
        const yaml = generateDefaultConfig(meta);
        expect(yaml).toContain(".js");
        expect(yaml).toContain(".jsx");
        expect(yaml).not.toContain(".ts");
    });

    it("Flutter/React Native 项目不应包含组件配置", () => {
        const meta: ProjectMeta = {
            framework: "flutter",
            platforms: ["app"],
            hasTypeScript: false,
            hasI18n: false,
            scripts: {},
            packageManager: "npm",
            runtime: "node",
        };
        const yaml = generateDefaultConfig(meta);
        expect(yaml).not.toContain("component:");
    });
});

describe("initConfig", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "fg-init-"));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it("应在空目录创建配置文件", () => {
        const result = initConfig(tmpDir);
        expect(result.created).toBe(true);
        expect(result.existed).toBe(false);
        expect(existsSync(result.path)).toBe(true);

        const content = readFileSync(result.path, "utf-8");
        expect(content).toContain("frontend-guardian 配置文件");
    });

    it("应检测已有文件并拒绝覆盖", () => {
        initConfig(tmpDir); // 第一次创建
        const result = initConfig(tmpDir, undefined, false); // 第二次，不强制
        expect(result.created).toBe(false);
        expect(result.existed).toBe(true);
    });

    it("force=true 时应覆盖已有文件", () => {
        initConfig(tmpDir);
        const meta: ProjectMeta = {
            framework: "react",
            platforms: ["pc"],
            hasTypeScript: true,
            hasI18n: true,
            scripts: {},
            packageManager: "npm",
            runtime: "node",
        };
        const result = initConfig(tmpDir, meta, true);
        expect(result.created).toBe(true);
        expect(result.existed).toBe(true);

        const content = readFileSync(result.path, "utf-8");
        expect(content).toContain("i18n:");
    });
});
