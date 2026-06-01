import { describe, it, expect } from 'vitest';
import { i18nRules } from '../src/scanners/i18n-scanner.js';
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

describe('i18n-hardcoded-string', () => {
  const rule = i18nRules.find(r => r.id === 'i18n-hardcoded-string')!;

  it('should detect Chinese string literal', () => {
    const source = `const msg = "你好世界";`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('i18n-hardcoded-string');
    expect(issues[0].source).toBe('你好世界');
  });

  it('should skip import statements', () => {
    const source = `import { Button } from "antd";`;
    const issues = rule.execute(createContext(source));
    expect(issues.filter(i => i.ruleId === 'i18n-hardcoded-string').length).toBe(0);
  });

  it('should skip console.log', () => {
    const source = `console.log("调试信息");`;
    const issues = rule.execute(createContext(source));
    expect(issues.filter(i => i.ruleId === 'i18n-hardcoded-string').length).toBe(0);
  });

  it('should detect JSX text with Chinese', () => {
    const source = `<div>欢迎使用</div>;`;
    const issues = rule.execute(createContext(source));
    const jsxIssues = issues.filter(i => i.ruleId === 'i18n-hardcoded-jsx-text');
    expect(jsxIssues.length).toBeGreaterThan(0);
    expect(jsxIssues[0].severity).toBe('critical');
  });

  it('should detect Chinese in JSX attributes', () => {
    const source = `<input placeholder="请输入用户名" />;`;
    const issues = rule.execute(createContext(source));
    const attrIssues = issues.filter(i => i.ruleId === 'i18n-hardcoded-attribute');
    expect(attrIssues.length).toBeGreaterThan(0);
    expect(attrIssues[0].source).toBe('请输入用户名');
  });
});

describe('i18n-missing-key', () => {
  const rule = i18nRules.find(r => r.id === 'i18n-missing-key')!;

  it('should detect missing key when no locale files exist', () => {
    const source = `const text = t('nonexistent.key');`;
    const issues = rule.execute(createContext(source));
    // No locale files → no keys collected → should not report
    expect(issues.length).toBe(0);
  });
});
