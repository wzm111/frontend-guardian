# css-too-many-imports

限制单个 CSS 文件中的 `@import` 数量。

## 严重程度

`suggestion`

## 说明

过多的 `@import` 会阻塞渲染、增加 HTTP 请求数量，影响首屏加载性能。本规则在单个 CSS 文件中 `@import` 数量超过 10 个时给出建议。

## 示例

### 错误

```css
@import "a.css";
@import "b.css";
/* ... 超过 10 个 @import */
```

### 正确

```css
/* 使用构建工具合并 CSS */
@import "bundle.css";
```

## 修复建议

1. 使用构建工具（Vite、Webpack、PostCSS）合并 CSS 文件。
2. 将关键 CSS 内联到 HTML，非关键 CSS 异步加载。
3. 优先使用 `link` 标签并行加载，而不是 `@import`。
