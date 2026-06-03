#!/usr/bin/env bash
#
# frontend-guardian — 统一扫描入口（v3.4 统一版）
# Usage: full-scan.sh [options] [project_path]
#
# 核心设计：
#   - AST 引擎（fg-core --module all）为主要引擎
#   - Bash scanner 作为补充引擎
#   - Knip 作为外部工具
#   - 所有结果合并为 UnifiedOutput JSON，再生成 Markdown 报告
#
# Options:
#   --gate          门禁模式（发现 Critical 问题时 exit 1）
#   --staged        仅检查 git staged 文件
#   --since <ref>   检查指定 commit 以来的变更
#   --output <file> 报告输出路径
#   --severity <l>  最低输出级别: critical | warning | suggestion
#   --fix           自动修复可修复的问题
#   --init-ai       扫描后初始化/更新 AI 上下文文件
#   --json          以 JSON 格式输出统一扫描结果
#
# Examples:
#   full-scan.sh                              # 全量扫描当前目录
#   full-scan.sh --gate                       # 门禁模式
#   full-scan.sh --staged                     # 仅 staged 文件
#   full-scan.sh --since HEAD~3               # 最近 3 个 commit
#   full-scan.sh --output report.md           # 输出到 report.md
#   full-scan.sh ./my-project --gate --fix    # 扫描指定目录，门禁+自动修复

set -euo pipefail

# ---------------------------------------------------------------------------
# 配置与常量
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(pwd)"
GATE_MODE=false
STAGED_ONLY=false
SINCE_REF=""
OUTPUT_FILE=""
SEVERITY="warning"
FIX_MODE=false
JSON_MODE=false
INIT_AI=false
AI_AGENT=""
CONFIG_FILE=".frontend-guardian.yml"

# 中间输出路径
AST_OUTPUT="/tmp/fg-ast-all.json"
KNIP_OUTPUT="/tmp/fg-knip.txt.json"
UNIFIED_OUTPUT="/tmp/fg-unified.json"

# Bash scanner 定义: "显示名:脚本名:文本输出:JSON输出"
BASH_SCANNERS=(
  "i18n 治理:scan-i18n.sh:/tmp/fg-i18n.txt:/tmp/fg-bash-i18n.json"
  "组件医生:scan-components.sh:/tmp/fg-component.txt:/tmp/fg-bash-component.json"
  "Hooks 检查:scan-hooks.sh:/tmp/fg-hooks.txt:/tmp/fg-bash-hooks.json"
  "多端适配:scan-platform.sh:/tmp/fg-platform.txt:/tmp/fg-bash-platform.json"
)

# 颜色
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# 解析参数
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --gate)       GATE_MODE=true; shift ;;
    --staged)     STAGED_ONLY=true; shift ;;
    --since)      SINCE_REF="$2"; shift 2 ;;
    --output)     OUTPUT_FILE="$2"; shift 2 ;;
    --severity)   SEVERITY="$2"; shift 2 ;;
    --fix)        FIX_MODE=true; shift ;;
    --json)       JSON_MODE=true; shift ;;
    --init-ai)
      INIT_AI=true
      if [[ $# -gt 1 && ! "$2" =~ ^-- ]]; then
        AI_AGENT="$2"
        shift 2
      else
        AI_AGENT="generic"
        shift
      fi
      ;;
    --help|-h)
      head -n 22 "$0" | tail -n +3 | sed 's/^# //'
      exit 0
      ;;
    -*)
      echo "❌ 未知选项: $1" >&2
      exit 1
      ;;
    *)
      PROJECT_DIR="$1"
      shift
      ;;
  esac
done

cd "$PROJECT_DIR"
PROJECT_DIR="$(pwd)"

if [[ -z "$OUTPUT_FILE" ]]; then
  OUTPUT_FILE="./frontend-guardian-report.md"
fi

# ---------------------------------------------------------------------------
# 加载配置文件
# ---------------------------------------------------------------------------
load_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    echo "📄 加载配置: $CONFIG_FILE"
    if command -v yq &>/dev/null; then
      : # yq 可用，保留给未来使用
    fi
  fi
}

# ---------------------------------------------------------------------------
# 技术栈深度检测
# ---------------------------------------------------------------------------
detect_stack() {
  local stack="Unknown"
  local platforms=()
  local extra_info=""

  if [[ -f "manifest.json" && -f "pages.json" ]] && grep -q '"name".*"uni-app"' package.json 2>/dev/null; then
    stack="UniApp"
    platforms+=("小程序" "H5" "App")
  elif [[ -f "config/index.js" || -f "config/index.ts" ]] && grep -q 'taro' package.json 2>/dev/null; then
    stack="Taro"
    platforms+=("小程序" "H5" "App" "RN")
  elif [[ -f "next.config.js" || -f "next.config.ts" || -f "next.config.mjs" ]]; then
    stack="Next.js"
    platforms+=("PC Web" "H5")
  elif [[ -f "nuxt.config.ts" || -f "nuxt.config.js" ]]; then
    stack="Nuxt"
    platforms+=("PC Web" "H5")
  elif grep -q '"react"' package.json 2>/dev/null; then
    stack="React"
    platforms+=("PC Web" "H5")
  elif grep -q '"vue"' package.json 2>/dev/null; then
    stack="Vue"
    platforms+=("PC Web" "H5")
  elif [[ -f "pubspec.yaml" ]]; then
    stack="Flutter"
    platforms+=("iOS" "Android")
  elif [[ -f "metro.config.js" ]] || grep -q '"react-native"' package.json 2>/dev/null; then
    stack="React Native"
    platforms+=("iOS" "Android")
  elif [[ -d "entry/src/main/ets" ]] || [[ -f "hvigorfile.ts" ]]; then
    stack="HarmonyOS"
    platforms+=("鸿蒙")
  fi

  if [[ -f "app.json" && -f "project.config.json" ]]; then
    platforms+=("微信小程序")
  elif [[ -f "mini.project.json" ]]; then
    platforms+=("支付宝小程序")
  fi

  # 尝试用 Node.js 调用 project-detector 获取深度信息
  if command -v node &>/dev/null && [[ -f "$SCRIPT_DIR/../lib/dist/utils/project-detector.js" ]]; then
    extra_info=$(node -e "
      const { detectProjectMeta } = require('$SCRIPT_DIR/../lib/dist/utils/project-detector.js');
      const meta = detectProjectMeta('$PROJECT_DIR');
      const parts = [];
      if (meta.bundler) parts.push('构建: ' + meta.bundler + (meta.bundlerVersion ? '@' + meta.bundlerVersion : ''));
      if (meta.testFramework) parts.push('测试: ' + meta.testFramework);
      if (meta.stateManager) parts.push('状态: ' + meta.stateManager);
      if (meta.styling) parts.push('样式: ' + meta.styling);
      if (meta.router) parts.push('路由: ' + meta.router);
      if (meta.linter) parts.push('Lint: ' + meta.linter);
      if (meta.packageManager) parts.push('包管: ' + meta.packageManager);
      if (meta.monorepoTool) parts.push('Monorepo: ' + meta.monorepoTool);
      console.log(parts.join(' | '));
    " 2>/dev/null || true)
  fi

  echo "$stack"
  echo "检测到的平台: ${platforms[*]+"${platforms[*]}"}"
  if [[ -n "$extra_info" ]]; then
    echo "深度信息: $extra_info"
  fi
}

# ---------------------------------------------------------------------------
# 获取检查文件列表
# ---------------------------------------------------------------------------
get_files() {
  local files=()

  if $STAGED_ONLY; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && files+=("$line")
    done < <(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
  elif [[ -n "$SINCE_REF" ]]; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && files+=("$line")
    done < <(git diff --name-only "$SINCE_REF" HEAD 2>/dev/null || true)
  else
    while IFS= read -r line; do
      files+=("$line")
    done < <(find . -type f \( \
      -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \
      -o -name "*.vue" -o -name "*.css" -o -name "*.scss" -o -name "*.less" \
      -o -name "*.json" \
    \) ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/.git/*" \
       ! -path "*/coverage/*" ! -path "*/build/*" 2>/dev/null)
  fi

  printf '%s\n' "${files[@]}"
}

# ---------------------------------------------------------------------------
# Knip 扫描（未使用依赖/导出/文件）
# ---------------------------------------------------------------------------
run_knip() {
  if ! command -v npx &>/dev/null; then
    echo "  ⚠️ 未检测到 npx，跳过 Knip 扫描"
    return
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 代码库瘦身 (Knip)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local knip_exit=0

  if npx knip --no-exit-code --max-issues 50 --reporter json > "$KNIP_OUTPUT" 2>/dev/null; then
    knip_exit=0
  else
    knip_exit=1
  fi

  if [[ -s "$KNIP_OUTPUT" ]]; then
    echo "   📦 扫描完成（通过 Knip）"

    if command -v node &>/dev/null; then
      node -e "
        try {
          const data = require('$KNIP_OUTPUT');
          const issues = [];
          if (data.unused) {
            for (const [key, arr] of Object.entries(data.unused)) {
              if (arr && arr.length) issues.push(\`\${key}: \${arr.length}\`);
            }
          }
          if (issues.length) console.log('   ' + issues.join(', '));
          else console.log('   ✅ 未发现未使用项');
        } catch(e) {
          console.log('   ⚠️ 解析 Knip 输出失败');
        }
      "
    fi
  else
    echo "   ℹ️ Knip 未检测到问题或项目未配置"
  fi
}

# ---------------------------------------------------------------------------
# AST 引擎（主要引擎）— 一次调用扫描所有模块
# ---------------------------------------------------------------------------
run_ast_engine() {
  local engine_path=""

  if [[ -x "$PROJECT_DIR/node_modules/.bin/fg-core" ]]; then
    engine_path="$PROJECT_DIR/node_modules/.bin/fg-core"
  elif [[ -f "$SCRIPT_DIR/../lib/bin/fg-core.js" ]] && command -v node &>/dev/null; then
    engine_path="node $SCRIPT_DIR/../lib/bin/fg-core.js"
  elif [[ -f "$SCRIPT_DIR/../lib/dist/index.js" ]] && command -v node &>/dev/null; then
    engine_path="node $SCRIPT_DIR/../lib/dist/index.js"
  fi

  if [[ -z "$engine_path" ]]; then
    echo "   ⚠️ 未检测到 Node.js 或 AST 引擎，跳过 AST 深度分析"
    return
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 AST 深度分析（9 大模块）"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local fix_flag=""
  local staged_flag=""
  local diff_flag=""
  if $FIX_MODE; then
    fix_flag="--fix"
  fi
  if $STAGED_ONLY; then
    staged_flag="--staged"
  fi
  if [[ -n "$SINCE_REF" ]]; then
    diff_flag="--diff $SINCE_REF...HEAD"
  fi

  if $engine_path "$PROJECT_DIR" --module all --severity "${SEVERITY:-suggestion}" $fix_flag $staged_flag $diff_flag --json > "$AST_OUTPUT" 2>/dev/null; then
    if [[ -s "$AST_OUTPUT" ]]; then
      # 解析 JSON 统计各模块问题数
      local json_total
      json_total=$(node -e "
        const data = require('$AST_OUTPUT');
        let t = 0;
        for (const mod of Object.values(data.modules || {})) {
          t += mod.total || 0;
        }
        console.log(t);
      " 2>/dev/null || echo 0)

      # 终端输出各模块摘要
      node -e "
        const data = require('$AST_OUTPUT');
        const mods = data.modules || {};
        const order = ['i18n','performance','a11y','security','naming','cross-file','component','hooks','platform'];
        const c = { r: s => '\x1b[31m' + s + '\x1b[0m', y: s => '\x1b[33m' + s + '\x1b[0m', b: s => '\x1b[34m' + s + '\x1b[0m' };
        for (const name of order) {
          const m = mods[name];
          if (!m || m.total === 0) continue;
          const parts = [];
          if (m.issues.critical.length) parts.push(c.r('🔴C:' + m.issues.critical.length));
          if (m.issues.warning.length) parts.push(c.y('🟡W:' + m.issues.warning.length));
          if (m.issues.suggestion.length) parts.push(c.b('💡S:' + m.issues.suggestion.length));
          console.log('   📦 ' + name.padEnd(12) + ' ' + parts.join(' | '));
        }
      " 2>/dev/null || true

      if [[ $json_total -eq 0 ]]; then
        echo "   ✅ AST 分析未发现问题"
      else
        echo "   📊 AST 分析共发现 $json_total 个问题"
      fi
    else
      echo "   ✅ AST 分析未发现问题"
    fi
  else
    echo "   ⚠️ AST 引擎执行失败（项目可能不是 Node.js 项目）"
  fi
}

# ---------------------------------------------------------------------------
# Bash 补充扫描
# ---------------------------------------------------------------------------
run_bash_scanner() {
  local name="$1"
  local script="$2"
  local output_file="$3"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 $name（补充扫描）"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [[ -x "$SCRIPT_DIR/$script" ]]; then
    "$SCRIPT_DIR/$script" "$PROJECT_DIR" > "$output_file" 2>&1 || true
    cat "$output_file"
  else
    echo "⚠️ 扫描脚本不存在: $script，跳过"
  fi
}

# ---------------------------------------------------------------------------
# 解析 Bash scanner 文本输出为结构化 JSON
# 格式:   ❌ [file:line] message
#         ⚠️ [file:line] message
#         💡 [file:line] message
# ---------------------------------------------------------------------------
parse_bash_to_json() {
  local input_file="$1"
  local module_name="$2"
  local output_file="$3"

  if ! command -v node &>/dev/null; then
    echo "{}" > "$output_file"
    return
  fi

  node -e "
    const fs = require('fs');
    const content = fs.readFileSync('$input_file', 'utf-8');
    const lines = content.split('\n');

    const severityMap = {
      '❌': 'critical',
      '🔴': 'critical',
      '⚠️': 'warning',
      '🟡': 'warning',
      '💡': 'suggestion',
    };

    const issues = { critical: [], warning: [], suggestion: [] };

    for (const line of lines) {
      // 匹配:   [emoji] [file:line] message
      const match = line.match(/^\s+([❌🔴⚠️🟡💡])\s+\[(.+?):(\d+)\]\s+(.+)\$/);
      if (!match) continue;

      const [, emoji, file, lineNum, title] = match;
      const severity = severityMap[emoji] || 'warning';

      issues[severity].push({
        file: file.replace(/^\.\//, ''),
        line: parseInt(lineNum, 10) || 1,
        column: 1,
        title: title.trim(),
        description: title.trim(),
        severity,
        ruleId: 'bash-${module_name}',
        source: '',
      });
    }

    const result = {
      engine: 'bash',
      module: '$module_name',
      total: issues.critical.length + issues.warning.length + issues.suggestion.length,
      issues,
    };

    fs.writeFileSync('$output_file', JSON.stringify(result, null, 2));
  " 2>/dev/null || echo "{}" > "$output_file"
}

# ---------------------------------------------------------------------------
# 合并 AST + Bash + Knip 结果为 UnifiedOutput
# ---------------------------------------------------------------------------
merge_results() {
  local output_file="$1"
  local stack="$2"

  if ! command -v node &>/dev/null; then
    echo "{}" > "$output_file"
    return
  fi

  # 构建 Bash 扫描器文件列表
  local bash_files_json="["
  local first=true
  for entry in "${BASH_SCANNERS[@]}"; do
    local json_out="${entry##*:}"
    local mod_name="${entry%%:*}"
    mod_name="${mod_name// /-}"
    if [[ -f "$json_out" ]]; then
      if $first; then first=false; else bash_files_json+=","; fi
      bash_files_json+="{\"name\":\"$mod_name\",\"path\":\"$json_out\"}"
    fi
  done
  bash_files_json+="]"

  node -e "
    const fs = require('fs');

    // 读取 AST 结果
    let astData = { modules: {}, summary: {} };
    if (fs.existsSync('$AST_OUTPUT')) {
      try {
        astData = require('$AST_OUTPUT');
      } catch(e) {
        // AST 结果解析失败，使用空数据
      }
    }

    // 读取 Bash 结果
    const bashFiles = $bash_files_json;
    const bashModules = {};
    for (const bf of bashFiles) {
      if (fs.existsSync(bf.path)) {
        try {
          bashModules[bf.name] = JSON.parse(fs.readFileSync(bf.path, 'utf-8'));
        } catch(e) {
          // 跳过解析失败的文件
        }
      }
    }

    // 读取 Knip 结果
    let knipData = null;
    if (fs.existsSync('$KNIP_OUTPUT')) {
      try {
        knipData = JSON.parse(fs.readFileSync('$KNIP_OUTPUT', 'utf-8'));
      } catch(e) {
        // Knip 结果解析失败
      }
    }

    // 构建 UnifiedOutput
    const unified = {
      summary: {
        timestamp: new Date().toISOString(),
        project: '$PROJECT_DIR',
        stack: '$stack',
        totalFiles: 0,
        issuesBySeverity: { critical: 0, warning: 0, suggestion: 0 },
        duration: 0,
      },
      modules: {},
      external: {},
    };

    // 合并 AST 模块
    const astModules = astData.modules || {};
    for (const [mod, result] of Object.entries(astModules)) {
      if (result && result.total > 0) {
        unified.modules[mod] = {
          engine: 'ast',
          ...result,
        };
        unified.summary.issuesBySeverity.critical += result.issues?.critical?.length || 0;
        unified.summary.issuesBySeverity.warning += result.issues?.warning?.length || 0;
        unified.summary.issuesBySeverity.suggestion += result.issues?.suggestion?.length || 0;
      }
    }

    // 合并 Bash 模块
    for (const [name, result] of Object.entries(bashModules)) {
      if (result && result.total > 0) {
        unified.modules[name] = result;
        unified.summary.issuesBySeverity.critical += result.issues.critical.length;
        unified.summary.issuesBySeverity.warning += result.issues.warning.length;
        unified.summary.issuesBySeverity.suggestion += result.issues.suggestion.length;
      }
    }

    // Knip
    if (knipData) {
      unified.external.knip = knipData;
    }

    unified.summary.totalFiles = astData.summary?.totalFilesScanned || 0;
    unified.summary.duration = astData.summary?.totalDuration || 0;

    fs.writeFileSync('$output_file', JSON.stringify(unified, null, 2));
  "
}

# ---------------------------------------------------------------------------
# 从 UnifiedOutput 生成 Markdown 报告
# ---------------------------------------------------------------------------
generate_report() {
  local report="$OUTPUT_FILE"

  if ! command -v node &>/dev/null; then
    echo "⚠️ Node.js 不可用，无法生成结构化报告" >&2
    return
  fi

  if [[ ! -f "$UNIFIED_OUTPUT" ]]; then
    echo "⚠️ 统一结果文件不存在，无法生成报告" >&2
    return
  fi

  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$UNIFIED_OUTPUT', 'utf-8'));
    const summary = data.summary || {};
    const modules = data.modules || {};
    const external = data.external || {};
    const timestamp = new Date(summary.timestamp).toLocaleString('zh-CN');
    const stack = summary.stack || 'Unknown';
    const totalFiles = summary.totalFiles || 0;
    const sev = summary.issuesBySeverity || {};
    const duration = summary.duration || 0;

    const scanMode = $(if $STAGED_ONLY; then echo '"Staged 文件"'; elif [[ -n "$SINCE_REF" ]]; then echo '"Since $SINCE_REF"'; else echo '"全量扫描"'; fi);

    const labels = {
      i18n: '🌍 i18n 治理',
      performance: '⚡ 性能优化',
      a11y: '♿ 可访问性',
      security: '🛡️ 安全扫描',
      naming: '🏷️ 命名规范',
      'cross-file': '🔗 跨文件分析',
      component: '🏥 组件医生',
      hooks: '⚡ Hooks / Composables',
      platform: '📱 多端平台适配',
      'i18n-治理': '🌍 i18n 治理（补充）',
      '组件医生': '🏥 组件医生（补充）',
      'Hooks-检查': '⚡ Hooks / Composables（补充）',
      '多端适配': '📱 多端平台适配（补充）',
    };

    let md = '';
    md += '# 🛡️ Frontend Guardian 扫描报告\\n\\n';
    md += '| 项目 | 值 |\\n';
    md += '| ---- | ---- |\\n';
    md += '| 扫描时间 | ' + timestamp + ' |\\n';
    md += '| 项目路径 | $PROJECT_DIR |\\n';
    md += '| 检测技术栈 | ' + stack + ' |\\n';
    md += '| 扫描模式 | ' + scanMode + ' |\\n';
    md += '| 扫描文件数 | ' + totalFiles + ' |\\n';
    md += '| 总耗时 | ' + duration + 'ms |\\n';
    md += '\\n';

    md += '## 📊 问题统计\\n\\n';
    md += '| 严重级别 | 数量 |\\n';
    md += '| -------- | ---- |\\n';
    md += '| 🔴 Critical | ' + (sev.critical || 0) + ' |\\n';
    md += '| 🟡 Warning | ' + (sev.warning || 0) + ' |\\n';
    md += '| 💡 Suggestion | ' + (sev.suggestion || 0) + ' |\\n';
    md += '\\n';

    // 按引擎分组输出模块
    const astModules = [];
    const bashModules = [];
    for (const [key, mod] of Object.entries(modules)) {
      if (mod.engine === 'bash') bashModules.push([key, mod]);
      else astModules.push([key, mod]);
    }

    // AST 引擎结果
    const astOrder = ['i18n','performance','a11y','security','naming','cross-file','component','hooks','platform'];
    for (const name of astOrder) {
      const mod = modules[name];
      if (!mod || mod.total === 0) continue;
      const label = labels[name] || name;
      md += '## ' + label + '\\n\\n';

      const all = [
        ...(mod.issues?.critical || []),
        ...(mod.issues?.warning || []),
        ...(mod.issues?.suggestion || []),
      ];
      for (const issue of all) {
        const sev = (issue.severity || 'warning').toUpperCase();
        const icon = sev === 'CRITICAL' ? '🔴' : sev === 'WARNING' ? '🟡' : '💡';
        md += '### ' + icon + ' [' + sev + '] ' + (issue.title || 'Unknown Issue') + '\\n\\n';
        md += '- **文件**: \`' + (issue.file || '') + ':' + (issue.line || 0) + ':' + (issue.column || 0) + '\`\\n';
        md += '- **说明**: ' + (issue.description || issue.title || '') + '\\n';
        if (issue.source) {
          md += '- **源码**: \\n';
          md += '  \`\`\`\\n';
          md += '  ' + issue.source.split('\\n').join('\\n  ') + '\\n';
          md += '  \`\`\`\\n';
        }
        if (issue.fix && issue.fix.text) {
          md += '- **修复建议**: 将 \`' + issue.source + '\` 替换为 \`' + issue.fix.text + '\`\\n';
        }
        md += '\\n';
      }
    }

    // Bash 补充结果
    for (const [name, mod] of bashModules) {
      if (!mod || mod.total === 0) continue;
      const label = labels[name] || name;
      md += '## ' + label + '\\n\\n';

      const all = [
        ...(mod.issues?.critical || []),
        ...(mod.issues?.warning || []),
        ...(mod.issues?.suggestion || []),
      ];
      for (const issue of all) {
        const sev = (issue.severity || 'warning').toUpperCase();
        const icon = sev === 'CRITICAL' ? '🔴' : sev === 'WARNING' ? '🟡' : '💡';
        md += '### ' + icon + ' [' + sev + '] ' + (issue.title || 'Unknown Issue') + '\\n\\n';
        md += '- **文件**: \`' + (issue.file || '') + ':' + (issue.line || 0) + ':' + (issue.column || 0) + '\`\\n';
        md += '- **说明**: ' + (issue.description || issue.title || '') + '\\n';
        md += '\\n';
      }
    }

    // Knip
    if (external.knip) {
      md += '## 🧹 代码库瘦身 (Knip)\\n\\n';
      md += '\`\`\`json\\n';
      md += JSON.stringify(external.knip, null, 2) + '\\n';
      md += '\`\`\`\\n\\n';
    }

    md += '---\\n';
    md += '_Powered by [frontend-guardian](https://github.com/wzm111/frontend-guardian)_\\n';

    fs.writeFileSync('$report', md);
  "

  echo ""
  echo "📄 报告已生成: $report"
}

# ---------------------------------------------------------------------------
# 终端摘要输出
# ---------------------------------------------------------------------------
print_summary() {
  if ! command -v node &>/dev/null; then
    echo "⚠️ Node.js 不可用，无法输出摘要"
    return
  fi

  if [[ ! -f "$UNIFIED_OUTPUT" ]]; then
    return
  fi

  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$UNIFIED_OUTPUT', 'utf-8'));
    const sev = data.summary?.issuesBySeverity || {};
    const c = sev.critical || 0;
    const w = sev.warning || 0;
    const s = sev.suggestion || 0;
    const duration = data.summary?.duration || 0;

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 扫描完成');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   🔴 Critical:  ' + c);
    console.log('   🟡 Warning:   ' + w);
    console.log('   💡 Suggestion: ' + s);
    console.log('');
    console.log('   ⏱️  总耗时: ' + duration + 'ms');
    console.log('');
  "
}

# ---------------------------------------------------------------------------
# 获取统计计数（用于门禁等）
# ---------------------------------------------------------------------------
get_severity_counts() {
  if ! command -v node &>/dev/null; then
    echo "0 0 0"
    return
  fi

  if [[ ! -f "$UNIFIED_OUTPUT" ]]; then
    echo "0 0 0"
    return
  fi

  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$UNIFIED_OUTPUT', 'utf-8'));
    const sev = data.summary?.issuesBySeverity || {};
    console.log((sev.critical || 0) + ' ' + (sev.warning || 0) + ' ' + (sev.suggestion || 0));
  "
}

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
main() {
  echo ""
  echo "🛡️ Frontend Guardian v3.4.0"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  load_config

  # 检测技术栈
  echo ""
  echo "📱 正在检测技术栈..."
  STACK=$(detect_stack | head -1)
  STACK_EXTRA=$(detect_stack | grep "深度信息:" | sed 's/深度信息: //')
  echo "   检测到: $STACK"
  if [[ -n "$STACK_EXTRA" ]]; then
    echo "   $STACK_EXTRA"
  fi

  # 获取文件列表
  echo ""
  echo "📁 正在收集扫描文件..."
  FILE_COUNT=$(get_files | wc -l | tr -d ' ')
  echo "   共 $FILE_COUNT 个文件"

  # 1. AST 深度分析（主要引擎）
  run_ast_engine

  # 2. Bash 补充扫描（覆盖 AST 未迁移的规则）
  for entry in "${BASH_SCANNERS[@]}"; do
    local name="${entry%%:*}"
    local rest="${entry#*:}"
    local script="${rest%%:*}"
    local rest2="${rest#*:}"
    local text_out="${rest2%%:*}"
    local json_out="${rest2##*:}"

    run_bash_scanner "$name" "$script" "$text_out"
    parse_bash_to_json "$text_out" "$name" "$json_out"
  done

  # 3. Knip 代码库瘦身
  run_knip

  # 4. 合并所有结果为 UnifiedOutput
  echo ""
  echo "🔄 正在合并扫描结果..."
  merge_results "$UNIFIED_OUTPUT" "$STACK"
  echo "   ✅ 结果已合并"

  # 5. 生成报告
  generate_report

  # 6. 终端摘要
  print_summary

  # 7. JSON 模式：输出统一 JSON
  if $JSON_MODE; then
    if [[ -f "$UNIFIED_OUTPUT" ]]; then
      echo ""
      echo "📋 统一 JSON 输出："
      cat "$UNIFIED_OUTPUT"
      echo ""
    fi
  fi

  # 8. AI 上下文初始化/更新
  if $INIT_AI; then
    echo ""
    echo "🤖 正在更新 AI 上下文..."
    local init_ai_args=("$PROJECT_DIR" "--agent" "$AI_AGENT" "--report" "$OUTPUT_FILE")
    if [[ -f "$CONFIG_FILE" ]]; then
      local include_files
      include_files=$(grep -A 10 'includeFiles:' "$CONFIG_FILE" 2>/dev/null | grep '^  \- ' | sed 's/^  - //' | tr '\n' ',' | sed 's/,$//')
      if [[ -n "$include_files" ]]; then
        init_ai_args+=("--include" "$include_files")
      fi
    fi
    if bash "$SCRIPT_DIR/init-ai-context.sh" "${init_ai_args[@]}"; then
      echo ""
      echo "✅ AI 上下文已更新"
    else
      echo ""
      echo "⚠️ AI 上下文更新失败"
    fi
  fi

  # 9. 门禁检查
  if $GATE_MODE; then
    local counts
    counts=$(get_severity_counts)
    local CRITICAL_COUNT=$(echo "$counts" | awk '{print $1}')
    if [[ $CRITICAL_COUNT -gt 0 ]]; then
      echo "❌ 门禁未通过: 发现 $CRITICAL_COUNT 个 Critical 问题"
      exit 1
    else
      echo "✅ 门禁通过"
    fi
  fi

  # 严重级别过滤提示
  case "$SEVERITY" in
    critical)
      local counts
      counts=$(get_severity_counts)
      local CRITICAL_COUNT=$(echo "$counts" | awk '{print $1}')
      if [[ $CRITICAL_COUNT -gt 0 ]]; then
        echo "⚠️ 按 critical 级别过滤，发现 $CRITICAL_COUNT 个问题"
      fi
      ;;
    warning)
      local counts
      counts=$(get_severity_counts)
      local CRITICAL_COUNT=$(echo "$counts" | awk '{print $1}')
      local WARNING_COUNT=$(echo "$counts" | awk '{print $2}')
      if [[ $((CRITICAL_COUNT + WARNING_COUNT)) -gt 0 ]]; then
        echo "⚠️ 按 warning 级别过滤，发现 $((CRITICAL_COUNT + WARNING_COUNT)) 个问题"
      fi
      ;;
  esac
}

main "$@"
