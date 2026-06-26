/**
 * v3.14.0: Agent 注册表
 *
 * 记录当前连接到项目的 AI Agent（Claude Code / Cursor / Copilot / Kimi Code 等），
 * 通过心跳机制维护 TTL，便于多 Agent 共享索引时相互感知。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentInfo, AgentKind } from "./types.js";

export interface AgentRegistryOptions {
    /** 项目根目录 */
    projectDir: string;
    /** 心跳超时时间（毫秒），默认 5 分钟 */
    ttlMs?: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const AGENTS_DIR = ".frontend-guardian";
const AGENTS_FILE = "agents.json";

function registryPath(projectDir: string): string {
    return resolve(projectDir, AGENTS_DIR, AGENTS_FILE);
}

function atomicWriteJsonSync(filePath: string, data: unknown): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
        writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
        try {
            renameSync(tmpPath, filePath);
        } catch (renameErr) {
            const code = (renameErr as NodeJS.ErrnoException).code;
            if (code === "EPERM" || code === "EBUSY") {
                writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
                try {
                    unlinkSync(tmpPath);
                } catch {
                    // ignore cleanup error
                }
            } else {
                throw renameErr;
            }
        }
    } catch (err) {
        try {
            if (existsSync(tmpPath)) {
                unlinkSync(tmpPath);
            }
        } catch {
            // ignore
        }
        throw err;
    }
}

export class AgentRegistry {
    private projectDir: string;
    private ttlMs: number;
    private registryFile: string;

    constructor(options: AgentRegistryOptions) {
        this.projectDir = resolve(options.projectDir);
        this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
        this.registryFile = registryPath(this.projectDir);
    }

    /**
     * 记录一次 Agent 心跳。若该 Agent 不存在则创建，存在则更新 lastSeenAt。
     */
    heartbeat(info: { kind: AgentKind; id?: string; pid?: number }): AgentInfo {
        const now = Date.now();
        const agents = this.readAgents();
        const id = info.id || `${info.kind}-${info.pid ?? process.pid}-${now}`;

        const existingIndex = agents.findIndex((a) => a.id === id);
        const entry: AgentInfo = {
            id,
            kind: info.kind,
            pid: info.pid ?? process.pid,
            connectedAt: existingIndex >= 0 ? agents[existingIndex].connectedAt : now,
            lastSeenAt: now,
        };

        if (existingIndex >= 0) {
            agents[existingIndex] = entry;
        } else {
            agents.push(entry);
        }

        this.writeAgents(agents);
        return entry;
    }

    /**
     * 返回当前活跃的 Agent 列表，自动剔除过期条目。
     */
    list(): AgentInfo[] {
        const agents = this.readAgents();
        const now = Date.now();
        const active = agents.filter((a) => now - a.lastSeenAt <= this.ttlMs);
        if (active.length !== agents.length) {
            this.writeAgents(active);
        }
        return active;
    }

    /**
     * 手动清理过期条目。
     */
    prune(): void {
        const now = Date.now();
        const active = this.readAgents().filter((a) => now - a.lastSeenAt <= this.ttlMs);
        this.writeAgents(active);
    }

    private readAgents(): AgentInfo[] {
        try {
            if (!existsSync(this.registryFile)) {
                return [];
            }
            const raw = readFileSync(this.registryFile, "utf-8");
            const parsed = JSON.parse(raw) as { agents?: AgentInfo[] };
            return Array.isArray(parsed.agents) ? parsed.agents : [];
        } catch {
            return [];
        }
    }

    private writeAgents(agents: AgentInfo[]): void {
        atomicWriteJsonSync(this.registryFile, { agents, updatedAt: Date.now() });
    }
}
