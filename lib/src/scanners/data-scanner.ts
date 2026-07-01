/**
 * v3.19.0: JSON/YAML/Markdown 扫描器
 *
 * 基于文本/正则与现有 yaml 依赖的非 JS 文件治理规则。
 */

import type { Issue, Rule, RuleContext } from "@/types.js";
import YAML, { isMap, isScalar, isSeq, type Node } from "yaml";

function getLineColumn(source: string, offset: number): { line: number; column: number } {
    const lines = source.slice(0, offset).split("\n");
    return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function offsetAt(source: string, line: number, column: number): number {
    let offset = 0;
    let currentLine = 1;
    while (currentLine < line) {
        const next = source.indexOf("\n", offset);
        if (next === -1) break;
        offset = next + 1;
        currentLine++;
    }
    return offset + (column - 1);
}

function createIssue(
    rule: Rule,
    ctx: RuleContext,
    title: string,
    description: string,
    start: number | { line: number; column: number },
    endOffset?: number
): Issue {
    const offset = typeof start === "number" ? start : offsetAt(ctx.source, start.line, start.column);
    const { line, column } = typeof start === "number" ? getLineColumn(ctx.source, offset) : start;
    const snippet = endOffset
        ? ctx.source.slice(offset, endOffset)
        : ctx.source.slice(offset, Math.min(offset + 80, ctx.source.length));
    return {
        ruleId: rule.id,
        title,
        description,
        severity: rule.severity,
        file: ctx.filePath,
        line,
        column,
        source: snippet,
    };
}

function walkYamlMappings(node: Node | null | undefined, callback: (map: import("yaml").YAMLMap) => void): void {
    if (!node) return;
    if (isMap(node)) {
        callback(node);
        for (const pair of node.items) {
            walkYamlMappings(pair.value as Node | null | undefined, callback);
        }
    } else if (isSeq(node)) {
        for (const item of node.items) {
            walkYamlMappings(item as Node | null | undefined, callback);
        }
    }
}

export const dataRules: Rule[] = [
    {
        id: "json-invalid-syntax",
        name: "JSON 语法错误",
        description: "使用 JSON.parse 检测无法解析的 JSON 文件。",
        severity: "critical",
        category: "data",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/data/json-invalid-syntax.md",
        execute(ctx: RuleContext): Issue[] {
            if (!ctx.filePath.toLowerCase().endsWith(".json")) return [];
            try {
                JSON.parse(ctx.source);
                return [];
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const match = msg.match(/position\s+(\d+)/);
                const offset = match ? Number.parseInt(match[1], 10) : 0;
                return [createIssue(this as Rule, ctx, "JSON 语法错误", msg, offset)];
            }
        },
    },
    {
        id: "json-trailing-comma",
        name: "JSON 尾随逗号",
        description: "检测对象或数组末尾的尾随逗号。",
        severity: "warning",
        category: "data",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/data/json-trailing-comma.md",
        execute(ctx: RuleContext): Issue[] {
            if (!ctx.filePath.toLowerCase().endsWith(".json")) return [];
            const issues: Issue[] = [];
            const { source } = ctx;
            let inString = false;
            let escapeNext = false;
            for (let i = 0; i < source.length; i++) {
                const ch = source[i];
                if (escapeNext) {
                    escapeNext = false;
                    continue;
                }
                if (ch === "\\") {
                    escapeNext = true;
                    continue;
                }
                if (ch === '"') {
                    inString = !inString;
                    continue;
                }
                if (inString) continue;
                if (ch === ",") {
                    let j = i + 1;
                    while (j < source.length && /\s/.test(source[j])) j++;
                    if (j < source.length && (source[j] === "}" || source[j] === "]")) {
                        issues.push(
                            createIssue(
                                this as Rule,
                                ctx,
                                "JSON 中存在尾随逗号",
                                "JSON 标准不允许对象或数组末尾使用尾随逗号。",
                                i,
                                i + 1
                            )
                        );
                    }
                }
            }
            return issues;
        },
    },
    {
        id: "json-duplicate-key",
        name: "JSON 对象中禁止重复键",
        description: "检测同一层级 JSON 对象中的重复键。",
        severity: "warning",
        category: "data",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/data/json-duplicate-key.md",
        execute(ctx: RuleContext): Issue[] {
            if (!ctx.filePath.toLowerCase().endsWith(".json")) return [];
            try {
                JSON.parse(ctx.source);
            } catch {
                return [];
            }
            try {
                const doc = YAML.parseDocument(ctx.source, { uniqueKeys: false });
                const issues: Issue[] = [];
                const rule = this as Rule;
                walkYamlMappings(doc.contents as Node | null | undefined, (map) => {
                    const seen = new Map<string, number>();
                    for (const pair of map.items) {
                        if (!isScalar(pair.key) || typeof pair.key.value !== "string") continue;
                        const key = pair.key.value;
                        const offset = pair.key.range?.[0] ?? 0;
                        const endOffset = pair.key.range?.[1] ?? offset;
                        if (seen.has(key)) {
                            issues.push(
                                createIssue(
                                    rule,
                                    ctx,
                                    `JSON 对象中存在重复键: ${key}`,
                                    `键 "${key}" 在同一对象层级中重复定义。`,
                                    offset,
                                    endOffset
                                )
                            );
                        } else {
                            seen.set(key, offset);
                        }
                    }
                });
                return issues;
            } catch {
                return [];
            }
        },
    },
    {
        id: "yaml-invalid-syntax",
        name: "YAML 语法错误",
        description: "使用 yaml 包检测无法解析的 YAML 文件（重复键由 yaml-duplicate-key 单独检查）。",
        severity: "critical",
        category: "data",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/data/yaml-invalid-syntax.md",
        execute(ctx: RuleContext): Issue[] {
            if (!/\.(yaml|yml)$/i.test(ctx.filePath)) return [];
            const doc = YAML.parseDocument(ctx.source, { uniqueKeys: false });
            if (doc.errors.length === 0) return [];
            const err = doc.errors[0];
            const msg = err.message;
            let line = 1;
            let column = 1;
            if ("linePos" in err && Array.isArray((err as any).linePos)) {
                line = (err as any).linePos[0]?.line ?? line;
                column = (err as any).linePos[0]?.col ?? column;
            }
            return [createIssue(this as Rule, ctx, "YAML 语法错误", msg, { line, column })];
        },
    },
    {
        id: "yaml-duplicate-key",
        name: "YAML 映射中禁止重复键",
        description: "检测同一层级 YAML 映射中的重复键。",
        severity: "warning",
        category: "data",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/data/yaml-duplicate-key.md",
        execute(ctx: RuleContext): Issue[] {
            if (!/\.(yaml|yml)$/i.test(ctx.filePath)) return [];
            try {
                const doc = YAML.parseDocument(ctx.source, { uniqueKeys: false });
                if (doc.errors.length > 0) return [];
                const issues: Issue[] = [];
                const rule = this as Rule;
                walkYamlMappings(doc.contents, (map) => {
                    const seen = new Map<string, number>();
                    for (const pair of map.items) {
                        if (!isScalar(pair.key)) continue;
                        const key = String(pair.key.value);
                        const offset = pair.key.range?.[0] ?? 0;
                        const endOffset = pair.key.range?.[1] ?? offset;
                        if (seen.has(key)) {
                            issues.push(
                                createIssue(
                                    rule,
                                    ctx,
                                    `YAML 映射中存在重复键: ${key}`,
                                    `键 "${key}" 在同一映射层级中重复定义。`,
                                    offset,
                                    endOffset
                                )
                            );
                        } else {
                            seen.set(key, offset);
                        }
                    }
                });
                return issues;
            } catch {
                return [];
            }
        },
    },
    {
        id: "yaml-empty-value",
        name: "YAML 空值",
        description: "检测值为空的 YAML 键（如 key:），这种写法容易产生歧义。",
        severity: "warning",
        category: "data",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/data/yaml-empty-value.md",
        execute(ctx: RuleContext): Issue[] {
            if (!/\.(yaml|yml)$/i.test(ctx.filePath)) return [];
            try {
                const doc = YAML.parseDocument(ctx.source, { uniqueKeys: false });
                if (doc.errors.length > 0) return [];
                const issues: Issue[] = [];
                const rule = this as Rule;
                walkYamlMappings(doc.contents, (map) => {
                    for (const pair of map.items) {
                        if (isScalar(pair.value) && pair.value.value === null) {
                            const [start, end] = pair.value.range ?? [0, 0];
                            const rawValue = ctx.source.slice(start, end).trim();
                            if (rawValue === "") {
                                const keyOffset = isScalar(pair.key) ? (pair.key.range?.[0] ?? 0) : 0;
                                const keyEnd = isScalar(pair.key) ? (pair.key.range?.[1] ?? keyOffset) : keyOffset;
                                const keyName = isScalar(pair.key) ? String(pair.key.value) : "";
                                issues.push(
                                    createIssue(
                                        rule,
                                        ctx,
                                        `YAML 键存在空值: ${keyName}`,
                                        `键 "${keyName}" 的值为空，可能造成配置歧义。`,
                                        keyOffset,
                                        keyEnd
                                    )
                                );
                            }
                        }
                    }
                });
                return issues;
            } catch {
                return [];
            }
        },
    },
    {
        id: "markdown-no-todo-link",
        name: "Markdown 禁止 TODO 占位链接",
        description: "检测链接目标为 TODO 的占位链接。",
        severity: "warning",
        category: "data",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/data/markdown-no-todo-link.md",
        execute(ctx: RuleContext): Issue[] {
            if (!/\.(md|markdown)$/i.test(ctx.filePath)) return [];
            const issues: Issue[] = [];
            const regex = /\[([^\]]+)\]\(TODO\)/gi;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(ctx.source)) !== null) {
                issues.push(
                    createIssue(
                        this as Rule,
                        ctx,
                        `Markdown 存在 TODO 占位链接: ${match[1]}`,
                        "链接目标为 TODO，应替换为实际 URL。",
                        match.index,
                        match.index + match[0].length
                    )
                );
            }
            return issues;
        },
    },
    {
        id: "markdown-empty-link",
        name: "Markdown 禁止空链接",
        description: "检测链接目标为空的链接。",
        severity: "warning",
        category: "data",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/data/markdown-empty-link.md",
        execute(ctx: RuleContext): Issue[] {
            if (!/\.(md|markdown)$/i.test(ctx.filePath)) return [];
            const issues: Issue[] = [];
            const regex = /\[([^\]]+)\]\(\s*\)/g;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(ctx.source)) !== null) {
                issues.push(
                    createIssue(
                        this as Rule,
                        ctx,
                        `Markdown 存在空链接: ${match[1]}`,
                        "链接目标为空，应填写正确的 URL 或移除链接。",
                        match.index,
                        match.index + match[0].length
                    )
                );
            }
            return issues;
        },
    },
    {
        id: "markdown-duplicate-heading",
        name: "Markdown 禁止重复标题",
        description: "检测同一文件中相同层级重复出现的标题文本。",
        severity: "suggestion",
        category: "data",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/data/markdown-duplicate-heading.md",
        execute(ctx: RuleContext): Issue[] {
            if (!/\.(md|markdown)$/i.test(ctx.filePath)) return [];
            const issues: Issue[] = [];
            const regex = /^(#{1,6})\s+(.+?)\s*$/gm;
            const headingsByLevel = new Map<number, Map<string, number>>();
            let match: RegExpExecArray | null;
            while ((match = regex.exec(ctx.source)) !== null) {
                const level = match[1].length;
                const text = match[2].trim().replace(/\s+/g, " ");
                if (!headingsByLevel.has(level)) headingsByLevel.set(level, new Map());
                const seen = headingsByLevel.get(level)!;
                if (seen.has(text)) {
                    issues.push(
                        createIssue(
                            this as Rule,
                            ctx,
                            `Markdown 存在重复标题 (H${level}): ${text}`,
                            `H${level} 标题 "${text}" 在同一文件中出现多次。`,
                            match.index,
                            match.index + match[0].length
                        )
                    );
                } else {
                    seen.set(text, match.index);
                }
            }
            return issues;
        },
    },
];
