#!/usr/bin/env bash
#
# frontend-guardian — 一键初始化脚手架
# 根据检测到的技术栈创建符合治理规范的目录结构和配置文件
#
# Usage: init-scaffold.sh [project_path] [--stack <stack>] [--force]
#
# Options:
#   --stack <name>   指定技术栈: react | vue | nextjs | nuxt | uniapp | taro | wechat-mp | harmony
#   --force          强制覆盖已有文件
#   --skip-install   跳过 npm install
#   --skip-ai        跳过 AI 上下文初始化
#
# Examples:
#   init-scaffold.sh ./my-project
#   init-scaffold.sh ./my-project --stack react
#   init-scaffold.sh ./my-project --stack uniapp --force

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR=""
STACK=""
FORCE=false
SKIP_INSTALL=false
SKIP_AI=false

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# 解析参数
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --stack)      STACK="$2"; shift 2 ;;
    --force)      FORCE=true; shift ;;
    --skip-install) SKIP_INSTALL=true; shift ;;
    --skip-ai)    SKIP_AI=true; shift ;;
    --help|-h)
      head -n 20 "$0" | tail -n +3 | sed 's/^# //'
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

if [[ -z "$PROJECT_DIR" ]]; then
  echo "❌ 请指定项目目录"
  echo "Usage: init-scaffold.sh <project-path> [options]"
  exit 1
fi

mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"
PROJECT_DIR="$(pwd)"

echo ""
echo "🛠️  Frontend Guardian 脚手架初始化"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   项目路径: $PROJECT_DIR"
echo ""

# ---------------------------------------------------------------------------
# 检测技术栈
# ---------------------------------------------------------------------------
detect_stack() {
  if [[ -n "$STACK" ]]; then
    echo "$STACK"
    return
  fi

  # 已有项目文件检测
  if [[ -f "package.json" ]]; then
    if grep -q '"next"' package.json 2>/dev/null; then
      echo "nextjs"
      return
    fi
    if grep -q '"nuxt"' package.json 2>/dev/null || [[ -f "nuxt.config.ts" ]]; then
      echo "nuxt"
      return
    fi
    if grep -q '"@dcloudio/uni-app"' package.json 2>/dev/null || [[ -f "manifest.json" ]]; then
      echo "uniapp"
      return
    fi
    if grep -q '"@tarojs/taro"' package.json 2>/dev/null; then
      echo "taro"
      return
    fi
    if grep -q '"react"' package.json 2>/dev/null; then
      echo "react"
      return
    fi
    if grep -q '"vue"' package.json 2>/dev/null; then
      echo "vue"
      return
    fi
    if [[ -d "entry/src/main/ets" ]] || [[ -f "hvigorfile.ts" ]]; then
      echo "harmony"
      return
    fi
  fi

  # 询问用户
  echo "🤔 未能自动检测技术栈，请选择："
  echo "   1) React + Vite"
  echo "   2) Vue + Vite"
  echo "   3) Next.js"
  echo "   4) Nuxt"
  echo "   5) UniApp"
  echo "   6) Taro"
  echo "   7) 微信小程序原生"
  echo "   8) 鸿蒙 HarmonyOS"
  echo ""
  read -rp "   选择 [1-8]: " choice

  case "$choice" in
    1) echo "react" ;;
    2) echo "vue" ;;
    3) echo "nextjs" ;;
    4) echo "nuxt" ;;
    5) echo "uniapp" ;;
    6) echo "taro" ;;
    7) echo "wechat-mp" ;;
    8) echo "harmony" ;;
    *) echo "react" ;;
  esac
}

STACK=$(detect_stack)
echo "   检测/选择技术栈: $STACK"
echo ""

# ---------------------------------------------------------------------------
# 创建目录结构
# ---------------------------------------------------------------------------
create_dirs() {
  echo "📁 创建目录结构..."

  local dirs=()

  case "$STACK" in
    react|nextjs)
      dirs=(
        "src/components"
        "src/components/common"
        "src/components/layout"
        "src/hooks"
        "src/utils"
        "src/services"
        "src/types"
        "src/constants"
        "src/locales/zh-CN"
        "src/locales/en"
        "src/styles"
        "src/pages"
        "src/store"
        "public"
        "tests"
        "scripts"
      )
      ;;
    vue|nuxt)
      dirs=(
        "src/components"
        "src/components/common"
        "src/components/layout"
        "src/composables"
        "src/utils"
        "src/services"
        "src/types"
        "src/constants"
        "src/locales/zh-CN"
        "src/locales/en"
        "src/styles"
        "src/pages"
        "src/store"
        "public"
        "tests"
        "scripts"
      )
      ;;
    uniapp|taro)
      dirs=(
        "src/components"
        "src/components/common"
        "src/hooks"
        "src/utils"
        "src/services"
        "src/types"
        "src/constants"
        "src/locales/zh-CN"
        "src/locales/en"
        "src/styles"
        "src/pages"
        "src/store"
        "static"
        "tests"
        "scripts"
      )
      ;;
    wechat-mp)
      dirs=(
        "components"
        "components/common"
        "pages"
        "utils"
        "services"
        "constants"
        "locales"
        "styles"
        "images"
      )
      ;;
    harmony)
      dirs=(
        "entry/src/main/ets/components"
        "entry/src/main/ets/pages"
        "entry/src/main/ets/utils"
        "entry/src/main/ets/services"
        "entry/src/main/ets/constants"
        "entry/src/main/ets/locales"
        "entry/src/main/resources"
      )
      ;;
    *)
      dirs=(
        "src/components"
        "src/utils"
        "src/services"
        "src/types"
        "src/constants"
        "src/locales"
        "src/styles"
        "src/pages"
        "tests"
      )
      ;;
  esac

  for dir in "${dirs[@]}"; do
    if [[ ! -d "$dir" ]] || $FORCE; then
      mkdir -p "$dir"
      echo "   ✅ $dir"
    else
      echo "   ⏭️  $dir (已存在)"
    fi
  done
}

# ---------------------------------------------------------------------------
# 生成 .frontend-guardian.yml
# ---------------------------------------------------------------------------
generate_config() {
  local config_file=".frontend-guardian.yml"

  if [[ -f "$config_file" ]] && ! $FORCE; then
    echo "   ⏭️  $config_file (已存在，使用 --force 覆盖)"
    return
  fi

  echo "📄 生成治理配置文件..."

  cat > "$config_file" << 'EOF'
# Frontend Guardian 治理配置
# 文档: https://github.com/wzm111/frontend-guardian

# i18n 配置
i18n:
  sourceLocale: zh-CN
  targetLocales:
    - en
    - ja
  format: json
  keyPattern: "{{namespace}}.{{key}}"
  extractPaths:
    - src/**/*.tsx
    - src/**/*.ts
    - src/**/*.jsx
    - src/**/*.js
  ignorePaths:
    - src/**/*.test.*
    - src/**/*.spec.*
    - src/__mocks__/**
  interpolationPattern: "{{}}"
  translateProvider: openai

# 组件配置
component:
  library: auto
  themeTokenPrefix: "token"
  maxSelectOptions: 100
  checkA11y: true
  checkPerf: true

# Hooks 配置
hooks:
  maxEffectDeps: 6
  checkClosure: true
  checkCustomHookNaming: true
  checkVueComposables: true

# 平台配置
platform:
  targets:
    - pc
    - h5
  mp:
    type: wechat
    maxMainPackageSize: 2048
    maxSubPackageSize: 2048
    maxBase64ImageSize: 10
    maxPageStack: 10
  mobile:
    minTouchTarget: 44
    checkSafeArea: true
    checkClickDelay: true
    checkKeyboard: true

# 命名规范配置
naming:
  classCase: PascalCase
  interfaceCase: PascalCase
  typeAliasCase: PascalCase
  functionCase: camelCase
  variableCase: camelCase
  constantCase: UPPER_SNAKE_CASE
  enumCase: PascalCase
  enumMemberCase: UPPER_SNAKE_CASE
  privatePrefix: underscore
  fileNameCase: kebab-case
  folderNameCase: kebab-case
  allowSingleLetter: true
  allowPascalCaseComponents: true
  ignorePatterns:
    - "^_"
    - "^\\$"

# 扫描配置
scan:
  includeExtensions:
    - .js
    - .ts
    - .jsx
    - .tsx
    - .vue
  excludeDirs:
    - node_modules
    - dist
    - build
    - .git
    - coverage
    - public
    - static
  excludePatterns:
    - "**/*.test.*"
    - "**/*.spec.*"
    - "**/__mocks__/**"
    - "**/setupTests.*"

# 门禁配置
gate:
  enabled: true
  critical:
    max: 0
  warning:
    max: 10
  suggestion:
    max: 20
  blockPipeline: false

# AI 上下文配置
aiContext:
  agent: claude
  includeFiles:
    - README.md
    - src/types/**
    - src/constants/**
  autoUpdate: true
  excludeDirs:
    - node_modules
    - dist
    - .git
EOF

  echo "   ✅ $config_file"
}

# ---------------------------------------------------------------------------
# 生成示例文件
# ---------------------------------------------------------------------------
generate_examples() {
  echo "📝 生成示例文件..."

  case "$STACK" in
    react|nextjs)
      # i18n 工具函数示例
      if [[ ! -f "src/utils/i18n.ts" ]] || $FORCE; then
        cat > "src/utils/i18n.ts" << 'EOF'
/**
 * i18n 工具函数
 * 封装 t() 调用，统一处理 key 缺失回退
 */

import { useTranslation } from 'react-i18next';

export function useI18n(namespace?: string) {
  const { t, i18n } = useTranslation(namespace);

  return {
    t: (key: string, options?: Record<string, unknown>) => {
      const translated = t(key, options);
      // 开发环境标记未翻译的 key
      if (process.env.NODE_ENV === 'development' && translated === key) {
        console.warn(`[i18n] Missing translation: ${key}`);
      }
      return translated;
    },
    i18n,
    currentLocale: i18n.language,
  };
}
EOF
        echo "   ✅ src/utils/i18n.ts"
      fi

      # 请求封装示例
      if [[ ! -f "src/services/request.ts" ]] || $FORCE; then
        cat > "src/services/request.ts" << 'EOF'
/**
 * HTTP 请求封装
 * 统一处理错误、loading、token、i18n 头部
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface RequestOptions extends RequestInit {
  timeout?: number;
}

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { timeout = 10000, ...rest } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${BASE_URL}${url}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': localStorage.getItem('locale') || 'zh-CN',
        ...rest.headers,
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}
EOF
        echo "   ✅ src/services/request.ts"
      fi

      # 常量示例
      if [[ ! -f "src/constants/api.ts" ]] || $FORCE; then
        cat > "src/constants/api.ts" << 'EOF'
/**
 * API 常量
 * 所有接口路径集中管理
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const API_PATHS = {
  USER: {
    LOGIN: '/api/user/login',
    LOGOUT: '/api/user/logout',
    PROFILE: '/api/user/profile',
  },
} as const;
EOF
        echo "   ✅ src/constants/api.ts"
      fi

      # 语言包示例
      if [[ ! -f "src/locales/zh-CN/common.json" ]] || $FORCE; then
        cat > "src/locales/zh-CN/common.json" << 'EOF'
{
  "welcome": "欢迎使用",
  "loading": "加载中...",
  "error": "出错了",
  "retry": "重试",
  "confirm": "确认",
  "cancel": "取消",
  "submit": "提交",
  "search": "搜索"
}
EOF
        echo "   ✅ src/locales/zh-CN/common.json"
      fi

      if [[ ! -f "src/locales/en/common.json" ]] || $FORCE; then
        cat > "src/locales/en/common.json" << 'EOF'
{
  "welcome": "Welcome",
  "loading": "Loading...",
  "error": "Error",
  "retry": "Retry",
  "confirm": "Confirm",
  "cancel": "Cancel",
  "submit": "Submit",
  "search": "Search"
}
EOF
        echo "   ✅ src/locales/en/common.json"
      fi
      ;;

    vue|nuxt|uniapp)
      # Vue composable 示例
      if [[ ! -f "src/composables/use-i18n.ts" ]] || $FORCE; then
        cat > "src/composables/use-i18n.ts" << 'EOF'
/**
 * i18n Composable
 */

import { getCurrentInstance } from 'vue';

export function useI18n() {
  const instance = getCurrentInstance();
  const t = (key: string, params?: Record<string, unknown>) => {
    // 实际项目中使用 vue-i18n
    return key;
  };

  return { t };
}
EOF
        echo "   ✅ src/composables/use-i18n.ts"
      fi

      # 请求封装
      if [[ ! -f "src/services/request.ts" ]] || $FORCE; then
        cat > "src/services/request.ts" << 'EOF'
import axios from 'axios';

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 10000,
});

request.interceptors.request.use((config) => {
  config.headers['Accept-Language'] = localStorage.getItem('locale') || 'zh-CN';
  return config;
});

export default request;
EOF
        echo "   ✅ src/services/request.ts"
      fi
      ;;

    *)
      echo "   ℹ️  暂不提供 $STACK 的示例文件"
      ;;
  esac
}

# ---------------------------------------------------------------------------
# 安装推荐依赖
# ---------------------------------------------------------------------------
install_deps() {
  if $SKIP_INSTALL; then
    echo "⏭️  跳过依赖安装 (--skip-install)"
    return
  fi

  # 如果未检测到 package.json，自动生成一个基础文件
  if [[ ! -f "package.json" ]]; then
    echo "📦 未检测到 package.json，自动生成基础配置..."
    local pkg_name=$(basename "$PROJECT_DIR")
    cat > "package.json" << EOF
{
  "name": "${pkg_name}",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  }
}
EOF
    echo "   ✅ package.json 已生成"
  fi

  echo "📦 安装推荐依赖..."

  local deps=()
  local devDeps=()

  case "$STACK" in
    react|nextjs)
      deps+=("react-i18next" "i18next")
      devDeps+=("@types/react" "@types/react-dom")
      ;;
    vue|nuxt|uniapp|taro)
      deps+=("vue-i18n")
      ;;
  esac

  # 通用依赖
  devDeps+=("typescript" "eslint" "prettier" "@frontend-guardian/core")

  if [[ ${#deps[@]} -gt 0 ]]; then
    echo "   安装运行时依赖: ${deps[*]}"
    npm install "${deps[@]}" --save 2>/dev/null || echo "   ⚠️ 部分依赖安装失败（可能已存在）"
  fi

  if [[ ${#devDeps[@]} -gt 0 ]]; then
    echo "   安装开发依赖: ${devDeps[*]}"
    npm install "${devDeps[@]}" --save-dev 2>/dev/null || echo "   ⚠️ 部分依赖安装失败（可能已存在）"
  fi
}

# ---------------------------------------------------------------------------
# 初始化 AI 上下文
# ---------------------------------------------------------------------------
init_ai_context() {
  if $SKIP_AI; then
    echo "⏭️  跳过 AI 上下文初始化 (--skip-ai)"
    return
  fi

  echo "🤖 初始化 AI 上下文文件..."

  if [[ -f "$SCRIPT_DIR/init-ai-context.sh" ]]; then
    bash "$SCRIPT_DIR/init-ai-context.sh" "$PROJECT_DIR" --agent claude 2>/dev/null || true
    echo "   ✅ AI 上下文已初始化"
  else
    echo "   ⚠️  init-ai-context.sh 不存在，跳过"
  fi
}

# ---------------------------------------------------------------------------
# 生成 .gitignore
# ---------------------------------------------------------------------------
generate_gitignore() {
  if [[ -f ".gitignore" ]] && ! $FORCE; then
    return
  fi

  cat > ".gitignore" << 'EOF'
# Dependencies
node_modules/
.pnp
.pnp.js

# Build outputs
dist/
build/
*.tsbuildinfo

# Environment
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Coverage
coverage/
.nyc_output/

# Temporary
tmp/
temp/
*.tmp

# Cache
.eslintcache
.prettiercache
.parcel-cache/

# Frontend Guardian
frontend-guardian-report.md
EOF

  echo "   ✅ .gitignore"
}

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
main() {
  create_dirs
  generate_config
  generate_examples
  generate_gitignore
  init_ai_context
  install_deps

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ 脚手架初始化完成！"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "技术栈: $STACK"
  echo "项目路径: $PROJECT_DIR"
  echo ""
  echo "下一步:"
  echo "   1. 编辑 .frontend-guardian.yml 调整配置"
  echo "   2. 运行 frontend-guardian --scan 进行首次扫描"
  echo "   3. 运行 frontend-guardian --init-ai 更新 AI 上下文"
  echo ""
}

main
