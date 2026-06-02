import { describe, it, expect } from 'vitest';
import { componentRules } from '../src/scanners/component-scanner.js';
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

describe('component-anti-pattern', () => {
  const rule = componentRules.find(r => r.id === 'component-anti-pattern')!;

  it('should detect Form.Item without name', () => {
    const source = `
function MyForm() {
  return (
    <Form>
      <Form.Item label="用户名">
        <Input />
      </Form.Item>
    </Form>
  );
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('Form.Item 缺少 name'));
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('critical');
  });

  it('should allow Form.Item with noStyle without name', () => {
    const source = `
function MyForm() {
  return (
    <Form.Item noStyle>
      <Input />
    </Form.Item>
  );
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('Form.Item 缺少 name'));
    expect(issue).toBeUndefined();
  });

  it('should detect Table without rowKey', () => {
    const source = `
function MyTable() {
  return <Table dataSource={data} columns={columns} />;
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('rowKey'));
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  it('should allow Table with rowKey', () => {
    const source = `
function MyTable() {
  return <Table dataSource={data} columns={columns} rowKey="id" />;
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('rowKey'));
    expect(issue).toBeUndefined();
  });

  it('should detect Modal without destroyOnClose', () => {
    const source = `
function MyModal() {
  return <Modal visible={visible} onCancel={handleCancel}>内容</Modal>;
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('destroyOnClose'));
    expect(issue).toBeDefined();
  });

  it('should suggest virtual for Select without showSearch', () => {
    const source = `
function MySelect() {
  return <Select options={options} />;
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('Select'));
    expect(issue).toBeDefined();
  });

  it('should detect ElFormItem without prop', () => {
    const source = `
function MyForm() {
  return <ElFormItem label="名称"><Input /></ElFormItem>;
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('ElFormItem 缺少 prop'));
    expect(issue).toBeDefined();
  });
});

describe('component-token', () => {
  const rule = componentRules.find(r => r.id === 'component-token')!;

  it('should detect hardcoded color value', () => {
    const source = `
const style = {
  color: '#1890ff',
  backgroundColor: '#f0f0f0',
};
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('component-token');
    expect(issues[0].title).toContain('硬编码颜色');
  });

  it('should ignore theme variable colors', () => {
    const source = `
const style = {
  color: 'var(--primary-color)',
  backgroundColor: theme.colors.primary,
};
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBe(0);
  });

  it('should detect hardcoded spacing', () => {
    const source = `
const style = {
  margin: 16px,
  padding: 24px,
};
`;
    const issues = rule.execute(createContext(source));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some(i => i.title.includes('硬编码间距'))).toBe(true);
  });

  it('should ignore rpx spacing in mini-program', () => {
    const source = `
const style = {
  margin: '16rpx',
};
`;
    const issues = rule.execute(createContext(source));
    expect(issues.some(i => i.title.includes('间距'))).toBe(false);
  });

  it('should skip comment lines', () => {
    const source = `
// 使用 #1890ff 作为主色
const primary = theme.primary;
`;
    const issues = rule.execute(createContext(source));
    expect(issues.some(i => i.source?.includes('#1890ff'))).toBe(false);
  });
});

describe('component-perf', () => {
  const rule = componentRules.find(r => r.id === 'component-perf')!;

  it('should detect image without lazy loading', () => {
    const source = `
function MyPage() {
  return <img src="/images/banner.png" alt="banner" />;
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('懒加载'));
    expect(issue).toBeDefined();
  });

  it('should allow image with loading lazy', () => {
    const source = `
function MyPage() {
  return <img src="/images/banner.png" loading="lazy" alt="banner" />;
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('懒加载'));
    expect(issue).toBeUndefined();
  });

  it('should detect echarts.init without dispose', () => {
    const source = `
function ChartComponent() {
  const chartRef = useRef(null);
  useEffect(() => {
    const chart = echarts.init(chartRef.current);
  }, []);
  return <div ref={chartRef} />;
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('ECharts'));
    expect(issue).toBeDefined();
  });

  it('should not flag echarts when dispose exists in file', () => {
    const source = `
function ChartComponent() {
  useEffect(() => {
    const chart = echarts.init(ref.current);
    return () => { chart.dispose(); };
  }, []);
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('ECharts'));
    expect(issue).toBeUndefined();
  });

  it('should detect list map without virtualization', () => {
    const source = `
function ListComponent({ items }) {
  return (
    <div>
      {items.map(item => <div key={item.id}>{item.name}</div>)}
    </div>
  );
}
`;
    const issues = rule.execute(createContext(source));
    const issue = issues.find(i => i.title.includes('虚拟化'));
    expect(issue).toBeDefined();
  });
});
