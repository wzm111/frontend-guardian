#!/usr/bin/env bash
#
# scan-platform.sh — 多端平台适配扫描
# Usage: scan-platform.sh [project_path]
#
# 检测项：
#   1. 小程序包体积
#   2. UniApp / Taro 跨端规范
#   3. 移动端适配
#   4. 鸿蒙规范

set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
cd "$PROJECT_DIR"

# 统计
declare -i MP_COUNT=0
declare -i MOBILE_COUNT=0
declare -i HARMONY_COUNT=0
declare -i RESPONSIVE_COUNT=0

# 检测平台类型
detect_platform() {
  local platforms=()

  if [[ -f "manifest.json" ]] && [[ -f "pages.json" ]]; then
    platforms+=("uniapp")
  fi
  if [[ -f "config/index.js" || -f "config/index.ts" ]] && [[ -f "app.config.ts" || -f "app.config.js" ]]; then
    platforms+=("taro")
  fi
  if [[ -f "app.json" ]] && [[ -f "project.config.json" ]]; then
    platforms+=("wechat-mp")
  fi
  if [[ -f "mini.project.json" ]]; then
    platforms+=("alipay-mp")
  fi
  if [[ -f "pubspec.yaml" ]]; then
    platforms+=("flutter")
  fi
  if [[ -f "metro.config.js" ]]; then
    platforms+=("react-native")
  fi
  if [[ -d "entry/src/main/ets" ]] || [[ -f "hvigorfile.ts" ]]; then
    platforms+=("harmony")
  fi
  if [[ -f "next.config.js" || -f "next.config.ts" ]]; then
    platforms+=("nextjs")
  fi
  if grep -q '"react"' package.json 2>/dev/null; then
    platforms+=("react")
  fi
  if grep -q '"vue"' package.json 2>/dev/null; then
    platforms+=("vue")
  fi

  printf '%s\n' "${platforms[@]}"
}

# 小程序专项扫描
scan_mp() {
  echo ""
  echo "📋 小程序专项扫描"

  # 包体积检查
  if [[ -d "dist" ]] || [[ -d "build" ]] || [[ -d "unpackage/dist" ]]; then
    local build_dir=""
    for d in "dist" "build/mp-weixin" "unpackage/dist/build/mp-weixin" "dist/build/mp-weixin"; do
      [[ -d "$d" ]] && build_dir="$d" && break
    done

    if [[ -n "$build_dir" ]]; then
      local size
      size=$(du -sk "$build_dir" 2>/dev/null | awk '{print $1}')
      if [[ -n "$size" ]]; then
        local size_mb
        size_mb=$(echo "scale=2; $size / 1024" | bc 2>/dev/null || echo "$size")
        if [[ $size -gt 2048 ]]; then
          echo "  ❌ 小程序包体积过大: ${size_mb}KB > 2MB"
          MP_COUNT=$((MP_COUNT + 1))
        elif [[ $size -gt 1800 ]]; then
          echo "  ⚠️ 小程序包体积接近上限: ${size_mb}KB"
          MP_COUNT=$((MP_COUNT + 1))
        else
          echo "  ✅ 包体积正常: ${size_mb}KB"
        fi
      fi
    fi
  fi

  # 检查 base64 图片
  local base64_count=0
  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    if grep -qE 'data:image/[^;]+;base64,[A-Za-z0-9+/]{1000,}' "$file" 2>/dev/null; then
      base64_count=$((base64_count + 1))
      echo "  ❌ [$file] 包含大图 base64 编码（>10KB 风险）"
    fi
  done < <(find . -type f \( -name "*.js" -o -name "*.ts" -o -name "*.vue" -o -name "*.wxml" -o -name "*.axml" -o -name "*.ttml" \) \
    ! -path "*/node_modules/*" ! -path "*/dist/*" 2>/dev/null)

  if [[ $base64_count -gt 0 ]]; then
    MP_COUNT=$((MP_COUNT + base64_count))
  fi

  # 检查条件编译
  if [[ -f "manifest.json" ]]; then
    local ifdef_unclosed
    ifdef_unclosed=$(grep -rE '#ifdef|#ifndef' --include="*.js" --include="*.ts" --include="*.vue" . 2>/dev/null | grep -cv '#endif' || echo 0)
    if [[ $ifdef_unclosed -gt 0 ]]; then
      echo "  ⚠️ 发现 $ifdef_unclosed 处条件编译可能未闭合"
      MP_COUNT=$((MP_COUNT + 1))
    fi

    # 检查平台专有 API
    local proprietary_api
    proprietary_api=$(grep -rE '\bwx\.(request|getSystemInfo|showToast|navigateTo)\b|\bmy\.(httpRequest|getSystemInfo|alert|navigateTo)\b' \
      --include="*.js" --include="*.ts" --include="*.vue" . 2>/dev/null | grep -v "node_modules" | grep -v "uni\." || true)
    if [[ -n "$proprietary_api" ]]; then
      echo "  ❌ 发现使用平台专有 API（应改用 uni.xxx 或 Taro.xxx）:"
      echo "$proprietary_api" | head -5 | sed 's/^/     /'
      MP_COUNT=$((MP_COUNT + 1))
    fi
  fi

  # 检查 Taro 编译配置
  if [[ -f "config/index.js" ]] || [[ -f "config/index.ts" ]]; then
    local config_file=""
    [[ -f "config/index.js" ]] && config_file="config/index.js"
    [[ -f "config/index.ts" ]] && config_file="config/index.ts"

    if [[ -n "$config_file" ]]; then
      if ! grep -qE "compiler.*webpack5|compiler.*vite" "$config_file"; then
        echo "  ⚠️ Taro config 未明确指定 compiler（webpack5 / vite）"
        MP_COUNT=$((MP_COUNT + 1))
      fi
    fi
  fi

  # 检查 HTTP 请求（安全）
  local http_requests
  http_requests=$(grep -rE 'http://' --include="*.js" --include="*.ts" --include="*.vue" --include="*.wxml" --include="*.axml" . 2>/dev/null | grep -v "node_modules" | grep -v "localhost\|127.0.0.1" || true)
  if [[ -n "$http_requests" ]]; then
    echo "  ❌ 发现使用 HTTP 协议（应使用 HTTPS）:"
    echo "$http_requests" | head -5 | sed 's/^/     /'
    MP_COUNT=$((MP_COUNT + 1))
  fi

  # 检查未清理的定时器
  local uncleaned_timers
  uncleaned_timers=$(grep -rE 'setInterval|setTimeout' --include="*.js" --include="*.ts" --include="*.vue" . 2>/dev/null | grep -v "node_modules" | grep -v "clearInterval\|clearTimeout" || true)
  if [[ -n "$uncleaned_timers" ]]; then
    echo "  ⚠️  发现可能未清理的定时器:"
    echo "$uncleaned_timers" | head -5 | sed 's/^/     /'
    MP_COUNT=$((MP_COUNT + 1))
  fi

  if [[ $MP_COUNT -eq 0 ]]; then
    echo "  ✅ 小程序专项检查通过"
  else
    echo "  共发现 $MP_COUNT 个问题"
  fi
}

# 移动端适配扫描
scan_mobile() {
  echo ""
  echo "📋 移动端适配扫描"

  local files=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && files+=("$line")
  done < <(find . -type f \( -name "*.css" -o -name "*.scss" -o -name "*.less" -o -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.vue" \) \
    ! -path "*/node_modules/*" ! -path "*/dist/*" 2>/dev/null)

  for file in "${files[@]}"; do
    if [[ "$file" == *.css ]] || [[ "$file" == *.scss ]] || [[ "$file" == *.less ]]; then
      if ! grep -qE 'safe-area-inset|env\(' "$file" 2>/dev/null; then
        if grep -qE 'padding.*top|padding.*bottom|margin.*top|margin.*bottom|fixed.*bottom' "$file" 2>/dev/null; then
          echo "  ⚠️ [$file] 可能有固定定位元素，建议检查安全区域适配"
          MOBILE_COUNT=$((MOBILE_COUNT + 1))
        fi
      fi

      if grep -qE 'width:\s*[0-9]+px.*height:\s*[0-9]+px' "$file" 2>/dev/null; then
        local small_click
        small_click=$(grep -E 'width:\s*([0-9]+)px.*height:\s*([0-9]+)px' "$file" 2>/dev/null | \
          awk -F'[:;]' '{for(i=1;i<=NF;i++) if($i~/width|height/) print $i}' | \
          grep -oE '[0-9]+' | awk '$1 < 44 {print}' | wc -l | tr -d ' ')
        if [[ $small_click -gt 0 ]]; then
          echo "  ⚠️ [$file] 发现点击区域可能小于 44x44px"
          MOBILE_COUNT=$((MOBILE_COUNT + 1))
        fi
      fi
    fi
  done

  if [[ $MOBILE_COUNT -eq 0 ]]; then
    echo "  ✅ 移动端适配检查通过"
  else
    echo "  共发现 $MOBILE_COUNT 个问题"
  fi
}

# 鸿蒙规范扫描
scan_harmony() {
  echo ""
  echo "📋 鸿蒙 HarmonyOS 扫描"

  if [[ ! -d "entry/src/main/ets" ]] && [[ ! -f "hvigorfile.ts" ]]; then
    echo "  ℹ️  未检测到鸿蒙项目，跳过"
    return
  fi

  local files=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && files+=("$line")
  done < <(find entry/src/main/ets -type f -name "*.ets" 2>/dev/null || echo "")

  for file in "${files[@]}"; do
    [[ -f "$file" ]] || continue

    local content
    content=$(cat "$file")

    if ! echo "$content" | grep -qE '@Component|@Entry'; then
      if echo "$content" | grep -qE 'struct\s+\w+'; then
        echo "  ⚠️ [$file] ArkTS struct 缺少 @Component 或 @Entry 装饰器"
        HARMONY_COUNT=$((HARMONY_COUNT + 1))
      fi
    fi

    if echo "$content" | grep -qE '\blet\s+\w+\s*:\s*\w+'; then
      if ! echo "$content" | grep -qE '@State|@Prop|@Link|@Provide|@Consume|@ObjectLink'; then
        echo "  ⚠️ [$file] 检测到可变状态但未使用装饰器管理"
        HARMONY_COUNT=$((HARMONY_COUNT + 1))
      fi
    fi

    if echo "$content" | grep -qE '"\#\w{3,6}"|Color\.'; then
      if ! echo "$content" | grep -qE '\$r\(|\$rawfile\('; then
        echo "  💡 [$file] 建议将颜色/资源提取到 resources 中"
      fi
    fi
  done

  if [[ $HARMONY_COUNT -eq 0 ]]; then
    echo "  ✅ 鸿蒙规范检查通过"
  else
    echo "  共发现 $HARMONY_COUNT 个问题"
  fi
}

# 响应式断点扫描
scan_responsive() {
  echo ""
  echo "📋 响应式断点扫描"

  local has_media_query=false
  local files=()

  while IFS= read -r line; do
    [[ -n "$line" ]] && files+=("$line")
  done < <(find . -type f \( -name "*.css" -o -name "*.scss" -o -name "*.less" \) \
    ! -path "*/node_modules/*" ! -path "*/dist/*" 2>/dev/null)

  for file in "${files[@]:+${files[@]}}"; do
    [[ -n "$file" ]] || continue
    if grep -qE '@media\s*\(' "$file" 2>/dev/null; then
      has_media_query=true
    fi
  done

  if ! $has_media_query; then
    local js_responsive
    js_responsive=$(grep -rE 'innerWidth|matchMedia|useBreakpoint|breakpoints' \
      --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" --include="*.vue" . 2>/dev/null | head -1)
    if [[ -n "$js_responsive" ]]; then
      echo "  ✅ 检测到响应式处理（JS）"
    else
      echo "  💡 未检测到响应式断点配置，建议为 PC/H5 适配添加媒体查询"
      RESPONSIVE_COUNT=$((RESPONSIVE_COUNT + 1))
    fi
  else
    echo "  ✅ 检测到响应式媒体查询"
  fi
}

# 主流程
main() {
  local platforms
  platforms=$(detect_platform)

  echo "📱 多端平台适配扫描"
  echo "   检测平台: $(echo "$platforms" | tr '\n' ' ')"

  scan_mp
  scan_mobile
  scan_harmony
  scan_responsive

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 平台适配结果"
  echo "   ❌ 小程序: $MP_COUNT"
  echo "   ⚠️  移动端: $MOBILE_COUNT"
  echo "   ❌ 鸿蒙: $HARMONY_COUNT"
  echo "   💡 响应式: $RESPONSIVE_COUNT"
}

main "$@"
