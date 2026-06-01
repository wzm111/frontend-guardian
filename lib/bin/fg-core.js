#!/usr/bin/env node
/**
 * Frontend Guardian Core CLI
 * Usage: fg-core [options] <project-dir>
 */

import { createEngine, i18nRules } from '../dist/index.js';
import pc from 'picocolors';

function showHelp() {
  console.log(`
Frontend Guardian Core v1.0.0

Usage:
  fg-core <project-dir> [options]

Options:
  --module <name>      扫描模块: i18n | component | hooks | platform | performance | a11y | security
  --severity <level>   最低严重级别: critical | warning | suggestion (默认: suggestion)
  --files <pattern>    仅扫描匹配的文件
  --exclude <pattern>  排除匹配的文件
  --json               以 JSON 格式输出
  --fix                自动修复可修复的问题
  --config <file>      指定配置文件
  --help, -h           显示帮助

Examples:
  fg-core ./my-project --module i18n
  fg-core ./my-project --module i18n --severity warning --json
  fg-core ./my-project --module performance --files "src/**/*.tsx"
`);
}

async function main() {
  const args = process.argv.slice(2);
  const projectDir = args.find(arg => !arg.startsWith('-')) || process.cwd();

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

  console.log(pc.cyan('🛡️  Frontend Guardian Core'));
  console.log(pc.gray(`   Project: ${projectDir}`));
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
  switch (options.module) {
    case 'i18n':
      engine.registerAll(i18nRules);
      break;
    case 'performance':
    case 'a11y':
    case 'security':
    case 'component':
    case 'hooks':
    case 'platform':
      console.log(pc.yellow(`⚠️  模块 "${options.module}" 尚在开发中，将使用占位规则`));
      break;
    default:
      console.log(pc.red(`❌ 未知模块: ${options.module}`));
      process.exit(1);
  }

  try {
    const result = await engine.scan(options.module);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }

    // 终端输出
    const { issues } = result;
    const totalCritical = issues.critical.length;
    const totalWarning = issues.warning.length;
    const totalSuggestion = issues.suggestion.length;

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
        const color = issue.severity === 'critical' ? pc.red :
                     issue.severity === 'warning' ? pc.yellow : pc.blue;
        console.log(color(`  [${issue.severity.toUpperCase()}] ${issue.title}`));
        console.log(`    📄 ${issue.file}:${issue.line}:${issue.column}`);
        console.log(`    ${issue.description}`);
        if (issue.source) {
          console.log(pc.gray(`    > ${issue.source}`));
        }
        console.log('');
      }
    }

    console.log(pc.gray(`⏱️  耗时: ${result.duration}ms | 扫描 ${result.filesScanned} 个文件 | ${result.filesWithIssues} 个文件有问题`));

    // 如果有 critical，退出码为 1
    if (totalCritical > 0) {
      process.exit(1);
    }

  } catch (err) {
    console.error(pc.red('❌ 扫描失败:'), err);
    process.exit(1);
  }
}

main();
