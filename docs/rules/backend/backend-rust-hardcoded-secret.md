# backend-rust-hardcoded-secret

检测 Rust 代码中硬编码的敏感信息。

## 严重程度

`critical`

## 说明

Rust 后端服务中硬编码密码、API key、token 等会导致泄露风险。本规则扫描 `.rs` 文件，对 `let` / `static` / `const` 声明中变量名包含 `password`、`secret`、`token`、`apiKey` / `api_key`、`privateKey` / `private_key`、`accessKey` / `access_key` 的字符串字面量赋值进行告警。

## 示例

### 错误

```rust
static API_KEY: &str = "secret-api-key-12345";
```

### 正确

```rust
static API_KEY: &str = env!("API_KEY");
```

或使用运行时读取：

```rust
let api_key = std::env::var("API_KEY").expect("API_KEY must be set");
```

## 修复建议

1. 使用环境变量或编译期环境宏（`env!("...")`）。
2. 生产环境使用密钥管理服务。
3. 将 `.env` 和包含凭据的配置文件加入 `.gitignore`。
4. 定期轮换凭据。
