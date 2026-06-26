/**
 * v3.14.0: 项目索引文件锁
 *
 * 无外部依赖的进程级建议锁，用于多个 AI Agent / MCP 进程共享索引时
 * 避免并发 buildIndex/updateIndex 导致索引文件损坏。
 */

import {
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    renameSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

export interface IndexLockOptions {
    /** 项目根目录 */
    projectDir: string;
    /** 等待锁的最长时间（毫秒），默认 10_000 */
    timeoutMs?: number;
    /** 锁文件超时时间（毫秒），默认 60_000 */
    staleLockMs?: number;
    /** 发起锁的 Agent 类型（仅用于日志/诊断） */
    agent?: string;
}

export interface IndexLock {
    release(): void;
}

interface LockFilePayload {
    pid: number;
    startedAt: number;
    agent?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_STALE_LOCK_MS = 60_000;
const LOCK_DIR = ".frontend-guardian";
const LOCK_FILE = "index.lock";

function lockPath(projectDir: string): string {
    return resolve(projectDir, LOCK_DIR, LOCK_FILE);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function readLockPayload(path: string): LockFilePayload | undefined {
    try {
        const raw = readFileSync(path, "utf-8");
        return JSON.parse(raw) as LockFilePayload;
    } catch {
        return undefined;
    }
}

/**
 * 尝试获取索引锁。
 *
 * 使用 `openSync(path, "wx")` 原子创建锁文件；若锁已存在则等待或抢占过期锁。
 * 返回的 `release()` 应在 finally 中调用以删除锁文件。
 */
export async function acquireIndexLock(opts: IndexLockOptions): Promise<IndexLock> {
    const { projectDir, timeoutMs = DEFAULT_TIMEOUT_MS, staleLockMs = DEFAULT_STALE_LOCK_MS, agent } = opts;
    const path = lockPath(projectDir);
    const started = Date.now();
    let wait = 10;

    while (Date.now() - started < timeoutMs) {
        try {
            // 确保锁文件所在目录存在
            const lockDir = dirname(path);
            if (!existsSync(lockDir)) {
                mkdirSync(lockDir, { recursive: true });
            }
            const fd = openSync(path, "wx");
            const payload: LockFilePayload = { pid: process.pid, startedAt: Date.now(), agent };
            writeFileSync(fd, JSON.stringify(payload, null, 2), "utf-8");
            try {
                closeSync(fd);
            } catch {
                // ignore
            }
            return {
                release: () => {
                    try {
                        unlinkSync(path);
                    } catch {
                        // 锁文件可能已被其他进程清理
                    }
                },
            };
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code !== "EEXIST") {
                // 非锁占用错误，等待后重试
                await sleep(wait);
                wait = Math.min(wait * 2, 500);
                continue;
            }

            const payload = readLockPayload(path);
            const now = Date.now();
            const isStale = !payload || now - payload.startedAt > staleLockMs || !isProcessAlive(payload.pid);

            if (isStale) {
                try {
                    unlinkSync(path);
                } catch {
                    // 可能正好被释放，继续重试
                }
                continue;
            }

            await sleep(wait);
            wait = Math.min(wait * 2, 500);
        }
    }

    throw new Error(`Failed to acquire index lock for ${projectDir} within ${timeoutMs}ms`);
}

/**
 * 原子写入文件：先写入临时文件，再重命名到目标路径。
 * 若重命名失败（如 Windows 目标被占用），则回退到覆盖写。
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
        writeFileSync(tmpPath, content, "utf-8");
        try {
            renameSync(tmpPath, filePath);
        } catch (renameErr) {
            const code = (renameErr as NodeJS.ErrnoException).code;
            if (code === "EPERM" || code === "EBUSY") {
                // Windows 等环境下目标文件可能被占用，直接覆盖
                writeFileSync(filePath, content, "utf-8");
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
        // 清理临时文件
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
