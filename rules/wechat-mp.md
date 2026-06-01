# 微信小程序原生开发规范

## 1. WXML / WXSS 规范

### 1.1 避免在 WXML 中使用复杂表达式
**严重程度**: 🟡 Warning
**说明**: WXML 中不支持复杂 JS 表达式（如 `{{ a > 0 ? '正' : '负' }}` 之外的三元表达式）。应使用 computed 或 data 预计算。
**检测方式**: 检查 `.wxml` 文件中 `{{ }}` 内是否包含复杂运算、链式调用、正则等。
**修复建议**: 在 `data` 或 `computed` 中预计算，WXML 只绑定简单值。

### 1.2 rpx 使用规范
**严重程度**: 💡 Suggestion
**说明**: 小程序中应使用 `rpx` 进行响应式布局，避免硬编码 `px`（特殊设计需求除外）。
**检测方式**: `grep -rE '[0-9]+px' --include='*.wxss' --include='*.scss' pages/ components/`
**修复建议**: 统一使用 `rpx`，1px 边框可用 `border: 1rpx solid #ccc`（真机会自动优化为 0.5px）。

### 1.3 图片资源必须设置 mode
**严重程度**: 🟡 Warning
**说明**: `<image>` 组件应设置 `mode` 属性控制图片裁剪和缩放，避免默认 `scaleToFill` 导致的变形。
**检测方式**: `grep -rE '<image\s' --include='*.wxml' pages/ components/ | grep -v 'mode='`
**修复建议**: 添加 `mode="aspectFill"`、`mode="aspectFit"` 或 `mode="widthFix"`。

## 2. 生命周期与数据管理

### 2.1 setData 优化
**严重程度**: 🟡 Warning
**说明**: `setData` 会触发视图层重绘，应避免频繁调用和传输大数据。单次 `setData` 数据量建议不超过 256KB。
**检测方式**: 检查同一函数中多次调用 `setData` 的情况；检查 setData 中是否包含大数组。
**修复建议**: 合并多次 setData 为一次；大数据使用分页或虚拟列表；非视图数据不要放入 data。

### 2.2 页面 onUnload 清理资源
**严重程度**: 🔴 Critical
**说明**: 页面 `onUnload` 中必须清理定时器、监听器、WebSocket 连接，避免内存泄漏。
**检测方式**: `grep -r 'setInterval\|setTimeout\|wx.on' --include='*.js' --include='*.ts' pages/ | grep -v 'clearInterval\|clearTimeout\|off' | grep -v 'onUnload'`
**修复建议**: 在 `data` 中保存 timer id，在 `onUnload` 中 `clearInterval(timerId)`。

### 2.3 避免在 onLoad 中做同步阻塞操作
**严重程度**: 🟡 Warning
**说明**: `onLoad` 中同步计算大量数据会阻塞页面首次渲染，导致白屏时间增加。
**检测方式**: 检查 `onLoad` 中是否有同步的大数据处理、大量 DOM 操作。
**修复建议**: 大数据处理放到 `onReady` 或使用异步分批处理。

### 2.4 正确使用页面栈
**严重程度**: 🟡 Warning
**说明**: 页面深度超过 10 层会报错。`navigateTo` 增加栈深度，`redirectTo` 替换当前页，`reLaunch` 清空栈。
**检测方式**: 检查是否滥用 `navigateTo`，特别是列表页 → 详情页 → 编辑页的循环跳转。
**修复建议**: 详情页返回列表用 `navigateBack`；表单提交成功后用 `redirectTo` 返回列表。

## 3. 自定义组件

### 3.1 properties 必须声明类型和默认值
**严重程度**: 🟡 Warning
**说明**: 组件 `properties` 必须声明 `type` 和可选的 `value`，提高可读性和类型安全。
**检测方式**: `grep -A 5 'properties:' components/**/*.js | grep -v 'type:'`
**修复建议**: 完整声明：`properties: { title: { type: String, value: '' } }`。

### 3.2 组件数据隔离
**严重程度**: 🔴 Critical
**说明**: 自定义组件的 data 和父组件独立，不应通过 `this.data` 直接修改父组件数据。
**检测方式**: 检查组件中是否直接修改传入的复杂对象属性（引用传递问题）。
**修复建议**: 数据变更通过事件 `this.triggerEvent('change', { value })` 通知父组件。

### 3.3 behaviors 谨慎使用
**严重程度**: 💡 Suggestion
**说明**: `behaviors` 类似混入，过多使用会导致数据和方法来源不透明，增加调试难度。
**检测建议**: 一个组件使用 behaviors 不超过 3 个。

## 4. 性能优化

### 4.1 列表渲染使用虚拟列表
**严重程度**: 🟡 Warning
**说明**: 长列表（超过 50 条）应使用 `recycle-view` 或自定义虚拟列表，避免一次性渲染全部节点。
**检测方式**: 检查列表渲染是否直接 `wx:for` 大数组（超过 50 项）。
**修复建议**: 使用 `recycle-view` 组件或分页加载 + 虚拟滚动实现。

### 4.2 分包加载配置
**严重程度**: 🟡 Warning
**说明**: 主包大小不能超过 2MB，应合理配置 `subpackages` 进行分包。
**检测方式**: `du -sh pages/` 检查主包体积；检查 `app.json` 是否配置 `subpackages`。
**修复建议**: 按业务模块分包，tabBar 页面放主包，二级页面放分包。

### 4.3 预加载与预下载
**严重程度**: 💡 Suggestion
**说明**: 配置 `preloadRule` 在进入页面时预加载分包，减少用户等待。
**检测方式**: `grep "preloadRule" app.json`
**修复建议**: 在 `app.json` 中为高频跳转页面配置预加载。

### 4.4 避免 base64 大图
**严重程度**: 🟡 Warning
**说明**: base64 图片会显著增加包体积和内存占用，且无法缓存。base64 图片建议不超过 10KB。
**检测方式**: `grep -rE 'data:image/[^;]+;base64,[A-Za-z0-9+/]{5000,}' --include='*.wxml' --include='*.wxss' pages/ components/`
**修复建议**: 大图使用 CDN 或本地资源，只有极小图标可用 base64。

## 5. 网络与安全

### 5.1 HTTPS 强制
**严重程度**: 🔴 Critical
**说明**: 生产环境所有网络请求必须使用 HTTPS，开发调试除外。
**检测方式**: `grep -rE 'http://' --include='*.js' --include='*.ts' pages/ components/ utils/ | grep -v 'localhost\|127.0.0.1'`
**修复建议**: 统一使用 HTTPS 协议。

### 5.2 请求统一封装
**严重程度**: 🟡 Warning
**说明**: `wx.request` 应统一封装，添加请求拦截（token）、错误处理、超时重试。
**检测方式**: `grep -r 'wx.request' --include='*.js' --include='*.ts' pages/ components/ | grep -v 'utils/'`
**修复建议**: 创建 `utils/request.js` 封装所有请求。

### 5.3 登录态管理
**严重程度**: 🔴 Critical
**说明**: `wx.login` 获取的 `code` 必须发送到服务端换取 `openid`/`session_key`，不能在前端直接处理敏感逻辑。
**检测方式**: 检查是否有在前端使用 `session_key` 解密数据的逻辑。
**修复建议**: 所有敏感解密操作在服务端完成。

## 6. 版本兼容

### 6.1 API 兼容性判断
**严重程度**: 🟡 Warning
**说明**: 使用较新 API 时必须判断兼容性，低版本微信会报错。
**检测方式**: `grep -r 'wx\.[a-zA-Z]' --include='*.js' pages/ components/ | grep -v 'canIUse'`
**修复建议**: `if (wx.canIUse('openBluetoothAdapter')) { ... }`

### 6.2 基础库版本声明
**严重程度**: 💡 Suggestion
**说明**: 在 `app.json` 中声明 `requiredBackgroundModes` 和必要的基础库版本。
**检测方式**: `grep "requiredBackgroundModes\|lazyCodeLoading" app.json`

## 7. 云开发

### 7.1 云函数权限控制
**严重程度**: 🔴 Critical
**说明**: 云函数必须校验调用者权限，不能依赖前端传入的 `openid`。
**检测方式**: 检查 `cloudfunctions/` 中是否使用 `OPENID` 环境变量验证身份。
**修复建议**: 云函数中使用 `cloud.getWXContext().OPENID` 获取真实 openid 进行权限校验。

### 7.2 数据库安全规则
**严重程度**: 🔴 Critical
**说明**: 云数据库安全规则不能开放 `read: true` / `write: true`，必须按用户粒度控制。
**检测方式**: 检查 `database.rules` 中是否有全局开放权限。
**修复建议**: 配置细粒度规则：`{ "read": "doc._openid == auth.openid" }`。
