#!/usr/bin/env bash
#
# frontend-guardian — 全量扫描入口
# Usage: full-scan.sh [options] [project_path]
#
# Options:
#   --gate          门禁模式（发现 Critical 问题时 exit 1）
#   --staged        仅检查 git staged 文件
#   --since <ref>   检查指定 commit 以来的变更
#   --output <file> 报告输出路径
#   --severity <l>  最低输出级别: critical | warning | suggestion
#   --fix           自动修复可修复的问题
#   --init-ai       扫描后初始化/更新 AI 上下文文件
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
INIT_AI=false
AI_AGENT=""
CONFIG_FILE=".frontend-guardian.yml"

# 统计
declare -i CRITICAL_COUNT=0
declare -i WARNING_COUNT=0
declare -i SUGGESTION_COUNT=0

# 颜色
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
      head -n 20 "$0" | tail -n +3 | sed 's/^# //'
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

# 如果未指定输出文件，使用默认
if [[ -z "$OUTPUT_FILE" ]]; then
  OUTPUT_FILE="./frontend-guardian-report.md"
fi

# ---------------------------------------------------------------------------
# 加载配置文件
# ---------------------------------------------------------------------------
load_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    echo "📄 加载配置: $CONFIG_FILE"
    # 简单 YAML 解析（支持 key: value 和 key:
    #   subkey: value 格式）
    if command -v yq &>/dev/null; then
      CONFIG=$(yq -r '.' "$CONFIG_FILE" 2>/dev/null || echo "{}")
    fi
  fi
}

# ---------------------------------------------------------------------------
# 技术栈检测
# ---------------------------------------------------------------------------
detect_stack() {
  local stack="Unknown"
  local platforms=()

  # 检测 UniApp
  if [[ -f "manifest.json" && -f "pages.json" ]] && grep -q '"name".*"uni-app"' package.json 2>/dev/null; then
    stack="UniApp"
    platforms+=("小程序" "H5" "App")
  # 检测 Taro
  elif [[ -f "config/index.js" || -f "config/index.ts" ]] && grep -q 'taro' package.json 2>/dev/null; then
    stack="Taro"
    platforms+=("小程序" "H5" "App" "RN")
  # 检测 Next.js
  elif [[ -f "next.config.js" || -f "next.config.ts" || -f "next.config.mjs" ]]; then
    stack="Next.js"
    platforms+=("PC Web" "H5")
  # 检测 Nuxt
  elif [[ -f "nuxt.config.ts" || -f "nuxt.config.js" ]]; then
    stack="Nuxt"
    platforms+=("PC Web" "H5")
  # 检测 React
  elif grep -q '"react"' package.json 2>/dev/null; then
    stack="React"
    platforms+=("PC Web" "H5")
  # 检测 Vue
  elif grep -q '"vue"' package.json 2>/dev/null; then
    stack="Vue"
    platforms+=("PC Web" "H5")
  # 检测 Flutter
  elif [[ -f "pubspec.yaml" ]]; then
    stack="Flutter"
    platforms+=("iOS" "Android")
  # 检测 React Native
  elif [[ -f "metro.config.js" ]] || grep -q '"react-native"' package.json 2>/dev/null; then
    stack="React Native"
    platforms+=("iOS" "Android")
  # 检测鸿蒙
  elif [[ -d "entry/src/main/ets" ]] || [[ -f "hvigorfile.ts" ]]; then
    stack="HarmonyOS"
    platforms+=("鸿蒙")
  fi

  # 检测小程序原生
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
    # 仅 staged 文件
    while IFS= read -r line; do
      [[ -n "$line" ]] && files+=("$line")
    done < <(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
  elif [[ -n "$SINCE_REF" ]]; then
    # 指定 commit 以来的变更
    while IFS= read -r line; do
      [[ -n "$line" ]] && files+=("$line")
    done < <(git diff --name-only "$SINCE_REF" HEAD 2>/dev/null || true)
  else
    # 全量扫描源码文件
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
# 执行子扫描脚本
# ---------------------------------------------------------------------------
run_scanner() {
  local name="$1"
  local script="$2"
  local output_file="$3"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 $name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [[ -x "$SCRIPT_DIR/$script" ]]; then
    "$SCRIPT_DIR/$script" "$PROJECT_DIR" > "$output_file" 2>&1 || true
    cat "$output_file"

    # 统计问题数（head -1 防止多行输出）
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

    # 各模块详细结果
    echo "## 🌍 i18n 治理"
    echo ""
    if [[ -f "/tmp/fg-i18n.txt" && -s "/tmp/fg-i18n.txt" ]]; then
      echo '```'
      cat "/tmp/fg-i18n.txt"
      echo '```'
    else
      echo "✅ 未发现问题"
    fi
    echo ""

    echo "## 🏥 组件医生"
    echo ""
    if [[ -f "/tmp/fg-component.txt" && -s "/tmp/fg-component.txt" ]]; then
      echo '```'
      cat "/tmp/fg-component.txt"
      echo '```'
    else
      echo "✅ 未发现问题"
    fi
    echo ""

    echo "## ⚡ Hooks / Composables"
    echo ""
    if [[ -f "/tmp/fg-hooks.txt" && -s "/tmp/fg-hooks.txt" ]]; then
      echo '```'
      cat "/tmp/fg-hooks.txt"
      echo '```'
    else
      echo "✅ 未发现问题"
    fi
    echo ""

    echo "## 📱 多端平台适配"
    echo ""
    if [[ -f "/tmp/fg-platform.txt" && -s "/tmp/fg-platform.txt" ]]; then
      echo '```'
      cat "/tmp/fg-platform.txt"
      echo '```'
    else
      echo "✅ 未发现问题"
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
  echo "🛡️ Frontend Guardian v1.0.0"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # 加载配置
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

  # 执行各模块扫描
  run_scanner "i18n 治理" "scan-i18n.sh" "/tmp/fg-i18n.txt"
  run_scanner "组件医生" "scan-components.sh" "/tmp/fg-component.txt"
  run_scanner "Hooks 检查" "scan-hooks.sh" "/tmp/fg-hooks.txt"
  run_scanner "多端适配" "scan-platform.sh" "/tmp/fg-platform.txt"

  # 生成报告
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

  # AI 上下文初始化/更新
  if $INIT_AI; then
    echo ""
    echo "🤖 正在更新 AI 上下文..."
    local init_ai_args=("$PROJECT_DIR" "--agent" "$AI_AGENT" "--report" "$OUTPUT_FILE")
    if [[ -f "$CONFIG_FILE" ]]; then
      # 从配置读取 includeFiles（简单解析）
      local include_files
      include_files=$(grep -A 10 'includeFiles:' "$CONFIG_FILE" 2>/dev/null | grep '^  \- ' | sed 's/^  - //' | tr '\n' ',' | sed 's/,$//')
      if [[ -n "$include_files" ]]; then
        init_ai_args+=("--include" "$include_files")
      fi
    fi
    if $UPDATE_MODE; then
      init_ai_args+=("--update")
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

  # 严重级别过滤
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
