/**
 * Governance Dashboard Server
 *
 * v3.5.2: Central HTTP server for collecting and displaying
 * multi-project scan results.
 *
 * Zero external dependencies: uses node:http and node:fs only.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import {
    readFileSync,
    writeFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
} from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { ScanResult, Issue } from "@/types.js";
import { generateDashboardHtml } from "./dashboard-html.js";

/** Project metadata stored on the server */
export interface DashboardProject {
    id: string;
    name: string;
    path: string;
    createdAt: number;
    lastScanAt: number;
    reportCount: number;
}

/** A single scan report stored on the server */
export interface DashboardReport {
    id: string;
    projectId: string;
    timestamp: number;
    module: string;
    result: ScanResult;
    issues: Issue[];
    git?: { commit?: string; branch?: string };
    meta?: { strategy?: string; duration?: number; filesScanned?: number };
}

/** Server options */
export interface DashboardServerOptions {
    /** Data directory (default: ~/.frontend-guardian-server) */
    dataDir?: string;
    /** CORS origin (default: no CORS headers) */
    cors?: string;
    /** Optional auth token for POST /api/reports */
    authToken?: string;
}

/** POST /api/reports request body */
export interface ReportPayload {
    projectName: string;
    projectPath: string;
    module: string;
    result: ScanResult;
    issues: Issue[];
    git?: { commit?: string; branch?: string };
    meta?: { strategy?: string; duration?: number; filesScanned?: number };
}

/** Trend data point */
export interface TrendPoint {
    timestamp: number;
    critical: number;
    warning: number;
    suggestion: number;
    total: number;
}

/**
 * Generate a stable project ID from path + name
 */
function generateProjectId(name: string, path: string): string {
    return createHash("sha256").update(`${name}:${path}`).digest("hex").slice(0, 16);
}

/**
 * Parse JSON body from an IncomingMessage
 */
function parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            try {
                const body = Buffer.concat(chunks).toString("utf-8");
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(err);
            }
        });
        req.on("error", reject);
    });
}

/**
 * Send a JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

/**
 * Send a text/plain error response
 */
function sendError(res: ServerResponse, status: number, message: string): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
}

/**
 * Governance Dashboard HTTP Server
 *
 * Collects scan reports from multiple projects and serves
 * a web dashboard for trend visualization.
 */
export class DashboardServer {
    private dataDir: string;
    private options: DashboardServerOptions;
    private server: Server | null = null;
    private projectsFile: string;

    constructor(options: DashboardServerOptions = {}) {
        this.options = options;
        this.dataDir =
            options.dataDir || resolve(process.env.HOME || process.env.USERPROFILE || ".", ".frontend-guardian-server");
        this.projectsFile = resolve(this.dataDir, "projects.json");
        this.ensureDir(this.dataDir);
    }

    /** Start the HTTP server */
    start(port = 3456): Promise<void> {
        return new Promise((resolve) => {
            this.server = createServer((req, res) => this.handleRequest(req, res));
            this.server.listen(port, () => {
                console.log(`Dashboard server running at http://localhost:${port}`);
                console.log(`Data directory: ${this.dataDir}`);
                resolve();
            });
        });
    }

    /** Stop the HTTP server */
    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.server) {
                resolve();
                return;
            }
            this.server.close(() => {
                this.server = null;
                resolve();
            });
        });
    }

    /** Get the underlying http.Server instance (for testing) */
    getServer(): Server | null {
        return this.server;
    }

    /** Get the data directory path */
    getDataDir(): string {
        return this.dataDir;
    }

    private handleRequest(req: IncomingMessage, res: ServerResponse): void {
        // CORS
        if (this.options.cors) {
            res.setHeader("Access-Control-Allow-Origin", this.options.cors);
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        }

        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = new URL(req.url || "/", `http://${req.headers.host}`);
        const pathname = url.pathname;

        // Auth check for POST
        if (req.method === "POST" && this.options.authToken) {
            const auth = req.headers.authorization;
            if (!auth || auth !== `Bearer ${this.options.authToken}`) {
                sendError(res, 401, "Unauthorized");
                return;
            }
        }

        // Route matching
        if (pathname === "/api/reports" && req.method === "POST") {
            this.handlePostReport(req, res);
            return;
        }

        if (pathname === "/api/projects" && req.method === "GET") {
            this.handleGetProjects(res);
            return;
        }

        const projectMatch = pathname.match(/^\/api\/projects\/([^\/]+)$/);
        if (projectMatch && req.method === "GET") {
            this.handleGetProject(projectMatch[1], res);
            return;
        }

        const reportsMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/reports$/);
        if (reportsMatch && req.method === "GET") {
            const limit = parseInt(url.searchParams.get("limit") || "50", 10);
            this.handleGetReports(reportsMatch[1], limit, res);
            return;
        }

        const trendsMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/trends$/);
        if (trendsMatch && req.method === "GET") {
            this.handleGetTrends(trendsMatch[1], res);
            return;
        }

        const latestMatch = pathname.match(/^\/api\/projects\/([^\/]+)\/latest$/);
        if (latestMatch && req.method === "GET") {
            this.handleGetLatest(latestMatch[1], res);
            return;
        }

        if (pathname === "/" && req.method === "GET") {
            this.handleGetDashboard(res);
            return;
        }

        sendError(res, 404, "Not found");
    }

    // ── Route Handlers ────────────────────────────────────────────────────

    private async handlePostReport(req: IncomingMessage, res: ServerResponse): Promise<void> {
        try {
            const body = (await parseBody(req)) as ReportPayload;
            if (!body.projectName || !body.result) {
                sendError(res, 400, "Missing projectName or result");
                return;
            }

            const projectId = generateProjectId(body.projectName, body.projectPath || body.projectName);
            const timestamp = Date.now();
            const reportId = `${timestamp}-${projectId}-${body.module || "all"}`;

            // Save report
            const report: DashboardReport = {
                id: reportId,
                projectId,
                timestamp,
                module: body.module || "all",
                result: body.result,
                issues: body.issues || [],
                git: body.git,
                meta: body.meta,
            };

            const reportDir = resolve(this.dataDir, "reports", projectId);
            this.ensureDir(reportDir);
            writeFileSync(resolve(reportDir, `${timestamp}.json`), JSON.stringify(report, null, 2), "utf-8");

            // Update project index
            const projects = this.loadProjects();
            const existing = projects.find((p) => p.id === projectId);
            if (existing) {
                existing.lastScanAt = timestamp;
                existing.reportCount = this.countReports(projectId);
            } else {
                projects.push({
                    id: projectId,
                    name: body.projectName,
                    path: body.projectPath || body.projectName,
                    createdAt: timestamp,
                    lastScanAt: timestamp,
                    reportCount: 1,
                });
            }
            this.saveProjects(projects);

            sendJson(res, 201, { success: true, reportId, projectId });
        } catch (err) {
            sendError(res, 400, `Invalid JSON: ${String(err)}`);
        }
    }

    private handleGetProjects(res: ServerResponse): void {
        const projects = this.loadProjects();
        sendJson(res, 200, { projects });
    }

    private handleGetProject(projectId: string, res: ServerResponse): void {
        const projects = this.loadProjects();
        const project = projects.find((p) => p.id === projectId);
        if (!project) {
            sendError(res, 404, "Project not found");
            return;
        }
        sendJson(res, 200, { project });
    }

    private handleGetReports(projectId: string, limit: number, res: ServerResponse): void {
        const reportDir = resolve(this.dataDir, "reports", projectId);
        if (!existsSync(reportDir)) {
            sendJson(res, 200, { reports: [] });
            return;
        }

        const files = readdirSync(reportDir)
            .filter((f) => f.endsWith(".json"))
            .sort()
            .reverse()
            .slice(0, limit);

        const reports: Array<{
            id: string;
            timestamp: number;
            module: string;
            counts: { critical: number; warning: number; suggestion: number };
        }> = [];

        for (const file of files) {
            try {
                const raw = readFileSync(resolve(reportDir, file), "utf-8");
                const report = JSON.parse(raw) as DashboardReport;
                reports.push({
                    id: report.id,
                    timestamp: report.timestamp,
                    module: report.module,
                    counts: {
                        critical: report.result.issues.critical.length,
                        warning: report.result.issues.warning.length,
                        suggestion: report.result.issues.suggestion.length,
                    },
                });
            } catch {
                // skip invalid
            }
        }

        sendJson(res, 200, { reports });
    }

    private handleGetTrends(projectId: string, res: ServerResponse): void {
        const reportDir = resolve(this.dataDir, "reports", projectId);
        if (!existsSync(reportDir)) {
            sendJson(res, 200, { trends: [] });
            return;
        }

        const files = readdirSync(reportDir)
            .filter((f) => f.endsWith(".json"))
            .sort();

        const trends: TrendPoint[] = [];
        for (const file of files) {
            try {
                const raw = readFileSync(resolve(reportDir, file), "utf-8");
                const report = JSON.parse(raw) as DashboardReport;
                trends.push({
                    timestamp: report.timestamp,
                    critical: report.result.issues.critical.length,
                    warning: report.result.issues.warning.length,
                    suggestion: report.result.issues.suggestion.length,
                    total: report.result.total,
                });
            } catch {
                // skip invalid
            }
        }

        sendJson(res, 200, { trends });
    }

    private handleGetLatest(projectId: string, res: ServerResponse): void {
        const reportDir = resolve(this.dataDir, "reports", projectId);
        if (!existsSync(reportDir)) {
            sendError(res, 404, "Project not found or no reports");
            return;
        }

        const files = readdirSync(reportDir)
            .filter((f) => f.endsWith(".json"))
            .sort()
            .reverse();

        if (files.length === 0) {
            sendError(res, 404, "No reports found");
            return;
        }

        try {
            const raw = readFileSync(resolve(reportDir, files[0]), "utf-8");
            const report = JSON.parse(raw) as DashboardReport;
            sendJson(res, 200, { report });
        } catch {
            sendError(res, 500, "Failed to read latest report");
        }
    }

    private handleGetDashboard(res: ServerResponse): void {
        const html = generateDashboardHtml();
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
    }

    // ── File Storage Helpers ──────────────────────────────────────────────

    private ensureDir(dir: string): void {
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
    }

    private loadProjects(): DashboardProject[] {
        try {
            if (existsSync(this.projectsFile)) {
                const raw = readFileSync(this.projectsFile, "utf-8");
                return JSON.parse(raw) as DashboardProject[];
            }
        } catch {
            // corrupted, start fresh
        }
        return [];
    }

    private saveProjects(projects: DashboardProject[]): void {
        writeFileSync(this.projectsFile, JSON.stringify(projects, null, 2), "utf-8");
    }

    private countReports(projectId: string): number {
        const reportDir = resolve(this.dataDir, "reports", projectId);
        if (!existsSync(reportDir)) return 0;
        return readdirSync(reportDir).filter((f) => f.endsWith(".json")).length;
    }
}
