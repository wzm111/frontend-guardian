#!/usr/bin/env bash
#
# bundle-size.sh — 前端构建产物体积分析
# Usage: bundle-size.sh [project_path] [threshold_mb]

set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
THRESHOLD_MB="${2:-2}"
cd "$PROJECT_DIR"

# 颜色
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

THRESHOLD_BYTES=$((THRESHOLD_MB * 1024 * 1024))

echo ""
echo "📦 构建产物体积分析"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   阈值: ${THRESHOLD_MB}MB (${THRESHOLD_BYTES} bytes)"
echo ""

# 检测构建输出目录
detect_dist_dir() {
  local dirs=("dist" "build" ".next" ".nuxt" "out" "output")
  for d in "${dirs[@]}"; do
    if [[ -d "$d" ]]; then
      echo "$d"
      return
    fi
  done
  echo ""
}

DIST_DIR=$(detect_dist_dir)

if [[ -z "$DIST_DIR" ]]; then
  echo "${YELLOW}⚠️  未找到构建产物目录${NC}"
  echo "   请先运行构建命令: npm run build"
  exit 0
fi

echo "   分析目录: $DIST_DIR"
echo ""

# 统计总体积
total_size=$(du -sb "$DIST_DIR" | cut -f1)
total_size_mb=$(echo "scale=2; $total_size / 1024 / 1024" | bc 2>/dev/null || echo "0")

if [[ "$total_size" -gt "$THRESHOLD_BYTES" ]]; then
  echo "   ${RED}❌ 总体积: ${total_size_mb}MB（超过阈值 ${THRESHOLD_MB}MB）${NC}"
else
  echo "   ${GREEN}✅ 总体积: ${total_size_mb}MB（符合阈值）${NC}"
fi

echo ""
echo "📊 各文件/目录体积 TOP 20:"
echo "   体积        文件路径"
echo "   ──────────  ──────────────────────────────────────"

# 列出大文件
find "$DIST_DIR" -type f -exec du -b {} + 2>/dev/null | sort -rn | head -20 | while read -r size file; do
  size_kb=$(echo "scale=1; $size / 1024" | bc 2>/dev/null || echo "0")
  size_mb=$(echo "scale=2; $size / 1024 / 1024" | bc 2>/dev/null || echo "0")

  if (( $(echo "$size_mb > 1" | bc -l 2>/dev/null || echo 0) )); then
    printf "   ${RED}%6sMB${NC}  %s\n" "$size_mb" "$file"
  elif (( $(echo "$size_kb > 100" | bc -l 2>/dev/null || echo 0) )); then
    printf "   ${YELLOW}%6sKB${NC}  %s\n" "$size_kb" "$file"
  else
    printf "   ${GREEN}%7sB${NC}  %s\n" "$size" "$file"
  fi
done

# JS chunk 分析
echo ""
echo "📊 JS Chunk 分析:"
js_chunks=$(find "$DIST_DIR" -name "*.js" -o -name "*.mjs" 2>/dev/null | wc -l | tr -d ' ')
echo "   JS 文件数: $js_chunks"

# 检查是否有超大 chunk
large_chunks=$(find "$DIST_DIR" -name "*.js" -size +500k 2>/dev/null)
if [[ -n "$large_chunks" ]]; then
  echo "   ${YELLOW}⚠️  发现超大 JS Chunk（>500KB）:${NC}"
  echo "$large_chunks" | while read -r f; do
    local s=$(du -h "$f" | cut -f1)
    echo "      $s  $f"
  done
fi

# 图片资源分析
echo ""
echo "📊 图片资源分析:"
img_total=$(find "$DIST_DIR" \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" -o -name "*.svg" -o -name "*.webp" \) -exec du -cb {} + 2>/dev/null | tail -1 | cut -f1)
img_total_mb=$(echo "scale=2; ${img_total:-0} / 1024 / 1024" | bc 2>/dev/null || echo "0")
echo "   图片总大小: ${img_total_mb}MB"

# 未压缩资源检测
echo ""
echo "🔍 优化建议:"

# 检查是否有 source map 在生产环境
if find "$DIST_DIR" -name "*.map" | grep -q .; then
  echo "   ${YELLOW}⚠️  生产环境包含 source map 文件，建议删除以减小体积${NC}"
fi

# 检查未压缩的 JS
unminified_js=$(find "$DIST_DIR" -name "*.js" -exec head -c 200 {} \; -print 2>/dev/null | grep -B1 "^[a-zA-Z_][a-zA-Z0-9_]*\s*=" | head -5)
if [[ -n "$unminified_js" ]]; then
  echo "   ${YELLOW}⚠️  发现未压缩的 JS 文件${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
