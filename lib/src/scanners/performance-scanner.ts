/**
 * 性能规则 Scanner
 * 参考 Vercel React Best Practices 的 57 条规则
 */

import type { ParseResult } from '@babel/parser';
import traverse from '@babel/traverse';
import type { Rule, RuleContext, Issue } from '../types.js';
import { parseAST } from '../utils/ast-parser.js';

/** 组件库入口包名 */
const BARREL_PACKAGES = [
  'antd',
  '@ant-design/react-native',
  'ant-design-vue',
  'element-plus',
  '@mui/material',
  'vuetify',
  '@nutui/nutui-react',
  '@nutui/nutui',
  'tdesign-react',
  'tdesign-vue-next',
  '@arco-design/web-react',
  'naive-ui',
  'quasar',
  'primevue',
  'primereact',
  'bootstrap-vue-next',
];

export const performanceRules: Rule[] = [
  {
    id: 'perf-avoid-waterfall',
    name: '避免请求瀑布',
    description: '不要连续使用 await 获取独立数据，应并行发起请求',
    severity: 'warning',
    category: 'performance',
    defaultEnabled: true,
    frameworks: ['react', 'nextjs', 'vue', 'nuxt'],
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const ast = context.utils.parseAST(context.source, {
        ext: getFileExt(context.filePath),
      }) as ParseResult<any> | null;

      if (!ast) return issues;

      traverse(ast, {
        // 检测函数体内的连续 await
        FunctionDeclaration(path) {
          checkConsecutiveAwait(path.node.body, issues, context.filePath);
        },
        FunctionExpression(path) {
          checkConsecutiveAwait(path.node.body, issues, context.filePath);
        },
        ArrowFunctionExpression(path) {
          if (path.node.body.type === 'BlockStatement') {
            checkConsecutiveAwait(path.node.body, issues, context.filePath);
          }
        },
      });

      return issues;
    },
  },

  {
    id: 'perf-dynamic-import',
    name: '大组件懒加载',
    description: '超过 50KB 的组件应使用动态导入',
    severity: 'suggestion',
    category: 'performance',
    defaultEnabled: true,
    frameworks: ['react', 'nextjs', 'vue'],
    execute() {
      // TODO: 检测组件体积（需要文件系统分析）
      return [];
    },
  },

  {
    id: 'perf-avoid-barrel-import',
    name: '避免整库导入',
    description: '不要从组件库入口导入，应从子模块导入',
    severity: 'warning',
    category: 'performance',
    defaultEnabled: true,
    frameworks: ['react', 'vue', 'nextjs', 'nuxt'],
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const ast = context.utils.parseAST(context.source, {
        ext: getFileExt(context.filePath),
      }) as ParseResult<any> | null;

      if (!ast) return issues;

      traverse(ast, {
        ImportDeclaration(path) {
          const source = path.node.source.value;

          // 检测整库导入
          for (const pkg of BARREL_PACKAGES) {
            if (source === pkg) {
              // 跳过只有 1 个导入的情况（但仍在 Warning 级别提示）
              const specCount = path.node.specifiers.length;
              const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

              issues.push({
                ruleId: 'perf-avoid-barrel-import',
                title: '避免从组件库入口导入',
                description: `从 "${pkg}" 入口导入会导致整库被打包，建议改为子模块导入（如 "${pkg}/es/button"）`,
                severity: 'warning',
                file: context.filePath,
                line,
                column,
                source: `import { ... } from '${pkg}';`,
                fix: {
                  text: suggestSubmoduleImport(pkg, path.node.specifiers),
                  start: { line, column },
                  end: { line, column: column + path.node.source.value.length + 2 },
                },
              });
              break;
            }
          }
        },
      });

      return issues;
    },
  },

  {
    id: 'perf-memo-expensive',
    name: '昂贵计算使用 memo',
    description: '复杂计算应使用 useMemo / computed',
    severity: 'suggestion',
    category: 'performance',
    defaultEnabled: true,
    frameworks: ['react', 'nextjs', 'vue'],
    execute() {
      // TODO: 检测循环/map/filter 在渲染中未 memo
      return [];
    },
  },
];

// ============================================================================
// 辅助函数
// ============================================================================

/** 检测函数体内的连续 await */
function checkConsecutiveAwait(
  body: any,
  issues: Issue[],
  filePath: string
): void {
  if (!body?.body || !Array.isArray(body.body)) return;

  const statements = body.body;
  const awaitStmts: Array<{ line: number; column: number; source: string }> = [];

  for (const stmt of statements) {
    // 检查是否是 await 赋值语句
    if (stmt.type === 'VariableDeclaration') {
      let hasAwait = false;
      let line = 0;
      let column = 0;

      for (const decl of stmt.declarations) {
        if (decl.init?.type === 'AwaitExpression') {
          hasAwait = true;
          line = decl.init.loc?.start?.line || 0;
          column = decl.init.loc?.start?.column || 0;
        }
      }

      if (hasAwait) {
        awaitStmts.push({
          line,
          column,
          source: `await ...`,
        });
      } else {
        // 不是 await 语句，重置计数
        if (awaitStmts.length >= 2) {
          reportWaterfall(issues, filePath, awaitStmts);
        }
        awaitStmts.length = 0;
      }
    } else {
      // 不是变量声明，重置计数
      if (awaitStmts.length >= 2) {
        reportWaterfall(issues, filePath, awaitStmts);
      }
      awaitStmts.length = 0;
    }
  }

  // 检查末尾
  if (awaitStmts.length >= 2) {
    reportWaterfall(issues, filePath, awaitStmts);
  }
}

/** 报告请求瀑布问题 */
function reportWaterfall(
  issues: Issue[],
  filePath: string,
  awaitStmts: Array<{ line: number; column: number; source: string }>
): void {
  const first = awaitStmts[0];
  issues.push({
    ruleId: 'perf-avoid-waterfall',
    title: '检测到请求瀑布',
    description: `发现 ${awaitStmts.length} 个连续的 await，总耗时 = 各请求之和。建议使用 Promise.all() 并行`,
    severity: 'warning',
    file: filePath,
    line: first.line,
    column: first.column,
    source: first.source,
  });
}

/** 获取文件扩展名 */
function getFileExt(filePath: string): string {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0] : '.js';
}

/** 建议子模块导入 */
function suggestSubmoduleImport(pkg: string, specifiers: any[]): string {
  const imports = specifiers
    .filter(s => s.type === 'ImportSpecifier' && s.local?.type === 'Identifier')
    .map(s => {
      const name = s.local.name;
      const kebab = name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
      return `import ${name} from '${pkg}/es/${kebab}';`;
    })
    .join('\n');

  return imports || `// TODO: 手动改为子模块导入`;
}
