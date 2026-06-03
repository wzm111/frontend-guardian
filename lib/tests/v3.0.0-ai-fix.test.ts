/**
 * v3.0.0 测试 — AI 修复建议
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectAIConfig, AIFixSuggester, generateAIFixSuggestions } from "@/utils/ai-fix-suggester.js";
import type { Issue } from "@/types.js";

describe("v3.0.0 — AI 配置检测", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        // 清除环境变量
        delete process.env.FG_AI_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.FG_AI_PROVIDER;
        delete process.env.FG_AI_MODEL;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("未配置 API Key 时应返回 null", () => {
        const config = detectAIConfig();
        expect(config).toBeNull();
    });

    it("FG_AI_API_KEY 时应返回配置", () => {
        process.env.FG_AI_API_KEY = "test-key";
        const config = detectAIConfig();
        expect(config).not.toBeNull();
        expect(config!.apiKey).toBe("test-key");
        expect(config!.provider).toBe("openai");
    });

    it("ANTHROPIC_API_KEY 时应检测到 Claude", () => {
        process.env.ANTHROPIC_API_KEY = "claude-key";
        const config = detectAIConfig();
        expect(config).not.toBeNull();
        expect(config!.provider).toBe("claude");
        expect(config!.model).toContain("claude");
    });

    it("FG_AI_MODEL 应覆盖默认模型", () => {
        process.env.FG_AI_API_KEY = "test-key";
        process.env.FG_AI_MODEL = "gpt-4o";
        const config = detectAIConfig();
        expect(config!.model).toBe("gpt-4o");
    });
});

describe("v3.0.0 — AI Fix Suggester", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "fg-v30-ai-"));
        writeFileSync(
            join(tmpDir, "test.js"),
            `const x = 1;\nconst unused = "hello";\nconsole.log(x);\n`,
            "utf-8"
        );
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it("应构建正确的 prompt", () => {
        const config = {
            provider: "openai" as const,
            apiKey: "test",
            model: "gpt-4o-mini",
            cacheEnabled: false,
        };
        const suggester = new AIFixSuggester(config);

        const issue: Issue = {
            ruleId: "unused-variable",
            title: "未使用的变量",
            description: "变量声明后未被使用",
            severity: "warning",
            file: "test.js",
            line: 2,
            column: 7,
        };

        // 直接测试 readSource 方法
        const source = (suggester as any).readSource("test.js", tmpDir, 2);
        expect(source).toContain("2:");
        expect(source).toContain("unused");
    });

    it("parseResponse 应正确解析 LLM 输出", () => {
        const config = {
            provider: "openai" as const,
            apiKey: "test",
            model: "gpt-4o-mini",
            cacheEnabled: false,
        };
        const suggester = new AIFixSuggester(config);

        const issue: Issue = {
            ruleId: "unused-variable",
            title: "未使用的变量",
            description: "变量声明后未被使用",
            severity: "warning",
            file: "test.js",
            line: 2,
            column: 7,
        };

        const response = `FIX:
const x = 1;
console.log(x);

EXPLANATION:
移除了未使用的变量声明

CONFIDENCE:
high`;

        const result = (suggester as any).parseResponse(response, issue);
        expect(result).not.toBeNull();
        expect(result!.confidence).toBe("high");
        expect(result!.explanation).toBe("移除了未使用的变量声明");
        expect(result!.fix.text).toContain("const x = 1");
    });

    it("parseResponse 对无效响应应返回 null", () => {
        const config = {
            provider: "openai" as const,
            apiKey: "test",
            model: "gpt-4o-mini",
            cacheEnabled: false,
        };
        const suggester = new AIFixSuggester(config);

        const issue: Issue = {
            ruleId: "test",
            title: "Test",
            description: "Test issue",
            severity: "suggestion",
            file: "test.js",
            line: 1,
            column: 1,
        };

        const result = (suggester as any).parseResponse("没有 FIX 标记", issue);
        expect(result).toBeNull();
    });

    it("缓存应生效", () => {
        const cacheDir = join(tmpDir, ".ai-cache");
        const config = {
            provider: "openai" as const,
            apiKey: "test",
            model: "gpt-4o-mini",
            cacheEnabled: true,
            cacheDir,
        };
        const suggester = new AIFixSuggester(config);

        const issue: Issue = {
            ruleId: "test-rule",
            title: "Test",
            description: "Test",
            severity: "suggestion",
            file: "test.js",
            line: 1,
            column: 1,
        };

        // 预写入缓存
        const cacheKey = (suggester as any).getCacheKey(issue);
        (suggester as any).writeCache(cacheKey, {
            issue,
            fix: { text: "fixed", start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
            confidence: "high",
            model: "gpt-4o-mini",
        });

        // 读取缓存
        const cached = (suggester as any).readCache(cacheKey);
        expect(cached).not.toBeNull();
        expect(cached!.confidence).toBe("high");
    });

    it("generateAIFixSuggestions 无配置时应返回空数组", async () => {
        delete process.env.FG_AI_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;

        const issues: Issue[] = [{
            ruleId: "test",
            title: "Test",
            description: "Test",
            severity: "suggestion",
            file: "test.js",
            line: 1,
            column: 1,
        }];

        const result = await generateAIFixSuggestions(issues, tmpDir);
        expect(result).toEqual([]);
    });
});
