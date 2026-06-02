/**
 * Fix Bot — 自动修复并提交 PR/MR
 * 类似 Dependabot，扫描后自动提交修复 PR
 *
 * Usage: fg-core . --fix --fix-bot
 */

import { execSync } from "node:child_process";
import { resolve } from "node:path";

export interface FixBotConfig {
    /** 平台: github | gitlab */
    provider: "github" | "gitlab";
    /** API Token */
    token: string;
    /** 目标分支（默认自动检测 main/master） */
    baseBranch?: string;
    /** 修复分支前缀（默认 fg-auto-fix） */
    branchPrefix?: string;
    /** PR 标题 */
    prTitle?: string;
    /** PR 描述 */
    prBody?: string;
}

export interface FixBotResult {
    success: boolean;
    branch?: string;
    prUrl?: string;
    prNumber?: number;
    error?: string;
}

/**
 * 检测 Fix Bot 配置（从环境变量）
 */
export function detectFixBotConfig(): FixBotConfig | null {
    const provider = process.env.FG_FIX_BOT_PROVIDER as "github" | "gitlab" | undefined;
    const token = process.env.FG_FIX_BOT_TOKEN;

    if (!provider || !token) return null;
    if (provider !== "github" && provider !== "gitlab") return null;

    return {
        provider,
        token,
        baseBranch: process.env.FG_FIX_BOT_BASE_BRANCH,
        branchPrefix: process.env.FG_FIX_BOT_BRANCH_PREFIX || "fg-auto-fix",
        prTitle: process.env.FG_FIX_BOT_PR_TITLE,
        prBody: process.env.FG_FIX_BOT_PR_BODY,
    };
}

/**
 * 自动修复 Bot：创建分支、提交修复、创建 PR
 */
export async function runFixBot(
    projectDir: string,
    filesModified: string[],
    config: FixBotConfig
): Promise<FixBotResult> {
    if (filesModified.length === 0) {
        return { success: false, error: "没有文件需要修复" };
    }

    // 检测是否在 git 仓库中
    let gitRoot: string;
    try {
        gitRoot = execSync("git rev-parse --show-toplevel", {
            cwd: projectDir,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "ignore"],
        }).trim();
    } catch {
        return { success: false, error: "未找到 Git 仓库" };
    }

    // 检测当前分支
    let currentBranch: string;
    try {
        currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
            cwd: gitRoot,
            encoding: "utf-8",
            stdio: "pipe",
        }).trim();
    } catch {
        return { success: false, error: "无法检测当前分支" };
    }

    // 检测目标分支
    const baseBranch = config.baseBranch || detectDefaultBranch(gitRoot);

    // 检查是否有未提交的更改
    try {
        const status = execSync("git status --porcelain", {
            cwd: gitRoot,
            encoding: "utf-8",
            stdio: "pipe",
        }).trim();
        if (status) {
            return { success: false, error: "工作区有未提交的更改，请先提交或暂存" };
        }
    } catch {
        // ignore
    }

    // 创建修复分支
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const branchName = `${config.branchPrefix || "fg-auto-fix"}/${timestamp}`;

    try {
        execSync(`git checkout -b ${branchName}`, { cwd: gitRoot, stdio: "pipe" });
    } catch (err: any) {
        return { success: false, error: `创建分支失败: ${err.message || err}` };
    }

    // 添加修改的文件
    try {
        for (const file of filesModified) {
            const relPath = resolve(gitRoot, file).replace(gitRoot + "/", "");
            execSync(`git add "${relPath}"`, { cwd: gitRoot, stdio: "pipe" });
        }
    } catch (err: any) {
        // 回滚分支
        try {
            execSync(`git checkout ${currentBranch}`, { cwd: gitRoot, stdio: "pipe" });
            execSync(`git branch -D ${branchName}`, { cwd: gitRoot, stdio: "pipe" });
        } catch {
            // ignore rollback error
        }
        return { success: false, error: `添加文件失败: ${err.message || err}` };
    }

    // 提交修复
    try {
        execSync('git commit -m "chore: auto-fix by frontend-guardian"', {
            cwd: gitRoot,
            stdio: "pipe",
        });
    } catch (err: any) {
        // 回滚分支
        try {
            execSync(`git reset --hard HEAD`, { cwd: gitRoot, stdio: "pipe" });
            execSync(`git checkout ${currentBranch}`, { cwd: gitRoot, stdio: "pipe" });
            execSync(`git branch -D ${branchName}`, { cwd: gitRoot, stdio: "pipe" });
        } catch {
            // ignore rollback error
        }
        return { success: false, error: `提交失败: ${err.message || err}` };
    }

    // 推送分支
    try {
        execSync(`git push -u origin ${branchName}`, { cwd: gitRoot, stdio: "pipe" });
    } catch (err: any) {
        return {
            success: false,
            error: `推送失败: ${err.message || err}`,
            branch: branchName,
        };
    }

    // 创建 PR
    let prUrl: string | undefined;
    let prNumber: number | undefined;

    try {
        const prResult = await createPR(gitRoot, branchName, baseBranch, config);
        prUrl = prResult.url;
        prNumber = prResult.number;
    } catch (err: any) {
        return {
            success: false,
            error: `创建 PR 失败: ${err.message || err}`,
            branch: branchName,
        };
    }

    // 切回原分支
    try {
        execSync(`git checkout ${currentBranch}`, { cwd: gitRoot, stdio: "pipe" });
    } catch {
        // ignore
    }

    return {
        success: true,
        branch: branchName,
        prUrl,
        prNumber,
    };
}

/**
 * 检测默认分支（main 或 master）
 */
function detectDefaultBranch(gitRoot: string): string {
    try {
        const branches = execSync("git branch -rl '*/HEAD'", {
            cwd: gitRoot,
            encoding: "utf-8",
            stdio: "pipe",
        }).trim();
        if (branches.includes("main")) return "main";
    } catch {
        // ignore
    }
    try {
        execSync("git show-ref --verify --quiet refs/heads/main", {
            cwd: gitRoot,
            stdio: "pipe",
        });
        return "main";
    } catch {
        return "master";
    }
}

/**
 * 创建 PR / MR
 */
async function createPR(
    gitRoot: string,
    headBranch: string,
    baseBranch: string,
    config: FixBotConfig
): Promise<{ url: string; number: number }> {
    const title =
        config.prTitle || `chore: auto-fix by frontend-guardian (${new Date().toLocaleDateString("zh-CN")})`;
    const body =
        config.prBody ||
        `🤖 此 PR 由 frontend-guardian 自动修复 Bot 生成。\n\n修复了代码质量问题，建议 review 后合并。`;

    // 获取远程 URL
    let remoteUrl: string;
    try {
        remoteUrl = execSync("git remote get-url origin", {
            cwd: gitRoot,
            encoding: "utf-8",
            stdio: "pipe",
        }).trim();
    } catch {
        throw new Error("无法获取远程仓库 URL");
    }

    if (config.provider === "github") {
        return createGitHubPR(remoteUrl, headBranch, baseBranch, title, body, config.token);
    } else {
        return createGitLabMR(remoteUrl, headBranch, baseBranch, title, body, config.token);
    }
}

/**
 * 通过 GitHub API 创建 PR
 */
async function createGitHubPR(
    remoteUrl: string,
    head: string,
    base: string,
    title: string,
    body: string,
    token: string
): Promise<{ url: string; number: number }> {
    // 解析 owner/repo
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (!match) {
        throw new Error(`无法解析 GitHub 仓库: ${remoteUrl}`);
    }
    const [, owner, repo] = match;

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
        method: "POST",
        headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, body, head, base }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`GitHub API ${response.status}: ${err}`);
    }

    const data = (await response.json()) as { html_url: string; number: number };
    return { url: data.html_url, number: data.number };
}

/**
 * 通过 GitLab API 创建 MR
 */
async function createGitLabMR(
    remoteUrl: string,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description: string,
    token: string
): Promise<{ url: string; number: number }> {
    // 解析 project path
    const match = remoteUrl.match(/gitlab\.com[:/](.+?)(?:\.git)?$/);
    if (!match) {
        throw new Error(`无法解析 GitLab 仓库: ${remoteUrl}`);
    }
    const projectPath = encodeURIComponent(match[1]);

    const response = await fetch(
        `https://gitlab.com/api/v4/projects/${projectPath}/merge_requests`,
        {
            method: "POST",
            headers: {
                "PRIVATE-TOKEN": token,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                source_branch: sourceBranch,
                target_branch: targetBranch,
                title,
                description,
            }),
        }
    );

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`GitLab API ${response.status}: ${err}`);
    }

    const data = (await response.json()) as { web_url: string; iid: number };
    return { url: data.web_url, number: data.iid };
}
