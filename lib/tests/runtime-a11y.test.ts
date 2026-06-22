/**
 * v3.10.0: 运行时无障碍检测测试
 */

import { describe, expect, it, vi } from "vitest";
import {
    axeViolationsToIssues,
    isAxeCoreAvailable,
    mapAxeImpact,
    runAxeOnPage,
} from "../src/utils/runtime-a11y.js";

vi.mock("axe-core", () => ({
    source: "/* axe source */",
}));

describe("runtime-a11y", () => {
    describe("availability", () => {
        it("未安装时返回 false", () => {
            vi.stubGlobal("require", { resolve: vi.fn(() => { throw new Error("not found"); }) });
            expect(isAxeCoreAvailable()).toBe(false);
            vi.unstubAllGlobals();
        });
    });

    describe("mapAxeImpact", () => {
        it("critical/serious → critical", () => {
            expect(mapAxeImpact("critical")).toBe("critical");
            expect(mapAxeImpact("serious")).toBe("critical");
        });

        it("moderate → warning", () => {
            expect(mapAxeImpact("moderate")).toBe("warning");
        });

        it("minor → suggestion", () => {
            expect(mapAxeImpact("minor")).toBe("suggestion");
        });
    });

    describe("axeViolationsToIssues", () => {
        it("生成正确 ruleId 和 metadata", () => {
            const violations = [
                {
                    id: "image-alt",
                    impact: "critical" as const,
                    tags: ["wcag2a", "wcag111"],
                    help: "Images must have alternate text",
                    helpUrl: "https://dequeuniversity.com/rules/axe/4.0/image-alt",
                    nodes: [{ target: ["img"] }],
                },
            ];

            const issues = axeViolationsToIssues(violations, "/home", "http://localhost:3000/home");
            expect(issues.length).toBe(1);
            expect(issues[0].ruleId).toBe("page-health-a11y-runtime-image-alt");
            expect(issues[0].severity).toBe("critical");
            expect(issues[0].meta.axeRuleId).toBe("image-alt");
            expect(issues[0].meta.target).toEqual(["img"]);
        });
    });

    describe("runAxeOnPage", () => {
        it("注入 axe 并运行", async () => {
            const addScriptTag = vi.fn();
            const evaluate = vi.fn().mockResolvedValue({ violations: [] });
            const page = { addScriptTag, evaluate };

            await runAxeOnPage(page, ["wcag2a"]);
            expect(addScriptTag).toHaveBeenCalledWith({ content: "/* axe source */" });
            expect(evaluate).toHaveBeenCalled();
        });
    });
});
