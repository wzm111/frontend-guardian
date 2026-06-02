import { describe, it, expect } from "vitest";
import { crossFileRules } from "../src/scanners/cross-file-scanner.js";
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

describe("cross-unused-props", () => {
    const rule = crossFileRules.find((r) => r.id === "cross-unused-props")!;

    it("should detect unused props passed to child", () => {
        const source = `
function Child({ name }) {
  return <div>{name}</div>;
}

function Parent() {
  return <Child name="foo" unusedProp="bar" />;
}
`;
        const issues = rule.execute(createContext(source));
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0].ruleId).toBe("cross-unused-props");
        expect(issues[0].description).toContain("unusedProp");
    });

    it("should allow all used props", () => {
        const source = `
function Child({ name, age }) {
  return <div>{name} {age}</div>;
}

function Parent() {
  return <Child name="foo" age={20} />;
}
`;
        const issues = rule.execute(createContext(source));
        const unusedIssues = issues.filter((i) => i.ruleId === "cross-unused-props");
        expect(unusedIssues.length).toBe(0);
    });

    it("should ignore key, ref, and event handlers", () => {
        const source = `
function Child({ name }) {
  return <div>{name}</div>;
}

function Parent() {
  return <Child name="foo" key="1" ref={ref} onClick={handleClick} data-id="x" aria-label="label" />;
}
`;
        const issues = rule.execute(createContext(source));
        const unusedIssues = issues.filter((i) => i.ruleId === "cross-unused-props");
        expect(unusedIssues.length).toBe(0);
    });
});

describe("cross-missing-props", () => {
    const rule = crossFileRules.find((r) => r.id === "cross-missing-props")!;

    it("should detect missing required props", () => {
        const source = `
function Child({ name, title }) {
  return <div>{name} {title}</div>;
}

function Parent() {
  return <Child name="foo" />;
}
`;
        const issues = rule.execute(createContext(source));
        const missingIssues = issues.filter((i) => i.ruleId === "cross-missing-props");
        expect(missingIssues.length).toBeGreaterThan(0);
        expect(missingIssues[0].description).toContain("title");
    });

    it("should allow children prop (not required)", () => {
        const source = `
function Child({ children }) {
  return <div>{children}</div>;
}

function Parent() {
  return <Child><span>Hello</span></Child>;
}
`;
        const issues = rule.execute(createContext(source));
        const missingIssues = issues.filter(
            (i) => i.ruleId === "cross-missing-props" && i.description.includes("children")
        );
        expect(missingIssues.length).toBe(0);
    });

    it("should allow rest props", () => {
        const source = `
function Child({ name, ...rest }) {
  return <div>{name}</div>;
}

function Parent() {
  return <Child name="foo" />;
}
`;
        const issues = rule.execute(createContext(source));
        const missingIssues = issues.filter((i) => i.ruleId === "cross-missing-props");
        expect(missingIssues.length).toBe(0);
    });
});

describe("cross-context-overuse", () => {
    const rule = crossFileRules.find((r) => r.id === "cross-context-overuse")!;

    it("should detect useContext in same file as Provider", () => {
        const source = `
function Parent() {
  return (
    <UserContext.Provider value={user}>
      <Child />
    </UserContext.Provider>
  );
}

function Child() {
  const user = useContext(UserContext);
  return <div>{user.name}</div>;
}
`;
        const issues = rule.execute(createContext(source));
        const ctxIssues = issues.filter((i) => i.ruleId === "cross-context-overuse");
        expect(ctxIssues.length).toBeGreaterThan(0);
        expect(ctxIssues[0].description).toContain("props");
    });

    it("should not flag if no context consumers", () => {
        const source = `
function Parent() {
  return <Child name="foo" />;
}
function Child({ name }) {
  return <div>{name}</div>;
}
`;
        const issues = rule.execute(createContext(source));
        const ctxIssues = issues.filter((i) => i.ruleId === "cross-context-overuse");
        expect(ctxIssues.length).toBe(0);
    });
});

describe("cross-duplicate-code", () => {
    const rule = crossFileRules.find((r) => r.id === "cross-duplicate-code")!;

    it("should detect similar props structure in sibling components", () => {
        const source = `
function SiblingA({ name, age, email }) {
  return <div>{name}</div>;
}

function SiblingB({ name, age, phone }) {
  return <div>{name}</div>;
}
`;
        const issues = rule.execute(createContext(source));
        const dupIssues = issues.filter((i) => i.ruleId === "cross-duplicate-code");
        expect(dupIssues.some((i) => i.title.includes("相似的 props"))).toBe(true);
    });

    it("should detect duplicate handle functions", () => {
        const source = `
function CompA() {
  function handleSubmit() {}
  function handleReset() {}
  return null;
}

function CompB() {
  function handleSubmit() {}
  function handleReset() {}
  return null;
}
`;
        const issues = rule.execute(createContext(source));
        const dupIssues = issues.filter((i) => i.ruleId === "cross-duplicate-code");
        expect(dupIssues.some((i) => i.title.includes("事件处理"))).toBe(true);
    });
});

describe("cross-extract-common", () => {
    const rule = crossFileRules.find((r) => r.id === "cross-extract-common")!;

    it("should suggest extracting utility functions", () => {
        const source = `
function MyComponent() {
  function formatDate(d) { return d.toISOString(); }
  function parseQuery(q) { return new URLSearchParams(q); }
  function trimString(s) { return s.trim(); }
  return null;
}
`;
        const issues = rule.execute(createContext(source));
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0].ruleId).toBe("cross-extract-common");
        expect(issues[0].description).toContain("utils");
    });

    it("should not flag event handlers", () => {
        const source = `
function MyComponent() {
  function handleClick() {}
  function handleSubmit() {}
  return null;
}
`;
        const issues = rule.execute(createContext(source));
        expect(issues.filter((i) => i.ruleId === "cross-extract-common").length).toBe(0);
    });
});
