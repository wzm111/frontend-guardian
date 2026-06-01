#!/usr/bin/env bash
#
# dingtalk.sh — 钉钉通知
# Usage: dingtalk.sh <webhook_url> <title> <content_file>

set -euo pipefail

WEBHOOK="${1:-${DINGTALK_WEBHOOK:-}}"
TITLE="${2:-Frontend Guardian 扫描报告}"
CONTENT_FILE="${3:-/dev/stdin}"

if [[ -z "$WEBHOOK" ]]; then
  echo "❌ 缺少钉钉 Webhook URL" >&2
  exit 1
fi

CONTENT=""
if [[ -f "$CONTENT_FILE" ]]; then
  CONTENT=$(cat "$CONTENT_FILE")
fi

# 截断
if [[ ${#CONTENT} -gt 15000 ]]; then
  CONTENT="${CONTENT:0:15000}\n\n...（内容已截断）"
fi

JSON=$(cat <<EOF
{
  "msgtype": "markdown",
  "markdown": {
    "title": "$TITLE",
    "text": $(echo "$CONTENT" | sed 's/"/\\"/g' | jq -Rs '.')
  }
}
EOF
)

curl -s -X POST "$WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "$JSON" > /dev/null

echo "✅ 钉钉通知已发送"
