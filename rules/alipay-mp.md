# 支付宝小程序开发规范

## 1. AXML / ACSS 规范

### 1.1 AXML 事件绑定语法
**严重程度**: 🟡 Warning
**说明**: 支付宝小程序事件绑定使用 `onTap`、`onInput` 等（非微信小程序的 `bindtap`），且支持事件对象传递 `data-` 属性。
**检测方式**: `grep -rE 'bindtap|bindinput|bindchange' --include='*.axml' pages/ components/`
**修复建议**: 替换为 `onTap`、`onInput`、`onChange`。

### 1.2 条件编译与多端适配
**严重程度**: 🟡 Warning
**说明**: 如果使用 UniApp/Taro 开发，支付宝小程序专用代码应使用 `#ifdef MP-ALIPAY` 条件编译。
**检测方式**: 检查代码中直接调用 `my.xxx` API 且未做平台判断的情况。
**修复建议**: 使用 `uni.xxx` 或 `Taro.xxx` 代替 `my.xxx`，或通过 `#ifdef` 隔离平台差异。

### 1.3 rpx 与 rem 的选择
**严重程度**: 💡 Suggestion
**说明**: 支付宝小程序支持 `rpx` 和 `rem`，建议统一使用 `rpx`（与微信保持一致），或根据设计稿选择。
**检测方式**: `grep -rE '[0-9]+rem' --include='*.acss' --include='*.less' pages/ components/`
**修复建议**: 统一使用 `rpx`，1rem = 75rpx（设计稿 750px 基准）。

## 2. API 与组件差异

### 2.1 my.request 与 wx.request 差异
**严重程度**: 🟡 Warning
**说明**: `my.request` 的返回值结构与 `wx.request` 不同，支付宝使用 `success/fail/complete` 回调，而微信小程序使用 `wx.request({ success })`。
**检测方式**: 检查是否混用 `wx.request` 和 `my.request` 的响应格式。
**修复建议**: 统一封装请求层，处理平台差异。

### 2.2 my.getAuthCode 登录流程
**严重程度**: 🔴 Critical
**说明**: 支付宝登录使用 `my.getAuthCode` 获取 authCode，再换取 `accessToken` 和用户信息。不能在前端直接解析 authCode。
**检测方式**: 检查是否有在前端使用 `authCode` 直接获取用户信息的逻辑。
**修复建议**: authCode 发送到服务端换取 token，所有敏感操作在服务端完成。

### 2.3 支付接口安全
**严重程度**: 🔴 Critical
**说明**: 支付宝小程序支付必须使用 `my.tradePay`，支付参数（orderStr）必须由服务端生成，不能在前端拼接。
**检测方式**: 检查是否在前端直接构造 `orderStr` 或包含私钥信息。
**修复建议**: 支付参数全部从服务端获取，前端只调用 `my.tradePay({ tradeNO: serverOrderId })`。

### 2.4 组件属性差异
**严重程度**: 🟡 Warning
**说明**: 支付宝小程序组件属性与微信有差异，如 `scroll-view` 的 `scroll-y` 在支付宝中可能表现不同。
**检测方式**: 检查跨平台组件属性是否针对支付宝做了适配。
**修复建议**: 使用 UniApp/Taro 的跨平台组件，或针对支付宝做属性映射。

## 3. 性能与体验

### 3.1 分包与预加载
**严重程度**: 🟡 Warning
**说明**: 支付宝小程序主包大小限制 2MB，应合理配置 `subPackages`。
**检测方式**: 检查 `app.json` 是否配置 `subPackages`；检查主包体积。
**修复建议**: 按业务模块分包，配置 `preloadRule` 预加载。

### 3.2 图片资源优化
**严重程度**: 🟡 Warning
**说明**: 支付宝小程序不支持 base64 图片超过一定大小，建议使用 CDN 或本地资源。
**检测方式**: `grep -rE 'data:image/[^;]+;base64,' --include='*.axml' --include='*.acss' pages/ components/`
**修复建议**: 大图使用 CDN，小图标使用本地 `acss` 中的 `background-image`。

### 3.3 列表渲染优化
**严重程度**: 🟡 Warning
**说明**: 长列表应使用 `recycle-view` 或分页加载，避免一次性渲染大量节点。
**检测方式**: 检查 `a:for` 是否绑定大数组（超过 50 项）。
**修复建议**: 使用 `recycle-view` 组件或分页 + 虚拟滚动。

## 4. 安全规范

### 4.1 HTTPS 强制
**严重程度**: 🔴 Critical
**说明**: 所有网络请求必须使用 HTTPS，开发调试除外。
**检测方式**: `grep -rE 'http://' --include='*.js' pages/ components/ utils/ | grep -v 'localhost'`
**修复建议**: 统一使用 HTTPS。

### 4.2 数据存储安全
**严重程度**: 🟡 Warning
**说明**: 敏感数据（token、用户信息）不应直接存入 `my.setStorage`，应加密或使用服务端 session。
**检测方式**: 检查 `my.setStorage` 是否存储敏感信息。
**修复建议**: 敏感数据存储前加密，或仅保存 session id。

### 4.3 JSAPI 权限管理
**严重程度**: 🟡 Warning
**说明**: 在 `app.json` 中声明 `requiredPermissions`，按需申请权限，避免过度授权。
**检测方式**: 检查 `app.json` 中 `requiredPermissions` 是否包含未使用的权限。

## 5. 与微信小程序适配

### 5.1 API 命名映射
**严重程度**: 🟡 Warning
**说明**: 支付宝小程序 API 前缀为 `my.`，微信小程序为 `wx.`，应统一使用 `uni.` 或 `Taro.` 进行跨平台调用。
**检测方式**: `grep -rE '\bmy\.[a-zA-Z]' --include='*.js' --include='*.ts' pages/ components/`
**修复建议**: 使用 `uni.request` 代替 `my.request`，`uni.getStorage` 代替 `my.getStorage`。

### 5.2 生命周期差异
**严重程度**: 🟡 Warning
**说明**: 支付宝小程序页面生命周期与微信基本一致，但部分事件触发时机有差异（如 `onShow` 在返回时触发）。
**检测方式**: 检查生命周期中是否有依赖特定时机的逻辑。
**修复建议**: 在 `onShow` 中使用 `this.data.__lastShowTime` 等标记避免重复执行。

### 5.3 组件库选择
**严重程度**: 💡 Suggestion
**说明**: 支付宝小程序可使用 Ant Design Mini（antd-mini）作为组件库，与 PC 端 Ant Design 保持一致。
**检测建议**: 如果项目同时有 PC 端，建议使用 antd-mini 保持 UI 一致性。
