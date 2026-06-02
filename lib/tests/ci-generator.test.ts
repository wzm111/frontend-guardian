/**
 * CI 配置生成器测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
    generateCIConfig,
    detectCIProvider,
    type CIProvider,
} from "../src/utils/ci-generator.js";

describe("CI 配置生成器", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "fg-ci-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    describe("generateCIConfig — GitHub Actions", () => {
        it("应生成 GitHub Actions 工作流文件", () => {
            const result = generateCIConfig(tempDir, {
                provider: "github",
            });

            expect(result.created).toHaveLength(1);
            expect(result.created[0]).toContain(".github/workflows/frontend-guardian.yml");
            expect(existsSync(result.created[0])).toBe(true);
        });

        it("应包含正确的触发条件", () => {
            generateCIConfig(tempDir, { provider: "github" });
            const content = readFile(join(tempDir, ".github/workflows/frontend-guardian.yml"));

            expect(content).toContain("on:");
            expect(content).toContain("push:");
            expect(content).toContain("pull_request:");
            expect(content).toContain("branches: [main, master]");
        });

        it("应包含 PR 评论发布步骤", () => {
            generateCIConfig(tempDir, { provider: "github" });
            const content = readFile(join(tempDir, ".github/workflows/frontend-guardian.yml"));

            expect(content).toContain("Post PR Comment");
            expect(content).toContain("--post-comment");
            expect(content).toContain("secrets.GITHUB_TOKEN");
        });

        it("应包含 artifact 上传步骤", () => {
            generateCIConfig(tempDir, { provider: "github" });
            const content = readFile(join(tempDir, ".github/workflows/frontend-guardian.yml"));

            expect(content).toContain("upload-artifact@v4");
            expect(content).toContain("frontend-guardian-report");
        });

        it("应支持 pnpm 包管理器", () => {
            generateCIConfig(tempDir, {
                provider: "github",
                packageManager: "pnpm",
            });
            const content = readFile(join(tempDir, ".github/workflows/frontend-guardian.yml"));

            expect(content).toContain("pnpm/action-setup@v2");
            expect(content).toContain("cache: 'pnpm'");
        });

        it("应支持自定义 Node 版本", () => {
            generateCIConfig(tempDir, {
                provider: "github",
                nodeVersion: "18",
            });
            const content = readFile(join(tempDir, ".github/workflows/frontend-guardian.yml"));

            expect(content).toContain("node-version: '18'");
        });

        it("应支持额外扫描参数", () => {
            generateCIConfig(tempDir, {
                provider: "github",
                scanArgs: "--external --no-cache",
            });
            const content = readFile(join(tempDir, ".github/workflows/frontend-guardian.yml"));

            expect(content).toContain("--external --no-cache");
        });
    });

    describe("generateCIConfig — GitLab CI", () => {
        it("应生成 .gitlab-ci.yml 文件", () => {
            const result = generateCIConfig(tempDir, {
                provider: "gitlab",
            });

            expect(result.created).toHaveLength(1);
            expect(result.created[0]).toContain(".gitlab-ci.yml");
            expect(existsSync(result.created[0])).toBe(true);
        });

        it("应包含 stages 定义", () => {
            generateCIConfig(tempDir, { provider: "gitlab" });
            const content = readFile(join(tempDir, ".gitlab-ci.yml"));

            expect(content).toContain("stages:");
            expect(content).toContain("  - test");
        });

        it("应包含 rules 控制触发条件", () => {
            generateCIConfig(tempDir, { provider: "gitlab" });
            const content = readFile(join(tempDir, ".gitlab-ci.yml"));

            expect(content).toContain("rules:");
            expect(content).toContain('CI_PIPELINE_SOURCE == "merge_request_event"');
            expect(content).toContain("CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH");
        });

        it("应包含 cache 配置", () => {
            generateCIConfig(tempDir, { provider: "gitlab" });
            const content = readFile(join(tempDir, ".gitlab-ci.yml"));

            expect(content).toContain("cache:");
            expect(content).toContain("paths:");
            expect(content).toContain(".npm/");
        });

        it("应包含 lock file 缓存键", () => {
            generateCIConfig(tempDir, {
                provider: "gitlab",
                packageManager: "npm",
            });
            const content = readFile(join(tempDir, ".gitlab-ci.yml"));

            expect(content).toContain("package-lock.json");
        });

        it("yarn 应使用 yarn.lock 作为缓存键", () => {
            generateCIConfig(tempDir, {
                provider: "gitlab",
                packageManager: "yarn",
            });
            const content = readFile(join(tempDir, ".gitlab-ci.yml"));

            expect(content).toContain("yarn.lock");
            expect(content).toContain("yarn install --frozen-lockfile");
        });

        it("pnpm 应使用 pnpm-lock.yaml 作为缓存键", () => {
            generateCIConfig(tempDir, {
                provider: "gitlab",
                packageManager: "pnpm",
            });
            const content = readFile(join(tempDir, ".gitlab-ci.yml"));

            expect(content).toContain("pnpm-lock.yaml");
            expect(content).toContain("pnpm install --frozen-lockfile");
        });

        it("应包含 --post-comment 参数", () => {
            generateCIConfig(tempDir, { provider: "gitlab" });
            const content = readFile(join(tempDir, ".gitlab-ci.yml"));

            expect(content).toContain("--post-comment");
        });

        it("应包含 artifacts 配置", () => {
            generateCIConfig(tempDir, { provider: "gitlab" });
            const content = readFile(join(tempDir, ".gitlab-ci.yml"));

            expect(content).toContain("artifacts:");
            expect(content).toContain("paths:");
            expect(content).toContain("fg-report.md");
            expect(content).toContain("expire_in: 1 week");
        });

        it("应使用正确的 Node 镜像", () => {
            generateCIConfig(tempDir, {
                provider: "gitlab",
                nodeVersion: "18",
            });
            const content = readFile(join(tempDir, ".gitlab-ci.yml"));

            expect(content).toContain("image: node:18-alpine");
        });
    });

    describe("generateCIConfig — both", () => {
        it("应同时生成 GitHub 和 GitLab 配置", () => {
            const result = generateCIConfig(tempDir, {
                provider: "both",
            });

            expect(result.created).toHaveLength(2);
            expect(result.created.some((p) => p.includes(".github/workflows"))).toBe(true);
            expect(result.created.some((p) => p.includes(".gitlab-ci.yml"))).toBe(true);
        });
    });

    describe("detectCIProvider", () => {
        it("检测到 .gitlab-ci.yml 时应返回 gitlab", () => {
            writeFileSync(join(tempDir, ".gitlab-ci.yml"), "stages:\n  - test\n", "utf-8");
            expect(detectCIProvider(tempDir)).toBe("gitlab");
        });

        it("检测到 .github/workflows 时应返回 github", () => {
            mkdirSync(join(tempDir, ".github", "workflows"), { recursive: true });
            expect(detectCIProvider(tempDir)).toBe("github");
        });

        it("无现有配置时应默认返回 github", () => {
            expect(detectCIProvider(tempDir)).toBe("github");
        });

        it("应通过 git remote URL 检测 GitLab", () => {
            const gitDir = join(tempDir, ".git");
            mkdirSync(gitDir, { recursive: true });
            writeFileSync(join(gitDir, "config"), `[remote "origin"]\n\turl = https://gitlab.com/acme/project.git\n`, "utf-8");
            expect(detectCIProvider(tempDir)).toBe("gitlab");
        });

        it("应通过 git remote URL 检测 GitHub", () => {
            const gitDir = join(tempDir, ".git");
            mkdirSync(gitDir, { recursive: true });
            writeFileSync(join(gitDir, "config"), `[remote "origin"]\n\turl = https://github.com/acme/project.git\n`, "utf-8");
            expect(detectCIProvider(tempDir)).toBe("github");
        });
    });
});

function readFile(path: string): string {
    return readFileSync(path, "utf-8");
}
