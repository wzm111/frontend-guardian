# markdown-no-todo-link

检测 Markdown 中使用 `TODO` 作为占位链接目标的链接。

## 严重程度

`warning`

## 说明

`[文本](TODO)` 这类写法通常表示作者计划后续补充链接，但很容易遗漏。本规则帮助发现文档中的占位链接，避免发布到生产环境或对外文档中。

## 示例

### 错误

```markdown
# 文档

详情请见 [API 文档](TODO)。
```

### 正确

```markdown
# 文档

详情请见 [API 文档](https://example.com/api)。
```

## 修复建议

将 `TODO` 替换为实际 URL，或暂时移除链接仅保留纯文本。
