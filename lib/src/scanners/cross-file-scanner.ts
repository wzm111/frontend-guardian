/**
 * 跨文件公共部分 Scanner
 *
 * 检测范围：
 * 1. 父子组件 — 未使用的 props、缺失的 props、props 类型不匹配
 * 2. 爷孙组件 — Context 过度使用（浅层传递应使用 props）
 * 3. 兄弟组件 — 重复代码检测、公共逻辑提取建议
 * 4. 跨文件公共 — 相似函数/组件建议提取到公共模块
 *
 * 实现方式：
 * - 先解析所有文件的 AST
 * - 提取组件信息（props、context、函数签名）
 * - 建立文件依赖图（import/export 关系）
 * - 分析跨文件问题
 */

import type { ParseResult } from '@babel/parser';
import traverse from '@babel/traverse';
import { readFileSync } from 'node:fs';
import { resolve, dirname, relative, basename } from 'node:path';
import { globby } from 'globby';
import type { Rule, RuleContext, Issue, ImportInfo } from '../types.js';
import { parseAST, getImports } from '../utils/ast-parser.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 组件/函数信息 */
interface ComponentInfo {
  name: string;
  filePath: string;
  type: 'function' | 'class' | 'arrow-function';
  /** 声明的 props（从函数参数或接口提取） */
  declaredProps: Array<{ name: string; optional: boolean; type?: string }>;
  /** 实际使用的 props */
  usedProps: string[];
  /** 消费了哪些 context */
  contextConsumers: string[];
  /** 提供了哪些 context */
  contextProviders: string[];
  /** 定义的函数/方法 */
  functions: Array<{ name: string; body: string; params: string[] }>;
  /** 导入信息 */
  imports: ImportInfo[];
  /** 导出的内容 */
  exports: string[];
  /** JSX 中使用的外部组件 */
  usedComponents: Array<{ name: string; props: string[]; line: number; column: number }>;
  /** 行号 */
  line: number;
  column: number;
}

/** 文件图 */
interface FileGraph {
  /** filePath -> ComponentInfo[] */
  components: Map<string, ComponentInfo[]>;
  /** filePath -> imported file paths */
  imports: Map<string, string[]>;
  /** componentName -> ComponentInfo */
  componentIndex: Map<string, ComponentInfo>;
}

// ============================================================================
// 规则定义
// ============================================================================

export const crossFileRules: Rule[] = [
  {
    id: 'cross-unused-props',
    name: '父组件传递了未使用的 props',
    description: '父组件向子组件传递了 props，但子组件没有使用',
    severity: 'warning',
    category: 'architecture',
    defaultEnabled: true,
    execute(context: RuleContext): Issue[] {
      const graph = buildFileGraph(context);
      return analyzeUnusedProps(graph, context);
    },
  },
  {
    id: 'cross-missing-props',
    name: '子组件缺少必要的 props',
    description: '子组件声明了必传的 props，但父组件没有传递',
    severity: 'warning',
    category: 'architecture',
    defaultEnabled: true,
    execute(context: RuleContext): Issue[] {
      const graph = buildFileGraph(context);
      return analyzeMissingProps(graph, context);
    },
  },
  {
    id: 'cross-context-overuse',
    name: 'Context 过度使用',
    description: '爷孙组件间只有单层嵌套时使用 Context 是不必要的，应使用 props 传递',
    severity: 'suggestion',
    category: 'architecture',
    defaultEnabled: true,
    execute(context: RuleContext): Issue[] {
      const graph = buildFileGraph(context);
      return analyzeContextOveruse(graph, context);
    },
  },
  {
    id: 'cross-duplicate-code',
    name: '兄弟组件存在重复代码',
    description: '同级目录下的文件存在相似的函数或逻辑，建议提取公共模块',
    severity: 'suggestion',
    category: 'architecture',
    defaultEnabled: true,
    execute(context: RuleContext): Issue[] {
      const graph = buildFileGraph(context);
      return analyzeDuplicateCode(graph, context);
    },
  },
  {
    id: 'cross-extract-common',
    name: '建议提取公共逻辑',
    description: '多个兄弟文件使用相似的逻辑，建议提取到 hooks/utils',
    severity: 'suggestion',
    category: 'architecture',
    defaultEnabled: true,
    execute(context: RuleContext): Issue[] {
      const graph = buildFileGraph(context);
      return analyzeExtractCommon(graph, context);
    },
  },
];

// ============================================================================
// 文件图构建
// ============================================================================

/** 构建项目文件图 */
function buildFileGraph(context: RuleContext): FileGraph {
  const projectDir = context.filePath.split('/src/')[0] || dirname(context.filePath);
  const graph: FileGraph = {
    components: new Map(),
    imports: new Map(),
    componentIndex: new Map(),
  };

  // 获取项目中的源文件（限制为当前目录下的文件，避免全项目扫描太慢）
  const currentDir = dirname(context.filePath);
  const siblingFiles = getSiblingFiles(currentDir, context.filePath);

  // 解析当前文件和兄弟文件
  const filesToParse = [context.filePath, ...siblingFiles];

  for (const filePath of filesToParse) {
    try {
      // 当前文件使用 context.source（避免文件不存在时读取失败）
      let source: string;
      if (filePath === context.filePath) {
        source = context.source;
      } else {
        source = readFileSync(filePath, 'utf-8');
      }
      const ext = getFileExt(filePath);
      const ast = parseAST(source, { ext }) as ParseResult<any> | null;

      if (!ast) continue;

      // 提取组件信息
      const components = extractComponents(filePath, ast, source);
      graph.components.set(filePath, components);

      // 建立组件索引
      for (const comp of components) {
        graph.componentIndex.set(comp.name, comp);
      }

      // 提取导入关系
      const imports = getImports(ast);
      const importedFiles: string[] = [];
      for (const imp of imports) {
        // 解析相对路径为绝对路径
        if (imp.source.startsWith('.')) {
          const resolved = resolve(dirname(filePath), imp.source);
          // 尝试添加扩展名
          for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
            try {
              const fullPath = resolved + ext;
              readFileSync(fullPath, 'utf-8');
              importedFiles.push(fullPath);
              break;
            } catch {
              // 尝试 index 文件
              try {
                const indexPath = resolve(resolved, 'index' + ext);
                readFileSync(indexPath, 'utf-8');
                importedFiles.push(indexPath);
                break;
              } catch {
                // 继续尝试
              }
            }
          }
        }
      }
      graph.imports.set(filePath, importedFiles);
    } catch {
      // 文件读取失败，跳过
    }
  }

  return graph;
}

/** 获取兄弟文件（同目录下的其他文件） */
function getSiblingFiles(dir: string, excludeFile: string): string[] {
  const { readdirSync, statSync } = require('node:fs');
  const { resolve, extname } = require('node:path');

  const siblings: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = resolve(dir, entry);
      const stat = statSync(fullPath);
      if (!stat.isFile()) continue;
      if (fullPath === excludeFile) continue;

      const ext = extname(fullPath).toLowerCase();
      if (['.js', '.ts', '.jsx', '.tsx', '.vue'].includes(ext)) {
        siblings.push(fullPath);
      }
    }
  } catch {
    // 目录读取失败
  }

  // 也检查父目录的兄弟（堂兄弟文件）
  const parentDir = dirname(dir);
  if (parentDir !== dir) {
    try {
      const parentEntries = readdirSync(parentDir);
      for (const entry of parentEntries) {
        const fullPath = resolve(parentDir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory() && fullPath !== dir) {
          // 子目录下的文件
          try {
            const subEntries = readdirSync(fullPath);
            for (const sub of subEntries) {
              const subPath = resolve(fullPath, sub);
              const subStat = statSync(subPath);
              if (subStat.isFile()) {
                const ext = extname(subPath).toLowerCase();
                if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
                  siblings.push(subPath);
                }
              }
            }
          } catch {
            // 忽略子目录错误
          }
        }
      }
    } catch {
      // 忽略父目录错误
    }
  }

  // 限制数量，避免扫描太多文件
  return siblings.slice(0, 20);
}

/** 从 AST 提取组件信息 */
function extractComponents(filePath: string, ast: ParseResult<any>, source: string): ComponentInfo[] {
  const components: ComponentInfo[] = [];

  traverse(ast, {
    // 函数组件: function Foo() {}
    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (!name || !isComponentName(name)) return;

      const info: ComponentInfo = {
        name,
        filePath,
        type: 'function',
        declaredProps: extractFunctionProps(path.node),
        usedProps: [],
        contextConsumers: [],
        contextProviders: [],
        functions: [],
        imports: [],
        exports: [],
        usedComponents: [],
        line: path.node.loc?.start?.line || 0,
        column: path.node.loc?.start?.column || 0,
      };

      // 提取函数体中的 props 使用和 context 使用
      extractBodyInfo(path.node.body, info);
      components.push(info);
    },

    // 类组件: class Foo extends Component {}
    ClassDeclaration(path) {
      const name = path.node.id?.name;
      if (!name || !isComponentName(name)) return;

      const info: ComponentInfo = {
        name,
        filePath,
        type: 'class',
        declaredProps: [],
        usedProps: [],
        contextConsumers: [],
        contextProviders: [],
        functions: [],
        imports: [],
        exports: [],
        usedComponents: [],
        line: path.node.loc?.start?.line || 0,
        column: path.node.loc?.start?.column || 0,
      };

      // 提取类中的 render 方法和 props 使用
      path.node.body.body.forEach((member: any) => {
        if (member.type === 'ClassMethod' && member.key?.name === 'render') {
          extractBodyInfo(member.body, info);
        }
      });

      components.push(info);
    },

    // 箭头函数组件: const Foo = () => {}
    VariableDeclarator(path) {
      const id = path.node.id;
      if (id.type !== 'Identifier') return;
      const name = id.name;
      if (!isComponentName(name)) return;

      const init = path.node.init;
      if (!init || init.type !== 'ArrowFunctionExpression') return;

      const info: ComponentInfo = {
        name,
        filePath,
        type: 'arrow-function',
        declaredProps: extractFunctionProps(init),
        usedProps: [],
        contextConsumers: [],
        contextProviders: [],
        functions: [],
        imports: [],
        exports: [],
        usedComponents: [],
        line: id.loc?.start?.line || 0,
        column: id.loc?.start?.column || 0,
      };

      if (init.body.type === 'BlockStatement') {
        extractBodyInfo(init.body, info);
      }

      components.push(info);
    },
  });

  return components;
}

/** 判断是否是组件名（PascalCase） */
function isComponentName(name: string): boolean {
  // 排除常见的非组件名
  const nonComponents = ['describe', 'it', 'test', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll', 'expect', 'jest'];
  if (nonComponents.includes(name)) return false;
  // PascalCase
  return /^[A-Z][a-zA-Z0-9]*$/.test(name) && /[a-z]/.test(name);
}

/** 提取函数参数中的 props */
function extractFunctionProps(node: any): Array<{ name: string; optional: boolean; type?: string }> {
  const props: Array<{ name: string; optional: boolean; type?: string }> = [];

  if (!node.params || node.params.length === 0) return props;

  const firstParam = node.params[0];

  // 解构: ({ foo, bar }) => {}
  if (firstParam.type === 'ObjectPattern') {
    for (const prop of firstParam.properties) {
      if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
        props.push({
          name: prop.key.name,
          optional: prop.optional || false,
        });
      }
      if (prop.type === 'RestElement' && prop.argument.type === 'Identifier') {
        props.push({
          name: `...${prop.argument.name}`,
          optional: true,
        });
      }
    }
  }

  // 单个 props 参数: (props) => {}
  if (firstParam.type === 'Identifier') {
    props.push({
      name: firstParam.name,
      optional: firstParam.optional || false,
    });
  }

  return props;
}

/** 提取函数体中的信息 */
function extractBodyInfo(body: any, info: ComponentInfo): void {
  if (!body) return;

  // 使用 traverse 遍历函数体
  traverse(body, {
    // props 使用
    MemberExpression(path) {
      const node = path.node;
      if (node.object.type === 'Identifier' && node.object.name === 'props') {
        if (node.property.type === 'Identifier') {
          info.usedProps.push(node.property.name);
        }
      }
    },

    // 解构中的 props 使用
    VariableDeclarator(path) {
      const init = path.node.init;
      if (init?.type === 'MemberExpression' &&
          init.object.type === 'Identifier' &&
          init.object.name === 'props') {
        const id = path.node.id;
        if (id.type === 'Identifier') {
          info.usedProps.push(id.name);
        }
      }
    },

    // useContext 调用
    CallExpression(path) {
      const callee = path.node.callee;
      if (callee.type === 'Identifier' && callee.name === 'useContext') {
        const firstArg = path.node.arguments[0];
        if (firstArg?.type === 'Identifier') {
          info.contextConsumers.push(firstArg.name);
        }
      }

      // Context.Provider
      if (callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'Provider') {
        const obj = callee.object;
        if (obj.type === 'Identifier') {
          info.contextProviders.push(obj.name);
        }
      }
    },

    // JSX 中使用的外部组件
    JSXOpeningElement(path) {
      const tagName = getJSXTagName(path.node.name);
      if (!tagName) return;

      // 检测 Context.Provider: <UserContext.Provider>
      if (tagName.endsWith('.Provider')) {
        const ctxName = tagName.split('.')[0];
        if (ctxName) {
          info.contextProviders.push(ctxName);
        }
        return;
      }

      if (!isComponentName(tagName)) return; // 只关心组件，不关心 HTML 标签

      const usedProps: string[] = [];
      for (const attr of path.node.attributes) {
        if (attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier') {
          usedProps.push(attr.name.name);
        }
      }

      info.usedComponents.push({
        name: tagName,
        props: usedProps,
        line: path.node.loc?.start?.line || 0,
        column: path.node.loc?.start?.column || 0,
      });
    },

    // 函数定义
    FunctionDeclaration(innerPath) {
      const name = innerPath.node.id?.name;
      if (name) {
        const bodyStart = innerPath.node.body?.loc?.start?.line || 0;
        const bodyEnd = innerPath.node.body?.loc?.end?.line || bodyStart;
        info.functions.push({
          name,
          body: '', // 简化，不存储完整函数体
          params: innerPath.node.params.map((p: any) => p.name || ''),
        });
      }
    },
  }, body);
}

/** 获取 JSX 标签名 */
function getJSXTagName(name: any): string | null {
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') {
    const parts: string[] = [];
    let current = name;
    while (current) {
      if (current.type === 'JSXIdentifier') {
        parts.unshift(current.name);
        break;
      } else if (current.type === 'JSXMemberExpression') {
        parts.unshift(current.property.name);
        current = current.object;
      } else break;
    }
    return parts.join('.');
  }
  return null;
}

// ============================================================================
// 分析规则
// ============================================================================

/** 分析未使用的 props */
function analyzeUnusedProps(graph: FileGraph, context: RuleContext): Issue[] {
  const issues: Issue[] = [];

  // 遍历所有组件
  for (const [, components] of graph.components) {
    for (const parent of components) {
      // 检查父组件中使用的子组件
      for (const childUsage of parent.usedComponents) {
        const child = graph.componentIndex.get(childUsage.name);
        if (!child) continue; // 外部库组件，跳过

        // 检查父传递的 props 中哪些是子组件未使用的
        const childUsedProps = new Set(child.usedProps);
        // 加上子组件 declaredProps 中的解构参数
        for (const dp of child.declaredProps) {
          childUsedProps.add(dp.name);
        }

        const unusedProps = childUsage.props.filter(p =>
          !childUsedProps.has(p) &&
          p !== 'key' && p !== 'ref' &&
          !p.startsWith('on') && // 事件处理器可能在子组件中通过 props 解构
          !p.startsWith('data-') &&
          !p.startsWith('aria-')
        );

        if (unusedProps.length > 0) {
          issues.push({
            ruleId: 'cross-unused-props',
            title: `父组件 "${parent.name}" 向 "${child.name}" 传递了未使用的 props`,
            description: `子组件 "${child.name}" 未使用以下 props: ${unusedProps.join(', ')}。建议移除父组件中的传递，或检查是否是拼写错误`,
            severity: 'warning',
            file: context.filePath,
            line: parent.line,
            column: parent.column,
            source: `<${child.name} ${unusedProps.map(p => `${p}=...`).join(' ')} />`,
          });
        }
      }
    }
  }

  return issues;
}

/** 分析缺失的 props */
function analyzeMissingProps(graph: FileGraph, context: RuleContext): Issue[] {
  const issues: Issue[] = [];

  for (const [, components] of graph.components) {
    for (const parent of components) {
      for (const childUsage of parent.usedComponents) {
        const child = graph.componentIndex.get(childUsage.name);
        if (!child) continue;

        // 检查子组件声明的必传 props 是否都被传递了
        const passedProps = new Set(childUsage.props);
        const missingProps = child.declaredProps.filter(dp =>
          !dp.optional &&
          !passedProps.has(dp.name) &&
          dp.name !== 'children' &&
          !dp.name.startsWith('...')
        );

        if (missingProps.length > 0) {
          issues.push({
            ruleId: 'cross-missing-props',
            title: `"${parent.name}" 未传递 "${child.name}" 的必传 props`,
            description: `子组件 "${child.name}" 需要以下必传 props: ${missingProps.map(p => p.name).join(', ')}`,
            severity: 'warning',
            file: context.filePath,
            line: parent.line,
            column: parent.column,
            source: `<${child.name} />`,
          });
        }
      }
    }
  }

  return issues;
}

/** 分析 Context 过度使用 */
function analyzeContextOveruse(graph: FileGraph, context: RuleContext): Issue[] {
  const issues: Issue[] = [];

  for (const [, components] of graph.components) {
    for (const comp of components) {
      // 检测：如果组件只消费了一个 context，且它的父组件（在同一文件中）提供了这个 context
      // 说明只有单层嵌套，用 props 更合适

      if (comp.contextConsumers.length === 0) continue;

      for (const ctxName of comp.contextConsumers) {
        // 检查是否在同文件中有 Provider
        const sameFileComponents = graph.components.get(comp.filePath) || [];
        const hasProviderInSameFile = sameFileComponents.some(
          c => c.contextProviders.includes(`${ctxName}.Provider`) || c.contextProviders.includes(ctxName)
        );

        if (hasProviderInSameFile) {
          issues.push({
            ruleId: 'cross-context-overuse',
            title: `"${comp.name}" 的 Context 使用可改为 props 传递`,
            description: `组件 "${comp.name}" 在同文件中消费了 "${ctxName}" Context。由于只有单层嵌套，建议直接用 props 传递数据，减少 Context 的复杂度`,
            severity: 'suggestion',
            file: context.filePath,
            line: comp.line,
            column: comp.column,
            source: `useContext(${ctxName})`,
          });
        }
      }
    }
  }

  return issues;
}

/** 分析重复代码 */
function analyzeDuplicateCode(graph: FileGraph, context: RuleContext): Issue[] {
  const issues: Issue[] = [];

  // 获取当前文件所在目录的兄弟组件
  const currentDir = dirname(context.filePath);
  const currentComps = graph.components.get(context.filePath) || [];
  const siblingComps: ComponentInfo[] = [];

  for (const [filePath, comps] of graph.components) {
    if (filePath === context.filePath) continue;
    const fileDir = dirname(filePath);
    // 兄弟文件（同目录）
    if (fileDir === currentDir) {
      siblingComps.push(...comps);
    }
  }

  // 检测函数签名相似的组件（跨文件 + 同文件内不同组件）
  for (let i = 0; i < currentComps.length; i++) {
    const current = currentComps[i];
    // 同文件内的其他组件
    for (let j = i + 1; j < currentComps.length; j++) {
      checkSimilarity(current, currentComps[j], issues, context);
    }
    // 兄弟文件中的组件
    for (const sibling of siblingComps) {
      checkSimilarity(current, sibling, issues, context);
    }
  }

  return issues;
}

/** 检查两个组件是否相似 */
function checkSimilarity(
  current: ComponentInfo,
  sibling: ComponentInfo,
  issues: Issue[],
  context: RuleContext
): void {
  if (current.name === sibling.name) return; // 跳过同名

  // 检测 props 结构是否相似（>50% 相同）
  const currentPropNames = new Set(current.declaredProps.map(p => p.name));
  const siblingPropNames = new Set(sibling.declaredProps.map(p => p.name));

  const intersection = [...currentPropNames].filter(p => siblingPropNames.has(p));
  const union = new Set([...currentPropNames, ...siblingPropNames]);

  if (union.size > 0 && intersection.length / union.size >= 0.5 && intersection.length >= 2) {
    issues.push({
      ruleId: 'cross-duplicate-code',
      title: `"${current.name}" 与 "${sibling.name}" 有相似的 props 结构`,
      description: `两个组件有 ${intersection.length} 个相同的 props: ${intersection.join(', ')}。如果逻辑也相似，建议提取公共的 Base 组件或 HOC`,
      severity: 'suggestion',
      file: context.filePath,
      line: current.line,
      column: current.column,
      source: `${current.name} / ${sibling.name}`,
    });
  }

  // 检测函数体中是否有相同的事件处理函数名
  const currentFns = new Set(current.functions.map(f => f.name));
  const siblingFns = new Set(sibling.functions.map(f => f.name));
  const sameFns = [...currentFns].filter(f =>
    siblingFns.has(f) &&
    f.startsWith('handle') // 事件处理函数
  );

  if (sameFns.length >= 2) {
    issues.push({
      ruleId: 'cross-duplicate-code',
      title: `"${current.name}" 与 "${sibling.name}" 有重复的事件处理逻辑`,
      description: `发现 ${sameFns.length} 个同名事件处理函数: ${sameFns.join(', ')}。建议提取到公共 hooks 中`,
      severity: 'suggestion',
      file: context.filePath,
      line: current.line,
      column: current.column,
      source: `${current.name} / ${sibling.name}`,
    });
  }
}

/** 分析公共逻辑提取建议 */
function analyzeExtractCommon(graph: FileGraph, context: RuleContext): Issue[] {
  const issues: Issue[] = [];

  // 检测当前文件的函数中是否有可以提取的公共逻辑
  const currentComps = graph.components.get(context.filePath) || [];

  for (const comp of currentComps) {
    // 检测组件中是否有独立的工具函数（不依赖组件状态）
    const utilityFns = comp.functions.filter(fn => {
      // 不是事件处理函数
      if (fn.name.startsWith('handle') || fn.name.startsWith('on')) return false;
      // 不是生命周期方法
      const lifecycle = ['componentDidMount', 'componentWillUnmount', 'componentDidUpdate', 'useEffect', 'useState', 'useCallback', 'useMemo'];
      if (lifecycle.includes(fn.name)) return false;
      // 参数列表简单（纯函数特征）
      return fn.params.length > 0 && fn.params.length <= 3;
    });

    if (utilityFns.length >= 2) {
      issues.push({
        ruleId: 'cross-extract-common',
        title: `"${comp.name}" 中有 ${utilityFns.length} 个可提取的工具函数`,
        description: `组件 "${comp.name}" 包含多个不依赖组件状态的工具函数（${utilityFns.map(f => f.name).join(', ')}）。建议提取到 utils/ 目录下的公共模块`,
        severity: 'suggestion',
        file: context.filePath,
        line: comp.line,
        column: comp.column,
        source: utilityFns.map(f => f.name).join(', '),
      });
    }
  }

  return issues;
}

/** 获取文件扩展名 */
function getFileExt(filePath: string): string {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0] : '.js';
}
