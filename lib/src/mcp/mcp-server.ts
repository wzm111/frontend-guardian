/**
 * v3.8.0: MCP Server 启动器
 *
 * 通过 stdio 与 AI Agent（Claude Code / Cursor / Copilot 等）通信，
 * 暴露 frontend-guardian 的治理能力为 MCP 工具。
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    GetPromptRequestSchema,
    ListPromptsRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getUsageGuidance } from "./guidance.js";
import { getToolDefinitions, handleToolCall } from "./tools.js";

export interface MCPServerOptions {
    /** 项目根目录 */
    projectDir: string;
    /** 配置文件路径 */
    configFile?: string;
    /** 最低严重级别 */
    minSeverity?: string;
}

/** 启动 MCP Server */
export async function runMCPServer(options: MCPServerOptions): Promise<void> {
    // MCP 占用 stdout；启动前必须停止所有向 stdout 的写入。
    // stderr 仍可自由使用，因为 stdio transport 只读 stdin / 只写 stdout。
    const server = new Server(
        { name: "frontend-guardian", version: "3.14.1" },
        { capabilities: { tools: {}, prompts: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: getToolDefinitions(),
    }));

    server.setRequestHandler(ListPromptsRequestSchema, async () => ({
        prompts: [
            {
                name: "frontend-guardian-usage",
                description: "frontend-guardian MCP 工具使用指引与最佳实践",
            },
        ],
    }));

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const name = request.params.name;
        if (name !== "frontend-guardian-usage") {
            throw new Error(`Unknown prompt: ${name}`);
        }
        const args = (request.params.arguments ?? {}) as Record<string, unknown>;
        const agentKind = typeof args.agent === "string" ? (args.agent as import("./types.js").AgentKind) : undefined;
        return {
            description: "frontend-guardian MCP 工具使用指引",
            messages: [
                {
                    role: "user",
                    content: { type: "text", text: getUsageGuidance(agentKind) },
                },
            ],
        } as unknown as import("@modelcontextprotocol/sdk/types.js").GetPromptResult;
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const result = await handleToolCall(
            request.params.name,
            (request.params.arguments ?? {}) as Record<string, unknown>,
            options
        );
        return result as unknown as import("@modelcontextprotocol/sdk/types.js").CallToolResult;
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // 保持进程存活，直到客户端关闭 stdio
    return new Promise(() => {});
}
