import { describe, it, expect } from 'vitest';
import { hooksRules } from '../src/scanners/hooks-scanner.js';
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

describe('hooks-effect-deps', () => {
  const rule = hooksRules.find(r => r.id === 'hooks-effect-deps')!;

  it('should detect useEffect without deps array', () => {
    const source = `
function MyComp() {
  useEffect(() => { console.log('hello'); });
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('hooks-effect-deps');
    expect(issues[0].title).toContain('缺少依赖数组');
  });

  it('should detect empty deps with state reference', () => {
    const source = `
function MyComp() {
  const [state, setState] = useState(0);
  useEffect(() => { console.log(state); }, []);
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('空依赖'));
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('critical');
  });

  it('should detect too many deps', () => {
    const source = `
function MyComp() {
  useEffect(() => {}, [a, b, c, d, e, f, g]);
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('依赖过多'));
    expect(issue).toBeDefined();
  });

  it('should allow normal deps array', () => {
    const source = `
function MyComp() {
  useEffect(() => {}, [dep1, dep2]);
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('缺少') || i.title.includes('过多'));
    expect(issue).toBeUndefined();
  });

  it('should warn about potentially missing deps', () => {
    const source = `
function MyComp() {
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => {
    if (isLoading) fetchData();
  }, []);
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.some(i => i.title.includes('可能缺少依赖'))).toBe(true);
  });
});

describe('hooks-closure', () => {
  const rule = hooksRules.find(r => r.id === 'hooks-closure')!;

  it('should detect setInterval without cleanup in useEffect', () => {
    const source = `
function Timer() {
  useEffect(() => {
    const id = setInterval(() => { tick(); }, 1000);
  }, []);
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('hooks-closure');
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].title).toContain('setInterval 缺少 cleanup');
  });

  it('should detect setTimeout without cleanup in useEffect', () => {
    const source = `
function Delayed() {
  useEffect(() => {
    const id = setTimeout(() => { doSomething(); }, 500);
  }, []);
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].title).toContain('setTimeout 缺少 cleanup');
  });

  it('should allow setInterval with cleanup', () => {
    const source = `
function Timer() {
  useEffect(() => {
    const id = setInterval(() => { tick(); }, 1000);
    return () => clearInterval(id);
  }, []);
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });

  it('should not flag setInterval outside useEffect', () => {
    const source = `
function handleClick() {
  setInterval(() => {}, 1000);
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});

describe('hooks-custom-naming', () => {
  const rule = hooksRules.find(r => r.id === 'hooks-custom-naming')!;

  it('should detect function using hooks without use prefix', () => {
    const source = `
function fetchData() {
  const [data, setData] = useState(null);
  return data;
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('hooks-custom-naming');
    expect(issues[0].title).toContain('fetchData');
  });

  it('should allow function with use prefix', () => {
    const source = `
function useFetchData() {
  const [data, setData] = useState(null);
  return data;
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });

  it('should not flag non-hook functions', () => {
    const source = `
function calculateSum(a, b) {
  return a + b;
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});

describe('composables-reactive', () => {
  const rule = hooksRules.find(r => r.id === 'composables-reactive')!;

  it('should detect reactive destructuring', () => {
    const source = `
function setup() {
  const { count, name } = reactive({ count: 0, name: 'test' });
  return { count, name };
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('composables-reactive');
    expect(issues[0].severity).toBe('critical');
  });

  it('should not flag non-destructured reactive', () => {
    const source = `
function setup() {
  const state = reactive({ count: 0 });
  return { state };
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });

  it('should provide fix suggestion', () => {
    const source = `
const { count } = reactive({ count: 0 });
`;
    const issues = rule.execute(createContext(source));
    expect(issues[0].fix).toBeDefined();
    expect(issues[0].fix!.text).toContain('toRefs');
  });
});

describe('composables-computed', () => {
  const rule = hooksRules.find(r => r.id === 'composables-computed')!;

  it('should detect side effects in computed', () => {
    const source = `
function setup() {
  const fullName = computed(() => {
    const result = ref('');
    result.value = firstName.value + lastName.value;
    return result.value;
  });
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('composables-computed');
  });

  it('should allow pure computed function', () => {
    const source = `
function setup() {
  const fullName = computed(() => firstName.value + ' ' + lastName.value);
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});

describe('hooks-state-lifting', () => {
  const rule = hooksRules.find(r => r.id === 'hooks-state-lifting')!;

  it('should suggest lifting when too many useState', () => {
    const source = `
function MyComp() {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [c, setC] = useState(0);
  const [d, setD] = useState(0);
  const [e, setE] = useState(0);
  const [f, setF] = useState(0);
  return null;
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('hooks-state-lifting');
    expect(issues[0].title).toContain('useState');
  });

  it('should suggest lifting when too many refs in Vue', () => {
    const source = `
function setup() {
  const a = ref(0);
  const b = ref(0);
  const c = ref(0);
  const d = ref(0);
  const e = ref(0);
  const f = ref(0);
  const g = ref(0);
  const h = ref(0);
  const i = ref(0);
  return null;
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].title).toContain('ref');
  });

  it('should not flag normal state count', () => {
    const source = `
function MyComp() {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  return null;
}
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });
});
