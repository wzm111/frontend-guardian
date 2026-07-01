# yaml-duplicate-key

检测同一层级 YAML 映射中是否存在重复键。

## 严重程度

`warning`

## 说明

YAML 规范允许但通常不建议重复键，因为解析器行为可能不一致（有的保留后一个值，有的报错）。本规则在确认 YAML 语法合法后，递归遍历所有映射节点，报告同一层级中的重复键。

## 示例

### 错误

```yaml
name: app
name: dashboard
```

### 正确

```yaml
name: app
display_name: dashboard
```

## 修复建议

1. 删除或合并重复键。
2. 如果需要多值，请使用 YAML 序列（数组）。
3. 不同层级的映射允许使用相同键名，本规则不会跨层级误报。
