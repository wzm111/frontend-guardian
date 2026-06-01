# Next.js 开发规范

## 1. 路由与渲染

### 1.1 App Router 优先
**严重程度**: 🟡 Warning
**说明**: Next.js 13+ 推荐使用 App Router（app/ 目录），Pages Router（pages/）逐步进入维护模式。
**检测方式**: `ls app/ 2>/dev/null && echo "App Router" || echo "Pages Router"`
**修复建议**: 新项目使用 App Router；旧项目评估迁移计划。

### 1.2 文件系统路由规范
**严重程度**: 💡 Suggestion
**说明**: App Router 中路由段使用小写+中划线命名（如 `user-profile/page.tsx`），避免大写和驼峰。
**检测方式**: `find app/ -type d | grep -E '[A-Z]'`
**修复建议**: 重命名为小写+中划线格式。

### 1.3 SSR/SSG/ISR 选择
**严重程度**: 🟡 Warning
**说明**: 动态数据用 SSR (`export const dynamic = 'force-dynamic'`)，静态内容用 SSG (`generateStaticParams`)，需要增量更新用 ISR (`revalidate`)。
**检测方式**: 检查页面是否错误使用 `getServerSideProps`（已废弃）或缺少 `revalidate` 配置。
**修复建议**: App Router 中移除 `getServerSideProps`/`getStaticProps`，使用新的数据获取模式。

### 1.4 generateStaticParams 必须处理空值
**严重程度**: 🔴 Critical
**说明**: `generateStaticParams` 返回空数组时，Next.js 会跳过构建，但访问动态路由会 404。
**检测方式**: `grep -A 5 'generateStaticParams' app/**/*.tsx | grep -E 'return\s*\[\s*\]'`
**修复建议**: 空值时返回 `[]` 并配合 `dynamicParams = true` 启用运行时渲染。

## 2. 数据获取与 API

### 2.1 Server Component 默认使用
**严重程度**: 🟡 Warning
**说明**: App Router 中组件默认是 Server Component，不应在 Server Component 中直接使用浏览器 API（window、document、localStorage）。
**检测方式**: `grep -rE 'window\.|document\.|localStorage' app/**/*.tsx | grep -v "'use client'"`
**修复建议**: 浏览器 API 使用封装到 Client Component（`'use client'`），或在 `useEffect` 中调用。

### 2.2 API Route 错误处理
**严重程度**: 🔴 Critical
**说明**: API Routes（Route Handlers）必须统一错误处理，避免未捕获异常暴露堆栈。
**检测方式**: `grep -rE 'export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE)' app/api/ --include='*.ts' --include='*.js' | xargs grep -L 'try\|catch'`
**修复建议**: 所有 API handler 包裹 try/catch，返回统一错误格式 `{ error: string, code: string }`。

### 2.3 API Route CORS 配置
**严重程度**: 🟡 Warning
**说明**: 跨域 API 必须配置 CORS headers，特别是 `/api` 下对外暴露的端点。
**检测方式**: 检查 API route 文件是否缺少 `Access-Control-Allow-Origin` 或 `OPTIONS` handler。
**修复建议**: 使用 `next.config.js` 的 `headers` 配置，或在 handler 中手动设置 CORS。

## 3. 组件与优化

### 3.1 next/image 必须使用
**严重程度**: 🟡 Warning
**说明**: 禁止使用原生 `<img>` 标签，必须使用 `<Image>` 组件以获得自动优化（懒加载、响应式、WebP 转换）。
**检测方式**: `grep -rE '<img\s' --include='*.tsx' --include='*.jsx' app/ components/` 或 `grep -rE ' React\.createElement\("img"' --include='*.tsx' --include='*.jsx'`
**修复建议**: 替换为 `import Image from 'next/image'` 和 `<Image src="..." alt="..." width={...} height={...} />`。

### 3.2 Image 必须提供 alt
**严重程度**: 🔴 Critical
**说明**: `<Image>` 组件必须提供有意义的 `alt` 属性，装饰性图片使用 `alt=""`。
**检测方式**: `grep -rE '<Image\s[^>]*src=' --include='*.tsx' --include='*.jsx' | grep -v 'alt='`
**修复建议**: 添加 `alt` 属性，描述图片内容或用途。

### 3.3 动态导入用于大组件
**严重程度**: 💡 Suggestion
**说明**: 首屏非关键组件（如 Modal、Chart、Map）应使用 `dynamic(() => import(...), { ssr: false })` 懒加载。
**检测方式**: 检查 components 目录下体积较大（>50KB）或明显非首屏的组件是否使用了 dynamic import。
**修复建议**: 将大组件改为动态导入，减少首屏 bundle 体积。

### 3.4 Suspense 边界
**严重程度**: 🟡 Warning
**说明**: 使用 `dynamic()` 或异步组件时，必须在外层包裹 `<Suspense fallback={...}>`。
**检测方式**: `grep -r 'dynamic(' --include='*.tsx' --include='*.jsx' | grep -v 'Suspense'`
**修复建议**: 为动态导入的组件添加 Suspense 边界，提供 loading 状态。

## 4. Metadata 与 SEO

### 4.1 Metadata API 使用
**严重程度**: 🟡 Warning
**说明**: App Router 中应使用 `export const metadata` 或 `generateMetadata()` 管理 SEO，而非 `next/head`。
**检测方式**: `grep -r "from 'next/head'" app/ --include='*.tsx' --include='*.jsx'`
**修复建议**: 迁移到 Metadata API：`export const metadata: Metadata = { title: '...' }`。

### 4.2 OpenGraph 与 Twitter Card
**严重程度**: 💡 Suggestion
**说明**: 公共页面应配置 OpenGraph 和 Twitter Card meta 标签，提升社交媒体分享效果。
**检测建议**: 检查 `metadata.openGraph` 和 `metadata.twitter` 是否配置。

## 5. 安全与中间件

### 5.1 Middleware 避免过重逻辑
**严重程度**: 🟡 Warning
**说明**: Middleware 在 Edge Runtime 运行，不支持 Node.js API，且每次请求都会执行。避免数据库查询、大量计算。
**检测方式**: 检查 `middleware.ts` 中是否包含数据库查询、文件系统操作等。
**修复建议**: Middleware 只做轻量级操作（鉴权、重定向、Header 注入），复杂逻辑放到 API Route。

### 5.2 敏感环境变量不暴露到客户端
**严重程度**: 🔴 Critical
**说明**: 服务端密钥（数据库密码、API Key）只能使用 `process.env.XXX`，不能出现在 `NEXT_PUBLIC_` 前缀变量中。
**检测方式**: `grep -rE 'NEXT_PUBLIC_.*=' .env* .env.local* 2>/dev/null | grep -iE 'key|secret|password|token'`
**修复建议**: 移除 `NEXT_PUBLIC_` 前缀，服务端代码直接读取不带前缀的环境变量。

## 6. 字体与样式

### 6.1 next/font 使用
**严重程度**: 💡 Suggestion
**说明**: 使用 `next/font` 自动优化字体加载（预加载、font-display: swap、子集化），避免 layout shift。
**检测方式**: `grep -r '@import.*font' --include='*.css' --include='*.scss' styles/` 或检查是否使用 Google Fonts link 标签。
**修复建议**: 替换为 `import { Inter } from 'next/font/google'`。

### 6.2 全局样式导入位置
**严重程度**: 🟡 Warning
**说明**: 全局 CSS 应在 `app/layout.tsx` 中导入，而不是在组件中重复导入。
**检测方式**: 检查非 layout 文件是否直接 `import '.../global.css'`。
**修复建议**: 全局样式统一在根 layout 中导入一次。

## 7. 构建与部署

### 7.1 output: 'export' 限制检查
**严重程度**: 🟡 Warning
**说明**: 使用 `output: 'export'` 时，动态路由、`next/image` 优化、API Routes 等功能受限。
**检测方式**: `grep "output: 'export'" next.config.*`
**修复建议**: 评估是否真的需要静态导出；如果不需要动态功能，确保配置正确。

### 7.2 构建产物分析
**严重程度**: 💡 Suggestion
**说明**: 定期运行 `next build --analyze` 检查 bundle 体积，避免单个 chunk 超过 250KB。
**检测建议**: CI 中集成 bundle-size.sh 脚本进行体积监控。
