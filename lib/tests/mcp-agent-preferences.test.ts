/**
 * v3.14.1: Agent 记忆持久化测试
 */

import { afterEach, describe, expect, it } from "vitest";
import { AgentPreferencesStore, resolveJsonOutput, resolveModule } from "../src/mcp/agent-preferences.js";
import { handleToolCall } from "../src/mcp/tools.js";
import { cleanupTempProject, createTempProject, writeBasePackageJson, writeProjectFile } from "./helpers.js";

describe("Agent preferences", () => {
    it("resolveJsonOutput 按偏好解析默认值", () => {
        expect(resolveJsonOutput(undefined, { updatedAt: 0 })).toBeUndefined();
        expect(resolveJsonOutput(undefined, { defaultOutput: "json", updatedAt: 0 })).toBe(true);
        expect(resolveJsonOutput(undefined, { defaultOutput: "markdown", updatedAt: 0 })).toBe(false);
        expect(resolveJsonOutput(false, { defaultOutput: "json", updatedAt: 0 })).toBe(false);
    });

    it("resolveModule 按偏好解析默认值", () => {
        expect(resolveModule(undefined, { updatedAt: 0 })).toBeUndefined();
        expect(resolveModule(undefined, { defaultModules: ["i18n"], updatedAt: 0 })).toBe("i18n");
        expect(resolveModule("security", { defaultModules: ["i18n"], updatedAt: 0 })).toBe("security");
    });

    it("AgentPreferencesStore 读写偏好", async () => {
        const projectDir = createTempProject();
        try {
            const store = new AgentPreferencesStore({ projectDir });
            await store.set("agent-1", { defaultOutput: "json", defaultModules: ["i18n", "a11y"] });
            const prefs = store.get("agent-1");
            expect(prefs.defaultOutput).toBe("json");
            expect(prefs.defaultModules).toEqual(["i18n", "a11y"]);
        } finally {
            cleanupTempProject(projectDir);
        }
    });

    it("set-agent-preferences / get-agent-preferences 工具工作", async () => {
        const projectDir = createTempProject();
        try {
            const setResult = await handleToolCall(
                "set-agent-preferences",
                { agent: "claude", id: "claude-prefs", defaultOutput: "json", defaultModules: ["i18n"], json: true },
                { projectDir }
            );
            expect(setResult.isError).toBeFalsy();
            const setData = JSON.parse(setResult.content[0].text);
            expect(setData.updated).toBe(true);
            expect(setData.preferences.defaultOutput).toBe("json");

            const getResult = await handleToolCall(
                "get-agent-preferences",
                { agent: "claude", id: "claude-prefs", json: true },
                { projectDir }
            );
            const getData = JSON.parse(getResult.content[0].text);
            expect(getData.preferences.defaultOutput).toBe("json");
            expect(getData.preferences.defaultModules).toEqual(["i18n"]);
        } finally {
            cleanupTempProject(projectDir);
        }
    });

    it("scan 未传 json 时按偏好默认输出 JSON", async () => {
        const projectDir = createTempProject();
        try {
            writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });
            writeProjectFile(projectDir, "src/App.tsx", `export default function App() {\n  return <div>hello</div>;\n}\n`);

            await handleToolCall(
                "set-agent-preferences",
                { agent: "cursor", defaultOutput: "json", json: true },
                { projectDir }
            );

            const scanResult = await handleToolCall(
                "scan",
                { module: "i18n", agent: "cursor" },
                { projectDir }
            );
            // 偏好默认 json，因此输出应是 JSON
            expect(() => JSON.parse(scanResult.content[0].text)).not.toThrow();
        } finally {
            cleanupTempProject(projectDir);
        }
    });
});
