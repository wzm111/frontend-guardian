# frontend-guardian 规则市场

`market/index.json` 是 frontend-guardian 的默认规则市场索引。用户可以通过 `extends: market:<name>` 在配置中引用已审核的规则包。

## 索引格式

```json
{
  "version": "1.0.0",
  "updatedAt": "2026-07-01T00:00:00.000Z",
  "packages": [
    {
      "name": "react-hooks",
      "npmName": "frontend-guardian-plugin-react-hooks",
      "description": "React Hooks 最佳实践规则集",
      "author": "frontend-guardian community",
      "tags": ["react", "hooks"],
      "minEngineVersion": "3.17.0",
      "categories": ["hooks"],
      "rules": ["react-hooks-deps"],
      "docsUrl": "https://github.com/wzm111/frontend-guardian/tree/main/market#react-hooks"
    }
  ]
}
```

## 字段说明

- `name`: 市场别名，用户在 `extends: market:<name>` 中使用。
- `npmName`: 实际要安装的 npm 包名。
- `minEngineVersion`: 要求的最低 frontend-guardian-core 版本。
- `categories`: 该包覆盖的规则分类。

## 如何提交新包

1. 开发并发布 npm 包，导出 `{ config?: ProjectConfig, rules?: Rule[] }`。
2. 在 `market/index.json` 中追加一条 `MarketPackage` 记录。
3. 提交 PR，说明包用途、测试覆盖率和示例项目。

## 远程索引

可通过环境变量 `FG_MARKET_INDEX_URL` 或配置文件 `marketIndex.url` 覆盖默认索引：

```yaml
marketIndex:
  url: https://your-team.example.com/fg-market.json
```
