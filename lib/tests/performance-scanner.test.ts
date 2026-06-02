import { describe, it, expect } from "vitest";
import { performanceRules } from "../src/scanners/performance-scanner.js";
import { parseAST } from "../src/utils/ast-parser.js";
import type { RuleContext, ProjectMeta } from "../src/types.js";

function createContext(source: string, filePath: string = "test.tsx"): RuleContext {
  return {
    filePath,
    source,
    config: {},
    projectMeta: {
      platforms: ["pc"],
      hasTypeScript: true,
      hasI18n: true,
      scripts: {},
    } as ProjectMeta,
    utils: {
      parseAST: (src: string, opts?: any) => parseAST(src, opts),
      getImports: () => [],
      reportPosition: (offset: number) => ({ line: 1, column: offset + 1 }),
      getSourceSnippet: (start: number, end: number) => source.slice(start, end),
    },
  };
}

describe("perf-avoid-waterfall", () => {
  const rule = performanceRules.find((r) => r.id === "perf-avoid-waterfall")!;

  it("should detect consecutive await assignments", () => {
    const source = `
async function loadData() {
  const users = await fetchUsers();
  const orders = await fetchOrders();
  const products = await fetchProducts();
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe("perf-avoid-waterfall");
    expect(issues[0].description).toContain("Promise.all()");
  });

  it("should not flag single await", () => {
    const source = `
async function loadData() {
  const users = await fetchUsers();
  console.log(users);
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });

  it("should not flag await with non-await in between", () => {
    const source = `
async function loadData() {
  const users = await fetchUsers();
  processUsers(users);
  const orders = await fetchOrders();
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});

describe("perf-avoid-barrel-import", () => {
  const rule = performanceRules.find((r) => r.id === "perf-avoid-barrel-import")!;

  it("should detect barrel import from antd", () => {
    const source = `import { Button, Table } from 'antd';`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe("perf-avoid-barrel-import");
    expect(issues[0].description).toContain("antd");
  });

  it("should detect barrel import from element-plus", () => {
    const source = `import { ElButton } from 'element-plus';`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
  });

  it("should not flag submodule import", () => {
    const source = `import Button from 'antd/es/button';`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});
