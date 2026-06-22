/**
 * v3.10.0: Lighthouse Core Web Vitals 测试
 */

import { describe, expect, it, vi } from "vitest";
import {
    checkCWVThresholds,
    extractCoreWebVitals,
    formatCoreWebVitals,
    isLighthouseAvailable,
} from "../src/utils/lighthouse-metrics.js";

vi.mock("lighthouse", () => ({
    default: vi.fn(),
}));

describe("lighthouse-metrics", () => {
    describe("availability", () => {
        it("未安装时返回 false", () => {
            vi.stubGlobal("require", { resolve: vi.fn(() => { throw new Error("not found"); }) });
            expect(isLighthouseAvailable()).toBe(false);
            vi.unstubAllGlobals();
        });
    });

    describe("extractCoreWebVitals", () => {
        it("从 audits 提取全部指标", () => {
            const runnerResult = {
                lhr: {
                    audits: {
                        "largest-contentful-paint": { numericValue: 1200 },
                        "cumulative-layout-shift": { numericValue: 0.05 },
                        "first-contentful-paint": { numericValue: 900 },
                        "server-response-time": { numericValue: 300 },
                        "interaction-to-next-paint": { numericValue: 150 },
                    },
                },
            };

            const cwv = extractCoreWebVitals(runnerResult);
            expect(cwv.lcp).toBe(1200);
            expect(cwv.cls).toBe(0.05);
            expect(cwv.fcp).toBe(900);
            expect(cwv.ttfb).toBe(300);
            expect(cwv.inp).toBe(150);
        });

        it("缺失指标返回 undefined", () => {
            const cwv = extractCoreWebVitals({ lhr: { audits: {} } });
            expect(cwv.lcp).toBeUndefined();
            expect(cwv.cls).toBeUndefined();
        });
    });

    describe("checkCWVThresholds", () => {
        it("超标时生成 warning Issue", () => {
            const cwv = { lcp: 3000, cls: 0.2, fcp: 2000, ttfb: 900 };
            const issues = checkCWVThresholds(cwv, {}, "/home", "http://localhost:3000/home");
            const ruleIds = issues.map((i) => i.ruleId);
            expect(ruleIds).toContain("page-health-lighthouse-lcp");
            expect(ruleIds).toContain("page-health-lighthouse-cls");
            expect(ruleIds).toContain("page-health-lighthouse-fcp");
            expect(ruleIds).toContain("page-health-lighthouse-ttfb");
            expect(issues.every((i) => i.severity === "warning")).toBe(true);
        });

        it("未超标时不生成 Issue", () => {
            const cwv = { lcp: 2000, cls: 0.05, fcp: 1000, ttfb: 500 };
            const issues = checkCWVThresholds(cwv, {}, "/home", "http://localhost:3000/home");
            expect(issues.length).toBe(0);
        });

        it("支持自定义阈值", () => {
            const cwv = { lcp: 2100 };
            const issues = checkCWVThresholds(cwv, { lcp: 2000 }, "/home", "http://localhost:3000/home");
            expect(issues.length).toBe(1);
        });
    });

    describe("formatCoreWebVitals", () => {
        it("格式化输出包含单位", () => {
            const formatted = formatCoreWebVitals({ lcp: 1200, cls: 0.05, fcp: 900, ttfb: 300, inp: 150 });
            expect(formatted.lcp).toBe("1200ms");
            expect(formatted.cls).toBe(0.05);
            expect(formatted.inp).toBe("150ms");
        });

        it("缺失值显示 N/A", () => {
            const formatted = formatCoreWebVitals({});
            expect(formatted.lcp).toBe("N/A");
        });
    });
});
