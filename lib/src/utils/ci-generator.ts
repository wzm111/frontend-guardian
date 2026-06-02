/**
 * CI 配置自动生成工具
 * 一键生成 GitHub Actions / GitLab CI 配置文件
 */

import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export type CIProvider = "github" | "gitlab" | "both";

export interface CIGeneratorOptions {
    provider: CIProvider;
    /** Node.js 版本 */
    nodeVersion?: string;
    /** 包管理器 */
    packageManager?: "npm" | "yarn" | "pnpm";
    /** 是否运行测试 */
    runTests?: boolean;
    /** 是否上传报告为 artifact */
    uploadArtifact?: boolean;
    /** 扫描参数 */
    scanArgs?: string;
    /** 门禁配置 */
    gate?: boolean;
}

const GITHUB_ACTIONS_TEMPLATE = `name: Frontend Guardian

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
{{NODE_SETUP}}
{{INSTALL}}
{{TEST}}
      - name: 🛡️ Frontend Guardian Scan
        run: npx fg-core . --scan --gate --output fg-report.md{{ARGS}}
        continue-on-error: true

      - name: 📊 Upload Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: frontend-guardian-report
          path: fg-report.md

      - name: 🚪 Gate Check
        run: |
          if [ -f fg-report.md ]; then
            echo "报告已生成"
          fi
          # 如果扫描返回非 0 则失败
          npx fg-core . --scan --gate{{ARGS}}
`;

const GITLAB_CI_TEMPLATE = `frontend-guardian-scan:
  stage: test
  image: node:{{NODE_VERSION}}-alpine
  before_script:
{{INSTALL}}
  script:
    - npx fg-core . --scan --gate --output fg-report.md{{ARGS}}
  artifacts:
    when: always
    paths:
      - fg-report.md
    expire_in: 1 week
  allow_failure: false
`;

function renderNodeSetup(pm: string): string {
    if (pm === "pnpm") {
        return `      - uses: pnpm/action-setup@v2\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '{{NODE_VERSION}}'\n          cache: 'pnpm'`;
    }
    return `      - uses: actions/setup-node@v4\n        with:\n          node-version: '{{NODE_VERSION}}'\n          cache: '${pm}'`;
}

function renderInstall(pm: string): string {
    const cmds: Record<string, string> = {
        npm: "npm ci",
        yarn: "yarn install --frozen-lockfile",
        pnpm: "pnpm install --frozen-lockfile",
    };
    const cmd = cmds[pm] || cmds.npm;

    return `      - name: 📦 Install Dependencies\n        run: ${cmd}`;
}

function renderTest(runTests: boolean): string {
    if (!runTests) return "";
    return `      - name: 🧪 Run Tests\n        run: npm test\n`;
}

function renderGitlabInstall(pm: string): string {
    const cmds: Record<string, string> = {
        npm: "    - npm ci",
        yarn: "    - yarn install --frozen-lockfile",
        pnpm: "    - npm install -g pnpm\n    - pnpm install --frozen-lockfile",
    };
    return cmds[pm] || cmds.npm;
}

/**
 * 生成 CI 配置文件
 */
export function generateCIConfig(projectDir: string, options: CIGeneratorOptions): { created: string[] } {
    const created: string[] = [];
    const nodeVersion = options.nodeVersion || "20";
    const pm = options.packageManager || "npm";
    const args = options.scanArgs ? ` ${options.scanArgs}` : "";

    const providers = options.provider === "both" ? (["github", "gitlab"] as const) : [options.provider];

    for (const provider of providers) {
        if (provider === "github") {
            const workflowDir = resolve(projectDir, ".github", "workflows");
            if (!existsSync(workflowDir)) {
                mkdirSync(workflowDir, { recursive: true });
            }

            let content = GITHUB_ACTIONS_TEMPLATE;
            content = content.replace("{{NODE_SETUP}}", renderNodeSetup(pm));
            content = content.replace("{{INSTALL}}", renderInstall(pm));
            content = content.replace("{{TEST}}", renderTest(options.runTests ?? false));
            content = content.replace(/{{NODE_VERSION}}/g, nodeVersion);
            content = content.replace(/{{ARGS}}/g, args);

            const path = resolve(workflowDir, "frontend-guardian.yml");
            writeFileSync(path, content, "utf-8");
            created.push(path);
        }

        if (provider === "gitlab") {
            let content = GITLAB_CI_TEMPLATE;
            content = content.replace(/{{NODE_VERSION}}/g, nodeVersion);
            content = content.replace("{{INSTALL}}", renderGitlabInstall(pm));
            content = content.replace(/{{ARGS}}/g, args);

            const path = resolve(projectDir, ".gitlab-ci.yml");
            writeFileSync(path, content, "utf-8");
            created.push(path);
        }
    }

    return { created };
}
