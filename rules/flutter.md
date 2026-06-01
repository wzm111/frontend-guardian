# Flutter 跨平台开发规范

## 1. Widget 构建优化

### 1.1 优先使用 const 构造函数
**严重程度**: 🟡 Warning
**说明**: `const` 构造函数创建的 Widget 在重建时不会重新创建，大幅减少 rebuild 开销。
**检测方式**: `grep -rE 'new\s+(Text|Container|Padding|Center|Row|Column)\(' lib/ --include='*.dart'` 或检查 StatelessWidget 构建中是否缺少 `const`。
**修复建议**: 所有无状态 Widget 使用 `const`：`const Text('Hello')`。

### 1.2 避免在 build 中创建对象
**严重程度**: 🟡 Warning
**说明**: `build()` 方法会频繁调用，不应在其中创建 `TextStyle`、`BoxDecoration` 等对象。
**检测方式**: 检查 `build()` 方法中是否直接 `new TextStyle(...)` 或 `BoxDecoration(...)`。
**修复建议**: 将样式对象提到类级别 `static const` 或在 `initState` 中创建。

### 1.3 StatefulWidget vs StatelessWidget 选择
**严重程度**: 💡 Suggestion
**说明**: 无状态 UI 使用 `StatelessWidget`，需要管理状态时使用 `StatefulWidget`。
**检测方式**: 检查 `StatefulWidget` 中 `setState` 从未被调用的情况。
**修复建议**: 无状态 Widget 改为 `StatelessWidget`。

## 2. 状态管理

### 2.1 状态管理方案选择
**严重程度**: 🟡 Warning
**说明**: 简单状态用 `setState` 或 `ValueNotifier`，跨页面状态用 `Provider`/`Riverpod`，复杂业务用 `Bloc`/`Cubit`。
**检测方式**: 检查是否在小项目中过度使用 Bloc，或在大项目中滥用 setState。
**修复建议**: 根据项目规模选择合适的状态管理方案。

### 2.2 Provider 正确使用
**严重程度**: 🟡 Warning
**说明**: `Provider` 应放在 `MultiProvider` 中，靠近 `MaterialApp`；`Consumer` 粒度尽量小。
**检测方式**: 检查 `Provider` 是否在 `build()` 中创建，或 `Consumer` 包裹了过多子树。
**修复建议**: Provider 在应用顶层创建；Consumer 只包裹需要重建的部分。

### 2.3 Riverpod 避免过度刷新
**严重程度**: 🟡 Warning
**说明**: `StateProvider`/`StateNotifier` 更新时，所有监听者都会重建，应使用 `select` 精确监听。
**检测方式**: 检查 `ConsumerWidget` 是否监听整个 provider 而非特定字段。
**修复建议**: 使用 `ref.watch(myProvider.select((s) => s.field))` 精确监听。

## 3. 异步与资源

### 3.1 FutureBuilder/StreamBuilder 错误处理
**严重程度**: 🔴 Critical
**说明**: `FutureBuilder` 和 `StreamBuilder` 必须处理 `ConnectionState.waiting`、`hasError` 状态。
**检测方式**: `grep -rA 10 'FutureBuilder\|StreamBuilder' lib/ --include='*.dart' | grep -v 'hasError\|ConnectionState'`
**修复建议**: 完整处理所有状态：`if (snapshot.hasError) ... else if (snapshot.connectionState == ConnectionState.waiting) ...`

### 3.2  dispose 清理资源
**严重程度**: 🔴 Critical
**说明**: `AnimationController`、`ScrollController`、`StreamSubscription` 等必须在 `dispose()` 中释放。
**检测方式**: `grep -r 'AnimationController\|ScrollController\|StreamSubscription' lib/ --include='*.dart' | grep -v 'dispose'`
**修复建议**: 在 `dispose() { controller.dispose(); super.dispose(); }` 中释放。

### 3.3 避免在 setState 中调用异步
**严重程度**: 🟡 Warning
**说明**: `setState` 中直接 `await` 异步操作可能导致状态不一致，应在外部 `await` 完成后调用 `setState`。
**检测方式**: `grep -rA 5 'setState' lib/ --include='*.dart' | grep -E 'await|async'`
**修复建议**: 将异步操作提取到方法中，await 完成后 setState。

## 4. 性能优化

### 4.1 ListView 大数据优化
**严重程度**: 🟡 Warning
**说明**: 长列表使用 `ListView.builder`（懒加载），不要用 `ListView(children: [...])`（一次性构建）。
**检测方式**: `grep -r 'ListView(' lib/ --include='*.dart' | grep 'children:'`
**修复建议**: 改为 `ListView.builder(itemCount: ..., itemBuilder: ...)`。

### 4.2 图片缓存与优化
**严重程度**: 🟡 Warning
**说明**: 网络图片使用 `cached_network_image` 包缓存，避免重复下载；大图片应限制尺寸。
**检测方式**: 检查是否直接使用 `Image.network()` 加载大量网络图片。
**修复建议**: 使用 `CachedNetworkImage(imageUrl: ..., placeholder: ...)`。

### 4.3 避免 Opacity/Clip 过度使用
**严重程度**: 🟡 Warning
**说明**: `Opacity` 和 `Clip` 会触发离屏渲染，动画中应避免使用，改用 `AnimatedOpacity` 或调整颜色透明度。
**检测方式**: 检查动画中是否使用 `Opacity` 或 `Clip`。
**修复建议**: 静态场景用 `Color.withOpacity()`，动画用 `AnimatedOpacity`。

### 4.4 懒加载与代码分割
**严重程度**: 💡 Suggestion
**说明**: 使用 `deferred as` 延迟加载大型库或页面，减少启动时间。
**检测方式**: 检查大型第三方库是否直接导入。
**修复建议**: `import 'package:heavy_lib/heavy_lib.dart' deferred as heavy;` + `await heavy.loadLibrary()`。

## 5. Dart 代码规范

### 5.1 空安全正确使用
**严重程度**: 🟡 Warning
**说明**: Dart 2.12+ 支持空安全，`?` 可空和 `!` 非空断言应正确使用，避免过度使用 `!`。
**检测方式**: `grep -r '!' lib/ --include='*.dart' | grep -v '//' | head -20`
**修复建议**: 使用 `?.` 和 `??` 安全访问，减少 `!` 断言。

### 5.2 late 变量谨慎使用
**严重程度**: 🟡 Warning
**说明**: `late` 变量延迟初始化，但如果访问前未初始化会抛出异常。应确保在 `initState` 中初始化。
**检测方式**: `grep -r 'late\s' lib/ --include='*.dart'`
**修复建议**: 尽量使用 `final` 或 `nullable` 替代 `late`。

### 5.3 避免 print 输出
**严重程度**: 💡 Suggestion
**说明**: 生产代码不应使用 `print`，应使用 `debugPrint` 或日志库（如 `logger`）。
**检测方式**: `grep -rE '\bprint\(' lib/ --include='*.dart' | grep -v 'debugPrint'`
**修复建议**: 替换为 `debugPrint(...)` 或日志框架。

## 6. 布局与响应式

### 6.1 使用 LayoutBuilder/MediaQuery
**严重程度**: 💡 Suggestion
**说明**: 响应式布局应使用 `LayoutBuilder` 获取父约束，或 `MediaQuery.of(context)` 获取屏幕尺寸。
**检测方式**: 检查是否硬编码宽高值（如 `width: 375`）。
**修复建议**: 使用 `MediaQuery.of(context).size.width` 或 `LayoutBuilder` 动态计算。

### 6.2 避免 Expanded 嵌套在固定尺寸容器中
**严重程度**: 🟡 Warning
**说明**: `Expanded` 只能用于 `Row`、`Column`、`Flex` 中，放在固定尺寸 `Container` 中会报错。
**检测方式**: 静态分析无法直接检测，需运行时检查。
**修复建议**: 确保 `Expanded` 的父级是 Flex 容器。

## 7. 国际化

### 7.1 使用 intl 包管理文案
**严重程度**: 🟡 Warning
**说明**: 所有 UI 文案使用 `intl` 包管理，通过 `.arb` 文件维护翻译。
**检测方式**: `grep -rE "Text\(\s*['\"][一-龥]" lib/ --include='*.dart'`
**修复建议**: 使用 `AppLocalizations.of(context)!.hello` 替代硬编码。

## 8. 平台通道

### 8.1 原生通信错误处理
**严重程度**: 🟡 Warning
**说明**: `MethodChannel` 调用原生方法时，必须处理 `PlatformException`。
**检测方式**: `grep -rA 5 'invokeMethod' lib/ --include='*.dart' | grep -v 'try\|catch'`
**修复建议**: 包裹 try/catch，捕获 `PlatformException`。
