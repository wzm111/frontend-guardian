#!/usr/bin/env bash
#
# feishu.sh — 飞书 Lark 通知
# Usage: feishu.sh <webhook_url> <title> <content_file>

set -euo pipefail

WEBHOOK="${1:-${FEISHU_WEBHOOK:-}}"
TITLE="${2:-Frontend Guardian 扫描报告}"
CONTENT_FILE="${3:-/dev/stdin}"

if [[ -z "$WEBHOOK" ]]; then
  echo "❌ 缺少飞书 Webhook URL" >&2
  echo "   设置 FEISHU_WEBHOOK 环境变量或传入参数" >&2
  exit 1
fi

# 读取内容
CONTENT=""
if [[ -f "$CONTENT_FILE" ]]; then
  CONTENT=$(cat "$CONTENT_FILE")
elif [[ "$CONTENT_FILE" != "/dev/stdin" ]]; then
  CONTENT="$CONTENT_FILE"
fi

# 截断内容（飞书限制 4096 字符）
if [[ ${#CONTENT} -gt 4000 ]]; then
  CONTENT="${CONTENT:0:4000}\n\n...（内容已截断）"
fi

# 构建飞书消息
JSON=$(cat <<EOF
{
  "msg_type": "interactive",
  "card": {
    "header": {
      "title": { "tag": "plain_text", "content": "$TITLE" },
      "template": "blue"
    },
    "elements": [
      {
        "tag": "div",
        "text": { "tag": "lark_md", "content": $(echo "$CONTENT" | sed 's/"/\\"/g' | jq -Rs '.') }
      },
      {
        "tag": "note",
        "elements": [
          { "tag": "plain_text", "content": "Powered by Frontend Guardian" }
        ]
      }
    ]
  }
}
EOF
)

# 发送
curl -s -X POST "$WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "$JSON" > /dev/null

echo "✅ 飞书通知已发送"
