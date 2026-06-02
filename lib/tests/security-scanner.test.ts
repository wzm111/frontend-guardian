import { describe, it, expect } from "vitest";
import { securityRules } from "../src/scanners/security-scanner.js";
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

describe("sec-xss-innerhtml", () => {
  const rule = securityRules.find((r) => r.id === "sec-xss-innerhtml")!;

  it("should detect innerHTML assignment", () => {
    const source = `element.innerHTML = userInput;`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe("sec-xss-innerhtml");
    expect(issues[0].severity).toBe("critical");
  });

  it("should detect dangerouslySetInnerHTML", () => {
    const source = `<div dangerouslySetInnerHTML={{ __html: html }} />`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].title).toContain("dangerouslySetInnerHTML");
  });
});

describe("sec-eval-dangerous", () => {
  const rule = securityRules.find((r) => r.id === "sec-eval-dangerous")!;

  it("should detect eval()", () => {
    const source = `eval(userCode);`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe("sec-eval-dangerous");
  });

  it("should detect setTimeout with string", () => {
    const source = `setTimeout("alert(1)", 1000);`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].title).toContain("setTimeout");
  });

  it("should not flag setTimeout with function", () => {
    const source = `setTimeout(() => console.log(1), 1000);`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});

describe("sec-no-secrets", () => {
  const rule = securityRules.find((r) => r.id === "sec-no-secrets")!;

  it("should detect hardcoded password", () => {
    const source = `const config = { password = "secret123" };`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].title).toContain("密码");
  });

  it("should detect API key", () => {
    const source = `const api_key = "sk-abcdef1234567890";`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
  });

  it("should skip test data", () => {
    const source = `const mockPassword = "test123";`;
    const issues = rule.execute(createContext(source));
    expect(issues.filter((i) => i.ruleId === "sec-no-secrets").length).toBe(0);
  });
});

describe("sec-cors-misconfig", () => {
  const rule = securityRules.find((r) => r.id === "sec-cors-misconfig")!;

  it("should detect wildcard CORS", () => {
    const source = `res.setHeader('Access-Control-Allow-Origin', '*');`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe("sec-cors-misconfig");
  });
});
