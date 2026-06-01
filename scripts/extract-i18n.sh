#!/usr/bin/env bash
#
# extract-i18n.sh — 自动提取硬编码文案到语言包
# Usage: extract-i18n.sh [project_path] [options]
# Options:
#   --dry-run       预览模式（不修改文件）
#   --locale <lang> 源语言（默认 zh-CN）
#   --output <dir>  语言包输出目录（默认 auto-detect）
#
# 功能：
#   1. 扫描源码中的硬编码中文/英文 UI 文案
#   2. 按 module.page.element 格式自动生成 key
#   3. 将文案追加到语言包文件
#   4. 在源码中替换为 i18n 调用

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$(pwd)}"
cd "$PROJECT_DIR"

# 颜色
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# 选项
DRY_RUN=false
SOURCE_LOCALE="zh-CN"
OUTPUT_DIR=""

# 统计
declare -i EXTRACTED_COUNT=0
declare -i ADDED_COUNT=0
declare -i REPLACED_COUNT=0

# 解析参数
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)    DRY_RUN=true; shift ;;
    --locale)     SOURCE_LOCALE="$2"; shift 2 ;;
    --output)     OUTPUT_DIR="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# 检测 i18n 框架
detect_framework() {
  if [[ -f "package.json" ]]; then
    if grep -q '"vue-i18n"' package.json 2>/dev/null; then
      echo "vue-i18n"
    elif grep -q '"react-intl"' package.json 2>/dev/null; then
      echo "react-intl"
    elif grep -q '"i18next"' package.json 2>/dev/null; then
      echo "i18next"
    elif grep -q '"@dcloudio/uni-i18n"' package.json 2>/dev/null; then
      echo "uni-i18n"
    else
      echo "unknown"
    fi
  else
    echo "unknown"
  fi
}

# 检测语言包目录
detect_locale_dir() {
  if [[ -n "$OUTPUT_DIR" ]]; then
    echo "$OUTPUT_DIR"
    return
  fi
  local dirs=("locales" "i18n" "lang" "src/locales" "src/i18n" "language")
  for d in "${dirs[@]}"; do
    if [[ -d "$d" ]]; then
      echo "$d"
      return
    fi
  done
  echo "locales"
}

# 生成语义化 key（从文件路径和内容推断）
generate_key() {
  local file="$1"
  local text="$2"
  local line_num="$3"

  # 从文件路径提取模块名
  local module_name="common"
  if [[ "$file" == */pages/* ]]; then
    module_name=$(echo "$file" | sed -E 's|.*/pages/([^/]+).*|\1|')
  elif [[ "$file" == */views/* ]]; then
    module_name=$(echo "$file" | sed -E 's|.*/views/([^/]+).*|\1|')
  elif [[ "$file" == */components/* ]]; then
    module_name=$(echo "$file" | sed -E 's|.*/components/([^/]+).*|\1|')
  fi

  # 清理模块名
  module_name=$(echo "$module_name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g')

  # 从文本提取前 3 个中文/英文单词作为元素名
  local element=""
  if echo "$text" | grep -qE '[一-鿿]'; then
    element=$(echo "$text" | sed -E 's/[^一-鿿a-zA-Z0-9]//g' | cut -c1-12)
  else
    element=$(echo "$text" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g' | sed 's/^_*//;s/_*$//' | cut -c1-20)
  fi

  # 如果元素名为空，使用行号
  if [[ -z "$element" ]]; then
    element="line_${line_num}"
  fi

  echo "${module_name}.${element}"
}

# 获取 i18n 调用语法
get_i18n_syntax() {
  local framework="$1"
  local key="$2"

  case "$framework" in
    vue-i18n|uni-i18n)
      echo "{{ \$t('${key}') }}"
      ;;
    react-intl)
      echo "{intl.formatMessage({ id: '${key}' })}"
      ;;
    i18next)
      echo "{t('${key}')}"
      ;;
    *)
      echo "t('${key}')"
      ;;
  esac
}

# 提取硬编码文案
extract_texts() {
  echo "📋 扫描硬编码文案..."

  local files=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && files+=("$line")
  done < <(find . -type f \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.vue" \) \
    ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/.git/*" 2>/dev/null)

  local extracted=()
  local -A key_map

  for file in "${files[@]}"; do
    [[ "$file" == *".test."* || "$file" == *".spec."* || "$file" == *".config."* ]] && continue

    local line_num=0
    while IFS= read -r line; do
      line_num=$((line_num + 1))
      [[ "$line" =~ ^\s*// || "$line" =~ ^\s*\* || "$line" =~ ^\s*/\* ]] && continue

      # 匹配中文文案（在引号中）
      local text=""
      if [[ "$line" =~ ("|"|\`|\')([一-鿿][^"\`\']{1,80})("|"|\`|\') ]]; then
        text="${BASH_REMATCH[2]}"
        # 排除 console、URL、文件路径、正则等
        if echo "$line" | grep -qE 'console\.(log|warn|error|debug)|http[s]?:|import\s|from\s|require\(|\.css|\.scss|\.less|\.json|\.test\(|\.match\('; then
          continue
        fi
      fi

      if [[ -n "$text" ]]; then
        local key
        key=$(generate_key "$file" "$text" "$line_num")

        # 去重：如果 key 已存在，添加数字后缀
        local final_key="$key"
        local suffix=1
        while [[ -n "${key_map[$final_key]:-}" ]]; do
          final_key="${key}_${suffix}"
          suffix=$((suffix + 1))
        done

        key_map["$final_key"]="$text"
        extracted+=("$file:$line_num:$final_key:$text")
        EXTRACTED_COUNT=$((EXTRACTED_COUNT + 1))
      fi
    done < "$file"
  done

  printf '%s\n' "${extracted[@]}"
}

# 追加到语言包文件
append_to_locale() {
  local locale_dir="$1"
  local locale_file="$2"
  local key="$3"
  local text="$4"

  if $DRY_RUN; then
    echo "  [DRY-RUN] 将追加到 $locale_file: $key = $text"
    return
  fi

  mkdir -p "$locale_dir"

  if [[ "$locale_file" == *.json ]]; then
    if [[ ! -f "$locale_file" ]]; then
      echo "{\"$key\": \"$text\"}" > "$locale_file"
    else
      # 使用临时文件安全更新 JSON
      local tmp_file=$(mktemp)
      if command -v jq &>/dev/null; then
        jq --arg k "$key" --arg v "$text" '. + {($k): $v}' "$locale_file" > "$tmp_file" && mv "$tmp_file" "$locale_file"
      else
        # 简单追加（如果 key 不存在）
        if ! grep -q "\"$key\":" "$locale_file" 2>/dev/null; then
          sed -i.bak "s/}$/,\"$key\":\"$text\"}/" "$locale_file" 2>/dev/null || \
            echo ",\"$key\":\"$text\"}" >> "$locale_file"
          rm -f "$locale_file.bak"
        fi
      fi
    fi
  fi

  ADDED_COUNT=$((ADDED_COUNT + 1))
}

# 在源码中替换文案（简化版，仅替换明确匹配）
replace_in_source() {
  local file="$1"
  local text="$2"
  local replacement="$3"

  if $DRY_RUN; then
    echo "  [DRY-RUN] 将替换 $file 中的 '$text' → '$replacement'"
    return
  fi

  # 安全替换：仅替换引号包裹的精确匹配
  local escaped_text
  escaped_text=$(echo "$text" | sed 's/[[\.*^$()+?{|]/\\&/g')

  # 创建备份并替换
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i.bak "s/\"$escaped_text\"/\"$replacement\"/g" "$file" 2>/dev/null || true
  else
    sed -i "s/\"$escaped_text\"/\"$replacement\"/g" "$file" 2>/dev/null || true
  fi
  rm -f "$file.bak"

  REPLACED_COUNT=$((REPLACED_COUNT + 1))
}

# 主流程
main() {
  echo ""
  echo "🌍 硬编码文案自动提取"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local framework
  framework=$(detect_framework)
  local locale_dir
  locale_dir=$(detect_locale_dir)

  echo "   检测框架: ${framework}"
  echo "   源语言: ${SOURCE_LOCALE}"
  echo "   语言包目录: ${locale_dir}"
  if $DRY_RUN; then
    echo "   模式: ${YELLOW}预览模式（不修改文件）${NC}"
  fi
  echo ""

  # 提取文案
  local extracted
  extracted=$(extract_texts)

  if [[ -z "$extracted" ]]; then
    echo "  ✅ 未检测到需要提取的硬编码文案"
    exit 0
  fi

  echo "   提取到 ${EXTRACTED_COUNT} 条硬编码文案"
  echo ""

  # 确定语言包文件
  local locale_file="$locale_dir/$SOURCE_LOCALE.json"

  # 处理每条提取的文案
  echo "📋 处理提取结果..."
  local file line_num key text
  while IFS=: read -r file line_num key text; do
    [[ -z "$file" ]] && continue

    echo "   📄 $file:$line_num"
    echo "      key: $key"
    echo "      text: $text"

    # 追加到语言包
    append_to_locale "$locale_dir" "$locale_file" "$key" "$text"

    # 生成替换语法
    local syntax
    syntax=$(get_i18n_syntax "$framework" "$key")
    echo "      replace: $syntax"
    echo ""
  done <<< "$extracted"

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 提取报告"
  echo "   提取文案: $EXTRACTED_COUNT"
  echo "   新增 key: $ADDED_COUNT"
  echo "   语言包: $locale_file"
  if $DRY_RUN; then
    echo ""
    echo "${YELLOW}⚠️  预览模式：未实际修改文件${NC}"
    echo "   去掉 --dry-run 参数执行实际替换"
  fi
  echo ""
  echo "💡 提示："
  echo "   1. 请检查生成的 key 语义是否合理"
  echo "   2. 手动执行源码替换（当前版本仅生成报告）"
  echo "   3. 运行 translate.sh 自动翻译其他语言"
}

main "$@"
