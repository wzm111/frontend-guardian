/**
 * PR/MR 评论发布器
 *
 * 支持 GitHub PR 和 GitLab MR 的评论发布/更新。
 * 通过评论中的隐藏标记识别已有评论，实现同一 PR 多次扫描不重复发评论。
 */

import { isGuardianComment } from "@/formatters/pr-comment.js";

/** 发布结果 */
export interface PublishResult {
    /** 是否成功 */
    success: boolean;
    /** 发布的评论 URL */
    commentUrl?: string;
    /** 操作类型: created | updated */
    action: "created" | "updated" | "none";
    /** 错误信息 */
    error?: string;
}

/** 发布器配置 */
export interface PublisherConfig {
    /** 平台类型 */
    provider: "github" | "gitlab";
    /** API Token */
    token: string;
    /** 仓库所有者/名称 (GitHub: owner/repo, GitLab: project path or ID) */
    repository: string;
    /** PR/MR 编号 */
    prNumber: number;
    /** API 基础 URL（用于自托管） */
    apiBaseUrl?: string;
}

/** PR/MR 评论发布器接口 */
export interface PRPublisher {
    publish(body: string): Promise<PublishResult>;
}

// ──────────────────────────────────────────────────────────────────────────
// GitHub PR 评论发布器
// ──────────────────────────────────────────────────────────────────────────

export class GitHubPRPublisher implements PRPublisher {
    private token: string;
    private owner: string;
    private repo: string;
    private prNumber: number;
    private apiBaseUrl: string;

    constructor(config: PublisherConfig) {
        const [owner, repo] = config.repository.split("/");
        if (!owner || !repo) {
            throw new Error(`Invalid GitHub repository format: ${config.repository} (expected: owner/repo)`);
        }
        this.token = config.token;
        this.owner = owner;
        this.repo = repo;
        this.prNumber = config.prNumber;
        this.apiBaseUrl = config.apiBaseUrl || "https://api.github.com";
    }

    async publish(body: string): Promise<PublishResult> {
        try {
            // 1. 查找已有的 guardian 评论
            const existingCommentId = await this.findExistingComment();

            if (existingCommentId) {
                // 更新已有评论
                const url = `${this.apiBaseUrl}/repos/${this.owner}/${this.repo}/issues/comments/${existingCommentId}`;
                const response = await fetch(url, {
                    method: "PATCH",
                    headers: this.headers(),
                    body: JSON.stringify({ body }),
                });

                if (!response.ok) {
                    const errText = await response.text().catch(() => "Unknown error");
                    return { success: false, action: "none", error: `GitHub API error (${response.status}): ${errText}` };
                }

                const data = await response.json() as { html_url: string };
                return { success: true, action: "updated", commentUrl: data.html_url };
            } else {
                // 创建新评论
                const url = `${this.apiBaseUrl}/repos/${this.owner}/${this.repo}/issues/${this.prNumber}/comments`;
                const response = await fetch(url, {
                    method: "POST",
                    headers: this.headers(),
                    body: JSON.stringify({ body }),
                });

                if (!response.ok) {
                    const errText = await response.text().catch(() => "Unknown error");
                    return { success: false, action: "none", error: `GitHub API error (${response.status}): ${errText}` };
                }

                const data = await response.json() as { html_url: string };
                return { success: true, action: "created", commentUrl: data.html_url };
            }
        } catch (err) {
            return { success: false, action: "none", error: String(err) };
        }
    }

    /** 查找已有的 frontend-guardian 评论 ID */
    private async findExistingComment(): Promise<number | null> {
        const url = `${this.apiBaseUrl}/repos/${this.owner}/${this.repo}/issues/${this.prNumber}/comments?per_page=100`;
        const response = await fetch(url, { headers: this.headers() });

        if (!response.ok) {
            return null;
        }

        const comments = await response.json() as Array<{ id: number; body: string }>;
        for (const comment of comments) {
            if (isGuardianComment(comment.body)) {
                return comment.id;
            }
        }
        return null;
    }

    private headers(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "frontend-guardian/2.5.0",
        };
    }
}

// ──────────────────────────────────────────────────────────────────────────
// GitLab MR 评论发布器
// ──────────────────────────────────────────────────────────────────────────

export class GitLabMRPublisher implements PRPublisher {
    private token: string;
    private projectId: string;
    private mrIid: number;
    private apiBaseUrl: string;

    constructor(config: PublisherConfig) {
        this.token = config.token;
        this.projectId = encodeURIComponent(config.repository);
        this.mrIid = config.prNumber;
        this.apiBaseUrl = config.apiBaseUrl || "https://gitlab.com";
    }

    async publish(body: string): Promise<PublishResult> {
        try {
            // 1. 查找已有的 guardian 评论
            const existingNoteId = await this.findExistingNote();

            if (existingNoteId) {
                // 更新已有 MR 讨论
                const url = `${this.apiBaseUrl}/api/v4/projects/${this.projectId}/merge_requests/${this.mrIid}/discussions/${existingNoteId}`;
                const response = await fetch(url, {
                    method: "PUT",
                    headers: this.headers(),
                    body: new URLSearchParams({ body }),
                });

                if (!response.ok) {
                    const errText = await response.text().catch(() => "Unknown error");
                    return { success: false, action: "none", error: `GitLab API error (${response.status}): ${errText}` };
                }

                const data = await response.json() as { web_url?: string };
                return { success: true, action: "updated", commentUrl: data.web_url };
            } else {
                // 创建新 MR 讨论（note）
                const url = `${this.apiBaseUrl}/api/v4/projects/${this.projectId}/merge_requests/${this.mrIid}/discussions`;
                const response = await fetch(url, {
                    method: "POST",
                    headers: this.headers(),
                    body: new URLSearchParams({ body }),
                });

                if (!response.ok) {
                    const errText = await response.text().catch(() => "Unknown error");
                    return { success: false, action: "none", error: `GitLab API error (${response.status}): ${errText}` };
                }

                const data = await response.json() as { web_url?: string };
                return { success: true, action: "created", commentUrl: data.web_url };
            }
        } catch (err) {
            return { success: false, action: "none", error: String(err) };
        }
    }

    /** 查找已有的 frontend-guardian MR 讨论 ID */
    private async findExistingNote(): Promise<string | null> {
        const url = `${this.apiBaseUrl}/api/v4/projects/${this.projectId}/merge_requests/${this.mrIid}/discussions?per_page=100`;
        const response = await fetch(url, { headers: this.headers() });

        if (!response.ok) {
            return null;
        }

        const discussions = await response.json() as Array<{
            id: string;
            notes: Array<{ body: string }>;
        }>;

        for (const discussion of discussions) {
            for (const note of discussion.notes) {
                if (isGuardianComment(note.body)) {
                    return discussion.id;
                }
            }
        }
        return null;
    }

    private headers(): Record<string, string> {
        return {
            "PRIVATE-TOKEN": this.token,
            "User-Agent": "frontend-guardian/2.5.0",
        };
    }
}

// ──────────────────────────────────────────────────────────────────────────
// 环境自动检测与工厂函数
// ──────────────────────────────────────────────────────────────────────────

/** 从环境变量自动推断发布器配置 */
export function detectPublisherConfig(): PublisherConfig | null {
    // GitHub Actions
    if (process.env.GITHUB_ACTIONS === "true") {
        const token = process.env.GITHUB_TOKEN;
        const repository = process.env.GITHUB_REPOSITORY;
        const prNumber = detectGitHubPRNumber();

        if (token && repository && prNumber) {
            return {
                provider: "github",
                token,
                repository,
                prNumber,
            };
        }
    }

    // GitLab CI
    if (process.env.GITLAB_CI === "true") {
        const token = process.env.GITLAB_TOKEN || process.env.CI_JOB_TOKEN;
        const projectId = process.env.CI_PROJECT_ID;
        const mrIid = process.env.CI_MERGE_REQUEST_IID;

        if (token && projectId && mrIid) {
            const apiBaseUrl = process.env.CI_API_V4_URL
                ? process.env.CI_API_V4_URL.replace("/api/v4", "")
                : undefined;
            return {
                provider: "gitlab",
                token,
                repository: projectId,
                prNumber: parseInt(mrIid, 10),
                apiBaseUrl,
            };
        }
    }

    return null;
}

/** 检测 GitHub PR 编号 */
function detectGitHubPRNumber(): number | null {
    // GITHUB_REF_NAME 在 PR 事件中为 "123/merge" 格式
    const refName = process.env.GITHUB_REF_NAME;
    if (refName) {
        const match = refName.match(/^(\d+)\/merge$/);
        if (match) {
            return parseInt(match[1], 10);
        }
    }

    // GITHUB_HEAD_REF 在 PR 事件中有值
    const headRef = process.env.GITHUB_HEAD_REF;
    if (headRef && process.env.GITHUB_REF) {
        // GITHUB_REF 通常是 refs/pull/123/merge
        const ref = process.env.GITHUB_REF;
        const match = ref.match(/refs\/pull\/(\d+)\/merge/);
        if (match) {
            return parseInt(match[1], 10);
        }
    }

    // 部分 runner 提供的专用变量
    if (process.env.PR_NUMBER) {
        return parseInt(process.env.PR_NUMBER, 10);
    }

    return null;
}

/** 创建发布器实例 */
export function createPublisher(config: PublisherConfig): PRPublisher {
    if (config.provider === "github") {
        return new GitHubPRPublisher(config);
    }
    if (config.provider === "gitlab") {
        return new GitLabMRPublisher(config);
    }
    throw new Error(`Unknown provider: ${config.provider}`);
}

/** 便捷函数：自动检测环境并发布评论 */
export async function autoPublishComment(body: string): Promise<PublishResult> {
    const config = detectPublisherConfig();
    if (!config) {
        return {
            success: false,
            action: "none",
            error:
                "无法自动检测 CI 环境。请确保在 GitHub Actions (GITHUB_TOKEN + GITHUB_REPOSITORY) " +
                "或 GitLab CI (GITLAB_TOKEN + CI_PROJECT_ID + CI_MERGE_REQUEST_IID) 中运行，或手动指定配置。",
        };
    }

    const publisher = createPublisher(config);
    return publisher.publish(body);
}
