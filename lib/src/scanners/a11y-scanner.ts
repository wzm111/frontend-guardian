/**
 * 可访问性规则 Scanner
 * 参考 WCAG 2.1 标准和 Vercel Web Design Guidelines
 *
 * 规则列表：
 * 1. a11y-img-alt       — 图片必须有 alt 属性
 * 2. a11y-form-label    — 表单元素必须有 label
 * 3. a11y-button-role   — 可点击元素语义化
 * 4. a11y-contrast      — 颜色对比度 WCAG AA
 * 5. a11y-aria-valid    — ARIA 属性合法性
 */

import type { ParseResult } from "@babel/parser";
import traverse from "@babel/traverse";
import type { Rule, RuleContext, Issue } from "@/types.js";
import { getFileExt, getJSXTagName } from "@/utils/common.js";

/** 有效的 ARIA 属性列表 (WAI-ARIA 1.2) */
const VALID_ARIA_ATTRIBUTES = new Set([
    "aria-atomic",
    "aria-autocomplete",
    "aria-busy",
    "aria-checked",
    "aria-colcount",
    "aria-colindex",
    "aria-colspan",
    "aria-controls",
    "aria-current",
    "aria-describedby",
    "aria-details",
    "aria-disabled",
    "aria-dropeffect",
    "aria-errormessage",
    "aria-expanded",
    "aria-flowto",
    "aria-grabbed",
    "aria-haspopup",
    "aria-hidden",
    "aria-invalid",
    "aria-keyshortcuts",
    "aria-label",
    "aria-labelledby",
    "aria-level",
    "aria-live",
    "aria-modal",
    "aria-multiline",
    "aria-multiselectable",
    "aria-orientation",
    "aria-owns",
    "aria-placeholder",
    "aria-posinset",
    "aria-pressed",
    "aria-readonly",
    "aria-relevant",
    "aria-required",
    "aria-roledescription",
    "aria-rowcount",
    "aria-rowindex",
    "aria-rowspan",
    "aria-selected",
    "aria-setsize",
    "aria-sort",
    "aria-valuemax",
    "aria-valuemin",
    "aria-valuenow",
    "aria-valuetext",
]);

/** 有效的 ARIA role 列表 */
const VALID_ROLES = new Set([
    "alert",
    "alertdialog",
    "application",
    "article",
    "banner",
    "button",
    "cell",
    "checkbox",
    "columnheader",
    "combobox",
    "complementary",
    "contentinfo",
    "definition",
    "dialog",
    "directory",
    "document",
    "feed",
    "figure",
    "form",
    "grid",
    "gridcell",
    "group",
    "heading",
    "img",
    "link",
    "list",
    "listbox",
    "listitem",
    "log",
    "main",
    "marquee",
    "math",
    "menu",
    "menubar",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "navigation",
    "none",
    "note",
    "option",
    "presentation",
    "progressbar",
    "radio",
    "radiogroup",
    "region",
    "row",
    "rowgroup",
    "rowheader",
    "scrollbar",
    "search",
    "searchbox",
    "separator",
    "slider",
    "spinbutton",
    "status",
    "switch",
    "tab",
    "table",
    "tablist",
    "tabpanel",
    "term",
    "textbox",
    "timer",
    "toolbar",
    "tooltip",
    "tree",
    "treegrid",
    "treeitem",
]);

/** 需要 label 的表单元素 */
const FORM_ELEMENTS = new Set([
    "input",
    "select",
    "textarea",
    // 组件库常见命名
    "Input",
    "Select",
    "Textarea",
    "TextField",
    "AutoComplete",
    "DatePicker",
    "TimePicker",
    "Search",
    "Password",
    "Checkbox",
    "Radio",
    "Switch",
    "Slider",
    "Rate",
    "Upload",
    "Cascader",
    "TreeSelect",
    "Mention",
]);

/** 非交互元素（可点击时需要语义化） */
const NON_INTERACTIVE_TAGS = new Set([
    "div",
    "span",
    "i",
    "em",
    "strong",
    "b",
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "section",
    "article",
    "aside",
    "header",
    "footer",
    "nav",
    "main",
    "figure",
    "figcaption",
]);

/** 交互事件处理器 */
const INTERACTIVE_EVENTS = new Set([
    "onClick",
    "onDoubleClick",
    "onMouseDown",
    "onMouseUp",
    "onMouseEnter",
    "onMouseLeave",
    "onMouseOver",
    "onMouseOut",
    "onTouchStart",
    "onTouchEnd",
    "onTouchMove",
    "onTouchCancel",
    "onPointerDown",
    "onPointerUp",
]);

/** 标准颜色名 → hex */
const NAMED_COLORS: Record<string, string> = {
    black: "#000000",
    white: "#ffffff",
    red: "#ff0000",
    green: "#008000",
    blue: "#0000ff",
    yellow: "#ffff00",
    cyan: "#00ffff",
    magenta: "#ff00ff",
    silver: "#c0c0c0",
    gray: "#808080",
    grey: "#808080",
    maroon: "#800000",
    olive: "#808000",
    lime: "#00ff00",
    aqua: "#00ffff",
    teal: "#008080",
    navy: "#000080",
    fuchsia: "#ff00ff",
    purple: "#800080",
    orange: "#ffa500",
};

// ============================================================================
// 规则定义
// ============================================================================

export const a11yRules: Rule[] = [
    {
        id: "a11y-img-alt",
        name: "图片必须有 alt 属性",
        description: "<img> 标签必须包含 alt 属性，即使为空字符串（装饰性图片）",
        severity: "critical",
        category: "accessibility",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/a11y-img-alt.md",
        frameworks: ["react", "vue", "nextjs", "nuxt", "uniapp", "taro"],
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const ast = context.utils.parseAST(context.source, {
                ext: getFileExt(context.filePath),
            }) as ParseResult<any> | null;

            if (!ast) return issues;

            traverse(ast, {
                JSXOpeningElement(path) {
                    const tagName = getJSXTagName(path.node.name);
                    if (!tagName) return;

                    // 检测 <img> 和组件库 Image 组件
                    const isImg = tagName === "img" || tagName === "Image";
                    if (!isImg) return;

                    const { altFound, line, column } = checkImgAlt(path.node);

                    if (!altFound) {
                        issues.push({
                            ruleId: "a11y-img-alt",
                            title: `<${tagName}> 缺少 alt 属性`,
                            description: `图片元素缺少 alt 属性，屏幕阅读器用户无法获取图片信息。装饰性图片可设置 alt=""`,
                            severity: "critical",
                            file: context.filePath,
                            line,
                            column,
                            source: `<${tagName} ... />`,
                            fix: {
                                text: `alt=""`,
                                description: "为图片添加 alt 属性，装饰性图片可设为空字符串",
                                confidence: "high",
                                start: { line, column },
                                end: { line, column },
                            },
                        });
                    }
                },
            });

            return issues;
        },
    },

    {
        id: "a11y-form-label",
        name: "表单元素必须有 label",
        description: "input、select、textarea 必须关联 label 或通过 aria-label 说明",
        severity: "warning",
        category: "accessibility",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/a11y-form-label.md",
        frameworks: ["react", "vue", "nextjs", "nuxt", "uniapp", "taro"],
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const ast = context.utils.parseAST(context.source, {
                ext: getFileExt(context.filePath),
            }) as ParseResult<any> | null;

            if (!ast) return issues;

            traverse(ast, {
                JSXOpeningElement(path) {
                    const tagName = getJSXTagName(path.node.name);
                    if (!tagName || !FORM_ELEMENTS.has(tagName)) return;

                    // 检查是否有 label 关联属性
                    const { hasLabel, line, column } = checkFormLabel(path.node);

                    if (!hasLabel) {
                        // 检查是否有 placeholder（作为降级提示）
                        const hasPlaceholder = path.node.attributes.some(
                            (attr: any) =>
                                attr.type === "JSXAttribute" &&
                                attr.name.type === "JSXIdentifier" &&
                                attr.name.name === "placeholder"
                        );

                        const suggestion = hasPlaceholder
                            ? `placeholder 不能替代 label，请添加 aria-label 或关联 <label htmlFor="...">`
                            : `请添加 aria-label、aria-labelledby 或关联 <label htmlFor="...">`;

                        issues.push({
                            ruleId: "a11y-form-label",
                            title: `<${tagName}> 缺少 label 关联`,
                            description: suggestion,
                            severity: "warning",
                            file: context.filePath,
                            line,
                            column,
                            source: `<${tagName} ... />`,
                        });
                    }
                },
            });

            return issues;
        },
    },

    {
        id: "a11y-button-role",
        name: "可点击元素语义化",
        description: "使用 <button> 而非 div/span + onClick 模拟按钮",
        severity: "warning",
        category: "accessibility",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/a11y-button-role.md",
        frameworks: ["react", "vue", "nextjs", "nuxt", "uniapp", "taro"],
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const ast = context.utils.parseAST(context.source, {
                ext: getFileExt(context.filePath),
            }) as ParseResult<any> | null;

            if (!ast) return issues;

            traverse(ast, {
                JSXOpeningElement(path) {
                    const tagName = getJSXTagName(path.node.name);
                    if (!tagName || !NON_INTERACTIVE_TAGS.has(tagName)) return;

                    // 检查是否有交互事件
                    const hasInteractiveEvent = path.node.attributes.some((attr: any) => {
                        if (attr.type !== "JSXAttribute") return false;
                        if (attr.name.type !== "JSXIdentifier") return false;
                        return INTERACTIVE_EVENTS.has(attr.name.name);
                    });

                    if (!hasInteractiveEvent) return;

                    // 检查是否已有合适的 role
                    const { hasRole, roleValue, hasTabIndex } = checkRole(path.node);

                    if (!hasRole) {
                        const { line: l, column: c } = path.node.loc?.start || { line: 0, column: 0 };
                        issues.push({
                            ruleId: "a11y-button-role",
                            title: `非交互元素 ${tagName} 绑定了点击事件`,
                            description: `${tagName} 不是语义化交互元素，应改为 <button> 或添加 role="button" tabIndex={0}，并处理键盘事件（onKeyDown Enter/Space）`,
                            severity: "warning",
                            file: context.filePath,
                            line: l,
                            column: c,
                            source: `<${tagName} onClick={...} />`,
                            fix: {
                                text: `<button>`,
                                description: "改为 button 标签可能需调整样式",
                                confidence: "medium",
                                start: { line: l, column: c },
                                end: { line: l, column: c + tagName.length + 1 },
                            },
                        });
                    } else if (hasRole && roleValue === "button" && !hasTabIndex) {
                        const { line: l, column: c } = path.node.loc?.start || { line: 0, column: 0 };
                        issues.push({
                            ruleId: "a11y-button-role",
                            title: `role="button" 缺少 tabIndex`,
                            description: `自定义按钮必须设置 tabIndex={0} 以支持键盘导航`,
                            severity: "warning",
                            file: context.filePath,
                            line: l,
                            column: c,
                            source: `<${tagName} role="button" ... />`,
                        });
                    }
                },
            });

            return issues;
        },
    },

    {
        id: "a11y-contrast",
        name: "颜色对比度",
        description: "文本与背景色的对比度应满足 WCAG AA 标准 (4.5:1)",
        severity: "suggestion",
        category: "accessibility",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/a11y-contrast.md",
        frameworks: ["react", "vue", "nextjs", "nuxt"],
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const ast = context.utils.parseAST(context.source, {
                ext: getFileExt(context.filePath),
            }) as ParseResult<any> | null;

            if (!ast) return issues;

            traverse(ast, {
                JSXOpeningElement(path) {
                    const tagName = getJSXTagName(path.node.name);
                    if (!tagName) return;

                    // 从 style 属性提取颜色
                    const colors = extractStyleColors(path.node);
                    if (!colors.fg && !colors.bg) return;

                    // 尝试推断缺失的颜色（使用上下文或默认值）
                    const fg = colors.fg || "#000000";
                    const bg = colors.bg || "#ffffff";

                    const ratio = calculateContrastRatio(fg, bg);
                    if (ratio < 4.5) {
                        const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
                        issues.push({
                            ruleId: "a11y-contrast",
                            title: `颜色对比度不足 (${ratio.toFixed(2)}:1)`,
                            description: `前景色 ${fg} 与背景色 ${bg} 对比度为 ${ratio.toFixed(2)}:1，不满足 WCAG AA 标准 (4.5:1)。建议使用更深的文字颜色或更浅的背景色`,
                            severity: "suggestion",
                            file: context.filePath,
                            line,
                            column,
                            source: `color: ${fg}, backgroundColor: ${bg}`,
                        });
                    }
                },
            });

            return issues;
        },
    },

    {
        id: "a11y-aria-valid",
        name: "ARIA 属性合法性",
        description: "使用正确的 ARIA 角色和属性",
        severity: "warning",
        category: "accessibility",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/a11y-aria-valid.md",
        frameworks: ["react", "vue", "nextjs", "nuxt", "uniapp", "taro"],
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const ast = context.utils.parseAST(context.source, {
                ext: getFileExt(context.filePath),
            }) as ParseResult<any> | null;

            if (!ast) return issues;

            traverse(ast, {
                JSXAttribute(path) {
                    const attrName = path.node.name;
                    if (attrName.type !== "JSXIdentifier") return;
                    const name = attrName.name;

                    // 1. 检测无效 aria-* 属性
                    if (name.startsWith("aria-")) {
                        if (!VALID_ARIA_ATTRIBUTES.has(name)) {
                            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
                            issues.push({
                                ruleId: "a11y-aria-valid",
                                title: `无效的 ARIA 属性: ${name}`,
                                description: `"${name}" 不是有效的 WAI-ARIA 属性。请查阅 ARIA 1.2 规范`,
                                severity: "warning",
                                file: context.filePath,
                                line,
                                column,
                                source: `${name}=...`,
                            });
                        }

                        // 2. 检测 aria-hidden="true" 但包含可聚焦元素（简化检测：在当前文件检查）
                        if (
                            name === "aria-hidden" &&
                            path.node.value?.type === "StringLiteral" &&
                            path.node.value.value === "true"
                        ) {
                            const parentElement = path.parentPath;
                            if (parentElement?.isJSXOpeningElement()) {
                                const hasFocusable = checkHasFocusableChild(parentElement.node);
                                if (hasFocusable) {
                                    const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
                                    issues.push({
                                        ruleId: "a11y-aria-valid",
                                        title: `aria-hidden="true" 包含可聚焦元素`,
                                        description:
                                            'aria-hidden="true" 的元素内部不应包含可聚焦元素（如 input、button、a[href]），否则会导致键盘用户无法访问',
                                        severity: "critical",
                                        file: context.filePath,
                                        line,
                                        column,
                                        source: `aria-hidden="true"`,
                                    });
                                }
                            }
                        }
                    }

                    // 3. 检测无效 role 值
                    if (name === "role" && path.node.value?.type === "StringLiteral") {
                        const roleValue = path.node.value.value;
                        if (!VALID_ROLES.has(roleValue)) {
                            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
                            issues.push({
                                ruleId: "a11y-aria-valid",
                                title: `无效的 ARIA role: "${roleValue}"`,
                                description: `"${roleValue}" 不是有效的 ARIA role。请查阅 ARIA 1.2 角色列表`,
                                severity: "warning",
                                file: context.filePath,
                                line,
                                column,
                                source: `role="${roleValue}"`,
                            });
                        }
                    }
                },
            });

            return issues;
        },
    },
];

// ============================================================================
// 辅助函数
// ============================================================================


/** 检查 img 是否有 alt 属性 */
function checkImgAlt(node: any): { altFound: boolean; line: number; column: number } {
    const { line, column } = node.loc?.start || { line: 0, column: 0 };
    let altFound = false;

    for (const attr of node.attributes) {
        if (attr.type !== "JSXAttribute") continue;
        if (attr.name.type !== "JSXIdentifier") continue;
        if (attr.name.name === "alt") {
            altFound = true;
            break;
        }
    }

    return { altFound, line, column };
}

/** 检查表单元素是否有 label 关联 */
function checkFormLabel(node: any): {
    hasLabel: boolean;
    line: number;
    column: number;
    labelAttrs: string[];
} {
    const { line, column } = node.loc?.start || { line: 0, column: 0 };
    const labelAttrs: string[] = [];
    let hasLabel = false;

    for (const attr of node.attributes) {
        if (attr.type !== "JSXAttribute") continue;
        if (attr.name.type !== "JSXIdentifier") continue;

        const name = attr.name.name;
        if (name === "aria-label" || name === "aria-labelledby" || name === "id") {
            labelAttrs.push(name);
            hasLabel = true;
        }
        if (name === "aria-label" || name === "aria-labelledby") {
            hasLabel = true;
        }
    }

    return { hasLabel, line, column, labelAttrs };
}

/** 检查元素是否有 role 和 tabIndex */
function checkRole(node: any): {
    hasRole: boolean;
    roleValue: string | null;
    hasTabIndex: boolean;
    line: number;
    column: number;
} {
    const { line, column } = node.loc?.start || { line: 0, column: 0 };
    let hasRole = false;
    let roleValue: string | null = null;
    let hasTabIndex = false;

    for (const attr of node.attributes) {
        if (attr.type !== "JSXAttribute") continue;
        if (attr.name.type !== "JSXIdentifier") continue;

        const name = attr.name.name;
        if (name === "role" && attr.value?.type === "StringLiteral") {
            hasRole = true;
            roleValue = attr.value.value;
        }
        if (name === "tabIndex" && attr.value) {
            hasTabIndex = true;
        }
    }

    return { hasRole, roleValue, hasTabIndex, line, column };
}

/** 检查元素是否包含可聚焦子元素（简化：检查 JSXElement 的子元素） */
function checkHasFocusableChild(node: any): boolean {
    // 简化实现：在当前节点属性中检查是否有可聚焦元素的标记
    // 更完整的实现需要遍历 JSX 子树
    const focusableRoles = new Set([
        "button",
        "link",
        "textbox",
        "checkbox",
        "radio",
        "combobox",
        "slider",
        "spinbutton",
    ]);

    for (const attr of node.attributes) {
        if (attr.type !== "JSXAttribute") continue;
        if (attr.name.type !== "JSXIdentifier") continue;

        const name = attr.name.name;
        if (name === "href") return true; // <a href> 可聚焦
        if (name === "tabIndex") return true; // 显式 tabIndex 可聚焦
        if (name === "role" && attr.value?.type === "StringLiteral" && focusableRoles.has(attr.value.value)) {
            return true;
        }
    }

    return false;
}

// ============================================================================
// 颜色对比度计算 (WCAG 2.1)
// ============================================================================

/** 从 JSX style 属性提取颜色 */
function extractStyleColors(node: any): { fg: string | null; bg: string | null } {
    let fg: string | null = null;
    let bg: string | null = null;

    for (const attr of node.attributes) {
        if (attr.type !== "JSXAttribute") continue;
        if (attr.name.type !== "JSXIdentifier") continue;

        if (attr.name.name === "style" && attr.value?.type === "JSXExpressionContainer") {
            const expr = attr.value.expression;
            if (expr.type === "ObjectExpression") {
                for (const prop of expr.properties) {
                    if (prop.type !== "ObjectProperty") continue;
                    const key =
                        prop.key.type === "Identifier"
                            ? prop.key.name
                            : prop.key.type === "StringLiteral"
                              ? prop.key.value
                              : null;

                    if (!key) continue;

                    if (key === "color" && prop.value.type === "StringLiteral") {
                        fg = prop.value.value;
                    }
                    if (
                        (key === "backgroundColor" || key === "background-color") &&
                        prop.value.type === "StringLiteral"
                    ) {
                        bg = prop.value.value;
                    }
                }
            }
        }

        // Tailwind 类名中的颜色（简化检测）
        if (attr.name.name === "className" || attr.name.name === "class") {
            const classValue = getStringValue(attr.value);
            if (classValue) {
                const tailwindColor = extractTailwindColor(classValue);
                if (tailwindColor.fg) fg = tailwindColor.fg;
                if (tailwindColor.bg) bg = tailwindColor.bg;
            }
        }
    }

    return { fg, bg };
}

/** 获取 JSX 属性的字符串值 */
function getStringValue(value: any): string | null {
    if (!value) return null;
    if (value.type === "StringLiteral") return value.value;
    if (value.type === "JSXExpressionContainer" && value.expression?.type === "StringLiteral") {
        return value.expression.value;
    }
    return null;
}

/** 简化提取 Tailwind 颜色 */
function extractTailwindColor(classStr: string): { fg: string | null; bg: string | null } {
    const fg: string | null = null;
    const bg: string | null = null;

    // Tailwind 文本颜色: text-red-500, text-gray-900, text-white
    const textMatch = classStr.match(
        /\btext-(black|white|red|green|blue|yellow|gray|slate|zinc|neutral|stone|orange|amber|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-(\d{2,3})\b/
    );
    if (textMatch) {
        // 简化为近似 hex（不做完整 Tailwind 色板映射，只处理基本色）
        const color = textMatch[1];
        const shade = parseInt(textMatch[2]);
        return {
            fg: approximateTailwindColor(color, shade),
            bg,
        };
    }

    // Tailwind 背景色: bg-red-500
    const bgMatch = classStr.match(
        /\bbg-(black|white|red|green|blue|yellow|gray|slate|zinc|neutral|stone|orange|amber|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-(\d{2,3})\b/
    );
    if (bgMatch) {
        const color = bgMatch[1];
        const shade = parseInt(bgMatch[2]);
        return {
            fg,
            bg: approximateTailwindColor(color, shade),
        };
    }

    return { fg, bg };
}

/** Tailwind 颜色近似值（简化映射） */
function approximateTailwindColor(color: string, shade: number): string {
    // 简化：深色（shade >= 700）近似为深色，浅色近似为浅色
    const dark = shade >= 600;
    const mid = shade >= 400 && shade < 600;

    const colorMap: Record<string, { dark: string; mid: string; light: string }> = {
        black: { dark: "#000000", mid: "#000000", light: "#000000" },
        white: { dark: "#ffffff", mid: "#ffffff", light: "#ffffff" },
        gray: { dark: "#374151", mid: "#9ca3af", light: "#d1d5db" },
        slate: { dark: "#334155", mid: "#94a3b8", light: "#cbd5e1" },
        red: { dark: "#dc2626", mid: "#f87171", light: "#fca5a5" },
        green: { dark: "#16a34a", mid: "#4ade80", light: "#86efac" },
        blue: { dark: "#2563eb", mid: "#60a5fa", light: "#93c5fd" },
        yellow: { dark: "#ca8a04", mid: "#facc15", light: "#fde047" },
        orange: { dark: "#ea580c", mid: "#fb923c", light: "#fdba74" },
    };

    const mapping = colorMap[color];
    if (!mapping) return dark ? "#333333" : "#ffffff";
    return dark ? mapping.dark : mid ? mapping.mid : mapping.light;
}

/** 计算对比度 */
function calculateContrastRatio(fg: string, bg: string): number {
    const l1 = getLuminance(fg);
    const l2 = getLuminance(bg);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

/** 获取颜色的亮度 */
function getLuminance(colorStr: string): number {
    const rgb = parseColor(colorStr);
    if (!rgb) return 1;

    const [r, g, b] = rgb.map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 解析颜色为 RGB */
function parseColor(colorStr: string): [number, number, number] | null {
    colorStr = colorStr.trim().toLowerCase();

    // 1. Named colors
    if (NAMED_COLORS[colorStr]) {
        colorStr = NAMED_COLORS[colorStr];
    }

    // 2. Hex: #fff, #ffffff
    if (colorStr.startsWith("#")) {
        let hex = colorStr.slice(1);
        if (hex.length === 3) {
            hex = hex
                .split("")
                .map((c) => c + c)
                .join("");
        }
        if (hex.length === 6) {
            return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
        }
        return null;
    }

    // 3. rgb(r, g, b)
    const rgbMatch = colorStr.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
        return [parseInt(rgbMatch[1], 10), parseInt(rgbMatch[2], 10), parseInt(rgbMatch[3], 10)];
    }

    return null;
}

