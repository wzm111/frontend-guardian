#!/usr/bin/env node
/**
 * Frontend Guardian Core CLI
 * Usage: fg-core [options] <project-dir>
 */

import {
    createEngine,
    i18nRules,
    performanceRules,
    a11yRules,
    securityRules,
    namingRules,
    crossFileRules,
    componentRules,
    hooksRules,
    platformRules,
    svelteRules,
    installGitHooks,
    uninstallGitHooks,
    hasGitHook,
    generateCIConfig,
} from "../dist/index.js";
import pc from "picocolors";
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
};

function showHelp() {
    console.log(`
Frontend Guardian Core v2.1.1

Usage:
  fg-core <project-dir> [options]

Options:
  --module <name>      扫描模块: i18n | performance | a11y | security | naming | cross-file | component | hooks | platform | svelte | all
  --severity <level>   最低严重级别: critical | warning | suggestion (默认: suggestion)
  --files <pattern>    仅扫描匹配的文件
  --exclude <pattern>  排除匹配的文件
  --staged             仅扫描 git staged 文件
  --diff <range>       仅扫描 git diff 范围内的文件 (如 main...feature)
  --no-cluster         禁用 Issue 聚类
  --json               以 JSON 格式输出
  --fix                自动修复可修复的问题
  --dry-run            修复预览模式（展示 diff 不写入文件）
  --format             修复后自动格式化代码（Biome/Prettier）
  --external           运行外部工具集成 (ESLint / TypeScript / Stylelint)
  --watch              Watch 模式：文件变更自动增量扫描
  --no-cache           禁用智能缓存
  --config <file>      指定配置文件
  --install-hooks      安装 Git pre-commit hook
  --init-ci            生成 CI 配置文件 (GitHub Actions)
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
        installHooks: false,
        initCi: false,
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
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
            case "--install-hooks":
                options.installHooks = true;
                break;
            case "--init-ci":
                options.initCi = true;
                break;
            case "--help":
            case "-h":
                showHelp();
                process.exit(0);
        }
    }

    // Phase 6: 特殊命令处理
    if (options.installHooks) {
        const result = installGitHooks(options.projectDir, {
            type: "pre-commit",
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

    if (options.initCi) {
        const result = generateCIConfig(options.projectDir, {
            provider: "github",
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

    if (options.watch) {
        const scanFn = options.module === "all" ? runAllModules : runSingleModule;
        await runWatchMode(options, scanFn);
    } else if (options.module === "all") {
        await runAllModules(options);
    } else {
        await runSingleModule(options);
    }
}

async function runAllModules(options) {
    console.log(pc.cyan("🛡️  Frontend Guardian Core"));
    console.log(pc.gray(`   Project: ${options.projectDir}`));
    console.log(pc.gray(`   Module: all (9 modules)`));
    if (options.staged) {
        console.log(pc.gray(`   Mode: staged (git cached only)`));
    } else if (options.diffRange) {
        console.log(pc.gray(`   Diff: ${options.diffRange}`));
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
        external: options.external,
        cache: options.cache,
        dryRun: options.dryRun,
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

    console.log(
        pc.gray(
            `⏱️  总耗时: ${totalDuration}ms | 扫描 ${totalFilesScanned} 个文件 | ${totalFilesWithIssues} 个文件有问题`
        )
    );

    if (totalCritical > 0) {
        process.exit(1);
    }
}

async function runSingleModule(options) {
    console.log(pc.cyan("🛡️  Frontend Guardian Core"));
    console.log(pc.gray(`   Project: ${options.projectDir}`));
    console.log(pc.gray(`   Module: ${options.module}`));
    if (options.staged) {
        console.log(pc.gray(`   Mode: staged (git cached only)`));
    } else if (options.diffRange) {
        console.log(pc.gray(`   Diff: ${options.diffRange}`));
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
        cache: options.cache,
        dryRun: options.dryRun,
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
        const totalCritical = issues.critical.length;
        const totalWarning = issues.warning.length;
        const totalSuggestion = issues.suggestion.length;

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

        if (options.json) {
            const jsonOutput = {
                ...result,
                fix: fixResult,
                format: formatResult,
            };
            console.log(JSON.stringify(jsonOutput, null, 2));
            process.exit(totalCritical > 0 ? 1 : 0);
        }

        // 终端输出
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
    console.log("");
}

main();
