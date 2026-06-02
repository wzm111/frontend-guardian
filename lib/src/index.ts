/**
 * Frontend Guardian Core — 主索引
 * 导出所有公共 API
 */

export { RuleEngine, createEngine } from "./engine/rule-engine.js";
export type { EngineOptions } from "./engine/rule-engine.js";
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
