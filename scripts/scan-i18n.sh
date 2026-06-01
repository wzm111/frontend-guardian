#!/usr/bin/env bash
#
# scan-i18n.sh — i18n 国际化治理扫描
# Usage: scan-i18n.sh [project_path]
#
# 检测项：
#   1. 硬编码中文/英文文案
#   2. 语言包缺失 key
#   3. 未使用的死 key
#   4. key 命名规范

set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
cd "$PROJECT_DIR"

# 颜色
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# 统计
declare -i HARDCODE_COUNT=0
declare -i MISSING_COUNT=0
declare -i DEAD_COUNT=0
declare -i NAMING_COUNT=0

# 检测 i18n 框架和语言包位置
detect_i18n_setup() {
  local locales_dirs=("locales" "i18n" "lang" "messages" "language" "src/locales" "src/i18n")
  local locale_files=()
  local framework=""

  # 检测框架
  if [[ -f "package.json" ]]; then
    if grep -q '"vue-i18n"' package.json; then
      framework="vue-i18n"
    elif grep -q '"react-intl"' package.json; then
      framework="react-intl"
    elif grep -q '"i18next"' package.json; then
      framework="i18next"
    elif grep -q '"@dcloudio/uni-i18n"' package.json; then
      framework="uni-i18n"
    fi
  fi

  # 查找语言包文件
  for dir in "${locales_dirs[@]}"; do
    if [[ -d "$dir" ]]; then
      while IFS= read -r -d '' file; do
        locale_files+=("$file")
      done < <(find "$dir" -type f \( -name "*.json" -o -name "*.yaml" -o -name "*.yml" -o -name "*.js" -o -name "*.ts" \) -print0 2>/dev/null)
    fi
  done

  echo "framework:$framework"
  echo "locales_count:${#locale_files[@]}"
  for f in "${locale_files[@]}"; do
    echo "locale_file:$f"
  done
}

# 扫描硬编码文案
scan_hardcoded() {
  echo ""
  echo "📋 硬编码文案扫描"

  local pattern='["'\''`]([一-鿿]+[^"'\''`]*|[a-zA-Z][a-zA-Z\s]{2,}[^"'\''`]*)["'\''`]'
  local files=()

  # 收集源码文件
  while IFS= read -r line; do
    [[ -n "$line" ]] && files+=("$line")
  done < <(find . -type f \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.vue" \) \
    ! -path "*/node_modules/*" ! -path "*/dist/*" 2>/dev/null)

  for file in "${files[@]}"; do
    # 跳过测试文件和配置文件
    [[ "$file" == *".test."* || "$file" == *".spec."* || "$file" == *".config."* ]] && continue

    local line_num=0
    while IFS= read -r line; do
      line_num=$((line_num + 1))

      # 跳过注释行
      [[ "$line" =~ ^\s*// || "$line" =~ ^\s*\* || "$line" =~ ^\s*/\* ]] && continue

      # 检测中文文案
      if echo "$line" | grep -qE '[一-鿿]'; then
        # 排除 console、URL、正则、文件路径等
        if ! echo "$line" | grep -qE 'console\.(log|warn|error|debug)|http[s]?:|\.test\(|\.match\(|\.replace\(|import\s|from\s|require\(|__dirname|path\.|\.css|\.scss|\.less|\.json'; then
          echo "  ❌ [$file:$line_num] 硬编码中文: $(echo "$line" | sed 's/^\s*//' | head -c 80)"
          HARDCODE_COUNT=$((HARDCODE_COUNT + 1))
        fi
      fi

      # 检测英文文案（简单 UI 文案，排除代码关键字）
      if echo "$line" | grep -qE '"[A-Z][a-zA-Z\s]{3,}[!?.]?"|\"[A-Z][a-zA-Z\s]{3,}[!?.]?\"|\`[A-Z][a-zA-Z\s]{3,}[!?.]?\`'; then
        if ! echo "$line" | grep -qE 'console\.|throw\s|Error\(|new\s|typeof\s|instanceof\s|return\s|import\s|from\s|export\s|class\s|function\s|const\s|let\s|var\s|if\s|else\s|for\s|while\s|switch\s|case\s|default\s|break\s|continue\s|try\s|catch\s|finally\s|async\s|await\s|yield\s'; then
          # 进一步过滤：检查是否包含明显 UI 关键词
          if echo "$line" | grep -qiE 'please|enter|input|select|confirm|cancel|submit|save|delete|edit|add|search|loading|success|error|warning|tip|hint|message|title|content|description|label|placeholder|button|click|tap'; then
            echo "  ⚠️ [$file:$line_num] 硬编码英文 UI 文案: $(echo "$line" | sed 's/^\s*//' | head -c 80)"
            HARDCODE_COUNT=$((HARDCODE_COUNT + 1))
          fi
        fi
      fi
    done < "$file"
  done

  if [[ $HARDCODE_COUNT -eq 0 ]]; then
    echo "  ✅ 未发现硬编码文案"
  else
    echo "  共发现 $HARDCODE_COUNT 处硬编码文案"
  fi
}

# 检测语言包缺失 key
check_missing_keys() {
  echo ""
  echo "📋 语言包缺失 key 检测"

  local locale_files=()
  while IFS= read -r line; do
    if [[ "$line" == locale_file:* ]]; then
      locale_files+=("${line#locale_file:}")
    fi
  done < <(detect_i18n_setup)

  if [[ ${#locale_files[@]} -lt 2 ]]; then
    echo "  ⚠️ 语言包文件不足 2 个，跳过缺失检测"
    return
  fi

  # 简单 JSON key 对比（仅支持扁平 JSON）
  local first_file="${locale_files[0]}"
  if [[ "$first_file" == *.json ]]; then
    for other_file in "${locale_files[@]:1}"; do
      [[ "$other_file" == *.json ]] || continue

      # 提取 key 列表
      local keys1 keys2
      keys1=$(grep -oE '"[^"]+":' "$first_file" | sed 's/"//g;s/://' | sort -u)
      keys2=$(grep -oE '"[^"]+":' "$other_file" | sed 's/"//g;s/://' | sort -u)

      # 找出差异
      local missing
      missing=$(comm -23 <(echo "$keys1") <(echo "$keys2"))
      if [[ -n "$missing" ]]; then
        echo "  ❌ $(basename "$other_file") 缺失以下 key:"
        echo "$missing" | sed 's/^/    - /'
        MISSING_COUNT=$((MISSING_COUNT + $(echo "$missing" | wc -l)))
      fi
    done
  fi

  if [[ $MISSING_COUNT -eq 0 ]]; then
    echo "  ✅ 未发现缺失 key"
  else
    echo "  共发现 $MISSING_COUNT 个缺失 key"
  fi
}

# 检测死 key
check_dead_keys() {
  echo ""
  echo "📋 死 key 检测"

  # 查找语言包中的 key
  local locale_keys=()
  while IFS= read -r line; do
    if [[ "$line" == locale_file:* ]]; then
      local file="${line#locale_file:}"
      if [[ "$file" == *.json ]]; then
        while IFS= read -r key; do
          locale_keys+=("$key")
        done < <(grep -oE '"[^"]+":' "$file" | sed 's/"//g;s/://')
      fi
    fi
  done < <(detect_i18n_setup)

  if [[ ${#locale_keys[@]} -eq 0 ]]; then
    echo "  ⚠️ 未找到语言包 key，跳过死 key 检测"
    return
  fi

  # 扫描源码引用
  for key in "${locale_keys[@]}"; do
    # 排除常见的通用 key
    [[ "$key" == "*" ]] && continue

    local found=false
    # 检查 t('key') / $t('key') / intl.formatMessage({ id: 'key' }) 等形式
    if grep -rE "['\"\`]$key['\"\`]" --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" --include="*.vue" . 2>/dev/null | grep -qE "\bt\(|\$t\(|formatMessage|i18n\.|getI18n"; then
      found=true
    fi

    if ! $found; then
      # 简单检查：key 是否在源码中被字符串引用
      if ! grep -rE "['\"\`]$key['\"\`]" --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" --include="*.vue" . 2>/dev/null | grep -qv "node_modules"; then
        echo "  ⚠️ 死 key: $key"
        DEAD_COUNT=$((DEAD_COUNT + 1))
      fi
    fi
  done

  if [[ $DEAD_COUNT -eq 0 ]]; then
    echo "  ✅ 未发现死 key"
  else
    echo "  共发现 $DEAD_COUNT 个死 key"
  fi
}

# 命名规范检查
check_naming() {
  echo ""
  echo "📋 key 命名规范检查"

  local locale_files=()
  while IFS= read -r line; do
    if [[ "$line" == locale_file:* ]]; then
      locale_files+=("${line#locale_file:}")
    fi
  done < <(detect_i18n_setup)

  local key_pattern='^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$'

  for file in "${locale_files[@]}"; do
    [[ "$file" == *.json ]] || continue

    local keys
    keys=$(grep -oE '"[^"]+":' "$file" | sed 's/"//g;s/://')

    for key in $keys; do
      # 检查是否符合 module.page.element 规范
      if ! echo "$key" | grep -qE '^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$'; then
        # 排除单层级通用 key
        if echo "$key" | grep -qE '\.'; then
          if echo "$key" | grep -qE '[A-Z]'; then
            echo "  ⚠️ [$file] key 包含大写字母: $key"
            NAMING_COUNT=$((NAMING_COUNT + 1))
          fi
        elif [[ ${#key} -lt 3 ]]; then
          echo "  ⚠️ [$file] key 过短，语义不明: $key"
          NAMING_COUNT=$((NAMING_COUNT + 1))
        fi
      fi

      # 检查驼峰命名（应使用小写+点号）
      if echo "$key" | grep -qE '^[a-z]+[A-Z]'; then
        if ! echo "$key" | grep -qE '\.'; then
          echo "  ⚠️ [$file] key 使用驼峰命名，建议改为点号分隔: $key"
          NAMING_COUNT=$((NAMING_COUNT + 1))
        fi
      fi
    done
  done

  if [[ $NAMING_COUNT -eq 0 ]]; then
    echo "  ✅ key 命名规范通过"
  else
    echo "  共发现 $NAMING_COUNT 个命名问题"
  fi
}

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
main() {
  # 检测 i18n 配置
  local setup
  setup=$(detect_i18n_setup)
  local framework=$(echo "$setup" | grep '^framework:' | cut -d: -f2)
  local locales_count=$(echo "$setup" | grep '^locales_count:' | cut -d: -f2)

  if [[ -z "$framework" && "$locales_count" == "0" ]]; then
    echo "⚠️ 未检测到 i18n 配置，跳过 i18n 扫描"
    exit 0
  fi

  echo "🌍 i18n 治理扫描"
  echo "   框架: ${framework:-未识别}"
  echo "   语言包: $locales_count 个文件"

  scan_hardcoded
  check_missing_keys
  check_dead_keys
  check_naming

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 i18n 扫描结果"
  echo "   ❌ 硬编码文案: $HARDCODE_COUNT"
  echo "   ❌ 缺失 key: $MISSING_COUNT"
  echo "   ⚠️  死 key: $DEAD_COUNT"
  echo "   ⚠️  命名问题: $NAMING_COUNT"
}

main "$@"
