/**
 * v4.0.0: Appium 集成测试
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appiumIntegration, parseAppiumWdioReport, runAppiumWdio } from "../src/integrations/appium.js";

vi.mock("../src/integrations/base.js", async (importOriginal) => {
    const mod = (await importOriginal()) as Record<string, unknown>;
    return {
        ...mod,
        runCommand: vi.fn(),
    };
});

import { runCommand } from "../src/integrations/base.js";

describe("Appium integration", () => {
    let projectDir: string;
    const runCommandMock = vi.mocked(runCommand);

    beforeEach(() => {
        projectDir = mkdtempSync(join(tmpdir(), "fg-appium-"));
        runCommandMock.mockReset();
    });

    afterEach(() => {
        rmSync(projectDir, { recursive: true, force: true });
    });

    describe("isAvailable", () => {
        it("returns true when wdio.conf.js contains appium capabilities", () => {
            writeFileSync(
                join(projectDir, "wdio.conf.js"),
                `exports.config = { capabilities: { appium:capabilities: { platformName: 'iOS' } } };`
            );
            expect(appiumIntegration.isAvailable(projectDir)).toBe(true);
        });

        it("returns true when appium is in package.json devDependencies", () => {
            writeFileSync(
                join(projectDir, "package.json"),
                JSON.stringify({ devDependencies: { appium: "^2.0.0" } })
            );
            expect(appiumIntegration.isAvailable(projectDir)).toBe(true);
        });

        it("returns true when @wdio/cli is in package.json", () => {
            writeFileSync(
                join(projectDir, "package.json"),
                JSON.stringify({ devDependencies: { "@wdio/cli": "^8.0.0" } })
            );
            expect(appiumIntegration.isAvailable(projectDir)).toBe(true);
        });

        it("returns false for plain project", () => {
            writeFileSync(join(projectDir, "package.json"), JSON.stringify({}));
            expect(appiumIntegration.isAvailable(projectDir)).toBe(false);
        });
    });

    describe("parseAppiumWdioReport", () => {
        it("parses array of WDIO test cases", () => {
            const json = JSON.stringify([
                {
                    testName: "login",
                    state: "passed",
                    duration: 1200,
                    sessionId: "abc123",
                    device: "iPhone 14",
                },
                {
                    testName: "checkout",
                    state: "failed",
                    duration: 800,
                    error: "Element not found",
                    sessionId: "abc123",
                    device: "iPhone 14",
                },
            ]);
            const cases = parseAppiumWdioReport(json);
            expect(cases).toHaveLength(2);
            expect(cases[1]).toMatchObject({
                testName: "checkout",
                state: "failed",
                error: "Element not found",
                sessionId: "abc123",
                device: "iPhone 14",
            });
        });

        it("returns empty on invalid JSON", () => {
            expect(parseAppiumWdioReport("not json")).toEqual([]);
        });
    });

    describe("run", () => {
        it("returns appium-no-wdio-config when only dependency exists", () => {
            writeFileSync(
                join(projectDir, "package.json"),
                JSON.stringify({ devDependencies: { appium: "^2.0.0" } })
            );
            const issues = appiumIntegration.run(projectDir);
            expect(issues).toHaveLength(1);
            expect(issues[0].ruleId).toBe("appium-no-wdio-config");
        });

        it("returns failed issues from mocked WDIO report", () => {
            writeFileSync(
                join(projectDir, "wdio.conf.js"),
                `exports.config = { capabilities: { appium:capabilities: {} } };`
            );
            runCommandMock.mockReturnValue(
                JSON.stringify([
                    {
                        testName: "login",
                        state: "failed",
                        error: "NoSuchElementError",
                        file: "test/specs/login.spec.js",
                        duration: 1200,
                        sessionId: "s1",
                        device: "Pixel 7",
                    },
                ])
            );

            const issues = appiumIntegration.run(projectDir);
            expect(runCommandMock).toHaveBeenCalledWith(
                expect.stringContaining("npx wdio run"),
                projectDir,
                300000
            );
            expect(issues).toHaveLength(1);
            expect(issues[0].ruleId).toBe("appium-test-failed");
            expect(issues[0].title).toContain("login");
            expect(issues[0].meta).toMatchObject({
                tool: "appium",
                device: "Pixel 7",
                sessionId: "s1",
            });
        });

        it("returns unparseable warning when WDIO output is empty", () => {
            writeFileSync(
                join(projectDir, "wdio.conf.js"),
                `exports.config = { capabilities: { appium:capabilities: {} } };`
            );
            runCommandMock.mockReturnValue("");

            const issues = appiumIntegration.run(projectDir);
            expect(issues).toHaveLength(1);
            expect(issues[0].ruleId).toBe("appium-wdio-output-unparseable");
        });
    });
});

// Keep TypeScript happy about unused import
const _ = runAppiumWdio;
