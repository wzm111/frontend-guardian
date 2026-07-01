import { describe, expect, it } from "vitest";
import { createEngine, formatRecommendedConfig, formatScanProfile, recommendConfig } from "../src/index.js";
import { resolveModulesForFiles } from "../bin/watch-mode.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const testRule = {
    id: "test/slow-rule",
    name: "Slow Rule",
    description: "A rule that sleeps a bit to produce measurable timing",
    severity: "warning" as const,
    category: "i18n" as const,
    defaultEnabled: true,
    async execute(context: { filePath: string; source: string }) {
        await new Promise((r) => setTimeout(r, 5));
        if (context.source.includes("trigger")) {
            return [
                {
                    ruleId: "test/slow-rule",
                    title: "Test issue",
                    description: "Test",
                    severity: "warning" as const,
                    file: context.filePath,
                    line: 1,
                    column: 1,
                },
            ];
        }
        return [];
    },
};

describe("v3.15.0 — 扫描体验与性能分析", () => {
    it("profile=true 时 ScanResult 应包含耗时分析", async () => {
        const dir = mkdtempSync(join(tmpdir(), "fg-profile-"));
        writeFileSync(join(dir, "a.js"), "trigger");
        writeFileSync(join(dir, "b.js"), "no issue");

        const engine = createEngine({
            projectDir: dir,
            profile: true,
            showProgress: false,
            cache: false,
        });
        engine.register(testRule);

        const result = await engine.scan("i18n");
        expect(result.profile).toBeDefined();
        expect(result.profile?.module).toBe("i18n");
        expect(result.profile?.filesScanned).toBe(2);
        expect(result.profile?.rulesTimed["test/slow-rule"]).toBeDefined();
        expect(result.profile?.rulesTimed["test/slow-rule"].count).toBe(2);
        expect(result.profile?.topRules.length).toBeGreaterThan(0);
        expect(result.profile?.topFiles.length).toBeGreaterThan(0);
    });

    it("formatScanProfile 应输出规则与文件耗时排名", () => {
        const profile = {
            module: "i18n",
            filesScanned: 2,
            rulesTimed: {
                "test/slow-rule": {
                    ruleId: "test/slow-rule",
                    totalMs: 20,
                    count: 2,
                    avgMs: 10,
                    maxMs: 12,
                },
            },
            fileTimings: {
                "/a.js": { filePath: "/a.js", totalMs: 15, ruleCount: 1 },
                "/b.js": { filePath: "/b.js", totalMs: 5, ruleCount: 1 },
            },
            topRules: [
                { ruleId: "test/slow-rule", totalMs: 20, count: 2, avgMs: 10, maxMs: 12 },
            ],
            topFiles: [
                { filePath: "/a.js", totalMs: 15, ruleCount: 1 },
                { filePath: "/b.js", totalMs: 5, ruleCount: 1 },
            ],
        };
        const text = formatScanProfile(profile);
        expect(text).toContain("扫描耗时分析");
        expect(text).toContain("test/slow-rule");
        expect(text).toContain("/a.js");
    });

    it("showProgress=true 在非 TTY 下应静默完成扫描", async () => {
        const dir = mkdtempSync(join(tmpdir(), "fg-progress-"));
        writeFileSync(join(dir, "a.js"), "trigger");

        const engine = createEngine({
            projectDir: dir,
            showProgress: true,
            cache: false,
        });
        engine.register(testRule);

        const result = await engine.scan("i18n");
        expect(result.total).toBe(1);
        expect(result.filesScanned).toBe(1);
    });

    it("recommendConfig 应根据项目返回推荐配置", () => {
        const dir = mkdtempSync(join(tmpdir(), "fg-recommend-"));
        writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "demo" }));
        writeFileSync(join(dir, "App.tsx"), "export default function App() {}");
        writeFileSync(join(dir, "utils.ts"), "export const a = 1;");

        const rec = recommendConfig(dir);
        expect(rec.fileCount).toBeGreaterThanOrEqual(2);
        expect(rec.includeExtensions).toContain(".tsx");
        expect(rec.enabledModules.length).toBeGreaterThan(0);
        expect(rec.concurrency).toBeGreaterThan(0);
        expect(rec.strategy).toBeOneOf(["strict", "standard", "loose"]);
    });

    it("formatRecommendedConfig 应渲染 YAML 配置", () => {
        const dir = mkdtempSync(join(tmpdir(), "fg-recommend-fmt-"));
        writeFileSync(join(dir, "App.vue"), "<template><div>hi</div></template>");

        const rec = recommendConfig(dir);
        const text = formatRecommendedConfig(rec);
        expect(text).toContain("推荐配置");
        expect(text).toContain("scan:");
        expect(text).toContain("modules:");
    });

    it("resolveModulesForFiles 应根据文件类型推断相关模块", () => {
        const jsFiles = [resolve("/project/src/App.tsx")];
        expect(resolveModulesForFiles(jsFiles)).toContain("component");
        expect(resolveModulesForFiles(jsFiles)).toContain("hooks");

        const cssFiles = [resolve("/project/src/App.css")];
        expect(resolveModulesForFiles(cssFiles)).toContain("performance");
        expect(resolveModulesForFiles(cssFiles)).toContain("a11y");

        const i18nFiles = [resolve("/project/src/i18n/zh-CN.ts")];
        expect(resolveModulesForFiles(i18nFiles)).toContain("i18n");

        const testFiles = [resolve("/project/e2e/login.spec.ts")];
        expect(resolveModulesForFiles(testFiles)).toContain("e2e");
    });
});
