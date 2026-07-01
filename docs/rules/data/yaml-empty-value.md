# yaml-empty-value

检测 YAML 中键值显式为空的写法。

## 严重程度

`warning`

## 说明

`key:` 这种没有值的写法在 YAML 中会被解析为 `null`，容易与漏写值或占位符混淆。本规则会标记这类歧义空值，但显式的 `~` 或 `null` 不会被报告。

## 示例

### 错误

```yaml
name: app
secret:
```

### 正确

```yaml
name: app
secret: ""
```

```yaml
name: app
secret: ~
```

## 修复建议

1. 如果确实需要空字符串，请显式写成 `""`。
2. 如果确实需要 `null`，请使用 `~` 或 `null` 提高可读性。
3. 对于可选配置，建议删除该键或添加注释说明。
