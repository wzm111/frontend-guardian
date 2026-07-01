# backend-go-hardcoded-secret

检测 Go 代码中硬编码的敏感信息。

## 严重程度

`critical`

## 说明

Go 后端服务中硬编码密码、API key、token 等会导致泄露风险。本规则扫描 `.go` 文件，对 `var` / `const` 声明中变量名包含 `password`、`secret`、`token`、`apiKey` / `api_key`、`privateKey` / `private_key`、`accessKey` / `access_key` 的字符串字面量赋值进行告警。

## 示例

### 错误

```go
const accessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
```

### 正确

```go
var accessToken = os.Getenv("ACCESS_TOKEN")
```

## 修复建议

1. 通过环境变量读取敏感配置（`os.Getenv`）。
2. 使用密钥管理服务集中管理凭据。
3. 将包含敏感信息的配置文件加入 `.gitignore`。
4. 在 CI 中集成秘密扫描工具。
