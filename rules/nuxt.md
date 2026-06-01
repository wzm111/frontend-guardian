# Nuxt 3 开发规范

## 1. 渲染模式

### 1.1 SSR/SSG/CSR 正确选择
**严重程度**: 🟡 Warning
**说明**: 内容型页面用 SSR（默认），纯静态用 SSG（`ssr: false` + `prerender`），管理后台用 CSR（`ssr: false`）。
**检测方式**: 检查 `nuxt.config.ts` 的 `ssr` 和 `routeRules` 配置是否合理。
**修复建议**: 在 `routeRules` 中为不同路由指定渲染策略：`{ '/admin/**': { ssr: false } }`。

### 1.2 Nitro 预设选择
**严重程度**: 💡 Suggestion
**说明**: 部署到不同平台时选择对应的 Nitro 预设（`vercel`、`netlify`、`cloudflare_pages`、`node-server`）。
**检测方式**: `grep "preset:" nuxt.config.*`
**修复建议**: 根据部署目标设置 `nitro: { preset: 'vercel' }`。

## 2. 数据获取

### 2.1 useAsyncData 必须处理错误
**严重程度**: 🔴 Critical
**说明**: `useAsyncData` 返回的 `error` 必须处理，否则接口失败时页面会白屏或展示 undefined。
**检测方式**: `grep -r 'useAsyncData' --include='*.vue' --include='*.ts' composables/ pages/ components/ | grep -v 'error'`
**修复建议**: 始终解构 `const { data, error, pending } = useAsyncData(...)`，并添加错误展示逻辑。

### 2.2 useFetch vs $fetch 选择
**严重程度**: 🟡 Warning
**说明**: 组件初始化获取数据用 `useFetch`（自动去重和缓存），事件处理（点击提交）用 `$fetch`（按需请求）。
**检测方式**: `grep -r 'useFetch' --include='*.vue' components/ | grep -E 'onClick|@click|handle'`
**修复建议**: 事件处理中的请求改用 `$fetch` 或 `$fetch.raw()`。

### 2.3 服务端数据预取参数校验
**严重程度**: 🟡 Warning
**说明**: `useAsyncData` 和 server API 中的查询参数必须校验，防止注入攻击。
**检测方式**: 检查 `server/api/**/*.ts` 中是否直接拼接 SQL 或使用未经校验的参数。
**修复建议**: 使用 Zod 或 valibot 对参数进行 schema 校验。

### 2.4 避免在 watch 中调用 useFetch
**严重程度**: 🔴 Critical
**说明**: `useFetch` 只能在 setup 顶层调用，不能在 `watch`、`computed` 或回调中调用。
**检测方式**: `grep -rA 3 'watch(' --include='*.vue' components/ | grep 'useFetch'`
**修复建议**: watch 中使用 `$fetch` 或手动更新 ref，setup 顶层用 `useFetch` + `watch` 触发重新获取。

## 3. 状态管理

### 3.1 useState 用于轻量共享状态
**严重程度**: 💡 Suggestion
**说明**: 简单的跨组件状态用 `useState`（SSR 安全），复杂状态用 Pinia。避免在 `useState` 中存储大对象。
**检测方式**: 检查 `useState` 是否存储了超过 100KB 的数据或复杂嵌套对象。
**修复建议**: 大数据量状态迁移到 Pinia，并考虑 localStorage/sessionStorage 持久化。

### 3.2 Pinia Store 必须使用 defineStore
**严重程度**: 🟡 Warning
**说明**: 必须使用 `defineStore` 定义 store，store 名使用驼峰并以 `use` 开头。
**检测方式**: `grep -r 'defineStore' stores/ --include='*.ts' | grep -v "'use[A-Z]"`
**修复建议**: 命名规范：`export const useUserStore = defineStore('user', () => { ... })`。

## 4. 组件与布局

### 4.1 自动导入注意事项
**严重程度**: 🟡 Warning
**说明**: Nuxt 自动导入 components/ 和 composables/，但显式导入有助于 IDE 跳转和类型推断。
**检测方式**: 检查是否有 components 或 composables 在 TypeScript 严格模式下报错。
**修复建议**: 复杂组件建议显式导入；在 `nuxt.config.ts` 中配置 `components: { global: true }` 时注意命名冲突。

### 4.2 ClientOnly 正确使用
**严重程度**: 🟡 Warning
**说明**: 只在客户端渲染的组件（如 Chart、Map、Editor）必须包裹在 `<ClientOnly>` 中。
**检测方式**: `grep -r 'window\|document\|navigator' --include='*.vue' components/ | grep -v 'onMounted'`
**修复建议**: 使用 `<ClientOnly><MyChart /></ClientOnly>`，或把浏览器 API 调用放在 `onMounted` 中。

### 4.3 布局过渡动画配置
**严重程度**: 💡 Suggestion
**说明**: 页面切换过渡应使用 `pageTransition` 和 `layoutTransition` 配置，避免自定义动画导致的闪烁。
**检测方式**: `grep "pageTransition\|layoutTransition" nuxt.config.*`
**修复建议**: 在 `nuxt.config.ts` 中统一配置过渡动画。

## 5. SEO 与 Head 管理

### 5.1 useHead 必须包含关键 meta
**严重程度**: 🟡 Warning
**说明**: 每个页面应通过 `useHead` 或 `useSeoMeta` 配置 title、description、og:image。
**检测方式**: `grep -r 'useHead\|useSeoMeta' --include='*.vue' pages/ | wc -l` 对比页面数量。
**修复建议**: 在 layout 中设置默认 SEO，页面级别覆盖。

### 5.2 避免重复 useHead 调用
**严重程度**: 🟡 Warning
**说明**: 同一组件中多次调用 `useHead` 会覆盖而非合并，应一次性传入完整对象。
**检测方式**: `grep -c 'useHead(' pages/*.vue` — 大于 1 的文件需要检查。
**修复建议**: 合并为单个 `useHead({ title: '...', meta: [...] })` 调用。

## 6. 中间件与导航

### 6.1 中间件顺序与性能
**严重程度**: 🟡 Warning
**说明**: 中间件按文件名字母顺序执行，命名前缀控制顺序（如 `01.auth.ts`、`02.admin.ts`）。避免在中间件中做重查询。
**检测方式**: `ls middleware/` 检查文件命名是否有序号前缀；检查中间件中是否有数据库查询。
**修复建议**: 添加数字前缀控制顺序；中间件只做轻量级校验。

### 6.2 导航守卫返回正确值
**严重程度**: 🔴 Critical
**说明**: 中间件返回 `navigateTo('/login')` 或 `abortNavigation()`，不能返回 `false` 或 `undefined`。
**检测方式**: `grep -rE 'return\s+(false|undefined|null)' middleware/ --include='*.ts'`
**修复建议**: 使用 `return navigateTo('/login')` 或 `return abortNavigation()`。

## 7. 模块与插件

### 7.1 插件仅在客户端执行时标记 client
**严重程度**: 🟡 Warning
**说明**: 仅在客户端运行的插件必须命名为 `xxx.client.ts`，避免服务端执行报错。
**检测方式**: 检查 `plugins/` 目录下使用浏览器 API 但未标记 `.client` 的插件。
**修复建议**: 重命名为 `xxx.client.ts` 或在插件中判断 `process.client`。

### 7.2 模块配置类型安全
**严重程度**: 💡 Suggestion
**说明**: 自定义模块应导出类型声明，让 `nuxt.config.ts` 中的模块配置有类型提示。
**检测方式**: 检查模块目录是否有 `types.ts` 或类型声明。
**修复建议**: 使用 `defineNuxtModule` 并导出 `ModuleOptions` 接口。

## 8. 部署与性能

### 8.1 生产构建启用压缩
**严重程度**: 💡 Suggestion
**说明**: 生产环境应启用 gzip/brotli 压缩和资源预加载。
**检测方式**: `grep -E 'compress|brotli|gzip' nuxt.config.*`
**修复建议**: 配置 `nitro: { compressPublicAssets: { gzip: true, brotli: true } }`。

### 8.2 图片优化
**严重程度**: 🟡 Warning
**说明**: 使用 `<NuxtImg>` 或 `<NuxtPicture>` 替代原生 `<img>`，自动优化和响应式。
**检测方式**: `grep -rE '<img\s' --include='*.vue' components/ pages/`
**修复建议**: 安装 `@nuxt/image` 模块，替换为 `<NuxtImg src="..." alt="..." />`。
