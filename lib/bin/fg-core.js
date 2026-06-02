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
} from '../dist/index.js';
import pc from 'picocolors';

const MODULES = [
  'i18n',
  'performance',
  'a11y',
  'security',
  'naming',
  'cross-file',
  'component',
  'hooks',
  'platform',
];

const MODULE_RULES = {
  i18n: i18nRules,
  performance: performanceRules,
  a11y: a11yRules,
  security: securityRules,
  naming: namingRules,
  'cross-file': crossFileRules,
  component: componentRules,
  hooks: hooksRules,
  platform: platformRules,
};

function showHelp() {
  console.log(`
Frontend Guardian Core v1.0.0

Usage:
  fg-core <project-dir> [options]

Options:
  --module <name>      扫描模块: i18n | performance | a11y | security | naming | cross-file | component | hooks | platform | all
  --severity <level>   最低严重级别: critical | warning | suggestion (默认: suggestion)
  --files <pattern>    仅扫描匹配的文件
  --exclude <pattern>  排除匹配的文件
  --json               以 JSON 格式输出
  --fix                自动修复可修复的问题
  --config <file>      指定配置文件
  --help, -h           显示帮助

Examples:
  fg-core ./my-project --module all
  fg-core ./my-project --module i18n
  fg-core ./my-project --module i18n --severity warning --json
  fg-core ./my-project --module performance --files "src/**/*.tsx"
  fg-core ./my-project --module all --fix --json
`);
}

async function main() {
  const args = process.argv.slice(2);
  const projectDir = args.find((arg) => !arg.startsWith('-')) || process.cwd();

  const options = {
    projectDir,
    minSeverity: 'suggestion',
    module: 'i18n',
    json: false,
    fix: false,
    configFile: undefined,
    files: undefined,
    exclude: undefined,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--module':
        options.module = args[++i];
        break;
      case '--severity':
        options.minSeverity = args[++i];
        break;
      case '--files':
        options.files = args[++i].split(',');
        break;
      case '--exclude':
        options.exclude = args[++i].split(',');
        break;
      case '--config':
        options.configFile = args[++i];
        break;
      case '--json':
        options.json = true;
        break;
      case '--fix':
        options.fix = true;
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
    }
  }

  if (options.module === 'all') {
    await runAllModules(options);
  } else {
    await runSingleModule(options);
  }
}

async function runAllModules(options) {
  console.log(pc.cyan('🛡️  Frontend Guardian Core'));
  console.log(pc.gray(`   Project: ${options.projectDir}`));
  console.log(pc.gray(`   Module: all (9 modules)`));
  console.log('');

  const engine = createEngine({
    projectDir: options.projectDir,
    minSeverity: options.minSeverity,
    files: options.files,
    exclude: options.exclude,
    configFile: options.configFile,
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

  for (const mod of MODULES) {
    try {
      const result = await engine.scan(mod);
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
        const moduleIssues = [
          ...result.issues.critical,
          ...result.issues.warning,
          ...result.issues.suggestion,
        ];
        allFixableIssues.push(...moduleIssues.filter((i) => i.fix));
      }
    } catch (err) {
      console.error(pc.red(`  ❌ [${mod}] 扫描失败:`), err.message || err);
    }
  }

  // 自动修复
  let fixResult = null;
  if (options.fix && allFixableIssues.length > 0) {
    if (!options.json) {
      console.log(pc.cyan('🔧 正在应用自动修复...'));
    }
    fixResult = engine.applyFixes(allFixableIssues);
    if (!options.json) {
      if (fixResult.filesModified.length > 0) {
        console.log(
          pc.green(
            `   ✅ 已修复 ${fixResult.fixedCount} 个问题（${fixResult.filesModified.length} 个文件）`
          )
        );
        for (const f of fixResult.filesModified) {
          console.log(pc.gray(`      - ${f}`));
        }
      } else {
        console.log(pc.yellow('   ⚠️ 未应用任何修复'));
      }
      if (fixResult.errors.length > 0) {
        for (const err of fixResult.errors) {
          console.log(pc.red(`   ❌ ${err}`));
        }
      }
      console.log('');
    }
  }

  if (options.json) {
    const jsonOutput = {
      modules: allResults,
      fix: fixResult,
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

  // 终端输出
  if (totalCritical + totalWarning + totalSuggestion === 0) {
    console.log(pc.green('✅ 未发现问题'));
  } else {
    console.log('');
    console.log(pc.cyan('📊 扫描结果汇总'));
    console.log(pc.red(`   🔴 Critical: ${totalCritical}`));
    console.log(pc.yellow(`   🟡 Warning: ${totalWarning}`));
    console.log(pc.blue(`   💡 Suggestion: ${totalSuggestion}`));
    console.log('');

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
      console.log('');
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
  console.log(pc.cyan('🛡️  Frontend Guardian Core'));
  console.log(pc.gray(`   Project: ${options.projectDir}`));
  console.log(pc.gray(`   Module: ${options.module}`));
  console.log('');

  const engine = createEngine({
    projectDir: options.projectDir,
    minSeverity: options.minSeverity,
    files: options.files,
    exclude: options.exclude,
    configFile: options.configFile,
  });

  // 注册规则
  if (MODULE_RULES[options.module]) {
    engine.registerAll(MODULE_RULES[options.module]);
  } else {
    console.log(pc.red(`❌ 未知模块: ${options.module}`));
    console.log(pc.gray(`   可用模块: ${MODULES.join(', ')}, all`));
    process.exit(1);
  }

  try {
    const result = await engine.scan(options.module);

    const { issues } = result;
    const totalCritical = issues.critical.length;
    const totalWarning = issues.warning.length;
    const totalSuggestion = issues.suggestion.length;

    // 自动修复
    let fixResult = null;
    if (options.fix) {
      const allIssues = [
        ...issues.critical,
        ...issues.warning,
        ...issues.suggestion,
      ];
      const fixableIssues = allIssues.filter((i) => i.fix);
      if (!options.json) {
        console.log(pc.cyan('🔧 正在应用自动修复...'));
      }
      fixResult = engine.applyFixes(fixableIssues);
      if (!options.json) {
        if (fixResult.filesModified.length > 0) {
          console.log(
            pc.green(
              `   ✅ 已修复 ${fixResult.fixedCount} 个问题（${fixResult.filesModified.length} 个文件）`
            )
          );
          for (const f of fixResult.filesModified) {
            console.log(pc.gray(`      - ${f}`));
          }
        } else {
          console.log(pc.yellow('   ⚠️ 未应用任何修复'));
        }
        if (fixResult.errors.length > 0) {
          for (const err of fixResult.errors) {
            console.log(pc.red(`   ❌ ${err}`));
          }
        }
        console.log('');
      }
    }

    if (options.json) {
      const jsonOutput = {
        ...result,
        fix: fixResult,
      };
      console.log(JSON.stringify(jsonOutput, null, 2));
      process.exit(totalCritical > 0 ? 1 : 0);
    }

    // 终端输出
    if (totalCritical + totalWarning + totalSuggestion === 0) {
      console.log(pc.green('✅ 未发现问题'));
    } else {
      console.log(pc.red(`🔴 Critical: ${totalCritical}`));
      console.log(pc.yellow(`🟡 Warning: ${totalWarning}`));
      console.log(pc.blue(`💡 Suggestion: ${totalSuggestion}`));
      console.log('');

      const allIssues = [
        ...issues.critical,
        ...issues.warning,
        ...issues.suggestion,
      ];

      for (const issue of allIssues) {
        printIssue(
          issue,
          issue.severity === 'critical'
            ? pc.red
            : issue.severity === 'warning'
              ? pc.yellow
              : pc.blue
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
    console.error(pc.red('❌ 扫描失败:'), err);
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
  console.log('');
}

main();
