# backend-node-hardcoded-secret

检测 Node.js 代码中硬编码的敏感信息。

## 严重程度

`critical`

## 说明

密码、API key、token、私钥等敏感信息不应直接写在源码中。一旦代码泄露，这些凭据会同时暴露。本规则扫描 `.js`、`.ts`、`.mjs`、`.cjs` 文件，对变量名包含 `password`、`secret`、`token`、`apiKey` / `api_key`、`privateKey` / `private_key`、`accessKey` / `access_key` 的字符串字面量赋值进行告警。

## 示例

### 错误

```ts
const apiKey = "sk-1234567890abcdef";
const dbPassword = "P@ssw0rd123";
```

### 正确

```ts
const apiKey = process.env.API_KEY;
const dbPassword = process.env.DB_PASSWORD;
```

## 修复建议

1. 使用环境变量（`process.env.XXX`）或密钥管理服务（如 AWS Secrets Manager、Vault）。
2. 将 `.env` 加入 `.gitignore`。
3. 定期轮换已泄露的凭据。
4. 可在 CI 中集成 `gitleaks` 等工具做二次校验。
