/**
 * v3.14.1: AI 视觉异常检测测试
 */

import { describe, expect, it, vi } from "vitest";
import { analyzeVisualRegression } from "../src/utils/ai-vision.js";

const mockPngBuffer = Buffer.from("fake-png");

vi.mock("node:fs", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    return {
        ...actual,
        readFileSync: () => mockPngBuffer,
    };
});

describe("AI vision anomaly detection", () => {
    it("未配置 API key 时返回 null", async () => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.FG_AI_API_KEY;
        const result = await analyzeVisualRegression({ currentPath: "a.png", baselinePath: "b.png" });
        expect(result).toBeNull();
    });

    it("OpenAI: 噪声返回 isAnomaly=false", async () => {
        process.env.FG_AI_API_KEY = "test-key";
        process.env.FG_AI_PROVIDER = "openai";
        const originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [
                    {
                        message: {
                            content: '{"isAnomaly": false, "description": "仅为字体渲染差异", "confidence": 0.92}',
                        },
                    },
                ],
            }),
        } as unknown as typeof fetch);

        const result = await analyzeVisualRegression({ currentPath: "a.png", baselinePath: "b.png" });
        expect(result).not.toBeNull();
        expect(result?.isAnomaly).toBe(false);
        expect(result?.description).toContain("字体渲染差异");

        globalThis.fetch = originalFetch;
        delete process.env.FG_AI_API_KEY;
        delete process.env.FG_AI_PROVIDER;
    });

    it("Claude: 有意义变更返回 isAnomaly=true", async () => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        process.env.FG_AI_PROVIDER = "claude";
        const originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                content: [{ type: "text", text: '{"isAnomaly": true, "description": "按钮颜色从蓝色变为红色", "confidence": 0.95}' }],
            }),
        } as unknown as typeof fetch);

        const result = await analyzeVisualRegression({ currentPath: "a.png", baselinePath: "b.png" });
        expect(result).not.toBeNull();
        expect(result?.isAnomaly).toBe(true);
        expect(result?.description).toContain("按钮颜色");

        globalThis.fetch = originalFetch;
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.FG_AI_PROVIDER;
    });

    it("API 异常时返回 null", async () => {
        process.env.FG_AI_API_KEY = "test-key";
        process.env.FG_AI_PROVIDER = "openai";
        const originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
        } as unknown as typeof fetch);

        const result = await analyzeVisualRegression({ currentPath: "a.png", baselinePath: "b.png" });
        expect(result).toBeNull();

        globalThis.fetch = originalFetch;
        delete process.env.FG_AI_API_KEY;
        delete process.env.FG_AI_PROVIDER;
    });
});
