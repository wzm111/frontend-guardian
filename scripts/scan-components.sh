#!/usr/bin/env bash
#
# scan-components.sh — 组件库使用规范扫描
# Usage: scan-components.sh [project_path]
#
# 检测项：
#   1. 组件反模式使用
#   2. 主题/token 一致性
#   3. 可访问性
#   4. 性能陷阱

set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
cd "$PROJECT_DIR"

# 统计
declare -i ANTI_PATTERN_COUNT=0
declare -i TOKEN_COUNT=0
declare -i A11Y_COUNT=0
declare -i PERF_COUNT=0

# 检测组件库
detect_component_lib() {
  local lib=""
  if [[ -f "package.json" ]]; then
    if grep -q '"antd"' package.json || grep -q '"@ant-design"' package.json; then
      lib="antd"
    elif grep -q '"element-plus"' package.json; then
      lib="element-plus"
    elif grep -q '"@mui/material"' package.json || grep -q '"@mui/joy"' package.json; then
      lib="mui"
    elif grep -q '"vuetify"' package.json; then
      lib="vuetify"
    elif grep -q '"@nutui/nutui-react"' package.json || grep -q '"@nutui/nutui"' package.json; then
      lib="nutui"
    elif grep -q '"tdesign-react"' package.json || grep -q '"tdesign-vue-next"' package.json; then
      lib="tdesign"
    fi
  fi
  echo "$lib"
}

# 扫描反模式
scan_anti_patterns() {
  echo ""
  echo "📋 组件反模式检测"

  local lib="$1"
  local files=()

  while IFS= read -r line; do
    [[ -n "$line" ]] && files+=("$line")
  done < <(find . -type f \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.vue" \) \
    ! -path "*/node_modules/*" ! -path "*/dist/*" 2>/dev/null)

  for file in "${files[@]}"; do
    local line_num=0
    while IFS= read -r line; do
      line_num=$((line_num + 1))

      # 跳过注释
      [[ "$line" =~ ^\s*// || "$line" =~ ^\s*\* ]] && continue

      case "$lib" in
        antd)
          # Form.Item 缺少 name
          if echo "$line" | grep -qE 'Form\.Item|form-item|FormItem'; then
            if ! echo "$line" | grep -qE 'name=|name\s*='; then
              if ! echo "$line" | grep -qE 'noStyle|colon=.*false'; then
                echo "  ❌ [$file:$line_num] Ant Design Form.Item 缺少 name 属性"
                ANTI_PATTERN_COUNT=$((ANTI_PATTERN_COUNT + 1))
              fi
            fi
          fi
          # Table 缺少 rowKey
          if echo "$line" | grep -qE 'Table\b|table\b'; then
            if ! echo "$line" | grep -qE 'rowKey=|row-key=|rowkey='; then
              # 检查是否在组件配置中
              local next_lines=""
              next_lines=$(sed -n "$((line_num)),$((line_num + 5))p" "$file" 2>/dev/null || echo "")
              if ! echo "$next_lines" | grep -qE 'rowKey=|row-key=|rowkey='; then
                echo "  ❌ [$file:$line_num] Table 缺少 rowKey 属性"
                ANTI_PATTERN_COUNT=$((ANTI_PATTERN_COUNT + 1))
              fi
            fi
          fi
          # Modal 缺少 destroyOnClose
          if echo "$line" | grep -qE 'Modal\b|Drawer\b'; then
            if ! echo "$line" | grep -qE 'destroyOnClose|destroy-on-close'; then
              echo "  ⚠️ [$file:$line_num] Modal/Drawer 建议添加 destroyOnClose"
              ANTI_PATTERN_COUNT=$((ANTI_PATTERN_COUNT + 1))
            fi
          fi
          # Select 大数据
          if echo "$line" | grep -qE 'Select\b'; then
            local ctx
            ctx=$(sed -n "$((line_num)),$((line_num + 10))p" "$file" 2>/dev/null || echo "")
            # 简单检测：如果附近有 options/map 且数量可能很大
            if echo "$ctx" | grep -qE '\.map\(|options=.*\['; then
              if ! echo "$ctx" | grep -qE 'virtual|showSearch|filterOption|mode=.*multiple'; then
                echo "  ⚠️ [$file:$line_num] Select 数据量可能较大，建议添加 virtual/showSearch"
                ANTI_PATTERN_COUNT=$((ANTI_PATTERN_COUNT + 1))
              fi
            fi
          fi
          ;;
        element-plus)
          # ElTable 缺少 row-key
          if echo "$line" | grep -qE 'ElTable|el-table'; then
            if ! echo "$line" | grep -qE 'row-key=|rowKey=|rowkey='; then
              echo "  ❌ [$file:$line_num] ElTable 缺少 row-key 属性"
              ANTI_PATTERN_COUNT=$((ANTI_PATTERN_COUNT + 1))
            fi
          fi
          # ElForm rules 未绑定
          if echo "$line" | grep -qE 'ElForm|el-form'; then
            local ctx
            ctx=$(sed -n "$((line_num)),$((line_num + 20))p" "$file" 2>/dev/null || echo "")
            if echo "$ctx" | grep -qE 'rules='; then
              if ! echo "$ctx" | grep -qE 'prop='; then
                echo "  ⚠️ [$file:$line_num] ElForm 有 rules 但缺少 prop 绑定"
                ANTI_PATTERN_COUNT=$((ANTI_PATTERN_COUNT + 1))
              fi
            fi
          fi
          ;;
        mui)
          # Material UI 常见反模式
          if echo "$line" | grep -qE 'TextField|textfield'; then
            if ! echo "$line" | grep -qE 'label=|variant='; then
              echo "  ⚠️ [$file:$line_num] TextField 建议添加 label 和 variant"
              ANTI_PATTERN_COUNT=$((ANTI_PATTERN_COUNT + 1))
            fi
          fi
          ;;
      esac

      # 通用检查（不分组件库）
      # 图片缺少 alt
      if echo "$line" | grep -qE 'img\s|Image\s|image\s'; then
        if ! echo "$line" | grep -qE 'alt=|alt\s*='; then
          if ! echo "$line" | grep -qE 'role=.*presentation|aria-hidden'; then
            echo "  ❌ [$file:$line_num] 图片缺少 alt 属性"
            A11Y_COUNT=$((A11Y_COUNT + 1))
          fi
        fi
      fi

      # 按钮只有 icon 无 aria-label
      if echo "$line" | grep -qE 'Button|button'; then
        if echo "$line" | grep -qE 'icon=|Icon' && ! echo "$line" | grep -qE 'aria-label=|ariaLabel=|title='; then
          echo "  ❌ [$file:$line_num] Icon 按钮缺少 aria-label"
          A11Y_COUNT=$((A11Y_COUNT + 1))
        fi
      fi

      # 硬编码颜色
      if echo "$line" | grep -qE '#[0-9a-fA-F]{3,6}|rgb\(|rgba\(|hsl\('; then
        if echo "$line" | grep -qE 'color|background|bg|border'; then
          if ! echo "$line" | grep -qE 'theme|token|var\(|Token|Color'; then
            # 排除 CSS 变量和已知常量
            if ! echo "$line" | grep -qE '\-\-'; then
              echo "  ⚠️ [$file:$line_num] 硬编码颜色值，建议使用主题 token"
              TOKEN_COUNT=$((TOKEN_COUNT + 1))
            fi
          fi
        fi
      fi

      # 硬编码间距
      if echo "$line" | grep -qE 'margin.*px|padding.*px|gap.*px'; then
        if ! echo "$line" | grep -qE 'theme|token|rpx|pxTransform|spacing'; then
          echo "  ⚠️ [$file:$line_num] 硬编码间距值，建议使用设计 token"
          TOKEN_COUNT=$((TOKEN_COUNT + 1))
        fi
      fi

    done < "$file"
  done

  echo "  反模式: $ANTI_PATTERN_COUNT, Token 问题: $TOKEN_COUNT, A11Y: $A11Y_COUNT"
}

# 性能陷阱扫描
scan_perf_traps() {
  echo ""
  echo "📋 性能陷阱检测"

  local files=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && files+=("$line")
  done < <(find . -type f \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.vue" \) \
    ! -path "*/node_modules/*" ! -path "*/dist/*" 2>/dev/null)

  for file in "${files[@]}"; do
    local content
    content=$(cat "$file")

    # 检测大图未压缩/懒加载
    if echo "$content" | grep -qE 'src=.*\.(png|jpg|jpeg|gif)'; then
      if ! echo "$content" | grep -qE 'lazy|loading=|lazyLoad'; then
        echo "  ⚠️ [$file] 图片可能未懒加载"
        PERF_COUNT=$((PERF_COUNT + 1))
      fi
    fi

    # 检测 ECharts 实例未 dispose
    if echo "$content" | grep -qE 'echarts|echarts\.init'; then
      if ! echo "$content" | grep -qE '\.dispose\(\)|dispose\(\)'; then
        echo "  ⚠️ [$file] ECharts 实例可能未在卸载时 dispose"
        PERF_COUNT=$((PERF_COUNT + 1))
      fi
    fi

    # 检测长列表未虚拟化（简单检测）
    if echo "$content" | grep -qE '\.map\(.*=>.*\bdiv\b|\bView\b.*v-for|\blist\b.*map'; then
      if ! echo "$content" | grep -qE 'virtual|Virtual|fixed|window|recycle'; then
        # 如果列表相关代码存在但没有虚拟化关键词
        if echo "$content" | grep -qE 'data.*length|total.*>|items.*>'; then
          echo "  ⚠️ [$file] 长列表可能未使用虚拟化"
          PERF_COUNT=$((PERF_COUNT + 1))
        fi
      fi
    fi
  done

  if [[ $PERF_COUNT -eq 0 ]]; then
    echo "  ✅ 未发现明显性能陷阱"
  else
    echo "  共发现 $PERF_COUNT 个性能问题"
  fi
}

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
main() {
  local lib
  lib=$(detect_component_lib)

  echo "🏥 组件医生扫描"
  echo "   组件库: ${lib:-未识别}"

  scan_anti_patterns "$lib"
  scan_perf_traps

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 组件扫描结果"
  echo "   ❌ 反模式: $ANTI_PATTERN_COUNT"
  echo "   ⚠️  Token 问题: $TOKEN_COUNT"
  echo "   ❌ A11Y 问题: $A11Y_COUNT"
  echo "   ⚠️  性能陷阱: $PERF_COUNT"
}

main "$@"
