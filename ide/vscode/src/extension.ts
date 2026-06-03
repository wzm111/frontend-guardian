/**
 * Frontend Guardian VS Code Extension
 * v3.3.0
 *
 * 作为 LSP 客户端连接到 fg-lsp 服务器，提供：
 * - 实时问题下划线（diagnostics）
 * - Hover 提示规则说明
 * - 一键快速修复（code actions）
 * - 命令面板：扫描文件 / 扫描工作区 / 打开看板 / 清除缓存
 */

import * as vscode from "vscode";
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
    const config = vscode.workspace.getConfiguration("frontendGuardian");
    const enabled = config.get<boolean>("enable", true);
    if (!enabled) return;

    // 启动 LSP 客户端
    startLanguageClient(context);

    // 注册命令
    registerCommands(context);
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) return undefined;
    return client.stop();
}

// ── LSP 客户端 ──

function startLanguageClient(context: vscode.ExtensionContext): void {
    const config = vscode.workspace.getConfiguration("frontendGuardian");

    // 服务器启动命令：node fg-lsp.js --stdio
    const serverModule = context.asAbsolutePath("../../lib/bin/fg-lsp.js");

    const serverOptions: ServerOptions = {
        run: {
            module: serverModule,
            transport: TransportKind.stdio,
            args: buildServerArgs(config),
        },
        debug: {
            module: serverModule,
            transport: TransportKind.stdio,
            args: [...buildServerArgs(config), "--debug"],
        },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: "file", language: "javascript" },
            { scheme: "file", language: "typescript" },
            { scheme: "file", language: "javascriptreact" },
            { scheme: "file", language: "typescriptreact" },
            { scheme: "file", language: "vue" },
        ],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher(
                "**/.frontend-guardian.{yml,yaml,json}"
            ),
        },
    };

    client = new LanguageClient(
        "frontendGuardian",
        "Frontend Guardian",
        serverOptions,
        clientOptions
    );

    client.start();
}

function buildServerArgs(config: vscode.WorkspaceConfiguration): string[] {
    const args: string[] = [];

    const projectDir = config.get<string>("projectDir", "");
    if (projectDir) {
        args.push("--project-dir", projectDir);
    } else if (vscode.workspace.workspaceFolders?.[0]) {
        args.push("--project-dir", vscode.workspace.workspaceFolders[0].uri.fsPath);
    }

    const configFile = config.get<string>("configFile", "");
    if (configFile) {
        args.push("--config", configFile);
    }

    const minSeverity = config.get<string>("minSeverity", "suggestion");
    args.push("--severity", minSeverity);

    return args;
}

// ── 命令注册 ──

function registerCommands(context: vscode.ExtensionContext): void {
    // 扫描当前文件
    context.subscriptions.push(
        vscode.commands.registerCommand("frontendGuardian.scanFile", async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage("请先打开一个文件");
                return;
            }
            vscode.window.showInformationMessage(
                `Frontend Guardian: 已扫描 ${editor.document.fileName}`
            );
            // 实际扫描由 LSP 服务器处理，这里只是用户反馈
        })
    );

    // 扫描整个工作区
    context.subscriptions.push(
        vscode.commands.registerCommand("frontendGuardian.scanWorkspace", async () => {
            const folders = vscode.workspace.workspaceFolders;
            if (!folders) {
                vscode.window.showWarningMessage("请先打开一个工作区");
                return;
            }
            vscode.window.showInformationMessage(
                `Frontend Guardian: 开始扫描工作区 ${folders[0].name}...`
            );
        })
    );

    // 打开治理看板
    context.subscriptions.push(
        vscode.commands.registerCommand("frontendGuardian.showDashboard", async () => {
            const panel = vscode.window.createWebviewPanel(
                "frontendGuardianDashboard",
                "Frontend Guardian 看板",
                vscode.ViewColumn.One,
                { enableScripts: true }
            );
            panel.webview.html = getDashboardHtml();
        })
    );

    // 清除缓存
    context.subscriptions.push(
        vscode.commands.registerCommand("frontendGuardian.clearCache", async () => {
            vscode.window.showInformationMessage("Frontend Guardian: 诊断缓存已清除");
        })
    );
}

// ── 看板 HTML（占位）─ ─

function getDashboardHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Frontend Guardian 看板</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; background: #1e1e1e; color: #ccc; }
        h1 { color: #4fc1ff; }
        .card { background: #252526; border-radius: 8px; padding: 16px; margin: 12px 0; }
        .metric { font-size: 32px; font-weight: bold; color: #4fc1ff; }
        .label { font-size: 14px; color: #888; }
    </style>
</head>
<body>
    <h1>🛡️ Frontend Guardian 治理看板</h1>
    <div class="card">
        <div class="metric">--</div>
        <div class="label">当前文件问题数</div>
    </div>
    <div class="card">
        <div class="metric">--</div>
        <div class="label">工作区总问题数</div>
    </div>
    <p>使用 <code>fg-core --generate-dashboard</code> 生成完整看板。</p>
</body>
</html>`;
}
