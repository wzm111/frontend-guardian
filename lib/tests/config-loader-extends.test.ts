/**
 * config-loader extends 继承测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "@/utils/config-loader.js";

describe("loadConfig extends", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "fg-extends-"));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it("应正确加载并合并 extends 配置", () => {
        // 基线配置
        writeFileSync(
            join(tmpDir, "base.yml"),
            `
locale: zh
severity: warning
i18n:
  sourceLocale: zh-CN
  targetLocales:
    - en-US
gate:
  enabled: true
  critical:
    max: 0
rules:
  - id: hooks-state-lifting
    enabled: false
  - id: component-token
    severity: critical
`,
        );

        // 项目配置
        writeFileSync(
            join(tmpDir, ".frontend-guardian.yml"),
            `
extends: ./base.yml
severity: critical
i18n:
  sourceLocale: en-US
rules:
  - id: component-token
    severity: warning
  - id: hooks-effect-deps
    severity: suggestion
`,
        );

        const config = loadConfig(tmpDir);

        // override 优先
        expect(config.severity).toBe("critical");
        expect(config.locale).toBe("zh");

        // i18n 完全覆盖
        expect(config.i18n?.sourceLocale).toBe("en-US");
        expect(config.i18n?.targetLocales).toEqual(["en-US"]);

        // gate 从 base 继承
        expect(config.gate?.enabled).toBe(true);
        expect(config.gate?.critical?.max).toBe(0);

        // rules 合并：base 的 hooks-state-lifting 保留，component-token 被覆盖
        expect(config.rules).toHaveLength(3);
        const ruleMap = new Map(config.rules?.map((r) => [r.id, r]));
        expect(ruleMap.get("hooks-state-lifting")?.enabled).toBe(false);
        expect(ruleMap.get("component-token")?.severity).toBe("warning");
        expect(ruleMap.get("hooks-effect-deps")?.severity).toBe("suggestion");
    });

    it("extends 文件不存在时应返回原配置并 warn", () => {
        writeFileSync(
            join(tmpDir, ".frontend-guardian.yml"),
            `
extends: ./non-existent.yml
severity: critical
`,
        );

        const config = loadConfig(tmpDir);
        expect(config.severity).toBe("critical");
        expect(config.extends).toBe("./non-existent.yml");
    });

    it("应支持多级继承", () => {
        // 祖父配置
        writeFileSync(
            join(tmpDir, "grandparent.yml"),
            `
locale: zh
severity: suggestion
gate:
  enabled: false
`,
        );

        // 父配置
        writeFileSync(
            join(tmpDir, "parent.yml"),
            `
extends: ./grandparent.yml
severity: warning
`,
        );

        // 项目配置
        writeFileSync(
            join(tmpDir, ".frontend-guardian.yml"),
            `
extends: ./parent.yml
severity: critical
`,
        );

        const config = loadConfig(tmpDir);
        expect(config.severity).toBe("critical");
        expect(config.locale).toBe("zh");
        expect(config.gate?.enabled).toBe(false);
    });

    it("customRules 应正确合并去重", () => {
        writeFileSync(
            join(tmpDir, "base.yml"),
            `
customRules:
  - path: ./rules/base-rule.js
`,
        );

        writeFileSync(
            join(tmpDir, ".frontend-guardian.yml"),
            `
extends: ./base.yml
customRules:
  - path: ./rules/base-rule.js
  - path: ./rules/project-rule.js
`,
        );

        const config = loadConfig(tmpDir);
        expect(config.customRules).toHaveLength(2);
        expect(config.customRules?.map((c) => c.path)).toContain("./rules/base-rule.js");
        expect(config.customRules?.map((c) => c.path)).toContain("./rules/project-rule.js");
    });

    it("无 extends 时应正常加载", () => {
        writeFileSync(
            join(tmpDir, ".frontend-guardian.yml"),
            `
locale: en
severity: critical
`,
        );

        const config = loadConfig(tmpDir);
        expect(config.locale).toBe("en");
        expect(config.severity).toBe("critical");
    });
});
