/**
 * v4.0.0: 移动端测试共享工具
 *
 * Maestro / Appium 项目检测、CLI 可用性检测、报告解析共享函数。
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { runCommand } from "./base.js";

export type MobileTool = "maestro" | "appium";

export interface DetectedMobileTool {
    tool: MobileTool;
    flowDir?: string;
    configFile?: string;
    wdioConfig?: string;
}

function readPackageJson(projectDir: string): Record<string, unknown> | null {
    try {
        const pkgPath = join(projectDir, "package.json");
        if (!existsSync(pkgPath)) return null;
        return JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    } catch {
        return null;
    }
}

function hasDependency(projectDir: string, names: string[]): boolean {
    const pkg = readPackageJson(projectDir);
    if (!pkg) return false;
    const deps = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
    };
    return names.some((name) => name in deps);
}

/** 检测 Maestro 项目特征 */
export function detectMaestro(projectDir: string): { flowDir?: string; configFile?: string } {
    const maestroDir = join(projectDir, ".maestro");
    if (existsSync(maestroDir) && statSync(maestroDir).isDirectory()) {
        return { flowDir: maestroDir };
    }
    for (const name of ["maestro.yaml", "maestro.yml"]) {
        const configPath = join(projectDir, name);
        if (existsSync(configPath)) {
            return { configFile: name };
        }
    }
    if (hasDependency(projectDir, ["maestro"])) {
        return {};
    }
    return {};
}

/** 检测 Appium / WebdriverIO 项目特征 */
export function detectAppium(projectDir: string): { wdioConfig?: string; hasAppium: boolean } {
    const wdioConfigs = ["wdio.conf.js", "wdio.conf.ts", "wdio.conf.mjs", "wdio.conf.cjs"];
    for (const name of wdioConfigs) {
        const configPath = join(projectDir, name);
        if (existsSync(configPath)) {
            try {
                const content = readFileSync(configPath, "utf-8");
                if (/appium:/.test(content) || /services:\s*\[?[^\]]*appium/i.test(content)) {
                    return { wdioConfig: name, hasAppium: true };
                }
            } catch {
                // ignore
            }
        }
    }
    if (hasDependency(projectDir, ["appium", "webdriverio", "@wdio/cli"])) {
        return { hasAppium: true };
    }
    return { hasAppium: false };
}

/** 自动选择或校验移动端工具 */
export function resolveMobileTool(
    projectDir: string,
    tool: "auto" | MobileTool
): MobileTool | null {
    if (tool !== "auto") {
        if (tool === "maestro") {
            return detectMaestro(projectDir).flowDir || detectMaestro(projectDir).configFile
                ? "maestro"
                : null;
        }
        return detectAppium(projectDir).hasAppium ? "appium" : null;
    }
    const maestro = detectMaestro(projectDir);
    if (maestro.flowDir || maestro.configFile) return "maestro";
    const appium = detectAppium(projectDir);
    if (appium.hasAppium) return "appium";
    return null;
}

/** 检测 Maestro CLI 是否可用 */
export function isMaestroCliAvailable(): boolean {
    const result = runCommand("maestro --version", process.cwd(), 5000);
    return result !== null && !result.toLowerCase().includes("not found");
}

/** 检测 Appium CLI 是否可用（通过 npx） */
export function isAppiumCliAvailable(): boolean {
    const result = runCommand("npx appium --version", process.cwd(), 10000);
    return result !== null && !result.toLowerCase().includes("not found");
}

/** WebdriverIO JSON reporter 输出解析 */
export interface WdioTestCase {
    testName: string;
    state: string;
    error?: string;
    file?: string;
    parent?: string;
    duration?: number;
    sessionId?: string;
    device?: string;
}

export function parseWdioJsonReport(stdout: string): WdioTestCase[] {
    try {
        const report = JSON.parse(stdout) as
            | { tests?: WdioTestCase[] }
            | WdioTestCase[]
            | unknown;
        const tests = Array.isArray(report) ? report : (report as { tests?: WdioTestCase[] }).tests;
        if (!Array.isArray(tests)) return [];
        return tests.map((t) => ({
            testName: String(t.testName || t.name || "unknown"),
            state: String(t.state || "unknown"),
            error: t.error ? String(t.error) : undefined,
            file: t.file ? String(t.file) : undefined,
            parent: t.parent ? String(t.parent) : undefined,
            duration: typeof t.duration === "number" ? t.duration : undefined,
            sessionId: t.sessionId ? String(t.sessionId) : undefined,
            device: t.device ? String(t.device) : undefined,
        }));
    } catch {
        return [];
    }
}

/** JUnit XML 用例解析（Maestro 主要报告格式） */
export interface JUnitCase {
    name: string;
    device?: string;
    duration?: number;
    failure?: { message: string; type?: string };
}

function decodeXmlEntities(input: string): string {
    return input
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

export function parseJUnitXml(xml: string): JUnitCase[] {
    const cases: JUnitCase[] = [];
    const testcaseRegex = /<testcase[^>]*?>/g;
    let match: RegExpExecArray | null;

    while ((match = testcaseRegex.exec(xml)) !== null) {
        const openTag = match[0];
        const nameMatch = /name="([^"]*)"/.exec(openTag);
        const deviceMatch = /classname="([^"]*)"/.exec(openTag);
        const timeMatch = /time="([^"]*)"/.exec(openTag);

        const start = match.index + openTag.length;
        const nextTestcase = xml.indexOf("<testcase", start);
        const end = xml.indexOf("</testcase>", start);
        const sliceEnd = nextTestcase > 0 && nextTestcase < end ? nextTestcase : end;
        const body = sliceEnd > 0 ? xml.slice(start, sliceEnd) : "";

        const failureMatch = /<failure(?:\s+message="([^"]*)")?(?:\s+type="([^"]*)")?[^>]*>([\s\S]*?)<\/failure>/.exec(
            body
        );

        const junitCase: JUnitCase = {
            name: nameMatch ? decodeXmlEntities(nameMatch[1]) : "unknown",
        };
        if (deviceMatch) junitCase.device = decodeXmlEntities(deviceMatch[1]);
        if (timeMatch) junitCase.duration = Math.round(Number.parseFloat(timeMatch[1]) * 1000);
        if (failureMatch) {
            junitCase.failure = {
                message: decodeXmlEntities(failureMatch[1] || failureMatch[3] || "").trim(),
                type: failureMatch[2] || undefined,
            };
        }
        cases.push(junitCase);
    }

    return cases;
}

/** 列出 Maestro flow 文件名（用于 auto-routes） */
export function listMaestroFlowNames(projectDir: string): string[] {
    const maestroDir = join(projectDir, ".maestro");
    if (!existsSync(maestroDir) || !statSync(maestroDir).isDirectory()) return [];
    try {
        return readdirSync(maestroDir)
            .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
            .map((name) => name.replace(/\.ya?ml$/, ""));
    } catch {
        return [];
    }
}
