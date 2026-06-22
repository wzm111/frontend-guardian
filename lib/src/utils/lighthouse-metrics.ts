/**
 * v3.10.0: Lighthouse Core Web Vitals 指标采集
 *
 * 通过可选依赖 lighthouse 采集 LCP / CLS / FCP / TTFB / INP，
 * 并按阈值生成 frontend-guardian Issue。
 */

import type { Issue } from "@/types.js";

export interface CoreWebVitalsResult {
    /** Largest Contentful Paint (ms) */
    lcp?: number;
    /** Cumulative Layout Shift */
    cls?: number;
    /** First Contentful Paint (ms) */
    fcp?: number;
    /** Time to First Byte (ms) */
    ttfb?: number;
    /** Interaction to Next Paint (ms) */
    inp?: number;
}

export interface CWVThresholds {
    lcp?: number;
    cls?: number;
    fcp?: number;
    ttfb?: number;
    inp?: number;
}

const DEFAULT_THRESHOLDS: Required<CWVThresholds> = {
    lcp: 2500,
    cls: 0.1,
    fcp: 1800,
    ttfb: 800,
    inp: 500,
};

/** 判断 lighthouse 是否可用 */
export function isLighthouseAvailable(): boolean {
    try {
        const lhPath = require.resolve("lighthouse");
        return !!lhPath;
    } catch {
        return false;
    }
}

/**
 * 对指定 URL 运行 Lighthouse
 *
 * @param url 页面 URL
 * @param port Playwright Chromium 的 CDP 端口
 * @returns Lighthouse runnerResult
 */
export async function runLighthouseForUrl(url: string, port: number): Promise<unknown> {
    // @ts-ignore — lighthouse 是可选依赖，运行时检测
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { default: lighthouse }: any = await import("lighthouse");
    const result = await lighthouse(url, { port, output: "json", logLevel: "error" });
    return result;
}

/**
 * 从 Lighthouse runnerResult 提取 Core Web Vitals
 */
export function extractCoreWebVitals(runnerResult: unknown): CoreWebVitalsResult {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const audits = (runnerResult as any)?.lhr?.audits || {};

    const getNumeric = (id: string): number | undefined => {
        const value = audits[id]?.numericValue;
        return typeof value === "number" ? value : undefined;
    };

    return {
        lcp: getNumeric("largest-contentful-paint"),
        cls: getNumeric("cumulative-layout-shift"),
        fcp: getNumeric("first-contentful-paint"),
        ttfb: getNumeric("server-response-time"),
        inp: getNumeric("interaction-to-next-paint"),
    };
}

/**
 * 根据阈值判断哪些 CWV 超标，并生成 Issue
 */
export function checkCWVThresholds(
    cwv: CoreWebVitalsResult,
    thresholds: CWVThresholds = {},
    route: string,
    url: string
): Issue[] {
    const issues: Issue[] = [];
    const merged = { ...DEFAULT_THRESHOLDS, ...thresholds };

    const checks: Array<{ key: keyof CoreWebVitalsResult; ruleId: string; title: string; unit: string }> = [
        { key: "lcp", ruleId: "page-health-lighthouse-lcp", title: "LCP 超过阈值", unit: "ms" },
        { key: "cls", ruleId: "page-health-lighthouse-cls", title: "CLS 超过阈值", unit: "" },
        { key: "fcp", ruleId: "page-health-lighthouse-fcp", title: "FCP 超过阈值", unit: "ms" },
        { key: "ttfb", ruleId: "page-health-lighthouse-ttfb", title: "TTFB 超过阈值", unit: "ms" },
        { key: "inp", ruleId: "page-health-lighthouse-inp", title: "INP 超过阈值", unit: "ms" },
    ];

    for (const check of checks) {
        const value = cwv[check.key];
        const threshold = merged[check.key];
        if (value === undefined || threshold === undefined) continue;
        if (value > threshold) {
            issues.push({
                ruleId: check.ruleId,
                title: `${check.title} (${value}${check.unit} > ${threshold}${check.unit})`,
                description: `页面 ${route} 的 ${check.key.toUpperCase()} 为 ${value}${check.unit}，超过阈值 ${threshold}${check.unit}。`,
                severity: "warning",
                file: route,
                line: 1,
                column: 1,
                meta: {
                    url,
                    value,
                    threshold,
                    metric: check.key,
                },
            });
        }
    }

    return issues;
}

/**
 * 格式化 CWV 结果供 CLI/JSON 展示
 */
export function formatCoreWebVitals(cwv: CoreWebVitalsResult): Record<string, string | number | undefined> {
    return {
        lcp: cwv.lcp === undefined ? "N/A" : `${cwv.lcp}ms`,
        cls: cwv.cls === undefined ? "N/A" : cwv.cls,
        fcp: cwv.fcp === undefined ? "N/A" : `${cwv.fcp}ms`,
        ttfb: cwv.ttfb === undefined ? "N/A" : `${cwv.ttfb}ms`,
        inp: cwv.inp === undefined ? "N/A" : `${cwv.inp}ms`,
    };
}
