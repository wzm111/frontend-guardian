/**
 * 可访问性规则 Scanner
 * 参考 WCAG 2.1 标准和 Vercel Web Design Guidelines
 */

import type { Rule } from '../types.js';

export const a11yRules: Rule[] = [
  {
    id: 'a11y-img-alt',
    name: '图片必须有 alt 属性',
    description: '<img> 标签必须包含 alt 属性，即使为空字符串',
    severity: 'critical',
    category: 'accessibility',
    defaultEnabled: true,
    execute() {
      // TODO: AST 检测 JSX img 缺少 alt
      return [];
    },
  },
  {
    id: 'a11y-form-label',
    name: '表单元素必须有 label',
    description: 'input, select, textarea 必须关联 label 或通过 aria-label 说明',
    severity: 'warning',
    category: 'accessibility',
    defaultEnabled: true,
    execute() {
      // TODO: 检测表单元素
      return [];
    },
  },
  {
    id: 'a11y-button-role',
    name: '可点击元素语义化',
    description: '使用 <button> 而非 div/span 实现可点击元素',
    severity: 'warning',
    category: 'accessibility',
    defaultEnabled: true,
    execute() {
      // TODO: 检测 onClick 绑定在 div/span 上
      return [];
    },
  },
  {
    id: 'a11y-contrast',
    name: '颜色对比度',
    description: '文本与背景色的对比度应满足 WCAG AA 标准 (4.5:1)',
    severity: 'suggestion',
    category: 'accessibility',
    defaultEnabled: true,
    execute() {
      // TODO: 检测 CSS color/background-color 对比度
      return [];
    },
  },
  {
    id: 'a11y-aria-valid',
    name: 'ARIA 属性合法性',
    description: '使用正确的 ARIA 角色和属性',
    severity: 'warning',
    category: 'accessibility',
    defaultEnabled: true,
    execute() {
      // TODO: 检测无效 aria-* 属性
      return [];
    },
  },
];
