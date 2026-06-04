/**
 * 扫描结果通知系统
 *
 * 支持飞书、钉钉、企业微信、Slack webhook 通知。
 * 扫描完成后自动发送摘要到配置的渠道。
 */

import type { ScanResult, Severity } from "@/types.js";

/** 通知渠道配置 */
export interface NotificationChannel {
    enabled: boolean;
    webhook: string;
}

/** 通知配置 */
export interface NotificationConfig {
    feishu?: NotificationChannel;
    dingtalk?: NotificationChannel;
    wecom?: NotificationChannel;
    slack?: NotificationChannel;
}

/** 通知内容 */
export interface NotificationPayload {
    project: string;
    modules: string[];
    totalIssues: number;
    issuesBySeverity: Record<Severity, number>;
    duration: number;
    topIssues: { file: string; title: string; severity: Severity }[];
    reportUrl?: string;
    gatePassed?: boolean;
}

/** 通知结果 */
export interface NotificationResult {
    channel: string;
    success: boolean;
    error?: string;
}

/** 从环境变量或配置检测通知配置 */
export function detectNotificationConfig(): NotificationConfig {
    const config: NotificationConfig = {};

    const channels: Array<{ key: keyof NotificationConfig; env: string }> = [
        { key: "feishu", env: "FG_NOTIFY_FEISHU" },
        { key: "dingtalk", env: "FG_NOTIFY_DINGTALK" },
        { key: "wecom", env: "FG_NOTIFY_WECOM" },
        { key: "slack", env: "FG_NOTIFY_SLACK" },
    ];

    for (const { key, env } of channels) {
        const webhook = process.env[env];
        if (webhook) {
            config[key] = { enabled: true, webhook };
        }
    }

    return config;
}

/** 发送通知到所有已启用渠道 */
export async function sendNotifications(
    payload: NotificationPayload,
    config: NotificationConfig
): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    const entries = Object.entries(config) as Array<[
        keyof NotificationConfig,
        NotificationChannel,
    ]>;

    for (const [channel, channelConfig] of entries) {
        if (!channelConfig?.enabled || !channelConfig.webhook) {
            continue;
        }
        try {
            const result = await sendToChannel(payload, channel, channelConfig.webhook);
            results.push(result);
        } catch (err) {
            results.push({ channel, success: false, error: String(err) });
        }
    }

    return results;
}

/** 发送单渠道通知 */
async function sendToChannel(
    payload: NotificationPayload,
    channel: string,
    webhook: string
): Promise<NotificationResult> {
    const body = buildPayload(payload, channel);

    const response = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "Unknown error");
        return { channel, success: false, error: `HTTP ${response.status}: ${text}` };
    }

    return { channel, success: true };
}

/** 根据渠道构建不同格式的 payload */
function buildPayload(payload: NotificationPayload, channel: string): unknown {
    const status = payload.gatePassed !== false ? "✅ 扫描完成" : "❌ 门禁未通过";
    const severityText = [
        `🔴 Critical: ${payload.issuesBySeverity.critical || 0}`,
        `🟡 Warning: ${payload.issuesBySeverity.warning || 0}`,
        `💡 Suggestion: ${payload.issuesBySeverity.suggestion || 0}`,
    ].join(" | ");

    const topIssuesText = payload.topIssues
        .map((i) => `• [${i.severity.toUpperCase()}] ${i.file}: ${i.title}`)
        .join("\n");

    switch (channel) {
        case "feishu":
            return buildFeishuPayload(payload, status, severityText, topIssuesText);
        case "dingtalk":
            return buildDingTalkPayload(payload, status, severityText, topIssuesText);
        case "wecom":
            return buildWeComPayload(payload, status, severityText, topIssuesText);
        case "slack":
            return buildSlackPayload(payload, status, severityText, topIssuesText);
        default:
            return buildGenericPayload(payload, status, severityText, topIssuesText);
    }
}

/** 飞书 webhook payload */
function buildFeishuPayload(
    payload: NotificationPayload,
    status: string,
    severityText: string,
    topIssuesText: string
): unknown {
    const content = [
        `**${status}**`,
        `项目: ${payload.project}`,
        `模块: ${payload.modules.join(", ")}`,
        `耗时: ${(payload.duration / 1000).toFixed(1)}s`,
        ``,
        severityText,
        ``,
        topIssuesText ? `**关键问题:**\n${topIssuesText}` : "",
        payload.reportUrl ? `\n[查看完整报告](${payload.reportUrl})` : "",
    ]
        .filter(Boolean)
        .join("\n");

    return {
        msg_type: "interactive",
        card: {
            config: { wide_screen_mode: true },
            header: {
                title: { tag: "plain_text", content: `frontend-guardian: ${payload.project}` },
                template: payload.gatePassed === false ? "red" : "green",
            },
            elements: [
                {
                    tag: "div",
                    text: { tag: "lark_md", content },
                },
            ],
        },
    };
}

/** 钉钉 webhook payload */
function buildDingTalkPayload(
    payload: NotificationPayload,
    status: string,
    severityText: string,
    topIssuesText: string
): unknown {
    const text = [
        `### ${status}`,
        `**项目:** ${payload.project}`,
        `**模块:** ${payload.modules.join(", ")}`,
        `**耗时:** ${(payload.duration / 1000).toFixed(1)}s`,
        ``,
        severityText,
        ``,
        topIssuesText ? `**关键问题:**\n${topIssuesText}` : "",
        payload.reportUrl ? `\n[查看完整报告](${payload.reportUrl})` : "",
    ]
        .filter(Boolean)
        .join("\n");

    return {
        msgtype: "markdown",
        markdown: { title: `frontend-guardian: ${payload.project}`, text },
    };
}

/** 企业微信 webhook payload */
function buildWeComPayload(
    payload: NotificationPayload,
    status: string,
    severityText: string,
    topIssuesText: string
): unknown {
    const content = [
        `${status}`,
        `项目: ${payload.project}`,
        `模块: ${payload.modules.join(", ")}`,
        `耗时: ${(payload.duration / 1000).toFixed(1)}s`,
        ``,
        severityText,
        ``,
        topIssuesText ? `关键问题:\n${topIssuesText}` : "",
        payload.reportUrl ? `\n查看完整报告: ${payload.reportUrl}` : "",
    ]
        .filter(Boolean)
        .join("\n");

    return {
        msgtype: "markdown",
        markdown: { content },
    };
}

/** Slack webhook payload */
function buildSlackPayload(
    payload: NotificationPayload,
    status: string,
    severityText: string,
    topIssuesText: string
): unknown {
    const color = payload.gatePassed === false ? "danger" : "good";

    const fields = [
        { title: "项目", value: payload.project, short: true },
        { title: "模块", value: payload.modules.join(", "), short: true },
        { title: "耗时", value: `${(payload.duration / 1000).toFixed(1)}s`, short: true },
        { title: "问题分布", value: severityText.replace(/\|/g, "\n"), short: false },
    ];

    if (topIssuesText) {
        fields.push({ title: "关键问题", value: topIssuesText, short: false });
    }

    return {
        attachments: [
            {
                color,
                pretext: status,
                fields,
                footer: "frontend-guardian",
                ts: Math.floor(Date.now() / 1000),
            },
        ],
    };
}

/** 通用 JSON payload */
function buildGenericPayload(
    payload: NotificationPayload,
    status: string,
    severityText: string,
    topIssuesText: string
): unknown {
    return {
        status,
        project: payload.project,
        modules: payload.modules,
        duration: payload.duration,
        severity: payload.issuesBySeverity,
        topIssues: payload.topIssues,
        reportUrl: payload.reportUrl,
        gatePassed: payload.gatePassed,
    };
}

/** 从 ScanResult[] 构建通知 payload */
export function buildNotificationPayload(
    results: ScanResult[],
    options: {
        project: string;
        duration: number;
        reportUrl?: string;
        gatePassed?: boolean;
    }
): NotificationPayload {
    const issuesBySeverity: Record<Severity, number> = { critical: 0, warning: 0, suggestion: 0 };
    const allIssues: { file: string; title: string; severity: Severity }[] = [];

    for (const result of results) {
        for (const sev of ["critical", "warning", "suggestion"] as Severity[]) {
            issuesBySeverity[sev] += result.issues[sev].length;
            for (const issue of result.issues[sev]) {
                allIssues.push({
                    file: issue.file,
                    title: issue.title,
                    severity: sev,
                });
            }
        }
    }

    // 取最严重的 top 5
    const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, suggestion: 2 };
    const topIssues = allIssues
        .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
        .slice(0, 5);

    return {
        project: options.project,
        modules: results.map((r) => r.module),
        totalIssues: allIssues.length,
        issuesBySeverity,
        duration: options.duration,
        topIssues,
        reportUrl: options.reportUrl,
        gatePassed: options.gatePassed,
    };
}
