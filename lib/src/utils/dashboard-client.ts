/**
 * Dashboard Client
 *
 * Uploads scan results to a governance dashboard server.
 *
 * v3.5.2: CLI-side reporter for the central dashboard.
 */

import type { ScanResult, Issue } from "@/types.js";

/** Dashboard upload configuration */
export interface DashboardClientConfig {
    /** Dashboard server URL (e.g. http://localhost:3456) */
    serverUrl: string;
    /** Optional auth token */
    authToken?: string;
}

/** Upload result */
export interface DashboardUploadResult {
    success: boolean;
    reportId?: string;
    projectId?: string;
    error?: string;
}

/** Report payload sent to the server */
export interface DashboardReportPayload {
    projectName: string;
    projectPath: string;
    module: string;
    result: ScanResult;
    issues: Issue[];
    git?: { commit?: string; branch?: string };
    meta?: { strategy?: string; duration?: number; filesScanned?: number };
}

/**
 * Upload a scan report to the dashboard server.
 *
 * @param payload Report data
 * @param config Server configuration
 * @returns Upload result
 */
export async function uploadToDashboardServer(
    payload: DashboardReportPayload,
    config: DashboardClientConfig
): Promise<DashboardUploadResult> {
    const url = config.serverUrl.replace(/\/$/, "") + "/api/reports";

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (config.authToken) {
        headers["Authorization"] = `Bearer ${config.authToken}`;
    }

    try {
        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "Unknown error");
            return {
                success: false,
                error: `HTTP ${response.status}: ${text}`,
            };
        }

        const data = (await response.json()) as {
            success?: boolean;
            reportId?: string;
            projectId?: string;
            error?: string;
        };

        return {
            success: data.success ?? true,
            reportId: data.reportId,
            projectId: data.projectId,
        };
    } catch (err) {
        return {
            success: false,
            error: String(err),
        };
    }
}

/**
 * Detect dashboard server config from environment variables.
 *
 * Environment variables:
 * - FG_DASHBOARD_SERVER: server URL
 * - FG_DASHBOARD_TOKEN: optional auth token
 *
 * @returns Config if FG_DASHBOARD_SERVER is set, null otherwise
 */
export function detectDashboardConfig(): DashboardClientConfig | null {
    const serverUrl = process.env.FG_DASHBOARD_SERVER;
    if (!serverUrl) return null;

    return {
        serverUrl,
        authToken: process.env.FG_DASHBOARD_TOKEN,
    };
}
