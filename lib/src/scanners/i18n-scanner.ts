/**
 * i18n 硬编码检测 Scanner（AST 级别）
 *
 * 检测类型：
 * 1. 字符串字面量中的中文："你好"
 * 2. 模板字符串中的中文：`你好 ${name}`
 * 3. JSXText 中的中文：<div>你好</div>
 * 4. 已 i18n 调用中的中文（漏翻）
 * 5. console.log / 注释 / 测试文件中的中文（可配置忽略）
 */

import type { Node } from "@babel/types";
import type { ParseResult } from "@babel/parser";
import traverse from "@babel/traverse";
import type { Rule, RuleContext, Issue } from "../types.js";
import { parseAST } from "../utils/ast-parser.js";
import { getFileExt } from "../utils/common.js";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";

/** 中文字符正则（包含中文标点） */
const CHINESE_REGEX = /[一-龥　-〿＀-￯]/;

/** i18n 函数名列表 */
const I18N_FUNCTION_NAMES = [
    "t",
    "$t",
    "i18n.t",
    "translate",
    "formatMessage",
    "intl.formatMessage",
    "i18next.t",
    "$i18n.t",
];

export const i18nRules: Rule[] = [
    {
        id: "i18n-hardcoded-string",
        name: "硬编码中文字符串",
        description: "代码中存在未国际化的中文字符串字面量",
        severity: "warning",
        category: "i18n",
        defaultEnabled: true,
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const ast = context.utils.parseAST(context.source, {
                ext: getFileExt(context.filePath),
            }) as ParseResult<any> | null;

            if (!ast) return issues;

            traverse(ast, {
                // 1. 字符串字面量中的中文
                StringLiteral(path) {
                    const value = path.node.value;
                    if (!containsChinese(value)) return;

                    const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

                    // 跳过特定场景
                    if (shouldIgnoreStringLiteral(path, value, context.source)) return;

                    issues.push({
                        ruleId: "i18n-hardcoded-string",
                        title: "发现硬编码中文字符串",
                        description: `文件中的字符串 "${truncate(value, 30)}" 未进行国际化处理`,
                        severity: "warning",
                        file: context.filePath,
                        line,
                        column,
                        source: value,
                        fix: {
                            text: generateI18nCall(value),
                            start: { line, column },
                            end: { line, column: column + value.length + 2 },
                        },
                    });
                },

                // 2. 模板字符串中的中文
                TemplateLiteral(path) {
                    for (let i = 0; i < path.node.quasis.length; i++) {
                        const quasi = path.node.quasis[i];
                        const value = quasi.value.raw;
                        if (!containsChinese(value)) continue;

                        const { line, column } = quasi.loc?.start || { line: 0, column: 0 };

                        // 跳过特定场景
                        if (isInsideConsoleOrTest(path)) continue;

                        issues.push({
                            ruleId: "i18n-hardcoded-template",
                            title: "发现硬编码中文模板字符串",
                            description: `模板字符串中的 "${truncate(value, 30)}" 未进行国际化处理`,
                            severity: "warning",
                            file: context.filePath,
                            line,
                            column,
                            source: value,
                        });
                    }
                },

                // 3. JSXText 中的中文
                JSXText(path) {
                    const value = path.node.value;
                    if (!containsChinese(value.trim())) return;

                    const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

                    issues.push({
                        ruleId: "i18n-hardcoded-jsx-text",
                        title: "发现硬编码中文 JSX 文本",
                        description: `JSX 中的文本 "${truncate(value.trim(), 30)}" 未进行国际化处理`,
                        severity: "critical",
                        file: context.filePath,
                        line,
                        column,
                        source: value.trim(),
                        fix: {
                            text: `{${generateI18nCall(value.trim())}}`,
                            start: { line, column },
                            end: { line, column: column + value.length },
                        },
                    });
                },

                // 4. 属性中的中文
                JSXAttribute(path) {
                    const attrName = path.node.name.name as string;
                    const attrValue = path.node.value;

                    if (
                        attrName === "title" ||
                        attrName === "placeholder" ||
                        attrName === "alt" ||
                        attrName === "label"
                    ) {
                        if (attrValue?.type === "StringLiteral" && containsChinese(attrValue.value)) {
                            const { line, column } = attrValue.loc?.start || { line: 0, column: 0 };

                            issues.push({
                                ruleId: "i18n-hardcoded-attribute",
                                title: `发现硬编码中文 ${attrName} 属性`,
                                description: `属性 ${attrName}="${truncate(attrValue.value, 30)}" 未进行国际化处理`,
                                severity: "warning",
                                file: context.filePath,
                                line,
                                column,
                                source: attrValue.value,
                            });
                        }
                    }
                },
            });

            return issues;
        },
    },

    {
        id: "i18n-missing-key",
        name: "语言包缺失 Key",
        description: "代码中引用了语言包中不存在的 key",
        severity: "critical",
        category: "i18n",
        defaultEnabled: true,
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];

            // 跳过非源码文件
            const ext = extname(context.filePath).toLowerCase();
            if (![".js", ".ts", ".jsx", ".tsx", ".vue"].includes(ext)) return issues;

            // 收集语言包 key（模块级缓存）
            const projectDir = context.filePath.split("/src/")[0] || dirname(context.filePath);
            const localeKeys = collectLocaleKeys(projectDir, context.config);

            if (localeKeys.size === 0) return issues;

            // 解析 AST
            const ast = context.utils.parseAST(context.source, {
                ext: getFileExt(context.filePath),
            }) as ParseResult<any> | null;

            if (!ast) return issues;

            // 提取代码中引用的 key
            const codeKeys = extractCodeKeys(ast);

            for (const { key, line, column } of codeKeys) {
                // 跳过动态 key（含变量）
                if (!key || key.includes("${") || key.includes("{{")) continue;

                if (!localeKeys.has(key)) {
                    issues.push({
                        ruleId: "i18n-missing-key",
                        title: `语言包缺失 Key: ${key}`,
                        description: `代码引用的国际化 key "${key}" 在语言包中未找到`,
                        severity: "critical",
                        file: context.filePath,
                        line,
                        column,
                        source: key,
                    });
                }
            }

            return issues;
        },
    },

    {
        id: "i18n-unused-key",
        name: "语言包未使用 Key",
        description: "语言包中存在但代码中未引用的 key",
        severity: "suggestion",
        category: "i18n",
        defaultEnabled: true,
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];

            // 跳过非源码文件
            const ext = extname(context.filePath).toLowerCase();
            if (![".js", ".ts", ".jsx", ".tsx", ".vue"].includes(ext)) return issues;

            // 收集语言包 key（模块级缓存）
            const projectDir = context.filePath.split("/src/")[0] || dirname(context.filePath);
            const localeKeys = collectLocaleKeys(projectDir, context.config);

            if (localeKeys.size === 0) return issues;

            // 收集代码中引用的所有 key（项目级缓存，只扫描一次）
            const codeKeys = collectAllCodeKeys(projectDir, context);

            if (codeKeys.size === 0) return issues;

            // 找出语言包中有但代码中未引用的 key
            for (const key of localeKeys) {
                if (!codeKeys.has(key)) {
                    // 只报告一次每个 key
                    issues.push({
                        ruleId: "i18n-unused-key",
                        title: `语言包未使用 Key: ${key}`,
                        description: `国际化 key "${key}" 在语言包中存在，但代码中未找到引用。如果已废弃，建议从语言包中删除`,
                        severity: "suggestion",
                        file: context.filePath,
                        line: 1,
                        column: 1,
                        source: key,
                    });
                }
            }

            return issues;
        },
    },
];

/** 判断是否包含中文 */
function containsChinese(str: string): boolean {
    return CHINESE_REGEX.test(str);
}

/** 截断字符串 */
function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + "...";
}


/** 生成 i18n 调用 */
function generateI18nCall(text: string): string {
    // 将中文转换为 key 格式
    const key = textToKey(text);
    return `t('${key}')`;
}

/** 中文文本转 key */
function textToKey(text: string): string {
    return text
        .trim()
        .slice(0, 20)
        .replace(/[^一-龥a-zA-Z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}

/** 判断字符串字面量是否应被忽略 */
function shouldIgnoreStringLiteral(path: any, value: string, source: string): boolean {
    // 1. 在 import 语句中
    if (path.parentPath?.isImportDeclaration()) return true;
    if (path.parentPath?.isImportSpecifier()) return true;

    // 2. 在 i18n 调用中
    if (isInsideI18nCall(path)) return true;

    // 3. 在 console 调用中
    if (isInsideConsoleOrTest(path)) return true;

    // 4. 在注释中
    if (isInComment(path, source)) return true;

    return false;
}

/** 是否在 i18n 函数调用中 */
function isInsideI18nCall(path: any): boolean {
    let current = path.parentPath;
    while (current) {
        if (current.isCallExpression()) {
            const callee = current.node.callee;
            const calleeName = getCalleeName(callee);
            if (I18N_FUNCTION_NAMES.some((fn) => calleeName?.endsWith(fn))) {
                return true;
            }
        }
        current = current.parentPath;
    }
    return false;
}

/** 是否在 console 或测试代码中 */
function isInsideConsoleOrTest(path: any): boolean {
    let current = path.parentPath;
    while (current) {
        if (current.isCallExpression()) {
            const calleeName = getCalleeName(current.node.callee);
            if (calleeName?.startsWith("console.")) return true;
            if (["describe", "it", "test", "beforeEach", "afterEach"].includes(calleeName || "")) {
                return true;
            }
        }
        current = current.parentPath;
    }
    return false;
}

/** 是否在注释中（简单判断） */
function isInComment(path: any, source: string): boolean {
    // 更精确的实现需要 source map，这里做简单判断
    const { line } = path.node.loc?.start || { line: 0 };
    const lines = source.split("\n");
    if (line > 0 && line <= lines.length) {
        const lineStr = lines[line - 1].trim();
        if (lineStr.startsWith("//") || lineStr.startsWith("*") || lineStr.startsWith("/*")) {
            return true;
        }
    }
    return false;
}

// ============================================================================
// 语言包 Key 索引（v2.1.0: 使用 Map 替代模块级变量，支持多项目并发）
// ============================================================================

const localeKeyCacheMap = new Map<string, Set<string>>();

/** 扫描语言包目录，收集所有 key */
function collectLocaleKeys(projectDir: string, config: any): Set<string> {
    const cached = localeKeyCacheMap.get(projectDir);
    if (cached) {
        return cached;
    }

    const keys = new Set<string>();
    // 预留：sourceLocale / format 可用于未来按语言筛选
    void config?.i18n?.sourceLocale;
    void config?.i18n?.format;

    // 常见语言包目录
    const localeDirs = [
        resolve(projectDir, "locales"),
        resolve(projectDir, "i18n"),
        resolve(projectDir, "lang"),
        resolve(projectDir, "messages"),
        resolve(projectDir, "src/locales"),
        resolve(projectDir, "src/i18n"),
        resolve(projectDir, "src/lang"),
    ];

    for (const dir of localeDirs) {
        if (!existsSync(dir)) continue;

        try {
            const files = readdirSync(dir, { recursive: true, encoding: "utf-8" }) as string[];
            for (const file of files) {
                const fullPath = resolve(dir, file);
                const ext = extname(file).toLowerCase();

                if (ext === ".json") {
                    extractKeysFromJSON(fullPath, keys);
                } else if (ext === ".js" || ext === ".ts") {
                    extractKeysFromJS(fullPath, keys);
                } else if (ext === ".yaml" || ext === ".yml") {
                    // TODO: YAML 解析
                }
            }
        } catch {
            // 目录读取失败，跳过
        }
    }

    localeKeyCacheMap.set(projectDir, keys);
    return keys;
}

/** 从 JSON 文件提取 key（递归） */
function extractKeysFromJSON(filePath: string, keys: Set<string>): void {
    try {
        const content = readFileSync(filePath, "utf-8");
        const data = JSON.parse(content);
        extractKeysRecursive(data, "", keys);
    } catch {
        // 解析失败，跳过
    }
}

/** 从 JS/TS 文件提取 key */
function extractKeysFromJS(filePath: string, keys: Set<string>): void {
    try {
        const content = readFileSync(filePath, "utf-8");
        // 简单提取 export default { ... } 中的 key
        const match = content.match(/export\s+default\s*\{([\s\S]*?)\}/);
        if (match) {
            const objContent = match[1];
            const keyRegex = /['"]([^'"]+)['"]\s*:/g;
            let m;
            while ((m = keyRegex.exec(objContent)) !== null) {
                keys.add(m[1]);
            }
        }
    } catch {
        // 解析失败，跳过
    }
}

/** 递归提取对象 key */
function extractKeysRecursive(obj: any, prefix: string, keys: Set<string>): void {
    if (typeof obj !== "object" || obj === null) return;

    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "string") {
            keys.add(fullKey);
        } else if (typeof value === "object" && value !== null) {
            extractKeysRecursive(value, fullKey, keys);
        }
    }
}

// ============================================================================
// 代码中 i18n Key 提取
// ============================================================================

/** 从 AST 中提取代码中引用的 i18n key */
function extractCodeKeys(ast: ParseResult<any> | null): Array<{ key: string; line: number; column: number }> {
    const keys: Array<{ key: string; line: number; column: number }> = [];
    if (!ast) return keys;

    traverse(ast, {
        // t('key') / $t('key') / formatMessage({ id: 'key' })
        CallExpression(path) {
            const callee = path.node.callee;
            const calleeName = getCalleeName(callee);

            if (!calleeName) return;

            // 匹配 t(), $t(), i18n.t(), translate()
            if (I18N_FUNCTION_NAMES.some((fn) => calleeName.endsWith(fn) || calleeName === fn)) {
                const firstArg = path.node.arguments[0];
                if (firstArg?.type === "StringLiteral") {
                    const { line, column } = firstArg.loc?.start || { line: 0, column: 0 };
                    keys.push({ key: firstArg.value, line, column });
                }
            }

            // 匹配 formatMessage({ id: 'key' })
            if (calleeName === "formatMessage" || calleeName === "intl.formatMessage") {
                const firstArg = path.node.arguments[0];
                if (firstArg?.type === "ObjectExpression") {
                    for (const prop of firstArg.properties) {
                        if (
                            prop.type === "ObjectProperty" &&
                            prop.key.type === "Identifier" &&
                            prop.key.name === "id" &&
                            prop.value.type === "StringLiteral"
                        ) {
                            const { line, column } = prop.value.loc?.start || { line: 0, column: 0 };
                            keys.push({ key: prop.value.value, line, column });
                        }
                    }
                }
            }
        },

        // JSX: <FormattedMessage id="key" />
        JSXOpeningElement(path) {
            const name = path.node.name;
            if (name.type === "JSXIdentifier" && name.name === "FormattedMessage") {
                for (const attr of path.node.attributes) {
                    if (
                        attr.type === "JSXAttribute" &&
                        attr.name.type === "JSXIdentifier" &&
                        attr.name.name === "id" &&
                        attr.value?.type === "StringLiteral"
                    ) {
                        const { line, column } = attr.value.loc?.start || { line: 0, column: 0 };
                        keys.push({ key: attr.value.value, line, column });
                    }
                }
            }
        },
    });

    return keys;
}

/** 项目中所有代码引用的 key（v2.1.0: 使用 Map 替代模块级变量） */
const allCodeKeysCacheMap = new Map<string, Set<string>>();

/** 扫描项目中所有代码文件，收集引用的 i18n key */
function collectAllCodeKeys(projectDir: string, context: RuleContext): Set<string> {
    const cached = allCodeKeysCacheMap.get(projectDir);
    if (cached) {
        return cached;
    }

    const keys = new Set<string>();

    // 扫描 src 目录下的代码文件
    const srcDir = resolve(projectDir, "src");
    const codeDirs = [srcDir, projectDir];

    for (const dir of codeDirs) {
        if (!existsSync(dir)) continue;

        try {
            const files = readdirSync(dir, { recursive: true, encoding: "utf-8" }) as string[];
            for (const file of files) {
                const fullPath = resolve(dir, file);
                const ext = extname(file).toLowerCase();

                if (![".js", ".ts", ".jsx", ".tsx", ".vue"].includes(ext)) continue;

                try {
                    const source = readFileSync(fullPath, "utf-8");
                    const ast = parseAST(source, { ext }) as ParseResult<any> | null;
                    if (!ast) continue;

                    const fileKeys = extractCodeKeys(ast);
                    for (const { key } of fileKeys) {
                        if (key && !key.includes("${") && !key.includes("{{")) {
                            keys.add(key);
                        }
                    }
                } catch {
                    // 单个文件解析失败，跳过
                }
            }
        } catch {
            // 目录读取失败，跳过
        }
    }

    allCodeKeysCacheMap.set(projectDir, keys);
    return keys;
}

/** 获取 callee 名称 */
function getCalleeName(callee: Node): string | null {
    if (callee.type === "Identifier") {
        return callee.name;
    }
    if (callee.type === "MemberExpression") {
        const obj = getCalleeName(callee.object);
        const prop = callee.property.type === "Identifier" ? callee.property.name : "";
        return obj ? `${obj}.${prop}` : prop;
    }
    return null;
}
