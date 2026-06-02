/**
 * 命名规范 Scanner
 *
 * 检测范围：
 * 1. class 名 — PascalCase
 * 2. interface 名 — PascalCase
 * 3. type 别名 — PascalCase
 * 4. enum 名 — PascalCase, enum 成员 — UPPER_SNAKE_CASE
 * 5. function/method — camelCase（React 组件允许 PascalCase）
 * 6. variable (let/var) — camelCase
 * 7. constant (const + 字面量) — UPPER_SNAKE_CASE
 * 8. 私有成员前缀 — _ (JS) 或 # (TS private)
 * 9. 文件名 — kebab-case 推荐
 * 10. 文件夹名 — kebab-case 推荐
 */

import type { ParseResult } from "@babel/parser";
import traverse from "@babel/traverse";
import { dirname, basename, extname } from "node:path";
import type { Rule, RuleContext, Issue, NamingConfig } from "@/types.js";
import { getFileExt } from "@/utils/common.js";

/** 默认命名规范配置 */
const DEFAULT_NAMING: NamingConfig = {
    classCase: "PascalCase",
    interfaceCase: "PascalCase",
    typeAliasCase: "PascalCase",
    functionCase: "camelCase",
    variableCase: "camelCase",
    constantCase: "UPPER_SNAKE_CASE",
    enumCase: "PascalCase",
    enumMemberCase: "UPPER_SNAKE_CASE",
    privatePrefix: "underscore",
    fileNameCase: "kebab-case",
    folderNameCase: "kebab-case",
    allowSingleLetter: true,
    allowPascalCaseComponents: true,
    ignorePatterns: [],
};

/** 命名规范规则 */
export const namingRules: Rule[] = [
    {
        id: "naming-class",
        name: "类名应使用 PascalCase",
        description: "class 声明应使用 PascalCase 命名",
        severity: "warning",
        category: "style",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/naming-class.md",
        confidence: "high",
        execute(context: RuleContext): Issue[] {
            return checkIdentifierCase(context, "ClassDeclaration", "class", "PascalCase");
        },
    },
    {
        id: "naming-interface",
        name: "接口名应使用 PascalCase",
        description: "TS interface 声明应使用 PascalCase 命名",
        severity: "warning",
        category: "style",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/naming-interface.md",
        confidence: "high",
        execute(context: RuleContext): Issue[] {
            return checkIdentifierCase(context, "TSInterfaceDeclaration", "interface", "PascalCase");
        },
    },
    {
        id: "naming-type-alias",
        name: "类型别名应使用 PascalCase",
        description: "type 别名声明应使用 PascalCase 命名",
        severity: "warning",
        category: "style",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/naming-type-alias.md",
        confidence: "high",
        execute(context: RuleContext): Issue[] {
            return checkIdentifierCase(context, "TSTypeAliasDeclaration", "type alias", "PascalCase");
        },
    },
    {
        id: "naming-enum",
        name: "枚举名应使用 PascalCase，成员应使用 UPPER_SNAKE_CASE",
        description: "enum 声明使用 PascalCase，成员使用 UPPER_SNAKE_CASE",
        severity: "warning",
        category: "style",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/naming-enum.md",
        confidence: "high",
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const config = getNamingConfig(context);

            const ast = context.utils.parseAST(context.source, {
                ext: getFileExt(context.filePath),
            }) as ParseResult<any> | null;

            if (!ast) return issues;

            traverse(ast, {
                TSEnumDeclaration(path) {
                    const name = path.node.id.name;
                    const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

                    // 检查枚举名
                    if (!isPascalCase(name)) {
                        issues.push({
                            ruleId: "naming-enum",
                            title: `枚举名 "${name}" 应使用 PascalCase`,
                            description: `枚举声明应使用 PascalCase，建议改为 "${toPascalCase(name)}"`,
                            severity: "warning",
                            file: context.filePath,
                            line,
                            column,
                            source: `enum ${name}`,
                            fix: {
                                text: toPascalCase(name),
                                start: { line, column: column + 5 }, // after 'enum '
                                end: { line, column: column + 5 + name.length },
                            },
                        });
                    }

                    // 检查枚举成员
                    for (const member of path.node.members) {
                        if (member.type !== "TSEnumMember") continue;
                        const memberName =
                            member.id.type === "Identifier"
                                ? member.id.name
                                : member.id.type === "StringLiteral"
                                  ? member.id.value
                                  : null;
                        if (!memberName) continue;

                        const { line: mLine, column: mColumn } = member.loc?.start || { line: 0, column: 0 };

                        if (config.enumMemberCase === "UPPER_SNAKE_CASE" && !isUpperSnakeCase(memberName)) {
                            issues.push({
                                ruleId: "naming-enum",
                                title: `枚举成员 "${memberName}" 应使用 UPPER_SNAKE_CASE`,
                                description: `枚举成员建议使用全大写下划线分隔，如 "${toUpperSnakeCase(memberName)}"`,
                                severity: "suggestion",
                                file: context.filePath,
                                line: mLine,
                                column: mColumn,
                                source: memberName,
                            });
                        }
                    }
                },
            });

            return issues;
        },
    },
    {
        id: "naming-function",
        name: "函数/方法应使用 camelCase",
        description: "普通函数使用 camelCase，React 组件允许 PascalCase",
        severity: "warning",
        category: "style",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/naming-function.md",
        confidence: "high",
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const config = getNamingConfig(context);

            const ast = context.utils.parseAST(context.source, {
                ext: getFileExt(context.filePath),
            }) as ParseResult<any> | null;

            if (!ast) return issues;

            traverse(ast, {
                // 函数声明: function foo() {}
                FunctionDeclaration(path) {
                    const name = path.node.id?.name;
                    if (!name) return;
                    if (shouldIgnoreName(name, config)) return;

                    const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

                    // 检测是否是 React 组件（返回 JSX 或 JSXElement）
                    const isComponent = config.allowPascalCaseComponents && isLikelyReactComponent(path.node, name);

                    if (isComponent) {
                        // React 组件允许 PascalCase
                        if (!isPascalCase(name)) {
                            issues.push({
                                ruleId: "naming-function",
                                title: `React 组件 "${name}" 应使用 PascalCase`,
                                description: `React 组件名应使用 PascalCase，建议改为 "${toPascalCase(name)}"`,
                                severity: "warning",
                                file: context.filePath,
                                line,
                                column,
                                source: `function ${name}`,
                            });
                        }
                    } else {
                        // 普通函数用 camelCase
                        if (!isCamelCase(name)) {
                            issues.push({
                                ruleId: "naming-function",
                                title: `函数名 "${name}" 应使用 camelCase`,
                                description: `普通函数应使用 camelCase，建议改为 "${toCamelCase(name)}"`,
                                severity: "warning",
                                file: context.filePath,
                                line,
                                column,
                                source: `function ${name}`,
                                fix: {
                                    text: toCamelCase(name),
                                    start: { line, column: column + 9 },
                                    end: { line, column: column + 9 + name.length },
                                },
                            });
                        }
                    }
                },

                // 方法定义: class Foo { bar() {} }
                ClassMethod(path) {
                    const name = path.node.key.type === "Identifier" ? path.node.key.name : null;
                    if (!name) return;
                    if (shouldIgnoreName(name, config)) return;
                    // 构造函数、getter、setter 等内置方法不检查
                    if (name === "constructor" || name.startsWith("get ") || name.startsWith("set ")) return;

                    const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

                    if (!isCamelCase(name)) {
                        issues.push({
                            ruleId: "naming-function",
                            title: `方法名 "${name}" 应使用 camelCase`,
                            description: `类方法应使用 camelCase，建议改为 "${toCamelCase(name)}"`,
                            severity: "warning",
                            file: context.filePath,
                            line,
                            column,
                            source: `${name}()`,
                        });
                    }
                },

                // 对象方法: { foo() {} }
                ObjectMethod(path) {
                    const name = path.node.key.type === "Identifier" ? path.node.key.name : null;
                    if (!name) return;
                    if (shouldIgnoreName(name, config)) return;

                    const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

                    if (!isCamelCase(name)) {
                        issues.push({
                            ruleId: "naming-function",
                            title: `对象方法名 "${name}" 应使用 camelCase`,
                            description: `对象方法应使用 camelCase，建议改为 "${toCamelCase(name)}"`,
                            severity: "suggestion",
                            file: context.filePath,
                            line,
                            column,
                            source: `${name}()`,
                        });
                    }
                },

                // 箭头函数变量: const foo = () => {}
                VariableDeclarator(path) {
                    const id = path.node.id;
                    if (id.type !== "Identifier") return;
                    const name = id.name;
                    if (shouldIgnoreName(name, config)) return;

                    // 只检查 const 声明的箭头函数
                    const parent = path.parentPath;
                    if (!parent?.isVariableDeclaration() || parent.node.kind !== "const") return;

                    const init = path.node.init;
                    if (!init || init.type !== "ArrowFunctionExpression") return;

                    const { line, column } = id.loc?.start || { line: 0, column: 0 };

                    // 检测是否是 React 组件
                    const isComponent = config.allowPascalCaseComponents && isLikelyReactComponent(init, name);

                    if (isComponent) {
                        if (!isPascalCase(name)) {
                            issues.push({
                                ruleId: "naming-function",
                                title: `React 组件 "${name}" 应使用 PascalCase`,
                                description: `React 组件应使用 PascalCase，建议改为 "${toPascalCase(name)}"`,
                                severity: "warning",
                                file: context.filePath,
                                line,
                                column,
                                source: `const ${name} = () =>`,
                            });
                        }
                    } else {
                        if (!isCamelCase(name)) {
                            issues.push({
                                ruleId: "naming-function",
                                title: `函数变量 "${name}" 应使用 camelCase`,
                                description: `函数变量应使用 camelCase，建议改为 "${toCamelCase(name)}"`,
                                severity: "suggestion",
                                file: context.filePath,
                                line,
                                column,
                                source: `const ${name} = () =>`,
                                fix: {
                                    text: toCamelCase(name),
                                    start: { line, column },
                                    end: { line, column: column + name.length },
                                },
                            });
                        }
                    }
                },
            });

            return issues;
        },
    },
    {
        id: "naming-variable",
        name: "变量应使用 camelCase",
        description: "let/var 声明的变量使用 camelCase，const 常量使用 UPPER_SNAKE_CASE",
        severity: "suggestion",
        category: "style",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/naming-variable.md",
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const config = getNamingConfig(context);

            const ast = context.utils.parseAST(context.source, {
                ext: getFileExt(context.filePath),
            }) as ParseResult<any> | null;

            if (!ast) return issues;

            traverse(ast, {
                VariableDeclarator(path) {
                    const id = path.node.id;
                    if (id.type !== "Identifier") return;
                    const name = id.name;
                    if (shouldIgnoreName(name, config)) return;

                    const parent = path.parentPath;
                    if (!parent?.isVariableDeclaration()) return;

                    const kind = parent.node.kind; // 'const' | 'let' | 'var'
                    const init = path.node.init;
                    const { line, column } = id.loc?.start || { line: 0, column: 0 };

                    if (kind === "const") {
                        // const 声明：区分常量和普通变量
                        // 如果初始值是字面量（string/number/boolean/array/object），视为常量
                        const isLiteral =
                            init &&
                            (init.type === "StringLiteral" ||
                                init.type === "NumericLiteral" ||
                                init.type === "BooleanLiteral" ||
                                init.type === "ArrayExpression" ||
                                init.type === "ObjectExpression" ||
                                init.type === "UnaryExpression"); // -1, !true 等

                        // 但 React 组件不是常量（已在上面的规则中处理）
                        if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
                            return; // 由 naming-function 规则处理
                        }

                        if (isLiteral && config.constantCase === "UPPER_SNAKE_CASE") {
                            // 常量应 UPPER_SNAKE_CASE（但对象/数组可以有例外）
                            if (!isUpperSnakeCase(name) && !isCamelCase(name)) {
                                // 如果既不是 UPPER_SNAKE_CASE 也不是 camelCase，报错
                                issues.push({
                                    ruleId: "naming-variable",
                                    title: `常量 "${name}" 建议使用 UPPER_SNAKE_CASE`,
                                    description: `const 声明的字面量常量建议使用全大写下划线分隔，如 "${toUpperSnakeCase(name)}"`,
                                    severity: "suggestion",
                                    file: context.filePath,
                                    line,
                                    column,
                                    source: `const ${name}`,
                                });
                            }
                        } else {
                            // 普通 const 变量：camelCase
                            if (!isCamelCase(name)) {
                                issues.push({
                                    ruleId: "naming-variable",
                                    title: `变量 "${name}" 应使用 camelCase`,
                                    description: `变量应使用 camelCase，建议改为 "${toCamelCase(name)}"`,
                                    severity: "suggestion",
                                    file: context.filePath,
                                    line,
                                    column,
                                    source: `const ${name}`,
                                });
                            }
                        }
                    } else {
                        // let/var：camelCase
                        if (!isCamelCase(name)) {
                            issues.push({
                                ruleId: "naming-variable",
                                title: `变量 "${name}" 应使用 camelCase`,
                                description: `${kind} 声明的变量应使用 camelCase，建议改为 "${toCamelCase(name)}"`,
                                severity: "suggestion",
                                file: context.filePath,
                                line,
                                column,
                                source: `${kind} ${name}`,
                            });
                        }
                    }
                },
            });

            return issues;
        },
    },
    {
        id: "naming-private-member",
        name: "私有成员应有明确前缀",
        description: "私有属性和方法应使用 _ 前缀或 # 前缀",
        severity: "suggestion",
        category: "style",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/naming-private-member.md",
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const config = getNamingConfig(context);
            if (config.privatePrefix === "none") return [];

            const ast = context.utils.parseAST(context.source, {
                ext: getFileExt(context.filePath),
            }) as ParseResult<any> | null;

            if (!ast) return issues;

            traverse(ast, {
                // TypeScript 私有修饰符
                ClassProperty(path) {
                    const node = path.node as any;
                    const key = node.key;
                    if (key.type !== "Identifier") return;
                    const name = key.name;

                    // 检查 TS private 修饰符
                    const isPrivate = node.accessibility === "private" || node.private;
                    if (!isPrivate) return;

                    const { line, column } = key.loc?.start || { line: 0, column: 0 };

                    if (config.privatePrefix === "underscore" && !name.startsWith("_")) {
                        issues.push({
                            ruleId: "naming-private-member",
                            title: `私有属性 "${name}" 应使用 _ 前缀`,
                            description: `私有属性建议添加 _ 前缀，改为 "_${name}"`,
                            severity: "suggestion",
                            file: context.filePath,
                            line,
                            column,
                            source: `private ${name}`,
                        });
                    }
                },

                ClassMethod(path) {
                    const node = path.node as any;
                    const key = node.key;
                    if (key.type !== "Identifier") return;
                    const name = key.name;
                    if (name === "constructor") return;

                    const isPrivate = node.accessibility === "private";
                    if (!isPrivate) return;

                    const { line, column } = key.loc?.start || { line: 0, column: 0 };

                    if (config.privatePrefix === "underscore" && !name.startsWith("_")) {
                        issues.push({
                            ruleId: "naming-private-member",
                            title: `私有方法 "${name}" 应使用 _ 前缀`,
                            description: `私有方法建议添加 _ 前缀，改为 "_${name}"`,
                            severity: "suggestion",
                            file: context.filePath,
                            line,
                            column,
                            source: `private ${name}()`,
                        });
                    }
                },

                // JS 私有字段 #foo
                ClassPrivateProperty(path) {
                    // # 前缀是 JS 原生私有字段，已经满足 hash 前缀
                    // 如果配置要求 underscore，而实际用了 hash，给出建议
                    if (config.privatePrefix === "underscore") {
                        const node = path.node as any;
                        const name = node.key?.id?.name || "";
                        const { line, column } = node.loc?.start || { line: 0, column: 0 };
                        issues.push({
                            ruleId: "naming-private-member",
                            title: `私有字段 "#${name}" 建议改为 _ 前缀`,
                            description: `项目约定私有成员使用 _ 前缀，建议改为 "_${name}"`,
                            severity: "suggestion",
                            file: context.filePath,
                            line,
                            column,
                            source: `#${name}`,
                        });
                    }
                },
            });

            return issues;
        },
    },
    {
        id: "naming-file-folder",
        name: "文件和文件夹命名规范",
        description: "文件名和文件夹名建议使用 kebab-case",
        severity: "suggestion",
        category: "style",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/naming-file-folder.md",
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const config = getNamingConfig(context);

            // 检查文件名
            const fileName = basename(context.filePath);
            const nameWithoutExt = fileName.replace(extname(fileName), "");

            // 跳过特殊文件
            if (
                nameWithoutExt.startsWith(".") || // .eslintrc, .babelrc
                nameWithoutExt === "index" ||
                nameWithoutExt === "main" ||
                nameWithoutExt === "App" ||
                nameWithoutExt === "setupTests" ||
                /^(vite|webpack|rollup|babel|jest|eslint|prettier|tsconfig|jsconfig|postcss|tailwind)/i.test(
                    nameWithoutExt
                )
            ) {
                // 跳过配置文件和入口文件
            } else if (
                config.fileNameCase === "kebab-case" &&
                !isKebabCase(nameWithoutExt) &&
                !isCamelCase(nameWithoutExt)
            ) {
                const { line, column } = { line: 1, column: 1 };
                issues.push({
                    ruleId: "naming-file-folder",
                    title: `文件名 "${nameWithoutExt}" 建议使用 kebab-case`,
                    description: `文件名建议使用短横线连接的小写格式，如 "${toKebabCase(nameWithoutExt)}"`,
                    severity: "suggestion",
                    file: context.filePath,
                    line,
                    column,
                    source: fileName,
                });
            }

            // 检查文件夹名
            const dirPath = dirname(context.filePath);
            const dirName = basename(dirPath);

            // 跳过根目录和特殊目录
            if (
                dirName.startsWith(".") ||
                dirName === "node_modules" ||
                dirName === "src" ||
                dirName === "dist" ||
                dirName === "build" ||
                dirName === "public" ||
                dirName === "assets" ||
                dirName === "components" ||
                dirName === "pages" ||
                dirName === "utils" ||
                dirName === "hooks" ||
                dirName === "types" ||
                dirName === "constants" ||
                dirName === "services" ||
                dirName === "store" ||
                dirName === "styles" ||
                dirName === "locales" ||
                dirName === "i18n" ||
                dirName === "tests" ||
                dirName === "__tests__" ||
                dirName === "__mocks__"
            ) {
                // 跳过标准目录名
            } else if (config.folderNameCase === "kebab-case" && !isKebabCase(dirName) && !isCamelCase(dirName)) {
                // 只检查直接父目录（避免检查太深层）
                // 不直接报告，因为无法精确定位到目录的代码位置
                // 记录在 meta 中供汇总报告
            }

            return issues;
        },
    },
];

// ============================================================================
// 辅助函数
// ============================================================================

/** 获取命名规范配置 */
function getNamingConfig(context: RuleContext): NamingConfig {
    return { ...DEFAULT_NAMING, ...(context.config.naming || {}) };
}

/** 通用的标识符大小写检查 */
function checkIdentifierCase(
    context: RuleContext,
    nodeType: string,
    kindLabel: string,
    expectedCase: "PascalCase" | "camelCase" | "UPPER_SNAKE_CASE"
): Issue[] {
    const issues: Issue[] = [];

    const ast = context.utils.parseAST(context.source, {
        ext: getFileExt(context.filePath),
    }) as ParseResult<any> | null;

    if (!ast) return issues;

    traverse(ast, {
        [nodeType](path: any) {
            const name = path.node.id?.name;
            if (!name) return;

            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

            let isValid = false;
            let suggestion = "";

            switch (expectedCase) {
                case "PascalCase":
                    isValid = isPascalCase(name);
                    suggestion = toPascalCase(name);
                    break;
                case "camelCase":
                    isValid = isCamelCase(name);
                    suggestion = toCamelCase(name);
                    break;
                case "UPPER_SNAKE_CASE":
                    isValid = isUpperSnakeCase(name);
                    suggestion = toUpperSnakeCase(name);
                    break;
            }

            if (!isValid) {
                issues.push({
                    ruleId: `naming-${kindLabel}`,
                    title: `${kindLabel}名 "${name}" 应使用 ${expectedCase}`,
                    description: `${kindLabel}应使用 ${expectedCase}，建议改为 "${suggestion}"`,
                    severity: "warning",
                    file: context.filePath,
                    line,
                    column,
                    source: `${kindLabel} ${name}`,
                    fix: {
                        text: suggestion,
                        start: { line, column: column + kindLabel.length + 1 },
                        end: { line, column: column + kindLabel.length + 1 + name.length },
                    },
                });
            }
        },
    });

    return issues;
}

/** 是否是 PascalCase */
function isPascalCase(str: string): boolean {
    return /^[A-Z][a-zA-Z0-9]*$/.test(str) && /[a-z]/.test(str);
}

/** 是否是 camelCase */
function isCamelCase(str: string): boolean {
    return /^[a-z][a-zA-Z0-9]*$/.test(str);
}

/** 是否是 UPPER_SNAKE_CASE */
function isUpperSnakeCase(str: string): boolean {
    return /^[A-Z][A-Z0-9_]*$/.test(str);
}

/** 是否是 kebab-case */
function isKebabCase(str: string): boolean {
    return /^[a-z][a-z0-9-]*$/.test(str) && !str.endsWith("-");
}

/** 转换为 PascalCase */
function toPascalCase(str: string): string {
    // 处理已有的分隔符
    return str
        .replace(/[-_]/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join("");
}

/** 转换为 camelCase */
function toCamelCase(str: string): string {
    const pascal = toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** 转换为 UPPER_SNAKE_CASE */
function toUpperSnakeCase(str: string): string {
    return str
        .replace(/[-]/g, "_")
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
        .toUpperCase()
        .replace(/^_+|_+$/g, "");
}

/** 转换为 kebab-case */
function toKebabCase(str: string): string {
    return str
        .replace(/_/g, "-")
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
        .toLowerCase()
        .replace(/^-+|-+$/g, "");
}

/** 检测是否是 React 组件 */
function isLikelyReactComponent(node: any, name: string): boolean {
    // 1. 名字以大写字母开头（PascalCase）
    if (!/^[A-Z]/.test(name)) return false;

    // 2. 检查函数体是否返回 JSX
    let body = node.body;
    if (!body) return false;

    // 箭头函数可能直接返回表达式
    if (body.type !== "BlockStatement") {
        return isJSXExpression(body);
    }

    // 遍历函数体找 return 语句
    for (const stmt of body.body || []) {
        if (stmt.type === "ReturnStatement" && stmt.argument) {
            if (isJSXExpression(stmt.argument)) return true;
        }
    }

    return false;
}

/** 是否是 JSX 表达式 */
function isJSXExpression(node: any): boolean {
    if (!node) return false;
    return (
        node.type === "JSXElement" ||
        node.type === "JSXFragment" ||
        node.type === "JSXText" ||
        (node.type === "ConditionalExpression" &&
            (isJSXExpression(node.consequent) || isJSXExpression(node.alternate))) ||
        (node.type === "LogicalExpression" && (isJSXExpression(node.left) || isJSXExpression(node.right))) ||
        (node.type === "CallExpression" && isJSXExpression(node.arguments[0]))
    );
}

/** 是否应该忽略的名字 */
function shouldIgnoreName(name: string, config: NamingConfig): boolean {
    // 单字母变量
    if (config.allowSingleLetter && name.length === 1) return true;

    // 下划线开头的内部变量
    if (name.startsWith("_")) return true;

    // $ 前缀（jQuery, Vue 等）
    if (name.startsWith("$")) return true;

    // 双下划线（魔术方法、内部方法）
    if (name.startsWith("__")) return true;

    // React/Vue 特殊名
    if (["props", "state", "emit", "slots", "attrs", "refs", "context", "children"].includes(name)) return true;

    // 配置中的忽略模式
    for (const pattern of config.ignorePatterns || []) {
        try {
            const regex = new RegExp(pattern);
            if (regex.test(name)) return true;
        } catch {
            // 无效正则，跳过
        }
    }

    return false;
}

