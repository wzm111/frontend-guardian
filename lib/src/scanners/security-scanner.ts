/**
 * 安全规则 Scanner
 * 参考 OWASP Top 10、SonarQube 安全规则和 CWE 漏洞分类
 */

import type { ParseResult } from '@babel/parser';
import traverse from '@babel/traverse';
import type { Rule, RuleContext, Issue } from '../types.js';
import { parseAST } from '../utils/ast-parser.js';

/** 密钥检测模式 */
const SECRET_PATTERNS = [
  { regex: /AK[A-Za-z0-9]{16,}/, name: '阿里云 AccessKey', example: 'AKLT...' },
  { regex: /sk-[a-zA-Z0-9]{48}/, name: 'OpenAI API Key', example: 'sk-...' },
  { regex: /wx[a-f0-9]{32}/, name: '微信密钥', example: 'wx...' },
  { regex: /password\s*=\s*['"][^'"]{4,}['"]/i, name: '硬编码密码', example: 'password = "xxx"' },
  { regex: /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{16,}['"]/i, name: 'API Key', example: 'api_key = "xxx"' },
  { regex: /secret[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{16,}['"]/i, name: 'Secret Key', example: 'secret_key = "xxx"' },
  { regex: /token\s*[:=]\s*['"][a-zA-Z0-9-_]{20,}['"]/i, name: 'Token', example: 'token = "xxx"' },
];

export const securityRules: Rule[] = [
  {
    id: 'sec-xss-innerhtml',
    name: '危险的 innerHTML 使用',
    description: '避免直接使用 innerHTML，应使用 textContent 或安全库',
    severity: 'critical',
    category: 'security',
    defaultEnabled: true,
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const ast = context.utils.parseAST(context.source, {
        ext: getFileExt(context.filePath),
      }) as ParseResult<any> | null;

      if (!ast) return issues;

      traverse(ast, {
        // 1. 赋值: element.innerHTML = ...
        AssignmentExpression(path) {
          const left = path.node.left;
          if (left.type !== 'MemberExpression') return;

          const obj = left.object;
          const prop = left.property;

          if (prop.type === 'Identifier' && prop.name === 'innerHTML') {
            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
            issues.push({
              ruleId: 'sec-xss-innerhtml',
              title: '危险的 innerHTML 赋值',
              description: 'innerHTML 赋值存在 XSS 风险，应使用 textContent 或 DOMPurify',
              severity: 'critical',
              file: context.filePath,
              line,
              column,
              source: 'innerHTML = ...',
              fix: {
                text: 'textContent',
                start: { line, column },
                end: { line, column: column + 'innerHTML'.length },
              },
            });
          }
        },

        // 2. 方法调用: element.innerHTML.replace(...)
        MemberExpression(path) {
          const prop = path.node.property;
          if (prop.type === 'Identifier' && prop.name === 'innerHTML') {
            const parent = path.parentPath?.node;
            // 如果不是赋值左侧，可能是读取（可以放宽）
            if (parent?.type === 'AssignmentExpression' && parent.left === path.node) {
              return; // 已在上面处理
            }
          }
        },

        // 3. Vue 的 v-html 指令
        JSXAttribute(path) {
          const attrName = path.node.name;
          if (attrName.type === 'JSXIdentifier' && attrName.name === 'dangerouslySetInnerHTML') {
            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
            issues.push({
              ruleId: 'sec-xss-innerhtml',
              title: '危险的 dangerouslySetInnerHTML 使用',
              description: 'React dangerouslySetInnerHTML 存在 XSS 风险，确保数据来源可信',
              severity: 'critical',
              file: context.filePath,
              line,
              column,
              source: 'dangerouslySetInnerHTML={...}',
            });
          }
        },
      });

      return issues;
    },
  },

  {
    id: 'sec-eval-dangerous',
    name: '禁止 eval / new Function',
    description: 'eval, new Function, setTimeout 字符串 存在代码注入风险',
    severity: 'critical',
    category: 'security',
    defaultEnabled: true,
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const ast = context.utils.parseAST(context.source, {
        ext: getFileExt(context.filePath),
      }) as ParseResult<any> | null;

      if (!ast) return issues;

      traverse(ast, {
        CallExpression(path) {
          const callee = path.node.callee;
          const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

          // 1. eval(...)
          if (callee.type === 'Identifier' && callee.name === 'eval') {
            issues.push({
              ruleId: 'sec-eval-dangerous',
              title: '禁止使用 eval()',
              description: 'eval() 存在代码注入风险，应使用 JSON.parse 或安全的序列化方案',
              severity: 'critical',
              file: context.filePath,
              line,
              column,
              source: 'eval(...)',
            });
          }

          // 2. new Function(...)
          if (callee.type === 'NewExpression' || (callee.type === 'Identifier' && callee.name === 'Function')) {
            // 检查是否是 new Function()
            const parent = path.parentPath?.node;
            if (parent?.type === 'NewExpression') {
              issues.push({
                ruleId: 'sec-eval-dangerous',
                title: '禁止使用 new Function()',
                description: 'new Function() 等同于 eval，存在代码注入风险',
                severity: 'critical',
                file: context.filePath,
                line,
                column,
                source: 'new Function(...)',
              });
            }
          }

          // 3. setTimeout(string, delay)
          if (callee.type === 'Identifier' && callee.name === 'setTimeout') {
            const firstArg = path.node.arguments[0];
            if (firstArg?.type === 'StringLiteral') {
              issues.push({
                ruleId: 'sec-eval-dangerous',
                title: '禁止 setTimeout 传入字符串',
                description: 'setTimeout("string", delay) 会被 eval 执行，存在注入风险',
                severity: 'critical',
                file: context.filePath,
                line,
                column,
                source: `setTimeout("${firstArg.value}", ...)`,
              });
            }
          }

          // 4. setInterval(string, delay)
          if (callee.type === 'Identifier' && callee.name === 'setInterval') {
            const firstArg = path.node.arguments[0];
            if (firstArg?.type === 'StringLiteral') {
              issues.push({
                ruleId: 'sec-eval-dangerous',
                title: '禁止 setInterval 传入字符串',
                description: 'setInterval("string", delay) 会被 eval 执行，存在注入风险',
                severity: 'critical',
                file: context.filePath,
                line,
                column,
                source: `setInterval("${firstArg.value}", ...)`,
              });
            }
          }
        },
      });

      return issues;
    },
  },

  {
    id: 'sec-url-validation',
    name: 'URL 参数验证',
    description: '使用 window.open, location.href 时应对 URL 做白名单校验',
    severity: 'warning',
    category: 'security',
    defaultEnabled: true,
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const ast = context.utils.parseAST(context.source, {
        ext: getFileExt(context.filePath),
      }) as ParseResult<any> | null;

      if (!ast) return issues;

      traverse(ast, {
        // window.open(variable, ...)
        CallExpression(path) {
          const callee = path.node.callee;
          if (callee.type === 'MemberExpression') {
            const obj = callee.object;
            const prop = callee.property;

            if (obj.type === 'Identifier' && obj.name === 'window' &&
                prop.type === 'Identifier' && prop.name === 'open') {
              const firstArg = path.node.arguments[0];
              if (firstArg?.type === 'Identifier') {
                const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
                issues.push({
                  ruleId: 'sec-url-validation',
                  title: 'window.open 应校验 URL',
                  description: `window.open("${firstArg.name}") 应校验目标 URL 是否在白名单中，防止跳转攻击`,
                  severity: 'warning',
                  file: context.filePath,
                  line,
                  column,
                  source: `window.open(${firstArg.name}, ...)`,
                });
              }
            }
          }
        },

        // location.href = variable
        AssignmentExpression(path) {
          const left = path.node.left;
          if (left.type === 'MemberExpression') {
            const obj = left.object;
            const prop = left.property;

            if (obj.type === 'Identifier' && (obj.name === 'location' || obj.name === 'window') &&
                prop.type === 'Identifier' && prop.name === 'href') {
              const right = path.node.right;
              if (right?.type === 'Identifier') {
                const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
                issues.push({
                  ruleId: 'sec-url-validation',
                  title: 'location.href 应校验 URL',
                  description: `location.href = ${right.name} 应校验目标 URL 是否在白名单中，防止跳转攻击`,
                  severity: 'warning',
                  file: context.filePath,
                  line,
                  column,
                  source: `location.href = ${right.name}`,
                });
              }
            }
          }
        },
      });

      return issues;
    },
  },

  {
    id: 'sec-no-secrets',
    name: '代码中不得包含密钥',
    description: '禁止在源码中硬编码 API Key、Token、密码等敏感信息',
    severity: 'critical',
    category: 'security',
    defaultEnabled: true,
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const lines = context.source.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        for (const pattern of SECRET_PATTERNS) {
          const match = pattern.regex.exec(line);
          if (match) {
            // 跳过注释行
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

            // 跳过测试数据中的假密钥
            if (line.includes('test') || line.includes('mock') || line.includes('example') || line.includes('placeholder')) continue;

            issues.push({
              ruleId: 'sec-no-secrets',
              title: `发现硬编码 ${pattern.name}`,
              description: `第 ${lineNum} 行疑似包含硬编码 ${pattern.name}，应使用环境变量存储`,
              severity: 'critical',
              file: context.filePath,
              line: lineNum,
              column: match.index + 1,
              source: match[0],
            });

            // 每行只报一次
            break;
          }
        }
      }

      return issues;
    },
  },

  {
    id: 'sec-cors-misconfig',
    name: 'CORS 配置检查',
    description: 'CORS 不应配置为 * 在生产环境',
    severity: 'warning',
    category: 'security',
    defaultEnabled: true,
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const lines = context.source.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 检测 Access-Control-Allow-Origin: *
        if (/Access-Control-Allow-Origin\s*[:=]\s*['"]\*['"]/.test(line) ||
            /allowOrigin\s*[:=]\s*['"]\*['"]/.test(line)) {
          const match = line.match(/\*/);
          if (match) {
            issues.push({
              ruleId: 'sec-cors-misconfig',
              title: 'CORS 配置为通配符 *',
              description: '生产环境不应允许所有来源（*），应指定具体域名',
              severity: 'warning',
              file: context.filePath,
              line: lineNum,
              column: (match.index || 0) + 1,
              source: line.trim(),
            });
          }
        }
      }

      return issues;
    },
  },
];

/** 获取文件扩展名 */
function getFileExt(filePath: string): string {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0] : '.js';
}