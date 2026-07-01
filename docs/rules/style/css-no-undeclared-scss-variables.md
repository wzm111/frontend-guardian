# css-no-undeclared-scss-variables

禁止在 SCSS/SASS 文件中使用未声明的变量。

## 严重程度

`critical`

## 说明

引用未定义的 SCSS 变量会在编译阶段直接报错，阻塞构建。本规则扫描 `.scss` 和 `.sass` 文件，记录所有 `$variable:` 声明位置，然后检查所有 `$variable` 引用是否能在当前文件中找到声明。

## 示例

### 错误

```scss
.button {
  color: $primary-color;
}
```

### 正确

```scss
$primary-color: #1890ff;

.button {
  color: $primary-color;
}
```

## 修复建议

1. 确保变量在使用前已在当前文件或通过 `@import` / `@use` 引入。
2. 对于跨文件变量，确认已正确导入对应的 variables 文件。
3. 注意本规则只进行单文件静态分析，无法解析 Sass 模块系统的作用域。
