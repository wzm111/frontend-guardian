#!/usr/bin/env node
/**
 * Frontend Guardian Core CLI
 * Usage: fg-core [options] <project-dir>
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import {
    AIFixSuggester,
    a11yRules,
    BaselineManager,
    buildNotificationPayload,
    CodeownersParser,
    compareHistoryReports,
    complianceReportToMarkdown,
    componentRules,
    createEngine,
    createPublisher,
    crossFileRules,
    detectAIConfig,
    detectCIProvider,
    detectDashboardConfig,
    detectE2EGaps,
    detectFixBotConfig,
    detectMonorepo,
    detectNotificationConfig,
    detectProjectMeta,
    detectPublisherConfig,
    detectUploadConfig,
    e2eRules,
    FileWatcher,
    findRouteFiles,
    formatAllAnnotations,
    formatE2EGapJson,
    formatE2EGapReport,
    formatHistoryCompare,
    formatHistoryCompareJson,
    formatPageHealthJson,
    formatPageHealthReport,
    formatWorkspaceJson,
    formatWorkspaceReport,
    generateCIConfig,
    generateComplianceReport,
    generateDashboard,
    generatePRComment,
    generateSarif,
    HistoryReport,
    hasGitHook,
    hooksRules,
    i18nRules,
    initConfig,
    installGitHooks,
    isGitHubActions,
    isPlaywrightAvailable,
    namingRules,
    ProjectIndexer,
    parseAllRoutes,
    performanceRules,
    platformRules,
    playwrightIntegration,
    runFixBot,
    runPageHealthCheck,
    SmartCache,
    saveComplianceReport,
    scanWorkspace,
    securityRules,
    sendNotifications,
    svelteRules,
    toScanResult,
    uninstallGitHooks,
    uploadPageHealthResult,
    uploadReport,
    uploadToDashboardServer,
    writeJobSummary,
} from "../dist/index.js";
import { runWatchMode } from "./watch-mode.js";

const MODULES = [
    "i18n",
    "performance",
    "a11y",
    "security",
    "naming",
    "cross-file",
    "component",
    "hooks",
    "platform",
    "svelte",
    "e2e",
];

const MODULE_RULES = {
    i18n: i18nRules,
    performance: performanceRules,
    a11y: a11yRules,
    security: securityRules,
    naming: namingRules,
    "cross-file": crossFileRules,
    component: componentRules,
    hooks: hooksRules,
    platform: platformRules,
    svelte: svelteRules,
    e2e: e2eRules,
};

function showHelp() {
    console.log(`
Frontend Guardian Core v3.8.0

Usage:
  fg-core <project-dir> [options]

Options:
  --scan               全量扫描（等价于 --module all）
  --module <name>      扫描模块: i18n | performance | a11y | security | naming | cross-file | component | hooks | platform | svelte | e2e | all
  --severity <level>   最低严重级别: critical | warning | suggestion (默认: suggestion)
  --files <pattern>    仅扫描匹配的文件
  --exclude <pattern>  排除匹配的文件
  --staged             仅扫描 git staged 文件
  --diff <range>       仅扫描 git diff 范围内的文件 (如 main...feature)
  --auto-scope         智能扫描范围：自动检测未提交/最近修改的文件
  --no-cluster         禁用 Issue 聚类
  --json               以 JSON 格式输出
  --fix                自动修复可修复的问题
  --dry-run            修复预览模式（展示 diff 不写入文件）
  --interactive        交互式修复（逐条确认，类似 git add -p）
  --skip-large-files-threshold <bytes>  大文件跳过阈值（默认 512000 = 500KB，0 表示不跳过）
  --format             修复后自动格式化代码（Biome/Prettier）
  --output <file>      将扫描报告写入指定文件（Markdown 格式）
  --external           运行外部工具集成 (ESLint / TypeScript / Stylelint)
  --watch              Watch 模式：文件变更自动增量扫描
  --no-cache           禁用智能缓存
  --config <file>      指定配置文件
  --install-hooks      安装 Git hook（默认 pre-commit，可用 --install-hooks-type 指定）
  --install-hooks-type <type>  hook 类型: pre-commit | pre-push | commit-msg | both | all (默认: pre-commit)
  --init-config        生成 .frontend-guardian.yml 配置文件
  --init-ci            生成 CI 配置文件 (自动检测平台，默认 GitHub Actions)
  --init-ci-provider <p>  CI 平台: github | gitlab | both (默认: 自动检测)
  --sarif <file>       输出 SARIF 格式报告到指定文件
  --github-actions     启用 GitHub Actions Annotation 输出
  --baseline <file>    Baseline 模式：仅报告新增问题
  --generate-baseline  生成 baseline 文件（需同时指定 --baseline）
  --post-comment       将扫描结果发布为 PR/MR 评论（自动检测 CI 环境）
  --pr-number <n>      指定 PR/MR 编号（配合 --post-comment）
  --comment-provider <p> 评论平台: github | gitlab（配合 --post-comment）
  --upload             上传报告到指定位置（需配置 FG_UPLOAD_PROVIDER 等环境变量）
  --save-report        保存完整扫描报告到 .frontend-guardian/history/
  --history            查看历史扫描记录
  --history-module <m> 历史记录按模块过滤（配合 --history）
  --history-limit <n>  历史记录显示条数限制（默认 20）
  --history-compare [c] [p] 对比历史报告：不指定则对比最近两次；指定一个则与该报告对比最近一次；指定两个则对比指定报告
  --generate-dashboard 生成团队趋势看板 HTML 页面
  --monorepo           启用 Monorepo 模式：自动检测 workspace 并扫描所有子包
  --workspace <name>   仅扫描指定 workspace 包（可多次使用，配合 --monorepo）
  --skip-package <name> 跳过指定 workspace 包（可多次使用，配合 --monorepo）
  --no-cross-deps      禁用跨包依赖分析（配合 --monorepo）
  --ai-fix             启用 AI 修复建议（需配置 FG_AI_API_KEY 环境变量）
  --ai-model <model>   指定 AI 模型（如 gpt-4o-mini / claude-3-5-sonnet，配合 --ai-fix）
  --team-baseline <url> 团队共享 baseline URL（支持远程加载，1小时缓存）
  --notify             扫描完成后发送 webhook 通知（需配置 notifications）
  --assign             通过 CODEOWNERS 为 issue 推断责任人
  --strategy <s>       扫描策略: strict | standard | loose (默认: standard)
  --compliance <file>  生成 SOC2/ISO27001 合规报告到指定文件
  --server <url>       扫描后上报到治理看板服务器
  --serve              扫描前启动本地看板服务（扫描完成后停止）
  --e2e-detect-gaps    检测 E2E 测试覆盖缺口（页面 + 接口）
  --e2e-run            运行 Playwright E2E 测试并输出治理报告
  --page-health        页面健康检查：遍历路由验证渲染、控制台错误、白屏
  --serve <cmd>        自动启动 dev server（配合 --page-health，如 "npm run dev"）
  --port <n>           dev server 端口（默认 5173，配合 --serve）
  --routes <list>      指定要检查的路由（逗号分隔，配合 --page-health）
  --base-url <url>     指定基础 URL（如 http://localhost:3000，配合 --page-health）
  --no-screenshot      禁用截图（配合 --page-health）
  --no-check-interactive  禁用交互元素检查（配合 --page-health）
  --update-baseline    更新基线截图（配合 --page-health）
  --page-health-concurrency <n>  页面健康检查并发数（默认 3，配合 --page-health）
  --build-index        建立项目索引（预索引文件结构、符号、路由）
  --watch-index        监听文件变更并自动同步索引
  --index-status       查看项目索引状态
  --mcp                启动 MCP Server（stdio，供 AI Agent 调用）
  --help, -h           显示帮助

Examples:
  fg-core ./my-project --module all
  fg-core ./my-project --module i18n
  fg-core ./my-project --module i18n --severity warning --json
  fg-core ./my-project --module performance --files "src/**/*.tsx"
  fg-core ./my-project --module all --fix --json
  fg-core ./my-project --module all --staged
  fg-core ./my-project --module all --diff main...feature
  fg-core ./my-project --install-hooks
  fg-core ./my-project --init-ci
`);
}

async function main() {
    const args = process.argv.slice(2);
    const projectDir = args.find((arg) => !arg.startsWith("-")) || process.cwd();

    const options = {
        projectDir,
        minSeverity: "suggestion",
        module: "i18n",
        json: false,
        fix: false,
        dryRun: false,
        configFile: undefined,
        files: undefined,
        exclude: undefined,
        staged: false,
        diffRange: undefined,
        cluster: true,
        external: false,
        watch: false,
        cache: true,
        format: false,
        interactive: false,
        skipLargeFilesThreshold: undefined,
        installHooks: false,
        installHooksType: "pre-commit",
        initConfig: false,
        initCi: false,
        initCiProvider: undefined,
        autoScope: false,
        sarif: undefined,
        githubActions: false,
        baseline: undefined,
        generateBaseline: false,
        postComment: false,
        prNumber: undefined,
        commentProvider: undefined,
        upload: false,
        output: undefined,
        fixBot: false,
        saveReport: false,
        history: false,
        historyModule: undefined,
        historyLimit: 20,
        historyCompare: false,
        historyCompareArgs: [],
        generateDashboard: false,
        monorepo: false,
        workspace: [],
        skipPackage: [],
        crossDeps: true,
        aiFix: false,
        aiModel: undefined,
        teamBaseline: undefined,
        notify: false,
        assign: false,
        strategy: "standard",
        compliance: undefined,
        server: undefined,
        serve: false,
        e2eDetectGaps: false,
        e2eRun: false,
        pageHealth: false,
        serveCommand: undefined,
        servePort: undefined,
        routes: undefined,
        baseUrl: undefined,
        screenshot: true,
        checkInteractive: true,
        pageHealthConcurrency: 3,
        updateBaseline: false,
        buildIndex: false,
        watchIndex: false,
        indexStatus: false,
        mcp: false,
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--scan":
                options.module = "all";
                break;
            case "--module":
                options.module = args[++i];
                break;
            case "--severity":
                options.minSeverity = args[++i];
                break;
            case "--files":
                options.files = args[++i].split(",");
                break;
            case "--exclude":
                options.exclude = args[++i].split(",");
                break;
            case "--config":
                options.configFile = args[++i];
                break;
            case "--diff":
                options.diffRange = args[++i];
                break;
            case "--auto-scope":
                options.autoScope = true;
                break;
            case "--json":
                options.json = true;
                break;
            case "--fix":
                options.fix = true;
                break;
            case "--staged":
                options.staged = true;
                break;
            case "--no-cluster":
                options.cluster = false;
                break;
            case "--external":
                options.external = true;
                break;
            case "--dry-run":
                options.dryRun = true;
                break;
            case "--watch":
                options.watch = true;
                break;
            case "--no-cache":
                options.cache = false;
                break;
            case "--format":
                options.format = true;
                break;
            case "--output":
                options.output = args[++i];
                break;
            case "--interactive":
                options.interactive = true;
                break;
            case "--skip-large-files-threshold":
                options.skipLargeFilesThreshold = parseInt(args[++i], 10);
                break;
            case "--install-hooks":
                options.installHooks = true;
                break;
            case "--install-hooks-type":
                options.installHooksType = args[++i];
                break;
            case "--init-config":
                options.initConfig = true;
                break;
            case "--init-ci":
                options.initCi = true;
                break;
            case "--init-ci-provider":
                options.initCiProvider = args[++i];
                break;
            case "--sarif":
                options.sarif = args[++i];
                break;
            case "--github-actions":
                options.githubActions = true;
                break;
            case "--baseline":
                options.baseline = args[++i];
                break;
            case "--generate-baseline":
                options.generateBaseline = true;
                break;
            case "--post-comment":
                options.postComment = true;
                break;
            case "--pr-number":
                options.prNumber = parseInt(args[++i], 10);
                break;
            case "--comment-provider":
                options.commentProvider = args[++i];
                break;
            case "--upload":
                options.upload = true;
                break;
            case "--fix-bot":
                options.fixBot = true;
                break;
            case "--save-report":
                options.saveReport = true;
                break;
            case "--history":
                options.history = true;
                break;
            case "--history-module":
                options.historyModule = args[++i];
                break;
            case "--history-limit":
                options.historyLimit = parseInt(args[++i], 10) || 20;
                break;
            case "--history-compare":
                options.historyCompare = true;
                // 收集后续非 -- 开头的参数作为对比报告引用
                while (i + 1 < args.length && !args[i + 1].startsWith("-")) {
                    options.historyCompareArgs.push(args[++i]);
                }
                break;
            case "--generate-dashboard":
                options.generateDashboard = true;
                break;
            case "--monorepo":
                options.monorepo = true;
                break;
            case "--workspace":
                options.workspace.push(args[++i]);
                break;
            case "--skip-package":
                options.skipPackage.push(args[++i]);
                break;
            case "--no-cross-deps":
                options.crossDeps = false;
                break;
            case "--ai-fix":
                options.aiFix = true;
                break;
            case "--ai-model":
                options.aiModel = args[++i];
                break;
            case "--team-baseline":
                options.teamBaseline = args[++i];
                break;
            case "--notify":
                options.notify = true;
                break;
            case "--assign":
                options.assign = true;
                break;
            case "--strategy":
                options.strategy = args[++i];
                break;
            case "--compliance":
                options.compliance = args[++i];
                break;
            case "--server":
                options.server = args[++i];
                break;
            case "--serve":
                options.serve = true;
                break;
            case "--e2e-detect-gaps":
                options.e2eDetectGaps = true;
                break;
            case "--e2e-run":
                options.e2eRun = true;
                break;
            case "--page-health":
                options.pageHealth = true;
                break;
            case "--serve":
                options.serveCommand = args[++i];
                break;
            case "--port":
                options.servePort = parseInt(args[++i], 10) || 5173;
                break;
            case "--routes":
                options.routes = args[++i].split(",");
                break;
            case "--base-url":
                options.baseUrl = args[++i];
                break;
            case "--no-screenshot":
                options.screenshot = false;
                break;
            case "--no-check-interactive":
                options.checkInteractive = false;
                break;
            case "--update-baseline":
                options.updateBaseline = true;
                break;
            case "--page-health-concurrency":
                options.pageHealthConcurrency = parseInt(args[++i], 10) || 3;
                break;
            case "--build-index":
                options.buildIndex = true;
                break;
            case "--watch-index":
                options.watchIndex = true;
                break;
            case "--index-status":
                options.indexStatus = true;
                break;
            case "--mcp":
                options.mcp = true;
                break;
            case "--help":
            case "-h":
                showHelp();
                process.exit(0);
        }
    }

    // v3.8.0: 启动 MCP Server（AI Agent 集成）
    if (options.mcp) {
        const { runMCPServer } = await import("../dist/index.js");
        runMCPServer({
            projectDir: options.projectDir,
            configFile: options.configFile,
            minSeverity: options.minSeverity,
        });
        return;
    }

    // v3.6.0: E2E 测试覆盖缺口检测
    if (options.e2eDetectGaps) {
        const gapResult = detectE2EGaps({ projectDir: options.projectDir });
        if (options.json) {
            console.log(JSON.stringify(formatE2EGapJson(gapResult), null, 2));
        } else {
            console.log(formatE2EGapReport(gapResult));
        }
        process.exit(gapResult.uncoveredPages.length + gapResult.uncoveredApis.length > 0 ? 1 : 0);
    }

    // v3.6.1: 运行 Playwright E2E 测试
    if (options.e2eRun) {
        if (!playwrightIntegration.isAvailable(options.projectDir)) {
            console.log(pc.yellow("⚠️  未检测到 Playwright 配置（playwright.config.ts/js）或 playwright 包未安装"));
            console.log(pc.gray("   请先安装 Playwright: npm install -D @playwright/test"));
            console.log(pc.gray("   或初始化配置: npx playwright init"));
            process.exit(1);
        }

        console.log(pc.cyan("🎭 正在运行 Playwright E2E 测试..."));
        console.log(pc.gray("   这可能需要几分钟（取决于测试数量和浏览器启动时间）"));
        console.log("");

        const start = Date.now();
        const issues = playwrightIntegration.run(options.projectDir);
        const duration = Date.now() - start;

        if (options.json) {
            console.log(
                JSON.stringify(
                    {
                        tool: "Playwright",
                        total: issues.length,
                        duration,
                        issues,
                    },
                    null,
                    2
                )
            );
        } else {
            console.log(pc.cyan(`📊 Playwright 测试结果`));
            console.log(pc.gray(`   耗时: ${duration}ms`));
            if (issues.length === 0) {
                console.log(pc.green(`   ✅ 所有测试通过`));
            } else {
                console.log(pc.red(`   ❌ ${issues.length} 个测试失败`));
                for (const issue of issues) {
                    const severityColor = issue.severity === "critical" ? pc.red : pc.yellow;
                    console.log(severityColor(`      [${issue.severity.toUpperCase()}] ${issue.title}`));
                    console.log(pc.gray(`         ${issue.file}:${issue.line}`));
                    if (issue.description) {
                        const descLines = issue.description.split("\n").slice(0, 3);
                        for (const dl of descLines) {
                            console.log(pc.gray(`         ${dl}`));
                        }
                    }
                }
            }
        }

        process.exit(issues.length > 0 ? 1 : 0);
    }

    // v3.7.1: 页面健康检查
    if (options.pageHealth) {
        if (!isPlaywrightAvailable()) {
            console.log(pc.yellow("⚠️  未检测到 Playwright。页面健康检查需要 Playwright 支持。"));
            console.log(pc.gray("   安装: npm install -D playwright"));
            console.log(pc.gray("   安装浏览器: npx playwright install chromium"));
            process.exit(1);
        }

        if (!options.baseUrl && !options.serveCommand) {
            console.log(pc.yellow("⚠️  请指定 --base-url 或 --serve"));
            console.log(pc.gray('   示例: fg-core . --page-health --serve "npm run dev" --port 5173'));
            console.log(pc.gray("   示例: fg-core . --page-health --base-url http://localhost:3000"));
            process.exit(1);
        }

        console.log(pc.cyan("🌐 正在执行页面健康检查..."));
        if (options.serveCommand) {
            console.log(pc.gray(`   启动 dev server: ${options.serveCommand}`));
        }
        console.log(pc.gray(`   基础 URL: ${options.baseUrl || `http://localhost:${options.servePort || 5173}`}`));
        console.log("");

        try {
            const result = await runPageHealthCheck({
                projectDir: options.projectDir,
                routes: options.routes,
                baseUrl: options.baseUrl,
                serveCommand: options.serveCommand,
                servePort: options.servePort,
                screenshot: options.screenshot,
                concurrency: options.pageHealthConcurrency,
                checkInteractive: options.checkInteractive,
                updateBaseline: options.updateBaseline,
            });

            if (options.json) {
                console.log(JSON.stringify(formatPageHealthJson(result), null, 2));
            } else {
                console.log(formatPageHealthReport(result));
                console.log("");

                if (result.issues.length > 0) {
                    console.log(pc.cyan(`📋 发现 ${result.issues.length} 个问题:`));
                    for (const issue of result.issues) {
                        const color =
                            issue.severity === "critical" ? pc.red : issue.severity === "warning" ? pc.yellow : pc.blue;
                        console.log(color(`   [${issue.severity.toUpperCase()}] ${issue.title}`));
                        console.log(pc.gray(`      ${issue.description.split("\n")[0]}`));
                    }
                } else {
                    console.log(pc.green("✅ 所有页面检查通过"));
                }
            }

            // v3.7.2: 上报到治理看板服务器
            if (options.server) {
                const dashboardConfig = {
                    serverUrl: options.server,
                    authToken: process.env.FG_DASHBOARD_TOKEN,
                };
                if (!options.json) {
                    console.log(pc.gray(`\n   正在上报到看板服务器: ${options.server}`));
                }
                const uploadResult = await uploadPageHealthResult(result, options.projectDir, dashboardConfig);
                if (!options.json) {
                    if (uploadResult.success) {
                        console.log(pc.green(`   ✅ 已上报到看板服务器`));
                    } else {
                        console.log(pc.yellow(`   ⚠️  看板上报失败: ${uploadResult.error}`));
                    }
                }
            }

            const hasError = result.issues.some((i) => i.severity === "critical");
            process.exit(hasError ? 1 : 0);
        } catch (err) {
            console.error(pc.red("❌ 页面健康检查失败:"), err instanceof Error ? err.message : String(err));
            process.exit(1);
        }
    }

    // v3.7.0: 索引状态查看
    if (options.indexStatus) {
        const indexer = new ProjectIndexer(options.projectDir);
        const stats = indexer.getStats();
        const valid = indexer.isValid();

        console.log(pc.cyan("📦 项目索引状态"));
        console.log(pc.gray(`   索引有效: ${valid ? pc.green("是") : pc.yellow("否（请运行 --build-index）")}`));
        console.log(pc.gray(`   索引文件数: ${stats.files}`));
        console.log(pc.gray(`   路由数: ${stats.routes}`));
        console.log(pc.gray(`   符号数: ${stats.symbols}`));

        if (valid && stats.routes > 0) {
            const routes = indexer.getRoutes();
            console.log(pc.cyan("\n🗺️  检测到的路由:"));
            for (const route of routes.slice(0, 20)) {
                console.log(pc.gray(`   ${route.path} → ${route.file} (${route.framework})`));
            }
            if (routes.length > 20) {
                console.log(pc.gray(`   ... 还有 ${routes.length - 20} 条路由`));
            }
        }

        process.exit(0);
    }

    // v3.7.0: 建立项目索引
    if (options.buildIndex) {
        console.log(pc.cyan("📦 正在建立项目索引..."));
        const indexer = new ProjectIndexer(options.projectDir);

        const { globbySync } = require("globby");
        const patterns = ["**/*.{js,ts,jsx,tsx,vue}"];
        const exclude = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**", "**/coverage/**"];
        const files = globbySync(patterns, {
            cwd: options.projectDir,
            ignore: exclude,
            absolute: true,
        });

        console.log(pc.gray(`   发现 ${files.length} 个源文件`));
        await indexer.buildIndex(files);

        const stats = indexer.getStats();
        console.log(pc.green(`   ✅ 索引建立完成`));
        console.log(pc.gray(`   文件: ${stats.files} | 路由: ${stats.routes} | 符号: ${stats.symbols}`));

        process.exit(0);
    }

    // v3.7.0: 监听文件变更并自动同步索引
    if (options.watchIndex) {
        console.log(pc.cyan("👁️  启动文件监听（索引自动同步）..."));
        console.log(pc.gray("   按 Ctrl+C 停止"));

        const watcher = new FileWatcher({
            projectDir: options.projectDir,
            onChange: (changed, deleted) => {
                if (changed.length > 0) {
                    console.log(
                        pc.cyan(`\n📝 变更: ${changed.map((f) => relative(options.projectDir, f)).join(", ")}`)
                    );
                }
                if (deleted.length > 0) {
                    console.log(
                        pc.yellow(`\n🗑️  删除: ${deleted.map((f) => relative(options.projectDir, f)).join(", ")}`)
                    );
                }
            },
            onIndexUpdate: (stats) => {
                console.log(
                    pc.gray(`   索引已更新 | 文件: ${stats.files} | 路由: ${stats.routes} | 符号: ${stats.symbols}`)
                );
            },
            onError: (err) => {
                console.error(pc.red(`   监听错误: ${err.message}`));
            },
        });

        await watcher.start();

        // 保持进程运行
        process.on("SIGINT", () => {
            console.log(pc.gray("\n\n👋 停止监听..."));
            watcher.stop();
            process.exit(0);
        });

        process.on("SIGTERM", () => {
            watcher.stop();
            process.exit(0);
        });

        // 阻塞主线程
        await new Promise(() => {});
    }

    // Phase 6: 特殊命令处理
    if (options.installHooks) {
        const hookType = ["pre-commit", "pre-push", "commit-msg", "both", "all"].includes(options.installHooksType)
            ? options.installHooksType
            : "pre-commit";
        const result = installGitHooks(options.projectDir, {
            type: hookType,
            autoFix: false,
            cache: true,
        });
        console.log(pc.cyan("🔧 Git Hook 安装结果"));
        for (const h of result.installed) {
            console.log(pc.green(`   ✅ 已安装: ${h}`));
        }
        for (const h of result.skipped) {
            console.log(pc.yellow(`   ⚠️  跳过: ${h}`));
        }
        if (result.installed.length === 0 && result.skipped.length === 0) {
            console.log(pc.gray("   未找到 Git 仓库"));
        }
        process.exit(0);
    }

    if (options.initConfig) {
        const meta = detectProjectMeta(options.projectDir);
        const result = initConfig(options.projectDir, meta, false);
        console.log(pc.cyan("🔧 配置初始化"));
        if (result.existed) {
            console.log(pc.yellow(`   ⚠️  配置文件已存在: ${result.path}`));
            console.log(pc.gray("   使用 --init-config --force 覆盖（或使用 --init-config 直接覆盖）"));
        } else if (result.created) {
            console.log(pc.green(`   ✅ 已创建: ${result.path}`));
            console.log(
                pc.gray(`   框架: ${meta.framework ?? "auto-detect"} | 组件库: ${meta.componentLib ?? "auto-detect"}`)
            );
        }
        process.exit(0);
    }

    if (options.initCi) {
        let provider = options.initCiProvider;
        if (!provider) {
            provider = detectCIProvider(options.projectDir);
            console.log(pc.gray(`   自动检测到 CI 平台: ${provider}`));
        }
        const result = generateCIConfig(options.projectDir, {
            provider,
            runTests: true,
            gate: true,
        });
        console.log(pc.cyan("🔧 CI 配置生成结果"));
        for (const f of result.created) {
            console.log(pc.green(`   ✅ 已创建: ${f}`));
        }
        if (result.created.length === 0) {
            console.log(pc.gray("   未生成配置文件"));
        }
        process.exit(0);
    }

    // v2.8.0: 历史报告查询
    if (options.history) {
        const hr = new HistoryReport(options.projectDir);
        const reports = hr.listReports();
        let filtered = reports;
        if (options.historyModule) {
            filtered = reports.filter((r) => r.module === options.historyModule);
        }
        filtered = filtered.slice(0, options.historyLimit);

        console.log(pc.cyan("📜 历史扫描记录"));
        if (filtered.length === 0) {
            console.log(pc.gray("   暂无历史记录"));
        } else {
            console.log(
                `   ${"时间".padEnd(20)} ${"模块".padEnd(15)} ${"C".padStart(4)} ${"W".padStart(4)} ${"S".padStart(4)}`
            );
            console.log(pc.gray("   " + "-".repeat(50)));
            for (const r of filtered) {
                const time = new Date(r.timestamp).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                });
                const c = pc.red(String(r.counts.critical).padStart(4));
                const w = pc.yellow(String(r.counts.warning).padStart(4));
                const s = pc.blue(String(r.counts.suggestion).padStart(4));
                console.log(`   ${time.padEnd(20)} ${r.module.padEnd(15)} ${c} ${w} ${s}`);
            }
            console.log(
                pc.gray(
                    `   共 ${reports.length} 条记录` +
                        (options.historyModule ? `，已按模块 "${options.historyModule}" 过滤` : "")
                )
            );
        }
        process.exit(0);
    }

    // v3.1.0: 历史报告对比
    if (options.historyCompare) {
        const [currentRef, previousRef] = options.historyCompareArgs;
        const result = compareHistoryReports({
            projectDir: options.projectDir,
            current: currentRef,
            previous: previousRef,
        });

        if (!result) {
            console.log(pc.yellow("⚠️  暂无历史报告可供对比。请先运行 --save-report 生成历史数据。"));
            process.exit(1);
        }

        if (options.json) {
            console.log(JSON.stringify(formatHistoryCompareJson(result), null, 2));
        } else {
            console.log(formatHistoryCompare(result));
        }
        process.exit(0);
    }

    // v2.8.0: 生成趋势看板
    if (options.generateDashboard) {
        const hr = new HistoryReport(options.projectDir);
        const reportList = hr.listReports();
        if (reportList.length === 0) {
            console.log(pc.yellow("⚠️  暂无历史扫描记录，无法生成看板。请先运行 --save-report 生成历史数据。"));
            process.exit(1);
        }
        const fullReports = reportList.map((r) => hr.loadReport(r.filename)).filter(Boolean);
        const outputPath = generateDashboard(fullReports, { projectDir: options.projectDir });
        console.log(pc.cyan("📊 趋势看板已生成"));
        console.log(pc.green(`   ✅ ${outputPath}`));
        console.log(pc.gray(`   共 ${fullReports.length} 次扫描记录`));
        console.log(pc.gray("   在浏览器中打开即可查看"));
        process.exit(0);
    }

    // v2.9.0: Monorepo 模式
    if (options.monorepo) {
        const mono = detectMonorepo(options.projectDir);
        if (!mono.isMonorepo) {
            console.log(
                pc.yellow(
                    `⚠️  未检测到 monorepo workspace 配置（pnpm-workspace.yaml / lerna.json / nx.json / package.json workspaces）`
                )
            );
            console.log(pc.gray(`   将在项目根目录执行常规扫描...`));
            if (options.module === "all") {
                await runAllModules(options);
            } else {
                await runSingleModule(options);
            }
            return;
        }

        if (!options.json) {
            console.log(pc.cyan("📦 Monorepo Workspace 模式"));
            console.log(pc.gray(`   工具: ${mono.tool}`));
            console.log(pc.gray(`   发现 ${mono.packages.length} 个子包`));
            if (options.workspace.length > 0) {
                console.log(pc.gray(`   仅扫描: ${options.workspace.join(", ")}`));
            }
            if (options.skipPackage.length > 0) {
                console.log(pc.gray(`   跳过: ${options.skipPackage.join(", ")}`));
            }
            console.log("");
        }

        const workspaceResult = await scanWorkspace({
            projectDir: options.projectDir,
            module: options.module === "all" ? undefined : options.module,
            minSeverity: options.minSeverity,
            noCluster: !options.cluster,
            external: options.external,
            cache: options.cache,
            configFile: options.configFile,
            files: options.files,
            exclude: options.exclude,
            skipLargeFilesThreshold: options.skipLargeFilesThreshold,
            analyzeCrossDeps: options.crossDeps,
            onlyPackages: options.workspace.length > 0 ? options.workspace : undefined,
            skipPackages: options.skipPackage.length > 0 ? options.skipPackage : undefined,
        });

        if (options.json) {
            console.log(JSON.stringify(formatWorkspaceJson(workspaceResult), null, 2));
            process.exit(workspaceResult.summary.issuesBySeverity.critical > 0 ? 1 : 0);
        }

        console.log(formatWorkspaceReport(workspaceResult));

        // 详细输出各包的 issues
        for (const pr of workspaceResult.packageResults) {
            if (!pr.success || pr.result.total === 0) continue;

            console.log(pc.cyan(`\n📦 ${pr.package.name} (${pr.package.path})`));
            const allIssues = [
                ...pr.result.issues.critical,
                ...pr.result.issues.warning,
                ...pr.result.issues.suggestion,
            ];
            for (const issue of allIssues) {
                printIssue(
                    issue,
                    issue.severity === "critical" ? pc.red : issue.severity === "warning" ? pc.yellow : pc.blue
                );
            }
        }

        console.log(
            pc.gray(
                `\n⏱️  总耗时: ${workspaceResult.summary.totalDuration}ms | 扫描 ${workspaceResult.summary.totalFilesScanned} 个文件`
            )
        );

        if (workspaceResult.summary.issuesBySeverity.critical > 0) {
            process.exit(1);
        }
        return;
    }

    if (options.watch) {
        const scanFn = options.module === "all" ? runAllModules : runSingleModule;
        // v2.6.0: Watch 模式复用 SmartCache，实现缓存预热
        const cacheInstance = options.cache !== false ? new SmartCache(options.projectDir) : undefined;
        await runWatchMode(options, scanFn, cacheInstance);
    } else if (options.module === "all") {
        await runAllModules(options);
    } else {
        await runSingleModule(options);
    }
}

async function runAllModules(options, cacheInstance) {
    console.log(pc.cyan("🛡️  Frontend Guardian Core"));
    console.log(pc.gray(`   Project: ${options.projectDir}`));
    console.log(pc.gray(`   Module: all (9 modules)`));
    if (options.staged) {
        console.log(pc.gray(`   Mode: staged (git cached only)`));
    } else if (options.diffRange) {
        console.log(pc.gray(`   Diff: ${options.diffRange}`));
    } else if (options.autoScope) {
        console.log(pc.gray(`   Mode: auto-scope (智能扫描范围)`));
    }
    console.log("");

    const engine = createEngine({
        projectDir: options.projectDir,
        minSeverity: options.minSeverity,
        files: options.files,
        exclude: options.exclude,
        configFile: options.configFile,
        staged: options.staged,
        diffRange: options.diffRange,
        autoScope: options.autoScope,
        external: options.external,
        cache: options.cache,
        cacheInstance,
        dryRun: options.dryRun,
        interactive: options.interactive,
        skipLargeFilesThreshold: options.skipLargeFilesThreshold,
        strategy: options.strategy,
    });

    // 注册所有模块的规则
    for (const rules of Object.values(MODULE_RULES)) {
        engine.registerAll(rules);
    }

    const allResults = {};
    let totalCritical = 0;
    let totalWarning = 0;
    let totalSuggestion = 0;
    let totalDuration = 0;
    let totalFilesScanned = 0;
    let totalFilesWithIssues = 0;
    const allFixableIssues = [];

    // Phase 4: 外部工具集成
    let externalResults = [];
    if (options.external) {
        externalResults = engine.runExternal();
        for (const er of externalResults) {
            for (const issue of er.issues) {
                totalCritical += issue.severity === "critical" ? 1 : 0;
                totalWarning += issue.severity === "warning" ? 1 : 0;
                totalSuggestion += issue.severity === "suggestion" ? 1 : 0;
                totalFilesWithIssues += 1;
            }
            totalDuration += er.duration;
        }
    }

    for (const mod of MODULES) {
        try {
            let result = await engine.scan(mod);

            // Issue 聚类
            if (options.cluster) {
                result = {
                    ...result,
                    issues: {
                        critical: engine.clusterIssues(result.issues.critical),
                        warning: engine.clusterIssues(result.issues.warning),
                        suggestion: engine.clusterIssues(result.issues.suggestion),
                    },
                    total:
                        engine.clusterIssues(result.issues.critical).length +
                        engine.clusterIssues(result.issues.warning).length +
                        engine.clusterIssues(result.issues.suggestion).length,
                };
            }

            allResults[mod] = result;
            totalCritical += result.issues.critical.length;
            totalWarning += result.issues.warning.length;
            totalSuggestion += result.issues.suggestion.length;
            totalDuration += result.duration;
            totalFilesScanned = Math.max(totalFilesScanned, result.filesScanned);
            if (result.filesWithIssues > 0) {
                totalFilesWithIssues += result.filesWithIssues;
            }

            if (options.fix) {
                const moduleIssues = [...result.issues.critical, ...result.issues.warning, ...result.issues.suggestion];
                allFixableIssues.push(...moduleIssues.filter((i) => i.fix));
            }
        } catch (err) {
            console.error(pc.red(`  ❌ [${mod}] 扫描失败:`), err.message || err);
        }
    }

    // 自动修复 / 修复预览
    let fixResult = null;
    if ((options.fix || options.dryRun) && allFixableIssues.length > 0) {
        if (!options.json) {
            if (options.dryRun) {
                console.log(pc.cyan("🔍 修复预览（dry-run 模式，不会修改文件）："));
            } else {
                console.log(pc.cyan("🔧 正在应用自动修复..."));
            }
        }
        fixResult = engine.applyFixes(allFixableIssues);
        if (!options.json) {
            if (options.dryRun && fixResult.previews) {
                for (const preview of fixResult.previews) {
                    console.log(pc.cyan(`\n  📄 ${preview.file}`));
                    console.log(pc.yellow(`     ${preview.title}`));
                    console.log(preview.diff);
                }
                console.log(pc.blue(`\n   💡 共 ${fixResult.previews.length} 处可修复（使用 --fix 应用）`));
            } else if (fixResult.filesModified.length > 0) {
                console.log(
                    pc.green(`   ✅ 已修复 ${fixResult.fixedCount} 个问题（${fixResult.filesModified.length} 个文件）`)
                );
                for (const f of fixResult.filesModified) {
                    console.log(pc.gray(`      - ${f}`));
                }
                if (fixResult.skippedByUser && fixResult.skippedByUser > 0) {
                    console.log(pc.yellow(`   ⏭️  跳过 ${fixResult.skippedByUser} 个问题（低置信度或用户选择）`));
                }
            } else {
                console.log(pc.yellow("   ⚠️ 未应用任何修复"));
            }
            if (fixResult.errors.length > 0) {
                for (const err of fixResult.errors) {
                    console.log(pc.red(`   ❌ ${err}`));
                }
            }
            console.log("");
        }
    }

    // 格式化（--format）
    let formatResult = null;
    if (options.format && !options.dryRun) {
        const filesToFormat = options.fix && fixResult?.filesModified ? fixResult.filesModified : undefined;
        if (!options.json) {
            console.log(pc.cyan("🎨 正在格式化代码..."));
        }
        formatResult = engine.format(filesToFormat);
        if (!options.json) {
            if (formatResult.formatted > 0) {
                console.log(pc.green(`   ✅ ${formatResult.formatter} 已格式化 ${formatResult.formatted} 个文件`));
            } else if (formatResult.errors.length === 0) {
                console.log(pc.gray("   所有文件已是最优格式"));
            }
            if (formatResult.errors.length > 0) {
                for (const err of formatResult.errors) {
                    console.log(pc.red(`   ❌ ${err}`));
                }
            }
            console.log("");
        }
    }

    // v2.6.0: 自动修复 Bot
    if (options.fixBot && fixResult?.filesModified?.length > 0) {
        const botConfig = detectFixBotConfig();
        if (botConfig) {
            if (!options.json) {
                console.log(pc.cyan("🤖 正在创建修复 PR..."));
            }
            const botResult = await runFixBot(options.projectDir, fixResult.filesModified, botConfig);
            if (!options.json) {
                if (botResult.success) {
                    console.log(pc.green(`   ✅ 修复 PR 已创建`));
                    console.log(pc.gray(`   分支: ${botResult.branch}`));
                    if (botResult.prUrl) {
                        console.log(pc.gray(`   ${botResult.prUrl}`));
                    }
                } else {
                    console.log(pc.red(`   ❌ Fix Bot 失败: ${botResult.error}`));
                }
                console.log("");
            }
        } else {
            if (!options.json) {
                console.log(
                    pc.yellow("   ⚠️ 未检测到 Fix Bot 配置。请设置 FG_FIX_BOT_PROVIDER 和 FG_FIX_BOT_TOKEN 环境变量。")
                );
                console.log("");
            }
        }
    }

    // v3.5.0: 为 issues 添加责任人（CODEOWNERS）
    if (options.assign) {
        applyAssignees(allResults, externalResults, options.projectDir);
    }

    // v2.3.0 / v3.5.0: Baseline 模式 —— 生成或应用 baseline 过滤（支持远程团队 baseline）
    let baselineResult = null;
    const baselinePath = options.teamBaseline || options.baseline;
    if (baselinePath) {
        const allIssues = collectAllIssues(allResults, externalResults);
        if (options.generateBaseline) {
            const baseline = new BaselineManager(baselinePath, options.projectDir);
            baseline.save(allIssues, { projectDir: options.projectDir });
            if (!options.json) {
                console.log(pc.cyan(`📋 Baseline 已生成: ${baseline.getPath()}`));
                console.log(pc.gray(`   包含 ${allIssues.length} 个已知问题`));
            }
            process.exit(0);
        }
        baselineResult = await applyBaselineToResults(allResults, externalResults, baselinePath, options.projectDir);
        if (baselineResult.baselineLoaded && !options.json) {
            console.log(
                pc.cyan(
                    `📋 Baseline 模式: 忽略 ${baselineResult.knownIssues.length} 个已知问题，关注 ${baselineResult.newIssues.length} 个新增问题`
                )
            );
            console.log("");
        }
        const newTotals = recalculateTotals(allResults, externalResults);
        totalCritical = newTotals.critical;
        totalWarning = newTotals.warning;
        totalSuggestion = newTotals.suggestion;
    }

    // v2.3.0: SARIF 输出
    if (options.sarif) {
        const allIssues = collectAllIssues(allResults, externalResults);
        const sarif = generateSarif(allIssues, {
            toolName: "Frontend Guardian",
            toolVersion: "2.3.0",
            projectDir: options.projectDir,
        });
        writeFileSync(options.sarif, JSON.stringify(sarif, null, 2), "utf-8");
        if (!options.json && !options.githubActions) {
            console.log(pc.cyan(`📄 SARIF 报告已保存: ${options.sarif}`));
            console.log(pc.gray(`   包含 ${allIssues.length} 个问题`));
            console.log("");
        }
    }

    // v2.3.0: GitHub Actions Annotation
    if (options.githubActions || isGitHubActions()) {
        const allIssues = collectAllIssues(allResults, externalResults);
        if (allIssues.length > 0) {
            const annotations = formatAllAnnotations(allIssues);
            console.log(annotations);
        }
        writeJobSummary(allIssues, { totalFilesScanned, duration: totalDuration });
    }

    // v2.5.0: PR/MR 评论自动发布
    if (options.postComment) {
        const commentBody = generatePRComment(
            allResults,
            {
                timestamp: new Date().toISOString(),
                commitSha: process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA,
                duration: totalDuration,
                filesScanned: totalFilesScanned,
            },
            {
                external: externalResults.length > 0 ? externalResults : undefined,
                fixResult: fixResult
                    ? { fixedCount: fixResult.fixedCount, filesModified: fixResult.filesModified }
                    : null,
            }
        );

        // 构建发布器配置
        let pubConfig = detectPublisherConfig();
        if (!pubConfig && options.commentProvider) {
            const token = options.commentProvider === "github" ? process.env.GITHUB_TOKEN : process.env.GITLAB_TOKEN;
            const repo =
                options.commentProvider === "github" ? process.env.GITHUB_REPOSITORY : process.env.CI_PROJECT_ID;
            if (token && repo && options.prNumber) {
                pubConfig = {
                    provider: options.commentProvider,
                    token,
                    repository: repo,
                    prNumber: options.prNumber,
                };
            }
        }

        if (pubConfig) {
            try {
                const publisher = createPublisher(pubConfig);
                const result = await publisher.publish(commentBody);
                if (result.success) {
                    console.log(pc.cyan(`💬 PR/MR 评论已${result.action === "updated" ? "更新" : "发布"}`));
                    if (result.commentUrl) {
                        console.log(pc.gray(`   ${result.commentUrl}`));
                    }
                } else {
                    console.log(pc.red(`   ❌ 评论发布失败: ${result.error}`));
                }
            } catch (err) {
                console.log(pc.red(`   ❌ 评论发布异常: ${err.message || err}`));
            }
        } else {
            console.log(
                pc.yellow(
                    "   ⚠️ 无法检测 CI 环境，跳过评论发布。请检查 GITHUB_TOKEN / GITLAB_TOKEN 环境变量，或显式指定 --comment-provider 和 --pr-number"
                )
            );
        }
        console.log("");
    }

    // 生成并写入报告文件（--output）
    const reportPath = options.output;
    if (reportPath) {
        const reportBody = generatePRComment(
            allResults,
            {
                timestamp: new Date().toISOString(),
                commitSha: process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA,
                duration: totalDuration,
                filesScanned: totalFilesScanned,
            },
            {
                external: externalResults.length > 0 ? externalResults : undefined,
                fixResult: fixResult
                    ? { fixedCount: fixResult.fixedCount, filesModified: fixResult.filesModified }
                    : null,
            }
        );
        writeFileSync(reportPath, reportBody, "utf-8");
        if (!options.json) {
            console.log(pc.cyan("📄 报告已写入"));
            console.log(pc.gray(`   ${reportPath}`));
            console.log("");
        }
    }

    // v2.5.0: 报告上传（--upload）
    if (options.upload) {
        const uploadConfig = detectUploadConfig();
        if (uploadConfig) {
            const targetPath =
                reportPath ||
                (() => {
                    const tmpPath = join(process.cwd(), `fg-report-${Date.now()}.md`);
                    const reportBody = generatePRComment(
                        allResults,
                        {
                            timestamp: new Date().toISOString(),
                            duration: totalDuration,
                            filesScanned: totalFilesScanned,
                        },
                        {
                            external: externalResults.length > 0 ? externalResults : undefined,
                            fixResult: fixResult
                                ? { fixedCount: fixResult.fixedCount, filesModified: fixResult.filesModified }
                                : null,
                        }
                    );
                    writeFileSync(tmpPath, reportBody, "utf-8");
                    return tmpPath;
                })();
            const uploadResult = await uploadReport(targetPath, uploadConfig);
            if (uploadResult.success) {
                console.log(pc.cyan("📤 报告已上传"));
                if (uploadResult.reportUrl) {
                    console.log(pc.gray(`   ${uploadResult.reportUrl}`));
                }
            } else {
                console.log(pc.red(`   ❌ 上传失败: ${uploadResult.error}`));
            }
            console.log("");
        } else {
            console.log(
                pc.yellow(
                    "   ⚠️ 未检测到上传配置。请设置 FG_UPLOAD_PROVIDER 和 FG_UPLOAD_URL / FG_UPLOAD_DIR 环境变量。"
                )
            );
            console.log("");
        }
    }

    if (options.json) {
        const jsonOutput = {
            modules: allResults,
            fix: fixResult,
            format: formatResult,
            external: externalResults.length > 0 ? externalResults : undefined,
            summary: {
                totalFilesScanned,
                issuesBySeverity: {
                    critical: totalCritical,
                    warning: totalWarning,
                    suggestion: totalSuggestion,
                },
                totalDuration,
            },
        };
        console.log(JSON.stringify(jsonOutput, null, 2));
        process.exit(totalCritical > 0 ? 1 : 0);
    }

    // Phase 4: 终端输出外部工具结果
    if (externalResults.length > 0) {
        console.log(pc.cyan("🔌 外部工具检查结果"));
        for (const er of externalResults) {
            if (er.issues.length === 0) continue;
            const color = er.issues.some((i) => i.severity === "critical")
                ? pc.red
                : er.issues.some((i) => i.severity === "warning")
                  ? pc.yellow
                  : pc.blue;
            console.log(color(`   ${er.tool}: ${er.issues.length} 个问题`));
        }
        console.log("");
    }

    // 终端输出
    if (totalCritical + totalWarning + totalSuggestion === 0) {
        console.log(pc.green("✅ 未发现问题"));
    } else {
        console.log("");
        console.log(pc.cyan("📊 扫描结果汇总"));
        console.log(pc.red(`   🔴 Critical: ${totalCritical}`));
        console.log(pc.yellow(`   🟡 Warning: ${totalWarning}`));
        console.log(pc.blue(`   💡 Suggestion: ${totalSuggestion}`));
        console.log("");

        for (const mod of MODULES) {
            const r = allResults[mod];
            if (!r || r.total === 0) continue;

            console.log(pc.cyan(`📦 ${mod}`));
            if (r.issues.critical.length) {
                console.log(pc.red(`   🔴 Critical: ${r.issues.critical.length}`));
                for (const issue of r.issues.critical) {
                    printIssue(issue, pc.red);
                }
            }
            if (r.issues.warning.length) {
                console.log(pc.yellow(`   🟡 Warning: ${r.issues.warning.length}`));
                for (const issue of r.issues.warning) {
                    printIssue(issue, pc.yellow);
                }
            }
            if (r.issues.suggestion.length) {
                console.log(pc.blue(`   💡 Suggestion: ${r.issues.suggestion.length}`));
                for (const issue of r.issues.suggestion) {
                    printIssue(issue, pc.blue);
                }
            }
            console.log("");
        }
    }

    // v3.0.0: AI 修复建议
    if (options.aiFix) {
        const aiConfig = detectAIConfig();
        if (aiConfig) {
            if (options.aiModel) {
                aiConfig.model = options.aiModel;
            }
            console.log(pc.cyan("🤖 正在生成 AI 修复建议..."));
            const suggester = new AIFixSuggester(aiConfig);
            const allIssues = collectAllIssues(allResults, externalResults);
            // 只给没有自动修复的 issue 生成 AI 建议
            const issuesWithoutFix = allIssues.filter((i) => !i.fix);
            if (issuesWithoutFix.length > 0) {
                const suggestions = await suggester.suggestFixes(issuesWithoutFix.slice(0, 5), options.projectDir);
                if (suggestions.length > 0) {
                    console.log(pc.cyan(`   ✅ 生成 ${suggestions.length} 个 AI 修复建议`));
                    for (const s of suggestions) {
                        const confidenceIcon =
                            s.confidence === "high"
                                ? pc.green("●")
                                : s.confidence === "medium"
                                  ? pc.yellow("●")
                                  : pc.red("●");
                        console.log(pc.cyan(`\n   📄 ${s.issue.file}:${s.issue.line}`));
                        console.log(pc.yellow(`      [${s.issue.ruleId}] ${s.issue.title}`));
                        console.log(pc.gray(`      AI 置信度: ${confidenceIcon} ${s.confidence}`));
                        if (s.explanation) {
                            console.log(pc.gray(`      说明: ${s.explanation}`));
                        }
                        console.log(pc.gray(`      模型: ${s.model}`));
                    }
                } else {
                    console.log(pc.gray("   未生成 AI 修复建议"));
                }
            } else {
                console.log(pc.gray("   所有问题都有自动修复，无需 AI 建议"));
            }
            console.log("");
        } else {
            console.log(pc.yellow("   ⚠️ 未检测到 AI 配置。请设置 FG_AI_API_KEY 或 OPENAI_API_KEY 环境变量。"));
            console.log("");
        }
    }

    // v2.8.0: 保存完整扫描报告
    if (options.saveReport) {
        const hr = new HistoryReport(options.projectDir);
        for (const mod of MODULES) {
            const r = allResults[mod];
            if (!r || r.total === 0) continue;
            const allIssues = [...r.issues.critical, ...r.issues.warning, ...r.issues.suggestion];
            const filename = hr.saveFullReport(r, allIssues);
            if (!options.json) {
                console.log(pc.cyan(`💾 报告已保存`));
                console.log(pc.gray(`   .frontend-guardian/history/${filename}`));
            }
        }
    }

    // v3.5.0: 发送扫描结果通知
    if (options.notify) {
        const notifyConfig = detectNotificationConfig();
        if (
            notifyConfig.feishu?.enabled ||
            notifyConfig.dingtalk?.enabled ||
            notifyConfig.wecom?.enabled ||
            notifyConfig.slack?.enabled
        ) {
            const moduleResults = MODULES.map((m) => allResults[m]).filter(Boolean);
            const payload = buildNotificationPayload(moduleResults, {
                project: options.projectDir,
                duration: totalDuration,
                gatePassed: totalCritical === 0,
            });
            const notifyResults = await sendNotifications(payload, notifyConfig);
            for (const nr of notifyResults) {
                const icon = nr.success ? pc.green("✅") : pc.red("❌");
                console.log(pc.gray(`   ${icon} ${nr.channel}: ${nr.success ? "已发送" : nr.error}`));
            }
        } else {
            console.log(
                pc.yellow(
                    "⚠️ 未配置通知渠道。请设置 FG_NOTIFY_FEISHU / FG_NOTIFY_DINGTALK / FG_NOTIFY_WECOM / FG_NOTIFY_SLACK 环境变量"
                )
            );
        }
    }

    // v3.5.0: 生成合规报告
    if (options.compliance) {
        const moduleResults = MODULES.map((m) => allResults[m]).filter(Boolean);
        const report = generateComplianceReport(moduleResults, options.projectDir, options.strategy);
        const markdown = complianceReportToMarkdown(report);
        saveComplianceReport(report, options.compliance);
        if (!options.json) {
            console.log(pc.cyan("📋 合规报告已生成"));
            console.log(pc.gray(`   ${options.compliance}`));
            console.log(pc.gray(`   合规评分: ${report.summary.complianceScore}/100`));
            console.log(pc.gray(`   控制项: ${report.findings.length} 个`));
        }
    }

    // v3.5.2: 上报到治理看板服务器
    const dashboardUrl = options.server || (options.serve ? "http://localhost:3456" : null);
    if (dashboardUrl) {
        const allIssues = collectAllIssues(allResults, externalResults);
        const projectName = options.projectDir.split("/").pop() || "unknown";
        const dashboardConfig = { serverUrl: dashboardUrl };

        for (const mod of MODULES) {
            const r = allResults[mod];
            if (!r) continue;
            const moduleIssues = [...r.issues.critical, ...r.issues.warning, ...r.issues.suggestion];
            const payload = {
                projectName,
                projectPath: options.projectDir,
                module: mod,
                result: r,
                issues: moduleIssues,
                meta: {
                    strategy: options.strategy,
                    duration: r.duration,
                    filesScanned: r.filesScanned,
                },
            };
            const result = await uploadToDashboardServer(payload, dashboardConfig);
            if (!options.json) {
                if (result.success) {
                    console.log(pc.cyan(`📊 已上报到看板服务器: ${mod}`));
                } else {
                    console.log(pc.yellow(`   ⚠️ 看板上报失败 (${mod}): ${result.error}`));
                }
            }
        }
        if (!options.json) {
            console.log(pc.gray(`   Dashboard: ${dashboardUrl}`));
            console.log("");
        }
    }

    console.log(
        pc.gray(
            `⏱️  总耗时: ${totalDuration}ms | 扫描 ${totalFilesScanned} 个文件 | ${totalFilesWithIssues} 个文件有问题`
        )
    );

    if (totalCritical > 0) {
        process.exit(1);
    }
}

async function runSingleModule(options, cacheInstance) {
    console.log(pc.cyan("🛡️  Frontend Guardian Core"));
    console.log(pc.gray(`   Project: ${options.projectDir}`));
    console.log(pc.gray(`   Module: ${options.module}`));
    if (options.staged) {
        console.log(pc.gray(`   Mode: staged (git cached only)`));
    } else if (options.diffRange) {
        console.log(pc.gray(`   Diff: ${options.diffRange}`));
    } else if (options.autoScope) {
        console.log(pc.gray(`   Mode: auto-scope (智能扫描范围)`));
    }
    console.log("");

    const engine = createEngine({
        projectDir: options.projectDir,
        minSeverity: options.minSeverity,
        files: options.files,
        exclude: options.exclude,
        configFile: options.configFile,
        staged: options.staged,
        diffRange: options.diffRange,
        autoScope: options.autoScope,
        cache: options.cache,
        cacheInstance,
        dryRun: options.dryRun,
        interactive: options.interactive,
        skipLargeFilesThreshold: options.skipLargeFilesThreshold,
        strategy: options.strategy,
    });

    // 注册规则
    if (MODULE_RULES[options.module]) {
        engine.registerAll(MODULE_RULES[options.module]);
    } else {
        console.log(pc.red(`❌ 未知模块: ${options.module}`));
        console.log(pc.gray(`   可用模块: ${MODULES.join(", ")}, all`));
        process.exit(1);
    }

    try {
        let result = await engine.scan(options.module);

        // Issue 聚类
        if (options.cluster) {
            result = {
                ...result,
                issues: {
                    critical: engine.clusterIssues(result.issues.critical),
                    warning: engine.clusterIssues(result.issues.warning),
                    suggestion: engine.clusterIssues(result.issues.suggestion),
                },
                total:
                    engine.clusterIssues(result.issues.critical).length +
                    engine.clusterIssues(result.issues.warning).length +
                    engine.clusterIssues(result.issues.suggestion).length,
            };
        }

        const { issues } = result;
        let totalCritical = issues.critical.length;
        let totalWarning = issues.warning.length;
        let totalSuggestion = issues.suggestion.length;

        // 自动修复 / 修复预览
        let fixResult = null;
        if (options.fix || options.dryRun) {
            const allIssues = [...issues.critical, ...issues.warning, ...issues.suggestion];
            const fixableIssues = allIssues.filter((i) => i.fix);
            if (!options.json) {
                if (options.dryRun) {
                    console.log(pc.cyan("🔍 修复预览（dry-run 模式，不会修改文件）："));
                } else {
                    console.log(pc.cyan("🔧 正在应用自动修复..."));
                }
            }
            fixResult = engine.applyFixes(fixableIssues);
            if (!options.json) {
                if (options.dryRun && fixResult.previews) {
                    for (const preview of fixResult.previews) {
                        console.log(pc.cyan(`\n  📄 ${preview.file}`));
                        console.log(pc.yellow(`     ${preview.title}`));
                        console.log(preview.diff);
                    }
                    console.log(pc.blue(`\n   💡 共 ${fixResult.previews.length} 处可修复（使用 --fix 应用）`));
                } else if (fixResult.filesModified.length > 0) {
                    console.log(
                        pc.green(
                            `   ✅ 已修复 ${fixResult.fixedCount} 个问题（${fixResult.filesModified.length} 个文件）`
                        )
                    );
                    for (const f of fixResult.filesModified) {
                        console.log(pc.gray(`      - ${f}`));
                    }
                    if (fixResult.skippedByUser && fixResult.skippedByUser > 0) {
                        console.log(pc.yellow(`   ⏭️  跳过 ${fixResult.skippedByUser} 个问题（低置信度或用户选择）`));
                    }
                } else {
                    console.log(pc.yellow("   ⚠️ 未应用任何修复"));
                }
                if (fixResult.errors.length > 0) {
                    for (const err of fixResult.errors) {
                        console.log(pc.red(`   ❌ ${err}`));
                    }
                }
                console.log("");
            }
        }

        // 格式化（--format）
        let formatResult = null;
        if (options.format && !options.dryRun) {
            const filesToFormat = options.fix && fixResult?.filesModified ? fixResult.filesModified : undefined;
            if (!options.json) {
                console.log(pc.cyan("🎨 正在格式化代码..."));
            }
            formatResult = engine.format(filesToFormat);
            if (!options.json) {
                if (formatResult.formatted > 0) {
                    console.log(pc.green(`   ✅ ${formatResult.formatter} 已格式化 ${formatResult.formatted} 个文件`));
                } else if (formatResult.errors.length === 0) {
                    console.log(pc.gray("   所有文件已是最优格式"));
                }
                if (formatResult.errors.length > 0) {
                    for (const err of formatResult.errors) {
                        console.log(pc.red(`   ❌ ${err}`));
                    }
                }
                console.log("");
            }
        }

        // v2.6.0: 自动修复 Bot
        if (options.fixBot && fixResult?.filesModified?.length > 0) {
            const botConfig = detectFixBotConfig();
            if (botConfig) {
                if (!options.json) {
                    console.log(pc.cyan("🤖 正在创建修复 PR..."));
                }
                const botResult = await runFixBot(options.projectDir, fixResult.filesModified, botConfig);
                if (!options.json) {
                    if (botResult.success) {
                        console.log(pc.green(`   ✅ 修复 PR 已创建`));
                        console.log(pc.gray(`   分支: ${botResult.branch}`));
                        if (botResult.prUrl) {
                            console.log(pc.gray(`   ${botResult.prUrl}`));
                        }
                    } else {
                        console.log(pc.red(`   ❌ Fix Bot 失败: ${botResult.error}`));
                    }
                    console.log("");
                }
            } else {
                if (!options.json) {
                    console.log(
                        pc.yellow(
                            "   ⚠️ 未检测到 Fix Bot 配置。请设置 FG_FIX_BOT_PROVIDER 和 FG_FIX_BOT_TOKEN 环境变量。"
                        )
                    );
                    console.log("");
                }
            }
        }

        // v2.3.0: Baseline 模式
        let allIssues = [...issues.critical, ...issues.warning, ...issues.suggestion];
        if (options.baseline) {
            if (options.generateBaseline) {
                const baseline = new BaselineManager(options.baseline, options.projectDir);
                baseline.save(allIssues, { projectDir: options.projectDir });
                if (!options.json) {
                    console.log(pc.cyan(`📋 Baseline 已生成: ${baseline.getPath()}`));
                    console.log(pc.gray(`   包含 ${allIssues.length} 个已知问题`));
                }
                process.exit(0);
            }
            const baseline = new BaselineManager(options.baseline, options.projectDir);
            const baselineResult = baseline.filterNewIssues(allIssues);
            if (baselineResult.baselineLoaded && !options.json) {
                console.log(
                    pc.cyan(
                        `📋 Baseline 模式: 忽略 ${baselineResult.knownIssues.length} 个已知问题，关注 ${baselineResult.newIssues.length} 个新增问题`
                    )
                );
                console.log("");
            }
            // 过滤 issues
            const newKeySet = new Set(baselineResult.newIssues.map((i) => `${i.file}|${i.ruleId}|${i.line}`));
            issues.critical = issues.critical.filter((i) => newKeySet.has(`${i.file}|${i.ruleId}|${i.line}`));
            issues.warning = issues.warning.filter((i) => newKeySet.has(`${i.file}|${i.ruleId}|${i.line}`));
            issues.suggestion = issues.suggestion.filter((i) => newKeySet.has(`${i.file}|${i.ruleId}|${i.line}`));
            result.total = issues.critical.length + issues.warning.length + issues.suggestion.length;
            result.filesWithIssues = new Set(
                [...issues.critical, ...issues.warning, ...issues.suggestion].map((i) => i.file)
            ).size;
            allIssues = baselineResult.newIssues;
        }

        // v2.3.0: SARIF 输出
        if (options.sarif) {
            const sarif = generateSarif(allIssues, {
                toolName: "Frontend Guardian",
                toolVersion: "2.3.0",
                projectDir: options.projectDir,
            });
            writeFileSync(options.sarif, JSON.stringify(sarif, null, 2), "utf-8");
            if (!options.json && !options.githubActions) {
                console.log(pc.cyan(`📄 SARIF 报告已保存: ${options.sarif}`));
                console.log(pc.gray(`   包含 ${allIssues.length} 个问题`));
                console.log("");
            }
        }

        // v2.3.0: GitHub Actions Annotation
        if (options.githubActions || isGitHubActions()) {
            if (allIssues.length > 0) {
                console.log(formatAllAnnotations(allIssues));
            }
            writeJobSummary(allIssues, { totalFilesScanned: result.filesScanned, duration: result.duration });
        }

        // v2.5.0: PR/MR 评论自动发布
        if (options.postComment) {
            const singleResult = { [options.module]: result };
            const commentBody = generatePRComment(
                singleResult,
                {
                    timestamp: new Date().toISOString(),
                    commitSha: process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA,
                    duration: result.duration,
                    filesScanned: result.filesScanned,
                },
                {
                    fixResult: fixResult
                        ? { fixedCount: fixResult.fixedCount, filesModified: fixResult.filesModified }
                        : null,
                }
            );

            let pubConfig = detectPublisherConfig();
            if (!pubConfig && options.commentProvider) {
                const token =
                    options.commentProvider === "github" ? process.env.GITHUB_TOKEN : process.env.GITLAB_TOKEN;
                const repo =
                    options.commentProvider === "github" ? process.env.GITHUB_REPOSITORY : process.env.CI_PROJECT_ID;
                if (token && repo && options.prNumber) {
                    pubConfig = {
                        provider: options.commentProvider,
                        token,
                        repository: repo,
                        prNumber: options.prNumber,
                    };
                }
            }

            if (pubConfig) {
                try {
                    const publisher = createPublisher(pubConfig);
                    const pubResult = await publisher.publish(commentBody);
                    if (pubResult.success) {
                        console.log(pc.cyan(`💬 PR/MR 评论已${pubResult.action === "updated" ? "更新" : "发布"}`));
                        if (pubResult.commentUrl) {
                            console.log(pc.gray(`   ${pubResult.commentUrl}`));
                        }
                    } else {
                        console.log(pc.red(`   ❌ 评论发布失败: ${pubResult.error}`));
                    }
                } catch (err) {
                    console.log(pc.red(`   ❌ 评论发布异常: ${err.message || err}`));
                }
            } else {
                console.log(
                    pc.yellow(
                        "   ⚠️ 无法检测 CI 环境，跳过评论发布。请检查环境变量，或显式指定 --comment-provider 和 --pr-number"
                    )
                );
            }
            console.log("");
        }

        if (options.json) {
            const jsonOutput = {
                ...result,
                fix: fixResult,
                format: formatResult,
            };
            console.log(JSON.stringify(jsonOutput, null, 2));
            process.exit(issues.critical.length > 0 ? 1 : 0);
        }

        // 终端输出（baseline 过滤后重新计算 totals）
        totalCritical = issues.critical.length;
        totalWarning = issues.warning.length;
        totalSuggestion = issues.suggestion.length;

        if (totalCritical + totalWarning + totalSuggestion === 0) {
            console.log(pc.green("✅ 未发现问题"));
        } else {
            console.log(pc.red(`🔴 Critical: ${totalCritical}`));
            console.log(pc.yellow(`🟡 Warning: ${totalWarning}`));
            console.log(pc.blue(`💡 Suggestion: ${totalSuggestion}`));
            console.log("");

            const allIssues = [...issues.critical, ...issues.warning, ...issues.suggestion];

            for (const issue of allIssues) {
                printIssue(
                    issue,
                    issue.severity === "critical" ? pc.red : issue.severity === "warning" ? pc.yellow : pc.blue
                );
            }
        }

        // v3.5.2: 上报到治理看板服务器
        const singleDashboardUrl = options.server || (options.serve ? "http://localhost:3456" : null);
        if (singleDashboardUrl) {
            const allIssues = [...issues.critical, ...issues.warning, ...issues.suggestion];
            const projectName = options.projectDir.split("/").pop() || "unknown";
            const dashboardConfig = { serverUrl: singleDashboardUrl };
            const payload = {
                projectName,
                projectPath: options.projectDir,
                module: options.module,
                result,
                issues: allIssues,
                meta: {
                    strategy: options.strategy,
                    duration: result.duration,
                    filesScanned: result.filesScanned,
                },
            };
            const uploadResult = await uploadToDashboardServer(payload, dashboardConfig);
            if (!options.json) {
                if (uploadResult.success) {
                    console.log(pc.cyan(`📊 已上报到看板服务器: ${options.module}`));
                } else {
                    console.log(pc.yellow(`   ⚠️ 看板上报失败: ${uploadResult.error}`));
                }
                console.log(pc.gray(`   Dashboard: ${singleDashboardUrl}`));
                console.log("");
            }
        }

        // v3.0.0: AI 修复建议
        if (options.aiFix) {
            const aiConfig = detectAIConfig();
            if (aiConfig) {
                if (options.aiModel) {
                    aiConfig.model = options.aiModel;
                }
                console.log(pc.cyan("\n🤖 正在生成 AI 修复建议..."));
                const suggester = new AIFixSuggester(aiConfig);
                const allIssues = [...issues.critical, ...issues.warning, ...issues.suggestion];
                const issuesWithoutFix = allIssues.filter((i) => !i.fix);
                if (issuesWithoutFix.length > 0) {
                    const suggestions = await suggester.suggestFixes(issuesWithoutFix.slice(0, 5), options.projectDir);
                    if (suggestions.length > 0) {
                        console.log(pc.cyan(`   ✅ 生成 ${suggestions.length} 个 AI 修复建议`));
                        for (const s of suggestions) {
                            const confidenceIcon =
                                s.confidence === "high"
                                    ? pc.green("●")
                                    : s.confidence === "medium"
                                      ? pc.yellow("●")
                                      : pc.red("●");
                            console.log(pc.cyan(`\n   📄 ${s.issue.file}:${s.issue.line}`));
                            console.log(pc.yellow(`      [${s.issue.ruleId}] ${s.issue.title}`));
                            console.log(pc.gray(`      AI 置信度: ${confidenceIcon} ${s.confidence}`));
                            if (s.explanation) {
                                console.log(pc.gray(`      说明: ${s.explanation}`));
                            }
                            console.log(pc.gray(`      模型: ${s.model}`));
                        }
                    } else {
                        console.log(pc.gray("   未生成 AI 修复建议"));
                    }
                } else {
                    console.log(pc.gray("   所有问题都有自动修复，无需 AI 建议"));
                }
                console.log("");
            } else {
                console.log(pc.yellow("   ⚠️ 未检测到 AI 配置。请设置 FG_AI_API_KEY 或 OPENAI_API_KEY 环境变量。"));
                console.log("");
            }
        }

        console.log(
            pc.gray(
                `⏱️  耗时: ${result.duration}ms | 扫描 ${result.filesScanned} 个文件 | ${result.filesWithIssues} 个文件有问题`
            )
        );

        if (totalCritical > 0) {
            process.exit(1);
        }
    } catch (err) {
        console.error(pc.red("❌ 扫描失败:"), err);
        process.exit(1);
    }
}

function printIssue(issue, colorFn) {
    console.log(colorFn(`  [${issue.severity.toUpperCase()}] ${issue.title}`));
    console.log(`    📄 ${issue.file}:${issue.line}:${issue.column}`);
    console.log(`    ${issue.description}`);
    if (issue.source) {
        console.log(pc.gray(`    > ${issue.source}`));
    }
    if (issue.docsUrl) {
        console.log(pc.blue(`    📖 ${issue.docsUrl}`));
    }
    console.log("");
}

// ──────────────────────────────────────────────────────────────────────────
// v2.3.0: Baseline / SARIF / GitHub Actions 辅助函数
// ──────────────────────────────────────────────────────────────────────────

/** 从 allResults 收集所有 issues（含外部工具） */
function collectAllIssues(allResults, externalResults) {
    const issues = [];
    for (const mod of MODULES) {
        const r = allResults[mod];
        if (r) {
            issues.push(...r.issues.critical, ...r.issues.warning, ...r.issues.suggestion);
        }
    }
    for (const er of externalResults) {
        issues.push(...er.issues);
    }
    return issues;
}

/** 应用 baseline 过滤到 allResults，返回 BaselineResult */
async function applyBaselineToResults(allResults, externalResults, baselinePath, projectDir) {
    const allIssues = collectAllIssues(allResults, externalResults);
    const isRemote = baselinePath.startsWith("http://") || baselinePath.startsWith("https://");
    const baseline = new BaselineManager(baselinePath, projectDir, {
        teamBaselineUrl: isRemote ? baselinePath : undefined,
    });

    if (isRemote) {
        await baseline.init();
    }

    const baselineResult = baseline.filterNewIssues(allIssues);

    if (!baselineResult.baselineLoaded) {
        return baselineResult;
    }

    const newKeySet = new Set(baselineResult.newIssues.map((i) => `${i.file}|${i.ruleId}|${i.line}`));

    function isNew(issue) {
        return newKeySet.has(`${issue.file}|${issue.ruleId}|${issue.line}`);
    }

    // 过滤每个模块的 issues
    for (const mod of MODULES) {
        const r = allResults[mod];
        if (!r) continue;
        r.issues.critical = r.issues.critical.filter(isNew);
        r.issues.warning = r.issues.warning.filter(isNew);
        r.issues.suggestion = r.issues.suggestion.filter(isNew);
        r.total = r.issues.critical.length + r.issues.warning.length + r.issues.suggestion.length;
        r.filesWithIssues = new Set(
            [...r.issues.critical, ...r.issues.warning, ...r.issues.suggestion].map((i) => i.file)
        ).size;
    }

    // 过滤外部工具 issues
    for (const er of externalResults) {
        er.issues = er.issues.filter(isNew);
    }

    return baselineResult;
}

/** 为所有 issues 添加责任人（CODEOWNERS） */
function applyAssignees(allResults, externalResults, projectDir) {
    const parser = new CodeownersParser(projectDir);
    if (!parser.hasCodeowners()) return;

    for (const mod of MODULES) {
        const r = allResults[mod];
        if (!r) continue;
        for (const sev of ["critical", "warning", "suggestion"]) {
            for (const issue of r.issues[sev]) {
                const owner = parser.getOwner(issue.file);
                if (owner) {
                    issue.assignee = owner;
                }
            }
        }
    }

    for (const er of externalResults) {
        for (const issue of er.issues) {
            const owner = parser.getOwner(issue.file);
            if (owner) {
                issue.assignee = owner;
            }
        }
    }
}

/** 重新计算 totals */
function recalculateTotals(allResults, externalResults) {
    let critical = 0;
    let warning = 0;
    let suggestion = 0;
    for (const mod of MODULES) {
        const r = allResults[mod];
        if (!r) continue;
        critical += r.issues.critical.length;
        warning += r.issues.warning.length;
        suggestion += r.issues.suggestion.length;
    }
    for (const er of externalResults) {
        for (const issue of er.issues) {
            if (issue.severity === "critical") critical++;
            else if (issue.severity === "warning") warning++;
            else suggestion++;
        }
    }
    return { critical, warning, suggestion };
}

main();
