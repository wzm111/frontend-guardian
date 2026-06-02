/**
 * AST 解析工具
 * 基于 @babel/parser，支持 JS/TS/JSX/TSX/Vue SFC
 */

import { parse as babelParse } from "@babel/parser";
import type { ParseResult, ParserOptions } from "@babel/parser";
import type { File, Node } from "@babel/types";
import traverse from "@babel/traverse";
import type { ImportInfo } from "@/types.js";

export interface ParseOptions {
    ext?: string;
    sourceType?: "script" | "module";
    jsx?: boolean;
}

/** 解析源代码为 AST */
export function parseAST(source: string, options?: ParseOptions): ParseResult<File> | null {
    const ext = options?.ext || ".js";
    const isTS = ext === ".ts" || ext === ".tsx" || ext === ".vue";
    const isJSX = ext === ".jsx" || ext === ".tsx" || ext === ".vue" || options?.jsx;

    // Vue SFC: 提取 <script> 内容
    if (ext === ".vue") {
        const scriptMatch = source.match(/<script[^>]*>([\s\S]*?)<\/script>/);
        if (scriptMatch) {
            source = scriptMatch[1].trim();
        } else {
            return null;
        }
    }

    const parserOpts: ParserOptions = {
        sourceType: options?.sourceType || "module",
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: [
            "decorators-legacy",
            "classProperties",
            "objectRestSpread",
            "asyncGenerators",
            "dynamicImport",
            "optionalChaining",
            "nullishCoalescingOperator",
            ...(isTS ? ["typescript" as const] : []),
            ...(isJSX ? ["jsx" as const] : []),
        ],
    };

    try {
        return babelParse(source, parserOpts);
    } catch (err) {
        // 解析失败，返回 null
        return null;
    }
}

/** 从 AST 提取 import 信息 */
export function getImports(ast: ParseResult<File> | null): ImportInfo[] {
    if (!ast) return [];

    const imports: ImportInfo[] = [];

    traverse(ast, {
        ImportDeclaration(path) {
            const source = path.node.source.value;
            const specifiers: string[] = [];
            let defaultImport: string | undefined;
            let namespaceImport: string | undefined;
            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

            for (const spec of path.node.specifiers) {
                if (spec.type === "ImportDefaultSpecifier") {
                    defaultImport = spec.local.name;
                } else if (spec.type === "ImportNamespaceSpecifier") {
                    namespaceImport = spec.local.name;
                } else if (spec.type === "ImportSpecifier") {
                    specifiers.push(spec.local.name);
                }
            }

            imports.push({
                source,
                specifiers,
                defaultImport,
                namespaceImport,
                line,
                column,
            });
        },
    });

    return imports;
}

/** 检查 AST 是否包含特定 import */
export function hasImport(ast: ParseResult<File> | null, moduleName: string, importName?: string): boolean {
    if (!ast) return false;

    const imports = getImports(ast);
    for (const imp of imports) {
        if (imp.source === moduleName) {
            if (!importName) return true;
            if (imp.defaultImport === importName) return true;
            if (imp.specifiers.includes(importName)) return true;
        }
    }
    return false;
}

/** 遍历 AST 节点 */
export function walkAST<T extends Node>(
    ast: ParseResult<File> | null,
    nodeType: string,
    callback: (node: T, path: any) => void
): void {
    if (!ast) return;

    traverse(ast, {
        [nodeType](path: any) {
            callback(path.node as T, path);
        },
    });
}
