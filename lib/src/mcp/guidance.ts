/**
 * v3.14.1: MCP 自动注入使用指引
 *
 * 当 AI Agent 首次连接时，向其提供 frontend-guardian 工具的用法说明。
 */

import type { AgentKind } from "./types.js";

/** 指引版本号，更新内容后应同步递增 */
export const USAGE_GUIDANCE_VERSION = "3.14.1";

/**
 * 返回 frontend-guardian MCP 工具的使用指引。
 *
 * @param agentKind 可选的 Agent 类型，用于给出更贴合的示例
 */
export function getUsageGuidance(agentKind?: AgentKind): string {
    const kind = agentKind || "generic";
    return `# frontend-guardian MCP 使用指引

你是 ${kind} 接入的 AI Agent。frontend-guardian 是一个前端治理工具，通过 MCP 暴露扫描、修复、页面健康检查等能力。

## 推荐工作流

1. **声明身份（可选但推荐）**
   - 调用 \`register-agent\` 时传入 \`agent: "${kind}"\`。
   - 后续 \`scan\` / \`fix\` / \`index-project\` 都可以附带 \`agent: "${kind}"\`，系统会记录心跳并复用共享索引。

2. **建立项目索引**
   - 首次扫描前调用 \`index-project: { action: "build" }\`。
   - 索引会持久化到 \`.frontend-guardian/index/index.json\`，多 Agent 共享。

3. **执行扫描**
   - 模块选择：\`i18n\` | \`performance\` | \`a11y\` | \`security\` | \`naming\` | \`cross-file\` | \`component\` | \`hooks\` | \`platform\` | \`svelte\` | \`e2e\` | \`all\`
   - 示例：\`scan: { module: "i18n", agent: "${kind}", json: true }\`
   - 想只看当前编辑文件：\`scan: { module: "i18n", context: { file: "src/App.tsx" } }\`

4. **自动修复**
   - \`fix: { module: "i18n", agent: "${kind}", json: true }\` 返回修复后的 diff。
   - 加 \`dryRun: true\` 可先预览，不实际写入文件。

5. **页面健康检查**
   - \`page-health: { baseUrl: "http://localhost:5173", routes: ["/"], json: true }\`
   - 可开启：\`aiVision\` 用 LLM Vision 判断截图差异是否为噪声；\`recordVideo\` 录制失败回放。

## 输出格式

- 需要结构化结果时，传 \`json: true\`。
- 需要人类可读报告时，不传 \`json\`（默认 markdown）。

## 常用查询

- \`list-rules\`：查看当前激活规则。
- \`get-project-meta\`：查看项目检测到的框架、平台、组件库。
- \`list-agents\`：查看当前活跃的 Agent。
- \`get-usage-guidance\`：可再次获取本指引。
`;
}

/**
 * 判断是否需要向指定 Agent 发送新版本的指引。
 *
 * 当注册表中没有该 Agent，或已记录的 guidanceVersion 低于当前版本时返回 true。
 */
export function shouldSendGuidance(current: { guidanceVersion?: string; lastGuidanceAt?: number } | undefined): boolean {
    if (!current) {
        return true;
    }
    if (!current.guidanceVersion) {
        return true;
    }
    // 简单版本号比较：支持 x.y.z 三段
    const toParts = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
    const currentParts = toParts(current.guidanceVersion);
    const latestParts = toParts(USAGE_GUIDANCE_VERSION);
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const a = currentParts[i] ?? 0;
        const b = latestParts[i] ?? 0;
        if (a < b) return true;
        if (a > b) return false;
    }
    return false;
}
