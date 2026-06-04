/**
 * Compliance Report Generator -- v3.5.0
 *
 * Generates SOC2 / ISO27001 style code quality compliance reports.
 * Maps scan results to specific compliance controls, outputs audit-friendly Markdown.
 */

import type { Issue, ScanResult, Severity } from "@/types.js";

/** Compliance control definition */
export interface ComplianceControl {
    code: string;
    name: string;
    standard: "SOC2" | "ISO27001" | "WCAG" | "INTERNAL";
    description: string;
}

/** Rule to compliance control mapping */
export interface RuleComplianceMapping {
    ruleId: string;
    controls: ComplianceControl[];
    impact: "high" | "medium" | "low";
}

/** Predefined rule-compliance mapping table */
const DEFAULT_MAPPINGS: RuleComplianceMapping[] = [
    {
        ruleId: "security-xss-vulnerable",
        controls: [
            { code: "SOC2-CC7.1", name: "System Operations Monitoring", standard: "SOC2", description: "Detect and log code defects that may affect system security" },
            { code: "ISO27001-A.12.4", name: "Logging and Monitoring", standard: "ISO27001", description: "Ensure system activities are logged and monitored" },
        ],
        impact: "high",
    },
    {
        ruleId: "security-eval-usage",
        controls: [
            { code: "SOC2-CC7.1", name: "System Operations Monitoring", standard: "SOC2", description: "Prohibit dangerous code execution methods" },
            { code: "ISO27001-A.12.6", name: "Technical Vulnerability Management", standard: "ISO27001", description: "Timely fix known technical vulnerabilities" },
        ],
        impact: "high",
    },
    {
        ruleId: "security-hardcoded-secret",
        controls: [
            { code: "SOC2-CC6.1", name: "Logical and Physical Access Controls", standard: "SOC2", description: "Credentials must not be hardcoded in source code" },
            { code: "ISO27001-A.9.4.3", name: "Password Management", standard: "ISO27001", description: "Passwords must not be stored or hardcoded in plaintext" },
        ],
        impact: "high",
    },
    {
        ruleId: "a11y-missing-alt",
        controls: [
            { code: "WCAG-2.1-1.1.1", name: "Non-text Content", standard: "WCAG", description: "All non-text content must have text alternatives" },
            { code: "ISO27001-A.18.1", name: "Compliance", standard: "ISO27001", description: "Comply with applicable laws, regulations, and contractual requirements" },
        ],
        impact: "medium",
    },
    {
        ruleId: "a11y-missing-label",
        controls: [
            { code: "WCAG-2.1-3.3.2", name: "Labels or Instructions", standard: "WCAG", description: "UI components must have clear labels" },
        ],
        impact: "medium",
    },
    {
        ruleId: "a11y-clickable-no-keyboard",
        controls: [
            { code: "WCAG-2.1-2.1.1", name: "Keyboard", standard: "WCAG", description: "All functionality must be operable through a keyboard" },
        ],
        impact: "medium",
    },
    {
        ruleId: "perf-large-bundle",
        controls: [
            { code: "INTERNAL-SLA-1", name: "Performance SLA", standard: "INTERNAL", description: "First screen load time must meet internal SLA requirements" },
        ],
        impact: "medium",
    },
    {
        ruleId: "perf-usememo-missing",
        controls: [
            { code: "INTERNAL-SLA-1", name: "Performance SLA", standard: "INTERNAL", description: "Avoid unnecessary re-renders" },
        ],
        impact: "low",
    },
    {
        ruleId: "i18n-hardcoded-chinese",
        controls: [
            { code: "INTERNAL-I18N-1", name: "Internationalization Compliance", standard: "INTERNAL", description: "All product copy must go through the i18n system" },
        ],
        impact: "medium",
    },
    {
        ruleId: "i18n-missing-key",
        controls: [
            { code: "INTERNAL-I18N-1", name: "Internationalization Compliance", standard: "INTERNAL", description: "i18n keys must be fully defined" },
        ],
        impact: "medium",
    },
    {
        ruleId: "cross-file-circular-dep",
        controls: [
            { code: "INTERNAL-ARCH-1", name: "Architecture Compliance", standard: "INTERNAL", description: "Modules must not have circular dependencies" },
        ],
        impact: "medium",
    },
];

/** Compliance report structure */
export interface ComplianceReport {
    timestamp: string;
    project: string;
    strategy: string;
    summary: {
        totalIssues: number;
        criticalIssues: number;
        highImpactControls: number;
        complianceScore: number;
    };
    findings: ComplianceFinding[];
    recommendations: ComplianceRecommendation[];
}

/** Single non-compliance finding */
export interface ComplianceFinding {
    control: ComplianceControl;
    issues: Issue[];
    severity: Severity;
}

/** Remediation recommendation */
export interface ComplianceRecommendation {
    control: ComplianceControl;
    priority: "immediate" | "short-term" | "long-term";
    action: string;
    estimatedEffort: string;
}

/** Generate compliance report */
export function generateComplianceReport(
    results: ScanResult[],
    projectName: string,
    strategy = "standard",
    mappings = DEFAULT_MAPPINGS
): ComplianceReport {
    const timestamp = new Date().toISOString();
    const allIssues = results.flatMap((r) => [...r.issues.critical, ...r.issues.warning, ...r.issues.suggestion]);

    const findingsMap = new Map<string, ComplianceFinding>();
    const severityOrder: Record<Severity, number> = { critical: 3, warning: 2, suggestion: 1 };

    for (const issue of allIssues) {
        const mapping = mappings.find((m) => m.ruleId === issue.ruleId);
        if (!mapping) continue;

        for (const control of mapping.controls) {
            const key = control.code;
            const existing = findingsMap.get(key);
            if (existing) {
                existing.issues.push(issue);
                if (severityOrder[issue.severity] > severityOrder[existing.severity]) {
                    existing.severity = issue.severity;
                }
            } else {
                findingsMap.set(key, {
                    control,
                    issues: [issue],
                    severity: issue.severity,
                });
            }
        }
    }

    const findings = Array.from(findingsMap.values()).sort(
        (a, b) => severityOrder[b.severity] - severityOrder[a.severity]
    );

    const criticalIssues = allIssues.filter((i) => i.severity === "critical").length;
    const highImpactControls = findings.filter((f) => f.severity === "critical").length;

    const scoreBase = criticalIssues * 10
        + allIssues.filter((i) => i.severity === "warning").length * 3
        + allIssues.filter((i) => i.severity === "suggestion").length;
    const complianceScore = Math.max(0, Math.round(100 - scoreBase / Math.max(allIssues.length, 1) * 5));

    const recommendations: ComplianceRecommendation[] = findings.map((f) => {
        const priority: ComplianceRecommendation["priority"] =
            f.severity === "critical" ? "immediate" : f.severity === "warning" ? "short-term" : "long-term";
        const ruleIds = [...new Set(f.issues.map((i) => i.ruleId))].join(", ");
        return {
            control: f.control,
            priority,
            action: `Fix ${f.issues.length} issues related to "${f.control.name}", rules: ${ruleIds}`,
            estimatedEffort: f.issues.length <= 3 ? "1-2 days" : f.issues.length <= 10 ? "3-5 days" : "1-2 weeks",
        };
    });

    return {
        timestamp,
        project: projectName,
        strategy,
        summary: {
            totalIssues: allIssues.length,
            criticalIssues,
            highImpactControls,
            complianceScore,
        },
        findings,
        recommendations,
    };
}

/** Convert compliance report to Markdown */
export function complianceReportToMarkdown(report: ComplianceReport): string {
    const lines: string[] = [];

    lines.push("# Code Quality Compliance Report");
    lines.push("");
    lines.push(`**Project**: ${report.project}`);
    lines.push(`**Generated**: ${report.timestamp}`);
    lines.push(`**Strategy**: ${report.strategy}`);
    lines.push("");

    // Executive summary
    lines.push("## Executive Summary");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(`| Total Issues | ${report.summary.totalIssues} |`);
    lines.push(`| Critical | ${report.summary.criticalIssues} |`);
    lines.push(`| High Impact Controls | ${report.summary.highImpactControls} |`);
    lines.push(`| Compliance Score | ${report.summary.complianceScore}/100 |`);
    lines.push("");

    if (report.summary.complianceScore >= 90) {
        lines.push("> PASS - Excellent: Code quality meets enterprise compliance requirements.");
    } else if (report.summary.complianceScore >= 70) {
        lines.push("> WARNING - Good: Some improvements recommended, address warning issues in the short term.");
    } else if (report.summary.complianceScore >= 50) {
        lines.push("> NEEDS IMPROVEMENT - Multiple non-compliances found, remediation plan recommended.");
    } else {
        lines.push("> FAIL - Serious compliance risks detected, immediate remediation required.");
    }
    lines.push("");

    // Findings
    if (report.findings.length > 0) {
        lines.push("## Non-Compliance Findings");
        lines.push("");

        for (const finding of report.findings) {
            const icon = finding.severity === "critical" ? "🔴" : finding.severity === "warning" ? "🟡" : "💡";
            lines.push(`### ${icon} ${finding.control.code} -- ${finding.control.name}`);
            lines.push("");
            lines.push(`- **Standard**: ${finding.control.standard}`);
            lines.push(`- **Description**: ${finding.control.description}`);
            lines.push(`- **Severity**: ${finding.severity}`);
            lines.push(`- **Issues**: ${finding.issues.length}`);
            lines.push("");

            const topIssues = finding.issues.slice(0, 5);
            for (const issue of topIssues) {
                lines.push(`  - \`${issue.file}:${issue.line}\` -- ${issue.title}`);
            }
            if (finding.issues.length > 5) {
                lines.push(`  - ... ${finding.issues.length - 5} more`);
            }
            lines.push("");
        }
    } else {
        lines.push("## Non-Compliance Findings");
        lines.push("");
        lines.push("No compliance-related issues found.");
        lines.push("");
    }

    // Recommendations
    if (report.recommendations.length > 0) {
        lines.push("## Remediation Recommendations");
        lines.push("");
        lines.push("| Priority | Control | Action | Est. Effort |");
        lines.push("|----------|---------|--------|-------------|");

        const priorityIcon: Record<string, string> = { immediate: "🔴", "short-term": "🟡", "long-term": "💡" };
        for (const rec of report.recommendations) {
            lines.push(
                `| ${priorityIcon[rec.priority]} ${rec.priority} | ${rec.control.code} | ${rec.action} | ${rec.estimatedEffort} |`
            );
        }
        lines.push("");
    }

    // Control mapping reference
    lines.push("## Control Mapping Reference");
    lines.push("");
    lines.push("| Standard | Control | Name |");
    lines.push("|----------|---------|------|");

    const seenControls = new Set<string>();
    for (const finding of report.findings) {
        if (!seenControls.has(finding.control.code)) {
            seenControls.add(finding.control.code);
            lines.push(`| ${finding.control.standard} | ${finding.control.code} | ${finding.control.name} |`);
        }
    }
    lines.push("");

    lines.push("---");
    lines.push("*Generated by frontend-guardian*");

    return lines.join("\n");
}

/** Save compliance report to file */
export function saveComplianceReport(report: ComplianceReport, outputPath: string): void {
    const { writeFileSync } = require("node:fs");
    writeFileSync(outputPath, complianceReportToMarkdown(report), "utf-8");
}

/** Get compliance mapping for a rule (for extensions) */
export function getComplianceMapping(ruleId: string): RuleComplianceMapping | undefined {
    return DEFAULT_MAPPINGS.find((m) => m.ruleId === ruleId);
}

/** Register custom compliance mapping */
export function registerComplianceMapping(mapping: RuleComplianceMapping): void {
    const existing = DEFAULT_MAPPINGS.findIndex((m) => m.ruleId === mapping.ruleId);
    if (existing >= 0) {
        DEFAULT_MAPPINGS[existing] = mapping;
    } else {
        DEFAULT_MAPPINGS.push(mapping);
    }
}
