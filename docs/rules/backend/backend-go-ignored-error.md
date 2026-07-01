# backend-go-ignored-error

检测 Go 代码中使用 `_` 忽略错误后未进行判断的情况。

## 严重程度

`warning`

## 说明

Go 的惯用写法是对函数返回的 `error` 进行检查。如果使用 `_` 忽略了某个返回值，但下一行没有立即检查 `err != nil`，很可能遗漏了错误处理。本规则检测 `_, err := ...` 模式，并检查下一行是否包含 `if err != nil` 或 `if err == nil`。

## 示例

### 错误

```go
func main() {
    _, err := db.Exec(query)
    fmt.Println("done")
}
```

### 正确

```go
func main() {
    _, err := db.Exec(query)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("done")
}
```

## 修复建议

1. 使用 `_` 忽略错误时，确保有明确理由。
2. 常规场景应使用具名 `err` 并在下一行检查 `if err != nil`。
3. 考虑使用 `golangci-lint` 等工具进行更完整的错误处理检查。
