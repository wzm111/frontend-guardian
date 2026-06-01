#!/usr/bin/env bash
#
# init-ai-context.sh — 在目标项目中生成 AI 智能体上下文文件
# Usage:
#   init-ai-context.sh [project_path] --agent <claude|cursor|copilot|all|generic>
#   init-ai-context.sh [project_path] --agent claude --include README.md,CONTRIBUTING.md
#   init-ai-context.sh [project_path] --agent all --report frontend-guardian-report.md
#   init-ai-context.sh [project_path] --update
#
# 支持的智能体格式：
#   claude    → {project}/.claude/CLAUDE.md
#   cursor    → {project}/.cursorrules
#   copilot   → {project}/.github/copilot-instructions.md
#   generic   → {project}/AI_CONTEXT.md
#   all       → 同时生成以上所有格式

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PROJECT_DIR="$(pwd)"
AGENT=""
REPORT_FILE=""
INCLUDE_FILES=""
UPDATE_MODE=false
DRY_RUN=false

# 颜色
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# 解析参数
while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)      AGENT="$2"; shift 2 ;;
    --report)     REPORT_FILE="$2"; shift 2 ;;
    --include)    INCLUDE_FILES="$2"; shift 2 ;;
    --update)     UPDATE_MODE=true; shift ;;
    --dry-run)    DRY_RUN=true; shift ;;
    --help|-h)
      sed -n '2,20p' "$0" | sed 's/^# //'
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

# 默认 agent
[[ -z "$AGENT" ]] && AGENT="generic"

# ---------------------------------------------------------------------------
# 技术栈检测（复用 full-scan.sh 逻辑）
# ---------------------------------------------------------------------------
detect_stack() {
  local stack="Unknown"
  local platforms=()
  local framework=""
  local component_lib=""

  # 检测 UniApp
  if [[ -f "manifest.json" && -f "pages.json" ]] && grep -q '"name".*"uni-app"' package.json 2>/dev/null; then
    stack="UniApp"
    platforms+=("小程序" "H5" "App")
    framework="Vue3"
  # 检测 Taro
  elif [[ -f "config/index.js" || -f "config/index.ts" ]] && grep -q 'taro' package.json 2>/dev/null; then
    stack="Taro"
    platforms+=("小程序" "H5" "App" "RN")
    if grep -q '"react"' package.json 2>/dev/null; then
      framework="React"
    elif grep -q '"vue"' package.json 2>/dev/null; then
      framework="Vue"
    fi
  # 检测 Next.js
  elif [[ -f "next.config.js" || -f "next.config.ts" || -f "next.config.mjs" ]]; then
    stack="Next.js"
    platforms+=("PC Web" "H5")
    framework="React"
  # 检测 Nuxt
  elif [[ -f "nuxt.config.ts" || -f "nuxt.config.js" ]]; then
    stack="Nuxt"
    platforms+=("PC Web" "H5")
    framework="Vue"
  # 检测 React
  elif grep -q '"react"' package.json 2>/dev/null; then
    stack="React"
    platforms+=("PC Web" "H5")
    framework="React"
  # 检测 Vue
  elif grep -q '"vue"' package.json 2>/dev/null; then
    stack="Vue"
    platforms+=("PC Web" "H5")
    framework="Vue"
  # 检测 Flutter
  elif [[ -f "pubspec.yaml" ]]; then
    stack="Flutter"
    platforms+=("iOS" "Android")
    framework="Flutter"
  # 检测 React Native
  elif [[ -f "metro.config.js" ]] || grep -q '"react-native"' package.json 2>/dev/null; then
    stack="React Native"
    platforms+=("iOS" "Android")
    framework="React"
  # 检测鸿蒙
  elif [[ -d "entry/src/main/ets" ]] || [[ -f "hvigorfile.ts" ]]; then
    stack="HarmonyOS"
    platforms+=("鸿蒙")
    framework="ArkTS"
  fi

  # 检测小程序原生
  if [[ -f "app.json" && -f "project.config.json" ]]; then
    platforms+=("微信小程序")
  elif [[ -f "mini.project.json" ]]; then
    platforms+=("支付宝小程序")
  fi

  # 检测组件库
  if grep -q '"antd"' package.json 2>/dev/null; then
    component_lib="Ant Design"
  elif grep -q '"element-plus"' package.json 2>/dev/null; then
    component_lib="Element Plus"
  elif grep -q '"@nutui/nutui' package.json 2>/dev/null; then
    component_lib="NutUI"
  elif grep -q '"@arco-design"' package.json 2>/dev/null; then
    component_lib="Arco Design"
  fi

  # 检测 TypeScript
  local has_typescript="false"
  [[ -f "tsconfig.json" ]] && has_typescript="true"

  echo "stack:$stack"
  echo "framework:$framework"
  echo "component_lib:$component_lib"
  echo "typescript:$has_typescript"
  printf 'platform:%s\n' "${platforms[*]+"${platforms[*]}"}"
}

# 获取 package.json 中的版本信息
get_pkg_version() {
  local dep="$1"
  if [[ -f "package.json" ]]; then
    grep -oE "\"$dep\"\s*:\s*\"[^\"]+\"" package.json 2>/dev/null | head -1 | sed 's/.*"\([^"]*\)".*/\1/'
  fi
}

# ---------------------------------------------------------------------------
# 提取规则文件摘要
# ---------------------------------------------------------------------------
extract_rules_summary() {
  local stack="$1"
  local framework="$2"
  local component_lib="$3"
  local rules_dir="$FG_DIR/rules"
  local summary=""

  # 映射 stack 到规则文件
  local rule_files=()

  case "$stack" in
    "UniApp")      rule_files+=("uniapp.md");;
    "Taro")        rule_files+=("taro.md");;
    "Next.js")     rule_files+=("nextjs.md");;
    "Nuxt")        rule_files+=("nuxt.md");;
    "Flutter")     rule_files+=("flutter.md");;
    "React Native") rule_files+=("react-native.md");;
    "HarmonyOS")   rule_files+=("harmony.md");;
  esac

  # 框架规则
  case "$framework" in
    "React")       rule_files+=("react.md");;
    "Vue"|"Vue3")  rule_files+=("vue.md");;
  esac

  # 组件库规则
  case "$component_lib" in
    "Ant Design")  rule_files+=("antd.md");;
    "Element Plus") rule_files+=("element-plus.md");;
  esac

  # 通用规则
  rule_files+=("i18n.md" "platform-common.md")

  # 去重
  local unique_rules=()
  for f in "${rule_files[@]:+${rule_files[@]}}"; do
    [[ -n "$f" ]] || continue
    local dup=false
    for u in "${unique_rules[@]:+${unique_rules[@]}}"; do
      [[ "$f" == "$u" ]] && dup=true && break
    done
    $dup || unique_rules+=("$f")
  done

  for f in "${unique_rules[@]:+${unique_rules[@]}}"; do
    [[ -n "$f" ]] || continue
    local filepath="$rules_dir/$f"
    if [[ -f "$filepath" ]]; then
      summary+="\n### ${f%.md} 专项规则\n\n"
      # 提取规则标题和严重级别（前 10 条）
      local extracted
      extracted=$(grep -E '^### |\*\*严重程度\*\*' "$filepath" 2>/dev/null | head -30 | \
        awk '/^### / {title=$0} /严重程度/ {print title " — " $0}')
      if [[ -n "$extracted" ]]; then
        summary+="$(echo "$extracted" | sed 's/^### /- /;s/\*\*严重程度\*\*: //')\n"
      else
        summary+="- 参见规则文件: rules/$f\n"
      fi
    fi
  done

  echo -e "$summary"
}

# ---------------------------------------------------------------------------
# 从扫描报告中提取问题摘要
# ---------------------------------------------------------------------------
extract_report_summary() {
  local report="$1"
  if [[ -z "$report" || ! -f "$report" ]]; then
    echo ""
    return
  fi

  local critical_count warning_count suggestion_count
  critical_count=$(grep -oE "Critical.*[0-9]+" "$report" 2>/dev/null | grep -oE "[0-9]+" | head -1 || echo "0")
  warning_count=$(grep -oE "Warning.*[0-9]+" "$report" 2>/dev/null | grep -oE "[0-9]+" | head -1 || echo "0")
  suggestion_count=$(grep -oE "Suggestion.*[0-9]+" "$report" 2>/dev/null | grep -oE "[0-9]+" | head -1 || echo "0")

  echo "| 严重级别 | 数量 |"
  echo "| -------- | ---- |"
  echo "| 🔴 Critical | ${critical_count:-0} |"
  echo "| 🟡 Warning | ${warning_count:-0} |"
  echo "| 💡 Suggestion | ${suggestion_count:-0} |"
}

# ---------------------------------------------------------------------------
# 生成 AI 上下文内容（Markdown 格式）
# ---------------------------------------------------------------------------
generate_context_content() {
  local agent="$1"
  local stack="$2"
  local framework="$3"
  local component_lib="$4"
  local has_typescript="$5"
  local platforms="$6"

  # 获取版本信息
  local framework_version=""
  case "$framework" in
    "React")     framework_version=$(get_pkg_version "react");;
    "Vue"|"Vue3") framework_version=$(get_pkg_version "vue");;
  esac

  local lib_version=""
  case "$component_lib" in
    "Ant Design") lib_version=$(get_pkg_version "antd");;
    "Element Plus") lib_version=$(get_pkg_version "element-plus");;
  esac

  # 提取规则摘要
  local rules_summary
  rules_summary=$(extract_rules_summary "$stack" "$framework" "$component_lib")

  # 提取报告摘要
  local report_summary=""
  if [[ -n "$REPORT_FILE" && -f "$REPORT_FILE" ]]; then
    report_summary=$(extract_report_summary "$REPORT_FILE")
  fi

  # 构建项目结构描述
  local dir_structure=""
  if [[ -d "src" ]]; then
    dir_structure="项目采用 src/ 目录结构。"
  elif [[ -d "lib" ]]; then
    dir_structure="项目采用 lib/ 目录结构。"
  fi

  # TypeScript 提示文本
  local ts_hint=""
  if [[ "$has_typescript" == "true" ]]; then
    ts_hint="优先使用严格类型，避免 any"
  else
    ts_hint="项目使用 JavaScript，注意类型安全"
  fi

  # 框架版本文本
  local fw_ver_text=""
  if [[ -n "$framework_version" ]]; then
    fw_ver_text=" ($framework_version)"
  fi

  # 组件库版本文本
  local lib_ver_text=""
  if [[ -n "$lib_version" ]]; then
    lib_ver_text=" ($lib_version)"
  fi

  # 构建内容 - 使用 printf 避免 heredoc 变量问题
  printf '%s\n' -- "# AI 开发上下文 — $(basename "$PROJECT_DIR")"
  printf '\n'
  printf '> 本文件由 frontend-guardian 自动生成，供 AI 智能体在处理本项目时优先读取。\n'
  printf '> 生成时间: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
  printf '> 如需更新，运行: \`frontend-guardian --init-ai --agent %s\`\n' "$agent"
  printf '\n'
  printf '## 项目概况\n\n'
  printf '| 属性 | 值 |\n'
  printf '| ---- | ---- |\n'
  printf '| 项目路径 | %s |\n' "$PROJECT_DIR"
  printf '| 主要框架 | %s%s |\n' "${stack:-未知}" "$fw_ver_text"
  printf '| UI 框架 | %s%s |\n' "${framework:-未知}" "$([[ "$has_typescript" == "true" ]] && echo " + TypeScript" || echo "")"
  printf '| 组件库 | %s%s |\n' "${component_lib:-未检测}" "$lib_ver_text"
  printf '| 目标平台 | %s |\n' "${platforms:-未识别}"
  printf '| %s |\n' "$dir_structure"
  printf '\n'

  # 前端治理规则摘要
  if [[ -n "$rules_summary" ]]; then
    printf '## 前端治理规则摘要\n\n'
    printf '以下规则基于检测到的技术栈自动提取，开发时请务必遵守：\n'
    printf '%s\n' -- "$rules_summary"
    printf '\n'
  fi

  # 扫描报告摘要
  if [[ -n "$report_summary" ]]; then
    printf '## 最近一次扫描结果\n\n'
    printf '%s\n' -- "$report_summary"
    printf '\n'
    printf '> 详细报告: %s\n' "$REPORT_FILE"
    printf '\n'
  fi

  # 项目目录结构约定
  printf '## 项目目录结构\n\n'
  if [[ -d "src" ]]; then
    printf '%s\n' '```'
    printf 'src/\n'
    printf '├── components/     # 公共组件\n'
    printf '├── pages/          # 页面（或 views/）\n'
    printf '├── hooks/          # 自定义 Hooks / Composables\n'
    printf '├── utils/          # 工具函数\n'
    printf '├── services/       # API 请求封装\n'
    printf '├── stores/         # 状态管理\n'
    printf '├── styles/         # 全局样式\n'
    printf '├── assets/         # 静态资源\n'
    printf '└── locales/        # 国际化语言包（如存在）\n'
    printf '%s\n' '```'
  fi

  if [[ -f "package.json" ]]; then
    printf '\n'
    printf '## package.json 脚本\n\n'
    printf '%s\n' '```json'
    grep -A 20 '"scripts"' package.json 2>/dev/null | head -20
    printf '%s\n' '```'
  fi

  # AI 助手指令
  printf '\n'
  printf '## AI 助手指令\n\n'
  printf '在处理本项目代码时，请遵守以下约定：\n\n'
  printf '1. **代码风格**: 保持与现有代码一致的缩进、命名和注释风格\n'
  printf '2. **组件规范**: %s，遵循对应规则文件中的反模式检测项\n' "${component_lib:-使用项目已有组件库}"
  printf '3. **状态管理**: 优先使用项目已有方案（React Context / Pinia / Redux / Zustand 等）\n'
  printf '4. **API 请求**: 统一通过 services/ 层封装，处理错误和 loading 状态\n'
  printf '5. **国际化**: UI 文案必须使用 i18n key，禁止硬编码中文/英文\n'
  printf '6. **TypeScript**: %s\n' "$ts_hint"
  printf '7. **性能**: 注意 React.memo / Vue computed 缓存，大列表使用虚拟滚动\n'
  printf '8. **测试**: 修改后运行相关测试，确保不引入回归\n'
  printf '\n'

  # 额外引用文档
  if [[ -n "$INCLUDE_FILES" ]]; then
    printf '## 参考文档\n\n'
    IFS=',' read -ra files <<< "$INCLUDE_FILES"
    for f in "${files[@]}"; do
      f="$(echo "$f" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"  # trim
      if [[ -f "$f" ]]; then
        printf '- [%s](%s) — 项目文档\n' "$f" "$f"
      else
        printf '- %s — （文件不存在，跳过）\n' "$f"
      fi
    done
    printf '\n'
  fi

  # 不同 agent 的特定指令
  case "$agent" in
    "claude")
      printf '## Claude Code 特定指令\n\n'
      printf -- '- 使用 \`/frontend-guardian\` 命令执行前端治理扫描\n'
      printf -- '- 修改组件时，先运行 \`frontend-guardian --component\` 检查反模式\n'
      printf -- '- 添加新页面时，先运行 \`frontend-guardian --i18n\` 确保文案已提取\n'
      printf -- '- 提交前运行 \`frontend-guardian --scan --staged\` 做提交前检查\n'
      printf '\n'
      ;;
    "cursor")
      printf '## Cursor 特定指令\n\n'
      printf -- '- 生成代码时参考「前端治理规则摘要」中的反模式清单\n'
      printf -- '- 组件代码生成后，手动检查是否违反组件库规范\n'
      printf -- '- 使用 Cursor Chat 时，可引用本文件获取项目上下文\n'
      printf '\n'
      ;;
    "copilot")
      printf '## GitHub Copilot 特定指令\n\n'
      printf -- '- 代码补全遵循项目已有的命名和结构约定\n'
      printf -- '- 生成组件代码时，使用项目已注册的组件库\n'
      printf -- '- 生成 Hooks 时，注意依赖数组和清理函数的完整性\n'
      printf '\n'
      ;;
  esac
}

# ---------------------------------------------------------------------------
# 写入文件
# ---------------------------------------------------------------------------
write_context_file() {
  local agent="$1"
  local content="$2"
  local output_file=""
  local output_dir=""

  case "$agent" in
    "claude")
      output_dir="$PROJECT_DIR/.claude"
      output_file="$output_dir/CLAUDE.md"
      ;;
    "cursor")
      output_file="$PROJECT_DIR/.cursorrules"
      ;;
    "copilot")
      output_dir="$PROJECT_DIR/.github"
      output_file="$output_dir/copilot-instructions.md"
      ;;
    "generic")
      output_file="$PROJECT_DIR/AI_CONTEXT.md"
      ;;
    *)
      echo "❌ 不支持的 agent 类型: $agent" >&2
      return 1
      ;;
  esac

  # 创建目录
  if [[ -n "$output_dir" && ! -d "$output_dir" ]]; then
    if $DRY_RUN; then
      echo "[dry-run] mkdir -p $output_dir"
    else
      mkdir -p "$output_dir"
    fi
  fi

  if $DRY_RUN; then
    echo "[dry-run] 将写入: $output_file"
    echo "$content" | head -20
    echo "..."
  else
    echo "$content" > "$output_file"
    echo "  ✅ 已生成: $output_file"
  fi
}

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
main() {
  echo ""
  echo "🤖 Frontend Guardian — AI 上下文初始化"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "   目标项目: $PROJECT_DIR"
  echo "   智能体类型: $AGENT"
  $UPDATE_MODE && echo "   模式: 更新"
  $DRY_RUN && echo "   模式: 预览"
  echo ""

  # 检测技术栈
  echo "📱 正在检测技术栈..."
  local stack_info
  stack_info=$(detect_stack)

  local stack=$(echo "$stack_info" | grep '^stack:' | cut -d: -f2)
  local framework=$(echo "$stack_info" | grep '^framework:' | cut -d: -f2)
  local component_lib=$(echo "$stack_info" | grep '^component_lib:' | cut -d: -f2)
  local has_typescript=$(echo "$stack_info" | grep '^typescript:' | cut -d: -f2)
  local platforms=$(echo "$stack_info" | grep '^platform:' | cut -d: -f2-)

  echo "   框架: ${stack:-未知}"
  echo "   UI: ${framework:-未知}"
  echo "   组件库: ${component_lib:-未检测}"
  echo "   平台: ${platforms:-未识别}"
  echo ""

  # 生成内容
  echo "📝 正在生成 AI 上下文文件..."

  if [[ "$AGENT" == "all" ]]; then
    for a in claude cursor copilot generic; do
      # 为每个 agent 生成特定内容
      local agent_content
      agent_content=$(generate_context_content "$a" "$stack" "$framework" "$component_lib" "$has_typescript" "$platforms")
      write_context_file "$a" "$agent_content"
    done
  else
    local content
    content=$(generate_context_content "$AGENT" "$stack" "$framework" "$component_lib" "$has_typescript" "$platforms")
    write_context_file "$AGENT" "$content"
  fi

  # 检查是否需要更新 .gitignore
  if ! $DRY_RUN && [[ -f ".gitignore" ]]; then
    local needs_gitignore_update=false
    if [[ "$AGENT" == "all" || "$AGENT" == "cursor" ]]; then
      if ! grep -q "\.cursorrules" .gitignore 2>/dev/null; then
        needs_gitignore_update=true
      fi
    fi
    if $needs_gitignore_update; then
      echo "" >> .gitignore
      echo "# AI context files (generated by frontend-guardian)" >> .gitignore
      echo ".cursorrules" >> .gitignore
      echo "AI_CONTEXT.md" >> .gitignore
      echo "   已更新 .gitignore（忽略 AI 上下文文件）"
    fi
  fi

  echo ""
  echo "✅ AI 上下文初始化完成"

  # 提示使用方式
  echo ""
  echo "💡 使用提示:"
  case "$AGENT" in
    "claude"|"all")
      echo "   Claude Code: 打开本项目时自动读取 .claude/CLAUDE.md"
      ;;
  esac
  case "$AGENT" in
    "cursor"|"all")
      echo "   Cursor: 在项目根目录打开时自动读取 .cursorrules"
      ;;
  esac
  case "$AGENT" in
    "copilot"|"all")
      echo "   GitHub Copilot: 在 VS Code 中自动读取 .github/copilot-instructions.md"
      ;;
  esac
  case "$AGENT" in
    "generic"|"all")
      echo "   通用: AI_CONTEXT.md 可被任意智能体手动引用"
      ;;
  esac
}

main "$@"
