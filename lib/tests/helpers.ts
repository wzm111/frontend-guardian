/**
 * 测试辅助函数 — v2.2.0
 *
 * 通用工具：创建临时项目、构造 Issue / RuleContext 等
 */

import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Issue, Rule, RuleContext, Severity } from "../src/types.js";

/** 创建临时项目目录 */
export function createTempProject(): string {
    return mkdtempSync(join(tmpdir(), "fg-test-"));
}

/** 清理临时目录 */
export function cleanupTempProject(dir: string): void {
    try {
        rmSync(dir, { recursive: true, force: true });
    } catch {
        // ignore
    }
}

/** 在临时项目中写入文件 */
export function writeProjectFile(projectDir: string, relPath: string, content: string): void {
    const fullPath = join(projectDir, relPath);
    mkdirSync(resolve(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
}

/** 写入基础 package.json（让 detectProjectMeta 不报错） */
export function writeBasePackageJson(projectDir: string, extra?: Record<string, unknown>): void {
    writeFileSync(
        join(projectDir, "package.json"),
        JSON.stringify({ name: "test-project", ...extra }),
        "utf-8"
    );
}

/** 创建一条简单的测试规则 */
export function createTestRule(id: string, severity: Severity, message: string): Rule {
    return {
        id,
        name: `test-rule-${id}`,
        description: "Test rule",
        category: "test",
        severity,
        framework: ["react"],
        execute: (context: RuleContext) => {
            const issues: Issue[] = [];
            if (context.source.includes(message)) {
                issues.push({
                    ruleId: id,
                    title: `Found: ${message}`,
                    description: `Detected ${message} in file`,
                    severity,
                    file: context.filePath,
                    line: 1,
                    column: 1,
                    source: context.source.slice(0, 50),
                });
            }
            return issues;
        },
    };
}

/** 创建带 fix 的 Issue */
export function makeFixIssue(
    file: string,
    startLine: number,
    startCol: number,
    endLine: number,
    endCol: number,
    text: string,
    ruleId = "test-fix"
): Issue {
    return {
        ruleId,
        title: `Test fix ${ruleId}`,
        description: "Test description",
        severity: "warning",
        file,
        line: startLine,
        column: startCol,
        fix: {
            text,
            start: { line: startLine, column: startCol },
            end: { line: endLine, column: endCol },
        },
    };
}

/** 创建最小 RuleContext（用于不依赖 utils 的规则测试） */
export function createMinimalContext(source: string, filePath = "/test.js"): RuleContext {
    return {
        filePath,
        source,
        config: {},
        projectMeta: {
            platforms: ["pc"],
            hasTypeScript: false,
            hasI18n: false,
            scripts: {},
        },
        utils: {} as any,
    };
}
