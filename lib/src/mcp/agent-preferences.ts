/**
 * v3.14.1: Agent 偏好持久化
 *
 * 记录每个 AI Agent 的使用偏好（输出格式、默认模块、忽略规则等），
 * 跨会话保持一致，并让工具调用在未显式传参时按偏好默认值执行。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { acquireIndexLock } from "@/utils/index-lock.js";
import type { AgentKind } from "./types.js";

/** Agent 偏好结构 */
export interface AgentPreferences {
    /** 默认输出格式 */
    defaultOutput?: "json" | "markdown";
    /** 默认扫描模块 */
    defaultModules?: string[];
    /** 经常忽略的规则 ID */
    ignoredRules?: string[];
    /** 最近使用的 Agent 类型 */
    lastAgentKind?: AgentKind;
    /** 最后更新时间 */
    updatedAt: number;
}

export interface AgentPreferencesStoreOptions {
    /** 项目根目录 */
    projectDir: string;
}

interface PreferencesFilePayload {
    preferences: Record<string, AgentPreferences>;
    updatedAt: number;
}

const PREFERENCES_DIR = ".frontend-guardian";
const PREFERENCES_FILE = "agent-preferences.json";

function preferencesPath(projectDir: string): string {
    return resolve(projectDir, PREFERENCES_DIR, PREFERENCES_FILE);
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

function readPreferencesFile(path: string): PreferencesFilePayload {
    try {
        if (!existsSync(path)) {
            return { preferences: {}, updatedAt: 0 };
        }
        const raw = readFileSync(path, "utf-8");
        const parsed = JSON.parse(raw) as Partial<PreferencesFilePayload>;
        if (parsed && typeof parsed === "object" && typeof parsed.preferences === "object") {
            return { preferences: parsed.preferences as Record<string, AgentPreferences>, updatedAt: parsed.updatedAt || 0 };
        }
    } catch {
        // 读取失败视为空
    }
    return { preferences: {}, updatedAt: 0 };
}

export class AgentPreferencesStore {
    private projectDir: string;
    private filePath: string;

    constructor(options: AgentPreferencesStoreOptions) {
        this.projectDir = resolve(options.projectDir);
        this.filePath = preferencesPath(this.projectDir);
    }

    /**
     * 获取指定 Agent 的偏好。若不存在返回仅含 updatedAt 的空对象。
     */
    get(agentId: string): AgentPreferences {
        const payload = readPreferencesFile(this.filePath);
        const prefs = payload.preferences[agentId];
        return {
            defaultOutput: prefs?.defaultOutput,
            defaultModules: prefs?.defaultModules,
            ignoredRules: prefs?.ignoredRules,
            lastAgentKind: prefs?.lastAgentKind,
            updatedAt: prefs?.updatedAt ?? 0,
        };
    }

    /**
     * 合并更新指定 Agent 的偏好。
     */
    async set(agentId: string, prefs: Partial<AgentPreferences>): Promise<void> {
        const lock = await acquireIndexLock({ projectDir: this.projectDir, timeoutMs: 5000 });
        try {
            const payload = readPreferencesFile(this.filePath);
            const existing = payload.preferences[agentId] || { updatedAt: 0 };
            payload.preferences[agentId] = {
                ...existing,
                ...prefs,
                updatedAt: Date.now(),
            };
            payload.updatedAt = Date.now();
            atomicWriteJsonSync(this.filePath, payload);
        } finally {
            lock.release();
        }
    }
}

/**
 * 根据偏好和显式参数决定最终输出格式。
 *
 * @param explicit 调用方显式传入的值
 * @param prefs Agent 偏好
 * @returns 若显式传入则直接用；否则按偏好默认；否则返回 undefined
 */
export function resolveJsonOutput(explicit: boolean | undefined, prefs: AgentPreferences): boolean | undefined {
    if (explicit !== undefined) {
        return explicit;
    }
    if (prefs.defaultOutput === "json") {
        return true;
    }
    if (prefs.defaultOutput === "markdown") {
        return false;
    }
    return undefined;
}

/**
 * 根据偏好和显式参数决定扫描模块。
 */
export function resolveModule(explicit: string | undefined, prefs: AgentPreferences): string | undefined {
    if (explicit !== undefined && explicit !== "") {
        return explicit;
    }
    if (prefs.defaultModules && prefs.defaultModules.length > 0) {
        return prefs.defaultModules.join(",");
    }
    return undefined;
}
