#!/usr/bin/env bash
#
# slack.sh — Slack 通知
# Usage: slack.sh <webhook_url> <title> <content_file>

set -euo pipefail

WEBHOOK="${1:-${SLACK_WEBHOOK:-}}"
TITLE="${2:-Frontend Guardian 扫描报告}"
CONTENT_FILE="${3:-/dev/stdin}"

if [[ -z "$WEBHOOK" ]]; then
  echo "❌ 缺少 Slack Webhook URL" >&2
  exit 1
fi

CONTENT=""
if [[ -f "$CONTENT_FILE" ]]; then
  CONTENT=$(cat "$CONTENT_FILE")
fi

JSON=$(cat <<EOF
{
  "text": "$TITLE",
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "$TITLE" }
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": $(echo "$CONTENT" | sed 's/"/\\"/g' | jq -Rs '.') }
    }
  ]
}
EOF
)

curl -s -X POST "$WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "$JSON" > /dev/null

echo "✅ Slack 通知已发送"
