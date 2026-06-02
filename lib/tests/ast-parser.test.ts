/**
 * AST Parser 测试 — v2.2.0
 *
 * 覆盖 parseAST / getImports / hasImport / walkAST
 */

import { describe, it, expect } from "vitest";
import { parseAST, getImports, hasImport, walkAST } from "../src/utils/ast-parser.js";

describe("parseAST", () => {
    it("应正确解析普通 JS 代码", () => {
        const source = 'const x = 1;';
        const ast = parseAST(source, { ext: '.js' });
        expect(ast).not.toBeNull();
        expect(ast?.type).toBe('File');
    });

    it("应正确解析 TS 代码", () => {
        const source = 'const x: number = 1;';
        const ast = parseAST(source, { ext: '.ts' });
        expect(ast).not.toBeNull();
    });

    it("应正确解析 JSX 代码", () => {
        const source = 'const App = () => <div>hello</div>;';
        const ast = parseAST(source, { ext: '.jsx' });
        expect(ast).not.toBeNull();
    });

    it("应正确解析 TSX 代码", () => {
        const source = 'const App = () => <div>hello</div>;';
        const ast = parseAST(source, { ext: '.tsx' });
        expect(ast).not.toBeNull();
    });

    it("应正确解析 Vue SFC 的 script 内容", () => {
        const source = `<template><div>hello</div></template>
<script setup lang="ts">
const x: number = 1;
</script>`;
        const ast = parseAST(source, { ext: '.vue' });
        expect(ast).not.toBeNull();
    });

    it("Vue SFC 无 script 标签时应返回 null", () => {
        const source = '<template><div>hello</div></template>';
        const ast = parseAST(source, { ext: '.vue' });
        expect(ast).toBeNull();
    });

    it("应支持显式启用 JSX", () => {
        const source = 'const App = () => <div>hello</div>;';
        const ast = parseAST(source, { ext: '.js', jsx: true });
        expect(ast).not.toBeNull();
    });

    it("应支持 script 类型", () => {
        const source = 'var x = 1;';
        const ast = parseAST(source, { ext: '.js', sourceType: 'script' });
        expect(ast).not.toBeNull();
    });

    it("解析无效代码时应返回 null（不抛异常）", () => {
        const source = 'const {  };';
        const ast = parseAST(source, { ext: '.js' });
        expect(ast).toBeNull();
    });

    it("应支持装饰器语法", () => {
        const source = `@Component
class Foo {}`;
        const ast = parseAST(source, { ext: '.ts' });
        expect(ast).not.toBeNull();
    });

    it("应支持可选链和空值合并", () => {
        const source = 'const x = a?.b ?? c;';
        const ast = parseAST(source, { ext: '.js' });
        expect(ast).not.toBeNull();
    });

    it("应支持动态 import", () => {
        const source = 'const m = await import("mod");';
        const ast = parseAST(source, { ext: '.js' });
        expect(ast).not.toBeNull();
    });

    it("默认 ext 应为 .js", () => {
        const source = 'const x = 1;';
        const ast = parseAST(source);
        expect(ast).not.toBeNull();
    });
});

describe("getImports", () => {
    it("应提取 default import", () => {
        const source = 'import React from "react";';
        const ast = parseAST(source, { ext: '.js' });
        const imports = getImports(ast);
        expect(imports).toHaveLength(1);
        expect(imports[0].source).toBe('react');
        expect(imports[0].defaultImport).toBe('React');
        expect(imports[0].specifiers).toEqual([]);
    });

    it("应提取 named imports", () => {
        const source = 'import { useState, useEffect } from "react";';
        const ast = parseAST(source, { ext: '.js' });
        const imports = getImports(ast);
        expect(imports).toHaveLength(1);
        expect(imports[0].source).toBe('react');
        expect(imports[0].specifiers).toEqual(['useState', 'useEffect']);
    });

    it("应提取 namespace import", () => {
        const source = 'import * as React from "react";';
        const ast = parseAST(source, { ext: '.js' });
        const imports = getImports(ast);
        expect(imports).toHaveLength(1);
        expect(imports[0].namespaceImport).toBe('React');
    });

    it("应提取混合 import", () => {
        const source = 'import React, { useState } from "react";';
        const ast = parseAST(source, { ext: '.js' });
        const imports = getImports(ast);
        expect(imports).toHaveLength(1);
        expect(imports[0].defaultImport).toBe('React');
        expect(imports[0].specifiers).toEqual(['useState']);
    });

    it("应记录 import 位置", () => {
        const source = 'import { useState } from "react";';
        const ast = parseAST(source, { ext: '.js' });
        const imports = getImports(ast);
        expect(imports[0].line).toBe(1);
        expect(imports[0].column).toBe(0);
    });

    it("应提取多个 import 语句", () => {
        const source = `import React from "react";
import { foo } from "./bar";`;
        const ast = parseAST(source, { ext: '.js' });
        const imports = getImports(ast);
        expect(imports).toHaveLength(2);
        expect(imports[0].source).toBe('react');
        expect(imports[1].source).toBe('./bar');
    });

    it("AST 为 null 时应返回空数组", () => {
        const imports = getImports(null);
        expect(imports).toEqual([]);
    });
});

describe("hasImport", () => {
    it("应匹配模块名", () => {
        const source = 'import React from "react";';
        const ast = parseAST(source, { ext: '.js' });
        expect(hasImport(ast, 'react')).toBe(true);
        expect(hasImport(ast, 'vue')).toBe(false);
    });

    it("应匹配 default import 名称", () => {
        const source = 'import React from "react";';
        const ast = parseAST(source, { ext: '.js' });
        expect(hasImport(ast, 'react', 'React')).toBe(true);
        expect(hasImport(ast, 'react', 'Vue')).toBe(false);
    });

    it("应匹配 named import 名称", () => {
        const source = 'import { useState } from "react";';
        const ast = parseAST(source, { ext: '.js' });
        expect(hasImport(ast, 'react', 'useState')).toBe(true);
        expect(hasImport(ast, 'react', 'useEffect')).toBe(false);
    });

    it("应匹配 namespace import 名称", () => {
        const source = 'import * as React from "react";';
        const ast = parseAST(source, { ext: '.js' });
        expect(hasImport(ast, 'react', 'React')).toBe(true);
    });

    it("AST 为 null 时应返回 false", () => {
        expect(hasImport(null, 'react')).toBe(false);
    });
});

describe("walkAST", () => {
    it("应遍历指定类型的节点", () => {
        const source = 'const x = 1; const y = 2;';
        const ast = parseAST(source, { ext: '.js' });
        const declarations: any[] = [];
        walkAST(ast, 'VariableDeclaration', (node) => {
            declarations.push(node);
        });
        expect(declarations).toHaveLength(2);
    });

    it("应传递 path 参数给回调", () => {
        const source = 'const x = 1;';
        const ast = parseAST(source, { ext: '.js' });
        let receivedPath: any = null;
        walkAST(ast, 'VariableDeclaration', (node, path) => {
            receivedPath = path;
        });
        expect(receivedPath).not.toBeNull();
        expect(receivedPath.node).toBeDefined();
    });

    it("AST 为 null 时不应调用回调", () => {
        let called = false;
        walkAST(null, 'VariableDeclaration', () => {
            called = true;
        });
        expect(called).toBe(false);
    });

    it("应支持遍历 JSXElement", () => {
        const source = 'const App = () => <div><span/></div>;';
        const ast = parseAST(source, { ext: '.jsx' });
        const elements: any[] = [];
        walkAST(ast, 'JSXElement', (node) => {
            elements.push(node);
        });
        // div 和 span
        expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    it("应支持遍历 CallExpression", () => {
        const source = 'foo(); bar();';
        const ast = parseAST(source, { ext: '.js' });
        const calls: any[] = [];
        walkAST(ast, 'CallExpression', (node) => {
            calls.push(node);
        });
        expect(calls).toHaveLength(2);
    });
});
