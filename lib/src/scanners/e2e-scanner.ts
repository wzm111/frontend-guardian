/**
 * E2E 测试代码治理 Scanner（v3.6.0）
 *
 * 检测 Playwright / Cypress 测试代码中的反模式和质量问题：
 * 1. 硬编码 CSS 选择器（推荐 data-testid）
 * 2. 固定时长等待（page.waitForTimeout）
 * 3. UI 操作后缺少接口断言（waitForResponse）
 * 4. 测试用例缺少错误处理
 * 5. 测试文件命名不规范
 * 6. 选择器过度依赖类名（.class 而非 role/data-testid）
 *
 * 不依赖 Playwright 运行时，纯文本/AST 扫描。
 */

import type { Rule, RuleContext, Issue } from "@/types.js";

/** E2E 测试文件扩展名 */
const E2E_FILE_PATTERNS = [
    /\.spec\.(ts|js|mjs)$/,
    /\.test\.(ts|js|mjs)$/,
    /\.e2e\.(ts|js|mjs)$/,
    /playwright\.config\./,
    /cypress\.config\./,
];

/** 判断文件是否为 E2E 测试文件 */
function isE2EFile(filePath: string): boolean {
    return E2E_FILE_PATTERNS.some((p) => p.test(filePath));
}

export const e2eRules: Rule[] = [
    {
        id: "e2e-no-hardcode-selector",
        name: "禁止硬编码 CSS 选择器",
        description:
            "E2E 测试中使用硬编码 CSS 选择器（如 .class > div:nth-child(2)）会导致测试脆弱，页面结构调整即失效。推荐改用 data-testid 或 role 选择器。",
        severity: "warning",
        category: "e2e",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/e2e-no-hardcode-selector.md",
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            if (!isE2EFile(context.filePath)) return issues;

            const lines = context.source.split("\n");
            const selectorRegex = /page\.(click|fill|locator|getByRole|getByTestId|getByText)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
            const badSelectorRegex = /(nth-child|:eq\(|>\s*div\b|\.css-|\.style-|#id-)/;

            lines.forEach((line, index) => {
                let match;
                while ((match = selectorRegex.exec(line)) !== null) {
                    const selector = match[2];
                    if (badSelectorRegex.test(selector) || /^[.#]/.test(selector) && selector.split(/\s*[>,+~]\s*/).length > 2) {
                        issues.push({
                            ruleId: "e2e-no-hardcode-selector",
                            title: "硬编码 CSS 选择器",
                            description: `选择器 "${selector}" 过于具体，页面结构调整后容易失效。建议使用 data-testid 或 getByRole 替代。`,
                            severity: "warning",
                            file: context.filePath,
                            line: index + 1,
                            column: (match.index || 0) + 1,
                            source: line.trim(),
                            fix: {
                                text: `page.getByTestId('${suggestTestId(selector)}')`,
                                start: { line: index + 1, column: (match.index || 0) + 1 },
                                end: { line: index + 1, column: (match.index || 0) + match[0].length + 1 },
                                confidence: "low",
                            },
                        });
                    }
                }
            });

            return issues;
        },
    },

    {
        id: "e2e-no-wait-for-timeout",
        name: "禁止固定时长等待",
        description:
            "使用 page.waitForTimeout(n) 固定等待会导致测试不稳定且耗时。应改用 page.waitForSelector、page.waitForResponse 或 expect().toPass()。",
        severity: "critical",
        category: "e2e",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/e2e-no-wait-for-timeout.md",
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            if (!isE2EFile(context.filePath)) return issues;

            const lines = context.source.split("\n");
            const regex = /\bwaitForTimeout\s*\(\s*(\d+)\s*\)/g;

            lines.forEach((line, index) => {
                let match;
                while ((match = regex.exec(line)) !== null) {
                    const ms = parseInt(match[1], 10);
                    issues.push({
                        ruleId: "e2e-no-wait-for-timeout",
                        title: "固定时长等待",
                        description: `使用 waitForTimeout(${ms}) 会导致测试不稳定。建议改用 waitForSelector、waitForResponse 或 expect().toPass({ timeout: ${ms} })。`,
                        severity: ms >= 3000 ? "critical" : "warning",
                        file: context.filePath,
                        line: index + 1,
                        column: (match.index || 0) + 1,
                        source: line.trim(),
                        fix: {
                            text: `// TODO: 替换为 page.waitForSelector('selector') 或 page.waitForResponse(url)`,
                            start: { line: index + 1, column: 1 },
                            end: { line: index + 1, column: line.length + 1 },
                            confidence: "low",
                        },
                    });
                }
            });

            return issues;
        },
    },

    {
        id: "e2e-missing-api-assert",
        name: "UI 操作后缺少接口断言",
        description:
            "点击提交、保存等操作后，应验证对应的接口请求是否成功（waitForResponse），而非仅等待页面跳转。",
        severity: "warning",
        category: "e2e",
        defaultEnabled: true,
        docsUrl: "https://github.com/wzm111/frontend-guardian/blob/main/docs/rules/e2e-missing-api-assert.md",
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            if (!isE2EFile(context.filePath)) return issues;

            const source = context.source;
            const lines = source.split("\n");

            // 检测点击提交/保存后是否缺少 waitForResponse
            // 简单策略：在包含 click/submit 的行之后 5 行内查找 waitForResponse
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // 跳过注释行
                if (line.trim().startsWith("//")) continue;
                const hasSubmit = /\.(click|tap|press)\s*\(/i.test(line) && /submit|save|confirm|order|pay/i.test(line);
                if (!hasSubmit) continue;

                // 检查后续 5 行是否有 waitForResponse（跳过注释行）
                let hasWaitForResponse = false;
                for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
                    if (lines[j].trim().startsWith("//")) continue;
                    if (/waitForResponse/i.test(lines[j])) {
                        hasWaitForResponse = true;
                        break;
                    }
                }

                if (!hasWaitForResponse) {
                    issues.push({
                        ruleId: "e2e-missing-api-assert",
                        title: "UI 操作后缺少接口断言",
                        description: `第 ${i + 1} 行包含提交/点击操作，但后续未检测到接口响应断言（waitForResponse）。建议添加 page.waitForResponse(url => url.includes('...')) 验证后端状态。`,
                        severity: "warning",
                        file: context.filePath,
                        line: i + 1,
                        column: 1,
                        source: line.trim(),
                    });
                }
            }

            return issues;
        },
    },

    {
        id: "e2e-no-try-catch",
        name: "测试用例缺少错误处理",
        description:
            "E2E 测试用例中如果包含网络请求或页面跳转，建议添加 try/catch 或利用测试框架的自动失败机制，避免未捕获异常导致测试进程崩溃。",
        severity: "suggestion",
        category: "e2e",
        defaultEnabled: true,
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            if (!isE2EFile(context.filePath)) return issues;

            const source = context.source;
            // 简单检测：如果测试文件中有 await page.goto 但没有 try/catch 块
            const hasGoto = /await\s+page\.goto\s*\(/i.test(source);
            const hasTryCatch = /try\s*\{/i.test(source) && /catch\s*\(/i.test(source);
            const hasTestBlock = /test\s*\(|it\s*\(/i.test(source);

            if (hasGoto && !hasTryCatch && hasTestBlock) {
                // 只报一次，定位到第一个 test 块
                const lines = source.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    if (/^\s*(test|it)\s*\(/.test(lines[i])) {
                        issues.push({
                            ruleId: "e2e-no-try-catch",
                            title: "测试用例建议添加错误处理",
                            description: "测试文件包含 page.goto 等异步操作，但未检测到 try/catch 块。建议利用 Playwright 的自动重试机制，或在关键操作处添加 expect().toPass()。",
                            severity: "suggestion",
                            file: context.filePath,
                            line: i + 1,
                            column: 1,
                            source: lines[i].trim(),
                        });
                        break;
                    }
                }
            }

            return issues;
        },
    },

    {
        id: "e2e-naming-convention",
        name: "测试文件命名不规范",
        description:
            "E2E 测试文件应遵循统一命名规范：*.spec.ts（Playwright）或 *.cy.ts（Cypress），且存放在 tests/e2e/ 或 e2e/ 目录下。",
        severity: "suggestion",
        category: "e2e",
        defaultEnabled: true,
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            const filePath = context.filePath;

            // 只在扫描到疑似测试文件时触发
            if (!/\.(ts|js|mjs)$/.test(filePath)) return issues;

            // 如果文件在 tests/ 或 e2e/ 目录下但不是规范命名
            const inTestDir = /[\/](tests|e2e|cypress|playwright)[\/]/i.test(filePath);
            const isNamedCorrectly = /\.(spec|test|e2e)\.(ts|js|mjs)$/.test(filePath);
            const isConfigFile = /(playwright|cypress|jest|vitest)\.config\./i.test(filePath);

            if (inTestDir && !isNamedCorrectly && !isConfigFile) {
                const basename = filePath.split("/").pop() || "";
                issues.push({
                    ruleId: "e2e-naming-convention",
                    title: "测试文件命名不规范",
                    description: `测试文件 "${basename}" 命名不符合规范。Playwright 推荐 *.spec.ts，Cypress 推荐 *.cy.ts。`,
                    severity: "suggestion",
                    file: context.filePath,
                    line: 1,
                    column: 1,
                });
            }

            return issues;
        },
    },

    {
        id: "e2e-selector-over-class",
        name: "选择器过度依赖类名",
        description:
            "使用 CSS 类名作为选择器（如 .btn-primary）容易因样式重构而失效。推荐优先使用 role、data-testid 或语义化标签。",
        severity: "warning",
        category: "e2e",
        defaultEnabled: true,
        execute(context: RuleContext): Issue[] {
            const issues: Issue[] = [];
            if (!isE2EFile(context.filePath)) return issues;

            const lines = context.source.split("\n");
            const regex = /page\.(click|fill|locator)\s*\(\s*['"](\.\w[^'"]*)['"]\s*\)/g;

            lines.forEach((line, index) => {
                let match;
                while ((match = regex.exec(line)) !== null) {
                    const selector = match[2];
                    // 忽略简单的单类名，只报复杂的类名链
                    if (selector.split(/\s+/).length > 1 || /-[a-f0-9]{5,}/.test(selector)) {
                        issues.push({
                            ruleId: "e2e-selector-over-class",
                            title: "选择器过度依赖类名",
                            description: `选择器 "${selector}" 依赖 CSS 类名，样式重构后易失效。建议使用 data-testid 或 getByRole 替代。`,
                            severity: "warning",
                            file: context.filePath,
                            line: index + 1,
                            column: (match.index || 0) + 1,
                            source: line.trim(),
                        });
                    }
                }
            });

            return issues;
        },
    },
];

/** 从选择器推断一个合理的 testid */
function suggestTestId(selector: string): string {
    // 简单转换：.submit-btn → submit-btn, #login → login
    return selector
        .replace(/^[.#]/, "")
        .replace(/\s*>.*/g, "")
        .replace(/:nth-child\(\d+\)/g, "")
        .replace(/\[.*\]/g, "")
        .trim();
}
