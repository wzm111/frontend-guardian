/**
 * v4.0.0: 移动端页面健康检查测试
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    detectWhiteScreen,
    generateAppiumSpec,
    generateMaestroFlow,
    resolveAppId,
    resolveMobileRoutes,
    runMobilePageHealthCheck,
} from "../src/integrations/mobile-page-health.js";

vi.mock("../src/integrations/base.js", async (importOriginal) => {
    const mod = (await importOriginal()) as Record<string, unknown>;
    return {
        ...mod,
        runCommand: vi.fn(),
    };
});

vi.mock("../src/utils/visual-regression.js", async (importOriginal) => {
    const mod = (await importOriginal()) as Record<string, unknown>;
    return {
        ...mod,
        isPngjsAvailable: vi.fn(() => false),
    };
});

import { runCommand } from "../src/integrations/base.js";
import { isPngjsAvailable } from "../src/utils/visual-regression.js";

describe("Mobile page health", () => {
    let projectDir: string;
    const runCommandMock = vi.mocked(runCommand);
    const isPngjsAvailableMock = vi.mocked(isPngjsAvailable);

    beforeEach(() => {
        projectDir = mkdtempSync(join(tmpdir(), "fg-mobile-health-"));
        runCommandMock.mockReset();
        isPngjsAvailableMock.mockReturnValue(false);
    });

    afterEach(() => {
        rmSync(projectDir, { recursive: true, force: true });
    });

    describe("resolveMobileRoutes", () => {
        it("returns explicit routes", () => {
            expect(resolveMobileRoutes(projectDir, ["home", "profile"])).toEqual(["home", "profile"]);
        });

        it("falls back to Maestro flow names", () => {
            mkdirSync(join(projectDir, ".maestro"));
            writeFileSync(join(projectDir, ".maestro", "home.yaml"), "");
            writeFileSync(join(projectDir, ".maestro", "profile.yaml"), "");
            expect(resolveMobileRoutes(projectDir)).toEqual(["home", "profile"]);
        });

        it("returns empty when nothing found", () => {
            expect(resolveMobileRoutes(projectDir)).toEqual([]);
        });
    });

    describe("resolveAppId", () => {
        it("returns explicit appId", () => {
            expect(resolveAppId(projectDir, "com.example")).toBe("com.example");
        });

        it("parses appId from maestro.yaml", () => {
            writeFileSync(join(projectDir, "maestro.yaml"), "appId: com.example.app\n---");
            expect(resolveAppId(projectDir)).toBe("com.example.app");
        });
    });

    describe("generateMaestroFlow", () => {
        it("contains appId and screenshot", () => {
            const flow = generateMaestroFlow("home", "com.example", "/tmp/home.png");
            expect(flow).toContain("appId: com.example");
            expect(flow).toContain("takeScreenshot");
        });
    });

    describe("generateAppiumSpec", () => {
        it("contains route and screenshot", () => {
            const spec = generateAppiumSpec("home", "com.example", "/tmp/home.png");
            expect(spec).toContain("mobile-page-health");
            expect(spec).toContain("saveScreenshot");
        });
    });

    describe("detectWhiteScreen", () => {
        it("returns null when pngjs unavailable", async () => {
            const result = await detectWhiteScreen("/tmp/nonexistent.png");
            expect(result).toBeNull();
        });
    });

    describe("runMobilePageHealthCheck", () => {
        it("returns tool-missing issue when no mobile tool configured", async () => {
            writeFileSync(join(projectDir, "package.json"), JSON.stringify({}));
            const result = await runMobilePageHealthCheck({ projectDir });
            expect(result.issues).toHaveLength(1);
            expect(result.issues[0].ruleId).toBe("mobile-page-health-tool-missing");
        });

        it("throws when routes are empty", async () => {
            mkdirSync(join(projectDir, ".maestro"));
            writeFileSync(join(projectDir, ".maestro", "home.yaml"), "");
            runCommandMock.mockImplementation((cmd) => {
                if (cmd.includes("--version")) return "1.39.0";
                return "";
            });

            await expect(
                runMobilePageHealthCheck({ projectDir, tool: "maestro", routes: [], appId: "com.example" })
            ).rejects.toThrow("需要指定 --mobile-routes");
        });

        it("detects crash from Maestro JUnit failure", async () => {
            mkdirSync(join(projectDir, ".maestro"));
            writeFileSync(join(projectDir, ".maestro", "home.yaml"), "");
            runCommandMock.mockImplementation((cmd) => {
                if (cmd.includes("--version")) return "1.39.0";
                if (cmd.includes("maestro test")) {
                    const outputDir = join(projectDir, ".frontend-guardian", "mobile", "maestro");
                    mkdirSync(outputDir, { recursive: true });
                    writeFileSync(
                        join(outputDir, "home.xml"),
                        `<?xml version="1.0"?>
<testsuites>
  <testsuite>
    <testcase name="home" classname="iPhone" time="1.0">
      <failure message="App crashed: process died"></failure>
    </testcase>
  </testsuite>
</testsuites>`
                    );
                    return "";
                }
                return null;
            });

            const result = await runMobilePageHealthCheck({
                projectDir,
                routes: ["home"],
                appId: "com.example",
            });
            expect(result.issues).toHaveLength(1);
            expect(result.issues[0].ruleId).toBe("mobile-page-health-crash");
            expect(result.checkedPages[0].status).toBe("error");
        });

        it("detects ANR from Maestro JUnit failure", async () => {
            mkdirSync(join(projectDir, ".maestro"));
            writeFileSync(join(projectDir, ".maestro", "home.yaml"), "");
            runCommandMock.mockImplementation((cmd) => {
                if (cmd.includes("--version")) return "1.39.0";
                if (cmd.includes("maestro test")) {
                    const outputDir = join(projectDir, ".frontend-guardian", "mobile", "maestro");
                    mkdirSync(outputDir, { recursive: true });
                    writeFileSync(
                        join(outputDir, "home.xml"),
                        `<?xml version="1.0"?>
<testsuites>
  <testsuite>
    <testcase name="home" classname="iPhone" time="10.0">
      <failure message="Application not responding"></failure>
    </testcase>
  </testsuite>
</testsuites>`
                    );
                    return "";
                }
                return null;
            });

            const result = await runMobilePageHealthCheck({
                projectDir,
                routes: ["home"],
                appId: "com.example",
            });
            expect(result.issues[0].ruleId).toBe("mobile-page-health-anr");
        });
    });
});
