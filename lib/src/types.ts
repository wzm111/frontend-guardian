/**
 * Core type definitions for frontend-guardian rule engine
 */

export type Severity = "critical" | "warning" | "suggestion";
export type Platform =
    | "pc"
    | "h5"
    | "wechat-mp"
    | "alipay-mp"
    | "douyin-mp"
    | "app"
    | "harmony"
    | "flutter"
    | "react-native";
export type Framework =
    | "react"
    | "vue"
    | "nextjs"
    | "nuxt"
    | "uniapp"
    | "taro"
    | "flutter"
    | "react-native"
    | "harmony"
    | "svelte"
    | "solidjs"
    | "astro";
export type ComponentLib = "antd" | "element-plus" | "mui" | "vuetify" | "nutui" | "tdesign" | "shadcn" | "none";

export interface Issue {
    /** Unique rule identifier */
    ruleId: string;
    /** Human-readable title */
    title: string;
    /** Detailed description */
    description: string;
    /** Severity level */
    severity: Severity;
    /** File path (relative to project root) */
    file: string;
    /** Line number (1-based) */
    line: number;
    /** Column number (1-based) */
    column: number;
    /** End line number */
    endLine?: number;
    /** End column number */
    endColumn?: number;
    /** Raw source code snippet */
    source?: string;
    /** Suggested fix */
    fix?: Fix;
    /** 规则文档链接（终端可点击跳转） */
    docsUrl?: string;
    /** 责任人（从 CODEOWNERS 推断） */
    assignee?: string;
    /** Additional metadata */
    meta?: Record<string, unknown>;
}

/** 修复置信度级别 */
export type FixConfidence = "high" | "medium" | "low";

export interface Fix {
    /** Replacement text */
    text: string;
    /** Start position in file */
    start: Position;
    /** End position in file */
    end: Position;
    /** 修复置信度（默认 high） */
    confidence?: FixConfidence;
    /** 修复说明（交互式模式下展示给用户） */
    description?: string;
}

/** Fix preview for dry-run mode */
export interface FixPreview {
    /** File path */
    file: string;
    /** Rule ID */
    ruleId: string;
    /** Issue title */
    title: string;
    /** Diff preview */
    diff: string;
}

export interface Position {
    line: number;
    column: number;
}

export interface ScanResult {
    /** Module name */
    module: string;
    /** Total issues found */
    total: number;
    /** Issues grouped by severity */
    issues: Record<Severity, Issue[]>;
    /** Scan duration in ms */
    duration: number;
    /** Files scanned */
    filesScanned: number;
    /** Files with issues */
    filesWithIssues: number;
}

export interface Rule {
    /** Rule ID (kebab-case) */
    id: string;
    /** Rule name */
    name: string;
    /** Rule description */
    description: string;
    /** Default severity */
    severity: Severity;
    /** Category */
    category: RuleCategory;
    /** Whether rule is enabled by default */
    defaultEnabled: boolean;
    /** Frameworks this rule applies to */
    frameworks?: Framework[];
    /** Component libs this rule applies to */
    componentLibs?: ComponentLib[];
    /** Platforms this rule applies to */
    platforms?: Platform[];
    /** Rule metadata (params, notes, etc.) */
    meta?: Record<string, unknown>;
    /** 规则文档链接 */
    docsUrl?: string;
    /** Execute rule on a file */
    execute(context: RuleContext): Issue[] | Promise<Issue[]>;
}

export type RuleCategory =
    | "i18n"
    | "component"
    | "hooks"
    | "platform"
    | "performance"
    | "accessibility"
    | "security"
    | "style"
    | "architecture";

export interface RuleContext {
    /** Absolute path to the file being analyzed */
    filePath: string;
    /** File content */
    source: string;
    /** Parsed AST (if applicable) */
    ast?: unknown;
    /** Project configuration */
    config: ProjectConfig;
    /** Detected project metadata */
    projectMeta: ProjectMeta;
    /** Utility helpers */
    utils: RuleUtils;
    /** v2.1.1: 单次扫描内规则间共享的缓存（按文件隔离） */
    sharedCache?: Map<string, unknown>;
}

export interface RuleUtils {
    /** Parse file to AST */
    parseAST(source: string, options?: ParseOptions): unknown;
    /** Get imported modules */
    getImports(ast: unknown): ImportInfo[];
    /** Report a position in source */
    reportPosition(offset: number): Position;
    /** Extract source snippet */
    getSourceSnippet(start: number, end: number): string;
}

export interface ImportInfo {
    source: string;
    specifiers: string[];
    defaultImport?: string;
    namespaceImport?: string;
    line: number;
    column: number;
}

export interface ParseOptions {
    /** File extension to determine parser */
    ext?: string;
    /** Source type: script | module */
    sourceType?: "script" | "module";
    /** Enable JSX/TSX */
    jsx?: boolean;
}

export interface RuleConfig {
    /** 规则 ID */
    id: string;
    /** 是否启用（默认 true） */
    enabled?: boolean;
    /** 覆盖严重级别 */
    severity?: Severity;
    /** 规则参数（覆盖默认值） */
    params?: Record<string, unknown>;
}

export interface CustomRuleConfig {
    /** 自定义规则文件路径（相对项目根目录或绝对路径） */
    path: string;
}

export interface ProjectConfig {
    /** Config file path */
    configFile?: string;
    /** 继承的组织级基线配置（URL 或本地路径） */
    extends?: string;
    /** i18n configuration */
    i18n?: I18nConfig;
    /** Component configuration */
    component?: ComponentConfig;
    /** Hooks configuration */
    hooks?: HooksConfig;
    /** Platform configuration */
    platform?: PlatformConfig;
    /** Gate configuration */
    gate?: GateConfig;
    /** AI context configuration */
    aiContext?: AIContextConfig;
    /** Scan scope */
    scan?: ScanConfig;
    /** Naming convention configuration */
    naming?: NamingConfig;
    /** ── Phase 3: 规则配置驱动 ── */
    /** 规则开关/参数配置 */
    rules?: RuleConfig[];
    /** 自定义规则文件列表 */
    customRules?: CustomRuleConfig[];
    /** v2.7.0: 从 npm 插件包加载的规则（内部使用，不写入配置文件） */
    __pluginRules?: Rule[];
}

export interface I18nConfig {
    sourceLocale: string;
    targetLocales: string[];
    format: "json" | "yaml" | "js" | "ts";
    keyPattern: string;
    extractPaths: string[];
    ignorePaths: string[];
    interpolationPattern: string;
    translateProvider: string;
}

export interface ComponentConfig {
    library: "auto" | ComponentLib;
    themeTokenPrefix: string;
    maxSelectOptions: number;
    checkA11y: boolean;
    checkPerf: boolean;
    libraryVersion: string;
}

export interface HooksConfig {
    maxEffectDeps: number;
    checkClosure: boolean;
    checkCustomHookNaming: boolean;
    checkVueComposables: boolean;
}

export interface PlatformConfig {
    targets: Platform[];
    mp: MpConfig;
    mobile: MobileConfig;
    harmony: HarmonyConfig;
}

export interface MpConfig {
    type: string;
    maxMainPackageSize: number;
    maxSubPackageSize: number;
    maxBase64ImageSize: number;
    maxPageStack: number;
}

export interface MobileConfig {
    minTouchTarget: number;
    checkSafeArea: boolean;
    checkClickDelay: boolean;
    checkKeyboard: boolean;
}

export interface HarmonyConfig {
    strictTypeCheck: boolean;
    arktsVersion: string;
}

export interface GateConfig {
    enabled: boolean;
    critical: { max: number };
    warning: { max: number };
    suggestion: { max: number };
    blockPipeline: boolean;
}

export interface AIContextConfig {
    agent: "claude" | "cursor" | "copilot" | "all" | "generic";
    includeFiles: string[];
    autoUpdate: boolean;
    excludeDirs: string[];
}

export interface ScanConfig {
    includeExtensions: string[];
    excludeDirs: string[];
    excludePatterns: string[];
}

export interface NamingConfig {
    /** 类名规范: PascalCase */
    classCase: "PascalCase" | "camelCase";
    /** 接口名规范 */
    interfaceCase: "PascalCase" | "camelCase";
    /** 类型别名规范 */
    typeAliasCase: "PascalCase" | "camelCase";
    /** 函数/方法规范 */
    functionCase: "camelCase" | "PascalCase";
    /** 变量规范 */
    variableCase: "camelCase" | "snake_case";
    /** 常量规范 (const 声明的字面量) */
    constantCase: "UPPER_SNAKE_CASE" | "camelCase";
    /** 枚举名规范 */
    enumCase: "PascalCase" | "UPPER_SNAKE_CASE";
    /** 枚举成员规范 */
    enumMemberCase: "UPPER_SNAKE_CASE" | "PascalCase";
    /** 私有成员前缀: underscore | hash | none */
    privatePrefix: "underscore" | "hash" | "none";
    /** 文件名规范 */
    fileNameCase: "kebab-case" | "camelCase" | "PascalCase";
    /** 文件夹名规范 */
    folderNameCase: "kebab-case" | "camelCase" | "PascalCase";
    /** 是否允许单字母变量 (i, j, k, x, y, z) */
    allowSingleLetter: boolean;
    /** 是否允许 React 组件使用 PascalCase 函数 */
    allowPascalCaseComponents: boolean;
    /** 忽略的命名模式 */
    ignorePatterns: string[];
}

export interface ProjectMeta {
    /** Detected framework */
    framework?: Framework;
    /** Detected component library */
    componentLib?: ComponentLib;
    /** Detected platforms */
    platforms: Platform[];
    /** Framework version */
    frameworkVersion?: string;
    /** Component lib version */
    componentLibVersion?: string;
    /** Has TypeScript */
    hasTypeScript: boolean;
    /** Has i18n */
    hasI18n: boolean;
    /** i18n library */
    i18nLib?: string;
    /** Package.json scripts */
    scripts: Record<string, string>;

    // ── Phase 2: 智能化深度检测 ──
    /** Detected bundler / build tool */
    bundler?: Bundler;
    bundlerVersion?: string;
    /** Detected test framework */
    testFramework?: TestFramework;
    testFrameworkVersion?: string;
    /** Detected state manager */
    stateManager?: StateManager;
    stateManagerVersion?: string;
    /** Detected styling solution */
    styling?: StylingSolution;
    stylingVersion?: string;
    /** Detected router */
    router?: RouterLib;
    routerVersion?: string;
    /** Detected package manager */
    packageManager: PackageManager;
    /** Detected linter / formatter */
    linter?: LinterTool;
    /** Detected monorepo tool */
    monorepoTool?: MonorepoTool;
    /** Runtime (node / deno / bun) */
    runtime: Runtime;
    runtimeVersion?: string;
}

export type Bundler =
    | "webpack"
    | "vite"
    | "rsbuild"
    | "parcel"
    | "esbuild"
    | "rollup"
    | "turbopack"
    | "farm"
    | "rspack"
    | "wmr";
export type TestFramework = "jest" | "vitest" | "cypress" | "playwright" | "mocha" | "karma" | "ava" | "node:test";
export type StateManager = "redux" | "mobx" | "zustand" | "recoil" | "jotai" | "pinia" | "vuex" | "valtio";
export type StylingSolution =
    | "tailwindcss"
    | "styled-components"
    | "emotion"
    | "sass"
    | "less"
    | "css-modules"
    | "vanilla-extract"
    | "unocss"
    | "windicss";
export type RouterLib = "react-router" | "vue-router" | "tanstack-router" | "wouter" | "nextjs-router" | "nuxt-router";
export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";
export type LinterTool = "eslint" | "biome" | "oxlint" | "prettier" | "stylelint";
export type MonorepoTool = "nx" | "turborepo" | "lerna" | "rush" | "pnpm-workspace";
export type Runtime = "node" | "deno" | "bun";
