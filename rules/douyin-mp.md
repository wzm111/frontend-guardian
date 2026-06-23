# 抖音小程序开发规范

## 1. TTML / TTSS 规范

### 1.1 TTML 事件绑定语法
**严重程度**: 🟡 Warning
**说明**: 抖音小程序事件绑定使用 `bindtap`、`bindinput` 等（与微信一致），但部分事件名与支付宝不同，跨端开发时应注意区分。
**检测方式**: `grep -rE 'onTap|onInput|onChange' --include='*.ttml' pages/ components/`
**修复建议**: 抖音小程序使用 `bindtap`、`bindinput`、`bindchange`；跨端框架中应通过条件编译隔离。

### 1.2 rpx 使用规范
**严重程度**: 💡 Suggestion
**说明**: 抖音小程序支持 `rpx` 进行响应式布局，建议统一使用 `rpx` 而非硬编码 `px`。
**检测方式**: `grep -rE '[0-9]+px' --include='*.ttss' --include='*.scss' pages/ components/`
**修复建议**: 统一使用 `rpx`，1px 边框可用 `border: 1rpx solid #ccc`。

### 1.3 图片资源必须设置 mode
**严重程度**: 🟡 Warning
**说明**: `<image>` 组件应设置 `mode` 属性控制图片裁剪和缩放，避免默认 `scaleToFill` 导致的变形。
**检测方式**: `grep -rE '<image\s' --include='*.ttml' pages/ components/ | grep -v 'mode='`
**修复建议**: 添加 `mode="aspectFill"`、`mode="aspectFit"` 或 `mode="widthFix"`。

## 2. API 与生命周期

### 2.1 tt. 前缀 API
**严重程度**: 🟡 Warning
**说明**: 抖音小程序全局 API 前缀为 `tt.`，如 `tt.request`、`tt.navigateTo`、`tt.getStorage`。不要混用 `wx.` 或 `my.`。
**检测方式**: `grep -rE '\b(wx|my)\.[a-zA-Z]' --include='*.js' --include='*.ts' pages/ components/`
**修复建议**: 统一改为 `tt.xxx`，或使用 UniApp/Taro 的跨平台 API。

### 2.2 setData 优化
**严重程度**: 🟡 Warning
**说明**: `setData` 会触发视图层重绘，应避免频繁调用和传输大数据。单次 `setData` 数据量建议不超过 256KB。
**检测方式**: 检查同一函数中多次调用 `setData` 的情况；检查 setData 中是否包含大数组。
**修复建议**: 合并多次 setData 为一次；大数据使用分页或虚拟列表；非视图数据不要放入 data。

### 2.3 页面 onUnload 清理资源
**严重程度**: 🔴 Critical
**说明**: 页面 `onUnload` 中必须清理定时器、监听器、WebSocket 连接，避免内存泄漏。
**检测方式**: `grep -r 'setInterval\|setTimeout\|tt\.on' --include='*.js' --include='*.ts' pages/ | grep -v 'clearInterval\|clearTimeout\|off' | grep -v 'onUnload'`
**修复建议**: 在 `data` 中保存 timer id，在 `onUnload` 中 `clearInterval(timerId)`。

## 3. 性能优化

### 3.1 分包加载配置
**严重程度**: 🟡 Warning
**说明**: 抖音小程序主包大小限制 2MB，应合理配置 `subPackages` 进行分包。
**检测方式**: 检查 `app.json` 是否配置 `subPackages`；检查主包体积。
**修复建议**: 按业务模块分包，tabBar 页面放主包，二级页面放分包。

### 3.2 预加载与预下载
**严重程度**: 💡 Suggestion
**说明**: 配置 `preloadRule` 在进入页面时预加载分包，减少用户等待。
**检测方式**: `grep "preloadRule" app.json`
**修复建议**: 在 `app.json` 中为高频跳转页面配置预加载。

### 3.3 列表渲染优化
**严重程度**: 🟡 Warning
**说明**: 长列表（超过 50 条）应避免一次性渲染全部节点，可使用 `recycle-view` 或分页加载。
**检测方式**: 检查 `tt:for` 是否绑定大数组（超过 50 项）。
**修复建议**: 使用 `recycle-view` 组件或分页 + 虚拟滚动。

### 3.4 避免 base64 大图
**严重程度**: 🟡 Warning
**说明**: base64 图片会显著增加包体积和内存占用，且无法缓存。base64 图片建议不超过 10KB。
**检测方式**: `grep -rE 'data:image/[^;]+;base64,[A-Za-z0-9+/]{5000,}' --include='*.ttml' --include='*.ttss' pages/ components/`
**修复建议**: 大图使用 CDN 或本地资源，只有极小图标可用 base64。

## 4. 网络与安全

### 4.1 HTTPS 强制
**严重程度**: 🔴 Critical
**说明**: 生产环境所有网络请求必须使用 HTTPS，开发调试除外。
**检测方式**: `grep -rE 'http://' --include='*.js' --include='*.ts' pages/ components/ utils/ | grep -v 'localhost\|127.0.0.1'`
**修复建议**: 统一使用 HTTPS 协议。

### 4.2 请求统一封装
**严重程度**: 🟡 Warning
**说明**: `tt.request` 应统一封装，添加请求拦截（token）、错误处理、超时重试。
**检测方式**: `grep -r 'tt\.request' --include='*.js' --include='*.ts' pages/ components/ | grep -v 'utils/'`
**修复建议**: 创建 `utils/request.js` 封装所有请求。

### 4.3 登录态安全
**严重程度**: 🔴 Critical
**说明**: `tt.login` 获取的 `code` 必须发送到服务端换取 `openid`/`session_key`，不能在前端直接处理敏感逻辑。
**检测方式**: 检查是否有在前端使用 `session_key` 解密数据的逻辑。
**修复建议**: 所有敏感解密操作在服务端完成。

## 5. 项目配置

### 5.1 project.config.json 中的 tt 字段
**严重程度**: 🟡 Warning
**说明**: 抖音小程序应在 `project.config.json` 中配置 `tt` 字段（如 `appid`、`setting`）。缺失可能导致开发者工具识别异常。
**检测方式**: 检查 `project.config.json` 是否包含 `tt` 字段。
**修复建议**: 补充 `tt` 配置：`{ "tt": { "appid": "...", "setting": { "es6": true } } }`。

### 5.2 条件编译与跨端框架
**严重程度**: 🟡 Warning
**说明**: 如果使用 UniApp/Taro 开发，抖音小程序专用代码应使用 `#ifdef MP-TOUTIAO` 条件编译。
**检测方式**: 检查代码中直接调用 `tt.xxx` API 且未做平台判断的情况。
**修复建议**: 使用 `uni.xxx` 或 `Taro.xxx` 代替 `tt.xxx`，或通过 `#ifdef` 隔离平台差异。

## 6. 文件结构

### 6.1 页面文件规范
**严重程度**: 💡 Suggestion
**说明**: 抖音小程序页面由 `.js` / `.ts` + `.ttml` + `.ttss` + `.json` 组成，建议保持命名一致。
**检测方式**: 检查 `pages/` 下是否存在只有 `.js` 缺少 `.ttml` 的页面。
**修复建议**: 补齐模板与样式文件。
