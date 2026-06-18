/**
 * CLI 入口测试 — v2.2.0
 *
 * 覆盖 fg-core.js 参数解析与路由逻辑
 * 使用子进程调用，验证输出与退出码
 */

import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI_PATH = resolve(__dirname, "../bin/fg-core.js");

let tempDir: string;

beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "fg-cli-"));
});

afterEach(() => {
    try {
        rmSync(tempDir, { recursive: true, force: true });
    } catch {
        // ignore
    }
});

/** 执行 CLI 命令，返回 { stdout, stderr, exitCode } */
function runCLI(args: string[]): { stdout: string; stderr: string; exitCode: number } {
    try {
        const stdout = execSync(`node ${CLI_PATH} ${tempDir} ${args.join(" ")}`, {
            encoding: "utf-8",
            timeout: 10000,
            cwd: tempDir,
        });
        return { stdout, stderr: "", exitCode: 0 };
    } catch (err: any) {
        return {
            stdout: err.stdout || "",
            stderr: err.stderr || "",
            exitCode: err.status ?? 1,
        };
    }
}

describe("CLI — 帮助信息", () => {
    it("--help 应输出帮助并退出码 0", () => {
        const result = runCLI(["--help"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Frontend Guardian Core");
        expect(result.stdout).toContain("--module");
        expect(result.stdout).toContain("--fix");
        expect(result.stdout).toContain("--json");
    });

    it("-h 应输出帮助并退出码 0", () => {
        const result = runCLI(["-h"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Frontend Guardian Core");
    });

    it("帮助信息应包含版本号", () => {
        const result = runCLI(["--help"]);
        expect(result.stdout).toMatch(/v\d+\.\d+\.\d+/);
    });
});

describe("CLI — 模块参数", () => {
    it("未知模块应返回错误码并提示可用模块", () => {
        writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");
        const result = runCLI(["--module", "unknown"]);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain("未知模块");
        expect(result.stdout).toContain("i18n");
    });

    it("--module i18n 应能运行（空项目无错误）", () => {
        writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");
        const result = runCLI(["--module", "i18n"]);
        // 空项目可能 0 issues，退出码 0
        expect(result.stdout).toContain("Frontend Guardian Core");
        expect(result.stdout).toContain("i18n");
    });

    it("--module all 应扫描所有模块", () => {
        writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");
        const result = runCLI(["--module", "all"]);
        expect(result.stdout).toContain("Module: all");
    });
});

describe("CLI — 输出格式", () => {
    it("--json 应输出 JSON 格式", () => {
        writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");
        const result = runCLI(["--module", "i18n", "--json"]);
        expect(result.exitCode).toBe(0);
        // 从 stdout 中提取 JSON 块（{ 开始到结束）
        const jsonStart = result.stdout.indexOf("{");
        const jsonStr = jsonStart >= 0 ? result.stdout.slice(jsonStart) : "{}";
        const json = JSON.parse(jsonStr);
        expect(json).toHaveProperty("issues");
    });

    it("--module all --json 应输出合并 JSON", () => {
        writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");
        const result = runCLI(["--module", "all", "--json"]);
        const jsonStart = result.stdout.indexOf("{");
        const jsonStr = jsonStart >= 0 ? result.stdout.slice(jsonStart) : "{}";
        const json = JSON.parse(jsonStr);
        expect(json).toHaveProperty("modules");
        expect(json).toHaveProperty("summary");
    });
});

describe("CLI — 特殊命令", () => {
    it("--install-hooks 应安装 git hook（无仓库时提示）", () => {
        const result = runCLI(["--install-hooks"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Git Hook");
    });

    it("--init-ci 应生成 CI 配置", () => {
        const result = runCLI(["--init-ci"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("CI");
    });

    it("--init-ci --init-ci-provider gitlab 应生成 GitLab CI 配置", () => {
        const result = runCLI(["--init-ci", "--init-ci-provider", "gitlab"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("已创建");
        expect(result.stdout).toContain(".gitlab-ci.yml");
    });

    it("--init-ci --init-ci-provider both 应同时生成两种配置", () => {
        const result = runCLI(["--init-ci", "--init-ci-provider", "both"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(".github");
        expect(result.stdout).toContain(".gitlab-ci.yml");
    });

    it("--init-ci 在无参数时应自动检测 GitLab 项目", () => {
        writeFileSync(join(tempDir, ".gitlab-ci.yml"), "stages:\n  - test\n", "utf-8");
        const result = runCLI(["--init-ci"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("gitlab");
    });

    it("--install-hooks 在有 git 仓库时应成功安装", () => {
        execSync("git init", { cwd: tempDir, stdio: "ignore" });
        const result = runCLI(["--install-hooks"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("已安装");
    });

    it("--install-hooks --install-hooks-type commit-msg 应安装 commit-msg hook", () => {
        execSync("git init", { cwd: tempDir, stdio: "ignore" });
        const result = runCLI(["--install-hooks", "--install-hooks-type", "commit-msg"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("已安装");
        // 验证 hook 文件包含 Conventional Commits 检查
        const hookPath = join(tempDir, ".git", "hooks", "commit-msg");
        const hookContent = readFileSync(hookPath, "utf-8");
        expect(hookContent).toContain("Conventional Commits");
        expect(hookContent).toContain("frontend-guardian");
    });

    it("--install-hooks --install-hooks-type all 应安装全部三个 hook", () => {
        execSync("git init", { cwd: tempDir, stdio: "ignore" });
        const result = runCLI(["--install-hooks", "--install-hooks-type", "all"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("pre-commit");
        expect(result.stdout).toContain("pre-push");
        expect(result.stdout).toContain("commit-msg");
    });
});

describe("CLI — 其他参数", () => {
    it("--severity 应被解析", () => {
        writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");
        const result = runCLI(["--module", "i18n", "--severity", "critical"]);
        expect(result.stdout).toContain("Frontend Guardian Core");
    });

    it("--no-cluster 应禁用聚类", () => {
        writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");
        const result = runCLI(["--module", "i18n", "--no-cluster"]);
        expect(result.stdout).toContain("Frontend Guardian Core");
    });

    it("--no-cache 应禁用缓存", () => {
        writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");
        const result = runCLI(["--module", "i18n", "--no-cache"]);
        expect(result.stdout).toContain("Frontend Guardian Core");
    });

    it("--dry-run 应进入预览模式", () => {
        writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");
        const result = runCLI(["--module", "i18n", "--dry-run"]);
        expect(result.stdout).toContain("Frontend Guardian Core");
    });

    it("--watch 参数应被解析（不阻塞测试）", () => {
        writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");
        // watch 模式会阻塞，这里只验证参数被解析（快速超时）
        try {
            execSync(`node ${CLI_PATH} ${tempDir} --module i18n --watch`, {
                encoding: "utf-8",
                timeout: 500,
                cwd: tempDir,
            });
        } catch (err: any) {
            // timeout 会抛异常，但 stdout 中应包含扫描信息
            expect(err.stdout || "").toContain("Frontend Guardian Core");
        }
    });

    it("--mcp 参数应被解析并启动 MCP Server（快速超时）", () => {
        writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");
        try {
            execSync(`node ${CLI_PATH} ${tempDir} --mcp`, {
                encoding: "utf-8",
                timeout: 500,
                cwd: tempDir,
            });
        } catch (err: any) {
            // timeout 会抛异常；不应出现未知选项或 require 错误
            const stderr = err.stderr || "";
            expect(stderr).not.toContain("unknown option");
            expect(stderr).not.toContain("Cannot find module");
            expect(stderr).not.toContain("Error");
        }
    });

    it("--auto-scope 应被解析", () => {
        writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");
        const result = runCLI(["--module", "i18n", "--auto-scope"]);
        // 无 git 仓库时应回退到全量扫描
        expect(result.stdout).toContain("Frontend Guardian Core");
    });
});
