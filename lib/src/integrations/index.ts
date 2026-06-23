/**
 * 外部工具集成索引
 * Phase 4: 覆盖全面化 — 集成 ESLint / TypeScript / Stylelint
 */

export type { ExternalTool, ExternalToolResult } from "./base.js";
export { eslintSeverityToFg, hasPackage, runAllExternalTools, runCommand } from "./base.js";

import { eslintIntegration as _eslintIntegration } from "./eslint.js";
import { stylelintIntegration as _stylelintIntegration } from "./stylelint.js";
import { typescriptIntegration as _typescriptIntegration } from "./typescript.js";

export {
    _eslintIntegration as eslintIntegration,
    _stylelintIntegration as stylelintIntegration,
    _typescriptIntegration as typescriptIntegration,
};

// v3.6.1: Playwright E2E 测试集成
import { playwrightIntegration as _playwrightIntegration } from "./playwright.js";

export type { CoreWebVitalsResult, CWVThresholds } from "../utils/lighthouse-metrics.js";
export {
    checkCWVThresholds,
    extractCoreWebVitals,
    formatCoreWebVitals,
    isLighthouseAvailable,
    runLighthouseForUrl,
} from "../utils/lighthouse-metrics.js";
// v3.10.1: 浏览器/视口 profile 工具
export {
    buildProfileKey,
    parseViewport,
    resolveBrowserTypes,
    sanitizeProfileName,
} from "../utils/page-health-profile.js";
export type { AxeRunResult, AxeViolation } from "../utils/runtime-a11y.js";
export { axeViolationsToIssues, isAxeCoreAvailable, mapAxeImpact, runAxeOnPage } from "../utils/runtime-a11y.js";
export type { VisualRegressionOptions, VisualRegressionResult } from "../utils/visual-regression.js";
// v3.10.0: 页面测试进阶工具
export {
    compareScreenshotsPixel,
    getBaselinePath,
    getCurrentScreenshotPath,
    getDiffImagePath,
    isPixelmatchAvailable,
    isPngjsAvailable,
    safeRouteName,
} from "../utils/visual-regression.js";
export type {
    BrowserName,
    CheckedRoute,
    PageHealthOptions,
    PageHealthResult,
} from "./page-health.js";
// v3.7.1: 页面健康检查
export {
    formatPageHealthJson,
    formatPageHealthReport,
    isPlaywrightAvailable,
    runPageHealthCheck,
    toScanResult,
    uploadPageHealthResult,
} from "./page-health.js";
export { _playwrightIntegration as playwrightIntegration };
export const allExternalTools = [
    _eslintIntegration,
    _typescriptIntegration,
    _stylelintIntegration,
    _playwrightIntegration,
];

// v3.11.1: 小程序自动化测试（微信/支付宝/抖音）
export type {
    CheckedMiniProgramPage,
    MiniProgramOptions,
    MiniProgramResult,
} from "./miniprogram.js";
export {
    formatMiniProgramJson,
    formatMiniProgramReport,
    runMiniProgramTest,
    toScanResult as toMiniProgramScanResult,
    uploadMiniProgramResult,
} from "./miniprogram.js";
export type { FormatResult, FormatterTool } from "./formatter.js";
// Phase 5+6: 格式化器集成
export { detectFormatter, runFormat } from "./formatter.js";
