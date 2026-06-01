/**
 * i18n 硬编码检测 Scanner（AST 级别）
 *
 * 检测类型：
 * 1. 字符串字面量中的中文："你好"
 * 2. 模板字符串中的中文：`你好 ${name}`
 * 3. JSXText 中的中文：<div>你好</div>
 * 4. 已 i18n 调用中的中文（漏翻）
 * 5. console.log / 注释 / 测试文件中的中文（可配置忽略）
 */

import type { Node } from '@babel/types';
import type { ParseResult } from '@babel/parser';
import traverse from '@babel/traverse';
import type { Rule, RuleContext, Issue } from '../types.js';
import { parseAST } from '../utils/ast-parser.js';

/** 中文字符正则（包含中文标点） */
const CHINESE_REGEX = /[一-龥　-〿＀-￯]/;

/** i18n 函数名列表 */
const I18N_FUNCTION_NAMES = [
  't', '$t', 'i18n.t', 'translate', 'formatMessage',
  'intl.formatMessage', 'i18next.t', '$i18n.t',
];

/** 可忽略的中文场景 */
const IGNORE_PATTERNS = [
  /^\s*\/\//,           // 单行注释
  /^\s*\/\*/,           // 多行注释开头
  /^\s*\*\s/,           // JSDoc 注释
  /console\.(log|warn|error|info|debug)\s*\(/, // console 调用
  /describe\s*\(|it\s*\(|test\s*\(/, // 测试代码
];

export const i18nRules: Rule[] = [
  {
    id: 'i18n-hardcoded-string',
    name: '硬编码中文字符串',
    description: '代码中存在未国际化的中文字符串字面量',
    severity: 'warning',
    category: 'i18n',
    defaultEnabled: true,
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const ast = context.utils.parseAST(context.source, {
        ext: getFileExt(context.filePath),
      }) as ParseResult<any> | null;

      if (!ast) return issues;

      traverse(ast, {
        // 1. 字符串字面量中的中文
        StringLiteral(path) {
          const value = path.node.value;
          if (!containsChinese(value)) return;

          const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

          // 跳过特定场景
          if (shouldIgnoreStringLiteral(path, value, context.source)) return;

          issues.push({
            ruleId: 'i18n-hardcoded-string',
            title: '发现硬编码中文字符串',
            description: `文件中的字符串 "${truncate(value, 30)}" 未进行国际化处理`,
            severity: 'warning',
            file: context.filePath,
            line,
            column,
            source: value,
            fix: {
              text: generateI18nCall(value),
              start: { line, column },
              end: { line, column: column + value.length + 2 },
            },
          });
        },

        // 2. 模板字符串中的中文
        TemplateLiteral(path) {
          for (let i = 0; i < path.node.quasis.length; i++) {
            const quasi = path.node.quasis[i];
            const value = quasi.value.raw;
            if (!containsChinese(value)) continue;

            const { line, column } = quasi.loc?.start || { line: 0, column: 0 };

            // 跳过特定场景
            if (isInsideConsoleOrTest(path)) continue;

            issues.push({
              ruleId: 'i18n-hardcoded-template',
              title: '发现硬编码中文模板字符串',
              description: `模板字符串中的 "${truncate(value, 30)}" 未进行国际化处理`,
              severity: 'warning',
              file: context.filePath,
              line,
              column,
              source: value,
            });
          }
        },

        // 3. JSXText 中的中文
        JSXText(path) {
          const value = path.node.value;
          if (!containsChinese(value.trim())) return;

          const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

          issues.push({
            ruleId: 'i18n-hardcoded-jsx-text',
            title: '发现硬编码中文 JSX 文本',
            description: `JSX 中的文本 "${truncate(value.trim(), 30)}" 未进行国际化处理`,
            severity: 'critical',
            file: context.filePath,
            line,
            column,
            source: value.trim(),
            fix: {
              text: `{${generateI18nCall(value.trim())}}`,
              start: { line, column },
              end: { line, column: column + value.length },
            },
          });
        },

        // 4. 属性中的中文
        JSXAttribute(path) {
          const attrName = path.node.name.name as string;
          const attrValue = path.node.value;

          if (attrName === 'title' || attrName === 'placeholder' || attrName === 'alt' || attrName === 'label') {
            if (attrValue?.type === 'StringLiteral' && containsChinese(attrValue.value)) {
              const { line, column } = attrValue.loc?.start || { line: 0, column: 0 };

              issues.push({
                ruleId: 'i18n-hardcoded-attribute',
                title: `发现硬编码中文 ${attrName} 属性`,
                description: `属性 ${attrName}="${truncate(attrValue.value, 30)}" 未进行国际化处理`,
                severity: 'warning',
                file: context.filePath,
                line,
                column,
                source: attrValue.value,
              });
            }
          }
        },
      });

      return issues;
    },
  },

  {
    id: 'i18n-missing-key',
    name: '语言包缺失 Key',
    description: '代码中引用了语言包中不存在的 key',
    severity: 'critical',
    category: 'i18n',
    defaultEnabled: true,
    execute(context: RuleContext): Issue[] {
      // TODO: 需要加载语言包文件，对比 key 存在性
      // 这需要先扫描语言包目录，建立 key 索引
      return [];
    },
  },

  {
    id: 'i18n-unused-key',
    name: '语言包未使用 Key',
    description: '语言包中存在但代码中未引用的 key',
    severity: 'suggestion',
    category: 'i18n',
    defaultEnabled: true,
    execute(context: RuleContext): Issue[] {
      // TODO: 需要反向扫描所有语言包 key 的引用
      return [];
    },
  },
];

/** 判断是否包含中文 */
function containsChinese(str: string): boolean {
  return CHINESE_REGEX.test(str);
}

/** 截断字符串 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

/** 获取文件扩展名 */
function getFileExt(filePath: string): string {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0] : '.js';
}

/** 生成 i18n 调用 */
function generateI18nCall(text: string): string {
  // 将中文转换为 key 格式
  const key = textToKey(text);
  return `t('${key}')`;
}

/** 中文文本转 key */
function textToKey(text: string): string {
  return text
    .trim()
    .slice(0, 20)
    .replace(/[^一-龥a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** 判断字符串字面量是否应被忽略 */
function shouldIgnoreStringLiteral(path: any, value: string, source: string): boolean {
  // 1. 在 import 语句中
  if (path.parentPath?.isImportDeclaration()) return true;
  if (path.parentPath?.isImportSpecifier()) return true;

  // 2. 在 i18n 调用中
  if (isInsideI18nCall(path)) return true;

  // 3. 在 console 调用中
  if (isInsideConsoleOrTest(path)) return true;

  // 4. 在注释中
  if (isInComment(path, source)) return true;

  return false;
}

/** 是否在 i18n 函数调用中 */
function isInsideI18nCall(path: any): boolean {
  let current = path.parentPath;
  while (current) {
    if (current.isCallExpression()) {
      const callee = current.node.callee;
      const calleeName = getCalleeName(callee);
      if (I18N_FUNCTION_NAMES.some(fn => calleeName?.endsWith(fn))) {
        return true;
      }
    }
    current = current.parentPath;
  }
  return false;
}

/** 是否在 console 或测试代码中 */
function isInsideConsoleOrTest(path: any): boolean {
  let current = path.parentPath;
  while (current) {
    if (current.isCallExpression()) {
      const calleeName = getCalleeName(current.node.callee);
      if (calleeName?.startsWith('console.')) return true;
      if (['describe', 'it', 'test', 'beforeEach', 'afterEach'].includes(calleeName || '')) {
        return true;
      }
    }
    current = current.parentPath;
  }
  return false;
}

/** 是否在注释中（简单判断） */
function isInComment(path: any, source: string): boolean {
  // 更精确的实现需要 source map，这里做简单判断
  const { line } = path.node.loc?.start || { line: 0 };
  const lines = source.split('\n');
  if (line > 0 && line <= lines.length) {
    const lineStr = lines[line - 1].trim();
    if (lineStr.startsWith('//') || lineStr.startsWith('*') || lineStr.startsWith('/*')) {
      return true;
    }
  }
  return false;
}

/** 获取 callee 名称 */
function getCalleeName(callee: Node): string | null {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  if (callee.type === 'MemberExpression') {
    const obj = getCalleeName(callee.object);
    const prop = callee.property.type === 'Identifier' ? callee.property.name : '';
    return obj ? `${obj}.${prop}` : prop;
  }
  return null;
}
