/**
 * Svelte Scanner
 * Phase 4: 覆盖全面化 — 现代框架支持
 *
 * 规则列表：
 * 1. svelte-reactive-statement — $: 响应式语句中使用未声明变量
 * 2. svelte-store-unsubscribe — 订阅 store 但未取消订阅（内存泄漏）
 * 3. svelte-transition-directive — transition 指令在条件渲染中的问题
 * 4. svelte-props-mutate — 直接修改 props（Svelte 中 props 是只读的）
 * 5. svelte-event-modifier — 使用过时的 event modifier（Svelte 5 已弃用）
 */

import type { Rule, RuleContext, Issue } from "../types.js";

export const svelteRules: Rule[] = [
    {
        id: "svelte-reactive-statement",
        name: "响应式语句使用未声明变量",
        description: "$: 响应式语句中引用了未声明的变量",
        severity: "critical",
        category: "component",
        defaultEnabled: true,
        frameworks: ["svelte"],
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const source = context.source;

            // Svelte 响应式语句：$: expr
            // 简单正则匹配 $: 语句中引用的变量是否在 script 中声明
            const reactiveRegex = /^\s*\$:\s*(.+)$/gm;
            let match;

            while ((match = reactiveRegex.exec(source)) !== null) {
                const expr = match[1];
                const line = source.slice(0, match.index).split("\n").length;

                // 简单检查：如果表达式中引用了一个看起来像变量的标识符
                // 但 script 中没有 let/const/var 声明它
                const varMatches = expr.match(/\b[a-zA-Z_]\w*\b/g);
                if (varMatches) {
                    for (const varName of varMatches) {
                        // 跳过常见关键字和内置变量
                        if (isSvelteBuiltin(varName)) continue;

                        // 检查是否在 script 中声明
                        const declarationPattern = new RegExp(`(?:let|const|var|function)\\s+${varName}\\b`, "m");
                        if (!declarationPattern.test(source)) {
                            issues.push({
                                ruleId: "svelte-reactive-statement",
                                title: `响应式语句引用了未声明变量 '${varName}'`,
                                description: `\$:${expr.trim()} 中使用了未在 script 中声明的变量 '${varName}'。响应式语句只能引用已声明的变量或 store。`,
                                severity: "critical",
                                file: context.filePath,
                                line,
                                column: 1,
                                source: match[0].trim(),
                            });
                            break; // 每条响应式语句只报一次
                        }
                    }
                }
            }

            return issues;
        },
    },

    {
        id: "svelte-store-unsubscribe",
        name: "Store 订阅未取消",
        description: "subscribe() 返回的 unsubscribe 函数未被调用，导致内存泄漏",
        severity: "warning",
        category: "hooks",
        defaultEnabled: true,
        frameworks: ["svelte"],
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const source = context.source;

            // 检测 subscribe() 调用
            const subscribeRegex = /\b(\w+)\.subscribe\s*\(/g;
            let match;

            while ((match = subscribeRegex.exec(source)) !== null) {
                const storeName = match[1];
                const subscribePos = match.index;
                const line = source.slice(0, subscribePos).split("\n").length;

                // 检查后面是否有 unsubscribe 调用
                const afterSource = source.slice(subscribePos);
                const unsubscribePattern = new RegExp(
                    `\\b${storeName}\\.unsubscribe\\b|\\bunsubscribe\\s*\\(\\s*${storeName}\\s*\\)`
                );

                // 检查是否在 onDestroy 中取消订阅
                const hasOnDestroy = /onDestroy\s*\(/.test(source);
                const hasUnsubscribe = unsubscribePattern.test(afterSource);

                if (!hasUnsubscribe && !hasOnDestroy) {
                    issues.push({
                        ruleId: "svelte-store-unsubscribe",
                        title: `Store '${storeName}' 订阅未取消`,
                        description: `${storeName}.subscribe() 返回的 unsubscribe 函数未被调用。组件卸载后订阅仍会持续，导致内存泄漏。建议在 onDestroy 中取消订阅或使用 $store 自动订阅语法。`,
                        severity: "warning",
                        file: context.filePath,
                        line,
                        column: 1,
                        source: `${storeName}.subscribe(...)`,
                        fix: {
                            text: `const unsubscribe = ${storeName}.subscribe(...);\n\nonDestroy(() => {\n  unsubscribe();\n});`,
                            start: { line, column: 1 },
                            end: { line, column: 1 },
                        },
                    });
                }
            }

            return issues;
        },
    },

    {
        id: "svelte-props-mutate",
        name: "直接修改 props",
        description: "Svelte 中 props 是只读的，直接赋值会产生编译错误",
        severity: "critical",
        category: "component",
        defaultEnabled: true,
        frameworks: ["svelte"],
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const source = context.source;

            // Svelte 中 props 通过 export let propName 声明
            // 检测在组件内部对 props 的直接赋值（非响应式语句中）
            const propRegex = /export\s+let\s+(\w+)/g;
            const props: string[] = [];
            let match;

            while ((match = propRegex.exec(source)) !== null) {
                props.push(match[1]);
            }

            for (const prop of props) {
                // 检测直接赋值（非 $: 响应式语句中的赋值）
                const assignPattern = new RegExp(`(?<!\\$:)\\s*\\b${prop}\\s*=[^=]`, "g");

                while ((match = assignPattern.exec(source)) !== null) {
                    const line = source.slice(0, match.index).split("\n").length;
                    const lineText = source.split("\n")[line - 1] || "";

                    // 排除 export let 声明本身和响应式语句
                    if (lineText.includes("export let")) continue;
                    if (lineText.trim().startsWith("$:")) continue;

                    issues.push({
                        ruleId: "svelte-props-mutate",
                        title: `直接修改了 props '${prop}'`,
                        description: `Svelte 中 props 是只读的。\'${prop}\' 通过 export let 声明为 prop，不能直接在组件内部赋值。如需双向绑定请使用 bind: 语法，或使用本地状态副本。`,
                        severity: "critical",
                        file: context.filePath,
                        line,
                        column: lineText.indexOf(prop) + 1,
                        source: lineText.trim(),
                    });
                }
            }

            return issues;
        },
    },

    {
        id: "svelte-event-modifier",
        name: "使用过时的 event modifier",
        description: "Svelte 5 已弃用 event modifier（如 |preventDefault），建议使用事件处理函数",
        severity: "warning",
        category: "component",
        defaultEnabled: true,
        frameworks: ["svelte"],
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const source = context.source;

            // Svelte 事件修饰符：on:click|preventDefault, on:submit|stopPropagation 等
            const modifierRegex = /on:\w+\|(\w+)/g;
            let match;

            while ((match = modifierRegex.exec(source)) !== null) {
                const modifier = match[1];
                const line = source.slice(0, match.index).split("\n").length;

                issues.push({
                    ruleId: "svelte-event-modifier",
                    title: `使用了过时的事件修饰符 '|${modifier}'`,
                    description: `Svelte 5 已弃用事件修饰符语法（on:event|modifier）。建议使用原生事件处理函数调用 event.${modifier}()，或使用动作（action）实现。`,
                    severity: "warning",
                    file: context.filePath,
                    line,
                    column: 1,
                    source: match[0],
                });
            }

            return issues;
        },
    },
];

/** Svelte 内置变量和关键字 */
function isSvelteBuiltin(name: string): boolean {
    const builtins = new Set([
        "console",
        "window",
        "document",
        "Math",
        "JSON",
        "Date",
        "Array",
        "Object",
        "String",
        "Number",
        "Boolean",
        "Promise",
        "setTimeout",
        "setInterval",
        "clearTimeout",
        "clearInterval",
        "fetch",
        "true",
        "false",
        "null",
        "undefined",
        "if",
        "else",
        "for",
        "while",
        "return",
        "function",
        "const",
        "let",
        "var",
        "new",
        "typeof",
        "instanceof",
    ]);
    return builtins.has(name);
}
