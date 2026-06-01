# 性能优化规则 (Performance)

## 🔴 Critical

### P001 — 避免请求瀑布
- **说明**: 不要连续使用 `await` 获取独立数据，应使用 `Promise.all` 并行
- **示例**:
```javascript
// ❌ 错误: 顺序请求，总耗时 = A + B + C
const a = await fetchA();
const b = await fetchB();
const c = await fetchC();

// ✅ 正确: 并行请求，总耗时 = max(A, B, C)
const [a, b, c] = await Promise.all([fetchA(), fetchB(), fetchC()]);
```

### P002 — 禁止同步 I/O 在渲染线程
- **说明**: 在 React/Vue 组件渲染或事件处理中禁止同步文件读取、localStorage 大量读写

## 🟡 Warning

### P003 — 大组件懒加载
- **说明**: 首屏超过 50KB（gzip 后）的组件应使用动态导入
- **React**: `React.lazy(() => import('./HeavyComponent'))`
- **Vue**: `defineAsyncComponent(() => import('./HeavyComponent.vue'))`
- **Next.js**: `dynamic(() => import('./HeavyComponent'))`

### P004 — 避免整库导入
- **说明**: 应从组件库子模块导入，而非入口文件
- **示例**:
```javascript
// ❌ 错误: 导入整个 antd
import { Button } from 'antd';

// ✅ 正确: 只导入需要的组件
import Button from 'antd/es/button';
// 或配置 babel-plugin-import
```

### P005 — 图片必须优化
- **说明**:
  - 使用 `next/image` 或等效组件
  - 提供 `width` + `height` 防止布局偏移 (CLS)
  - 使用 WebP/AVIF 格式
  - 使用 `loading="lazy"` 对屏幕外图片

### P006 — 避免超大 bundle
- **说明**: 单个 JS chunk 超过 250KB 应拆分
- **检查**: `scripts/bundle-size.sh` 可检测

## 💡 Suggestion

### P007 — 使用 useMemo / computed
- **说明**: 复杂计算在渲染中重复执行时，应使用 memoization
- **React**: `useMemo` 用于计算，`useCallback` 用于函数引用
- **Vue**: `computed` 用于派生状态

### P008 — CSS content-visibility
- **说明**: 长列表使用 `content-visibility: auto` 提升渲染性能

### P009 — 虚拟化长列表
- **说明**: 超过 100 行的列表应使用虚拟滚动
- **React**: `react-window`, `react-virtualized`
- **Vue**: `vue-virtual-scroller`

### P010 — 避免不必要的重渲染
- **说明**:
  - 订阅派生布尔值而非原始值
  - 使用 `React.memo` / `Vue.memo` 包裹纯展示组件
  - 避免 inline 对象/数组作为 prop

### P011 — Suspense 边界
- **说明**: 异步组件应有 Suspense fallback，避免白屏
```jsx
<Suspense fallback={<Skeleton />}>
  <AsyncComponent />
</Suspense>
```
