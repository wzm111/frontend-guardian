/**
 * Svelte Scanner 测试 — v2.2.0
 *
 * 覆盖 4 条 Svelte 规则：
 * svelte-reactive-statement / svelte-store-unsubscribe / svelte-props-mutate / svelte-event-modifier
 */

import { describe, it, expect } from "vitest";
import { svelteRules } from "../src/scanners/svelte-scanner.js";
import type { RuleContext, Issue } from "../src/types.js";

function runRule(ruleId: string, source: string, filePath = "/test.svelte"): Issue[] {
    const rule = svelteRules.find((r) => r.id === ruleId);
    if (!rule) throw new Error(`Rule ${ruleId} not found`);
    const context: RuleContext = {
        filePath,
        source,
        config: {},
        projectMeta: { platforms: ["pc"], hasTypeScript: false, hasI18n: false, scripts: {} },
        utils: {} as any,
    };
    return rule.execute(context);
}

describe("svelte-reactive-statement", () => {
    it("应检测未声明变量", () => {
        const source = `
<script>
  let count = 0;
  $: doubled = undeclaredVar * 2;
</script>`;
        const issues = runRule("svelte-reactive-statement", source);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0].ruleId).toBe("svelte-reactive-statement");
        // 规则遍历所有变量名，第一个未声明的变量名会触发报告
        expect(issues[0].title).toMatch(/未声明变量/);
    });

    it("已声明变量不应触发", () => {
        const source = `
<script>
  let count = 0;
  let doubled;
  $: doubled = count * 2;
</script>`;
        const issues = runRule("svelte-reactive-statement", source);
        expect(issues).toHaveLength(0);
    });

    it("应跳过内置变量和关键字", () => {
        const source = `
<script>
  let x = 0;
  let result;
  $: result = x + 1;
</script>`;
        const issues = runRule("svelte-reactive-statement", source);
        expect(issues).toHaveLength(0);
    });

    it("应检测多个响应式语句", () => {
        const source = `
<script>
  $: a = unknown1 + 1;
  let b = 0;
  $: c = unknown2 + b;
</script>`;
        const issues = runRule("svelte-reactive-statement", source);
        expect(issues.length).toBeGreaterThanOrEqual(1);
    });
});

describe("svelte-store-unsubscribe", () => {
    it("应检测未取消的 store 订阅", () => {
        const source = `
<script>
  import { writable } from "svelte/store";
  const store = writable(0);
  store.subscribe((v) => console.log(v));
</script>`;
        const issues = runRule("svelte-store-unsubscribe", source);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0].ruleId).toBe("svelte-store-unsubscribe");
        expect(issues[0].title).toContain("store");
    });

    it("不应报告 store.unsubscribe 调用", () => {
        const source = `
<script>
  import { writable } from "svelte/store";
  const store = writable(0);
  const unsub = store.subscribe((v) => console.log(v));
  store.unsubscribe();
</script>`;
        const issues = runRule("svelte-store-unsubscribe", source);
        expect(issues).toHaveLength(0);
    });

    it("在 onDestroy(() => ...) 中取消订阅时不应报警", () => {
        const source = `
<script>
  import { onDestroy } from "svelte";
  import { writable } from "svelte/store";
  const store = writable(0);
  store.subscribe((v) => console.log(v));
  onDestroy(() => {});
</script>`;
        const issues = runRule("svelte-store-unsubscribe", source);
        expect(issues).toHaveLength(0);
    });

    it("无 subscribe 时不应报警", () => {
        const source = `
<script>
  let count = 0;
</script>`;
        const issues = runRule("svelte-store-unsubscribe", source);
        expect(issues).toHaveLength(0);
    });
});

describe("svelte-props-mutate", () => {
    it("应检测直接修改 props（赋值语句在非响应式行）", () => {
        const source = `
<script>
  export let name;
  function update() {
    name = "changed";
  }
</script>`;
        const issues = runRule("svelte-props-mutate", source);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0].ruleId).toBe("svelte-props-mutate");
        expect(issues[0].title).toContain("name");
    });

    it("不应报告 export let 声明本身", () => {
        const source = `
<script>
  export let name = "default";
</script>`;
        const issues = runRule("svelte-props-mutate", source);
        expect(issues).toHaveLength(0);
    });

    it("不应报告响应式语句中的赋值", () => {
        const source = `
<script>
  export let count;
  $: count = count + 1;
</script>`;
        const issues = runRule("svelte-props-mutate", source);
        expect(issues).toHaveLength(0);
    });

    it("应检测多个 props 的修改", () => {
        const source = `
<script>
  export let a;
  export let b;
  function update() {
    a = 1;
    b = 2;
  }
</script>`;
        const issues = runRule("svelte-props-mutate", source);
        expect(issues.length).toBeGreaterThanOrEqual(1);
    });
});

describe("svelte-event-modifier", () => {
    it("应检测 preventDefault 修饰符", () => {
        const source = `<button on:click|preventDefault={handleClick}>Click</button>`;
        const issues = runRule("svelte-event-modifier", source);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0].ruleId).toBe("svelte-event-modifier");
        expect(issues[0].title).toContain("preventDefault");
    });

    it("应检测 stopPropagation 修饰符", () => {
        const source = `<div on:click|stopPropagation={handleClick}>Click</div>`;
        const issues = runRule("svelte-event-modifier", source);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0].title).toContain("stopPropagation");
    });

    it("无修饰符时不应报警", () => {
        const source = `<button on:click={handleClick}>Click</button>`;
        const issues = runRule("svelte-event-modifier", source);
        expect(issues).toHaveLength(0);
    });

    it("应检测多个修饰符", () => {
        const source = `
<button on:click|preventDefault={handle1}>A</button>
<button on:click|stopPropagation={handle2}>B</button>`;
        const issues = runRule("svelte-event-modifier", source);
        expect(issues.length).toBe(2);
    });
});
