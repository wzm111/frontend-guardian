/**
 * 报告上传工具
 * 支持 HTTP webhook 和文件复制两种方式
 */

import { readFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";

/** 上传配置 */
export interface UploadConfig {
    /** 上传方式 */
    provider: "http" | "file";
    /** HTTP webhook URL（provider=http） */
    url?: string;
    /** 额外请求头（provider=http） */
    headers?: Record<string, string>;
    /** 目标目录（provider=file） */
    dir?: string;
    /** 报告访问基础 URL（用于生成可访问链接） */
    baseUrl?: string;
}

/** 上传结果 */
export interface UploadResult {
    /** 是否成功 */
    success: boolean;
    /** 报告访问 URL */
    reportUrl?: string;
    /** 错误信息 */
    error?: string;
}

/**
 * 从环境变量自动检测上传配置
 */
export function detectUploadConfig(): UploadConfig | null {
    const provider = process.env.FG_UPLOAD_PROVIDER;

    if (provider === "http") {
        const url = process.env.FG_UPLOAD_URL;
        if (!url) return null;
        return {
            provider: "http",
            url,
            baseUrl: process.env.FG_UPLOAD_BASE_URL,
        };
    }

    if (provider === "file") {
        const dir = process.env.FG_UPLOAD_DIR;
        if (!dir) return null;
        return {
            provider: "file",
            dir,
            baseUrl: process.env.FG_UPLOAD_BASE_URL,
        };
    }

    return null;
}

/**
 * 上传报告文件
 */
export async function uploadReport(reportPath: string, config: UploadConfig): Promise<UploadResult> {
    if (config.provider === "http") {
        return uploadViaHttp(reportPath, config);
    }
    if (config.provider === "file") {
        return uploadViaFile(reportPath, config);
    }
    return { success: false, error: `Unknown upload provider: ${config.provider}` };
}

/** 通过 HTTP POST 上传 */
async function uploadViaHttp(reportPath: string, config: UploadConfig): Promise<UploadResult> {
    try {
        const content = readFileSync(reportPath, "utf-8");
        const filename = basename(reportPath);

        const response = await fetch(config.url!, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...config.headers,
            },
            body: JSON.stringify({
                filename,
                content,
                timestamp: new Date().toISOString(),
            }),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => "Unknown error");
            return { success: false, error: `HTTP ${response.status}: ${errText}` };
        }

        // 尝试从响应中提取 URL
        let reportUrl: string | undefined;
        try {
            const data = await response.json() as { url?: string; reportUrl?: string };
            reportUrl = data.url || data.reportUrl;
        } catch {
            // 响应不是 JSON，忽略
        }

        return { success: true, reportUrl };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/** 通过文件复制上传 */
function uploadViaFile(reportPath: string, config: UploadConfig): UploadResult {
    try {
        const dir = config.dir!;
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        const filename = basename(reportPath);
        const destPath = resolve(dir, filename);
        copyFileSync(reportPath, destPath);

        // 生成访问 URL
        const reportUrl = config.baseUrl
            ? `${config.baseUrl.replace(/\/$/, "")}/${filename}`
            : `file://${destPath}`;

        return { success: true, reportUrl };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}
