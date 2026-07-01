# backend-node-dangerous-eval

禁止在 Node.js 后端代码中使用 `eval()` 或 `new Function()`。

## 严重程度

`critical`

## 说明

`eval()` 和 `new Function()` 会执行任意字符串代码。如果字符串来自用户输入，攻击者可以注入恶意代码并在服务器上执行。后端服务应使用 JSON 解析、模板引擎或安全的表达式求值库替代动态执行。

## 示例

### 错误

```js
const result = eval(userInput);
```

```js
const fn = new Function("a", "b", "return a + b");
```

### 正确

```js
const data = JSON.parse(userInput);
```

## 修复建议

1. 如果只需要解析 JSON，使用 `JSON.parse()`。
2. 如果需要执行受限表达式，使用沙箱化的安全表达式库（如 `jexl`、`jsonata`）。
3. 永远不要将未经验证的用户输入传给 `eval` 或 `new Function`。
