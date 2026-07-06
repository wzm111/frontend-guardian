/**
 * v4.0.0: Maestro 移动端测试集成
 *
 * 调用 `maestro test` 执行 YAML flow，解析 JUnit/XML 报告，
 * 将失败 flow 转换为 frontend-guardian Issue。
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Issue } from "@/types.js";
import { TestHistoryReport } from "@/utils/test-history.js";
import type { ExternalTool } from "./base.js";
import { runCommand } from "./base.js";
import {
    detectMaestro,
    isMaestroCliAvailable,
    listMaestroFlowNames,
    parseJUnitXml,
} from "./mobile-shared.js";

export interface MaestroFlowResult {
    flow: string;
    device?: string;
    duration?: number;
    status: "passed" | "failed" | "skipped";
    failure?: { message: string; type?: string };
}

const DEFAULT_OUTPUT_DIR = ".frontend-guardian/maestro";

/** 解析 Maestro 可能输出的 JSON 报告（未来扩展） */
export function parseMaestroJsonReport(stdout: string): MaestroFlowResult[] {
    try {
        const report = JSON.parse(stdout) as unknown;
        if (Array.isArray(report)) {
            return report.map((item) => ({
                flow: String((item as { flow?: string }).flow || "unknown"),
                device: (item as { device?: string }).device,
                duration: (item as { duration?: number }).duration,
                status: normalizeStatus((item as { status?: string }).status),
                failure: (item as { failure?: { message: string; type?: string } }).failure,
            }));
        }
    } catch {
        // ignore
    }
    return [];
}

function normalizeStatus(status?: string): MaestroFlowResult["status"] {
    if (status === "passed" || status === "success") return "passed";
    if (status === "skipped" || status === "pending") return "skipped";
    return "failed";
}

/** 将 JUnit 用例转换为 Maestro flow 结果 */
export function parseMaestroJUnitReport(xml: string): MaestroFlowResult[] {
    return parseJUnitXml(xml).map((c) => ({
        flow: c.name,
        device: c.device,
        duration: c.duration,
        status: c.failure ? "failed" : "passed",
        failure: c.failure,
    }));
}

/** 执行 Maestro 并收集报告 */
export function runMaestroAndCollect(
    projectDir: string,
    flowDir: string,
    outputDir: string
): MaestroFlowResult[] {
    if (!isMaestroCliAvailable()) {
        return [];
    }

    mkdirSync(outputDir, { recursive: true });
    const reportXml = join(outputDir, "report.xml");

    runCommand(
        `maestro test "${flowDir}" --format junit --output "${reportXml}"`,
        projectDir,
        300000
    );

    if (existsSync(reportXml)) {
        try {
            const xml = readFileSync(reportXml, "utf-8");
            return parseMaestroJUnitReport(xml);
        } catch {
            // ignore
        }
    }

    return [];
}

/** 记录 Maestro 运行历史，用于 flaky 预警 */
function recordMaestroReport(projectDir: string, results: MaestroFlowResult[]): void {
    try {
        const report = new TestHistoryReport(projectDir);
        report.recordRun(
            results.map((r) => ({
                testFile: r.flow,
                status: r.status,
                duration: r.duration,
            }))
        );
    } catch {
        // ignore persistence failures
    }
}

export const maestroIntegration: ExternalTool = {
    name: "Maestro",

    isAvailable(projectDir: string): boolean {
        const detected = detectMaestro(projectDir);
        return Boolean(detected.flowDir || detected.configFile || hasMaestroDependency(projectDir));
    },

    run(projectDir: string, _files?: string[]): Issue[] {
        if (!isMaestroCliAvailable()) {
            return [
                {
                    ruleId: "maestro-cli-missing",
                    title: "未检测到 Maestro CLI",
                    description:
                        "项目包含 Maestro 配置，但当前环境未安装 maestro CLI。请访问 https://maestro.mobile.dev 安装。",
                    severity: "suggestion",
                    file: "package.json",
                    line: 1,
                    column: 1,
                    meta: { tool: "maestro" },
                },
            ];
        }

        const detected = detectMaestro(projectDir);
        const flowDir = detected.flowDir || join(projectDir, ".maestro");
        if (!existsSync(flowDir)) {
            return [
                {
                    ruleId: "maestro-report-unparseable",
                    title: "Maestro flow 目录不存在",
                    description: `未找到 Maestro flow 目录: ${flowDir}`,
                    severity: "warning",
                    file: "package.json",
                    line: 1,
                    column: 1,
                    meta: { tool: "maestro" },
                },
            ];
        }

        const outputDir = join(projectDir, DEFAULT_OUTPUT_DIR);
        const results = runMaestroAndCollect(projectDir, flowDir, outputDir);
        recordMaestroReport(projectDir, results);

        if (results.length === 0) {
            return [
                {
                    ruleId: "maestro-report-unparseable",
                    title: "无法解析 Maestro 测试报告",
                    description:
                        "Maestro 已执行，但未能解析 JUnit 报告。请检查 maestro 版本或手动运行 `maestro test --format junit`。",
                    severity: "warning",
                    file: "package.json",
                    line: 1,
                    column: 1,
                    meta: { tool: "maestro" },
                },
            ];
        }

        const issues: Issue[] = [];
        for (const r of results) {
            if (r.status === "failed") {
                issues.push({
                    ruleId: "maestro-test-failed",
                    title: `Maestro flow 失败: ${r.flow}`,
                    description: r.failure?.message || "Maestro flow 执行失败",
                    severity: "critical",
                    file: r.flow,
                    line: 1,
                    column: 1,
                    source: r.failure?.message,
                    meta: {
                        tool: "maestro",
                        flow: r.flow,
                        device: r.device,
                        duration: r.duration,
                    },
                });
            }
        }

        return issues;
    },
};

function hasMaestroDependency(projectDir: string): boolean {
    try {
        const pkgPath = join(projectDir, "package.json");
        if (!existsSync(pkgPath)) return false;
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        return "maestro" in deps;
    } catch {
        return false;
    }
}

export { listMaestroFlowNames };
