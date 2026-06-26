/**
 * v3.14.1: 页面健康检查录屏回放测试
 */

import { describe, expect, it } from "vitest";
import { formatPageHealthJson, formatPageHealthReport } from "../src/integrations/page-health.js";
import type { PageHealthResult } from "../src/integrations/page-health.js";

describe("Page health video recording", () => {
    it("formatPageHealthJson 包含 videos 字段", () => {
        const result: PageHealthResult = {
            issues: [],
            checkedRoutes: [
                {
                    path: "/",
                    url: "http://localhost:5173/",
                    status: "ok",
                    httpStatus: 200,
                    consoleErrors: 0,
                    consoleWarns: 0,
                    resourceErrors: 0,
                    hasContent: true,
                    duration: 1000,
                    messages: [],
                },
            ],
            screenshots: [],
            videos: ["/tmp/video.webm"],
            duration: 1000,
            baseUrl: "http://localhost:5173",
        };
        const json = formatPageHealthJson(result) as { summary: { videoCount: number }; videos: string[] };
        expect(json.summary.videoCount).toBe(1);
        expect(json.videos).toEqual(["/tmp/video.webm"]);
    });

    it("formatPageHealthReport 显示视频回放路径", () => {
        const result: PageHealthResult = {
            issues: [],
            checkedRoutes: [
                {
                    path: "/error",
                    url: "http://localhost:5173/error",
                    status: "error",
                    httpStatus: 500,
                    consoleErrors: 0,
                    consoleWarns: 0,
                    resourceErrors: 0,
                    hasContent: true,
                    duration: 1000,
                    messages: ["HTTP 500"],
                    videoPath: "/tmp/error.webm",
                },
            ],
            screenshots: [],
            videos: ["/tmp/error.webm"],
            duration: 1000,
            baseUrl: "http://localhost:5173",
        };
        const report = formatPageHealthReport(result);
        expect(report).toContain("🎥 视频回放");
        expect(report).toContain("/tmp/error.webm");
    });
});
