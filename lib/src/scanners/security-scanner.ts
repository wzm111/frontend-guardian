/**
 * 安全规则 Scanner
 * 参考 SonarQube 安全规则和 OWASP Top 10
 */

import type { Rule } from '../types.js';

export const securityRules: Rule[] = [
  {
    id: 'sec-xss-innerhtml',
    name: '危险的 innerHTML 使用',
    description: '避免直接使用 innerHTML，应使用 textContent 或安全库',
    severity: 'critical',
    category: 'security',
    defaultEnabled: true,
    execute() {
      // TODO: 检测 innerHTML = ... 赋值
      return [];
    },
  },
  {
    id: 'sec-eval-dangerous',
    name: '禁止 eval / new Function',
    description: 'eval, new Function, setTimeout 字符串 存在代码注入风险',
    severity: 'critical',
    category: 'security',
    defaultEnabled: true,
    execute() {
      // TODO: 检测 eval 和 new Function 调用
      return [];
    },
  },
  {
    id: 'sec-url-validation',
    name: 'URL 参数验证',
    description: '使用 window.open, location.href 时应对 URL 做白名单校验',
    severity: 'warning',
    category: 'security',
    defaultEnabled: true,
    execute() {
      // TODO: 检测未经验证的 URL 跳转
      return [];
    },
  },
  {
    id: 'sec-no-secrets',
    name: '代码中不得包含密钥',
    description: '禁止在源码中硬编码 API Key、Token、密码等敏感信息',
    severity: 'critical',
    category: 'security',
    defaultEnabled: true,
    execute() {
      // TODO: 检测密钥模式（AWS, Aliyun, 微信等）
      return [];
    },
  },
  {
    id: 'sec-cors-misconfig',
    name: 'CORS 配置检查',
    description: 'CORS 不应配置为 * 在生产环境',
    severity: 'warning',
    category: 'security',
    defaultEnabled: true,
    execute() {
      // TODO: 检测 CORS 配置
      return [];
    },
  },
];
