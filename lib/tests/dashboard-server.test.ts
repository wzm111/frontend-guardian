/**
 * Dashboard Server Tests
 *
 * v3.5.2: Tests for the governance dashboard HTTP server
 * and dashboard client upload functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
    DashboardServer,
    uploadToDashboardServer,
    detectDashboardConfig,
} from "../src/index.js";
import type { ScanResult, Issue } from "../src/index.js";

function createTempDir(): string {
    return mkdtempSync(join(tmpdir(), "fg-dashboard-test-"));
}

function makeScanResult(module: string): ScanResult {
    return {
        module,
        total: 3,
        issues: {
            critical: [
                {
                    ruleId: "test-critical",
                    title: "Test Critical",
                    description: "A critical issue",
                    severity: "critical",
                    file: "src/test.ts",
                    line: 1,
                    column: 1,
                } as Issue,
            ],
            warning: [
                {
                    ruleId: "test-warning",
                    title: "Test Warning",
                    description: "A warning issue",
                    severity: "warning",
                    file: "src/test.ts",
                    line: 2,
                    column: 1,
                } as Issue,
            ],
            suggestion: [
                {
                    ruleId: "test-suggestion",
                    title: "Test Suggestion",
                    description: "A suggestion",
                    severity: "suggestion",
                    file: "src/test.ts",
                    line: 3,
                    column: 1,
                } as Issue,
            ],
        },
        duration: 100,
        filesScanned: 5,
        filesWithIssues: 2,
    };
}

describe("DashboardServer", () => {
    let server: DashboardServer;
    let dataDir: string;
    let port: number;

    beforeEach(() => {
        dataDir = createTempDir();
        port = 19000 + Math.floor(Math.random() * 1000);
        server = new DashboardServer({ dataDir });
    });

    afterEach(async () => {
        await server.stop();
        rmSync(dataDir, { recursive: true, force: true });
    });

    it("should start and stop the server", async () => {
        await server.start(port);
        expect(server.getServer()).not.toBeNull();
        await server.stop();
        expect(server.getServer()).toBeNull();
    });

    it("should receive a report via POST /api/reports", async () => {
        await server.start(port);

        const result = makeScanResult("i18n");
        const payload = {
            projectName: "my-project",
            projectPath: "/home/user/my-project",
            module: "i18n",
            result,
            issues: [...result.issues.critical, ...result.issues.warning, ...result.issues.suggestion],
        };

        const res = await fetch(`http://localhost:${port}/api/reports`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.reportId).toBeDefined();
        expect(data.projectId).toBeDefined();
    });

    it("should list projects via GET /api/projects", async () => {
        await server.start(port);

        // Upload two reports for two different projects
        for (const name of ["project-a", "project-b"]) {
            const result = makeScanResult("security");
            await fetch(`http://localhost:${port}/api/reports`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectName: name,
                    projectPath: `/home/user/${name}`,
                    module: "security",
                    result,
                    issues: [],
                }),
            });
        }

        const res = await fetch(`http://localhost:${port}/api/projects`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.projects).toHaveLength(2);
        expect(data.projects.map((p: { name: string }) => p.name)).toContain("project-a");
        expect(data.projects.map((p: { name: string }) => p.name)).toContain("project-b");
    });

    it("should get project details via GET /api/projects/:id", async () => {
        await server.start(port);

        const result = makeScanResult("hooks");
        const postRes = await fetch(`http://localhost:${port}/api/reports`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectName: "detail-test",
                projectPath: "/home/user/detail-test",
                module: "hooks",
                result,
                issues: [],
            }),
        });
        const postData = await postRes.json();

        const res = await fetch(`http://localhost:${port}/api/projects/${postData.projectId}`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.project.name).toBe("detail-test");
    });

    it("should return 404 for unknown project", async () => {
        await server.start(port);

        const res = await fetch(`http://localhost:${port}/api/projects/nonexistent`);
        expect(res.status).toBe(404);
    });

    it("should list reports via GET /api/projects/:id/reports", async () => {
        await server.start(port);

        const result = makeScanResult("component");
        const postRes = await fetch(`http://localhost:${port}/api/reports`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectName: "report-list",
                projectPath: "/home/user/report-list",
                module: "component",
                result,
                issues: [],
            }),
        });
        const postData = await postRes.json();

        const res = await fetch(`http://localhost:${port}/api/projects/${postData.projectId}/reports`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.reports).toHaveLength(1);
        expect(data.reports[0].module).toBe("component");
    });

    it("should return trends via GET /api/projects/:id/trends", async () => {
        await server.start(port);

        const result = makeScanResult("performance");
        const postRes = await fetch(`http://localhost:${port}/api/reports`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectName: "trend-test",
                projectPath: "/home/user/trend-test",
                module: "performance",
                result,
                issues: [],
            }),
        });
        const postData = await postRes.json();

        const res = await fetch(`http://localhost:${port}/api/projects/${postData.projectId}/trends`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.trends).toHaveLength(1);
        expect(data.trends[0].critical).toBe(1);
        expect(data.trends[0].warning).toBe(1);
        expect(data.trends[0].suggestion).toBe(1);
    });

    it("should return latest report via GET /api/projects/:id/latest", async () => {
        await server.start(port);

        const result = makeScanResult("a11y");
        const postRes = await fetch(`http://localhost:${port}/api/reports`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectName: "latest-test",
                projectPath: "/home/user/latest-test",
                module: "a11y",
                result,
                issues: [],
            }),
        });
        const postData = await postRes.json();

        const res = await fetch(`http://localhost:${port}/api/projects/${postData.projectId}/latest`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.report.module).toBe("a11y");
    });

    it("should serve dashboard HTML via GET /", async () => {
        await server.start(port);

        const res = await fetch(`http://localhost:${port}/`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain("Frontend Guardian Dashboard");
        expect(html).toContain("<canvas");
    });

    it("should require auth token when configured", async () => {
        await server.stop();
        const authServer = new DashboardServer({ dataDir, authToken: "secret123" });
        await authServer.start(port);

        const result = makeScanResult("naming");

        // No auth header → 401
        const res1 = await fetch(`http://localhost:${port}/api/reports`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectName: "auth-test",
                projectPath: "/home/user/auth-test",
                module: "naming",
                result,
                issues: [],
            }),
        });
        expect(res1.status).toBe(401);

        // Wrong token → 401
        const res2 = await fetch(`http://localhost:${port}/api/reports`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer wrong",
            },
            body: JSON.stringify({
                projectName: "auth-test",
                projectPath: "/home/user/auth-test",
                module: "naming",
                result,
                issues: [],
            }),
        });
        expect(res2.status).toBe(401);

        // Correct token → 201
        const res3 = await fetch(`http://localhost:${port}/api/reports`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer secret123",
            },
            body: JSON.stringify({
                projectName: "auth-test",
                projectPath: "/home/user/auth-test",
                module: "naming",
                result,
                issues: [],
            }),
        });
        expect(res3.status).toBe(201);

        await authServer.stop();
    });

    it("should return 400 for invalid report payload", async () => {
        await server.start(port);

        const res = await fetch(`http://localhost:${port}/api/reports`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectName: "bad" }),
        });
        expect(res.status).toBe(400);
    });
});

describe("dashboard-client", () => {
    let server: DashboardServer;
    let dataDir: string;
    let port: number;

    beforeEach(() => {
        dataDir = createTempDir();
        port = 18000 + Math.floor(Math.random() * 1000);
        server = new DashboardServer({ dataDir });
    });

    afterEach(async () => {
        await server.stop();
        rmSync(dataDir, { recursive: true, force: true });
    });

    it("should upload report via uploadToDashboardServer", async () => {
        await server.start(port);

        const result = makeScanResult("platform");
        const payload = {
            projectName: "client-test",
            projectPath: "/home/user/client-test",
            module: "platform",
            result,
            issues: [],
        };

        const uploadResult = await uploadToDashboardServer(payload, {
            serverUrl: `http://localhost:${port}`,
        });

        expect(uploadResult.success).toBe(true);
        expect(uploadResult.reportId).toBeDefined();
        expect(uploadResult.projectId).toBeDefined();
    });

    it("should return error for failed upload", async () => {
        // Server not started → connection refused
        const payload = {
            projectName: "fail-test",
            projectPath: "/home/user/fail",
            module: "security",
            result: makeScanResult("security"),
            issues: [],
        };

        const uploadResult = await uploadToDashboardServer(payload, {
            serverUrl: `http://localhost:${port}`,
        });

        expect(uploadResult.success).toBe(false);
        expect(uploadResult.error).toBeDefined();
    });

    it("should detect dashboard config from environment", () => {
        const originalServer = process.env.FG_DASHBOARD_SERVER;
        const originalToken = process.env.FG_DASHBOARD_TOKEN;

        process.env.FG_DASHBOARD_SERVER = "http://localhost:3456";
        process.env.FG_DASHBOARD_TOKEN = "my-token";

        const config = detectDashboardConfig();
        expect(config).not.toBeNull();
        expect(config!.serverUrl).toBe("http://localhost:3456");
        expect(config!.authToken).toBe("my-token");

        delete process.env.FG_DASHBOARD_SERVER;
        const noConfig = detectDashboardConfig();
        expect(noConfig).toBeNull();

        // Restore
        if (originalServer) process.env.FG_DASHBOARD_SERVER = originalServer;
        else delete process.env.FG_DASHBOARD_SERVER;
        if (originalToken) process.env.FG_DASHBOARD_TOKEN = originalToken;
        else delete process.env.FG_DASHBOARD_TOKEN;
    });
});
