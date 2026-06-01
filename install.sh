#!/usr/bin/env bash
#
# install.sh — Frontend Guardian 通用安装器
# Usage: bash install.sh [--mode <claude|cursor|vscode|cli|all>]
#
# 支持平台：
#   Claude Code     — ~/.claude/skills/frontend-guardian/
#   Cursor          — ~/.cursor/skills/ + .cursorrules
#   VS Code + Copilot — .copilot-review-rules.md
#   Generic CLI     — /usr/local/bin/fg 快捷命令

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$SCRIPT_DIR"
VERSION="1.0.0"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# 打印 banner
print_banner() {
  cat <<'EOF'
   ___         _                      _                    _
  / __\_ _  __| | ___  _ __   ___  __| | __ _ _ __ ___  __| |
 / _/ / _` |/ _` |/ _ \| '_ \ / _ \/ _` |/ _` | '__/ _ \/ _` |
/ /__| (_| | (_| | (_) | | | |  __/ (_| | (_| | | |  __/ (_| |
\____/\__,_|\__,_|\___/|_| |_|\___|\__,_|\__,_|_|  \___|\__,_|

Frontend Guardian — 前端统一治理助手
EOF
  echo ""
}

# 安装到 Claude Code
install_claude() {
  local target_dir="$HOME/.claude/skills/frontend-guardian"
  log_info "安装到 Claude Code: $target_dir"
  mkdir -p "$target_dir"
  rsync -a --exclude='.git' --exclude='install.sh' "$REPO_DIR/" "$target_dir/" 2>/dev/null || \
    cp -r "$REPO_DIR/"* "$target_dir/" 2>/dev/null || true
  log_ok "Claude Code Skill 安装完成"
  echo "   使用方法: 在项目目录下执行 /frontend-guardian"
}

# 安装到 Cursor
install_cursor() {
  local target_dir="$HOME/.cursor/skills/frontend-guardian"
  log_info "安装到 Cursor: $target_dir"
  mkdir -p "$target_dir"
  rsync -a --exclude='.git' "$REPO_DIR/" "$target_dir/" 2>/dev/null || \
    cp -r "$REPO_DIR/"* "$target_dir/" 2>/dev/null || true

  # 创建 .cursorrules
  cat > "$HOME/.cursorrules" <<'EOF'
# Frontend Guardian / 前端统一治理助手

## 触发条件
当检测到以下场景时，自动调用 frontend-guardian 能力：
- 项目包含 i18n/locales/lang 目录
- 使用 React/Vue 的 hooks/composables
- 使用 Ant Design / Element Plus / MUI 等组件库
- 项目是小程序（UniApp/Taro/原生）
- 项目包含鸿蒙 ArkTS 代码

## 指令
- "扫描 i18n 问题" → 运行 i18n 治理扫描
- "检查组件规范" → 运行组件医生
- "检查 hooks" → 运行 Hooks/Composables 检查
- "检查多端适配" → 运行平台适配检查
- "全量扫描" → 运行完整治理扫描

## 输出格式
- 🔴 Critical: 必须修复
- 🟡 Warning: 建议修复
- 💡 Suggestion: 可选优化
EOF
  log_ok "Cursor 安装完成"
  echo "   使用方法: 在 Cursor 中直接对话请求扫描"
}

# 安装到 VS Code + Copilot
install_vscode() {
  log_info "安装到 VS Code + GitHub Copilot"
  local rules_file=".copilot-review-rules.md"
  cat > "$REPO_DIR/$rules_file" <<'EOF'
# Frontend Guardian / 前端治理规则

## i18n 治理
- 禁止源码中出现硬编码中文 UI 文案（console/debug 除外）
- key 命名使用 module.page.element 格式，全小写+点号分隔
- 所有语言包必须保持 key 一致性

## 组件规范
- Table 必须设置 rowKey
- Form.Item 必须设置 name 属性
- Modal/Dialog 设置 destroyOnClose
- Select 大数据量使用虚拟滚动
- 图片必须设置 alt 属性
- Icon 按钮必须设置 aria-label

## Hooks / Composables
- useEffect 必须提供完整依赖数组
- setInterval/setTimeout 必须在 cleanup 中清除
- 自定义 Hook 必须以 use 开头
- Vue watch 包含 immediate 时必须处理异步初始化

## 多端适配
- 小程序中避免使用 DOM API（document/window）
- 使用 uni.xxx 或 Taro.xxx 代替平台专属 API
- 移动端触摸目标至少 44×44px
- 鸿蒙 ArkTS 必须显式标注类型
EOF
  log_ok "VS Code 规则文件已生成: $rules_file"
  echo "   复制此文件到项目根目录，Copilot 会自动读取"
}

# 安装 CLI 快捷命令
install_cli() {
  log_info "安装 CLI 快捷命令"
  local bin_dir="/usr/local/bin"
  local fg_script="$bin_dir/fg"

  # 检查是否有权限
  if [[ ! -w "$bin_dir" ]]; then
    bin_dir="$HOME/.local/bin"
    mkdir -p "$bin_dir"
    log_warn "无 /usr/local/bin 写入权限，安装到 $bin_dir"
    echo "   请将此目录加入 PATH: export PATH=\"$bin_dir:\$PATH\""
  fi

  cat > "$fg_script" <<EOF
#!/usr/bin/env bash
# fg — Frontend Guardian CLI wrapper
# Version: $VERSION

FG_DIR="\${FG_DIR:-$HOME/.claude/skills/frontend-guardian}"

if [[ ! -d "\$FG_DIR" ]]; then
  echo "❌ frontend-guardian 未安装。请先运行 install.sh"
  exit 1
fi

# 路由命令
case "\${1:-}" in
  --scan|scan)
    bash "\$FG_DIR/scripts/full-scan.sh" "\${@:2}"
    ;;
  --i18n|i18n)
    bash "\$FG_DIR/scripts/scan-i18n.sh" "\${@:2}"
    ;;
  --component|component)
    bash "\$FG_DIR/scripts/scan-components.sh" "\${@:2}"
    ;;
  --hooks|hooks)
    bash "\$FG_DIR/scripts/scan-hooks.sh" "\${@:2}"
    ;;
  --platform|platform)
    bash "\$FG_DIR/scripts/scan-platform.sh" "\${@:2}"
    ;;
  --extract|extract)
    bash "\$FG_DIR/scripts/extract-i18n.sh" "\${@:2}"
    ;;
  --translate|translate)
    bash "\$FG_DIR/scripts/translate.sh" "\${@:2}"
    ;;
  --history|history)
    bash "\$FG_DIR/scripts/review-history.sh" "\${@:2}"
    ;;
  --bundle|bundle)
    bash "\$FG_DIR/scripts/bundle-size.sh" "\${@:2}"
    ;;
  --help|-h|help)
    echo "Frontend Guardian CLI v$VERSION"
    echo ""
    echo "Usage: fg <command> [options]"
    echo ""
    echo "Commands:"
    echo "  scan       全量扫描"
    echo "  i18n       i18n 治理扫描"
    echo "  component  组件医生扫描"
    echo "  hooks      Hooks / Composables 扫描"
    echo "  platform   多端平台适配扫描"
    echo "  extract    提取硬编码文案到语言包"
    echo "  translate  自动翻译缺失语言"
    echo "  history    查看审查历史"
    echo "  bundle     包体积分析"
    echo ""
    echo "Options (scan commands):"
    echo "  --gate          门禁模式"
    echo "  --staged        仅检查 git staged 文件"
    echo "  --since <ref>   检查指定 commit 以来的变更"
    echo "  --output <file> 报告输出路径"
    echo "  --severity <l>  最低输出级别: critical | warning | suggestion"
    echo "  --fix           自动修复"
    ;;
  *)
    # 默认执行全量扫描
    bash "\$FG_DIR/scripts/full-scan.sh" "\$@"
    ;;
esac
EOF
  chmod +x "$fg_script"
  log_ok "CLI 命令安装完成: $fg_script"
  echo "   使用方法: fg scan --gate"
}

# 主流程
main() {
  print_banner

  local mode="${1:-all}"

  case "$mode" in
    --mode)
      mode="${2:-all}"
      ;;
    --help|-h)
      echo "Usage: bash install.sh [--mode <claude|cursor|vscode|cli|all>]"
      echo ""
      echo "Modes:"
      echo "  claude  — Claude Code Skill"
      echo "  cursor  — Cursor IDE + .cursorrules"
      echo "  vscode  — VS Code + Copilot 规则"
      echo "  cli     — 全局 CLI 命令 (fg)"
      echo "  all     — 全部安装 (默认)"
      exit 0
      ;;
  esac

  case "$mode" in
    claude)
      install_claude
      ;;
    cursor)
      install_cursor
      ;;
    vscode)
      install_vscode
      ;;
    cli)
      install_cli
      ;;
    all)
      install_claude
      echo ""
      install_cursor
      echo ""
      install_vscode
      echo ""
      install_cli
      ;;
    *)
      log_error "未知模式: $mode"
      echo "Usage: bash install.sh [--mode <claude|cursor|vscode|cli|all>]"
      exit 1
      ;;
  esac

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_ok "Frontend Guardian v$VERSION 安装完成！"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

main "$@"
