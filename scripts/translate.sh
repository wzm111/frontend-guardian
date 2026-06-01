#!/usr/bin/env bash
#
# translate.sh — 自动翻译缺失语言包
# Usage: translate.sh [project_path] [options]
# Options:
#   --provider <p>  翻译提供商: openai|deepl|aliyun|baidu|google|mock (默认 mock)
#   --target <lang> 目标语言（默认 en-US）
#   --source <lang> 源语言（默认 zh-CN）
#   --dry-run       预览模式
#
# 环境变量:
#   OPENAI_API_KEY, DEEPL_API_KEY, ALIYUN_ACCESS_KEY, BAIDU_APP_ID, GOOGLE_API_KEY

set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
cd "$PROJECT_DIR"

# 颜色
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# 选项
PROVIDER="mock"
SOURCE_LOCALE="zh-CN"
TARGET_LOCALE="en-US"
DRY_RUN=false

# 统计
declare -i TRANSLATED_COUNT=0
declare -i FAILED_COUNT=0
declare -i SKIPPED_COUNT=0

# 缓存目录
CACHE_DIR=".frontend-guardian-cache"

# 解析参数
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider)   PROVIDER="$2"; shift 2 ;;
    --target)     TARGET_LOCALE="$2"; shift 2 ;;
    --source)     SOURCE_LOCALE="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=true; shift ;;
    *) shift ;;
  esac
done

# 加载配置
load_config() {
  local config_file=".frontend-guardian.yml"
  if [[ -f "$config_file" ]]; then
    # 简单解析 YAML
    local cfg_provider
    cfg_provider=$(grep -E '^\s*translateProvider:' "$config_file" 2>/dev/null | sed 's/.*:\s*//' | tr -d ' "')
    [[ -n "$cfg_provider" && "$PROVIDER" == "mock" ]] && PROVIDER="$cfg_provider"

    local cfg_target
    cfg_target=$(grep -A 5 '^\s*targetLocales:' "$config_file" 2>/dev/null | tail -n +2 | sed 's/.*-\s*//' | head -1 | tr -d ' "')
    [[ -n "$cfg_target" && "$TARGET_LOCALE" == "en-US" ]] && TARGET_LOCALE="$cfg_target"
  fi
}

# 检测语言包目录
detect_locale_dir() {
  local dirs=("locales" "i18n" "lang" "src/locales" "src/i18n" "language")
  for d in "${dirs[@]}"; do
    if [[ -d "$d" ]]; then
      echo "$d"
      return
    fi
  done
  echo "locales"
}

# 翻译函数
translate_text() {
  local text="$1"
  local source_lang="$2"
  local target_lang="$3"

  case "$PROVIDER" in
    openai)
      translate_openai "$text" "$source_lang" "$target_lang"
      ;;
    deepl)
      translate_deepl "$text" "$source_lang" "$target_lang"
      ;;
    aliyun)
      translate_aliyun "$text" "$source_lang" "$target_lang"
      ;;
    baidu)
      translate_baidu "$text" "$source_lang" "$target_lang"
      ;;
    google)
      translate_google "$text" "$source_lang" "$target_lang"
      ;;
    mock|*)
      echo "[Translated: $text]"
      ;;
  esac
}

# OpenAI 翻译
translate_openai() {
  local text="$1"
  local target_lang="$3"

  local api_key="${OPENAI_API_KEY:-}"
  if [[ -z "$api_key" ]]; then
    echo ""
    return 1
  fi

  local prompt="Translate the following text to $target_lang. Only return the translation, no explanations:\n$text"
  local response
  response=$(curl -s -m 30 https://api.openai.com/v1/chat/completions \
    -H "Authorization: Bearer $api_key" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"gpt-4o-mini\",
      \"messages\": [{\"role\": \"user\", \"content\": \"$prompt\"}],
      \"temperature\": 0.3,
      \"max_tokens\": 500
    }" 2>/dev/null)

  echo "$response" | grep -oE '"content":\s*"[^"]+"' | head -1 | sed 's/"content":\s*"//;s/"$//' || echo ""
}

# DeepL 翻译
translate_deepl() {
  local text="$1"
  local target_lang="$3"

  local api_key="${DEEPL_API_KEY:-}"
  if [[ -z "$api_key" ]]; then
    echo ""
    return 1
  fi

  curl -s -m 30 https://api-free.deepl.com/v2/translate \
    -d "auth_key=$api_key" \
    -d "text=$text" \
    -d "target_lang=${target_lang^^}" 2>/dev/null | \
    grep -oE '"text":"[^"]+"' | head -1 | sed 's/"text":"//;s/"$//'
}

# 阿里云翻译
translate_aliyun() {
  local text="$1"
  # 简化版：需要实现阿里云签名
  echo ""
  return 1
}

# 百度翻译
translate_baidu() {
  local text="$1"
  # 简化版：需要实现百度签名
  echo ""
  return 1
}

# Google 翻译
translate_google() {
  local text="$1"
  local target_lang="$3"

  local api_key="${GOOGLE_API_KEY:-}"
  if [[ -z "$api_key" ]]; then
    echo ""
    return 1
  fi

  curl -s -m 30 "https://translation.googleapis.com/language/translate/v2?key=$api_key" \
    -H "Content-Type: application/json" \
    -d "{\"q\":\"$text\",\"target\":\"$target_lang\"}" 2>/dev/null | \
    grep -oE '"translatedText":\s*"[^"]+"' | head -1 | sed 's/"translatedText":\s*"//;s/"$//'
}

# 读取 JSON 语言包的 keys
read_locale_keys() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo ""
    return
  fi
  if command -v jq &>/dev/null; then
    jq -r 'keys[]' "$file" 2>/dev/null
  else
    grep -oE '"[^"]+":' "$file" | sed 's/"//g;s/://' | sort -u
  fi
}

# 读取 key 的值
read_locale_value() {
  local file="$1"
  local key="$2"
  if command -v jq &>/dev/null; then
    jq -r ".[\"$key\"] // empty" "$file" 2>/dev/null
  else
    grep -oE "\"$key\":\s*\"[^\"]+\"" "$file" | sed -E 's/"[^"]+":\s*"//;s/"$//'
  fi
}

# 追加 key 到 JSON 文件
append_json_key() {
  local file="$1"
  local key="$2"
  local value="$3"

  if [[ ! -f "$file" ]]; then
    echo "{\"$key\": \"$value\"}" > "$file"
    return
  fi

  if command -v jq &>/dev/null; then
    local tmp=$(mktemp)
    jq --arg k "$key" --arg v "$value" '. + {($k): $v}' "$file" > "$tmp" 2>/dev/null && mv "$tmp" "$file"
  else
    # 简单追加
    sed -i.bak "s/}$/,\"$key\":\"$value\"}/" "$file" 2>/dev/null || echo ",\"$key\":\"$value\"}" >> "$file"
    rm -f "$file.bak"
  fi
}

# 主流程
main() {
  echo ""
  echo "🌐 自动翻译语言包"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  load_config

  local locale_dir
  locale_dir=$(detect_locale_dir)

  local source_file="$locale_dir/$SOURCE_LOCALE.json"
  local target_file="$locale_dir/$TARGET_LOCALE.json"

  echo "   翻译提供商: ${PROVIDER}"
  echo "   源语言: ${SOURCE_LOCALE} (${source_file})"
  echo "   目标语言: ${TARGET_LOCALE} (${target_file})"
  if $DRY_RUN; then
    echo "   模式: ${YELLOW}预览模式${NC}"
  fi
  echo ""

  # 检查源文件
  if [[ ! -f "$source_file" ]]; then
    echo "${RED}❌ 源语言包不存在: $source_file${NC}"
    echo "   请先运行 extract-i18n.sh 提取文案"
    exit 1
  fi

  # 读取源文件和目标文件的 keys
  local source_keys target_keys
  source_keys=$(read_locale_keys "$source_file")
  if [[ -f "$target_file" ]]; then
    target_keys=$(read_locale_keys "$target_file")
  fi

  # 找出缺失的 key
  local missing_keys=()
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    if ! echo "$target_keys" | grep -qx "$key" 2>/dev/null; then
      missing_keys+=("$key")
    fi
  done <<< "$source_keys"

  local missing_count=${#missing_keys[@]}

  if [[ $missing_count -eq 0 ]]; then
    echo "  ✅ 目标语言包已完整，无需翻译"
    exit 0
  fi

  echo "   发现 ${missing_count} 个缺失 key，开始翻译..."
  echo ""

  # 创建目标文件（如果不存在）
  if [[ ! -f "$target_file" ]]; then
    echo "{}" > "$target_file"
  fi

  # 创建缓存目录
  mkdir -p "$CACHE_DIR"

  # 逐条翻译
  local key source_text translated_text
  for key in "${missing_keys[@]}"; do
    source_text=$(read_locale_value "$source_file" "$key")

    if [[ -z "$source_text" ]]; then
      SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
      continue
    fi

    # 检查缓存
    local cache_key
    cache_key=$(echo "${PROVIDER}_${source_text}_${TARGET_LOCALE}" | md5)
    local cache_file="$CACHE_DIR/${cache_key}.txt"

    if [[ -f "$cache_file" && ! "$DRY_RUN" ]]; then
      translated_text=$(cat "$cache_file")
      echo "   💾 [$key] (缓存) $source_text → $translated_text"
    else
      echo -n "   🔄 [$key] $source_text → "

      if $DRY_RUN; then
        translated_text="[DRY-RUN: $source_text -> $TARGET_LOCALE]"
        echo "$translated_text"
      else
        translated_text=$(translate_text "$source_text" "$SOURCE_LOCALE" "$TARGET_LOCALE")
        if [[ -n "$translated_text" ]]; then
          echo "$translated_text"
          echo "$translated_text" > "$cache_file"
        else
          echo "${RED}失败${NC}"
          FAILED_COUNT=$((FAILED_COUNT + 1))
          continue
        fi
      fi
    fi

    # 写入目标文件
    if ! $DRY_RUN; then
      append_json_key "$target_file" "$key" "$translated_text"
    fi

    TRANSLATED_COUNT=$((TRANSLATED_COUNT + 1))

    # 简单限流：避免 API 过快调用
    if [[ "$PROVIDER" != "mock" ]]; then
      sleep 0.5
    fi
  done

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 翻译报告"
  echo "   翻译成功: $TRANSLATED_COUNT"
  echo "   翻译失败: $FAILED_COUNT"
  echo "   跳过: $SKIPPED_COUNT"
  echo "   目标文件: $target_file"
  if $DRY_RUN; then
    echo ""
    echo "${YELLOW}⚠️  预览模式：未实际修改文件${NC}"
  fi
  echo ""

  if [[ $FAILED_COUNT -gt 0 ]]; then
    echo "${YELLOW}💡 提示：翻译失败可能是 API Key 未配置${NC}"
    echo "   OpenAI: export OPENAI_API_KEY='sk-...'"
    echo "   DeepL: export DEEPL_API_KEY='...'"
    echo "   使用 --provider mock 进行测试"
  fi
}

main "$@"
