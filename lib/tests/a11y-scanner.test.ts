import { describe, it, expect } from 'vitest';
import { a11yRules } from '../src/scanners/a11y-scanner.js';
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

describe('a11y-img-alt', () => {
  const rule = a11yRules.find(r => r.id === 'a11y-img-alt')!;

  it('should detect img without alt', () => {
    const source = `<img src="logo.png" />;`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('a11y-img-alt');
    expect(issues[0].severity).toBe('critical');
  });

  it('should not flag img with alt', () => {
    const source = `<img src="logo.png" alt="Company Logo" />;`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });

  it('should allow empty alt for decorative images', () => {
    const source = `<img src="decoration.png" alt="" />;`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});

describe('a11y-form-label', () => {
  const rule = a11yRules.find(r => r.id === 'a11y-form-label')!;

  it('should detect input without label', () => {
    const source = `<input type="text" placeholder="Enter name" />;`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('a11y-form-label');
  });

  it('should not flag input with aria-label', () => {
    const source = `<input type="text" aria-label="User name" />;`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});

describe('a11y-button-role', () => {
  const rule = a11yRules.find(r => r.id === 'a11y-button-role')!;

  it('should detect div with onClick', () => {
    const source = `<div onClick={handleClick}>Click me</div>;`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('a11y-button-role');
  });

  it('should not flag button with onClick', () => {
    const source = `<button onClick={handleClick}>Click me</button>;`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});

describe('a11y-aria-valid', () => {
  const rule = a11yRules.find(r => r.id === 'a11y-aria-valid')!;

  it('should detect invalid aria attribute', () => {
    const source = `<div aria-invalid-attribute="true" />;`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('a11y-aria-valid');
  });

  it('should detect invalid role', () => {
    const source = `<div role="invalidrole" />;`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].title).toContain('无效的 ARIA role');
  });

  it('should not flag valid aria attributes', () => {
    const source = `<div aria-label="Close" aria-hidden="true" />;`;
    const issues = rule.execute(createContext(source));
    expect(issues.filter(i => i.ruleId === 'a11y-aria-valid').length).toBe(0);
  });
});
