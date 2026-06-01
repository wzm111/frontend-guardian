#!/usr/bin/env bash
#
# run-tests.sh — Frontend Guardian 单元测试
# Usage: bash tests/run-tests.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

declare -i PASSED=0
FAILED=0
TOTAL=0

run_test() {
  local name="$1"
  local script="$2"
  local fixture="$3"
  local expected_pattern="$4"

  TOTAL=$((TOTAL + 1))
  echo -n "  [$TOTAL] $name ... "

  local output
  if output=$(bash "$FG_DIR/scripts/$script" "$fixture" 2>&1); then
    if echo "$output" | grep -qE "$expected_pattern"; then
      echo -e "${GREEN}PASS${NC}"
      PASSED=$((PASSED + 1))
    else
      echo -e "${RED}FAIL${NC} (未检测到预期输出: $expected_pattern)"
      FAILED=$((FAILED + 1))
      echo "    输出: $(echo "$output" | head -3 | tr '\n' ' ')"
    fi
  else
    # 脚本退出码非 0，但可能 still 有输出
    if echo "$output" | grep -qE "$expected_pattern"; then
      echo -e "${GREEN}PASS${NC}"
      PASSED=$((PASSED + 1))
    else
      echo -e "${YELLOW}SKIP${NC} (脚本执行失败)"
      FAILED=$((FAILED + 1))
    fi
  fi
}

echo ""
echo "🧪 Frontend Guardian 单元测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# === i18n 扫描测试 ===
echo "📦 i18n 扫描测试"
run_test "检测硬编码中文" "scan-i18n.sh" "$SCRIPT_DIR/fixtures/react-project" "硬编码中文|硬编码文案"
run_test "检测缺失 key" "scan-i18n.sh" "$SCRIPT_DIR/fixtures/react-project" "缺失.*key|缺失"
run_test "检测死 key" "scan-i18n.sh" "$SCRIPT_DIR/fixtures/react-project" "死 key|dead"

# === 组件扫描测试 ===
echo ""
echo "📦 组件扫描测试"
run_test "检测 Table 缺少 rowKey" "scan-components.sh" "$SCRIPT_DIR/fixtures/react-project" "rowKey"
run_test "检测 Form.Item 缺少 name" "scan-components.sh" "$SCRIPT_DIR/fixtures/react-project" "name"
run_test "检测 Modal 缺少 destroyOnClose" "scan-components.sh" "$SCRIPT_DIR/fixtures/react-project" "destroyOnClose"
run_test "检测图片缺少 alt" "scan-components.sh" "$SCRIPT_DIR/fixtures/react-project" "alt"

# === Hooks 扫描测试 ===
echo ""
echo "📦 Hooks 扫描测试"
run_test "检测 useEffect 缺少依赖" "scan-hooks.sh" "$SCRIPT_DIR/fixtures/react-project" "依赖|dependency"
run_test "检测 setInterval 未清理" "scan-hooks.sh" "$SCRIPT_DIR/fixtures/react-project" "setInterval|定时器"
run_test "检测自定义 Hook 命名" "scan-hooks.sh" "$SCRIPT_DIR/fixtures/react-project" "use"

# === 平台扫描测试 ===
echo ""
echo "📦 平台扫描测试"
run_test "检测小程序 HTTP 请求" "scan-platform.sh" "$SCRIPT_DIR/fixtures/mini-program" "http|HTTPS"
run_test "检测小程序定时器未清理" "scan-platform.sh" "$SCRIPT_DIR/fixtures/mini-program" "定时器|timer"

# === extract-i18n 测试 ===
echo ""
echo "📦 extract-i18n 测试"
run_test "提取硬编码文案（预览模式）" "extract-i18n.sh" "$SCRIPT_DIR/fixtures/react-project" "提取|extract"

# === translate 测试 ===
echo ""
echo "📦 translate 测试"
run_test "翻译缺失 key（mock 模式）" "translate.sh" "$SCRIPT_DIR/fixtures/react-project" "mock|翻译"

# === 汇总 ===
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 测试结果"
echo "   ${GREEN}通过: $PASSED${NC}"
echo "   ${RED}失败: $FAILED${NC}"
echo "   总计: $TOTAL"

if [[ $FAILED -eq 0 ]]; then
  echo ""
  echo -e "${GREEN}✅ 所有测试通过！${NC}"
  exit 0
else
  echo ""
  echo -e "${RED}❌ 有 $FAILED 个测试失败${NC}"
  exit 1
fi
