#!/usr/bin/env bash
#
# scan-hooks.sh — React Hooks / Vue Composables 最佳实践扫描
# Usage: scan-hooks.sh [project_path]
#
# 检测项：
#   1. useEffect 依赖数组
#   2. 闭包陷阱
#   3. 自定义 Hook 命名
#   4. Vue Composables 响应式
#   5. 状态提升建议

set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
cd "$PROJECT_DIR"

# 统计
declare -i EFFECT_COUNT=0
declare -i CLOSURE_COUNT=0
declare -i CUSTOM_HOOK_COUNT=0
declare -i COMPOSABLE_COUNT=0
declare -i STATE_COUNT=0

# 检测框架
detect_framework() {
  if [[ -f "package.json" ]]; then
    if grep -q '"react"' package.json; then
      echo "react"
    elif grep -q '"vue"' package.json; then
      echo "vue"
    fi
  fi
}

# 扫描 React Hooks
scan_react_hooks() {
  echo ""
  echo "📋 React Hooks 检查"

  local files=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && files+=("$line")
  done < <(find . -type f \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \) \
    ! -path "*/node_modules/*" ! -path "*/dist/*" 2>/dev/null)

  for file in "${files[@]}"; do
    local content
    content=$(cat "$file")
    local line_num=0

    # 检查 useEffect 依赖
    while IFS= read -r line; do
      line_num=$((line_num + 1))

      if echo "$line" | grep -qE 'useEffect\s*\('; then
        # 读取 useEffect 完整内容（简化检测）
        local effect_block
        effect_block=$(sed -n "${line_num},+30p" "$file" 2>/dev/null || echo "")

        # 检查是否有依赖数组
        if echo "$effect_block" | head -5 | grep -qE '\[.*\]'; then
          # 提取依赖数组内容
          local deps
          deps=$(echo "$effect_block" | grep -oE '\[[^\]]*\]' | head -1 | tr -d '[]' | tr ',' '\n' | sed 's/^\s*//;s/\s*$//' | grep -v '^$')

          # 检查依赖数量
          local dep_count
          dep_count=$(echo "$deps" | wc -l | tr -d ' ')
          if [[ $dep_count -gt 5 ]]; then
            echo "  ⚠️ [$file:$line_num] useEffect 依赖过多 ($dep_count > 5)，建议拆分"
            EFFECT_COUNT=$((EFFECT_COUNT + 1))
          fi

          # 检查 effect 中使用的变量是否在依赖中
          # 简化：检查常见的响应式变量引用
          local effect_body
          effect_body=$(echo "$effect_block" | sed -n '2,20p')
          local vars_in_effect
          vars_in_effect=$(echo "$effect_body" | grep -oE '\b[a-zA-Z_][a-zA-Z0-9_]*\b' | sort -u)

          # 常见需要添加的依赖
          for var in $vars_in_effect; do
            case "$var" in
              state|setState|props|data|count|value|item|index|id|name|isOpen|isVisible|isLoading|error|result|response|data)
                if ! echo "$deps" | grep -qx "$var"; then
                  # 变量在 effect 中使用但不在依赖数组中
                  if echo "$effect_body" | grep -qE "\b$var\b"; then
                    # 排除已在 deps 中的
                    if ! echo "$deps" | grep -qE "^$var$"; then
                      echo "  ❌ [$file:$line_num] useEffect 可能缺少依赖: '$var'"
                      EFFECT_COUNT=$((EFFECT_COUNT + 1))
                    fi
                  fi
                fi
                ;;
            esac
          done
        else
          # 没有依赖数组（或空的 []）
          if echo "$effect_block" | head -3 | grep -qE '\[\s*\]'; then
            # 空依赖数组，检查是否有状态引用
            local effect_body
            effect_body=$(echo "$effect_block" | sed -n '2,10p')
            if echo "$effect_body" | grep -qE '\bstate\b|\bprops\.\b|\buseState\b'; then
              echo "  ❌ [$file:$line_num] useEffect 空依赖数组但引用了状态，存在闭包陷阱"
              EFFECT_COUNT=$((EFFECT_COUNT + 1))
            fi
          else
            echo "  ❌ [$file:$line_num] useEffect 缺少依赖数组"
            EFFECT_COUNT=$((EFFECT_COUNT + 1))
          fi
        fi
      fi

      # 检查自定义 Hook 命名
      if echo "$line" | grep -qE 'function\s+use[A-Z]'; then
        # 正确的自定义 Hook 命名
        :
      elif echo "$line" | grep -qE 'function\s+(?!use)[a-zA-Z]+\s*\(' && echo "$line" | grep -qE 'useState|useEffect|useCallback|useMemo'; then
        # 如果函数内部使用了 hooks 但命名不以 use 开头
        if ! echo "$line" | grep -qE 'function\s+use'; then
          local func_name
          func_name=$(echo "$line" | grep -oE 'function\s+[a-zA-Z_][a-zA-Z0-9_]*' | sed 's/function\s*//')
          if [[ -n "$func_name" && ! "$func_name" =~ ^use ]]; then
            # 进一步确认：函数内部是否使用了 hooks
            local func_block
            func_block=$(sed -n "${line_num},+30p" "$file" 2>/dev/null || echo "")
            if echo "$func_block" | grep -qE '\buse[A-Z]'; then
              echo "  ⚠️ [$file:$line_num] 函数 '$func_name' 内部使用了 Hooks，建议以 'use' 开头命名"
              CUSTOM_HOOK_COUNT=$((CUSTOM_HOOK_COUNT + 1))
            fi
          fi
        fi
      fi

      # 检查 setInterval / setTimeout 未清理
      if echo "$line" | grep -qE 'setInterval|setTimeout'; then
        local func_block
        func_block=$(sed -n "${line_num},+50p" "$file" 2>/dev/null || echo "")
        if ! echo "$func_block" | grep -qE 'clearInterval|clearTimeout|return.*\(\)'; then
          # 检查是否在 useEffect 中
          if echo "$func_block" | head -20 | grep -qE 'useEffect'; then
            echo "  ❌ [$file:$line_num] setInterval/setTimeout 在 useEffect 中但缺少 cleanup"
            CLOSURE_COUNT=$((CLOSURE_COUNT + 1))
          fi
        fi
      fi

    done < "$file"
  done

  if [[ $EFFECT_COUNT -eq 0 && $CLOSURE_COUNT -eq 0 && $CUSTOM_HOOK_COUNT -eq 0 ]]; then
    echo "  ✅ React Hooks 检查通过"
  else
    echo "  useEffect 问题: $EFFECT_COUNT, 闭包陷阱: $CLOSURE_COUNT, Hook 命名: $CUSTOM_HOOK_COUNT"
  fi
}

# 扫描 Vue Composables
scan_vue_composables() {
  echo ""
  echo "📋 Vue Composables 检查"

  local files=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && files+=("$line")
  done < <(find . -type f \( -name "*.js" -o -name "*.ts" -o -name "*.vue" \) \
    ! -path "*/node_modules/*" ! -path "*/dist/*" 2>/dev/null)

  for file in "${files[@]}"; do
    local content
    content=$(cat "$file")

    # 检查 reactive 解构
    if echo "$content" | grep -qE 'const\s+\{[^}]+\}\s*=\s*reactive\s*\('; then
      echo "  ❌ [$file] reactive 对象被解构，会丢失响应式"
      echo "     建议: 使用 toRefs() 或直接用 state.xxx"
      COMPOSABLE_COUNT=$((COMPOSABLE_COUNT + 1))
    fi

    # 检查 computed 副作用
    local line_num=0
    while IFS= read -r line; do
      line_num=$((line_num + 1))
      if echo "$line" | grep -qE 'computed\s*\('; then
        local comp_block
        comp_block=$(sed -n "${line_num},+15p" "$file" 2>/dev/null || echo "")
        if echo "$comp_block" | grep -qE '=\s*[^=]|\+\+|--|\+=|-=|\*='; then
          if echo "$comp_block" | grep -qE 'ref\s*\(|reactive\s*\('; then
            echo "  ❌ [$file:$line_num] computed 中不应修改其他响应式数据"
            COMPOSABLE_COUNT=$((COMPOSABLE_COUNT + 1))
          fi
        fi
      fi

      # 检查 watch immediate
      if echo "$line" | grep -qE 'watch\s*\('; then
        local watch_block
        watch_block=$(sed -n "${line_num},+10p" "$file" 2>/dev/null || echo "")
        if echo "$watch_block" | grep -qE 'immediate:\s*true'; then
          if echo "$watch_block" | grep -qE 'async|await|Promise'; then
            echo "  ⚠️ [$file:$line_num] watch with immediate: true 中使用了异步，可能触发时机不对"
            COMPOSABLE_COUNT=$((COMPOSABLE_COUNT + 1))
          fi
        fi
      fi

      # 检查 provide/inject 类型
      if echo "$line" | grep -qE 'inject\s*\('; then
        if ! echo "$line" | grep -qE 'default|DefaultValue|provide'; then
          local inject_line
          inject_line=$(echo "$line" | sed -n '1p')
          if ! echo "$inject_line" | grep -qE '\)\s*\|\||\)\s*\?\?'; then
            echo "  ⚠️ [$file:$line_num] inject 缺少默认值或类型断言"
            COMPOSABLE_COUNT=$((COMPOSABLE_COUNT + 1))
          fi
        fi
      fi
    done < "$file"
  done

  if [[ $COMPOSABLE_COUNT -eq 0 ]]; then
    echo "  ✅ Vue Composables 检查通过"
  else
    echo "  共发现 $COMPOSABLE_COUNT 个问题"
  fi
}

# 状态提升建议
scan_state_lifting() {
  echo ""
  echo "📋 状态提升分析"

  local files=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && files+=("$line")
  done < <(find . -type f \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.vue" \) \
    ! -path "*/node_modules/*" ! -path "*/dist/*" 2>/dev/null)

  for file in "${files[@]}"; do
    local content
    content=$(cat "$file")

    # 检测 useState 调用数量（React）
    local state_count
    state_count=$(echo "$content" | grep -cE '\buseState\s*\(' || echo 0)
    if [[ $state_count -gt 5 ]]; then
      echo "  💡 [$file] 组件使用了 $state_count 个 useState，建议考虑状态合并或提升到父组件"
      STATE_COUNT=$((STATE_COUNT + 1))
    fi

    # 检测 ref 调用数量（Vue）
    local ref_count
    ref_count=$(echo "$content" | grep -cE '\bref\s*\(' || echo 0)
    if [[ $ref_count -gt 8 ]]; then
      echo "  💡 [$file] 组件使用了 $ref_count 个 ref，建议考虑使用 reactive 合并状态"
      STATE_COUNT=$((STATE_COUNT + 1))
    fi
  done

  if [[ $STATE_COUNT -eq 0 ]]; then
    echo "  ✅ 状态分布合理"
  else
    echo "  共发现 $STATE_COUNT 个状态优化建议"
  fi
}

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
main() {
  local framework
  framework=$(detect_framework)

  echo "⚡ Hooks / Composables 扫描"
  echo "   框架: ${framework:-未识别}"

  case "$framework" in
    react)
      scan_react_hooks
      scan_state_lifting
      ;;
    vue)
      scan_vue_composables
      scan_state_lifting
      ;;
    *)
      echo "   ⚠️ 未识别前端框架，尝试通用扫描..."
      scan_react_hooks
      scan_vue_composables
      scan_state_lifting
      ;;
  esac

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 Hooks 扫描结果"
  echo "   ❌ useEffect 问题: $EFFECT_COUNT"
  echo "   ❌ 闭包陷阱: $CLOSURE_COUNT"
  echo "   ⚠️  Hook 命名: $CUSTOM_HOOK_COUNT"
  echo "   ❌ Composables: $COMPOSABLE_COUNT"
  echo "   💡 状态建议: $STATE_COUNT"
}

main "$@"
