# React Native 跨平台开发规范

## 1. 组件优化

### 1.1 组件层级控制
**严重程度**: 🟡 Warning
**说明**: 避免过深的组件嵌套（超过 8 层），每增加一层都会增加渲染开销和调试难度。
**检测方式**: 检查渲染树深度，或使用 React DevTools Profiler 分析。
**修复建议**: 提取公共布局为独立组件，减少 JSX 嵌套层级。

### 1.2 FlatList/SectionList 正确使用
**严重程度**: 🟡 Warning
**说明**: 大数据列表必须使用 `FlatList` 或 `SectionList`（虚拟滚动），禁止用 `ScrollView` + `map` 渲染长列表。
**检测方式**: `grep -rE 'ScrollView.*map\(|map\(.*ScrollView' src/ --include='*.tsx' --include='*.jsx'`
**修复建议**: 改为 `FlatList data={items} renderItem={...} keyExtractor={...}`。

### 1.3 FlatList 必须设置 keyExtractor
**严重程度**: 🟡 Warning
**说明**: `FlatList` 必须提供 `keyExtractor`，否则使用默认索引作为 key，导致状态错乱。
**检测方式**: `grep -rA 3 'FlatList' src/ --include='*.tsx' --include='*.jsx' | grep -v 'keyExtractor'`
**修复建议**: 添加 `keyExtractor={(item) => item.id}`。

### 1.4 useNativeDriver 用于动画
**严重程度**: 🟡 Warning
**说明**: `Animated` 动画必须设置 `useNativeDriver: true`，否则会阻塞 JS 线程导致卡顿。
**检测方式**: `grep -rA 5 'Animated' src/ --include='*.tsx' --include='*.jsx' | grep -v 'useNativeDriver'`
**修复建议**: `Animated.timing(value, { toValue: 1, useNativeDriver: true }).start()`。

## 2. 样式与平台差异

### 2.1 StyleSheet.create 使用
**严重程度**: 💡 Suggestion
**说明**: 使用 `StyleSheet.create` 创建样式对象，RN 会对其做优化（ID 引用而非对象传递）。
**检测方式**: `grep -rE 'style=\{\{[^}]+\}\}' src/ --include='*.tsx' --include='*.jsx'`
**修复建议**: 提取为 `StyleSheet.create({ container: { ... } })`。

### 2.2 Platform.select 处理平台差异
**严重程度**: 🟡 Warning
**说明**: iOS 和 Android 的样式/行为差异应使用 `Platform.select` 或 `Platform.OS` 处理。
**检测方式**: 检查是否有平台特定逻辑但未使用 Platform API。
**修复建议**: `Platform.select({ ios: { paddingTop: 40 }, android: { paddingTop: 20 } })`。

### 2.3 安全区域处理
**严重程度**: 🟡 Warning
**说明**: iPhone X+ 的刘海屏和底部安全区域必须使用 `SafeAreaView` 处理。
**检测方式**: 检查根布局是否使用 `SafeAreaView` 或 `react-native-safe-area-context`。
**修复建议**: 根布局包裹 `SafeAreaView`，或使用 `useSafeAreaInsets()` 手动处理。

### 2.4 键盘处理
**严重程度**: 🟡 Warning
**说明**: 输入框被键盘遮挡时，必须使用 `KeyboardAvoidingView` 或 `react-native-keyboard-aware-scroll-view`。
**检测方式**: 检查表单页面是否包含键盘适配处理。
**修复建议**: 表单页面包裹 `KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`。

## 3. 图片资源

### 3.1 图片尺寸限制
**严重程度**: 🟡 Warning
**说明**: 本地图片资源应尽量小（建议不超过 500KB），大图使用 CDN 或按需加载。
**检测方式**: `find src/ -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' | xargs ls -lh`
**修复建议**: 大图压缩或使用 WebP 格式，CDN 图片使用 `source={{ uri: 'https://...' }}`。

### 3.2 图片加载占位
**严重程度**: 💡 Suggestion
**说明**: 网络图片应提供占位图和加载失败处理。
**检测方式**: 检查 `Image` 组件是否设置了 `defaultSource` 或 `onError`。
**修复建议**: `Image source={{ uri }} defaultSource={placeholder} onError={handleError}`。

## 4. 原生模块与通信

### 4.1 NativeModules 错误处理
**严重程度**: 🔴 Critical
**说明**: 调用原生模块（`NativeModules`）时，必须处理平台不支持的情况（模块为 null）。
**检测方式**: `grep -rA 5 'NativeModules' src/ --include='*.tsx' --include='*.ts' | grep -v 'if\|try'`
**修复建议**: `const { MyModule } = NativeModules; if (!MyModule) { return; }`

### 4.2 TurboModules 与 New Architecture
**严重程度**: 💡 Suggestion
**说明**: 新项目应考虑启用 New Architecture（Fabric + TurboModules），但老项目迁移需谨慎。
**检测方式**: 检查 `android/gradle.properties` 中 `newArchEnabled` 配置。

## 5. 网络与缓存

### 5.1 请求统一封装
**严重程度**: 🟡 Warning
**说明**: `fetch` 应统一封装，添加超时、重试、Token 注入、错误处理。
**检测方式**: `grep -r 'fetch(' src/ --include='*.tsx' --include='*.ts' | grep -v 'utils/'`
**修复建议**: 创建 `api.ts` 封装所有请求，统一处理错误码和 Token 刷新。

### 5.2 离线缓存策略
**严重程度**: 💡 Suggestion
**说明**: 关键数据应做离线缓存（AsyncStorage/MMKV），提升弱网体验。
**检测方式**: 检查是否有数据缓存机制。
**修复建议**: 使用 `@react-native-async-storage/async-storage` 或 `react-native-mmkv`。

## 6. 热更新与安全

### 6.1 CodePush 配置安全
**严重程度**: 🟡 Warning
**说明**: CodePush 的部署 Key 不应硬编码，应通过环境变量或原生配置注入。
**检测方式**: `grep -r 'deploymentKey' src/ --include='*.tsx' --include='*.ts'`
**修复建议**: 从 `Config.CODEPUSH_KEY` 或原生端读取。

### 6.2 签名与证书管理
**严重程度**: 🔴 Critical
**说明**: iOS/Android 的签名证书和私钥不能提交到代码仓库。
**检测方式**: 检查仓库中是否有 `.p12`、`.jks`、`.keystore`、`.mobileprovision` 文件。
**修复建议**: 添加到 `.gitignore`，通过 CI/CD 安全注入。

## 7. 导航与路由

### 7.1 导航参数类型安全
**严重程度**: 🟡 Warning
**说明**: React Navigation 的路由参数应使用 TypeScript 类型声明，避免传递大对象。
**检测方式**: 检查 `navigation.navigate('Screen', params)` 中 params 是否过大或缺少类型。
**修复建议**: 定义 `type RootStackParamList = { Screen: { id: string } }`，参数只传 ID。

### 7.2 返回键处理
**严重程度**: 🟡 Warning
**说明**: Android 物理返回键应正确拦截，特别是在 Modal 或 WebView 中。
**检测方式**: 检查是否使用 `BackHandler` 处理返回事件。
**修复建议**: `useEffect(() => { const sub = BackHandler.addEventListener(...); return () => sub.remove(); }, [])`。

## 8. 性能监控

### 8.1 Hermes 引擎启用
**严重程度**: 🟡 Warning
**说明**: Android 和 iOS 都应启用 Hermes 引擎，减少包体积并提升启动速度。
**检测方式**: `grep 'enableHermes' android/app/build.gradle` 和 `hermes_enabled` ios/Podfile。
**修复建议**: Android `enableHermes: true`，iOS `:hermes_enabled => true`。

### 8.2 启动时间优化
**严重程度**: 💡 Suggestion
**说明**: 应用启动时应减少同步初始化，使用 Splash Screen 和懒加载策略。
**检测建议**: 使用 Flipper 或原生工具分析启动耗时，减少 main bundle 大小。
