/**
 * v3.3.0: LSP 服务器 — Language Server Protocol 实现
 *
 * 为 IDE 提供标准化的语言服务：
 * - textDocument/diagnostic: 实时问题诊断
 * - textDocument/codeAction: 快速修复建议
 *
 * 启动方式: node bin/fg-lsp.js --stdio
 */

import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    TextDocumentSyncKind,
    type Connection,
    type InitializeParams,
    type InitializeResult,
    type TextDocumentChangeEvent,
    type Diagnostic as LspDiagnostic,
    type CodeAction,
    type CodeActionParams,
    type Command,
    DiagnosticSeverity,
    CodeActionKind,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { IncrementalDiagnostic } from "./incremental-diagnostic.js";
import type { Issue, Severity } from "@/types.js";

export interface LSPServerOptions {
    /** 项目根目录 */
    projectDir: string;
    /** 最低 severity */
    minSeverity?: Severity;
    /** 配置文件路径 */
    configFile?: string;
    /** 诊断防抖间隔（毫秒，默认 300） */
    debounceMs?: number;
}

/** 运行 LSP 服务器 */
export function runLSPServer(options: LSPServerOptions): void {
    const connection = createConnection(ProposedFeatures.all);
    const documents = new TextDocuments(TextDocument);

    const diagnostic = new IncrementalDiagnostic({
        projectDir: options.projectDir,
        minSeverity: options.minSeverity,
        configFile: options.configFile,
        cache: true,
    });

    // 防抖定时器
    const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const debounceMs = options.debounceMs ?? 300;

    // ── 生命周期 ──

    connection.onInitialize((_params: InitializeParams): InitializeResult => {
        return {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,
                // 提供代码动作（快速修复）
                codeActionProvider: {
                    codeActionKinds: [CodeActionKind.QuickFix],
                },
                // v3.3.0: 提供诊断
                diagnosticProvider: {
                    interFileDependencies: false,
                    workspaceDiagnostics: false,
                },
            },
        };
    });

    // ── 文档变更监听 ──

    documents.onDidChangeContent((change: TextDocumentChangeEvent<TextDocument>) => {
        const uri = change.document.uri;
        const filePath = uriToFilePath(uri);
        if (!filePath) return;

        // 清除旧的防抖定时器
        const oldTimer = debounceTimers.get(uri);
        if (oldTimer) clearTimeout(oldTimer);

        // 设置新的防抖定时器
        const timer = setTimeout(async () => {
            debounceTimers.delete(uri);

            const content = change.document.getText();
            const result = await diagnostic.diagnose(filePath, content);

            // 发送诊断结果到客户端
            const lspDiagnostics = result.issues.map((issue) => issueToDiagnostic(issue));
            connection.sendDiagnostics({ uri, diagnostics: lspDiagnostics });
        }, debounceMs);

        debounceTimers.set(uri, timer);
    });

    documents.onDidOpen((change: TextDocumentChangeEvent<TextDocument>) => {
        const uri = change.document.uri;
        const filePath = uriToFilePath(uri);
        if (!filePath) return;

        // 打开文档时立即诊断（无防抖）
        diagnostic.diagnose(filePath, change.document.getText()).then((result) => {
            const lspDiagnostics = result.issues.map((issue) => issueToDiagnostic(issue));
            connection.sendDiagnostics({ uri, diagnostics: lspDiagnostics });
        });
    });

    documents.onDidClose((change: TextDocumentChangeEvent<TextDocument>) => {
        const uri = change.document.uri;
        const filePath = uriToFilePath(uri);
        if (filePath) {
            diagnostic.invalidate(filePath);
        }
        // 清除该文档的诊断
        connection.sendDiagnostics({ uri, diagnostics: [] });

        // 清除防抖定时器
        const timer = debounceTimers.get(uri);
        if (timer) {
            clearTimeout(timer);
            debounceTimers.delete(uri);
        }
    });

    // ── Code Actions（快速修复）─ ─

    connection.onCodeAction((params: CodeActionParams): (CodeAction | Command)[] => {
        const uri = params.textDocument.uri;
        const filePath = uriToFilePath(uri);
        if (!filePath) return [];

        const cached = diagnostic["diagnosticCache"].get(filePath);
        if (!cached) return [];

        const actions: CodeAction[] = [];

        for (const issue of cached) {
            if (!issue.fix) continue;

            // 只处理在选中范围内的 issue
            const range = issueToRange(issue);
            const intersects =
                range.start.line <= params.range.end.line &&
                range.end.line >= params.range.start.line;
            if (!intersects) continue;

            const action: CodeAction = {
                title: `🔧 ${issue.title}`,
                kind: CodeActionKind.QuickFix,
                diagnostics: [issueToDiagnostic(issue)],
                isPreferred: (issue.fix.confidence ?? "high") === "high",
                edit: {
                    changes: {
                        [uri]: [
                            {
                                range,
                                newText: issue.fix.text,
                            },
                        ],
                    },
                },
            };
            actions.push(action);
        }

        return actions;
    });

    // ── 启动 ──

    documents.listen(connection);
    connection.listen();
}

// ── 辅助函数 ──

/** URI 转文件路径 */
function uriToFilePath(uri: string): string | undefined {
    if (uri.startsWith("file://")) {
        // 简单解码 file URI
        const decoded = decodeURIComponent(uri.slice(7));
        return decoded;
    }
    return undefined;
}

/** Issue 转 LSP Diagnostic */
function issueToDiagnostic(issue: Issue): LspDiagnostic {
    const severityMap: Record<Severity, DiagnosticSeverity> = {
        critical: DiagnosticSeverity.Error,
        warning: DiagnosticSeverity.Warning,
        suggestion: DiagnosticSeverity.Information,
    };

    return {
        severity: severityMap[issue.severity],
        code: issue.ruleId,
        source: "frontend-guardian",
        message: `${issue.title}\n${issue.description ?? ""}`,
        range: issueToRange(issue),
        ...(issue.docsUrl ? { codeDescription: { href: issue.docsUrl } } : {}),
    };
}

/** Issue 转 LSP Range */
function issueToRange(issue: Issue): { start: { line: number; character: number }; end: { line: number; character: number } } {
    // Issue 的 line/column 是 1-based，LSP 是 0-based
    const line = Math.max(0, issue.line - 1);
    const character = Math.max(0, (issue.column ?? 1) - 1);

    // 如果 issue 有 fix 信息，使用 fix 的范围
    if (issue.fix?.start && issue.fix?.end) {
        return {
            start: {
                line: Math.max(0, issue.fix.start.line - 1),
                character: Math.max(0, (issue.fix.start.column ?? 1) - 1),
            },
            end: {
                line: Math.max(0, issue.fix.end.line - 1),
                character: Math.max(0, (issue.fix.end.column ?? 1) - 1),
            },
        };
    }

    // 默认：只标记一行
    return {
        start: { line, character },
        end: { line, character: character + 1 },
    };
}
