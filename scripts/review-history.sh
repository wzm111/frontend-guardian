#!/usr/bin/env bash
#
# review-history.sh — 审查历史追踪
# Usage: review-history.sh [project_path] [command]
# Commands:
#   list    — 列出历史记录
#   show    — 查看最新记录
#   diff    — 对比最近两次记录
#   stats   — 统计趋势

set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
shift || true
COMMAND="${1:-list}"

HISTORY_DIR="$PROJECT_DIR/.frontend-guardian-history"
mkdir -p "$HISTORY_DIR"

# 保存当前扫描结果
save() {
  local report="$PROJECT_DIR/frontend-guardian-report.md"
  if [[ ! -f "$report" ]]; then
    echo "❌ 未找到扫描报告: $report"
    exit 1
  fi

  local timestamp
  timestamp=$(date '+%Y%m%d_%H%M%S')
  local snapshot="$HISTORY_DIR/report_${timestamp}.md"
  cp "$report" "$snapshot"

  # 提取统计数字
  local critical warning suggestion
  critical=$(grep -oE 'Critical.*[0-9]+' "$report" | grep -oE '[0-9]+' | head -1 || echo 0)
  warning=$(grep -oE 'Warning.*[0-9]+' "$report" | grep -oE '[0-9]+' | head -1 || echo 0)
  suggestion=$(grep -oE 'Suggestion.*[0-9]+' "$report" | grep -oE '[0-9]+' | head -1 || echo 0)

  echo "${timestamp},${critical:-0},${warning:-0},${suggestion:-0}" >> "$HISTORY_DIR/stats.csv"

  echo "✅ 已保存快照: $snapshot"
}

# 列出历史
list_records() {
  echo "📜 审查历史记录"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [[ ! -f "$HISTORY_DIR/stats.csv" ]]; then
    echo "   暂无历史记录"
    return
  fi

  echo "   时间                  Critical  Warning  Suggestion"
  echo "   ────────────────────  ────────  ───────  ──────────"
  while IFS=, read -r ts crit warn sugg; do
    local time_str="${ts:0:4}-${ts:4:2}-${ts:6:2} ${ts:9:2}:${ts:11:2}:${ts:13:2}"
    printf "   %s  %8s  %7s  %10s\n" "$time_str" "$crit" "$warn" "$sugg"
  done < "$HISTORY_DIR/stats.csv"
}

# 查看最新
show_latest() {
  local latest
  latest=$(ls -t "$HISTORY_DIR"/report_*.md 2>/dev/null | head -1)
  if [[ -z "$latest" ]]; then
    echo "暂无历史记录"
    exit 1
  fi
  cat "$latest"
}

# 对比最近两次
diff_records() {
  local files
  files=$(ls -t "$HISTORY_DIR"/report_*.md 2>/dev/null | head -2)
  local count=$(echo "$files" | wc -l | tr -d ' ')

  if [[ "$count" -lt 2 ]]; then
    echo "需要至少 2 条记录才能对比"
    exit 1
  fi

  local old_file new_file
  old_file=$(echo "$files" | tail -1)
  new_file=$(echo "$files" | head -1)

  echo "📊 对比: $(basename "$old_file") → $(basename "$new_file")"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # 提取统计对比
  local old_crit old_warn old_sugg new_crit new_warn new_sugg
  old_crit=$(grep -oE '🔴 Critical.*[0-9]+' "$old_file" | grep -oE '[0-9]+' | head -1 || echo 0)
  new_crit=$(grep -oE '🔴 Critical.*[0-9]+' "$new_file" | grep -oE '[0-9]+' | head -1 || echo 0)

  local crit_diff=$((new_crit - old_crit))
  local crit_sign=""
  [[ $crit_diff -gt 0 ]] && crit_sign="+"
  [[ $crit_diff -lt 0 ]] && crit_sign=""

  echo "   Critical:  $old_crit → $new_crit (${crit_sign}${crit_diff})"

  # 也可以做完整的 diff
  if command -v diff >/dev/null; then
    echo ""
    echo "详细差异:"
    diff -u "$old_file" "$new_file" | tail -n +3 || echo "   无变化"
  fi
}

# 统计趋势
stats_trend() {
  echo "📈 问题趋势"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [[ ! -f "$HISTORY_DIR/stats.csv" ]]; then
    echo "   暂无数据"
    return
  fi

  local total_records
  total_records=$(wc -l < "$HISTORY_DIR/stats.csv" | tr -d ' ')
  echo "   总记录数: $total_records"

  # 计算平均值
  local avg_crit avg_warn avg_sugg
  avg_crit=$(awk -F, '{sum+=$2} END {printf "%.1f", sum/NR}' "$HISTORY_DIR/stats.csv")
  avg_warn=$(awk -F, '{sum+=$3} END {printf "%.1f", sum/NR}' "$HISTORY_DIR/stats.csv")
  avg_sugg=$(awk -F, '{sum+=$4} END {printf "%.1f", sum/NR}' "$HISTORY_DIR/stats.csv")

  echo "   平均 Critical: $avg_crit"
  echo "   平均 Warning: $avg_warn"
  echo "   平均 Suggestion: $avg_sugg"
}

# 主流程
case "$COMMAND" in
  save)
    save
    ;;
  list)
    list_records
    ;;
  show)
    show_latest
    ;;
  diff)
    diff_records
    ;;
  stats)
    stats_trend
    ;;
  *)
    echo "Usage: review-history.sh [project_path] <list|show|diff|stats|save>"
    exit 1
    ;;
esac
