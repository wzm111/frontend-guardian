#!/usr/bin/env bash
#
# wecom.sh — 企业微信通知
# Usage: wecom.sh <webhook_url> <title> <content_file>

set -euo pipefail

WEBHOOK="${1:-${WECOM_WEBHOOK:-}}"
TITLE="${2:-Frontend Guardian 扫描报告}"
CONTENT_FILE="${3:-/dev/stdin}"

if [[ -z "$WEBHOOK" ]]; then
  echo "❌ 缺少企业微信 Webhook URL" >&2
  exit 1
fi

CONTENT=""
if [[ -f "$CONTENT_FILE" ]]; then
  CONTENT=$(cat "$CONTENT_FILE")
fi

if [[ ${#CONTENT} -gt 4000 ]]; then
  CONTENT="${CONTENT:0:4000}\n\n...（内容已截断）"
fi

JSON=$(cat <<EOF
{
  "msgtype": "markdown",
  "markdown": {
    "content": $(echo "$TITLE\n\n$CONTENT" | sed 's/"/\\"/g' | jq -Rs '.')
  }
}
EOF
)

curl -s -X POST "$WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "$JSON" > /dev/null

echo "✅ 企业微信通知已发送"
