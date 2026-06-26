/**
 * v3.14.1: AI 视觉异常检测
 *
 * 在页面健康检查截图对比阶段，调用 LLM Vision API 判断像素差异
 * 是否为有意义的 UI 变更，还是字体渲染、滚动条、anti-aliasing 等噪声。
 */

import { readFileSync } from "node:fs";
import { detectAIConfig, type AIConfig } from "./ai-fix-suggester.js";

export interface AIVisionInput {
    /** 当前截图路径 */
    currentPath: string;
    /** 基线截图路径 */
    baselinePath: string;
    /** 差异高亮图路径（可选） */
    diffPath?: string;
}

export interface AIVisionResult {
    /** 是否为有意义的 UI 变更 */
    isAnomaly: boolean;
    /** 自然语言描述 */
    description: string;
    /** 置信度 0-1（可选） */
    confidence?: number;
    /** 使用的模型 */
    model?: string;
}

interface AIVisionRawResponse {
    isAnomaly: boolean;
    description: string;
    confidence?: number;
}

const VISION_PROMPT = `You are a UI regression reviewer. Compare the provided screenshot(s) and determine whether the visual difference between the current screenshot and the baseline screenshot is a meaningful UI change or just noise.

Examples of noise:
- font rendering / anti-aliasing differences
- scrollbar appearance or size
- subtle pixel-level color variations
- dynamic timestamps or counters

Examples of meaningful changes:
- button color changed
- element added / removed / moved
- text content changed
- layout broken

Return ONLY a JSON object with this exact shape (no markdown, no extra text):
{
  "isAnomaly": true | false,
  "description": "A concise Chinese description of what changed, e.g. 按钮颜色从蓝色变为红色",
  "confidence": 0.0 to 1.0
}
`;

function imageToBase64(path: string): string {
    return readFileSync(path).toString("base64");
}

function extractJson(text: string): AIVisionRawResponse | undefined {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return undefined;
    try {
        return JSON.parse(text.slice(start, end + 1)) as AIVisionRawResponse;
    } catch {
        return undefined;
    }
}

function validateResult(raw: AIVisionRawResponse | undefined): AIVisionResult | null {
    if (!raw || typeof raw.isAnomaly !== "boolean" || typeof raw.description !== "string") {
        return null;
    }
    return {
        isAnomaly: raw.isAnomaly,
        description: raw.description,
        confidence: typeof raw.confidence === "number" ? raw.confidence : undefined,
    };
}

/**
 * 分析截图差异。
 *
 * - 若未配置 AI API key，返回 null。
 * - 若调用失败，返回 null（调用方应降级为原 pixelmatch 逻辑）。
 */
export async function analyzeVisualRegression(
    input: AIVisionInput,
    config?: AIConfig
): Promise<AIVisionResult | null> {
    const aiConfig = config ?? detectAIConfig();
    if (!aiConfig) {
        return null;
    }

    try {
        if (aiConfig.provider === "claude") {
            return await callClaudeVision(input, aiConfig);
        }
        return await callOpenAIVision(input, aiConfig);
    } catch {
        return null;
    }
}

async function callClaudeVision(input: AIVisionInput, config: AIConfig): Promise<AIVisionResult | null> {
    const url = config.baseUrl || "https://api.anthropic.com/v1/messages";

    const content: Array<Record<string, unknown>> = [
        { type: "text", text: VISION_PROMPT },
        {
            type: "image",
            source: {
                type: "base64",
                media_type: "image/png",
                data: imageToBase64(input.baselinePath),
            },
        },
        {
            type: "image",
            source: {
                type: "base64",
                media_type: "image/png",
                data: imageToBase64(input.currentPath),
            },
        },
    ];
    if (input.diffPath) {
        content.push({
            type: "image",
            source: {
                type: "base64",
                media_type: "image/png",
                data: imageToBase64(input.diffPath),
            },
        });
    }

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: config.model,
            max_tokens: config.maxTokens || 1024,
            temperature: config.temperature || 0.2,
            messages: [{ role: "user", content }],
        }),
    });

    if (!response.ok) {
        throw new Error(`Claude vision API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const text = data.content[0]?.text || "";
    const raw = extractJson(text);
    const result = validateResult(raw);
    return result ? { ...result, model: config.model } : null;
}

async function callOpenAIVision(input: AIVisionInput, config: AIConfig): Promise<AIVisionResult | null> {
    const url = config.baseUrl || "https://api.openai.com/v1/chat/completions";

    const images = [
        { type: "image_url", image_url: { url: `data:image/png;base64,${imageToBase64(input.baselinePath)}` } },
        { type: "image_url", image_url: { url: `data:image/png;base64,${imageToBase64(input.currentPath)}` } },
    ];
    if (input.diffPath) {
        images.push({
            type: "image_url",
            image_url: { url: `data:image/png;base64,${imageToBase64(input.diffPath)}` },
        });
    }

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model: config.model,
            max_tokens: config.maxTokens || 1024,
            temperature: config.temperature || 0.2,
            messages: [
                {
                    role: "user",
                    content: [{ type: "text", text: VISION_PROMPT }, ...images],
                },
            ],
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI vision API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
    };
    const text = data.choices[0]?.message?.content || "";
    const raw = extractJson(text);
    const result = validateResult(raw);
    return result ? { ...result, model: config.model } : null;
}
