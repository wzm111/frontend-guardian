/**
 * 组件医生 Scanner
 * 迁移自 scan-components.sh，基于 AST 的组件库使用规范检测
 *
 * 规则列表：
 * 1. component-anti-pattern — 组件库反模式（Form.Item 缺少 name、Table 缺少 rowKey 等）
 * 2. component-token — 硬编码颜色/间距，应使用主题 token
 * 3. component-perf — 图片未懒加载、ECharts 未 dispose、长列表未虚拟化
 */

import type { ParseResult } from "@babel/parser";
import traverse from "@babel/traverse";
import type { Rule, RuleContext, Issue } from "@/types.js";
import { getFileExt, getJSXTagName } from "@/utils/common.js";

export const componentRules: Rule[] = [
    {
        id: "component-anti-pattern",
        name: "组件库反模式",
        description: "检测组件库常见反模式使用",
        severity: "warning",
        category: "component",
        defaultEnabled: true,
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

                    // Ant Design 反模式
                    if (tagName === "Form.Item" || tagName === "FormItem") {
                        const hasName = path.node.attributes.some(
                            (attr: any) =>
                                attr.type === "JSXAttribute" &&
                                attr.name.type === "JSXIdentifier" &&
                                attr.name.name === "name"
                        );
                        const hasNoStyle = path.node.attributes.some(
                            (attr: any) =>
                                attr.type === "JSXAttribute" &&
                                attr.name.type === "JSXIdentifier" &&
                                attr.name.name === "noStyle"
                        );
                        if (!hasName && !hasNoStyle) {
                            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
                            issues.push({
                                ruleId: "component-anti-pattern",
                                title: "Form.Item 缺少 name 属性",
                                description: "Ant Design Form.Item 缺少 name 属性，表单将无法收集数据",
                                severity: "critical",
                                file: context.filePath,
                                line,
                                column,
                                source: `<Form.Item ... />`,
                            });
                        }
                    }

                    // Table 缺少 rowKey
                    if (tagName === "Table" || tagName === "ElTable" || tagName === "el-table") {
                        const hasRowKey = path.node.attributes.some(
                            (attr: any) =>
                                attr.type === "JSXAttribute" &&
                                attr.name.type === "JSXIdentifier" &&
                                (attr.name.name === "rowKey" || attr.name.name === "row-key")
                        );
                        if (!hasRowKey) {
                            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
                            issues.push({
                                ruleId: "component-anti-pattern",
                                title: `${tagName} 缺少 rowKey 属性`,
                                description: "Table 组件缺少 rowKey 会导致列表更新时 DOM 错误复用，建议指定唯一键",
                                severity: "warning",
                                file: context.filePath,
                                line,
                                column,
                                source: `<${tagName} ... />`,
                            });
                        }
                    }

                    // Modal/Drawer 缺少 destroyOnClose
                    if (tagName === "Modal" || tagName === "Drawer") {
                        const hasDestroyOnClose = path.node.attributes.some(
                            (attr: any) =>
                                attr.type === "JSXAttribute" &&
                                attr.name.type === "JSXIdentifier" &&
                                (attr.name.name === "destroyOnClose" || attr.name.name === "destroy-on-close")
                        );
                        if (!hasDestroyOnClose) {
                            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
                            issues.push({
                                ruleId: "component-anti-pattern",
                                title: `${tagName} 建议添加 destroyOnClose`,
                                description: "Modal/Drawer 关闭后子组件不会卸载，可能导致内存泄漏和状态残留",
                                severity: "warning",
                                file: context.filePath,
                                line,
                                column,
                                source: `<${tagName} ... />`,
                            });
                        }
                    }

                    // Select 大数据未优化
                    if (tagName === "Select" || tagName === "ElSelect" || tagName === "el-select") {
                        const hasVirtual = path.node.attributes.some(
                            (attr: any) =>
                                attr.type === "JSXAttribute" &&
                                attr.name.type === "JSXIdentifier" &&
                                (attr.name.name === "virtual" || attr.name.name === "showSearch")
                        );
                        // 简化检测：如果附近有 options/map 暗示数据量大
                        if (!hasVirtual) {
                            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
                            issues.push({
                                ruleId: "component-anti-pattern",
                                title: `${tagName} 建议添加虚拟化或搜索`,
                                description: "Select 数据量可能较大，建议添加 virtual/showSearch/filterOption 优化性能",
                                severity: "suggestion",
                                file: context.filePath,
                                line,
                                column,
                                source: `<${tagName} ... />`,
                            });
                        }
                    }

                    // Element Plus: ElForm 有 rules 但缺少 prop
                    if (tagName === "ElFormItem" || tagName === "el-form-item") {
                        const hasProp = path.node.attributes.some(
                            (attr: any) =>
                                attr.type === "JSXAttribute" &&
                                attr.name.type === "JSXIdentifier" &&
                                attr.name.name === "prop"
                        );
                        // 这个需要父级 ElForm 有 rules，简化处理
                        if (!hasProp) {
                            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
                            issues.push({
                                ruleId: "component-anti-pattern",
                                title: "ElFormItem 缺少 prop",
                                description: "如果父级 ElForm 配置了 rules，子级 ElFormItem 必须有 prop 绑定才能生效",
                                severity: "warning",
                                file: context.filePath,
                                line,
                                column,
                                source: `<${tagName} ... />`,
                            });
                        }
                    }
                },
            });

            return issues;
        },
    },

    {
        id: "component-token",
        name: "应使用主题 Token",
        description: "避免硬编码颜色和间距，使用设计系统 token",
        severity: "suggestion",
        category: "component",
        defaultEnabled: true,
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const lines = context.source.split("\n");

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const lineNum = i + 1;

                // 跳过注释
                const trimmed = line.trim();
                if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

                // 检测硬编码颜色（排除 CSS 变量）
                const colorMatch = line.match(/#[0-9a-fA-F]{3,6}|rgb\(|rgba\(|hsl\(/);
                if (colorMatch) {
                    // 排除 theme/token/var 相关
                    if (
                        !line.includes("theme") &&
                        !line.includes("token") &&
                        !line.includes("var(") &&
                        !line.includes("--")
                    ) {
                        if (line.match(/color|background|bg|border/i)) {
                            const colStart = (colorMatch.index || 0) + 1;
                            issues.push({
                                ruleId: "component-token",
                                title: "硬编码颜色值",
                                description: `检测到硬编码颜色 "${colorMatch[0]}"，建议使用主题 token 统一管理`,
                                severity: "suggestion",
                                file: context.filePath,
                                line: lineNum,
                                column: colStart,
                                source: line.trim(),
                                fix: {
                                    text: "var(--primary-color)",
                                    start: { line: lineNum, column: colStart },
                                    end: { line: lineNum, column: colStart + colorMatch[0].length },
                                },
                            });
                        }
                    }
                }

                // 检测硬编码间距
                const spacingMatch = line.match(/margin\s*:\s*(\d+)px|padding\s*:\s*(\d+)px|gap\s*:\s*(\d+)px/);
                if (spacingMatch) {
                    if (
                        !line.includes("theme") &&
                        !line.includes("token") &&
                        !line.includes("rpx") &&
                        !line.includes("pxTransform")
                    ) {
                        const spStart = (spacingMatch.index || 0) + 1;
                        const pxVal = spacingMatch[1] || spacingMatch[2] || spacingMatch[3] || "";
                        issues.push({
                            ruleId: "component-token",
                            title: "硬编码间距值",
                            description: `检测到硬编码间距 ${pxVal}px，建议使用设计 token 统一管理`,
                            severity: "suggestion",
                            file: context.filePath,
                            line: lineNum,
                            column: spStart,
                            source: line.trim(),
                            fix: {
                                text: `theme.spacing.md`,
                                start: { line: lineNum, column: spStart },
                                end: { line: lineNum, column: spStart + spacingMatch[0].length },
                            },
                        });
                    }
                }
            }

            return issues;
        },
    },

    {
        id: "component-perf",
        name: "组件性能陷阱",
        description: "检测可能导致性能问题的组件使用方式",
        severity: "warning",
        category: "component",
        defaultEnabled: true,
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const source = context.source;

            // 检测大图未懒加载
            const imgRegex = /src\s*=\s*['"][^'"]*\.(png|jpg|jpeg|gif)['"]/gi;
            let imgMatch;
            while ((imgMatch = imgRegex.exec(source)) !== null) {
                // 检查附近是否有 lazy/loading 属性
                const nearby = source.slice(Math.max(0, imgMatch.index - 200), imgMatch.index + 200);
                if (!nearby.match(/lazy|loading\s*=|lazyLoad/i)) {
                    const line = source.slice(0, imgMatch.index).split("\n").length;
                    issues.push({
                        ruleId: "component-perf",
                        title: "图片可能未懒加载",
                        description: '检测到图片引用，建议添加 loading="lazy" 或 lazyLoad 属性优化首屏加载',
                        severity: "suggestion",
                        file: context.filePath,
                        line,
                        column: 1,
                        source: imgMatch[0],
                    });
                }
            }

            // 检测 ECharts 实例未 dispose
            if (source.includes("echarts.init") || source.includes("echarts'\)")) {
                if (!source.includes(".dispose()") && !source.includes("dispose(")) {
                    // 简化：只要文件中有 echarts.init 但没有 dispose，就提示
                    const lines = source.split("\n");
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes("echarts.init")) {
                            issues.push({
                                ruleId: "component-perf",
                                title: "ECharts 实例可能未 dispose",
                                description:
                                    "检测到 echarts.init，但文件中没有对应的 dispose() 调用。组件卸载时应调用 chart.dispose() 释放内存",
                                severity: "warning",
                                file: context.filePath,
                                line: i + 1,
                                column: 1,
                                source: lines[i].trim(),
                            });
                            break; // 每文件只报一次
                        }
                    }
                }
            }

            // 检测长列表未虚拟化（简化检测）
            const listRegex = /\.map\s*\([^)]*=>\s*(<\w+|<div|<View|view)/gi;
            let listMatch;
            while ((listMatch = listRegex.exec(source)) !== null) {
                const nearby = source.slice(Math.max(0, listMatch.index - 300), listMatch.index + 300);
                if (!nearby.match(/virtual|Virtual|recycle|window|fixed/i)) {
                    const line = source.slice(0, listMatch.index).split("\n").length;
                    issues.push({
                        ruleId: "component-perf",
                        title: "长列表可能未使用虚拟化",
                        description:
                            "检测到列表渲染（.map），数据量大时建议使用虚拟化组件（react-window、vue-virtual-scroller 等）",
                        severity: "suggestion",
                        file: context.filePath,
                        line,
                        column: 1,
                        source: listMatch[0].slice(0, 50),
                    });
                    break; // 每文件只报一次
                }
            }

            return issues;
        },
    },
];

// ============================================================================
// 辅助函数
// ============================================================================

