# backend-go-panic-in-handler

禁止在 Go HTTP handler 中使用 `panic()`。

## 严重程度

`warning`

## 说明

在 HTTP 请求路径中调用 `panic()` 会导致整个 Go 进程崩溃，影响所有并发请求。即使外层有 `recover` 中间件，也应该将错误转换为 HTTP 响应并记录日志，而不是 panic。

## 示例

### 错误

```go
func Handler(w http.ResponseWriter, r *http.Request) {
    user, err := db.GetUser(r.Context(), r.URL.Query().Get("id"))
    if err != nil {
        panic(err)
    }
    json.NewEncoder(w).Encode(user)
}
```

### 正确

```go
func Handler(w http.ResponseWriter, r *http.Request) {
    user, err := db.GetUser(r.Context(), r.URL.Query().Get("id"))
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    json.NewEncoder(w).Encode(user)
}
```

## 修复建议

1. 在 handler 中始终返回错误响应，而不是 panic。
2. 使用统一的错误处理中间件或辅助函数。
3. 记录错误日志以便排查，但不要让进程崩溃。
