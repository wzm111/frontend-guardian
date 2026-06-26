/**
 * v3.14.0: MCP 多 Agent 协作共享索引测试
 */

import { existsSync, readFileSync, rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentRegistry } from "../src/mcp/agent-registry.js";
import { handleToolCall } from "../src/mcp/tools.js";
import { acquireIndexLock } from "../src/utils/index-lock.js";
import { cleanupTempProject, createTempProject, writeBasePackageJson, writeProjectFile } from "./helpers.js";

describe("MCP multi-agent collaboration", () => {
    let projectDir: string;

    beforeEach(() => {
        projectDir = createTempProject();
    });

    afterEach(() => {
        // 清理可能遗留的锁文件，避免影响后续测试
        try {
            rmSync(`${projectDir}/.frontend-guardian/index.lock`, { force: true });
        } catch {
            // ignore
        }
        cleanupTempProject(projectDir);
    });

    it("register-agent 成功注册 Agent", async () => {
        const result = await handleToolCall(
            "register-agent",
            { agent: "claude", id: "claude-session-1", json: true },
            { projectDir }
        );

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text);
        expect(data.registered).toBe(true);
        expect(data.agent.kind).toBe("claude");
        expect(data.agent.id).toBe("claude-session-1");
        expect(data.agent.pid).toBe(process.pid);
    });

    it("list-agents 返回活跃的 Agent", async () => {
        await handleToolCall("register-agent", { agent: "cursor", json: true }, { projectDir });
        await handleToolCall("register-agent", { agent: "copilot", json: true }, { projectDir });

        const result = await handleToolCall("list-agents", { json: true }, { projectDir });
        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text);
        expect(data.agents.length).toBeGreaterThanOrEqual(2);
        const kinds = data.agents.map((a: { kind: string }) => a.kind);
        expect(kinds).toContain("cursor");
        expect(kinds).toContain("copilot");
    });

    it("AgentRegistry 自动清理过期心跳", async () => {
        const registry = new AgentRegistry({ projectDir, ttlMs: 50 });
        registry.heartbeat({ kind: "kimi", id: "old" });

        // 未过期时应存在
        expect(registry.list().some((a) => a.id === "old")).toBe(true);

        // 等待过期
        await new Promise((r) => setTimeout(r, 100));
        expect(registry.list().some((a) => a.id === "old")).toBe(false);
    });

    it("scan 带 agent 参数会刷新 Agent 心跳", async () => {
        writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });
        writeProjectFile(projectDir, "src/App.tsx", `export default function App() {\n  return <div>你好</div>;\n}\n`);

        await handleToolCall("scan", { module: "i18n", agent: "kimi", json: true }, { projectDir });

        const agentsResult = await handleToolCall("list-agents", { json: true }, { projectDir });
        const data = JSON.parse(agentsResult.content[0].text);
        expect(data.agents.some((a: { kind: string }) => a.kind === "kimi")).toBe(true);
    });

    it("index-project build 使用文件锁且不会重复重建", async () => {
        writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });
        writeProjectFile(projectDir, "src/App.tsx", `export default function App() {\n  return <div>hello</div>;\n}\n`);

        const first = await handleToolCall("index-project", { action: "build", json: true }, { projectDir });
        const firstData = JSON.parse(first.content[0].text);
        expect(firstData.valid).toBe(true);
        expect(firstData.builtByThisCall).toBe(true);
        expect(firstData.stats.files).toBeGreaterThanOrEqual(1);

        // 锁文件应已被释放
        expect(existsSync(`${projectDir}/.frontend-guardian/index.lock`)).toBe(false);

        const second = await handleToolCall("index-project", { action: "build", json: true }, { projectDir });
        const secondData = JSON.parse(second.content[0].text);
        expect(secondData.valid).toBe(true);
        expect(secondData.builtByThisCall).toBe(false);
    });

    it("index-project status 返回活跃 Agent 数量", async () => {
        writeBasePackageJson(projectDir, { dependencies: { react: "^18.0.0" } });
        writeProjectFile(projectDir, "src/App.tsx", `export default function App() {\n  return <div>hello</div>;\n}\n`);

        await handleToolCall("register-agent", { agent: "claude", json: true }, { projectDir });
        await handleToolCall("index-project", { action: "build", json: true }, { projectDir });

        const status = await handleToolCall("index-project", { action: "status", json: true }, { projectDir });
        const data = JSON.parse(status.content[0].text);
        expect(data.valid).toBe(true);
        expect(data.agents).toBeGreaterThanOrEqual(1);
    });

    it("acquireIndexLock 会等待已有锁并在释放后获取", async () => {
        const lock = await acquireIndexLock({ projectDir });
        let acquired = false;

        const pending = acquireIndexLock({ projectDir, timeoutMs: 5000 }).then((l) => {
            acquired = true;
            l.release();
        });

        // 锁未释放前不应获取到
        await new Promise((r) => setTimeout(r, 50));
        expect(acquired).toBe(false);

        lock.release();
        await pending;
        expect(acquired).toBe(true);
    }, 10_000);

    it("acquireIndexLock 可以抢占过期锁", async () => {
        // 写入一个指向不存在进程的过期锁
        const lockPath = `${projectDir}/.frontend-guardian/index.lock`;
        writeProjectFile(projectDir, ".frontend-guardian/index.lock", JSON.stringify({ pid: 99999999, startedAt: 1 }));

        const lock = await acquireIndexLock({ projectDir, staleLockMs: 100 });
        expect(existsSync(lockPath)).toBe(true);
        expect(readFileSync(lockPath, "utf-8")).toContain(`"pid": ${process.pid}`);
        lock.release();
    });
});
