# 安全规则 (Security)

参考 OWASP Top 10、SonarQube 安全规则和 CWE 漏洞分类。

## 🔴 Critical

### S001 — 禁止 eval / new Function
- **说明**: `eval()`, `new Function()`, `setTimeout(string)`, `setInterval(string)` 存在代码注入风险
- **修复**: 使用 JSON.parse、模板字符串或安全的序列化库替代
- **示例**:
```javascript
// ❌ 严重错误
eval(userInput);
new Function(userInput)();
setTimeout(userInput, 1000);

// ✅ 正确
JSON.parse(userInput); // 如果输入是 JSON
const result = safeEvaluate(userInput); // 使用沙箱执行
```

### S002 — 禁止使用 innerHTML
- **说明**: `innerHTML` 赋值会导致 XSS 攻击
- **修复**: 使用 `textContent`、安全库（DOMPurify）或框架的安全渲染
- **示例**:
```javascript
// ❌ 错误
element.innerHTML = userInput;

// ✅ 正确
element.textContent = userInput;
element.innerHTML = DOMPurify.sanitize(userInput);
```

### S003 — 禁止硬编码密钥
- **说明**: 禁止在源码中硬编码 API Key、Token、密码等敏感信息
- **检测模式**:
  - `AK[A-Za-z0-9]{16,}` — 阿里云 AccessKey
  - `sk-[a-zA-Z0-9]{48}` — OpenAI API Key
  - `[a-zA-Z0-9]{32}` — 微信/通用 32 位密钥
  - `password\s*=\s*['"][^'"]{4,}['"]` — 硬编码密码
- **修复**: 使用环境变量或密钥管理服务

### S004 — URL 跳转必须校验
- **说明**: `window.open()`, `location.href = ...` 必须校验目标 URL 白名单
- **示例**:
```javascript
// ❌ 错误
window.open(userProvidedUrl);

// ✅ 正确
const allowedHosts = ['example.com', 'api.example.com'];
const url = new URL(userProvidedUrl);
if (allowedHosts.includes(url.hostname)) {
  window.open(userProvidedUrl);
}
```

## 🟡 Warning

### S005 — 防止 SQL/NoSQL 注入
- **说明**: 禁止拼接 SQL/NoSQL 查询字符串
- **修复**: 使用参数化查询或 ORM

### S006 — CSRF 防护
- **说明**: 
  - 敏感操作使用 POST + CSRF Token
  - 设置 `SameSite` Cookie 属性
  - 验证 `Origin` / `Referer` Header

### S007 — 本地存储敏感数据
- **说明**: 禁止在 localStorage / sessionStorage 中存储敏感信息（Token、密码等）
- **修复**: 使用 httpOnly Cookie 或安全存储方案

### S008 — CORS 配置
- **说明**: 
  - 生产环境禁止 `Access-Control-Allow-Origin: *`
  - 仅允许需要的域名和方法
  - 敏感接口不允许跨域

## 💡 Suggestion

### S009 — 依赖安全扫描
- **说明**: 定期使用 `npm audit` 或 Snyk 扫描依赖漏洞
- **建议**: CI 中集成 `npm audit --audit-level=moderate`

### S010 — Content Security Policy (CSP)
- **说明**: 配置 CSP Header 限制资源加载
```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
```
