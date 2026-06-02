/**
 * 多端平台适配 Scanner
 * 迁移自 scan-platform.sh，检测多端项目的平台适配问题
 *
 * 规则列表：
 * 1. platform-mp-size — 小程序包体积检查
 * 2. platform-mp-base64 — base64 图片检查
 * 3. platform-mp-http — HTTP 协议检查
 * 4. platform-mobile-safearea — 安全区域适配
 * 5. platform-harmony — 鸿蒙 ArkTS 规范
 * 6. platform-responsive — 响应式断点配置
 */

import { existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import type { Rule, RuleContext, Issue } from '../types.js';

export const platformRules: Rule[] = [
  {
    id: 'platform-mp-size',
    name: '小程序包体积检查',
    description: '小程序主包体积不应超过 2MB',
    severity: 'critical',
    category: 'platform',
    defaultEnabled: true,
    platforms: ['wechat-mp', 'alipay-mp', 'douyin-mp'],
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];

      // 检查构建输出目录
      const buildDirs = [
        'dist/build/mp-weixin',
        'unpackage/dist/build/mp-weixin',
        'dist',
        'build/mp-weixin',
      ];

      for (const dir of buildDirs) {
        const fullPath = resolve(dirname(context.filePath), dir);
        if (!existsSync(fullPath)) continue;

        try {
          const stats = statSync(fullPath);
          if (!stats.isDirectory()) continue;

          // 粗略计算目录大小
          let totalSize = 0;
          const calcSize = (d: string) => {
            const entries = readdirSync(d, { withFileTypes: true });
            for (const entry of entries) {
              const entryPath = resolve(d, entry.name);
              if (entry.isDirectory()) {
                calcSize(entryPath);
              } else {
                totalSize += statSync(entryPath).size;
              }
            }
          };
          calcSize(fullPath);

          const sizeKB = Math.round(totalSize / 1024);
          if (sizeKB > 2048) {
            issues.push({
              ruleId: 'platform-mp-size',
              title: `小程序包体积过大: ${sizeKB}KB`,
              description: `小程序主包体积 ${sizeKB}KB 超过 2MB 限制，建议启用分包加载、压缩图片、移除未使用代码`,
              severity: 'critical',
              file: context.filePath,
              line: 1,
              column: 1,
              source: `${dir}: ${sizeKB}KB`,
            });
          } else if (sizeKB > 1800) {
            issues.push({
              ruleId: 'platform-mp-size',
              title: `小程序包体积接近上限: ${sizeKB}KB`,
              description: `小程序主包体积 ${sizeKB}KB 接近 2MB 限制，建议优化`,
              severity: 'warning',
              file: context.filePath,
              line: 1,
              column: 1,
              source: `${dir}: ${sizeKB}KB`,
            });
          }

          // 只检查第一个存在的目录
          break;
        } catch {
          // 跳过
        }
      }

      return issues;
    },
  },

  {
    id: 'platform-mp-base64',
    name: '小程序 base64 图片检查',
    description: '小程序中不应内联大图 base64',
    severity: 'warning',
    category: 'platform',
    defaultEnabled: true,
    platforms: ['wechat-mp', 'alipay-mp', 'douyin-mp'],
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const source = context.source;

      // 检测 base64 图片（较长的 base64 字符串暗示大图）
      const base64Regex = /data:image\/[^;]+;base64,[A-Za-z0-9+/]{1000,}/g;
      let match;
      while ((match = base64Regex.exec(source)) !== null) {
        const line = source.slice(0, match.index).split('\n').length;
        issues.push({
          ruleId: 'platform-mp-base64',
          title: '包含大图 base64 编码',
          description: '检测到较大的 base64 图片内联，会增加包体积。建议改为网络图片或放到 static 目录',
          severity: 'warning',
          file: context.filePath,
          line,
          column: 1,
          source: match[0].slice(0, 50) + '...',
        });
      }

      return issues;
    },
  },

  {
    id: 'platform-mp-http',
    name: '应使用 HTTPS',
    description: '小程序中不应使用 HTTP 协议',
    severity: 'critical',
    category: 'platform',
    defaultEnabled: true,
    platforms: ['wechat-mp', 'alipay-mp', 'douyin-mp', 'app'],
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const lines = context.source.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 检测 http://（排除 localhost 和注释）
        const match = line.match(/http:\/\/[^\s"'`]+/);
        if (match) {
          const url = match[0];
          if (url.includes('localhost') || url.includes('127.0.0.1')) continue;
          if (line.trim().startsWith('//')) continue;

          issues.push({
            ruleId: 'platform-mp-http',
            title: '使用 HTTP 协议',
            description: `检测到 HTTP 请求地址 ${url}，小程序和移动端要求使用 HTTPS`,
            severity: 'critical',
            file: context.filePath,
            line: i + 1,
            column: (match.index || 0) + 1,
            source: line.trim(),
          });
        }
      }

      return issues;
    },
  },

  {
    id: 'platform-mobile-safearea',
    name: '移动端安全区域适配',
    description: '固定定位元素应适配安全区域',
    severity: 'warning',
    category: 'platform',
    defaultEnabled: true,
    platforms: ['h5', 'app', 'react-native', 'flutter'],
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const ext = extname(context.filePath).toLowerCase();

      // CSS 文件检测
      if (['.css', '.scss', '.less'].includes(ext)) {
        const source = context.source;
        // 检测固定定位但未适配安全区域
        if (/position\s*:\s*fixed|fixed\s*:\s*bottom/i.test(source)) {
          if (!/safe-area-inset|env\(/i.test(source)) {
            issues.push({
              ruleId: 'platform-mobile-safearea',
              title: '固定定位元素缺少安全区域适配',
              description: '检测到 position: fixed 布局，建议添加 safe-area-inset-bottom 适配刘海屏/全面屏',
              severity: 'warning',
              file: context.filePath,
              line: 1,
              column: 1,
              source: 'position: fixed',
            });
          }
        }

        // 检测点击区域过小
        const sizeRegex = /width\s*:\s*(\d+)px.*height\s*:\s*(\d+)px/gi;
        let match;
        while ((match = sizeRegex.exec(source)) !== null) {
          const w = parseInt(match[1], 10);
          const h = parseInt(match[2], 10);
          if (w < 44 || h < 44) {
            const line = source.slice(0, match.index).split('\n').length;
            issues.push({
              ruleId: 'platform-mobile-safearea',
              title: '点击区域可能小于 44x44px',
              description: `检测到元素尺寸 ${w}x${h}px，移动端点击区域建议不小于 44x44px（WCAG 推荐）`,
              severity: 'suggestion',
              file: context.filePath,
              line,
              column: (match.index || 0) + 1,
              source: match[0],
            });
          }
        }
      }

      return issues;
    },
  },

  {
    id: 'platform-harmony',
    name: '鸿蒙 ArkTS 规范',
    description: '鸿蒙项目应遵循 ArkTS 编码规范',
    severity: 'warning',
    category: 'platform',
    defaultEnabled: true,
    platforms: ['harmony'],
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const ext = extname(context.filePath).toLowerCase();
      if (ext !== '.ets') return issues;

      const source = context.source;
      const lines = source.split('\n');

      // 检测 struct 缺少装饰器
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\bstruct\s+\w+/.test(line)) {
          // 检查前面几行是否有 @Component 或 @Entry
          const prevLines = lines.slice(Math.max(0, i - 5), i).join('\n');
          if (!/@Component|@Entry|@Preview|@Builder/i.test(prevLines)) {
            issues.push({
              ruleId: 'platform-harmony',
              title: 'ArkTS struct 缺少装饰器',
              description: 'ArkTS struct 应使用 @Component、@Entry 或 @Preview 装饰器声明',
              severity: 'warning',
              file: context.filePath,
              line: i + 1,
              column: 1,
              source: line.trim(),
            });
          }
        }
      }

      // 检测 let 声明的状态未使用装饰器
      const letRegex = /\blet\s+(\w+)\s*:\s*\w+/g;
      let match;
      while ((match = letRegex.exec(source)) !== null) {
        const nearby = source.slice(Math.max(0, match.index - 100), match.index);
        if (!/@State|@Prop|@Link|@Provide|@Consume|@ObjectLink|@StorageLink/i.test(nearby)) {
          const line = source.slice(0, match.index).split('\n').length;
          issues.push({
            ruleId: 'platform-harmony',
            title: `状态变量 '${match[1]}' 未使用装饰器管理`,
            description: 'ArkTS 中可变状态应使用 @State/@Prop/@Link 等装饰器管理，确保 UI 正确更新',
            severity: 'warning',
            file: context.filePath,
            line,
            column: (match.index || 0) + 1,
            source: match[0],
          });
        }
      }

      return issues;
    },
  },

  {
    id: 'platform-responsive',
    name: '响应式断点配置',
    description: 'PC/H5 项目应配置响应式断点',
    severity: 'suggestion',
    category: 'platform',
    defaultEnabled: true,
    platforms: ['pc', 'h5'],
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const ext = extname(context.filePath).toLowerCase();

      // CSS 文件检测媒体查询
      if (['.css', '.scss', '.less'].includes(ext)) {
        if (/@media\s*\(/.test(context.source)) {
          // 有媒体查询，通过
          return [];
        }
      }

      // JS/TS 文件检测响应式 hook
      if (['.js', '.ts', '.jsx', '.tsx', '.vue'].includes(ext)) {
        if (/innerWidth|matchMedia|useBreakpoint|breakpoints/i.test(context.source)) {
          return [];
        }
      }

      // 如果不是样式文件或 JS 文件，不检查
      if (!['.css', '.scss', '.less', '.js', '.ts', '.jsx', '.tsx', '.vue'].includes(ext)) {
        return [];
      }

      // 只在入口文件或全局样式文件中提示
      const fileName = context.filePath.toLowerCase();
      if (fileName.includes('global') || fileName.includes('index') || fileName.includes('app') || fileName.includes('main')) {
        issues.push({
          ruleId: 'platform-responsive',
          title: '未检测到响应式断点配置',
          description: 'PC/H5 项目建议配置响应式断点（@media query 或 JS hook），以适配不同屏幕尺寸',
          severity: 'suggestion',
          file: context.filePath,
          line: 1,
          column: 1,
          source: '无响应式配置',
        });
      }

      return issues;
    },
  },
];
