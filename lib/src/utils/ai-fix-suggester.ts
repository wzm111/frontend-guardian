/**
 * AI Fix Suggester — LLM 驱动的 Issue 修复建议
 *
 * v3.0.0 功能：
 * 1. 为无自动修复的 Issue 生成 AI 修复建议
 * 2. 为低置信度修复提供替代方案
 * 3. 支持 OpenAI / Claude API
 * 4. 建议缓存避免重复调用
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import type { Issue, Fix, FixConfidence } from "@/types.js";

/** AI 提供商 */
export type AIProvider = "openai" | "claude" | "auto";

/** AI 修复建议结果 */
export interface AIFixSuggestion {
    /** 原始 Issue */
    issue: Issue;
    /** AI 生成的修复 */
    fix: Fix;
    /** AI 修复的置信度 */
    confidence: FixConfidence;
    /** AI 对修复的解释 */
    explanation?: string;
    /** 使用的模型 */
    model?: string;
}

/** AI 配置 */
export interface AIConfig {
    /** 提供商 */
    provider: AIProvider;
    /** API Key */
    apiKey: string;
    /** 模型名称 */
    model: string;
    /** API 基础 URL（可选，用于自定义端点） */
    baseUrl?: string;
    /** 最大 token 数 */
    maxTokens?: number;
    /** 温度 */
    temperature?: number;
    /** 是否启用缓存 */
    cacheEnabled?: boolean;
    /** 缓存目录 */
    cacheDir?: string;
}

/** 从环境变量检测 AI 配置 */
export function detectAIConfig(): AIConfig | null {
    const provider = (process.env.FG_AI_PROVIDER as AIProvider) || "auto";
    const apiKey = process.env.FG_AI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || "";

    if (!apiKey) {
        return null;
    }

    // 自动推断提供商
    let detectedProvider = provider;
    if (provider === "auto") {
        if (process.env.ANTHROPIC_API_KEY) {
            detectedProvider = "claude";
        } else if (process.env.OPENAI_API_KEY || process.env.FG_AI_API_KEY) {
            detectedProvider = "openai";
        }
    }

    // 默认模型
    const defaultModel = detectedProvider === "claude"
        ? "claude-3-5-sonnet-20241022"
        : "gpt-4o-mini";

    return {
        provider: detectedProvider,
        apiKey,
        model: process.env.FG_AI_MODEL || defaultModel,
        baseUrl: process.env.FG_AI_BASE_URL,
        maxTokens: parseInt(process.env.FG_AI_MAX_TOKENS || "2048", 10),
        temperature: parseFloat(process.env.FG_AI_TEMPERATURE || "0.2"),
        cacheEnabled: process.env.FG_AI_CACHE !== "false",
        cacheDir: process.env.FG_AI_CACHE_DIR,
    };
}

/**
 * AI 修复建议器
 */
export class AIFixSuggester {
    private config: AIConfig;
    private cacheDir?: string;

    constructor(config: AIConfig) {
        this.config = config;
        if (config.cacheEnabled !== false) {
            this.cacheDir = config.cacheDir || join(process.cwd(), ".frontend-guardian", "ai-cache");
        }
    }

    /**
     * 为单个 Issue 生成 AI 修复建议
     */
    async suggestFix(issue: Issue, projectDir: string): Promise<AIFixSuggestion | null> {
        const cacheKey = this.getCacheKey(issue);

        // 尝试从缓存读取
        if (this.cacheDir) {
            const cached = this.readCache(cacheKey);
            if (cached) {
                return { ...cached, issue };
            }
        }

        // 读取源代码
        const source = this.readSource(issue.file, projectDir, issue.line);
        if (!source) {
            return null;
        }

        // 构建 prompt
        const prompt = this.buildPrompt(issue, source);

        try {
            const response = await this.callLLM(prompt);
            const suggestion = this.parseResponse(response, issue);

            if (suggestion && this.cacheDir) {
                this.writeCache(cacheKey, suggestion);
            }

            return suggestion;
        } catch (err) {
            // 静默失败，返回 null
            return null;
        }
    }

    /**
     * 批量生成 AI 修复建议
     */
    async suggestFixes(issues: Issue[], projectDir: string): Promise<AIFixSuggestion[]> {
        const results: AIFixSuggestion[] = [];

        for (const issue of issues) {
            const suggestion = await this.suggestFix(issue, projectDir);
            if (suggestion) {
                results.push(suggestion);
            }
        }

        return results;
    }

    /** 构建给 LLM 的 prompt */
    private buildPrompt(issue: Issue, source: string): string {
        return `You are an expert frontend code reviewer. Given the following code issue, provide a precise fix.

Issue Details:
- Rule: ${issue.ruleId}
- Title: ${issue.title}
- Description: ${issue.description}
- File: ${issue.file}
- Line: ${issue.line}, Column: ${issue.column}
- Severity: ${issue.severity}

Source Code (around the issue):
\`\`\`
${source}
\`\`\`

Please provide:
1. The fixed code snippet (only the corrected version, no explanations)
2. A brief explanation of the fix
3. Your confidence in this fix: high / medium / low

Format your response as:
FIX:
<corrected code snippet>

EXPLANATION:
<brief explanation>

CONFIDENCE:
<high|medium|low>`;
    }

    /** 调用 LLM API */
    private async callLLM(prompt: string): Promise<string> {
        if (this.config.provider === "claude") {
            return this.callClaude(prompt);
        }
        return this.callOpenAI(prompt);
    }

    /** 调用 Claude API */
    private async callClaude(prompt: string): Promise<string> {
        const url = this.config.baseUrl || "https://api.anthropic.com/v1/messages";
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this.config.apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: this.config.model,
                max_tokens: this.config.maxTokens || 2048,
                temperature: this.config.temperature || 0.2,
                messages: [{ role: "user", content: prompt }],
            }),
        });

        if (!response.ok) {
            throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { content: Array<{ type: string; text: string }> };
        return data.content[0]?.text || "";
    }

    /** 调用 OpenAI API */
    private async callOpenAI(prompt: string): Promise<string> {
        const url = this.config.baseUrl || "https://api.openai.com/v1/chat/completions";
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
                model: this.config.model,
                max_tokens: this.config.maxTokens || 2048,
                temperature: this.config.temperature || 0.2,
                messages: [{ role: "user", content: prompt }],
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { choices: Array<{ message: { content: string } }> };
        return data.choices[0]?.message?.content || "";
    }

    /** 解析 LLM 响应 */
    private parseResponse(response: string, issue: Issue): AIFixSuggestion | null {
        const fixMatch = response.match(/FIX:\s*\n?([\s\S]*?)(?=\n?EXPLANATION:|\n?CONFIDENCE:|$)/);
        const explanationMatch = response.match(/EXPLANATION:\s*\n?([\s\S]*?)(?=\n?CONFIDENCE:|$)/);
        const confidenceMatch = response.match(/CONFIDENCE:\s*(high|medium|low)/i);

        if (!fixMatch) {
            return null;
        }

        const fixedCode = fixMatch[1].trim();
        const explanation = explanationMatch ? explanationMatch[1].trim() : undefined;
        const confidenceStr = confidenceMatch ? confidenceMatch[1].toLowerCase() : "medium";
        const confidence: FixConfidence = ["high", "medium", "low"].includes(confidenceStr) ? confidenceStr as FixConfidence : "medium";

        // 构建 Fix 对象
        // 简单实现：替换整行代码
        const fix: Fix = {
            text: fixedCode,
            start: { line: issue.line, column: issue.column },
            end: { line: issue.endLine || issue.line, column: issue.endColumn || issue.column + 1 },
            confidence,
            description: explanation,
        };

        return {
            issue,
            fix,
            confidence,
            explanation,
            model: this.config.model,
        };
    }

    /** 读取源代码文件 */
    private readSource(filePath: string, projectDir: string, issueLine: number): string | null {
        const fullPath = resolve(projectDir, filePath);
        if (!existsSync(fullPath)) {
            return null;
        }
        try {
            const content = readFileSync(fullPath, "utf-8");
            const lines = content.split("\n");

            // 提取 issue 周围的代码（前后 5 行）
            const startLine = Math.max(0, issueLine - 6);
            const endLine = Math.min(lines.length, issueLine + 5);
            const contextLines = lines.slice(startLine, endLine);

            // 添加行号
            return contextLines.map((line, idx) => `${startLine + idx + 1}: ${line}`).join("\n");
        } catch {
            return null;
        }
    }

    /** 生成缓存 key */
    private getCacheKey(issue: Issue): string {
        const hash = createHash("sha256")
            .update(`${issue.file}|${issue.ruleId}|${issue.line}|${issue.column}|${issue.title}`)
            .digest("hex")
            .slice(0, 16);
        return hash;
    }

    /** 读取缓存 */
    private readCache(key: string): AIFixSuggestion | null {
        if (!this.cacheDir) return null;
        try {
            const cachePath = join(this.cacheDir, `${key}.json`);
            if (!existsSync(cachePath)) return null;
            const raw = readFileSync(cachePath, "utf-8");
            return JSON.parse(raw) as AIFixSuggestion;
        } catch {
            return null;
        }
    }

    /** 写入缓存 */
    private writeCache(key: string, suggestion: AIFixSuggestion): void {
        if (!this.cacheDir) return;
        try {
            if (!existsSync(this.cacheDir)) {
                mkdirSync(this.cacheDir, { recursive: true });
            }
            const cachePath = join(this.cacheDir, `${key}.json`);
            writeFileSync(cachePath, JSON.stringify(suggestion, null, 2), "utf-8");
        } catch {
            // 忽略缓存写入失败
        }
    }
}

/**
 * 为 Issue 列表生成 AI 修复建议的便捷函数
 */
export async function generateAIFixSuggestions(
    issues: Issue[],
    projectDir: string,
    config?: Partial<AIConfig>
): Promise<AIFixSuggestion[]> {
    const detected = detectAIConfig();
    if (!detected) {
        return [];
    }

    const mergedConfig: AIConfig = {
        ...detected,
        ...config,
    };

    const suggester = new AIFixSuggester(mergedConfig);
    return suggester.suggestFixes(issues, projectDir);
}
