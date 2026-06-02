import { describe, it, expect } from "vitest";
import { RuleRegistry, createRegistry } from "../src/rules/registry.js";
import type { Rule, RuleContext, Issue } from "../src/types.js";

function makeRule(id: string, category: any = "hooks", severity: any = "warning"): Rule {
    return {
        id,
        name: id,
        description: `Test rule ${id}`,
        severity,
        category,
        defaultEnabled: true,
        execute(_ctx: RuleContext): Issue[] {
            return [];
        },
    };
}

describe("RuleRegistry", () => {
    describe("register / registerAll", () => {
        it("should register a single rule", () => {
            const registry = createRegistry();
            const rule = makeRule("test-rule");
            registry.register(rule);
            expect(registry.getRaw("test-rule")).toBe(rule);
        });

        it("should register multiple rules", () => {
            const registry = createRegistry();
            const rules = [makeRule("r1"), makeRule("r2")];
            registry.registerAll(rules);
            expect(registry.getRuleIds()).toHaveLength(2);
            expect(registry.getRuleIds()).toContain("r1");
            expect(registry.getRuleIds()).toContain("r2");
        });
    });

    describe("loadFromConfig", () => {
        it("should disable rules via config", () => {
            const registry = createRegistry();
            registry.register(makeRule("rule-a"));
            registry.register(makeRule("rule-b"));

            registry.loadFromConfig([{ id: "rule-a", enabled: false }]);

            const active = registry.getActiveRules();
            expect(active.map((r) => r.id)).toContain("rule-b");
            expect(active.map((r) => r.id)).not.toContain("rule-a");
        });

        it("should override severity via config", () => {
            const registry = createRegistry();
            registry.register(makeRule("rule-a", "hooks", "warning"));

            registry.loadFromConfig([{ id: "rule-a", severity: "critical" }]);

            const rule = registry.getRule("rule-a")!;
            expect(rule.severity).toBe("critical");
        });

        it("should apply params via config", () => {
            const registry = createRegistry();
            registry.register(makeRule("rule-a"));

            registry.loadFromConfig([{ id: "rule-a", params: { maxDeps: 7 } }]);

            const rule = registry.getRule("rule-a")!;
            expect(rule.meta).toBeDefined();
            expect(rule.meta!._paramsOverride).toEqual({ maxDeps: 7 });
            expect(rule.meta!.maxDeps).toBe(7);
        });

        it("should skip invalid config entries", () => {
            const registry = createRegistry();
            // @ts-expect-error 故意传入缺少 id 的配置
            registry.loadFromConfig([{ enabled: false }]);
            expect(registry.getActiveRules()).toHaveLength(0);
        });
    });

    describe("filterRules", () => {
        it("should filter by category", () => {
            const registry = createRegistry();
            registry.register(makeRule("r1", "hooks"));
            registry.register(makeRule("r2", "i18n"));
            registry.register(makeRule("r3", "hooks"));

            const filtered = registry.filterRules({ category: "hooks" });
            expect(filtered).toHaveLength(2);
            expect(filtered.map((r) => r.id)).toEqual(["r1", "r3"]);
        });

        it("should filter by framework", () => {
            const registry = createRegistry();
            registry.register({
                ...makeRule("react-rule"),
                frameworks: ["react"],
            });
            registry.register({
                ...makeRule("vue-rule"),
                frameworks: ["vue"],
            });

            expect(registry.filterRules({ framework: "react" })).toHaveLength(1);
            expect(registry.filterRules({ framework: "react" })[0].id).toBe("react-rule");
        });
    });

    describe("getRule / getRaw", () => {
        it("getRule should return config-overridden copy", () => {
            const registry = createRegistry();
            const original = makeRule("rule-a", "hooks", "warning");
            registry.register(original);

            registry.loadFromConfig([{ id: "rule-a", severity: "critical" }]);

            const overridden = registry.getRule("rule-a")!;
            const raw = registry.getRaw("rule-a")!;

            expect(overridden.severity).toBe("critical");
            expect(raw.severity).toBe("warning");
            expect(overridden.id).toBe(original.id);
        });

        it("should return undefined for unknown rule", () => {
            const registry = createRegistry();
            expect(registry.getRule("no-such-rule")).toBeUndefined();
            expect(registry.getRaw("no-such-rule")).toBeUndefined();
        });
    });

    describe("clearOverrides / clearCustomRules", () => {
        it("clearOverrides should reset to defaults", () => {
            const registry = createRegistry();
            registry.register(makeRule("rule-a", "hooks", "warning"));
            registry.loadFromConfig([{ id: "rule-a", severity: "critical" }]);

            expect(registry.getRule("rule-a")!.severity).toBe("critical");

            registry.clearOverrides();
            expect(registry.getRule("rule-a")!.severity).toBe("warning");
        });
    });
});
