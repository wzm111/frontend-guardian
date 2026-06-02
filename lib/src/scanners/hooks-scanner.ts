/**
 * Hooks / Composables Scanner
 * 迁移自 scan-hooks.sh，基于 AST 的 React Hooks / Vue Composables 检测
 *
 * 规则列表：
 * 1. hooks-effect-deps — useEffect 依赖数组问题
 * 2. hooks-closure — setInterval/setTimeout 未清理
 * 3. hooks-custom-naming — 使用 hooks 但函数名不以 use 开头
 * 4. composables-reactive — Vue reactive 解构陷阱
 * 5. composables-computed — computed 副作用
 * 6. hooks-state-lifting — 状态过多建议提升
 */

import type { ParseResult } from "@babel/parser";
import traverse from "@babel/traverse";
import type { Rule, RuleContext, Issue } from "../types.js";

/** 常见的响应式变量名 */
const REACTIVE_NAMES = new Set([
  "state",
  "count",
  "value",
  "item",
  "index",
  "id",
  "name",
  "isOpen",
  "isVisible",
  "isLoading",
  "error",
  "result",
  "response",
  "data",
  "list",
  "form",
  "query",
  "params",
  "user",
  "current",
]);

export const hooksRules: Rule[] = [
  {
    id: "hooks-effect-deps",
    name: "useEffect 依赖数组问题",
    description: "检测 useEffect 依赖过多、缺少依赖或空依赖陷阱",
    severity: "warning",
    category: "hooks",
    defaultEnabled: true,
    frameworks: ["react", "nextjs"],
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const ast = context.utils.parseAST(context.source, {
        ext: getFileExt(context.filePath),
      }) as ParseResult<any> | null;

      if (!ast) return issues;

      traverse(ast, {
        CallExpression(path) {
          const callee = path.node.callee;
          if (callee.type !== "Identifier" || callee.name !== "useEffect") return;

          const args = path.node.arguments;
          const effectFn = args[0];
          const depsArray = args[1];
          const { line, column } = path.node.loc?.start || { line: 0, column: 0 };

          // 1. 缺少依赖数组
          if (!depsArray) {
            issues.push({
              ruleId: "hooks-effect-deps",
              title: "useEffect 缺少依赖数组",
              description: "useEffect 必须提供依赖数组 [] 或 [dep1, dep2]，否则每次渲染都会执行",
              severity: "warning",
              file: context.filePath,
              line,
              column,
              source: "useEffect(() => { ... })",
            });
            return;
          }

          // 2. 空依赖数组但引用了状态
          let hasEmptyDepsIssue = false;
          if (depsArray.type === "ArrayExpression" && depsArray.elements.length === 0) {
            // 检查 effect 函数体是否引用了状态
            if (
              effectFn?.type === "ArrowFunctionExpression" ||
              effectFn?.type === "FunctionExpression"
            ) {
              const body = effectFn.body;
              if (body.type === "BlockStatement") {
                const bodyText = context.source.slice(body.start || 0, body.end || 0);
                if (/\bstate\b|\bprops\b|\buseState\b/.test(bodyText)) {
                  issues.push({
                    ruleId: "hooks-effect-deps",
                    title: "useEffect 空依赖数组但引用了状态",
                    description:
                      "useEffect 使用 [] 但函数体内引用了 state/props，会导致闭包陷阱（获取到过期值）",
                    severity: "critical",
                    file: context.filePath,
                    line,
                    column,
                    source: "useEffect(() => { ... }, [])",
                  });
                  hasEmptyDepsIssue = true;
                }
              }
            }
            // 只在检测到空依赖陷阱时才跳过后续检查
            if (hasEmptyDepsIssue) return;
          }

          // 3. 依赖过多（>5）
          if (depsArray.type === "ArrayExpression" && depsArray.elements.length > 5) {
            issues.push({
              ruleId: "hooks-effect-deps",
              title: `useEffect 依赖过多 (${depsArray.elements.length})`,
              description:
                "useEffect 依赖过多（>5）说明逻辑过于复杂，建议拆分为多个 useEffect 或提取自定义 Hook",
              severity: "warning",
              file: context.filePath,
              line,
              column,
              source: `useEffect(() => { ... }, [${depsArray.elements.length} deps])`,
            });
          }

          // 4. 检查常见变量是否在依赖中
          if (
            effectFn?.type === "ArrowFunctionExpression" ||
            effectFn?.type === "FunctionExpression"
          ) {
            const body = effectFn.body;
            if (body.type === "BlockStatement") {
              const bodyText = context.source.slice(body.start || 0, body.end || 0);
              for (const name of REACTIVE_NAMES) {
                // 简单检测：变量在函数体中使用但不在依赖数组中
                const regex = new RegExp(`\\b${name}\\b`);
                if (regex.test(bodyText) && depsArray.type === "ArrayExpression") {
                  const inDeps = depsArray.elements.some(
                    (el: any) => el?.type === "Identifier" && el.name === name,
                  );
                  if (!inDeps) {
                    issues.push({
                      ruleId: "hooks-effect-deps",
                      title: `useEffect 可能缺少依赖: '${name}'`,
                      description: `变量 '${name}' 在 useEffect 中使用但不在依赖数组中，可能导致闭包陷阱`,
                      severity: "warning",
                      file: context.filePath,
                      line,
                      column,
                      source: `useEffect(() => { ...${name}... }, [...])`,
                    });
                    break; // 每 effect 只报一次
                  }
                }
              }
            }
          }
        },
      });

      return issues;
    },
  },

  {
    id: "hooks-closure",
    name: "定时器未清理",
    description: "setInterval / setTimeout 在 useEffect 中应清理",
    severity: "critical",
    category: "hooks",
    defaultEnabled: true,
    frameworks: ["react", "nextjs", "vue"],
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const ast = context.utils.parseAST(context.source, {
        ext: getFileExt(context.filePath),
      }) as ParseResult<any> | null;

      if (!ast) return issues;

      traverse(ast, {
        CallExpression(path) {
          const callee = path.node.callee;
          if (callee.type !== "Identifier") return;
          if (!["setInterval", "setTimeout"].includes(callee.name)) return;

          // 检查是否在 useEffect 中
          let parent = path.parentPath;
          let inUseEffect = false;
          while (parent) {
            if (parent.isCallExpression()) {
              const parentCallee = parent.node.callee;
              if (parentCallee.type === "Identifier" && parentCallee.name === "useEffect") {
                inUseEffect = true;
                break;
              }
            }
            parent = parent.parentPath as any;
          }

          if (!inUseEffect) return;

          // 检查是否有 cleanup（return () => clearInterval(...))
          const useEffectPath = path.findParent(
            (p: any) =>
              p.isCallExpression() &&
              p.node.callee?.type === "Identifier" &&
              p.node.callee.name === "useEffect",
          );

          let hasCleanup = false;
          if (useEffectPath) {
            const callNode = useEffectPath.node as any;
            const effectFn = callNode.arguments?.[0];
            if (
              effectFn &&
              (effectFn.type === "ArrowFunctionExpression" ||
                effectFn.type === "FunctionExpression")
            ) {
              const body = effectFn.body;
              if (body.type === "BlockStatement") {
                for (const stmt of body.body) {
                  if (stmt.type === "ReturnStatement") {
                    const returnExpr = stmt.argument;
                    if (returnExpr) {
                      const returnText = context.source.slice(
                        returnExpr.start || 0,
                        returnExpr.end || 0,
                      );
                      if (/clearInterval|clearTimeout/.test(returnText)) {
                        hasCleanup = true;
                        break;
                      }
                    }
                  }
                }
              }
            }
          }

          if (!hasCleanup) {
            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
            issues.push({
              ruleId: "hooks-closure",
              title: `${callee.name} 缺少 cleanup`,
              description: `useEffect 中的 ${callee.name} 必须返回 cleanup 函数（clearInterval/clearTimeout），否则会导致内存泄漏`,
              severity: "critical",
              file: context.filePath,
              line,
              column,
              source: `${callee.name}(...)`,
            });
          }
        },
      });

      return issues;
    },
  },

  {
    id: "hooks-custom-naming",
    name: "自定义 Hook 命名规范",
    description: "使用 hooks 的函数应以 use 开头",
    severity: "warning",
    category: "hooks",
    defaultEnabled: true,
    frameworks: ["react", "nextjs"],
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const ast = context.utils.parseAST(context.source, {
        ext: getFileExt(context.filePath),
      }) as ParseResult<any> | null;

      if (!ast) return issues;

      traverse(ast, {
        FunctionDeclaration(path) {
          const name = path.node.id?.name;
          if (!name || name.startsWith("use")) return;

          // 检查函数体是否使用了 hooks
          let usesHooks = false;
          (path as any).traverse({
            CallExpression(innerPath: any) {
              const callee = innerPath.node.callee;
              if (callee.type === "Identifier" && /^use[A-Z]/.test(callee.name)) {
                usesHooks = true;
                innerPath.stop();
              }
            },
          });

          if (usesHooks) {
            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
            issues.push({
              ruleId: "hooks-custom-naming",
              title: `函数 '${name}' 应使用 use 前缀`,
              description: `函数内部使用了 React Hooks，按照约定应以 'use' 开头命名（如 use${name.charAt(0).toUpperCase() + name.slice(1)}）`,
              severity: "warning",
              file: context.filePath,
              line,
              column,
              source: `function ${name}(...)`,
            });
          }
        },
      });

      return issues;
    },
  },

  {
    id: "composables-reactive",
    name: "Vue reactive 解构陷阱",
    description: "reactive 对象被解构会丢失响应式",
    severity: "critical",
    category: "hooks",
    defaultEnabled: true,
    frameworks: ["vue", "nuxt"],
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const ast = context.utils.parseAST(context.source, {
        ext: getFileExt(context.filePath),
      }) as ParseResult<any> | null;

      if (!ast) return issues;

      traverse(ast, {
        VariableDeclarator(path) {
          const init = path.node.init;
          if (!init || init.type !== "CallExpression") return;
          const callee = init.callee;
          if (callee.type !== "Identifier" || callee.name !== "reactive") return;

          // 检查是否是解构赋值
          const id = path.node.id;
          if (id.type === "ObjectPattern") {
            const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
            issues.push({
              ruleId: "composables-reactive",
              title: "reactive 对象被解构",
              description:
                "reactive 对象被解构后会丢失响应式，建议使用 toRefs() 或直接使用 state.xxx",
              severity: "critical",
              file: context.filePath,
              line,
              column,
              source: "const { ... } = reactive(...)",
              fix: {
                text: "const { ... } = toRefs(reactive(...))",
                start: { line, column },
                end: { line, column: column + 5 },
              },
            });
          }
        },
      });

      return issues;
    },
  },

  {
    id: "composables-computed",
    name: "computed 副作用",
    description: "computed 中不应修改其他响应式数据",
    severity: "warning",
    category: "hooks",
    defaultEnabled: true,
    frameworks: ["vue", "nuxt"],
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const ast = context.utils.parseAST(context.source, {
        ext: getFileExt(context.filePath),
      }) as ParseResult<any> | null;

      if (!ast) return issues;

      traverse(ast, {
        CallExpression(path) {
          const callee = path.node.callee;
          if (callee.type !== "Identifier" || callee.name !== "computed") return;

          const callback = path.node.arguments[0];
          if (
            !callback ||
            (callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression")
          )
            return;

          const body = callback.body;
          if (body.type !== "BlockStatement") return;

          const bodyText = context.source.slice(body.start || 0, body.end || 0);

          // 检测是否修改了 ref/reactive 值
          if (/\bref\s*\(|\breactive\s*\(/.test(bodyText)) {
            if (/=\s*[^=]|\+\+|--|\+=|-=|\*=|置/.test(bodyText)) {
              const { line, column } = path.node.loc?.start || { line: 0, column: 0 };
              issues.push({
                ruleId: "composables-computed",
                title: "computed 中存在副作用",
                description:
                  "computed 应为纯函数，不应修改其他响应式数据。副作用应放在 watch 或方法中",
                severity: "warning",
                file: context.filePath,
                line,
                column,
                source: "computed(() => { ... })",
              });
            }
          }
        },
      });

      return issues;
    },
  },

  {
    id: "hooks-state-lifting",
    name: "状态提升建议",
    description: "组件中状态过多建议合并或提升到父组件",
    severity: "suggestion",
    category: "hooks",
    defaultEnabled: true,
    frameworks: ["react", "nextjs", "vue", "nuxt"],
    execute(context: RuleContext): Issue[] {
      const issues: Issue[] = [];
      const source = context.source;

      // React: 统计 useState 调用次数
      const useStateMatches = source.match(/\buseState\s*\(/g);
      if (useStateMatches && useStateMatches.length > 5) {
        issues.push({
          ruleId: "hooks-state-lifting",
          title: `组件使用了 ${useStateMatches.length} 个 useState`,
          description:
            "组件使用了过多 useState，建议将相关状态合并为对象或使用 useReducer，或考虑状态提升到父组件",
          severity: "suggestion",
          file: context.filePath,
          line: 1,
          column: 1,
          source: `${useStateMatches.length} x useState(...)`,
        });
      }

      // Vue: 统计 ref 调用次数
      const refMatches = source.match(/\bref\s*\(/g);
      if (refMatches && refMatches.length > 8) {
        issues.push({
          ruleId: "hooks-state-lifting",
          title: `组件使用了 ${refMatches.length} 个 ref`,
          description: "组件使用了过多 ref，建议使用 reactive 合并相关状态，或考虑状态提升到父组件",
          severity: "suggestion",
          file: context.filePath,
          line: 1,
          column: 1,
          source: `${refMatches.length} x ref(...)`,
        });
      }

      return issues;
    },
  },
];

/** 获取文件扩展名 */
function getFileExt(filePath: string): string {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0] : ".js";
}
