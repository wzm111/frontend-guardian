/**
 * v3.18.0: CSS/SCSS 扫描器
 *
 * 基于文本/正则的 CSS/SCSS 治理规则，无需引入 CSS AST 依赖。
 */

import type { Issue, Rule, RuleContext } from "@/types.js";

function getLineColumn(source: string, offset: number): { line: number; column: number } {
    const lines = source.slice(0, offset).split("\n");
    return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function createIssue(
    rule: Rule,
    ctx: RuleContext,
    title: string,
    description: string,
    offset: number,
    endOffset?: number
): Issue {
    const { line, column } = getLineColumn(ctx.source, offset);
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

export const cssRules: Rule[] = [
    {
        id: "css-no-important",
        name: "禁止 CSS !important",
        description: "使用 !important 会破坏样式优先级，应通过提升选择器特异性解决。",
        severity: "warning",
        category: "style",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/style/css-no-important.md",
        execute(ctx: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const regex = /!important/g;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(ctx.source)) !== null) {
                issues.push(
                    createIssue(
                        this as Rule,
                        ctx,
                        "发现 !important",
                        "应避免使用 !important，改用更具体的选择器。",
                        match.index
                    )
                );
            }
            return issues;
        },
    },
    {
        id: "css-max-selector-depth",
        name: "CSS 选择器深度限制",
        description: "选择器嵌套过深会降低可维护性和渲染性能。",
        severity: "warning",
        category: "style",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/style/css-max-selector-depth.md",
        execute(ctx: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const maxDepth = 4;
            const lines = ctx.source.split("\n");

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const ruleMatch = line.match(/^([^{]+)\{/);
                if (!ruleMatch) continue;
                const selector = ruleMatch[1].trim();
                // 忽略 @media、@supports 等 at-rules
                if (selector.startsWith("@")) continue;
                // 忽略 SCSS 变量声明和 mixin
                if (selector.startsWith("$") || selector.startsWith("%")) continue;
                // 简单按空格/ > / + / ~ 分割
                const parts = selector.split(/\s+|[>+~]/).filter(Boolean);
                if (parts.length > maxDepth) {
                    const offset = ctx.source.split("\n").slice(0, i).join("\n").length + (i > 0 ? 1 : 0) + line.indexOf(selector);
                    issues.push(
                        createIssue(
                            this as Rule,
                            ctx,
                            `选择器深度为 ${parts.length}，超过建议值 ${maxDepth}`,
                            `当前选择器嵌套过深：${selector.slice(0, 60)}`,
                            offset,
                            offset + selector.length
                        )
                    );
                }
            }
            return issues;
        },
    },
    {
        id: "css-too-many-imports",
        name: "CSS @import 数量限制",
        description: "单个 CSS 文件中 @import 过多会增加请求数量和加载时间。",
        severity: "suggestion",
        category: "performance",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/performance/css-too-many-imports.md",
        execute(ctx: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const maxImports = 10;
            const regex = /@import\b/g;
            let count = 0;
            let firstOffset = -1;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(ctx.source)) !== null) {
                count++;
                if (firstOffset === -1) firstOffset = match.index;
            }
            if (count > maxImports) {
                issues.push(
                    createIssue(
                        this as Rule,
                        ctx,
                        `CSS @import 数量 ${count} 超过建议值 ${maxImports}`,
                        "过多的 @import 会阻塞渲染，建议使用构建工具合并或改用 link 标签。",
                        firstOffset
                    )
                );
            }
            return issues;
        },
    },
    {
        id: "css-no-undeclared-scss-variables",
        name: "禁止未声明的 SCSS 变量",
        description: "使用未定义的 SCSS 变量会在编译时报错。",
        severity: "critical",
        category: "style",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/style/css-no-undeclared-scss-variables.md",
        execute(ctx: RuleContext): Issue[] {
            const issues: Issue[] = [];
            if (!ctx.filePath.endsWith(".scss") && !ctx.filePath.endsWith(".sass")) {
                return issues;
            }

            const declared = new Set<string>();
            const declRegex = /\$([a-zA-Z0-9_-]+)\s*:/g;
            let declMatch: RegExpExecArray | null;
            while ((declMatch = declRegex.exec(ctx.source)) !== null) {
                declared.add(declMatch[1]);
            }

            const usedRegex = /\$([a-zA-Z0-9_-]+)/g;
            const usedPositions = new Map<string, number[]>();
            let usedMatch: RegExpExecArray | null;
            while ((usedMatch = usedRegex.exec(ctx.source)) !== null) {
                const name = usedMatch[1];
                const pos = usedMatch.index;
                // 跳过声明位置：$name:
                const after = ctx.source.slice(pos + name.length + 1).trimStart();
                if (after.startsWith(":")) continue;
                if (!usedPositions.has(name)) usedPositions.set(name, []);
                usedPositions.get(name)!.push(pos);
            }

            for (const [name, positions] of usedPositions) {
                if (!declared.has(name)) {
                    for (const offset of positions) {
                        issues.push(
                            createIssue(
                                this as Rule,
                                ctx,
                                `使用未声明的 SCSS 变量: $${name}`,
                                `变量 $${name} 在当前文件中未找到声明。`,
                                offset
                            )
                        );
                    }
                }
            }
            return issues;
        },
    },
    {
        id: "css-missing-vendor-prefix",
        name: "CSS 缺少浏览器前缀",
        description: "旧属性在未配置 autoprefixer 时应保留必要前缀。",
        severity: "suggestion",
        category: "style",
        defaultEnabled: false,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/style/css-missing-vendor-prefix.md",
        execute(ctx: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const needsPrefix = [
                { prop: "user-select", prefixes: ["-webkit-", "-moz-", "-ms-"] },
                { prop: "appearance", prefixes: ["-webkit-", "-moz-"] },
                { prop: "backdrop-filter", prefixes: ["-webkit-"] },
                { prop: "clip-path", prefixes: ["-webkit-"] },
            ];

            for (const { prop, prefixes } of needsPrefix) {
                const regex = new RegExp(`(^|[;\\s])(${prop})\\s*:`, "g");
                let match: RegExpExecArray | null;
                while ((match = regex.exec(ctx.source)) !== null) {
                    // 检查同一行是否有前缀版本
                    const lineStart = ctx.source.lastIndexOf("\n", match.index) + 1;
                    const lineEnd = ctx.source.indexOf("\n", match.index);
                    const line = ctx.source.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
                    const hasPrefix = prefixes.some((p) => line.includes(`${p}${prop}`));
                    if (!hasPrefix) {
                        issues.push(
                            createIssue(
                                this as Rule,
                                ctx,
                                `CSS 属性 ${prop} 可能缺少浏览器前缀`,
                                `建议添加 ${prefixes.join(", ")} 前缀，或配置 autoprefixer。`,
                                match.index + match[1].length
                            )
                        );
                    }
                }
            }
            return issues;
        },
    },
];
