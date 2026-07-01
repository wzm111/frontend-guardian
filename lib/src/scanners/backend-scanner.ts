/**
 * v3.20.0: 后端语言扫描器
 *
 * 为 Node.js / Go / Rust 后端代码提供基础治理规则。
 * 首版基于文本/正则分析，避免引入新的解析依赖。
 */

import type { Issue, Rule, RuleContext } from "@/types.js";

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

function lineStarts(source: string): number[] {
    const starts: number[] = [0];
    for (let i = 0; i < source.length; i++) {
        if (source[i] === "\n") starts.push(i + 1);
    }
    return starts;
}

function getLineStart(source: string, line: number): number {
    const starts = lineStarts(source);
    return starts[line - 1] ?? 0;
}

function isNodeFile(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    return lower.endsWith(".js") || lower.endsWith(".ts") || lower.endsWith(".mjs") || lower.endsWith(".cjs");
}

function isGoFile(filePath: string): boolean {
    return filePath.toLowerCase().endsWith(".go");
}

function isRustFile(filePath: string): boolean {
    return filePath.toLowerCase().endsWith(".rs");
}

/** 判断字符串是否看起来像密码/API key/token */
function looksLikeSecret(name: string): boolean {
    const lower = name.toLowerCase();
    return (
        lower.includes("password") ||
        lower.includes("secret") ||
        lower.includes("token") ||
        lower.includes("apikey") ||
        lower.includes("api_key") ||
        lower.includes("privatekey") ||
        lower.includes("private_key") ||
        lower.includes("accesskey") ||
        lower.includes("access_key")
    );
}

/** 检测敏感信息硬编码：赋值右侧出现疑似凭据的字符串字面量 */
function findHardcodedSecrets(
    source: string,
    stringRegex: RegExp,
    assignRegex: RegExp
): Array<{ offset: number; end: number; name: string; value: string }> {
    const results: Array<{ offset: number; end: number; name: string; value: string }> = [];
    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const assignMatch = assignRegex.exec(line);
        if (!assignMatch) continue;
        const name = assignMatch[1];
        if (!looksLikeSecret(name)) continue;
        const stringMatch = stringRegex.exec(line);
        if (!stringMatch) continue;
        // 忽略空值、占位符、环境变量引用
        const value = stringMatch[2] ?? "";
        if (
            value.length === 0 ||
            value.startsWith("$") ||
            value.startsWith("{") ||
            (value.toUpperCase() === value && value.length < 4)
        ) {
            continue;
        }
        const lineStart = getLineStart(source, i + 1);
        const offset = lineStart + stringMatch.index;
        results.push({ offset, end: offset + stringMatch[0].length, name, value });
    }
    return results;
}

export const backendRules: Rule[] = [
    {
        id: "backend-node-unhandled-async",
        name: "Node.js 异步错误未处理",
        description: "检测 Node.js 后端代码中 await 表达式缺少 try/catch 的情况。",
        severity: "warning",
        category: "backend",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/backend/backend-node-unhandled-async.md",
        execute(ctx: RuleContext): Issue[] {
            if (!isNodeFile(ctx.filePath)) return [];
            const issues: Issue[] = [];
            const source = ctx.source;
            const lines = source.split("\n");
            let insideTry = false;
            let tryDepth = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // 简单块跟踪：try / catch / finally / {} 花括号
                if (/^\s*try\s*\{?/.test(line) && !/catch\s*\(/.test(line)) {
                    insideTry = true;
                    tryDepth++;
                }
                if (/^\s*catch\s*\(/.test(line) || /^\s*finally\s*\{?/.test(line)) {
                    if (tryDepth > 0) tryDepth--;
                    if (tryDepth === 0) insideTry = false;
                }

                // await 表达式但不在 try/catch 中，且未通过 .catch 处理
                if (/\bawait\s+/.test(line)) {
                    const hasCatchChain = /\.catch\s*\(/.test(line);
                    if (!insideTry && !hasCatchChain) {
                        const lineStart = getLineStart(source, i + 1);
                        const offset = lineStart + line.indexOf("await");
                        issues.push(
                            createIssue(
                                this as Rule,
                                ctx,
                                "Node.js await 缺少错误处理",
                                "后端请求路径中的 await 未包裹 try/catch，未处理的 Promise 拒绝可能导致进程崩溃。",
                                offset,
                                offset + "await".length
                            )
                        );
                    }
                }

                // 简单块闭合跟踪（仅处理行首单独 }）
                if (/^\s*\}\s*$/.test(line) && tryDepth > 0) {
                    tryDepth--;
                    if (tryDepth === 0) insideTry = false;
                }
            }
            return issues;
        },
    },
    {
        id: "backend-node-dangerous-eval",
        name: "Node.js 危险动态执行",
        description: "检测 Node.js 后端代码中的 eval / new Function。",
        severity: "critical",
        category: "backend",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/backend/backend-node-dangerous-eval.md",
        execute(ctx: RuleContext): Issue[] {
            if (!isNodeFile(ctx.filePath)) return [];
            const issues: Issue[] = [];
            const source = ctx.source;
            const lines = source.split("\n");
            const patterns = [
                { regex: /\beval\s*\(/, name: "eval()" },
                { regex: /\bnew\s+Function\s*\(/, name: "new Function()" },
            ];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                for (const { regex, name } of patterns) {
                    const match = regex.exec(line);
                    if (match) {
                        const lineStart = getLineStart(source, i + 1);
                        const offset = lineStart + match.index;
                        issues.push(
                            createIssue(
                                this as Rule,
                                ctx,
                                `Node.js 使用了 ${name}`,
                                "后端服务中执行动态代码可能导致任意代码执行漏洞，应使用安全的序列化/配置方式替代。",
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
        id: "backend-node-hardcoded-secret",
        name: "Node.js 硬编码敏感信息",
        description: "检测 Node.js 后端代码中硬编码的密码、API key、token 等。",
        severity: "critical",
        category: "backend",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/backend/backend-node-hardcoded-secret.md",
        execute(ctx: RuleContext): Issue[] {
            if (!isNodeFile(ctx.filePath)) return [];
            const issues: Issue[] = [];
            const secrets = findHardcodedSecrets(
                ctx.source,
                /(["'`])([^"'`]{4,})\1/g,
                /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::\s*[^=]+)?\s*=/
            );
            for (const { offset, end, name } of secrets) {
                issues.push(
                    createIssue(
                        this as Rule,
                        ctx,
                        `硬编码敏感信息：${name}`,
                        "后端服务不应在源码中硬密码、API key、token 等敏感信息，应使用环境变量或密钥管理服务。",
                        offset,
                        end
                    )
                );
            }
            return issues;
        },
    },
    {
        id: "backend-go-panic-in-handler",
        name: "Go HTTP handler 中使用 panic",
        description: "检测 Go HTTP handler / gin handler 等请求路径中的 panic 调用。",
        severity: "warning",
        category: "backend",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/backend/backend-go-panic-in-handler.md",
        execute(ctx: RuleContext): Issue[] {
            if (!isGoFile(ctx.filePath)) return [];
            const issues: Issue[] = [];
            const source = ctx.source;
            const lines = source.split("\n");

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // 粗略检测 handler / Handler / gin handler 函数
                const isHandlerContext =
                    /func\s+\w*[Hh]andler/.test(line) ||
                    /func\s*\([^)]*\)\s*\w*[Hh]andler/.test(line) ||
                    /http\.ResponseWriter|gin\.Context/.test(line);
                if (!isHandlerContext) continue;

                // 在该函数内向下搜索 panic
                let j = i;
                let braceDepth = 0;
                let started = false;
                while (j < lines.length) {
                    const inner = lines[j];
                    const trimmed = inner.trim();
                    if (trimmed.includes("{")) {
                        started = true;
                        braceDepth += (trimmed.match(/\{/g) ?? []).length;
                    }
                    if (trimmed.includes("}")) {
                        braceDepth -= (trimmed.match(/\}/g) ?? []).length;
                    }
                    if (started && braceDepth <= 0) break;

                    if (!started && !trimmed.includes("{")) {
                        j++;
                        continue;
                    }

                    const panicMatch = /\bpanic\s*\(/.exec(inner);
                    if (panicMatch) {
                        const lineStart = getLineStart(source, j + 1);
                        const offset = lineStart + panicMatch.index;
                        issues.push(
                            createIssue(
                                this as Rule,
                                ctx,
                                "Go HTTP handler 中使用 panic",
                                "在 HTTP 请求路径中调用 panic 会导致整个服务进程崩溃，应返回错误并记录日志。",
                                offset
                            )
                        );
                    }
                    j++;
                }
            }
            return issues;
        },
    },
    {
        id: "backend-go-ignored-error",
        name: "Go 错误未处理",
        description: "检测 Go 代码中使用 _ 忽略错误后未进行判断的情况。",
        severity: "warning",
        category: "backend",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/backend/backend-go-ignored-error.md",
        execute(ctx: RuleContext): Issue[] {
            if (!isGoFile(ctx.filePath)) return [];
            const issues: Issue[] = [];
            const source = ctx.source;
            const lines = source.split("\n");

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // 匹配 _, err := ... 且下一行未判断 err
                const match = /_,\s*err\s*:=\s+(.+)/.exec(line);
                if (!match) continue;
                const nextLine = lines[i + 1]?.trim() ?? "";
                if (/if\s+err\s*!=\s*nil/.test(nextLine) || /if\s+err\s*==\s*nil/.test(nextLine)) continue;
                const lineStart = getLineStart(source, i + 1);
                const offset = lineStart + match.index;
                issues.push(
                    createIssue(
                        this as Rule,
                        ctx,
                        "Go 错误被忽略",
                        "使用 _ 忽略返回值后未判断 err，可能遗漏关键错误处理。",
                        offset,
                        offset + match[0].length
                    )
                );
            }
            return issues;
        },
    },
    {
        id: "backend-go-hardcoded-secret",
        name: "Go 硬编码敏感信息",
        description: "检测 Go 代码中硬编码的密码、API key、token 等。",
        severity: "critical",
        category: "backend",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/backend/backend-go-hardcoded-secret.md",
        execute(ctx: RuleContext): Issue[] {
            if (!isGoFile(ctx.filePath)) return [];
            const issues: Issue[] = [];
            const secrets = findHardcodedSecrets(
                ctx.source,
                /(["'`])([^"'`]{4,})\1/g,
                /(?:var|const)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\s+[\w\[\]]+)?\s*=/
            );
            for (const { offset, end, name } of secrets) {
                issues.push(
                    createIssue(
                        this as Rule,
                        ctx,
                        `硬编码敏感信息：${name}`,
                        "后端服务不应在源码中硬编码密码、API key、token 等敏感信息，应使用环境变量或密钥管理服务。",
                        offset,
                        end
                    )
                );
            }
            return issues;
        },
    },
    {
        id: "backend-rust-unwrap-in-request",
        name: "Rust 请求路径中 unwrap/expect",
        description: "检测 Rust 后端请求处理函数中的 unwrap() / expect() 调用。",
        severity: "warning",
        category: "backend",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/backend/backend-rust-unwrap-in-request.md",
        execute(ctx: RuleContext): Issue[] {
            if (!isRustFile(ctx.filePath)) return [];
            const issues: Issue[] = [];
            const source = ctx.source;
            const lines = source.split("\n");

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // 只从 async fn 行开始扫描；跳过属性宏行避免重复
                const isAttributeLine = /^\s*#\[\s*(get|post|put|delete)\s*\(/.test(line);
                if (isAttributeLine) continue;

                // 粗略检测请求处理函数：actix-web、axum、rocket 等
                const isRequestHandler =
                    /async\s+fn\s+\w*\w*(handler|route|endpoint)/i.test(line) ||
                    /fn\s+\w*\w*(handler|route|endpoint)\s*\(/.test(line);
                if (!isRequestHandler) continue;

                // 在该函数内向下的行中搜索 unwrap/expect
                let j = i;
                let braceDepth = 0;
                let started = false;
                while (j < lines.length) {
                    const inner = lines[j];
                    const trimmed = inner.trim();
                    if (trimmed.includes("{")) {
                        started = true;
                        braceDepth += (trimmed.match(/\{/g) ?? []).length;
                    }
                    if (trimmed.includes("}")) {
                        braceDepth -= (trimmed.match(/\}/g) ?? []).length;
                    }
                    if (started && braceDepth <= 0) break;

                    // 函数签名本身跨行的情况：在没遇到 { 之前也继续扫描
                    if (!started && !trimmed.includes("{")) {
                        j++;
                        continue;
                    }

                    const unwrapMatch = /\.(unwrap|expect)\s*\(/.exec(inner);
                    if (unwrapMatch) {
                        const lineStart = getLineStart(source, j + 1);
                        const offset = lineStart + unwrapMatch.index;
                        issues.push(
                            createIssue(
                                this as Rule,
                                ctx,
                                `Rust 请求路径中使用 ${unwrapMatch[1]}()`,
                                "在请求处理路径中直接 unwrap/expect 会导致服务返回 500 甚至 panic，应使用 ? 传播错误并记录日志。",
                                offset
                            )
                        );
                    }
                    j++;
                }
            }
            return issues;
        },
    },
    {
        id: "backend-rust-hardcoded-secret",
        name: "Rust 硬编码敏感信息",
        description: "检测 Rust 代码中硬编码的密码、API key、token 等。",
        severity: "critical",
        category: "backend",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/backend/backend-rust-hardcoded-secret.md",
        execute(ctx: RuleContext): Issue[] {
            if (!isRustFile(ctx.filePath)) return [];
            const issues: Issue[] = [];
            const secrets = findHardcodedSecrets(
                ctx.source,
                /(["'`])([^"'`]{4,})\1/g,
                /(?:let|static|const)\s+(?:mut\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[^=]+)?\s*=/
            );
            for (const { offset, end, name } of secrets) {
                issues.push(
                    createIssue(
                        this as Rule,
                        ctx,
                        `硬编码敏感信息：${name}`,
                        "后端服务不应在源码中硬编码密码、API key、token 等敏感信息，应使用环境变量或密钥管理服务。",
                        offset,
                        end
                    )
                );
            }
            return issues;
        },
    },
    {
        id: "backend-rust-unsafe-block",
        name: "Rust unsafe 代码块",
        description: "检测 Rust 代码中的 unsafe 块。",
        severity: "suggestion",
        category: "backend",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/backend/backend-rust-unsafe-block.md",
        execute(ctx: RuleContext): Issue[] {
            if (!isRustFile(ctx.filePath)) return [];
            const issues: Issue[] = [];
            const source = ctx.source;
            const lines = source.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const match = /\bunsafe\s*\{/.exec(line);
                if (match) {
                    const lineStart = getLineStart(source, i + 1);
                    const offset = lineStart + match.index;
                    issues.push(
                        createIssue(
                            this as Rule,
                            ctx,
                            "Rust 使用 unsafe 代码块",
                            "unsafe 块绕过了 Rust 的安全保证，应经过代码评审并确保有充分的必要性和封装。",
                            offset
                        )
                    );
                }
            }
            return issues;
        },
    },
];
