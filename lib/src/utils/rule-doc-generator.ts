/**
 * v3.18.0: 规则文档生成器
 *
 * 从 Rule 元数据生成 Markdown 文档。
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GenerateRuleDocsOptions, Rule } from "@/types.js";

export interface GeneratedRuleDocs {
    outputDir: string;
    files: string[];
}

function ensureDir(dir: string): void {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

function toTitle(ruleId: string): string {
    return ruleId
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

/** 生成单条规则的 Markdown 文档 */
export function generateRuleDoc(rule: Rule, options: { includeExamples?: boolean } = {}): string {
    const includeExamples = options.includeExamples ?? true;
    const lines: string[] = [];

    lines.push(`# ${rule.name || toTitle(rule.id)}`);
    lines.push("");
    lines.push(`**规则 ID**: \`${rule.id}\``);
    lines.push("");
    lines.push(`**描述**: ${rule.description || "暂无描述"}`);
    lines.push("");
    lines.push(`**严重级别**: ${rule.severity}`);
    lines.push("");
    lines.push(`**分类**: ${rule.category}`);
    lines.push("");
    lines.push(`**默认启用**: ${rule.defaultEnabled ? "是" : "否"}`);
    lines.push("");

    if (rule.frameworks && rule.frameworks.length > 0) {
        lines.push(`**适用框架**: ${rule.frameworks.join(", ")}`);
        lines.push("");
    }

    if (rule.platforms && rule.platforms.length > 0) {
        lines.push(`**适用平台**: ${rule.platforms.join(", ")}`);
        lines.push("");
    }

    if (rule.componentLibs && rule.componentLibs.length > 0) {
        lines.push(`**适用组件库**: ${rule.componentLibs.join(", ")}`);
        lines.push("");
    }

    if (rule.docsUrl) {
        lines.push(`**文档链接**: [${rule.docsUrl}](${rule.docsUrl})`);
        lines.push("");
    }

    if (rule.conflictsWith && rule.conflictsWith.length > 0) {
        lines.push(`**冲突规则**: ${rule.conflictsWith.map((id) => `\`${id}\``).join(", ")}`);
        lines.push("");
    }

    if (rule.requires && rule.requires.length > 0) {
        lines.push(`**依赖规则**: ${rule.requires.map((id) => `\`${id}\``).join(", ")}`);
        lines.push("");
    }

    if (rule.supersedes && rule.supersedes.length > 0) {
        lines.push(`**取代规则**: ${rule.supersedes.map((id) => `\`${id}\``).join(", ")}`);
        lines.push("");
    }

    if (includeExamples) {
        lines.push("## 示例");
        lines.push("");
        lines.push("### 触发规则的问题代码");
        lines.push("");
        lines.push("```js");
        lines.push("// TODO: 替换为真实的问题代码示例");
        lines.push("```");
        lines.push("");
        lines.push("### 修复后的代码");
        lines.push("");
        lines.push("```js");
        lines.push("// TODO: 替换为真实的修复后代码示例");
        lines.push("```");
        lines.push("");
    }

    lines.push("## 配置");
    lines.push("");
    lines.push("可以通过 `.frontend-guardian.yml` 调整此规则的启用状态和严重级别:");
    lines.push("");
    lines.push("```yaml");
    lines.push("rules:");
    lines.push(`  ${rule.id}:`);
    lines.push("    enabled: true");
    lines.push(`    severity: ${rule.severity}`);
    lines.push("```");
    lines.push("");

    return lines.join("\n");
}

/** 生成规则文档目录和索引 */
export function generateRuleDocs(options: GenerateRuleDocsOptions): GeneratedRuleDocs {
    const { outputDir, rules = [], includeExamples = true } = options;
    ensureDir(outputDir);

    const files: string[] = [];
    const byCategory: Record<string, Rule[]> = {};

    for (const rule of rules) {
        byCategory[rule.category] = byCategory[rule.category] || [];
        byCategory[rule.category].push(rule);
    }

    for (const [category, categoryRules] of Object.entries(byCategory)) {
        const categoryDir = resolve(outputDir, category);
        ensureDir(categoryDir);

        for (const rule of categoryRules) {
            const filePath = resolve(categoryDir, `${rule.id}.md`);
            writeFileSync(filePath, generateRuleDoc(rule, { includeExamples }), "utf-8");
            files.push(filePath);
        }
    }

    // 生成索引 README
    const readmeLines: string[] = [];
    readmeLines.push("# 规则文档索引");
    readmeLines.push("");
    readmeLines.push(`共 ${rules.length} 条规则。`);
    readmeLines.push("");

    for (const category of Object.keys(byCategory).sort()) {
        readmeLines.push(`## ${category}`);
        readmeLines.push("");
        for (const rule of byCategory[category].sort((a, b) => a.id.localeCompare(b.id))) {
            readmeLines.push(`- [${rule.name || toTitle(rule.id)}](./${category}/${rule.id}.md)`);
        }
        readmeLines.push("");
    }

    const readmePath = resolve(outputDir, "README.md");
    writeFileSync(readmePath, readmeLines.join("\n"), "utf-8");
    files.push(readmePath);

    return { outputDir, files };
}

/** 格式化生成结果摘要 */
export function formatGeneratedDocs(result: GeneratedRuleDocs): string {
    return [
        "✅ 规则文档已生成",
        `   输出目录: ${result.outputDir}`,
        `   文件数量: ${result.files.length}`,
    ].join("\n");
}
