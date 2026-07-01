# css-no-important

禁止在 CSS/SCSS 中使用 `!important`。

## 严重程度

`warning`

## 说明

`!important` 会覆盖正常的层叠和特异性计算，导致样式难以维护和调试。频繁使用 `!important` 通常是选择器设计或 CSS 架构问题的信号。本规则扫描 `.css`、`.scss`、`.less` 文件中的 `!important` 关键字。

## 示例

### 错误

```css
.button {
  color: red !important;
}
```

### 正确

```css
.button--primary {
  color: red;
}
```

## 修复建议

1. 提高选择器特异性，而不是使用 `!important`。
2. 使用 BEM、OOCSS 或 CSS Modules 等命名规范减少冲突。
3. 仅在覆盖第三方库且无法修改源码时谨慎使用，并添加注释说明。
