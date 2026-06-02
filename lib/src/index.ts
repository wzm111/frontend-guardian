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
    Framework,
    Platform,
    ComponentLib,
    RuleCategory,
} from "./types.js";

export { parseAST, getImports, hasImport, walkAST } from "./utils/ast-parser.js";
export { detectProjectMeta } from "./utils/project-detector.js";
export { loadConfig } from "./utils/config-loader.js";
export { initConfig, generateDefaultConfig } from "./utils/init-config.js";
export { installGitHooks, uninstallGitHooks, hasGitHook, detectHusky } from "./utils/git-hooks.js";
export { generateCIConfig, detectCIProvider } from "./utils/ci-generator.js";
export type { CIProvider, CIGeneratorOptions } from "./utils/ci-generator.js";
export { HistoryReport } from "./utils/history-report.js";
export type { HistoryEntry, TrendAnalysis } from "./utils/history-report.js";

// v2.5.0: 报告上传
export { uploadReport, detectUploadConfig } from "./utils/report-uploader.js";
export type { UploadConfig, UploadResult } from "./utils/report-uploader.js";

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
    runAllExternalTools,
} from "./integrations/index.js";
export type { ExternalTool, ExternalToolResult } from "./integrations/index.js";

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
export { getFileExt, getJSXTagName } from "./utils/common.js";
