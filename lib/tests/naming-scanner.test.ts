import { describe, it, expect } from 'vitest';
import { namingRules } from '../src/scanners/naming-scanner.js';
import { parseAST } from '../src/utils/ast-parser.js';
import type { RuleContext, ProjectMeta } from '../src/types.js';

function createContext(source: string, filePath: string = 'test.tsx'): RuleContext {
  return {
    filePath,
    source,
    config: {},
    projectMeta: {
      platforms: ['pc'],
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

describe('naming-class', () => {
  const rule = namingRules.find(r => r.id === 'naming-class')!;

  it('should detect class with non-PascalCase name', () => {
    const source = `class myClass {}`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('naming-class');
    expect(issues[0].title).toContain('myClass');
  });

  it('should allow PascalCase class name', () => {
    const source = `class MyClass {}`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});

describe('naming-interface', () => {
  const rule = namingRules.find(r => r.id === 'naming-interface')!;

  it('should detect interface with non-PascalCase name', () => {
    const source = `interface myInterface {}`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('naming-interface');
  });

  it('should allow PascalCase interface name', () => {
    const source = `interface MyInterface {}`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});

describe('naming-function', () => {
  const rule = namingRules.find(r => r.id === 'naming-function')!;

  it('should detect function with non-camelCase name', () => {
    const source = `function MyFunction() { return 1; }`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('naming-function');
  });

  it('should allow camelCase function name', () => {
    const source = `function myFunction() { return 1; }`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });

  it('should allow PascalCase for React components', () => {
    const source = `
function MyComponent() {
  return <div>Hello</div>;
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});

describe('naming-variable', () => {
  const rule = namingRules.find(r => r.id === 'naming-variable')!;

  it('should detect let variable with non-camelCase name', () => {
    const source = `let MyVar = 1;`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('naming-variable');
  });

  it('should allow camelCase variable name', () => {
    const source = `let myVar = 1;`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});

describe('naming-enum', () => {
  const rule = namingRules.find(r => r.id === 'naming-enum')!;

  it('should detect enum with non-PascalCase name', () => {
    const source = `enum myStatus { ACTIVE, INACTIVE }`;
    const issues = rule.execute(createContext(source));
    const nameIssue = issues.find(i => i.title.includes('枚举名'));
    expect(nameIssue).toBeDefined();
  });

  it('should detect enum members not in UPPER_SNAKE_CASE', () => {
    const source = `enum Status { active, inactive }`;
    const issues = rule.execute(createContext(source));
    const memberIssue = issues.find(i => i.title.includes('枚举成员'));
    expect(memberIssue).toBeDefined();
  });
});
