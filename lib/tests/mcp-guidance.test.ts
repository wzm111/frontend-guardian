/**
 * v3.14.1: MCP 自动注入使用指引测试
 */

import { describe, expect, it } from "vitest";
import { getUsageGuidance, shouldSendGuidance, USAGE_GUIDANCE_VERSION } from "../src/mcp/guidance.js";
import { handleToolCall } from "../src/mcp/tools.js";
import { cleanupTempProject, createTempProject } from "./helpers.js";

describe("MCP usage guidance", () => {
    it("getUsageGuidance 返回 Markdown 使用指引", () => {
        const text = getUsageGuidance("claude");
        expect(text).toContain("frontend-guardian MCP 使用指引");
        expect(text).toContain("register-agent");
        expect(text).toContain("scan");
        expect(text).toContain("index-project");
        expect(text).toContain("claude");
    });

    it("shouldSendGuidance 在未记录时返回 true", () => {
        expect(shouldSendGuidance(undefined)).toBe(true);
        expect(shouldSendGuidance({})).toBe(true);
    });

    it("shouldSendGuidance 在版本旧于当前时返回 true", () => {
        expect(shouldSendGuidance({ guidanceVersion: "3.14.0", lastGuidanceAt: Date.now() })).toBe(true);
    });

    it("shouldSendGuidance 在同版本时返回 false", () => {
        expect(shouldSendGuidance({ guidanceVersion: USAGE_GUIDANCE_VERSION, lastGuidanceAt: Date.now() })).toBe(false);
    });

    it("get-usage-guidance 工具返回指引并标记已发送", async () => {
        const projectDir = createTempProject();
        try {
            const first = await handleToolCall(
                "get-usage-guidance",
                { agent: "cursor", id: "cursor-1", json: true },
                { projectDir }
            );
            expect(first.isError).toBeFalsy();
            const firstData = JSON.parse(first.content[0].text);
            expect(firstData.version).toBe(USAGE_GUIDANCE_VERSION);
            expect(firstData.alreadyGuided).toBe(false);
            expect(firstData.guidance).toContain("scan");

            const second = await handleToolCall(
                "get-usage-guidance",
                { agent: "cursor", id: "cursor-1", json: true },
                { projectDir }
            );
            const secondData = JSON.parse(second.content[0].text);
            expect(secondData.alreadyGuided).toBe(true);
        } finally {
            cleanupTempProject(projectDir);
        }
    });

    it("register-agent 首次注册后会标记 guidance", async () => {
        const projectDir = createTempProject();
        try {
            const reg = await handleToolCall(
                "register-agent",
                { agent: "kimi", id: "kimi-1", json: true },
                { projectDir }
            );
            const regData = JSON.parse(reg.content[0].text);
            expect(regData.registered).toBe(true);
            expect(regData.agent.guidanceVersion).toBe(USAGE_GUIDANCE_VERSION);

            const guidance = await handleToolCall(
                "get-usage-guidance",
                { agent: "kimi", id: "kimi-1", json: true },
                { projectDir }
            );
            const data = JSON.parse(guidance.content[0].text);
            expect(data.alreadyGuided).toBe(true);
        } finally {
            cleanupTempProject(projectDir);
        }
    });
});
