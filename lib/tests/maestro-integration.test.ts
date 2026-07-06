/**
 * v4.0.0: Maestro 集成测试
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    maestroIntegration,
    parseMaestroJsonReport,
    parseMaestroJUnitReport,
    runMaestroAndCollect,
} from "../src/integrations/maestro.js";

vi.mock("../src/integrations/base.js", async (importOriginal) => {
    const mod = (await importOriginal()) as Record<string, unknown>;
    return {
        ...mod,
        runCommand: vi.fn(),
    };
});

import { runCommand } from "../src/integrations/base.js";

describe("Maestro integration", () => {
    let projectDir: string;
    const runCommandMock = vi.mocked(runCommand);

    beforeEach(() => {
        projectDir = mkdtempSync(join(tmpdir(), "fg-maestro-"));
        runCommandMock.mockReset();
    });

    afterEach(() => {
        rmSync(projectDir, { recursive: true, force: true });
    });

    describe("isAvailable", () => {
        it("returns true when .maestro/ directory exists", () => {
            mkdirSync(join(projectDir, ".maestro"));
            expect(maestroIntegration.isAvailable(projectDir)).toBe(true);
        });

        it("returns true when maestro.yaml exists", () => {
            writeFileSync(join(projectDir, "maestro.yaml"), "appId: com.example");
            expect(maestroIntegration.isAvailable(projectDir)).toBe(true);
        });

        it("returns true when maestro.yml exists", () => {
            writeFileSync(join(projectDir, "maestro.yml"), "appId: com.example");
            expect(maestroIntegration.isAvailable(projectDir)).toBe(true);
        });

        it("returns true when maestro is in package.json dependencies", () => {
            writeFileSync(
                join(projectDir, "package.json"),
                JSON.stringify({ dependencies: { maestro: "^1.0.0" } })
            );
            expect(maestroIntegration.isAvailable(projectDir)).toBe(true);
        });

        it("returns false for plain project", () => {
            writeFileSync(join(projectDir, "package.json"), JSON.stringify({}));
            expect(maestroIntegration.isAvailable(projectDir)).toBe(false);
        });
    });

    describe("parseMaestroJUnitReport", () => {
        it("converts failed JUnit cases into failed results", () => {
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite>
    <testcase name="login_flow" classname="iPhone 14" time="1.23">
      <failure message="Element not found: id=submit" type="AssertionError">/details</failure>
    </testcase>
  </testsuite>
</testsuites>`;
            const results = parseMaestroJUnitReport(xml);
            expect(results).toHaveLength(1);
            expect(results[0]).toMatchObject({
                flow: "login_flow",
                device: "iPhone 14",
                duration: 1230,
                status: "failed",
            });
            expect(results[0].failure?.message).toContain("Element not found");
        });

        it("converts passed JUnit cases into passed results", () => {
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite>
    <testcase name="home_flow" classname="Pixel 7" time="0.80"/>
  </testsuite>
</testsuites>`;
            const results = parseMaestroJUnitReport(xml);
            expect(results).toHaveLength(1);
            expect(results[0]).toMatchObject({
                flow: "home_flow",
                device: "Pixel 7",
                duration: 800,
                status: "passed",
            });
        });
    });

    describe("parseMaestroJsonReport", () => {
        it("parses array of flow results", () => {
            const json = JSON.stringify([
                { flow: "login", status: "passed", duration: 1200 },
                { flow: "checkout", status: "failed", duration: 800, failure: { message: "timeout" } },
            ]);
            const results = parseMaestroJsonReport(json);
            expect(results).toHaveLength(2);
            expect(results[1].status).toBe("failed");
            expect(results[1].failure?.message).toBe("timeout");
        });

        it("returns empty on invalid JSON", () => {
            expect(parseMaestroJsonReport("not json")).toEqual([]);
        });
    });

    describe("run", () => {
        it("returns maestro-cli-missing when CLI is not available", () => {
            mkdirSync(join(projectDir, ".maestro"));
            runCommandMock.mockReturnValue(null);
            const issues = maestroIntegration.run(projectDir);
            expect(issues).toHaveLength(1);
            expect(issues[0].ruleId).toBe("maestro-cli-missing");
        });

        it("returns failed issues from mocked JUnit report", () => {
            mkdirSync(join(projectDir, ".maestro"));
            runCommandMock.mockImplementation((cmd) => {
                if (cmd.includes("--version")) return "1.39.0";
                if (cmd.includes("maestro test")) {
                    const outputDir = join(projectDir, ".frontend-guardian", "maestro");
                    mkdirSync(outputDir, { recursive: true });
                    writeFileSync(
                        join(outputDir, "report.xml"),
                        `<?xml version="1.0"?>
<testsuites>
  <testsuite>
    <testcase name="login" classname="iPhone" time="1.0">
      <failure message="tap failed"></failure>
    </testcase>
  </testsuite>
</testsuites>`
                    );
                    return "";
                }
                return null;
            });

            const issues = maestroIntegration.run(projectDir);
            expect(issues).toHaveLength(1);
            expect(issues[0].ruleId).toBe("maestro-test-failed");
            expect(issues[0].title).toContain("login");
            expect(issues[0].meta).toMatchObject({ tool: "maestro", flow: "login", device: "iPhone" });
        });

        it("ignores passed flows", () => {
            mkdirSync(join(projectDir, ".maestro"));
            runCommandMock.mockImplementation((cmd) => {
                if (cmd.includes("--version")) return "1.39.0";
                if (cmd.includes("maestro test")) {
                    const outputDir = join(projectDir, ".frontend-guardian", "maestro");
                    mkdirSync(outputDir, { recursive: true });
                    writeFileSync(
                        join(outputDir, "report.xml"),
                        `<?xml version="1.0"?>
<testsuites>
  <testsuite>
    <testcase name="home" classname="Pixel" time="0.5"/>
  </testsuite>
</testsuites>`
                    );
                    return "";
                }
                return null;
            });

            const issues = maestroIntegration.run(projectDir);
            expect(issues).toHaveLength(0);
        });
    });
});

// Keep TypeScript happy about unused import
const _ = runMaestroAndCollect;
