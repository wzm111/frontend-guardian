# Frontend Guardian — 项目开发规范

> 本文件供 AI 智能体在处理 frontend-guardian 项目时优先读取，作为上下文参考。

## 项目定位

Frontend Guardian 是一个**前端统一治理助手** Claude Code Skill，覆盖：
- i18n 国际化文案治理
- 组件库使用规范检测
- React Hooks / Vue Composables 检查
- 多端平台适配（小程序、H5、App、鸿蒙）

## 项目结构

```
frontend-guardian/
├── SKILL.md                  # Claude Code 入口（触发条件、指令路由、严重级别）
├── README.md                 # 用户文档（能力矩阵、安装、使用）
├── CLAUDE.md                 # ← 本文件：AI 开发规范
├── install.sh                # 通用安装器（Claude/Cursor/VSCode/CLI）
├── .frontend-guardian.yml    # 配置模板
├── rules/                    # 技术栈专项规则文件
│   ├── react.md              # React 开发规范
│   ├── vue.md                # Vue 3 Composition API 规范
│   ├── nextjs.md             # Next.js 规范
│   ├── nuxt.md               # Nuxt 3 规范
│   ├── harmony.md            # 鸿蒙 ArkTS/ArkUI 规范
│   ├── uniapp.md             # UniApp 跨端规范
│   ├── taro.md               # Taro 跨端规范
│   ├── wechat-mp.md          # 微信小程序原生规范
│   ├── alipay-mp.md          # 支付宝小程序规范
│   ├── flutter.md            # Flutter 规范
│   ├── react-native.md       # React Native 规范
│   ├── antd.md               # Ant Design 规范
│   └── element-plus.md       # Element Plus 规范
├── scripts/                  # 可执行扫描脚本
│   ├── full-scan.sh          # 全量扫描入口
│   ├── scan-i18n.sh          # i18n 治理扫描
│   ├── scan-components.sh    # 组件反模式检测
│   ├── scan-hooks.sh         # Hooks/Composables 检查
│   ├── scan-platform.sh      # 多端平台适配扫描
│   ├── extract-i18n.sh       # 硬编码文案自动提取
│   ├── translate.sh          # 自动翻译缺失语言
│   ├── bundle-size.sh        # 构建产物体积分析
│   ├── export-report.sh      # 报告导出（Markdown→HTML）
│   ├── review-history.sh     # 审查历史追踪
│   └── notifiers/            # 通知渠道脚本
│       ├── feishu.sh         # 飞书
│       ├── dingtalk.sh       # 钉钉
│       ├── wecom.sh          # 企业微信
│       └── slack.sh          # Slack
├── examples/                 # CI/CD 流水线模板
│   ├── aliyun-flow.yml       # 阿里云效 Flow
│   ├── tencent-coding.yml    # 腾讯云 CODING
│   ├── azure-pipelines.yml   # Azure DevOps
│   └── Jenkinsfile           # Jenkins
└── .github/workflows/        # GitHub Actions
    └── frontend-guardian.yml
```

## 添加新规则文件

1. 在 `rules/` 目录下创建 `{tech-stack}.md`
2. 规则格式统一：
   ```markdown
   ### X.Y 规则标题
   **严重程度**: 🔴 Critical / 🟡 Warning / 💡 Suggestion
   **检测方式**: grep/sed/awk 命令或逻辑描述
   **修复建议**: 具体修复方案
   ```
3. 每个文件至少 10 条规则，覆盖该框架的关键场景
4. 在 `SKILL.md` 的「技术栈检测」表格中添加检测特征和规则映射
5. 在 `README.md` 的「支持的技术栈」表格中更新

## 添加新扫描脚本

1. 在 `scripts/` 目录下创建 `{scan-xxx}.sh`
2. 脚本头规范：
   ```bash
   #!/usr/bin/env bash
   # {name}.sh — 一句话描述
   # Usage: {name}.sh [project_path] [options]
   ```
3. 必须使用 `set -euo pipefail`
4. 颜色定义：`RED YELLOW GREEN BLUE NC`
5. 输出格式：
   - `❌` Critical 问题
   - `⚠️` Warning 问题
   - `💡` Suggestion 建议
   - `✅` 通过检查
6. 统计变量使用 `declare -i`
7. 结束时打印汇总统计
8. 在 `SKILL.md` 的「指令路由」中添加新命令
9. 在 `README.md` 的「Scripts 工具箱」中更新

## 代码风格

- Bash 脚本优先使用 POSIX 兼容语法
- 函数使用 `snake_case` 命名
- 局部变量使用 `local` 声明
- 字符串比较使用 `[[ ]]` 而非 `[ ]`
- 路径处理使用 `"$var"` 双引号包裹
- 避免使用 `eval`，优先使用数组传参
- 注释使用 `#` 开头，函数前加空行分隔

## 测试要求

- 每个扫描脚本必须有对应的 `.test.sh` 测试
- 测试在 `tests/` 目录下
- 测试覆盖：正常场景、边界条件、错误处理
- 测试用例使用模拟项目（`tests/fixtures/`）

## CI 集成规范

- 所有 CI 模板必须包含：环境准备、分阶段扫描、质量门禁、PR 评论
- 门禁阈值可配置，默认 Critical = 0 阻断
- 支持参数化：MODULES（扫描模块）、SEVERITY（阈值级别）

## 版本管理

- 版本号在 `full-scan.sh` 中定义：`VERSION="x.y.z"`
- 语义化版本：MAJOR（不兼容变更）、MINOR（新功能）、PATCH（修复）
- 重大变更更新 README 和 SKILL.md
