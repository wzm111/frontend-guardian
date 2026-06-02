/**
 * Fix Engine 测试 — v2.2.0
 *
 * 覆盖 applyFixes（含 applySingleFix / makeDiffPreview）
 * 场景：单行修复、多行修复、dry-run 预览、多字节字符、多修复排序
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEngine } from "../src/engine/rule-engine.js";
import type { Issue } from "../src/types.js";

let tempDir: string;

beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "fg-fix-"));
    // 写入基础 package.json 让 detectProjectMeta 不报错
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");
});

afterEach(() => {
    try {
        rmSync(tempDir, { recursive: true, force: true });
    } catch {
        // ignore
    }
});

/** 创建带 fix 的 Issue */
function makeIssue(
    file: string,
    startLine: number,
    startCol: number,
    endLine: number,
    endCol: number,
    text: string,
    ruleId = "test-fix"
): Issue {
    return {
        ruleId,
        title: `Test fix ${ruleId}`,
        description: "Test description",
        severity: "warning",
        file,
        line: startLine,
        column: startCol,
        fix: {
            text,
            start: { line: startLine, column: startCol },
            end: { line: endLine, column: endCol },
        },
    };
}

describe("applyFixes — 单行修复", () => {
    it("应替换单行中的指定范围", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const foo = 'bar';\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        const issue = makeIssue(file, 1, 7, 1, 10, "baz");
        const result = engine.applyFixes([issue]);

        expect(result.fixedCount).toBe(1);
        expect(result.filesModified).toContain(file);
        expect(readFileSync(file, "utf-8")).toBe("const baz = 'bar';\n");
    });

    it("应支持列号 1-based", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "abc", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        // 替换第1行第1列到第2列（即 'a'）
        const issue = makeIssue(file, 1, 1, 1, 2, "X");
        const result = engine.applyFixes([issue]);

        expect(result.fixedCount).toBe(1);
        expect(readFileSync(file, "utf-8")).toBe("Xbc");
    });

    it("应处理空替换（删除）", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const x = 1;\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        // 删除 'x'（第7列到第8列，1-based，不含第8列）
        const issue = makeIssue(file, 1, 7, 1, 8, "");
        const result = engine.applyFixes([issue]);

        expect(result.fixedCount).toBe(1);
        expect(readFileSync(file, "utf-8")).toBe("const  = 1;\n");
    });
});

describe("applyFixes — 多行修复", () => {
    it("应替换跨多行的范围", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const a = 1;\nconst b = 2;\nconst c = 3;\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        // 替换第1行第1列到第2行第12列（即 "const a = 1;\nconst b = 2;")
        const issue = makeIssue(file, 1, 1, 2, 13, "const x = 0;");
        const result = engine.applyFixes([issue]);

        expect(result.fixedCount).toBe(1);
        expect(readFileSync(file, "utf-8")).toBe("const x = 0;\nconst c = 3;\n");
    });

    it("多行替换应保留前后内容", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "before\ntarget1\ntarget2\nafter\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        const issue = makeIssue(file, 2, 1, 3, 8, "replaced");
        const result = engine.applyFixes([issue]);

        expect(result.fixedCount).toBe(1);
        expect(readFileSync(file, "utf-8")).toBe("before\nreplaced\nafter\n");
    });

    it("替换为多行文本时应正确插入", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "line1\nOLD\nline3\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        const issue = makeIssue(file, 2, 1, 2, 4, "newA\nnewB");
        const result = engine.applyFixes([issue]);

        expect(result.fixedCount).toBe(1);
        expect(readFileSync(file, "utf-8")).toBe("line1\nnewA\nnewB\nline3\n");
    });
});

describe("applyFixes — 多修复排序", () => {
    it("应按行号倒序应用多个修复", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const a = 1;\nconst b = 2;\nconst c = 3;\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        const issues = [
            makeIssue(file, 1, 7, 1, 8, "x", "fix-a"),
            makeIssue(file, 3, 7, 3, 8, "z", "fix-c"),
            makeIssue(file, 2, 7, 2, 8, "y", "fix-b"),
        ];
        const result = engine.applyFixes(issues);

        expect(result.fixedCount).toBe(3);
        expect(readFileSync(file, "utf-8")).toBe("const x = 1;\nconst y = 2;\nconst z = 3;\n");
    });

    it("同行修复应按列号倒序", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const abc = 1;\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        const issues = [
            makeIssue(file, 1, 7, 1, 8, "X", "fix-1"), // 'a' -> 'X'
            makeIssue(file, 1, 9, 1, 10, "Y", "fix-2"), // 'c' -> 'Y'
            makeIssue(file, 1, 8, 1, 9, "Z", "fix-3"),  // 'b' -> 'Z'
        ];
        const result = engine.applyFixes(issues);

        expect(result.fixedCount).toBe(3);
        expect(readFileSync(file, "utf-8")).toBe("const XZY = 1;\n");
    });
});

describe("applyFixes — dry-run 模式", () => {
    it("dry-run 不应修改文件", () => {
        const file = join(tempDir, "a.js");
        const original = "const foo = 'bar';\n";
        writeFileSync(file, original, "utf-8");

        const engine = createEngine({ projectDir: tempDir, dryRun: true });
        const issue = makeIssue(file, 1, 7, 1, 10, "baz");
        const result = engine.applyFixes([issue]);

        expect(readFileSync(file, "utf-8")).toBe(original);
        expect(result.filesModified).toContain(file);
        expect(result.fixedCount).toBe(1);
        expect(result.previews).toBeDefined();
        expect(result.previews!.length).toBe(1);
        expect(result.previews![0].file).toBe(file);
        expect(result.previews![0].ruleId).toBe("test-fix");
    });

    it("dry-run 应生成 diff 预览", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const foo = 'bar';\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir, dryRun: true });
        const issue = makeIssue(file, 1, 7, 1, 10, "baz");
        const result = engine.applyFixes([issue]);

        expect(result.previews).toBeDefined();
        expect(result.previews![0].diff).toContain("foo");
        expect(result.previews![0].diff).toContain("baz");
    });
});

describe("applyFixes — 多字节字符", () => {
    it("应正确处理中文字符的单行替换", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const 消息 = '你好';\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        // 替换 "消息" 为 "通知"
        // "const " = 6 字节，然后 "消息" 从第7列开始
        // "const 消息" — 'c'=1, 'o'=2, 'n'=3, 's'=4, 't'=5, ' '=6, '消'=7, '息'=8
        const issue = makeIssue(file, 1, 7, 1, 9, "通知");
        const result = engine.applyFixes([issue]);

        expect(result.fixedCount).toBe(1);
        expect(readFileSync(file, "utf-8")).toBe("const 通知 = '你好';\n");
    });

    it("应正确处理 emoji 字符", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const emoji = '🎉';\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        // 🎉 占 2 个 UTF-16 code units，位于索引 15-16（1-based 列号 16-17）
        // 整行: c o n s t   e m o j i   =   '  🎉   '   ;
        //        1 2 3 4 5 6 7 8 9 10 11 12 13 14 15  16  17 18 19
        // 替换 🎉（第16列到第18列，不含第18列）为 ✅
        const issue = makeIssue(file, 1, 16, 1, 18, "✅");
        const result = engine.applyFixes([issue]);

        expect(result.fixedCount).toBe(1);
        expect(readFileSync(file, "utf-8")).toBe("const emoji = '✅';\n");
    });

    it("应正确处理包含中文的多行替换", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "// 中文注释\nconst x = 1;\n// 结束\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        // 第1行 "// 中文注释" 长度 7（不含换行），第2行 "const x = 1;" 长度 12（不含换行）
        // 替换第1行第1列到第2行第13列（即整段 "// 中文注释\nconst x = 1;"）
        const issue = makeIssue(file, 1, 1, 2, 13, "// 新注释\nconst y = 2;");
        const result = engine.applyFixes([issue]);

        expect(result.fixedCount).toBe(1);
        expect(readFileSync(file, "utf-8")).toBe("// 新注释\nconst y = 2;\n// 结束\n");
    });
});

describe("applyFixes — 边界与错误处理", () => {
    it("无 fix 的 issue 应被跳过", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const x = 1;\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        const issue: Issue = {
            ruleId: "no-fix",
            title: "No fix",
            description: "No fix available",
            severity: "warning",
            file,
            line: 1,
            column: 1,
        };
        const result = engine.applyFixes([issue]);

        expect(result.fixedCount).toBe(0);
        expect(result.filesModified).toHaveLength(0);
    });

    it("空 issues 数组应返回零修改", () => {
        const engine = createEngine({ projectDir: tempDir });
        const result = engine.applyFixes([]);

        expect(result.fixedCount).toBe(0);
        expect(result.filesModified).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
    });

    it("越界行号应返回原文件（不崩溃）", () => {
        const file = join(tempDir, "a.js");
        writeFileSync(file, "const x = 1;\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        const issue = makeIssue(file, 99, 1, 99, 2, "y");
        const result = engine.applyFixes([issue]);

        // 源码中：越界时 applySingleFix 返回 source 不变，因此 filesModified 为空
        expect(result.fixedCount).toBe(0);
        expect(result.filesModified).toHaveLength(0);
    });

    it("不存在的文件应记录错误", () => {
        const engine = createEngine({ projectDir: tempDir });
        const file = join(tempDir, "non-existent.js");
        const issue = makeIssue(file, 1, 1, 1, 2, "x");
        const result = engine.applyFixes([issue]);

        expect(result.fixedCount).toBe(0);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("non-existent.js");
    });

    it("多个文件应分别修复", () => {
        const fileA = join(tempDir, "a.js");
        const fileB = join(tempDir, "b.js");
        writeFileSync(fileA, "const a = 1;\n", "utf-8");
        writeFileSync(fileB, "const b = 2;\n", "utf-8");

        const engine = createEngine({ projectDir: tempDir });
        const issues = [
            makeIssue(fileA, 1, 7, 1, 8, "x"),
            makeIssue(fileB, 1, 7, 1, 8, "y"),
        ];
        const result = engine.applyFixes(issues);

        expect(result.fixedCount).toBe(2);
        expect(result.filesModified).toHaveLength(2);
        expect(readFileSync(fileA, "utf-8")).toBe("const x = 1;\n");
        expect(readFileSync(fileB, "utf-8")).toBe("const y = 2;\n");
    });
});
