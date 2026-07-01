# backend-rust-unwrap-in-request

禁止在 Rust 后端请求处理路径中使用 `unwrap()` / `expect()`。

## 严重程度

`warning`

## 说明

在 actix-web、axum、rocket 等框架的请求 handler 中，`unwrap()` 或 `expect()` 会在失败时直接 panic，导致当前请求崩溃，并可能影响整个工作线程。应使用 `?` 传播错误，配合自定义 `ResponseError` 返回合适的 HTTP 错误响应。

## 示例

### 错误

```rust
#[get("/users/{id}")]
async fn get_user(path: web::Path<(i64,)>) -> impl Responder {
    let user = db::find(path.0).unwrap();
    HttpResponse::Ok().json(user)
}
```

### 正确

```rust
#[get("/users/{id}")]
async fn get_user(path: web::Path<(i64,)>) -> Result<impl Responder, MyError> {
    let user = db::find(path.0).await?;
    Ok(HttpResponse::Ok().json(user))
}
```

## 修复建议

1. 在 handler 中使用 `?` 传播错误。
2. 为业务错误实现 `ResponseError` 或 `IntoResponse`，返回结构化错误体。
3. 仅在启动代码、测试代码或经严格审查的非请求路径中使用 `unwrap`/`expect`。
