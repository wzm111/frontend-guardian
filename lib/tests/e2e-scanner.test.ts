import { describe, it, expect } from "vitest";
import { e2eRules } from "../src/scanners/e2e-scanner.js";
import { detectE2EGaps, formatE2EGapReport, formatE2EGapJson } from "../src/utils/e2e-gap-detector.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("v3.6.0 — E2E Test Governance", () => {
    describe("e2e-scanner rules", () => {
        it("should detect hardcoded CSS selectors", () => {
            const source = `
        test('login', async ({ page }) => {
          await page.click('.login-form > div:nth-child(2) > button');
          await page.fill('#id-12345-abcdef', 'admin');
        });
      `;

            const rule = e2eRules.find((r) => r.id === "e2e-no-hardcode-selector")!;
            const issues = rule.execute({
                filePath: "/project/tests/login.spec.ts",
                source,
                projectDir: "/project",
                config: {},
                utils: {} as any,
            });

            expect(issues.length).toBeGreaterThanOrEqual(1);
            expect(issues[0].ruleId).toBe("e2e-no-hardcode-selector");
            expect(issues[0].severity).toBe("warning");
        });

        it("should detect waitForTimeout usage", () => {
            const source = `
        test('submit', async ({ page }) => {
          await page.click('button[type="submit"]');
          await page.waitForTimeout(3000);
          await page.waitForTimeout(500);
        });
      `;

            const rule = e2eRules.find((r) => r.id === "e2e-no-wait-for-timeout")!;
            const issues = rule.execute({
                filePath: "/project/tests/submit.spec.ts",
                source,
                projectDir: "/project",
                config: {},
                utils: {} as any,
            });

            expect(issues.length).toBe(2);
            expect(issues[0].severity).toBe("critical"); // 3000ms
            expect(issues[1].severity).toBe("warning"); // 500ms
        });

        it("should detect missing API assertions after submit", () => {
            const source = `
        test('place order', async ({ page }) => {
          await page.fill('[data-testid="from"]', '首都机场');
          await page.fill('[data-testid="to"]', '北京站');
          await page.click('[data-testid="submit-order"]');
          // 缺少 waitForResponse
          await expect(page).toHaveURL(/\/order\/detail/);
        });
      `;

            const rule = e2eRules.find((r) => r.id === "e2e-missing-api-assert")!;
            const issues = rule.execute({
                filePath: "/project/tests/order.spec.ts",
                source,
                projectDir: "/project",
                config: {},
                utils: {} as any,
            });

            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("e2e-missing-api-assert");
        });

        it("should not flag when waitForResponse is present", () => {
            const source = `
        test('place order', async ({ page }) => {
          await page.click('[data-testid="submit-order"]');
          await page.waitForResponse(resp => resp.url().includes('/api/order'));
          await expect(page).toHaveURL(/\/order\/detail/);
        });
      `;

            const rule = e2eRules.find((r) => r.id === "e2e-missing-api-assert")!;
            const issues = rule.execute({
                filePath: "/project/tests/order.spec.ts",
                source,
                projectDir: "/project",
                config: {},
                utils: {} as any,
            });

            expect(issues.length).toBe(0);
        });

        it("should skip non-e2e files", () => {
            const source = `await page.waitForTimeout(5000);`;

            const rules = e2eRules.filter((r) =>
                ["e2e-no-wait-for-timeout", "e2e-no-hardcode-selector"].includes(r.id)
            );

            for (const rule of rules) {
                const issues = rule.execute({
                    filePath: "/project/src/utils/helper.ts",
                    source,
                    projectDir: "/project",
                    config: {},
                    utils: {} as any,
                });
                expect(issues.length).toBe(0);
            }
        });

        it("should detect selector over-reliance on class names", () => {
            const source = `
        test('search', async ({ page }) => {
          await page.click('.search-box .input-wrapper .btn-primary');
        });
      `;

            const rule = e2eRules.find((r) => r.id === "e2e-selector-over-class")!;
            const issues = rule.execute({
                filePath: "/project/tests/search.spec.ts",
                source,
                projectDir: "/project",
                config: {},
                utils: {} as any,
            });

            expect(issues.length).toBeGreaterThanOrEqual(1);
            expect(issues[0].ruleId).toBe("e2e-selector-over-class");
        });
    });

    describe("e2e-gap-detector", () => {
        let tempDir: string;

        it("should detect uncovered pages", () => {
            tempDir = mkdtempSync(join(tmpdir(), "fg-e2e-test-"));

            // 创建小程序 pages.json
            mkdirSync(join(tempDir, "src"));
            writeFileSync(
                join(tempDir, "pages.json"),
                JSON.stringify({
                    pages: [
                        "pages/index/index",
                        "pages/transfer/index",
                        "pages/order/detail",
                        "pages/order/list",
                    ],
                })
            );

            // 创建 E2E 测试（只覆盖部分页面）
            mkdirSync(join(tempDir, "tests", "e2e"), { recursive: true });
            writeFileSync(
                join(tempDir, "tests", "e2e", "index.spec.ts"),
                `
          test('index', async ({ page }) => {
            await page.goto('/pages/index/index');
          });
        `
            );

            const result = detectE2EGaps({ projectDir: tempDir });

            expect(result.coveredPages).toBe(1);
            expect(result.uncoveredPages.length).toBe(3);
            expect(result.uncoveredPages.some((p) => p.path.includes("transfer"))).toBe(true);
            expect(result.pageCoverage).toBe(25);
            expect(result.suggestions.length).toBeGreaterThanOrEqual(3);
        });

        it("should detect API endpoints from request.js", () => {
            tempDir = mkdtempSync(join(tmpdir(), "fg-e2e-api-test-"));

            // 创建 request.js
            mkdirSync(join(tempDir, "src", "api"), { recursive: true });
            writeFileSync(
                join(tempDir, "src", "api", "request.js"),
                `
          export const login = () => fetch('/api/auth/login');
          export const getOrder = (id) => fetch('/api/order/' + id);
          export const cancelOrder = (id) => fetch('/api/order/cancel');
        `
            );

            // 创建测试（只覆盖部分接口）
            mkdirSync(join(tempDir, "tests", "e2e"), { recursive: true });
            writeFileSync(
                join(tempDir, "tests", "e2e", "auth.spec.ts"),
                `
          test('login', async ({ page }) => {
            await page.waitForResponse(resp => resp.url().includes('/api/auth/login'));
          });
        `
            );

            const result = detectE2EGaps({ projectDir: tempDir });

            expect(result.coveredApis).toBe(1);
            expect(result.uncoveredApis.length).toBe(2);
            expect(result.apiCoverage).toBeLessThan(100);
        });

        it("should format report correctly", () => {
            const result = {
                uncoveredPages: [{ path: "/pages/transfer/index", source: "router-config" as const, framework: "uniapp" }],
                uncoveredApis: [{ path: "/api/transfer/search", source: "api-dir" as const }],
                coveredPages: 1,
                coveredApis: 0,
                pageCoverage: 50,
                apiCoverage: 0,
                suggestions: [
                    {
                        targetType: "page" as const,
                        targetPath: "/pages/transfer/index",
                        suggestedFileName: "pages-transfer-index.spec.ts",
                        reason: "页面缺少 E2E 测试覆盖",
                    },
                ],
            };

            const report = formatE2EGapReport(result);
            expect(report).toContain("E2E 测试覆盖缺口检测报告");
            expect(report).toContain("pages/transfer/index");
            expect(report).toContain("50%");

            const json = formatE2EGapJson(result);
            expect(json).toHaveProperty("summary");
            expect(json).toHaveProperty("uncoveredPages");
            expect(json).toHaveProperty("suggestions");
        });
    });
});
