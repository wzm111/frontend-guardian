/**
 * v3.5.0 P1 — Strategy tiers & Compliance report
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RuleRegistry, createRegistry } from "../src/rules/registry.js";
import type { Rule, ScanResult, Issue, Severity } from "../src/types.js";
import { createEngine } from "../src/engine/rule-engine.js";
import {
    generateComplianceReport,
    complianceReportToMarkdown,
    getComplianceMapping,
    registerComplianceMapping,
    type RuleComplianceMapping,
} from "../src/utils/compliance.js";

// ─────────────────────────────────────────────────────────────────────────────
// Strategy Tiers
// ─────────────────────────────────────────────────────────────────────────────

describe("v3.5.0 — Scan Strategy Tiers", () => {
    const makeRule = (
        id: string,
        severity: Severity,
        defaultEnabled: boolean
    ): Rule =>
        ({
            id,
            name: id,
            description: "test",
            severity,
            category: "security",
            defaultEnabled,
            execute: () => [],
        }) as Rule;

    it("strict strategy should enable disabled rules", () => {
        const registry = createRegistry();
        registry.register(makeRule("r1", "critical", true));
        registry.register(makeRule("r2", "warning", false));
        registry.register(makeRule("r3", "suggestion", false));

        expect(registry.getActiveRules().length).toBe(1); // only r1

        registry.applyStrategy("strict");
        const active = registry.getActiveRules();
        expect(active.length).toBe(3);
        expect(active.map((r) => r.id).sort()).toEqual(["r1", "r2", "r3"]);
    });

    it("loose strategy should disable suggestion rules", () => {
        const registry = createRegistry();
        registry.register(makeRule("r1", "critical", true));
        registry.register(makeRule("r2", "warning", true));
        registry.register(makeRule("r3", "suggestion", true));

        expect(registry.getActiveRules().length).toBe(3);

        registry.applyStrategy("loose");
        const active = registry.getActiveRules();
        expect(active.length).toBe(2);
        expect(active.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    });

    it("standard strategy should not change anything", () => {
        const registry = createRegistry();
        registry.register(makeRule("r1", "critical", true));
        registry.register(makeRule("r2", "warning", true));
        registry.register(makeRule("r3", "suggestion", true));

        registry.applyStrategy("standard");
        expect(registry.getActiveRules().length).toBe(3);
    });

    it("strict + loose combo should work correctly", () => {
        const registry = createRegistry();
        registry.register(makeRule("r1", "critical", true));
        registry.register(makeRule("r2", "warning", false));
        registry.register(makeRule("r3", "suggestion", false));

        // strict first: enables all
        registry.applyStrategy("strict");
        expect(registry.getActiveRules().length).toBe(3);

        // then loose: disables suggestion
        registry.applyStrategy("loose");
        const active = registry.getActiveRules();
        expect(active.length).toBe(2);
        expect(active.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    });

    it("should preserve config overrides after strategy", () => {
        const registry = createRegistry();
        registry.register(makeRule("r1", "critical", true));
        registry.register(makeRule("r2", "warning", true));

        registry.loadFromConfig([{ id: "r2", enabled: false }]);
        expect(registry.getActiveRules().length).toBe(1); // only r1

        registry.applyStrategy("strict");
        // r2 is still disabled by config override
        expect(registry.getActiveRules().length).toBe(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Compliance Report
// ─────────────────────────────────────────────────────────────────────────────

describe("v3.5.0 — Compliance Report", () => {
    const makeResult = (module: string, issues: Issue[]): ScanResult => ({
        module,
        total: issues.length,
        issues: {
            critical: issues.filter((i) => i.severity === "critical"),
            warning: issues.filter((i) => i.severity === "warning"),
            suggestion: issues.filter((i) => i.severity === "suggestion"),
        },
        duration: 100,
        filesScanned: 10,
        filesWithIssues: issues.length > 0 ? 1 : 0,
    });

    const makeIssue = (ruleId: string, severity: Severity): Issue =>
        ({
            ruleId,
            title: `Test ${ruleId}`,
            description: "test description",
            severity,
            file: "src/test.js",
            line: 1,
            column: 1,
        }) as Issue;

    it("should generate a compliance report with correct summary", () => {
        const results = [
            makeResult("security", [
                makeIssue("security-xss-vulnerable", "critical"),
                makeIssue("security-eval-usage", "warning"),
            ]),
            makeResult("a11y", [
                makeIssue("a11y-missing-alt", "warning"),
                makeIssue("a11y-missing-label", "suggestion"),
            ]),
        ];

        const report = generateComplianceReport(results, "test-project", "standard");

        expect(report.project).toBe("test-project");
        expect(report.strategy).toBe("standard");
        expect(report.summary.totalIssues).toBe(4);
        expect(report.summary.criticalIssues).toBe(1);
        expect(report.findings.length).toBeGreaterThan(0);
    });

    it("should calculate compliance score correctly", () => {
        // All clean = high score
        const cleanResults = [makeResult("security", [])];
        const cleanReport = generateComplianceReport(cleanResults, "p1");
        expect(cleanReport.summary.complianceScore).toBe(100);

        // With issues = lower score
        const badResults = [
            makeResult("security", [
                makeIssue("security-xss-vulnerable", "critical"),
                makeIssue("security-eval-usage", "warning"),
            ]),
        ];
        const badReport = generateComplianceReport(badResults, "p2");
        expect(badReport.summary.complianceScore).toBeLessThan(100);
        expect(badReport.summary.complianceScore).toBeGreaterThanOrEqual(0);
    });

    it("should group issues by control", () => {
        const results = [
            makeResult("security", [
                makeIssue("security-xss-vulnerable", "critical"),
                makeIssue("security-hardcoded-secret", "critical"),
            ]),
        ];

        const report = generateComplianceReport(results, "p");

        // security-xss-vulnerable maps to SOC2-CC7.1
        // security-hardcoded-secret maps to SOC2-CC6.1
        const soc71 = report.findings.find((f) => f.control.code === "SOC2-CC7.1");
        const soc61 = report.findings.find((f) => f.control.code === "SOC2-CC6.1");

        expect(soc71).toBeDefined();
        expect(soc71!.issues.length).toBe(1);
        expect(soc61).toBeDefined();
        expect(soc61!.issues.length).toBe(1);
    });

    it("should generate recommendations with correct priority", () => {
        const results = [
            makeResult("security", [
                makeIssue("security-xss-vulnerable", "critical"),
                makeIssue("security-eval-usage", "warning"),
            ]),
        ];

        const report = generateComplianceReport(results, "p");
        expect(report.recommendations.length).toBeGreaterThan(0);

        const criticalRec = report.recommendations.find(
            (r) => r.control.code === "SOC2-CC7.1"
        );
        expect(criticalRec).toBeDefined();
        expect(criticalRec!.priority).toBe("immediate");
    });

    it("should produce valid markdown output", () => {
        const results = [
            makeResult("security", [makeIssue("security-xss-vulnerable", "critical")]),
        ];
        const report = generateComplianceReport(results, "p");
        const md = complianceReportToMarkdown(report);

        expect(md).toContain("# Code Quality Compliance Report");
        expect(md).toContain("p");
        expect(md).toContain("Executive Summary");
        expect(md).toContain(String(report.summary.complianceScore));
        expect(md).toContain("SOC2-CC7.1");
        expect(md).toContain("Remediation Recommendations");
    });

    it("should handle empty results gracefully", () => {
        const report = generateComplianceReport([], "empty-project");
        expect(report.summary.totalIssues).toBe(0);
        expect(report.summary.complianceScore).toBe(100);
        expect(report.findings.length).toBe(0);
        expect(report.recommendations.length).toBe(0);

        const md = complianceReportToMarkdown(report);
        expect(md).toContain("No compliance-related issues found.");
    });

    it("should return undefined for unmapped rules", () => {
        expect(getComplianceMapping("non-existent-rule")).toBeUndefined();
        expect(getComplianceMapping("security-xss-vulnerable")).toBeDefined();
    });

    it("should support custom compliance mapping", () => {
        const customMapping: RuleComplianceMapping = {
            ruleId: "custom-rule-1",
            controls: [
                {
                    code: "CUSTOM-1",
                    name: "自定义控制项",
                    standard: "INTERNAL",
                    description: "测试",
                },
            ],
            impact: "high",
        };

        registerComplianceMapping(customMapping);
        expect(getComplianceMapping("custom-rule-1")).toBeDefined();
        expect(getComplianceMapping("custom-rule-1")!.controls[0].code).toBe("CUSTOM-1");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Strategy Integration with RuleEngine
// ─────────────────────────────────────────────────────────────────────────────

describe("v3.5.0 — Strategy + RuleEngine Integration", () => {
    it("should pass strategy through EngineOptions", () => {
        const engine = createEngine({
            projectDir: process.cwd(),
            strategy: "strict",
        });
        expect(engine).toBeDefined();
    });
});
