/**
 * 报告上传工具测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uploadReport, detectUploadConfig, type UploadConfig } from "../src/utils/report-uploader.js";

describe("报告上传工具", () => {
    let tempDir: string;
    let reportPath: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-upload-test-"));
        reportPath = join(tempDir, "report.md");
        writeFileSync(reportPath, "# Test Report\n\nSome issues found.", "utf-8");
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
        delete process.env.FG_UPLOAD_PROVIDER;
        delete process.env.FG_UPLOAD_URL;
        delete process.env.FG_UPLOAD_DIR;
        delete process.env.FG_UPLOAD_BASE_URL;
    });

    describe("detectUploadConfig", () => {
        it("无环境变量时应返回 null", () => {
            expect(detectUploadConfig()).toBeNull();
        });

        it("FG_UPLOAD_PROVIDER=http + FG_UPLOAD_URL 应返回 http 配置", () => {
            process.env.FG_UPLOAD_PROVIDER = "http";
            process.env.FG_UPLOAD_URL = "https://example.com/upload";
            process.env.FG_UPLOAD_BASE_URL = "https://example.com/reports";

            const config = detectUploadConfig();
            expect(config).toEqual({
                provider: "http",
                url: "https://example.com/upload",
                baseUrl: "https://example.com/reports",
            });
        });

        it("FG_UPLOAD_PROVIDER=http 但无 URL 时应返回 null", () => {
            process.env.FG_UPLOAD_PROVIDER = "http";
            expect(detectUploadConfig()).toBeNull();
        });

        it("FG_UPLOAD_PROVIDER=file + FG_UPLOAD_DIR 应返回 file 配置", () => {
            process.env.FG_UPLOAD_PROVIDER = "file";
            process.env.FG_UPLOAD_DIR = "/tmp/reports";

            const config = detectUploadConfig();
            expect(config).toEqual({
                provider: "file",
                dir: "/tmp/reports",
                baseUrl: undefined,
            });
        });
    });

    describe("uploadReport — file provider", () => {
        it("应复制报告到目标目录", async () => {
            const destDir = join(tempDir, "dest");
            const result = await uploadReport(reportPath, {
                provider: "file",
                dir: destDir,
            });

            expect(result.success).toBe(true);
            expect(existsSync(join(destDir, "report.md"))).toBe(true);
            expect(readFileSync(join(destDir, "report.md"), "utf-8")).toBe("# Test Report\n\nSome issues found.");
        });

        it("应生成 baseUrl 访问链接", async () => {
            const destDir = join(tempDir, "dest");
            const result = await uploadReport(reportPath, {
                provider: "file",
                dir: destDir,
                baseUrl: "https://reports.example.com/",
            });

            expect(result.success).toBe(true);
            expect(result.reportUrl).toBe("https://reports.example.com/report.md");
        });

        it("无 baseUrl 时应生成 file:// 链接", async () => {
            const destDir = join(tempDir, "dest");
            const result = await uploadReport(reportPath, {
                provider: "file",
                dir: destDir,
            });

            expect(result.success).toBe(true);
            expect(result.reportUrl).toMatch(/^file:\/\//);
            expect(result.reportUrl).toMatch(/\/report\.md$/);
        });

        it("目标目录不存在时应自动创建", async () => {
            const destDir = join(tempDir, "nested", "dir");
            const result = await uploadReport(reportPath, {
                provider: "file",
                dir: destDir,
            });

            expect(result.success).toBe(true);
            expect(existsSync(destDir)).toBe(true);
        });
    });

    describe("uploadReport — http provider", () => {
        it("应发送 JSON POST 请求", async () => {
            const server = await startMockServer((req) => {
                expect(req.method).toBe("POST");
                expect(req.headers["content-type"]).toBe("application/json");
                expect(req.body.filename).toBe("report.md");
                expect(req.body.content).toBe("# Test Report\n\nSome issues found.");
                expect(req.body.timestamp).toBeDefined();
                return { url: "https://reports.example.com/abc123" };
            });

            const result = await uploadReport(reportPath, {
                provider: "http",
                url: server.url,
            });

            expect(result.success).toBe(true);
            expect(result.reportUrl).toBe("https://reports.example.com/abc123");

            server.close();
        });

        it("非 2xx 响应应返回错误", async () => {
            const server = await startMockServer(() => {
                return new Response("Internal Server Error", { status: 500 });
            });

            const result = await uploadReport(reportPath, {
                provider: "http",
                url: server.url,
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain("500");

            server.close();
        });

        it("应支持自定义请求头", async () => {
            const server = await startMockServer((req) => {
                expect(req.headers["x-api-key"]).toBe("secret123");
                return {};
            });

            const result = await uploadReport(reportPath, {
                provider: "http",
                url: server.url,
                headers: { "X-API-Key": "secret123" },
            });

            expect(result.success).toBe(true);

            server.close();
        });
    });

    describe("uploadReport — unknown provider", () => {
        it("应返回错误", async () => {
            const result = await uploadReport(reportPath, {
                provider: "unknown" as any,
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain("Unknown");
        });
    });
});

// 简单的 mock HTTP server
interface MockServer {
    url: string;
    close: () => void;
}

async function startMockServer(
    handler: (req: { method: string; headers: Record<string, string>; body: any }) => any
): Promise<MockServer> {
    const requests: any[] = [];

    // 使用 Node.js 内置 http 模块创建服务器
    const { createServer } = await import("node:http");
    const server = createServer(async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

        const response = handler({
            method: req.method || "GET",
            headers: req.headers as Record<string, string>,
            body,
        });

        if (response instanceof Response) {
            res.writeHead(response.status, { "Content-Type": "text/plain" });
            res.end(await response.text());
        } else {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(response));
        }
    });

    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address() as { port: number };
            resolve({
                url: `http://127.0.0.1:${addr.port}`,
                close: () => server.close(),
            });
        });
    });
}
