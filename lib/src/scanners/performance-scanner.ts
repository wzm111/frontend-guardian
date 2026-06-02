/**
 * 性能规则 Scanner
 * 参考 Vercel React Best Practices 的 57 条规则
 */

import type { ParseResult } from "@babel/parser";
import traverse from "@babel/traverse";
import type { Rule, RuleContext, Issue } from "@/types.js";
import { getFileExt } from "@/utils/common.js";

/** 组件库入口包名 */
const BARREL_PACKAGES = [
    "antd",
    "@ant-design/react-native",
    "ant-design-vue",
    "element-plus",
    "@mui/material",
    "vuetify",
    "@nutui/nutui-react",
    "@nutui/nutui",
    "tdesign-react",
    "tdesign-vue-next",
    "@arco-design/web-react",
    "naive-ui",
    "quasar",
    "primevue",
    "primereact",
    "bootstrap-vue-next",
];

export const performanceRules: Rule[] = [
    {
        id: "perf-avoid-waterfall",
        name: "避免请求瀑布",
        description: "不要连续使用 await 获取独立数据，应并行发起请求",
        severity: "warning",
        category: "performance",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/perf-avoid-waterfall.md",
        frameworks: ["react", "nextjs", "vue", "nuxt"],
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const ast = context.utils.parseAST(context.source, {
                ext: getFileExt(context.filePath),
            }) as ParseResult<any> | null;

            if (!ast) return issues;

            traverse(ast, {
                // 检测函数体内的连续 await
                FunctionDeclaration(path) {
                    checkConsecutiveAwait(path.node.body, issues, context.filePath);
                },
                FunctionExpression(path) {
                    checkConsecutiveAwait(path.node.body, issues, context.filePath);
                },
                ArrowFunctionExpression(path) {
                    if (path.node.body.type === "BlockStatement") {
                        checkConsecutiveAwait(path.node.body, issues, context.filePath);
                    }
                },
            });

            return issues;
        },
    },

    {
        id: "perf-dynamic-import",
        name: "大组件懒加载",
        description: "超过 50KB 的组件应使用动态导入（React.lazy / defineAsyncComponent）",
        severity: "suggestion",
        category: "performance",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/perf-dynamic-import.md",
        frameworks: ["react", "nextjs", "vue"],
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const source = context.source;

            // 1. 检查文件大小（源码长度 > 50KB ≈ 50000 字符）
            const FILE_SIZE_THRESHOLD = 50000;
            if (source.length < FILE_SIZE_THRESHOLD) {
                return issues;
            }

            // 2. 检查是否已使用动态导入
            const hasDynamicImport =
                /React\.lazy\s*\(|lazy\s*\(\s*\(\s*\)\s*=>\s*import\s*\(/i.test(source) ||
                /defineAsyncComponent\s*\(/i.test(source) ||
                /import\s*\(\s*['"][^'"]+['"]\s*\)/.test(source);

            if (hasDynamicImport) {
                return issues;
            }

            // 3. 检测是否为路由页面组件（通常文件较大）
            const isPageFile =
                /pages?\//i.test(context.filePath) ||
                /views?\//i.test(context.filePath) ||
                /routes?\//i.test(context.filePath);

            if (!isPageFile) {
                return issues;
            }

            const sizeKB = Math.round(source.length / 1024);
            issues.push({
                ruleId: "perf-dynamic-import",
                title: `页面组件体积较大 (${sizeKB}KB)，建议使用动态导入`,
                description: `该文件源码 ${sizeKB}KB，超过 ${Math.round(FILE_SIZE_THRESHOLD / 1024)}KB 建议阈值。路由级组件应使用 React.lazy()（React）或 defineAsyncComponent()（Vue）实现懒加载，减少首屏 bundle 体积`,
                severity: "suggestion",
                file: context.filePath,
                line: 1,
                column: 1,
                source: `文件大小: ${sizeKB}KB`,
                fix: {
                    text: suggestLazyImport(context.filePath),
                    start: { line: 1, column: 1 },
                    end: { line: 1, column: 1 },
                    confidence: "low",
                    description: "请确认懒加载路径和变量名正确",
                },
            });

            return issues;
        },
    },

    {
        id: "perf-avoid-barrel-import",
        name: "避免整库导入",
        description: "不要从组件库入口导入，应从子模块导入",
        severity: "warning",
        category: "performance",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/perf-avoid-barrel-import.md",
        frameworks: ["react", "vue", "nextjs", "nuxt"],
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const ast = context.utils.parseAST(context.source, {
                ext: getFileExt(context.filePath),
            }) as ParseResult<any> | null;

            if (!ast) return issues;

            traverse(ast, {
                ImportDeclaration(path) {
                    const source = path.node.source.value;

                    // 检测整库导入
                    for (const pkg of BARREL_PACKAGES) {
                        if (source === pkg) {
                            // 跳过只有 1 个导入的情况（但仍在 Warning 级别提示）
                            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

                            issues.push({
                                ruleId: "perf-avoid-barrel-import",
                                title: "避免从组件库入口导入",
                                description: `从 "${pkg}" 入口导入会导致整库被打包，建议改为子模块导入（如 "${pkg}/es/button"）`,
                                severity: "warning",
                                file: context.filePath,
                                line,
                                column,
                                source: `import { ... } from '${pkg}';`,
                                fix: {
                                    text: suggestSubmoduleImport(pkg, path.node.specifiers),
                                    start: { line, column },
                                    end: { line, column: column + path.node.source.value.length + 2 },
                                    confidence: "medium",
                                    description: "请确认子模块路径与项目使用的构建工具兼容",
                                },
                            });
                            break;
                        }
                    }
                },
            });

            return issues;
        },
    },

    {
        id: "perf-memo-expensive",
        name: "昂贵计算使用 memo",
        description: "渲染中的复杂计算（map/filter/reduce/sort）应使用 useMemo / computed 缓存",
        severity: "suggestion",
        category: "performance",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/perf-memo-expensive.md",
        frameworks: ["react", "nextjs", "vue"],
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const ast = context.utils.parseAST(context.source, {
                ext: getFileExt(context.filePath),
            }) as ParseResult<any> | null;

            if (!ast) return issues;

            // 昂贵的数组方法
            const expensiveMethods = new Set([
                "map",
                "filter",
                "reduce",
                "sort",
                "find",
                "findIndex",
                "every",
                "some",
                "flatMap",
                "groupBy",
            ]);

            traverse(ast, {
                // 检测函数组件/方法中的昂贵计算
                FunctionDeclaration(path) {
                    checkExpensiveCalls(path.node.body, issues, context.filePath, expensiveMethods);
                },
                FunctionExpression(path) {
                    checkExpensiveCalls(path.node.body, issues, context.filePath, expensiveMethods);
                },
                ArrowFunctionExpression(path) {
                    if (path.node.body.type === "BlockStatement") {
                        checkExpensiveCalls(path.node.body, issues, context.filePath, expensiveMethods);
                    } else {
                        // 直接返回表达式的箭头函数
                        checkExpensiveExpression(path.node.body, issues, context.filePath, expensiveMethods);
                    }
                },
                ClassMethod(path) {
                    if (path.node.key.type === "Identifier" && path.node.key.name === "render") {
                        checkExpensiveCalls(path.node.body, issues, context.filePath, expensiveMethods);
                    }
                },
            });

            return issues;
        },
    },
];

// ============================================================================
// 辅助函数
// ============================================================================

/** 检测函数体内的连续 await */
function checkConsecutiveAwait(body: any, issues: Issue[], filePath: string): void {
    if (!body?.body || !Array.isArray(body.body)) return;

    const statements = body.body;
    const awaitStmts: Array<{ line: number; column: number; source: string }> = [];

    for (const stmt of statements) {
        // 检查是否是 await 赋值语句
        if (stmt.type === "VariableDeclaration") {
            let hasAwait = false;
            let line = 0;
            let column = 0;

            for (const decl of stmt.declarations) {
                if (decl.init?.type === "AwaitExpression") {
                    hasAwait = true;
                    line = decl.init.loc?.start?.line || 0;
                    column = decl.init.loc?.start?.column || 0;
                }
            }

            if (hasAwait) {
                awaitStmts.push({
                    line,
                    column,
                    source: `await ...`,
                });
            } else {
                // 不是 await 语句，重置计数
                if (awaitStmts.length >= 2) {
                    reportWaterfall(issues, filePath, awaitStmts);
                }
                awaitStmts.length = 0;
            }
        } else {
            // 不是变量声明，重置计数
            if (awaitStmts.length >= 2) {
                reportWaterfall(issues, filePath, awaitStmts);
            }
            awaitStmts.length = 0;
        }
    }

    // 检查末尾
    if (awaitStmts.length >= 2) {
        reportWaterfall(issues, filePath, awaitStmts);
    }
}

/** 报告请求瀑布问题 */
function reportWaterfall(
    issues: Issue[],
    filePath: string,
    awaitStmts: Array<{ line: number; column: number; source: string }>
): void {
    const first = awaitStmts[0];
    issues.push({
        ruleId: "perf-avoid-waterfall",
        title: "检测到请求瀑布",
        description: `发现 ${awaitStmts.length} 个连续的 await，总耗时 = 各请求之和。建议使用 Promise.all() 并行`,
        severity: "warning",
        file: filePath,
        line: first.line,
        column: first.column,
        source: first.source,
    });
}


/** 建议懒加载导入代码 */
function suggestLazyImport(filePath: string): string {
    const ext = getFileExt(filePath);
    const baseName = filePath.replace(/^.*[\\/]/, "").replace(ext, "");

    // React
    if (ext.match(/\.tsx?/)) {
        return `const ${baseName} = React.lazy(() => import('./${baseName}${ext}'));`;
    }
    // Vue
    if (ext === ".vue") {
        return `const ${baseName} = defineAsyncComponent(() => import('./${baseName}${ext}'));`;
    }
    return `// TODO: 使用框架对应的懒加载方式导入该组件`;
}

/** 建议子模块导入 */
function suggestSubmoduleImport(pkg: string, specifiers: any[]): string {
    const imports = specifiers
        .filter((s) => s.type === "ImportSpecifier" && s.local?.type === "Identifier")
        .map((s) => {
            const name = s.local.name;
            const kebab = name
                .replace(/([A-Z])/g, "-$1")
                .toLowerCase()
                .replace(/^-/, "");
            return `import ${name} from '${pkg}/es/${kebab}';`;
        })
        .join("\n");

    return imports || `// TODO: 手动改为子模块导入`;
}

/** 检测函数体中的昂贵计算 */
function checkExpensiveCalls(body: any, issues: Issue[], filePath: string, expensiveMethods: Set<string>): void {
    if (!body) return;

    traverse(
        body,
        {
            CallExpression(path) {
                // 跳过 useMemo / useCallback / computed 内部的调用
                if (isInsideMemo(path)) return;

                const callee = path.node.callee;
                let methodName: string | null = null;

                // 检测: array.map(), array.filter() 等
                if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
                    methodName = callee.property.name;
                }

                // 检测: lodash _.map(), _.filter() 等
                if (
                    callee.type === "MemberExpression" &&
                    callee.object.type === "Identifier" &&
                    callee.object.name === "_" &&
                    callee.property.type === "Identifier"
                ) {
                    methodName = callee.property.name;
                }

                if (methodName && expensiveMethods.has(methodName)) {
                    const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

                    // 检查是否是简单的单元素操作（如 [1,2,3].map(...)）
                    const obj = (callee as any).object;
                    if (obj?.type === "ArrayExpression" && obj.elements.length <= 3) {
                        return; // 小数组操作，不提示
                    }

                    issues.push({
                        ruleId: "perf-memo-expensive",
                        title: `渲染中的 ${methodName}() 建议缓存`,
                        description: `在组件渲染中直接调用 ${methodName}() 会在每次渲染时重新执行。建议使用 useMemo（React）或 computed（Vue）缓存结果`,
                        severity: "suggestion",
                        file: filePath,
                        line,
                        column,
                        source: `${methodName}(...)`,
                    });
                }
            },
        },
        body
    );
}

/** 检测直接返回表达式中的昂贵计算 */
function checkExpensiveExpression(expr: any, issues: Issue[], filePath: string, expensiveMethods: Set<string>): void {
    if (!expr) return;

    // 直接返回表达式: () => items.map(...)
    if (expr.type === "CallExpression") {
        const callee = expr.callee;
        if (
            callee.type === "MemberExpression" &&
            callee.property.type === "Identifier" &&
            expensiveMethods.has(callee.property.name)
        ) {
            const { line, column } = expr.loc?.start || { line: 0, column: 0 };
            issues.push({
                ruleId: "perf-memo-expensive",
                title: `渲染中的 ${callee.property.name}() 建议缓存`,
                description: `在组件渲染中直接调用 ${callee.property.name}() 会在每次渲染时重新执行。建议使用 useMemo（React）或 computed（Vue）缓存结果`,
                severity: "suggestion",
                file: filePath,
                line,
                column,
                source: `${callee.property.name}(...)`,
            });
        }
    }
}

/** 检查是否在 useMemo / useCallback / computed 内部 */
function isInsideMemo(path: any): boolean {
    let current = path.parentPath;
    while (current) {
        if (current.isCallExpression()) {
            const callee = current.node.callee;
            if (callee.type === "Identifier" && ["useMemo", "useCallback", "computed", "memo"].includes(callee.name)) {
                return true;
            }
            if (
                callee.type === "MemberExpression" &&
                callee.property.type === "Identifier" &&
                ["computed", "memo"].includes(callee.property.name)
            ) {
                return true;
            }
        }
        current = current.parentPath;
    }
    return false;
}
