/**
 * SARIF (Static Analysis Results Interchange Format) 格式化器
 *
 * 将 frontend-guardian 的 Issue 列表转换为 SARIF 2.1.0 JSON 格式，
 * 可被 GitHub Security tab、Azure DevOps 等 CI/CD 平台消费。
 *
 * 规范参考：https://docs.oasis-open.org/sarif/sarif/v2.1.0/cs01/sarif-v2.1.0-cs01.html
 */

import type { Issue, Severity } from "@/types.js";

/** SARIF 报告顶层结构 */
export interface SarifReport {
    $schema: string;
    version: string;
    runs: SarifRun[];
}

interface SarifRun {
    tool: {
        driver: {
            name: string;
            version: string;
            informationUri?: string;
            rules?: SarifRule[];
        };
    };
    results: SarifResult[];
    invocations?: SarifInvocation[];
}

interface SarifRule {
    id: string;
    name: string;
    shortDescription?: { text: string };
    fullDescription?: { text: string };
    defaultConfiguration?: { level: string };
}

interface SarifResult {
    ruleId: string;
    ruleIndex?: number;
    message: { text: string };
    level: "error" | "warning" | "note" | "none";
    locations: SarifLocation[];
    fixes?: SarifFix[];
}

interface SarifLocation {
    physicalLocation: {
        artifactLocation: {
            uri: string;
            uriBaseId?: string;
        };
        region: {
            startLine: number;
            startColumn?: number;
            endLine?: number;
            endColumn?: number;
            snippet?: { text: string };
        };
    };
}

interface SarifFix {
    description: { text: string };
    artifactChanges: {
        artifactLocation: { uri: string };
        replacements: {
            deletedRegion: {
                startLine: number;
                startColumn?: number;
                endLine?: number;
                endColumn?: number;
            };
            insertedContent: { text: string };
        }[];
    }[];
}

interface SarifInvocation {
    executionSuccessful: boolean;
    workingDirectory?: { uri: string };
}

/** severity → SARIF level 映射 */
function severityToLevel(severity: Severity): "error" | "warning" | "note" {
    switch (severity) {
        case "critical":
            return "error";
        case "warning":
            return "warning";
        case "suggestion":
            return "note";
    }
}

/** 构建 SARIF 规则定义（去重） */
function buildRules(issues: Issue[]): SarifRule[] {
    const seen = new Set<string>();
    const rules: SarifRule[] = [];
    for (const issue of issues) {
        if (seen.has(issue.ruleId)) continue;
        seen.add(issue.ruleId);
        rules.push({
            id: issue.ruleId,
            name: issue.ruleId,
            shortDescription: { text: issue.title },
            fullDescription: { text: issue.description },
            defaultConfiguration: { level: severityToLevel(issue.severity) },
        });
    }
    return rules;
}

/** 构建 SARIF 结果条目 */
function buildResult(issue: Issue, ruleIndexMap: Map<string, number>): SarifResult {
    const result: SarifResult = {
        ruleId: issue.ruleId,
        ruleIndex: ruleIndexMap.get(issue.ruleId),
        message: { text: `${issue.title}: ${issue.description}` },
        level: severityToLevel(issue.severity),
        locations: [
            {
                physicalLocation: {
                    artifactLocation: {
                        uri: issue.file,
                        uriBaseId: "PROJECT_ROOT",
                    },
                    region: {
                        startLine: issue.line,
                        startColumn: issue.column,
                        endLine: issue.endLine,
                        endColumn: issue.endColumn,
                        ...(issue.source ? { snippet: { text: issue.source } } : {}),
                    },
                },
            },
        ],
    };

    // 如果有 fix 信息，也加入 SARIF fixes
    if (issue.fix) {
        result.fixes = [
            {
                description: { text: issue.title },
                artifactChanges: [
                    {
                        artifactLocation: { uri: issue.file },
                        replacements: [
                            {
                                deletedRegion: {
                                    startLine: issue.fix.start.line,
                                    startColumn: issue.fix.start.column,
                                    endLine: issue.fix.end.line,
                                    endColumn: issue.fix.end.column,
                                },
                                insertedContent: { text: issue.fix.text },
                            },
                        ],
                    },
                ],
            },
        ];
    }

    return result;
}

/** 生成 SARIF 报告 */
export function generateSarif(
    issues: Issue[],
    options: {
        toolName?: string;
        toolVersion?: string;
        projectDir?: string;
    } = {}
): SarifReport {
    const rules = buildRules(issues);
    const ruleIndexMap = new Map<string, number>();
    rules.forEach((r, i) => ruleIndexMap.set(r.id, i));

    const results = issues.map((issue) => buildResult(issue, ruleIndexMap));

    const run: SarifRun = {
        tool: {
            driver: {
                name: options.toolName || "Frontend Guardian",
                version: options.toolVersion || "2.3.0",
                informationUri: "https://github.com/wzm111/frontend-guardian",
                rules,
            },
        },
        results,
        ...(options.projectDir
            ? {
                  invocations: [
                      {
                          executionSuccessful: true,
                          workingDirectory: { uri: options.projectDir },
                      },
                  ],
              }
            : {}),
    };

    return {
        $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
        version: "2.1.0",
        runs: [run],
    };
}

/** 将 SARIF 报告序列化为 JSON 字符串 */
export function formatSarif(issues: Issue[], options?: Parameters<typeof generateSarif>[1]): string {
    return JSON.stringify(generateSarif(issues, options), null, 2);
}
