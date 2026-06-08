/**
 * 外部工具集成索引
 * Phase 4: 覆盖全面化 — 集成 ESLint / TypeScript / Stylelint
 */

export type { ExternalTool, ExternalToolResult } from "./base.js";
export { runAllExternalTools, runCommand, eslintSeverityToFg, hasPackage } from "./base.js";

import { eslintIntegration as _eslintIntegration } from "./eslint.js";
import { typescriptIntegration as _typescriptIntegration } from "./typescript.js";
import { stylelintIntegration as _stylelintIntegration } from "./stylelint.js";

export { _eslintIntegration as eslintIntegration };
export { _typescriptIntegration as typescriptIntegration };
export { _stylelintIntegration as stylelintIntegration };

// v3.6.1: Playwright E2E 测试集成
import { playwrightIntegration as _playwrightIntegration } from "./playwright.js";
export { _playwrightIntegration as playwrightIntegration };

/** 所有可用的外部工具列表 */
export const allExternalTools = [
    _eslintIntegration,
    _typescriptIntegration,
    _stylelintIntegration,
    _playwrightIntegration,
];

// Phase 5+6: 格式化器集成
export { detectFormatter, runFormat } from "./formatter.js";
export type { FormatResult, FormatterTool } from "./formatter.js";
