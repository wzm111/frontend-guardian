/**
 * v3.16.0: 多框架 E2E 支持单元测试
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cypressIntegration } from "../src/integrations/cypress.js";
import { katalonIntegration } from "../src/integrations/katalon.js";
import { seleniumIntegration } from "../src/integrations/selenium.js";
import { detectE2EFramework, extractCoveredPaths } from "../src/utils/e2e-gap-detector.js";

describe("v3.16.0 — Multi-framework E2E Support", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-e2e-"));
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
        writeFileSync(fullPath, content, "utf-8");
    }

    it("extractCoveredPaths() 应提取 Selenium driver.get 中的 URL", () => {
        const content = 'driver.get("https://example.com/login");';
        const pages = new Set<string>();
        const apis = new Set<string>();
        extractCoveredPaths(content, pages, apis);
        expect(pages.has("https://example.com/login")).toBe(true);
    });

    it("extractCoveredPaths() 应提取 Selenium driver.navigate().to 中的 URL", () => {
        const content = "driver.navigate().to('/dashboard');";
        const pages = new Set<string>();
        const apis = new Set<string>();
        extractCoveredPaths(content, pages, apis);
        expect(pages.has("/dashboard")).toBe(true);
    });

    it("extractCoveredPaths() 应提取 Katalon WebUI.navigateToUrl 中的 URL", () => {
        const content = 'WebUI.navigateToUrl("https://example.com/home")';
        const pages = new Set<string>();
        const apis = new Set<string>();
        extractCoveredPaths(content, pages, apis);
        expect(pages.has("https://example.com/home")).toBe(true);
    });

    it("detectE2EFramework() 应识别 Katalon .groovy 文件", () => {
        expect(detectE2EFramework("Test Cases/Login.groovy", "WebUI.delay(1)")).toBe("katalon");
    });

    it("detectE2EFramework() 应识别 Selenium driver.sleep", () => {
        expect(detectE2EFramework("selenium-tests/login.js", "driver.sleep(1000);")).toBe("selenium");
    });

    it("detectE2EFramework() 应识别 Cypress cy.visit", () => {
        expect(detectE2EFramework("cypress/e2e/login.cy.ts", "cy.visit('/login');")).toBe("cypress");
    });

    it("cypressIntegration.isAvailable() 在存在 cypress.config.ts 时返回 true", () => {
        writeFile("cypress.config.ts", "export default {};");
        expect(cypressIntegration.isAvailable(tempDir)).toBe(true);
    });

    it("cypressIntegration.isAvailable() 在 package.json 依赖 cypress 时返回 true", () => {
        writeFile("package.json", JSON.stringify({ name: "test", devDependencies: { cypress: "^13.0.0" } }));
        expect(cypressIntegration.isAvailable(tempDir)).toBe(true);
    });

    it("seleniumIntegration.isAvailable() 在存在 wdio.conf.ts 时返回 true", () => {
        writeFile("wdio.conf.ts", "export default {};");
        expect(seleniumIntegration.isAvailable(tempDir)).toBe(true);
    });

    it("seleniumIntegration.isAvailable() 在依赖 webdriverio 时返回 true", () => {
        writeFile("package.json", JSON.stringify({ name: "test", devDependencies: { webdriverio: "^8.0.0" } }));
        expect(seleniumIntegration.isAvailable(tempDir)).toBe(true);
    });

    it("katalonIntegration.isAvailable() 在存在 .prj 文件时返回 true", () => {
        writeFile("sample.prj", "<?xml version=\"1.0\"?>\n<Project></Project>");
        expect(katalonIntegration.isAvailable(tempDir)).toBe(true);
    });

    it("seleniumIntegration.run() 在未安装工具时返回友好提示 issue", { timeout: 30000 }, () => {
        // 构造一个看起来像是 wdio 项目但 CLI 不可用的目录
        writeFile("wdio.conf.ts", "export default {};");
        const issues = seleniumIntegration.run(tempDir);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0].severity).toBe("warning");
        expect(issues[0].title).toContain("Selenium");
    });

    it("katalonIntegration.run() 在未安装 katalon CLI 时返回友好提示 issue", () => {
        writeFile("sample.prj", "<?xml version=\"1.0\"?>\n<Project></Project>");
        const issues = katalonIntegration.run(tempDir);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0].severity).toBe("warning");
    });
});
