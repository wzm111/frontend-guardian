/**
 * Frontend Guardian Core — 主索引
 * 导出所有公共 API
 */

export type { CacheEntry, CacheManifest } from "./engine/cache.js";
export { SmartCache } from "./engine/cache.js";
export type {
    FileIndex,
    ProjectIndex,
    RouteInfo,
    SymbolInfo,
} from "./engine/indexer.js";
// v3.7.0: Incremental Index & Impact Analysis
export { ProjectIndexer } from "./engine/indexer.js";
export type { EngineOptions } from "./engine/rule-engine.js";
export { createEngine, RuleEngine } from "./engine/rule-engine.js";
// Phase v2.3.0: GitHub Actions Annotation
export {
    formatAllAnnotations,
    formatIssueAnnotation,
    formatIssuesAnnotations,
    isGitHubActions,
    writeJobSummary,
} from "./formatters/github-annotation.js";
export type { CommentMeta } from "./formatters/pr-comment.js";
// v2.5.0: PR/MR 评论发布
export {
    COMMENT_MARKER,
    generatePRComment,
    generatePRCommentSummary,
    isGuardianComment,
} from "./formatters/pr-comment.js";
export type { SarifReport } from "./formatters/sarif.js";
// Phase v2.3.0: SARIF 格式化
export { formatSarif, generateSarif } from "./formatters/sarif.js";
export type { DiagnosticResult, IncrementalDiagnosticOptions } from "./ide/incremental-diagnostic.js";
// v3.3.0: IDE 集成
export { createIncrementalDiagnostic, IncrementalDiagnostic } from "./ide/incremental-diagnostic.js";
export type { LSPServerOptions } from "./ide/lsp-server.js";
export { runLSPServer } from "./ide/lsp-server.js";
export type {
    BrowserName,
    CheckedMiniProgramPage,
    CheckedRoute,
    CoreWebVitalsResult,
    CWVThresholds,
    ExternalTool,
    ExternalToolResult,
    MiniProgramOptions,
    MiniProgramPagePerformance,
    MiniProgramPerformanceData,
    MiniProgramPerformanceThresholds,
    MiniProgramResult,
    PageHealthOptions,
    PageHealthResult,
    VisualRegressionOptions,
    VisualRegressionResult,
} from "./integrations/index.js";
// Phase 4: 外部工具集成
export {
    allExternalTools,
    axeViolationsToIssues,
    buildProfileKey,
    checkCWVThresholds,
    compareScreenshotsPixel,
    eslintIntegration,
    extractCoreWebVitals,
    formatCoreWebVitals,
    formatMiniProgramJson,
    formatMiniProgramReport,
    formatPageHealthJson,
    formatPageHealthReport,
    getBaselinePath,
    getCurrentScreenshotPath,
    getDiffImagePath,
    isAxeCoreAvailable,
    isLighthouseAvailable,
    isPixelmatchAvailable,
    isPlaywrightAvailable,
    isPngjsAvailable,
    playwrightIntegration,
    resolveBrowserTypes,
    runAllExternalTools,
    runLighthouseForUrl,
    runMiniProgramTest,
    runPageHealthCheck,
    safeRouteName,
    stylelintIntegration,
    toMiniProgramScanResult,
    toScanResult,
    typescriptIntegration,
    uploadMiniProgramResult,
    uploadPageHealthResult,
} from "./integrations/index.js";
export type { MCPServerOptions } from "./mcp/mcp-server.js";
// v3.8.0: MCP Server
export { runMCPServer } from "./mcp/mcp-server.js";
export { getToolDefinitions } from "./mcp/tools.js";
export { createRegistry, RuleRegistry } from "./rules/registry.js";
export { a11yRules } from "./scanners/a11y-scanner.js";
export { componentRules } from "./scanners/component-scanner.js";
export { crossFileRules } from "./scanners/cross-file-scanner.js";
// v3.6.0: E2E 测试治理
export { e2eRules } from "./scanners/e2e-scanner.js";
export { hooksRules } from "./scanners/hooks-scanner.js";
export { i18nRules } from "./scanners/i18n-scanner.js";
export { namingRules } from "./scanners/naming-scanner.js";
export { performanceRules } from "./scanners/performance-scanner.js";
export { platformRules } from "./scanners/platform-scanner.js";
export { securityRules } from "./scanners/security-scanner.js";
export { svelteRules } from "./scanners/svelte-scanner.js";
export { generateDashboardHtml } from "./server/dashboard-html.js";
export type {
    DashboardProject,
    DashboardReport,
    DashboardServerOptions,
    ReportPayload,
    TrendPoint,
} from "./server/dashboard-server.js";
// v3.5.2: Governance Dashboard Server
export { DashboardServer } from "./server/dashboard-server.js";
export type {
    ComponentLib,
    CustomRuleConfig,
    Fix,
    Framework as BaseFramework,
    ImportInfo,
    Issue,
    ParseOptions,
    Platform,
    Position,
    ProjectConfig,
    ProjectMeta,
    Rule,
    RuleCategory,
    RuleConfig,
    RuleContext,
    RuleUtils,
    ScanResult,
    Severity,
} from "./types.js";
export type { AIConfig, AIFixSuggestion, AIProvider } from "./utils/ai-fix-suggester.js";
// v3.0.0: AI 修复建议
export { AIFixSuggester, detectAIConfig, generateAIFixSuggestions } from "./utils/ai-fix-suggester.js";
export { getImports, hasImport, parseAST, walkAST } from "./utils/ast-parser.js";
export type { BaselineFile, BaselineIssue, BaselineResult } from "./utils/baseline.js";
// Phase v2.3.0: Baseline 管理
export {
    BaselineManager,
    compareWithBaseline,
    downloadBaseline,
    generateBaseline,
    loadBaseline,
    loadBaselineAsync,
    saveBaseline,
    toBaselineIssue,
} from "./utils/baseline.js";
export type { CIGeneratorOptions, CIProvider } from "./utils/ci-generator.js";
export { detectCIProvider, generateCIConfig } from "./utils/ci-generator.js";
export type { CodeownersEntry, CodeownersResult } from "./utils/codeowners.js";
// v3.5.0: Enterprise team collaboration
export { CodeownersParser, findCodeowners, loadCodeowners, matchOwner, parseCodeowners } from "./utils/codeowners.js";
export { getFileExt, getJSXTagName } from "./utils/common.js";
export type {
    ComplianceControl,
    ComplianceFinding,
    ComplianceRecommendation,
    ComplianceReport,
    RuleComplianceMapping,
} from "./utils/compliance.js";
// v3.5.0: Compliance report
export {
    complianceReportToMarkdown,
    generateComplianceReport,
    getComplianceMapping,
    registerComplianceMapping,
    saveComplianceReport,
} from "./utils/compliance.js";
export { getAdaptiveConcurrency } from "./utils/concurrent.js";
export { loadConfig } from "./utils/config-loader.js";
export type { DashboardOptions } from "./utils/dashboard.js";
// v2.8.0: 趋势看板
export { generateDashboard } from "./utils/dashboard.js";
export type {
    DashboardClientConfig,
    DashboardReportPayload,
    DashboardUploadResult,
} from "./utils/dashboard-client.js";
export {
    detectDashboardConfig,
    uploadToDashboardServer,
} from "./utils/dashboard-client.js";
export type {
    E2EGapOptions,
    E2EGapResult,
    TestSuggestion,
    UncoveredApi,
    UncoveredPage,
} from "./utils/e2e-gap-detector.js";
export {
    detectE2EGaps,
    formatE2EGapJson,
    formatE2EGapReport,
} from "./utils/e2e-gap-detector.js";
export type { WatchOptions } from "./utils/file-watcher.js";
export { FileWatcher, watchProject } from "./utils/file-watcher.js";
export type { FixBotConfig, FixBotResult } from "./utils/fix-bot.js";
// v2.6.0: 自动修复 Bot
export { detectFixBotConfig, runFixBot } from "./utils/fix-bot.js";
export { detectHusky, hasGitHook, installGitHooks, uninstallGitHooks } from "./utils/git-hooks.js";
export type {
    ComparedIssue,
    HistoryCompareOptions,
    HistoryCompareResult,
    IssueStatus,
    ReportRef,
} from "./utils/history-compare.js";
// v3.1.0: 历史报告对比
export { compareHistoryReports, formatHistoryCompare, formatHistoryCompareJson } from "./utils/history-compare.js";
export type { FullReport, HistoryEntry, TrendAnalysis } from "./utils/history-report.js";
export { HistoryReport } from "./utils/history-report.js";
export { generateDefaultConfig, initConfig } from "./utils/init-config.js";
export type { CrossPackageIssue, MonorepoInfo, MonorepoTool, WorkspacePackage } from "./utils/monorepo.js";
// v2.9.0: Monorepo 工作区支持
export { analyzeCrossPackageDeps, detectMonorepo } from "./utils/monorepo.js";
export type { NotificationConfig, NotificationPayload, NotificationResult } from "./utils/notification.js";
export {
    buildNotificationPayload,
    detectNotificationConfig,
    sendNotifications,
} from "./utils/notification.js";
export type { PRPublisher, PublisherConfig, PublishResult } from "./utils/pr-publisher.js";
export {
    autoPublishComment,
    createPublisher,
    detectPublisherConfig,
    GitHubPRPublisher,
    GitLabMRPublisher,
} from "./utils/pr-publisher.js";
export { detectProjectMeta } from "./utils/project-detector.js";
export type { UploadConfig, UploadResult } from "./utils/report-uploader.js";
// v2.5.0: 报告上传
export { detectUploadConfig, uploadReport } from "./utils/report-uploader.js";
export type { Framework, ParsedRoutes } from "./utils/route-parser.js";
export {
    detectRouteFramework,
    findRouteFiles,
    parseAllRoutes,
    parseNextJsRoutes,
    parseNuxtRoutes,
    parseReactRouterConfig,
    parseRoutes,
    parseTaroRoutes,
    parseUniAppRoutes,
    parseVueRouterConfig,
} from "./utils/route-parser.js";
// v3.12.1: flaky 测试预警
export type { FlakyTestInfo, FlakyTestThresholds, TestRunRecord } from "./utils/test-history.js";
export { analyzeFlakyTests, detectFlakyTests, TestHistoryReport } from "./utils/test-history.js";
export type { RecommendTestsOptions, RecommendTestsResult, TestRecommendation } from "./utils/test-recommender.js";
// v3.9.0: Intelligent Test Recommendation
export {
    formatRecommendations,
    formatRecommendationsJson,
    recommendTests,
} from "./utils/test-recommender.js";
export type {
    PackageScanResult,
    WorkspaceScanOptions,
    WorkspaceScanResult,
    WorkspaceSummary,
} from "./utils/workspace-scanner.js";
export { formatWorkspaceJson, formatWorkspaceReport, scanWorkspace } from "./utils/workspace-scanner.js";
