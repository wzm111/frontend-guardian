# backend-rust-unsafe-block

标记 Rust 代码中的 `unsafe` 块。

## 严重程度

`suggestion`

## 说明

`unsafe` 块绕过了 Rust 的内存安全和并发安全保证。虽然某些场景（如 FFI、底层数据结构）必须使用 `unsafe`，但应经过严格的代码评审，并尽量封装在安全的抽象之后。本规则扫描 `.rs` 文件，标记所有 `unsafe { ... }` 块供人工复核。

## 示例

### 触发

```rust
fn raw_pointer() {
    unsafe {
        let _ = std::ptr::null::<i32>();
    }
}
```

### 建议封装

```rust
fn safe_wrapper() {
    // 将 unsafe 封装在最小范围内，并提供安全 API
}
```

## 修复建议

1. 只在必要时使用 `unsafe`。
2. 将 `unsafe` 块限制在最小范围。
3. 为 `unsafe` 代码提供安全封装，并在文档中说明不变量和前置条件。
4. 强制要求 `unsafe` 代码经过两人以上评审。
