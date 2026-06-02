import { describe, it, expect } from 'vitest';
import { platformRules } from '../src/scanners/platform-scanner.js';
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
      parseAST: () => null,
      getImports: () => [],
      reportPosition: (offset: number) => ({ line: 1, column: offset + 1 }),
      getSourceSnippet: (start: number, end: number) => source.slice(start, end),
    },
  };
}

describe('platform-mp-base64', () => {
  const rule = platformRules.find(r => r.id === 'platform-mp-base64')!;

  it('should detect large base64 image inline', () => {
    const base64Data = 'data:image/png;base64,' + 'A'.repeat(1200);
    const source = `const img = '${base64Data}';`;
    const issues = rule.execute(createContext(source, 'pages/index.ts'));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('platform-mp-base64');
    expect(issues[0].severity).toBe('warning');
  });

  it('should ignore small base64 strings', () => {
    const source = `const small = 'data:image/png;base64,iVBORw==';`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});

describe('platform-mp-http', () => {
  const rule = platformRules.find(r => r.id === 'platform-mp-http')!;

  it('should detect HTTP URL in source', () => {
    const source = `const api = 'http://example.com/api/users';`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('platform-mp-http');
    expect(issues[0].severity).toBe('critical');
  });

  it('should allow HTTPS URLs', () => {
    const source = `const api = 'https://example.com/api/users';`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });

  it('should allow localhost', () => {
    const source = `const api = 'http://localhost:3000/api';`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });

  it('should skip commented lines', () => {
    const source = `// http://example.com/old-api`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});

describe('platform-mobile-safearea', () => {
  const rule = platformRules.find(r => r.id === 'platform-mobile-safearea')!;

  it('should detect fixed position without safe-area in CSS', () => {
    const source = `
.footer {
  position: fixed;
  bottom: 0;
  width: 100%;
}
`;
    const issues = rule.execute(createContext(source, 'styles.css'));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some(i => i.title.includes('安全区域'))).toBe(true);
  });

  it('should allow fixed position with safe-area', () => {
    const source = `
.footer {
  position: fixed;
  bottom: env(safe-area-inset-bottom);
}
`;
    const issues = rule.execute(createContext(source, 'styles.css'));
    expect(issues.some(i => i.title.includes('安全区域'))).toBe(false);
  });

  it('should detect small touch target', () => {
    const source = `.btn { width: 32px; height: 32px; }`;
    const issues = rule.execute(createContext(source, 'styles.css'));
    expect(issues.some(i => i.title.includes('点击区域'))).toBe(true);
  });

  it('should not flag non-CSS files', () => {
    const source = `position: fixed;`;
    const issues = rule.execute(createContext(source, 'test.tsx'));
    expect(issues.some(i => i.title.includes('安全区域'))).toBe(false);
  });
});

describe('platform-harmony', () => {
  const rule = platformRules.find(r => r.id === 'platform-harmony')!;

  it('should detect struct without decorator', () => {
    const source = `
struct MyComponent {
  build() {
    Text('Hello')
  }
}
`;
    const issues = rule.execute(createContext(source, 'pages/index.ets'));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('platform-harmony');
  });

  it('should allow struct with @Component', () => {
    const source = `
@Component
struct MyComponent {
  build() {
    Text('Hello')
  }
}
`;
    const issues = rule.execute(createContext(source, 'pages/index.ets'));
    expect(issues.some(i => i.title.includes('装饰器'))).toBe(false);
  });

  it('should detect let without state decorator', () => {
    const source = `
@Component
struct MyComponent {
  let count: number = 0;
}
`;
    const issues = rule.execute(createContext(source, 'pages/index.ets'));
    expect(issues.some(i => i.title.includes('状态变量'))).toBe(true);
  });

  it('should not flag non-ets files', () => {
    const source = `struct MyComponent {}`;
    const issues = rule.execute(createContext(source, 'test.ts'));
    expect(issues.length).toBe(0);
  });
});

describe('platform-responsive', () => {
  const rule = platformRules.find(r => r.id === 'platform-responsive')!;

  it('should suggest responsive config for CSS without media query', () => {
    const source = `
.container { width: 100%; }
`;
    const issues = rule.execute(createContext(source, 'global.css'));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('platform-responsive');
    expect(issues[0].severity).toBe('suggestion');
  });

  it('should allow CSS with media query', () => {
    const source = `
@media (max-width: 768px) { .container { width: 100%; } }
`;
    const issues = rule.execute(createContext(source, 'global.css'));
    expect(issues.length).toBe(0);
  });

  it('should allow JS with matchMedia usage', () => {
    const source = `const mql = window.matchMedia('(max-width: 768px)');`;
    const issues = rule.execute(createContext(source, 'app.tsx'));
    expect(issues.length).toBe(0);
  });

  it('should only check entry files', () => {
    const source = `.container { width: 100%; }`;
    const issues = rule.execute(createContext(source, 'components/button.css'));
    expect(issues.length).toBe(0);
  });
});
