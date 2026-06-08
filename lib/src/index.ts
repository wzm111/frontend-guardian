/**
 * Frontend Guardian Core — 主索引
 * 导出所有公共 API
 */

export { RuleEngine, createEngine } from "./engine/rule-engine.js";
export type { EngineOptions } from "./engine/rule-engine.js";
export { SmartCache } from "./engine/cache.js";
export type { CacheEntry, CacheManifest } from "./engine/cache.js";
export { RuleRegistry, createRegistry } from "./rules/registry.js";
export type {
    Rule,
    RuleContext,
    RuleConfig,
    CustomRuleConfig,
    Issue,
    Severity,
    ScanResult,
    ProjectConfig,
    ProjectMeta,
    RuleUtils,
    Fix,
    Position,
    ImportInfo,
    ParseOptions,
    Framework as BaseFramework,
    Platform,
    ComponentLib,
    RuleCategory,
} from "./types.js";

export { parseAST, getImports, hasImport, walkAST } from "./utils/ast-parser.js";
export { getAdaptiveConcurrency } from "./utils/concurrent.js";
export { detectProjectMeta } from "./utils/project-detector.js";
export { loadConfig } from "./utils/config-loader.js";
export { initConfig, generateDefaultConfig } from "./utils/init-config.js";
export { installGitHooks, uninstallGitHooks, hasGitHook, detectHusky } from "./utils/git-hooks.js";
export { generateCIConfig, detectCIProvider } from "./utils/ci-generator.js";
export type { CIProvider, CIGeneratorOptions } from "./utils/ci-generator.js";
export { HistoryReport } from "./utils/history-report.js";
export type { HistoryEntry, TrendAnalysis, FullReport } from "./utils/history-report.js";

// v2.8.0: 趋势看板
export { generateDashboard } from "./utils/dashboard.js";
export type { DashboardOptions } from "./utils/dashboard.js";

// v2.9.0: Monorepo 工作区支持
export { detectMonorepo, analyzeCrossPackageDeps } from "./utils/monorepo.js";
export type { MonorepoInfo, WorkspacePackage, CrossPackageIssue, MonorepoTool } from "./utils/monorepo.js";
export { scanWorkspace, formatWorkspaceReport, formatWorkspaceJson } from "./utils/workspace-scanner.js";
export type { WorkspaceScanResult, PackageScanResult, WorkspaceSummary, WorkspaceScanOptions } from "./utils/workspace-scanner.js";

// v3.0.0: AI 修复建议
export { AIFixSuggester, detectAIConfig, generateAIFixSuggestions } from "./utils/ai-fix-suggester.js";
export type { AIConfig, AIProvider, AIFixSuggestion } from "./utils/ai-fix-suggester.js";

// v3.1.0: 历史报告对比
export { compareHistoryReports, formatHistoryCompare, formatHistoryCompareJson } from "./utils/history-compare.js";
export type { HistoryCompareResult, HistoryCompareOptions, ComparedIssue, IssueStatus, ReportRef } from "./utils/history-compare.js";

// v2.5.0: 报告上传
export { uploadReport, detectUploadConfig } from "./utils/report-uploader.js";
export type { UploadConfig, UploadResult } from "./utils/report-uploader.js";

// v2.6.0: 自动修复 Bot
export { runFixBot, detectFixBotConfig } from "./utils/fix-bot.js";
export type { FixBotConfig, FixBotResult } from "./utils/fix-bot.js";

// Phase v2.3.0: Baseline 管理
export { BaselineManager, compareWithBaseline, generateBaseline, loadBaseline, saveBaseline, toBaselineIssue } from "./utils/baseline.js";
export type { BaselineFile, BaselineIssue, BaselineResult } from "./utils/baseline.js";

// Phase v2.3.0: SARIF 格式化
export { generateSarif, formatSarif } from "./formatters/sarif.js";
export type { SarifReport } from "./formatters/sarif.js";

// Phase v2.3.0: GitHub Actions Annotation
export {
    formatIssueAnnotation,
    formatIssuesAnnotations,
    formatAllAnnotations,
    isGitHubActions,
    writeJobSummary,
} from "./formatters/github-annotation.js";

// v2.5.0: PR/MR 评论发布
export {
    generatePRComment,
    generatePRCommentSummary,
    COMMENT_MARKER,
    isGuardianComment,
} from "./formatters/pr-comment.js";
export type { CommentMeta } from "./formatters/pr-comment.js";

export {
    GitHubPRPublisher,
    GitLabMRPublisher,
    detectPublisherConfig,
    createPublisher,
    autoPublishComment,
} from "./utils/pr-publisher.js";
export type { PublishResult, PublisherConfig, PRPublisher } from "./utils/pr-publisher.js";

// Phase 4: 外部工具集成
export {
    allExternalTools,
    eslintIntegration,
    typescriptIntegration,
    stylelintIntegration,
    playwrightIntegration,
    runAllExternalTools,
    runPageHealthCheck,
    isPlaywrightAvailable,
    formatPageHealthReport,
    formatPageHealthJson,
} from "./integrations/index.js";
export type {
    ExternalTool,
    ExternalToolResult,
    PageHealthOptions,
    PageHealthResult,
    CheckedRoute,
} from "./integrations/index.js";

export { i18nRules } from "./scanners/i18n-scanner.js";

export { performanceRules } from "./scanners/performance-scanner.js";
export { a11yRules } from "./scanners/a11y-scanner.js";
export { securityRules } from "./scanners/security-scanner.js";
export { namingRules } from "./scanners/naming-scanner.js";
export { crossFileRules } from "./scanners/cross-file-scanner.js";
export { componentRules } from "./scanners/component-scanner.js";
export { hooksRules } from "./scanners/hooks-scanner.js";
export { platformRules } from "./scanners/platform-scanner.js";
export { svelteRules } from "./scanners/svelte-scanner.js";
// v3.6.0: E2E 测试治理
export { e2eRules } from "./scanners/e2e-scanner.js";
export {
    detectE2EGaps,
    formatE2EGapReport,
    formatE2EGapJson,
} from "./utils/e2e-gap-detector.js";
export type {
    E2EGapResult,
    E2EGapOptions,
    UncoveredPage,
    UncoveredApi,
    TestSuggestion,
} from "./utils/e2e-gap-detector.js";
// v3.3.0: IDE 集成
export { IncrementalDiagnostic, createIncrementalDiagnostic } from "./ide/incremental-diagnostic.js";
export type { DiagnosticResult, IncrementalDiagnosticOptions } from "./ide/incremental-diagnostic.js";
export { runLSPServer } from "./ide/lsp-server.js";
export type { LSPServerOptions } from "./ide/lsp-server.js";

// v3.5.0: Enterprise team collaboration
export { CodeownersParser, findCodeowners, parseCodeowners, loadCodeowners, matchOwner } from "./utils/codeowners.js";
export type { CodeownersEntry, CodeownersResult } from "./utils/codeowners.js";
export {
    sendNotifications,
    detectNotificationConfig,
    buildNotificationPayload,
} from "./utils/notification.js";
export type { NotificationConfig, NotificationPayload, NotificationResult } from "./utils/notification.js";
export { downloadBaseline, loadBaselineAsync } from "./utils/baseline.js";

// v3.5.0: Compliance report
export {
    generateComplianceReport,
    complianceReportToMarkdown,
    saveComplianceReport,
    getComplianceMapping,
    registerComplianceMapping,
} from "./utils/compliance.js";
export type {
    ComplianceControl,
    ComplianceFinding,
    ComplianceRecommendation,
    ComplianceReport,
    RuleComplianceMapping,
} from "./utils/compliance.js";

export { getFileExt, getJSXTagName } from "./utils/common.js";

// v3.5.2: Governance Dashboard Server
export { DashboardServer } from "./server/dashboard-server.js";
export type {
    DashboardProject,
    DashboardReport,
    DashboardServerOptions,
    ReportPayload,
    TrendPoint,
} from "./server/dashboard-server.js";
export { generateDashboardHtml } from "./server/dashboard-html.js";
export {
    uploadToDashboardServer,
    detectDashboardConfig,
} from "./utils/dashboard-client.js";
export type {
    DashboardClientConfig,
    DashboardUploadResult,
    DashboardReportPayload,
} from "./utils/dashboard-client.js";

// v3.7.0: Incremental Index & Impact Analysis
export { ProjectIndexer } from "./engine/indexer.js";
export type {
    SymbolInfo,
    RouteInfo,
    FileIndex,
    ProjectIndex,
} from "./engine/indexer.js";
export { FileWatcher, watchProject } from "./utils/file-watcher.js";
export type { WatchOptions } from "./utils/file-watcher.js";
export {
    parseRoutes,
    parseAllRoutes,
    findRouteFiles,
    parseNextJsRoutes,
    parseNuxtRoutes,
    parseUniAppRoutes,
    parseTaroRoutes,
    parseReactRouterConfig,
    parseVueRouterConfig,
    detectRouteFramework,
} from "./utils/route-parser.js";
export type { Framework, ParsedRoutes } from "./utils/route-parser.js";
