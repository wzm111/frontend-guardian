/**
 * v3.13.0: MCP 上下文感知扫描/修复测试
 */

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleToolCall } from "../src/mcp/tools.js";
import { cleanupTempProject, createTempProject, writeBasePackageJson, writeProjectFile } from "./helpers.js";

describe("MCP context-aware scan/fix", () => {
    let projectDir: string;

    beforeEach(() => {
        projectDir = createTempProject();
    });

    afterEach(() => {
        cleanupTempProject(projectDir);
    });

    it("scan 带 context.file 只返回该文件的 issue", async () => {
        writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });
        writeProjectFile(projectDir, "src/App.tsx", `export default function App() {\n  return <div>你好</div>;\n}\n`);
        writeProjectFile(
            projectDir,
            "src/Button.tsx",
            `export default function Button() {\n  return <button>点击</button>;\n}\n`
        );

        const result = await handleToolCall(
            "scan",
            {
                module: "i18n",
                context: { file: "src/App.tsx" },
                json: true,
            },
            { projectDir }
        );

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text);
        expect(data.total).toBeGreaterThanOrEqual(1);
        for (const sev of ["critical", "warning", "suggestion"] as const) {
            for (const issue of data.issues[sev]) {
                expect(issue.file).toBe(`${projectDir}/src/App.tsx`);
            }
        }
    });

    it("scan 带 context.range 只返回范围内的 issue", async () => {
        writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });
        writeProjectFile(
            projectDir,
            "src/App.tsx",
            `export default function App() {\n  return <div>你好</div>;\n}\nfunction Other() {\n  return <div>世界</div>;\n}\n`
        );

        const result = await handleToolCall(
            "scan",
            {
                module: "i18n",
                context: { file: "src/App.tsx", range: { startLine: 1, endLine: 3 } },
                json: true,
            },
            { projectDir }
        );

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text);
        expect(data.total).toBe(1);
        expect(data.issues.warning[0]?.line ?? data.issues.critical[0]?.line).toBe(2);
    });

    it("scan 带 context.content 使用内存内容而不是磁盘", async () => {
        writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });
        writeProjectFile(projectDir, "src/App.tsx", `export default function App() {\n  return <div>Hello</div>;\n}\n`);

        const result = await handleToolCall(
            "scan",
            {
                module: "i18n",
                context: {
                    file: "src/App.tsx",
                    content: `export default function App() {\n  return <div>你好</div>;\n}\n`,
                },
                json: true,
            },
            { projectDir }
        );

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text);
        expect(data.total).toBeGreaterThanOrEqual(1);
        // 磁盘文件未被修改
        expect(readFileSync(`${projectDir}/src/App.tsx`, "utf-8")).toContain("Hello");
    });

    it("scan 带 context.expand 包含 import 上游文件", async () => {
        writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });
        writeProjectFile(
            projectDir,
            "src/utils.ts",
            `export function greet(name: string) {\n  return \`Hello, \${name}\`;\n}\n`
        );
        writeProjectFile(
            projectDir,
            "src/App.tsx",
            `import { greet } from "./utils";\nexport default function App() {\n  return <div>{greet("世界")} 你好</div>;\n}\n`
        );

        const result = await handleToolCall(
            "scan",
            {
                module: "i18n",
                context: { file: "src/utils.ts", expand: true },
                json: true,
            },
            { projectDir }
        );

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text);
        expect(data.total).toBeGreaterThanOrEqual(1);
        const allIssues = [...data.issues.critical, ...data.issues.warning, ...data.issues.suggestion];
        expect(allIssues.some((i: { file: string }) => i.file === `${projectDir}/src/App.tsx`)).toBe(true);
    });

    it("fix dryRun 返回 diffs 且不修改文件", async () => {
        writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });
        const original = `export default function App() {\n  return <div>你好</div>;\n}\n`;
        writeProjectFile(projectDir, "src/App.tsx", original);

        const result = await handleToolCall(
            "fix",
            {
                module: "i18n",
                context: { file: "src/App.tsx" },
                dryRun: true,
                json: true,
            },
            { projectDir }
        );

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text);
        expect(data.fix.fixedCount).toBeGreaterThanOrEqual(1);
        expect(data.diffs[`${projectDir}/src/App.tsx`]).toContain("--- a/");
        expect(readFileSync(`${projectDir}/src/App.tsx`, "utf-8")).toBe(original);
    });

    it("fix 无 context.content 时写盘并返回 diffs", async () => {
        writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });
        const original = `export default function App() {\n  return <div>你好</div>;\n}\n`;
        writeProjectFile(projectDir, "src/App.tsx", original);

        const result = await handleToolCall(
            "fix",
            {
                module: "i18n",
                context: { file: "src/App.tsx" },
                json: true,
            },
            { projectDir }
        );

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text);
        expect(data.fix.fixedCount).toBeGreaterThanOrEqual(1);
        expect(data.diffs[`${projectDir}/src/App.tsx`]).toContain("--- a/");
        const modified = readFileSync(`${projectDir}/src/App.tsx`, "utf-8");
        expect(modified).not.toBe(original);
    });
});
