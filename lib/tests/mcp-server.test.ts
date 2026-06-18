/**
 * v3.8.0: MCP Server 工具单元测试
 *
 * 直接测试 tools.ts 中的工具分发器，不经过 stdio 传输层。
 */

import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getToolDefinitions, handleToolCall } from "../src/mcp/tools.js";
import { cleanupTempProject, createTempProject, writeBasePackageJson, writeProjectFile } from "./helpers.js";

describe("MCP Server tools", () => {
    let projectDir: string;

    beforeEach(() => {
        projectDir = createTempProject();
    });

    afterEach(() => {
        cleanupTempProject(projectDir);
    });

    it("getToolDefinitions 应包含 P0 工具", () => {
        const tools = getToolDefinitions();
        const names = tools.map((t) => t.name);
        expect(names).toContain("scan");
        expect(names).toContain("fix");
        expect(names).toContain("e2e-run");
        expect(names).toContain("e2e-detect-gaps");
        expect(names).toContain("list-rules");
    });

    it("scan 工具应检测出硬编码中文 JSX 文本", async () => {
        writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });
        writeProjectFile(projectDir, "src/App.tsx", `export default function App() {\n  return <div>你好</div>;\n}\n`);

        const result = await handleToolCall("scan", { module: "i18n", json: true }, { projectDir });

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text);
        expect(data.total).toBeGreaterThanOrEqual(1);
        expect(data.issues.critical.length + data.issues.warning.length).toBeGreaterThanOrEqual(1);
        const issue = data.issues.critical[0] || data.issues.warning[0];
        expect(issue.ruleId).toMatch(/i18n-hardcoded/);
    });

    it("fix 工具 dryRun 应返回预览且不修改文件", async () => {
        writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });
        const original = `export default function App() {\n  return <div>你好</div>;\n}\n`;
        writeProjectFile(projectDir, "src/App.tsx", original);

        const result = await handleToolCall("fix", { module: "i18n", dryRun: true, json: true }, { projectDir });

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text);
        expect(data.fix.previews.length).toBeGreaterThanOrEqual(1);
        expect(readFileSync(`${projectDir}/src/App.tsx`, "utf-8")).toBe(original);
    });

    it("e2e-detect-gaps 工具应发现未覆盖页面", async () => {
        writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });
        writeProjectFile(projectDir, "pages/Home.tsx", "export default () => <div>Home</div>;");

        const result = await handleToolCall("e2e-detect-gaps", { json: true }, { projectDir });

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text);
        expect(data.uncoveredPages.length).toBeGreaterThanOrEqual(1);
    });

    it("get-project-meta 工具应返回 React 框架信息", async () => {
        writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });

        const result = await handleToolCall("get-project-meta", {}, { projectDir });

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text);
        expect(data.framework).toBe("react");
    });

    it("list-rules 工具应返回 i18n-hardcoded-string 规则", async () => {
        writeBasePackageJson(projectDir, {});

        const result = await handleToolCall("list-rules", { module: "i18n" }, { projectDir });

        expect(result.isError).toBeFalsy();
        const rules = JSON.parse(result.content[0].text);
        const ids = rules.map((r: any) => r.id);
        expect(ids).toContain("i18n-hardcoded-string");
    });

    it("scan-file 工具应扫描单个文件", async () => {
        writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });
        writeProjectFile(projectDir, "src/App.tsx", `export default function App() {\n  return <div>你好</div>;\n}\n`);

        const result = await handleToolCall(
            "scan-file",
            { filePath: `${projectDir}/src/App.tsx`, module: "i18n" },
            { projectDir }
        );

        expect(result.isError).toBeFalsy();
        const issues = JSON.parse(result.content[0].text);
        expect(issues.length).toBeGreaterThanOrEqual(1);
    });

    it("recommend-tests 工具应推荐测试", async () => {
        writeBasePackageJson(projectDir, { devDependencies: { jest: "^29.0.0" } });
        writeProjectFile(projectDir, "src/calc.ts", "export function add(a: number, b: number) { return a + b; }\n");
        writeProjectFile(
            projectDir,
            "src/calc.test.ts",
            'import { add } from "./calc";\ntest("add", () => { expect(add(1, 2)).toBe(3); });\n'
        );

        const result = await handleToolCall(
            "recommend-tests",
            {
                scope: "explicit",
                changedFiles: [`${projectDir}/src/calc.ts`],
                json: true,
            },
            { projectDir }
        );

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text);
        expect(data.recommendations.length).toBe(1);
        expect(data.recommendations[0].testFile).toContain("calc.test.ts");
        expect(data.recommendations[0].priority).toBe(1);
    });

    it("未知工具应返回错误", async () => {
        const result = await handleToolCall("unknown-tool", {}, { projectDir });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Unknown tool");
    });
});
