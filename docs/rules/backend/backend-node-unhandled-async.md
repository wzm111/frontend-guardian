# backend-node-unhandled-async

检测 Node.js 后端代码中未处理的 `await` 表达式。

## 严重程度

`warning`

## 说明

在后端请求路径中，`await` 表达式如果没有 `try/catch` 或 `.catch()` 保护，Promise 被拒绝时会触发 `unhandledRejection`，极端情况下可能导致进程崩溃。本规则扫描 `.js`、`.ts`、`.mjs`、`.cjs` 文件，发现不在 try 块内且没有链式 `.catch` 的 `await` 调用。

## 示例

### 错误

```ts
async function getUser(req: Request, res: Response) {
  const user = await db.getUser(req.params.id);
  res.json(user);
}
```

### 正确

```ts
async function getUser(req: Request, res: Response) {
  try {
    const user = await db.getUser(req.params.id);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "查询失败" });
  }
}
```

## 修复建议

1. 使用 `try/catch` 包裹 `await` 调用。
2. 或者在 Promise 链上显式调用 `.catch(...)`。
3. 对于 Express/Koa/Nest.js，建议统一使用错误处理中间件兜底。
