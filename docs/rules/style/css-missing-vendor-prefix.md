# css-missing-vendor-prefix

检测可能需要浏览器前缀的 CSS 属性是否缺少前缀。

## 严重程度

`suggestion`

## 说明

部分 CSS 属性在旧版本浏览器中需要带 `-webkit-`、`-moz-` 或 `-ms-` 前缀才能生效。如果项目没有配置 autoprefixer，应手动添加必要前缀。本规则默认关闭，适用于需要兼容旧浏览器的项目。

## 检测属性

| 属性 | 建议前缀 |
|------|---------|
| `user-select` | `-webkit-`、`-moz-`、`-ms-` |
| `appearance` | `-webkit-`、`-moz-` |
| `backdrop-filter` | `-webkit-` |
| `clip-path` | `-webkit-` |

## 示例

### 错误

```css
.button {
  user-select: none;
}
```

### 正确

```css
.button {
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}
```

## 修复建议

1. 推荐在构建流程中配置 autoprefixer，避免手动维护前缀。
2. 如果必须手动书写，请按标准顺序书写：前缀版本在前，标准版本在后。
3. 根据项目目标浏览器范围决定是否需要启用本规则。
