/**
 * 性能规则 Scanner
 * TODO: 实现具体规则
 * 参考 Vercel React Best Practices 的 57 条规则
 */

import type { Rule } from '../types.js';

export const performanceRules: Rule[] = [
  {
    id: 'perf-avoid-waterfall',
    name: '避免请求瀑布',
    description: '不要使用连续的 await，应并行发起请求',
    severity: 'warning',
    category: 'performance',
    defaultEnabled: true,
    frameworks: ['react', 'nextjs', 'vue', 'nuxt'],
    execute() {
      // TODO: AST 检测连续 await
      return [];
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
      // TODO: 检测组件体积
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
    execute() {
      // TODO: 检测 import { Button } from 'antd'
      return [];
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
