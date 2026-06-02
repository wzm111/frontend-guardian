/**
 * PR/MR 评论发布器测试
 * v2.5.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    GitHubPRPublisher,
    GitLabMRPublisher,
    detectPublisherConfig,
    createPublisher,
} from "@/utils/pr-publisher.js";

describe("GitHubPRPublisher", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("发布新评论（无已有评论）", async () => {
        // 查找已有评论返回空
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => [],
        });
        // 创建新评论
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 123, html_url: "https://github.com/org/repo/issues/1#issuecomment-123" }),
        });

        const publisher = new GitHubPRPublisher({
            provider: "github",
            token: "gh-token",
            repository: "org/repo",
            prNumber: 1,
        });

        const result = await publisher.publish("test body");
        expect(result.success).toBe(true);
        expect(result.action).toBe("created");
        expect(result.commentUrl).toBe("https://github.com/org/repo/issues/1#issuecomment-123");

        // 验证调用参数
        const calls = fetchMock.mock.calls;
        expect(calls[0][0]).toContain("/issues/1/comments?per_page=100");
        expect(calls[1][0]).toContain("/issues/1/comments");
        expect(calls[1][1].method).toBe("POST");
    });

    it("更新已有评论", async () => {
        const existingComment = {
            id: 456,
            body: "<!-- frontend-guardian:scan-report -->\n旧内容",
        };

        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => [existingComment],
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 456, html_url: "https://github.com/org/repo/issues/1#issuecomment-456" }),
        });

        const publisher = new GitHubPRPublisher({
            provider: "github",
            token: "gh-token",
            repository: "org/repo",
            prNumber: 1,
        });

        const result = await publisher.publish("new body");
        expect(result.success).toBe(true);
        expect(result.action).toBe("updated");

        const calls = fetchMock.mock.calls;
        expect(calls[1][0]).toContain("/issues/comments/456");
        expect(calls[1][1].method).toBe("PATCH");
    });

    it("API 错误返回失败", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => [],
        });
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 401,
            text: async () => "Bad credentials",
        });

        const publisher = new GitHubPRPublisher({
            provider: "github",
            token: "bad-token",
            repository: "org/repo",
            prNumber: 1,
        });

        const result = await publisher.publish("test");
        expect(result.success).toBe(false);
        expect(result.error).toContain("401");
    });

    it("非法仓库格式抛出异常", () => {
        expect(() => {
            new GitHubPRPublisher({
                provider: "github",
                token: "token",
                repository: "invalid-format",
                prNumber: 1,
            });
        }).toThrow("Invalid GitHub repository format");
    });
});

describe("GitLabMRPublisher", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("发布新讨论（无已有讨论）", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => [],
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "abc", web_url: "https://gitlab.com/proj/-/merge_requests/1#note_abc" }),
        });

        const publisher = new GitLabMRPublisher({
            provider: "gitlab",
            token: "gl-token",
            repository: "group/project",
            prNumber: 1,
        });

        const result = await publisher.publish("test body");
        expect(result.success).toBe(true);
        expect(result.action).toBe("created");

        const calls = fetchMock.mock.calls;
        expect(calls[0][0]).toContain("/merge_requests/1/discussions?per_page=100");
        expect(calls[1][0]).toContain("/merge_requests/1/discussions");
        expect(calls[1][1].method).toBe("POST");
        expect(calls[1][1].headers["PRIVATE-TOKEN"]).toBe("gl-token");
    });

    it("更新已有讨论", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => [
                {
                    id: "disc-1",
                    notes: [{ body: "<!-- frontend-guardian:scan-report -->\n旧内容" }],
                },
            ],
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "disc-1", web_url: "https://gitlab.com/proj/-/merge_requests/1#note_disc-1" }),
        });

        const publisher = new GitLabMRPublisher({
            provider: "gitlab",
            token: "gl-token",
            repository: "group/project",
            prNumber: 1,
        });

        const result = await publisher.publish("new body");
        expect(result.success).toBe(true);
        expect(result.action).toBe("updated");

        const calls = fetchMock.mock.calls;
        expect(calls[1][0]).toContain("/discussions/disc-1");
        expect(calls[1][1].method).toBe("PUT");
    });

    it("project ID 支持数字格式", async () => {
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "xyz" }),
        });

        const publisher = new GitLabMRPublisher({
            provider: "gitlab",
            token: "gl-token",
            repository: "12345",
            prNumber: 1,
        });

        const result = await publisher.publish("test");
        expect(result.success).toBe(true);

        // 数字 ID 会被 encodeURIComponent，但不会改变
        const calls = fetchMock.mock.calls;
        expect(calls[0][0]).toContain("/projects/12345/");
    });
});

describe("detectPublisherConfig", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("检测 GitHub Actions 环境", () => {
        process.env.GITHUB_ACTIONS = "true";
        process.env.GITHUB_TOKEN = "gh-token";
        process.env.GITHUB_REPOSITORY = "owner/repo";
        process.env.GITHUB_REF_NAME = "42/merge";

        const config = detectPublisherConfig();
        expect(config).not.toBeNull();
        expect(config!.provider).toBe("github");
        expect(config!.token).toBe("gh-token");
        expect(config!.repository).toBe("owner/repo");
        expect(config!.prNumber).toBe(42);
    });

    it("检测 GitHub Actions（通过 GITHUB_REF）", () => {
        process.env.GITHUB_ACTIONS = "true";
        process.env.GITHUB_TOKEN = "gh-token";
        process.env.GITHUB_REPOSITORY = "owner/repo";
        process.env.GITHUB_REF = "refs/pull/7/merge";
        process.env.GITHUB_HEAD_REF = "feature-branch";
        process.env.GITHUB_REF_NAME = undefined;

        const config = detectPublisherConfig();
        expect(config).not.toBeNull();
        expect(config!.prNumber).toBe(7);
    });

    it("检测 GitLab CI 环境", () => {
        process.env.GITLAB_CI = "true";
        process.env.GITLAB_TOKEN = "gl-token";
        process.env.CI_PROJECT_ID = "123";
        process.env.CI_MERGE_REQUEST_IID = "5";

        const config = detectPublisherConfig();
        expect(config).not.toBeNull();
        expect(config!.provider).toBe("gitlab");
        expect(config!.token).toBe("gl-token");
        expect(config!.repository).toBe("123");
        expect(config!.prNumber).toBe(5);
    });

    it("GitLab 使用 CI_JOB_TOKEN 作为 fallback", () => {
        process.env.GITLAB_CI = "true";
        process.env.GITLAB_TOKEN = undefined;
        process.env.CI_JOB_TOKEN = "job-token";
        process.env.CI_PROJECT_ID = "123";
        process.env.CI_MERGE_REQUEST_IID = "5";

        const config = detectPublisherConfig();
        expect(config).not.toBeNull();
        expect(config!.token).toBe("job-token");
    });

    it("非 CI 环境返回 null", () => {
        delete process.env.GITHUB_ACTIONS;
        delete process.env.GITLAB_CI;

        const config = detectPublisherConfig();
        expect(config).toBeNull();
    });

    it("缺少 token 返回 null", () => {
        process.env.GITHUB_ACTIONS = "true";
        process.env.GITHUB_REPOSITORY = "owner/repo";
        process.env.GITHUB_REF_NAME = "42/merge";
        delete process.env.GITHUB_TOKEN;

        const config = detectPublisherConfig();
        expect(config).toBeNull();
    });
});

describe("createPublisher", () => {
    it("创建 GitHub 发布器", () => {
        const pub = createPublisher({
            provider: "github",
            token: "t",
            repository: "o/r",
            prNumber: 1,
        });
        expect(pub).toBeInstanceOf(GitHubPRPublisher);
    });

    it("创建 GitLab 发布器", () => {
        const pub = createPublisher({
            provider: "gitlab",
            token: "t",
            repository: "g/p",
            prNumber: 1,
        });
        expect(pub).toBeInstanceOf(GitLabMRPublisher);
    });

    it("未知 provider 抛出异常", () => {
        expect(() =>
            createPublisher({
                provider: "unknown" as any,
                token: "t",
                repository: "o/r",
                prNumber: 1,
            })
        ).toThrow("Unknown provider");
    });
});
