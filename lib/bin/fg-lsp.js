#!/usr/bin/env node

/**
 * Frontend Guardian LSP Server
 * Usage: fg-lsp --stdio [--project-dir <dir>] [--config <file>]
 *
 * v3.3.0: Language Server Protocol 实现，为 IDE 提供实时诊断和快速修复。
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runLSPServer } from "../dist/ide/lsp-server.js";

const args = process.argv.slice(2);

// 解析参数
let projectDir = process.cwd();
let configFile;
let minSeverity = "suggestion";

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--project-dir" || arg === "-p") {
        projectDir = resolve(args[++i] ?? process.cwd());
    } else if (arg === "--config" || arg === "-c") {
        configFile = resolve(args[++i] ?? "");
    } else if (arg === "--severity" || arg === "-s") {
        minSeverity = args[++i] ?? "suggestion";
    } else if (arg === "--help" || arg === "-h") {
        console.log(`Frontend Guardian LSP Server v3.13.0

Usage: fg-lsp [options]

Options:
  --project-dir, -p <dir>   项目根目录（默认当前目录）
  --config, -c <file>       配置文件路径
  --severity, -s <level>    最低严重级别: critical|warning|suggestion（默认 suggestion）
  --help, -h                显示帮助

Environment:
  FG_PROJECT_DIR            项目根目录（优先级低于 --project-dir）

Examples:
  fg-lsp --stdio
  fg-lsp --project-dir ./my-project --config .frontend-guardian.yml
`);
        process.exit(0);
    }
}

// 环境变量回退
if (process.env.FG_PROJECT_DIR && !args.includes("--project-dir") && !args.includes("-p")) {
    projectDir = resolve(process.env.FG_PROJECT_DIR);
}

// 验证项目目录
if (!existsSync(projectDir)) {
    console.error(`Error: Project directory does not exist: ${projectDir}`);
    process.exit(1);
}

// 启动 LSP 服务器
runLSPServer({
    projectDir,
    configFile,
    minSeverity,
    debounceMs: 300,
});
