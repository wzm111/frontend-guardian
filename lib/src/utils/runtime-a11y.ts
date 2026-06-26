/**
 * v3.10.0: 运行时无障碍检测
 *
 * 通过可选依赖 axe-core 在页面渲染后 DOM 上运行 axe.run()，
 * 并把 violation 转换为 frontend-guardian Issue。
 */

import type { Issue, Severity } from "@/types.js";

export interface AxeViolation {
    id: string;
    impact?: "critical" | "serious" | "moderate" | "minor";
    tags: string[];
    help: string;
    helpUrl: string;
    nodes: Array<{
        target: string[];
    }>;
}

export interface AxeRunResult {
    violations: AxeViolation[];
}

/** 判断 axe-core 是否可用 */
export function isAxeCoreAvailable(): boolean {
    try {
        const axePath = require.resolve("axe-core");
        return !!axePath;
    } catch {
        return false;
    }
}

/**
 * 加载 axe-core 源码字符串，用于注入页面
 */
export async function loadAxeSource(): Promise<string> {
    // @ts-ignore — axe-core 是可选依赖，运行时检测
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const axe = await import("axe-core");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (axe as any).source as string;
}

/**
 * 在 Playwright 页面上运行 axe-core
 *
 * @param page Playwright Page 对象
 * @param tags 可选过滤标签，如 ["wcag2a", "wcag2aa"]
 */
export async function runAxeOnPage(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page: any,
    tags?: string[]
): Promise<AxeRunResult> {
    const axeSource = await loadAxeSource();
    await page.addScriptTag({ content: axeSource });

    const runOptions: { runOnly?: { type: "tag"; values: string[] } } = {};
    if (tags && tags.length > 0) {
        runOptions.runOnly = { type: "tag", values: tags };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await page.evaluate((opts: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // @ts-ignore — 在浏览器上下文中执行
        const win = globalThis as any;
        return win.axe.run(win.document, opts);
    }, runOptions);

    return result as AxeRunResult;
}

/** 将 axe impact 映射为 frontend-guardian severity */
export function mapAxeImpact(impact?: AxeViolation["impact"]): Severity {
    switch (impact) {
        case "critical":
        case "serious":
            return "critical";
        case "moderate":
            return "warning";
        case "minor":
            return "suggestion";
        default:
            return "warning";
    }
}

/**
 * 将 axe violations 转换为 Issue 列表
 */
export function axeViolationsToIssues(violations: AxeViolation[], route: string, url: string): Issue[] {
    return violations.map((violation) => {
        const targets = violation.nodes.flatMap((node) => node.target).slice(0, 5);

        return {
            ruleId: `page-health-a11y-runtime-${violation.id}`,
            title: `运行时无障碍问题: ${violation.help}`,
            description: `路由 ${route} 检测到 axe-core 无障碍问题：${violation.help}。影响：${violation.impact ?? "unknown"}。`,
            severity: mapAxeImpact(violation.impact),
            file: route,
            line: 1,
            column: 1,
            meta: {
                url,
                axeRuleId: violation.id,
                impact: violation.impact,
                tags: violation.tags,
                target: targets,
                help: violation.help,
                helpUrl: violation.helpUrl,
            },
        };
    });
}
