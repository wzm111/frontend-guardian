#!/usr/bin/env bash
#
# frontend-guardian — 统一扫描入口（v2.0 简化版）
# Usage: full-scan.sh [options] [project_path]
#
# 核心变更：
#   - AST 引擎成为主要引擎（--module all 一次扫描全部 9 个模块）
#   - Bash scanner 作为补充引擎保留
#   - 统一 JSON + Markdown 输出
#
# Options:
#   --gate          门禁模式（发现 Critical 问题时 exit 1）
#   --staged        仅检查 git staged 文件
#   --since <ref>   检查指定 commit 以来的变更
#   --output <file> 报告输出路径
#   --severity <l>  最低输出级别: critical | warning | suggestion
#   --fix           自动修复可修复的问题
#   --init-ai       扫描后初始化/更新 AI 上下文文件
#   --json          以 JSON 格式输出原始扫描结果
#
# Examples:
#   full-scan.sh                              # 全量扫描当前目录
#   full-scan.sh --gate                       # 门禁模式
#   full-scan.sh --staged                     # 仅 staged 文件
#   full-scan.sh --since HEAD~3               # 最近 3 个 commit
#   full-scan.sh --output report.md           # 输出到 report.md
#   full-scan.sh ./my-project --gate --fix    # 扫描指定目录，门禁+自动修复

set -euo pipefail

# ---------------------------------------------------------------------------
# 配置与常量
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(pwd)"
GATE_MODE=false
STAGED_ONLY=false
SINCE_REF=""
OUTPUT_FILE=""
SEVERITY="warning"
FIX_MODE=false
JSON_MODE=false
INIT_AI=false
AI_AGENT=""
CONFIG_FILE=".frontend-guardian.yml"

# 统计
declare -i CRITICAL_COUNT=0
declare -i WARNING_COUNT=0
declare -i SUGGESTION_COUNT=0

# AST 引擎 JSON 输出路径
AST_OUTPUT="/tmp/fg-ast-all.json"

# 颜色
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# 解析参数
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --gate)       GATE_MODE=true; shift ;;
    --staged)     STAGED_ONLY=true; shift ;;
    --since)      SINCE_REF="$2"; shift 2 ;;
    --output)     OUTPUT_FILE="$2"; shift 2 ;;
    --severity)   SEVERITY="$2"; shift 2 ;;
    --fix)        FIX_MODE=true; shift ;;
    --json)       JSON_MODE=true; shift ;;
    --init-ai)
      INIT_AI=true
      if [[ $# -gt 1 && ! "$2" =~ ^-- ]]; then
        AI_AGENT="$2"
        shift 2
      else
        AI_AGENT="generic"
        shift
      fi
      ;;
    --help|-h)
      head -n 22 "$0" | tail -n +3 | sed 's/^# //'
      exit 0
      ;;
    -*)
      echo "❌ 未知选项: $1" >&2
      exit 1
      ;;
    *)
      PROJECT_DIR="$1"
      shift
      ;;
  esac
done

cd "$PROJECT_DIR"
PROJECT_DIR="$(pwd)"

if [[ -z "$OUTPUT_FILE" ]]; then
  OUTPUT_FILE="./frontend-guardian-report.md"
fi

# ---------------------------------------------------------------------------
# 加载配置文件
# ---------------------------------------------------------------------------
load_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    echo "📄 加载配置: $CONFIG_FILE"
    if command -v yq &>/dev/null; then
      : # yq 可用，保留给未来使用
    fi
  fi
}

# ---------------------------------------------------------------------------
# 技术栈检测
# ---------------------------------------------------------------------------
detect_stack() {
  local stack="Unknown"
  local platforms=()

  if [[ -f "manifest.json" && -f "pages.json" ]] && grep -q '"name".*"uni-app"' package.json 2>/dev/null; then
    stack="UniApp"
    platforms+=("小程序" "H5" "App")
  elif [[ -f "config/index.js" || -f "config/index.ts" ]] && grep -q 'taro' package.json 2>/dev/null; then
    stack="Taro"
    platforms+=("小程序" "H5" "App" "RN")
  elif [[ -f "next.config.js" || -f "next.config.ts" || -f "next.config.mjs" ]]; then
    stack="Next.js"
    platforms+=("PC Web" "H5")
  elif [[ -f "nuxt.config.ts" || -f "nuxt.config.js" ]]; then
    stack="Nuxt"
    platforms+=("PC Web" "H5")
  elif grep -q '"react"' package.json 2>/dev/null; then
    stack="React"
    platforms+=("PC Web" "H5")
  elif grep -q '"vue"' package.json 2>/dev/null; then
    stack="Vue"
    platforms+=("PC Web" "H5")
  elif [[ -f "pubspec.yaml" ]]; then
    stack="Flutter"
    platforms+=("iOS" "Android")
  elif [[ -f "metro.config.js" ]] || grep -q '"react-native"' package.json 2>/dev/null; then
    stack="React Native"
    platforms+=("iOS" "Android")
  elif [[ -d "entry/src/main/ets" ]] || [[ -f "hvigorfile.ts" ]]; then
    stack="HarmonyOS"
    platforms+=("鸿蒙")
  fi

  if [[ -f "app.json" && -f "project.config.json" ]]; then
    platforms+=("微信小程序")
  elif [[ -f "mini.project.json" ]]; then
    platforms+=("支付宝小程序")
  fi

  echo "$stack"
  echo "检测到的平台: ${platforms[*]+"${platforms[*]}"}"
}

# ---------------------------------------------------------------------------
# 获取检查文件列表
# ---------------------------------------------------------------------------
get_files() {
  local files=()

  if $STAGED_ONLY; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && files+=("$line")
    done < <(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
  elif [[ -n "$SINCE_REF" ]]; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && files+=("$line")
    done < <(git diff --name-only "$SINCE_REF" HEAD 2>/dev/null || true)
  else
    while IFS= read -r line; do
      files+=("$line")
    done < <(find . -type f \( \
      -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \
      -o -name "*.vue" -o -name "*.css" -o -name "*.scss" -o -name "*.less" \
      -o -name "*.json" \
    \) ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/.git/*" \
       ! -path "*/coverage/*" ! -path "*/build/*" 2>/dev/null)
  fi

  printf '%s\n' "${files[@]}"
}

# ---------------------------------------------------------------------------
# Knip 扫描（未使用依赖/导出/文件）
# ---------------------------------------------------------------------------
run_knip() {
  if ! command -v npx &>/dev/null; then
    echo "  ⚠️ 未检测到 npx，跳过 Knip 扫描"
    return
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 代码库瘦身 (Knip)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local knip_output="/tmp/fg-knip.txt"
  local knip_exit=0

  if npx knip --no-exit-code --max-issues 50 --reporter json > "$knip_output.json" 2>/dev/null; then
    knip_exit=0
  else
    knip_exit=1
  fi

  if [[ -s "$knip_output.json" ]]; then
    echo "   📦 扫描完成（通过 Knip）"

    if command -v node &>/dev/null; then
      node -e "
        try {
          const data = require('${knip_output.json}');
          const issues = [];
          if (data.unused) {
            for (const [key, arr] of Object.entries(data.unused)) {
              if (arr && arr.length) issues.push(\`\${key}: \${arr.length}\`);
            }
          }
          if (issues.length) console.log('   ' + issues.join(', '));
          else console.log('   ✅ 未发现未使用项');
        } catch(e) {
          console.log('   ⚠️ 解析 Knip 输出失败');
        }
      "
    fi

    local KNIP_WARNING
    KNIP_WARNING=$(grep -c 'unused\|unlisted\|duplicate' "$knip_output.json" 2>/dev/null || echo 0)
    KNIP_WARNING=${KNIP_WARNING:-0}
    WARNING_COUNT=$((WARNING_COUNT + KNIP_WARNING))
  else
    echo "   ℹ️ Knip 未检测到问题或项目未配置"
  fi
}

# ---------------------------------------------------------------------------
# AST 引擎（主要引擎）— 一次调用扫描所有模块
# ---------------------------------------------------------------------------
run_ast_engine() {
  local engine_path=""

  if [[ -x "$PROJECT_DIR/node_modules/.bin/fg-core" ]]; then
    engine_path="$PROJECT_DIR/node_modules/.bin/fg-core"
  elif [[ -f "$SCRIPT_DIR/../lib/bin/fg-core.js" ]] && command -v node &>/dev/null; then
    engine_path="node $SCRIPT_DIR/../lib/bin/fg-core.js"
  elif [[ -f "$SCRIPT_DIR/../lib/dist/index.js" ]] && command -v node &>/dev/null; then
    engine_path="node $SCRIPT_DIR/../lib/dist/index.js"
  fi

  if [[ -z "$engine_path" ]]; then
    echo "   ⚠️ 未检测到 Node.js 或 AST 引擎，跳过 AST 深度分析"
    return
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 AST 深度分析（9 大模块）"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local fix_flag=""
  if $FIX_MODE; then
    fix_flag="--fix"
  fi

  if $engine_path "$PROJECT_DIR" --module all --severity "${SEVERITY:-suggestion}" $fix_flag --json > "$AST_OUTPUT" 2>/dev/null; then
    if [[ -s "$AST_OUTPUT" ]]; then
      # 解析 JSON 统计各模块问题数
      local json_total json_c json_w json_s
      json_total=$(node -e "
        const data = require('$AST_OUTPUT');
        let t = 0;
        for (const mod of Object.values(data.modules || {})) {
          t += mod.total || 0;
        }
        console.log(t);
      " 2>/dev/null || echo 0)

      json_c=$(node -e "
        const data = require('$AST_OUTPUT');
        let c = 0;
        for (const mod of Object.values(data.modules || {})) {
          c += mod.issues?.critical?.length || 0;
        }
        console.log(c);
      " 2>/dev/null || echo 0)

      json_w=$(node -e "
        const data = require('$AST_OUTPUT');
        let w = 0;
        for (const mod of Object.values(data.modules || {})) {
          w += mod.issues?.warning?.length || 0;
        }
        console.log(w);
      " 2>/dev/null || echo 0)

      json_s=$(node -e "
        const data = require('$AST_OUTPUT');
        let s = 0;
        for (const mod of Object.values(data.modules || {})) {
          s += mod.issues?.suggestion?.length || 0;
        }
        console.log(s);
      " 2>/dev/null || echo 0)

      CRITICAL_COUNT=$((CRITICAL_COUNT + json_c))
      WARNING_COUNT=$((WARNING_COUNT + json_w))
      SUGGESTION_COUNT=$((SUGGESTION_COUNT + json_s))

      # 终端输出各模块摘要
      node -e "
        const data = require('$AST_OUTPUT');
        const mods = data.modules || {};
        const order = ['i18n','performance','a11y','security','naming','cross-file','component','hooks','platform'];
        const c = { r: s => '\x1b[31m' + s + '\x1b[0m', y: s => '\x1b[33m' + s + '\x1b[0m', b: s => '\x1b[34m' + s + '\x1b[0m' };
        for (const name of order) {
          const m = mods[name];
          if (!m || m.total === 0) continue;
          const parts = [];
          if (m.issues.critical.length) parts.push(c.r('🔴C:' + m.issues.critical.length));
          if (m.issues.warning.length) parts.push(c.y('🟡W:' + m.issues.warning.length));
          if (m.issues.suggestion.length) parts.push(c.b('💡S:' + m.issues.suggestion.length));
          console.log('   📦 ' + name.padEnd(12) + ' ' + parts.join(' | '));
        }
      " 2>/dev/null || true

      if [[ $json_total -eq 0 ]]; then
        echo "   ✅ AST 分析未发现问题"
      else
        echo "   📊 AST 分析共发现 $json_total 个问题"
      fi
    else
      echo "   ✅ AST 分析未发现问题"
    fi
  else
    echo "   ⚠️ AST 引擎执行失败（项目可能不是 Node.js 项目）"
  fi
}

# ---------------------------------------------------------------------------
# Bash 补充扫描
# ---------------------------------------------------------------------------
run_bash_scanner() {
  local name="$1"
  local script="$2"
  local output_file="$3"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 $name（补充扫描）"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [[ -x "$SCRIPT_DIR/$script" ]]; then
    "$SCRIPT_DIR/$script" "$PROJECT_DIR" > "$output_file" 2>&1 || true
    cat "$output_file"

    local c w s
    c=$(grep -cE "❌|🔴|Critical|严重" "$output_file" 2>/dev/null | head -1 | tr -d '\n')
    c=${c:-0}
    w=$(grep -cE "⚠️|🟡|Warning|警告" "$output_file" 2>/dev/null | head -1 | tr -d '\n')
    w=${w:-0}
    s=$(grep -cE "💡|Suggestion|建议" "$output_file" 2>/dev/null | head -1 | tr -d '\n')
    s=${s:-0}
    CRITICAL_COUNT=$((CRITICAL_COUNT + c))
    WARNING_COUNT=$((WARNING_COUNT + w))
    SUGGESTION_COUNT=$((SUGGESTION_COUNT + s))
  else
    echo "⚠️ 扫描脚本不存在: $script，跳过"
  fi
}

# ---------------------------------------------------------------------------
# 生成 Markdown 报告
# ---------------------------------------------------------------------------
generate_report() {
  local report="$OUTPUT_FILE"
  local stack="$1"
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  {
    echo "# 🛡️ Frontend Guardian 扫描报告"
    echo ""
    echo "| 项目 | 值 |"
    echo "| ---- | ---- |"
    echo "| 扫描时间 | $timestamp |"
    echo "| 项目路径 | $PROJECT_DIR |"
    echo "| 检测技术栈 | $stack |"
    echo "| 扫描模式 | $(if $STAGED_ONLY; then echo "Staged 文件"; elif [[ -n "$SINCE_REF" ]]; then echo "Since $SINCE_REF"; else echo "全量扫描"; fi) |"
    echo ""

    echo "## 📊 问题统计"
    echo ""
    echo "| 严重级别 | 数量 |"
    echo "| -------- | ---- |"
    echo "| 🔴 Critical | $CRITICAL_COUNT |"
    echo "| 🟡 Warning | $WARNING_COUNT |"
    echo "| 💡 Suggestion | $SUGGESTION_COUNT |"
    echo ""

    # AST 引擎详细结果
    if [[ -f "$AST_OUTPUT" && -s "$AST_OUTPUT" ]]; then
      node -e "
        const data = require('$AST_OUTPUT');
        const modules = data.modules || {};
        const labels = {
          i18n: '🌍 i18n 治理',
          performance: '⚡ 性能优化',
          a11y: '♿ 可访问性',
          security: '🛡️ 安全扫描',
          naming: '🏷️ 命名规范',
          'cross-file': '🔗 跨文件分析',
          component: '🏥 组件医生',
          hooks: '⚡ Hooks / Composables',
          platform: '📱 多端平台适配',
        };
        for (const [key, label] of Object.entries(labels)) {
          const mod = modules[key];
          if (!mod || mod.total === 0) continue;
          console.log('## ' + label);
          console.log('');
          const all = [
            ...(mod.issues?.critical || []),
            ...(mod.issues?.warning || []),
            ...(mod.issues?.suggestion || []),
          ];
          for (const issue of all) {
            const sev = issue.severity.toUpperCase();
            const icon = sev === 'CRITICAL' ? '🔴' : sev === 'WARNING' ? '🟡' : '💡';
            console.log('### ' + icon + ' [' + sev + '] ' + issue.title);
            console.log('');
            console.log('- **文件**: \`' + issue.file + ':' + issue.line + ':' + issue.column + '\`');
            console.log('- **说明**: ' + issue.description);
            if (issue.source) {
              console.log('- **源码**: ');
              console.log('  \`\`\`');
              console.log('  ' + issue.source.split('\n').join('\n  '));
              console.log('  \`\`\`');
            }
            if (issue.fix) {
              console.log('- **修复建议**: 将 \`' + issue.source + '\` 替换为 \`' + issue.fix.text + '\`');
            }
            console.log('');
          }
        }

        // 修复统计
        if (data.fix && data.fix.fixedCount > 0) {
          console.log('## 🔧 自动修复');
          console.log('');
          console.log('- 已修复问题数: ' + data.fix.fixedCount);
          console.log('- 修改文件数: ' + data.fix.filesModified.length);
          for (const f of data.fix.filesModified) {
            console.log('  - \`' + f + '\`');
          }
          console.log('');
        }
      " 2>/dev/null || echo "⚠️ 解析 AST 结果失败"
    fi

    # Bash 补充扫描结果
    local bash_modules=(
      "🌍 i18n 治理（补充）:/tmp/fg-i18n.txt"
      "🏥 组件医生（补充）:/tmp/fg-component.txt"
      "⚡ Hooks / Composables（补充）:/tmp/fg-hooks.txt"
      "📱 多端平台适配（补充）:/tmp/fg-platform.txt"
    )
    for item in "${bash_modules[@]}"; do
      local label="${item%%:*}"
      local file="${item##*:}"
      if [[ -f "$file" && -s "$file" ]]; then
        echo "## $label"
        echo ""
        echo '\`\`\`'
        cat "$file"
        echo '\`\`\`'
        echo ""
      fi
    done

    # Knip
    echo "## 🧹 代码库瘦身 (Knip)"
    echo ""
    if [[ -f "/tmp/fg-knip.txt.json" && -s "/tmp/fg-knip.txt.json" ]]; then
      echo '\`\`\`json'
      cat "/tmp/fg-knip.txt.json"
      echo '\`\`\`'
    else
      echo "ℹ️ Knip 扫描结果未生成（可能未安装 Node.js 或未安装 Knip）"
    fi
    echo ""

    echo "---"
    echo "_Powered by [frontend-guardian](https://github.com/wzm111/frontend-guardian)_"
  } > "$report"

  echo ""
  echo "📄 报告已生成: $report"
}

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
main() {
  echo ""
  echo "🛡️ Frontend Guardian v2.0.0"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  load_config

  # 检测技术栈
  echo ""
  echo "📱 正在检测技术栈..."
  STACK=$(detect_stack | head -1)
  echo "   检测到: $STACK"

  # 获取文件列表
  echo ""
  echo "📁 正在收集扫描文件..."
  FILE_COUNT=$(get_files | wc -l | tr -d ' ')
  echo "   共 $FILE_COUNT 个文件"

  # 1. AST 深度分析（主要引擎，一次扫描所有模块）
  run_ast_engine

  # 2. Bash 补充扫描（覆盖 AST 未迁移的规则）
  run_bash_scanner "i18n 治理" "scan-i18n.sh" "/tmp/fg-i18n.txt"
  run_bash_scanner "组件医生" "scan-components.sh" "/tmp/fg-component.txt"
  run_bash_scanner "Hooks 检查" "scan-hooks.sh" "/tmp/fg-hooks.txt"
  run_bash_scanner "多端适配" "scan-platform.sh" "/tmp/fg-platform.txt"

  # 3. Knip 代码库瘦身
  run_knip

  # 4. 生成报告
  generate_report "$STACK"

  # 终端摘要
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 扫描完成"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "   🔴 Critical:  $CRITICAL_COUNT"
  echo "   🟡 Warning:   $WARNING_COUNT"
  echo "   💡 Suggestion: $SUGGESTION_COUNT"
  echo ""

  # JSON 模式：输出原始 AST 结果
  if $JSON_MODE; then
    if [[ -f "$AST_OUTPUT" ]]; then
      echo ""
      echo "📋 AST JSON 原始输出："
      cat "$AST_OUTPUT"
      echo ""
    fi
  fi

  # AI 上下文初始化/更新
  if $INIT_AI; then
    echo ""
    echo "🤖 正在更新 AI 上下文..."
    local init_ai_args=("$PROJECT_DIR" "--agent" "$AI_AGENT" "--report" "$OUTPUT_FILE")
    if [[ -f "$CONFIG_FILE" ]]; then
      local include_files
      include_files=$(grep -A 10 'includeFiles:' "$CONFIG_FILE" 2>/dev/null | grep '^  \- ' | sed 's/^  - //' | tr '\n' ',' | sed 's/,$//')
      if [[ -n "$include_files" ]]; then
        init_ai_args+=("--include" "$include_files")
      fi
    fi
    if bash "$SCRIPT_DIR/init-ai-context.sh" "${init_ai_args[@]}"; then
      echo ""
      echo "✅ AI 上下文已更新"
    else
      echo ""
      echo "⚠️ AI 上下文更新失败"
    fi
  fi

  # 门禁检查
  if $GATE_MODE; then
    if [[ $CRITICAL_COUNT -gt 0 ]]; then
      echo "❌ 门禁未通过: 发现 $CRITICAL_COUNT 个 Critical 问题"
      exit 1
    else
      echo "✅ 门禁通过"
    fi
  fi

  # 严重级别过滤提示
  case "$SEVERITY" in
    critical)
      if [[ $CRITICAL_COUNT -gt 0 ]]; then
        echo "⚠️ 按 critical 级别过滤，发现 $CRITICAL_COUNT 个问题"
      fi
      ;;
    warning)
      if [[ $((CRITICAL_COUNT + WARNING_COUNT)) -gt 0 ]]; then
        echo "⚠️ 按 warning 级别过滤，发现 $((CRITICAL_COUNT + WARNING_COUNT)) 个问题"
      fi
      ;;
  esac
}

main "$@"
