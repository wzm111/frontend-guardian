# yaml-invalid-syntax

检测 YAML 文件是否存在语法错误。

## 严重程度

`critical`

## 说明

YAML 语法错误会导致配置文件、CI 流水线或部署清单解析失败。本规则使用 `yaml` 包的 `parseDocument` 解析文件，并报告首个语法错误的位置。重复键问题由 `yaml-duplicate-key` 单独检查，避免与本规则重复报告。

## 常见问题

- 缩进不一致（空格与 Tab 混用）
- 冒号后缺少空格
- 未正确关闭的引号或块标量
- 非法的锚点/引用语法

## 示例

### 错误

```yaml
name: app
  version: 1
```

### 正确

```yaml
name: app
version: 1
```

## 修复建议

1. 使用支持 YAML 校验的编辑器。
2. 统一使用 2 个空格缩进，避免 Tab。
3. 在 CI 中运行 YAML linter（如 `yamllint`）。
