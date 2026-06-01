# UniApp 跨端开发规范

> 适用于 UniApp + Vue2/Vue3 项目，覆盖微信小程序、支付宝小程序、抖音小程序、H5、App（iOS/Android）、鸿蒙。

## 目录规范

```
src/
├── components/          # 公共组件（纯 UI，无平台逻辑）
├── pages/               # 页面
│   ├── index/
│   │   ├── index.vue
│   │   └── index.scss
├── subPackages/         # 分包目录（必须）
│   ├── packageA/
│   │   └── pages/
├── static/              # 静态资源
│   ├── images/
│   └── tabbar/
├── store/               # 状态管理
├── utils/               # 工具函数
├── api/                 # API 接口
├── locale/              # 国际化
│   ├── zh-Hans.json
│   └── en.json
├── manifest.json        # 应用配置
├── pages.json           # 页面路由
└── App.vue
```

## 条件编译规范

### ✅ 正确用法

```vue
<!-- 仅在小程序平台编译 -->
<!-- #ifdef MP-WEIXIN || MP-ALIPAY -->
<view class="mp-only">小程序专属内容</view>
<!-- #endif -->

<!-- 排除 H5 -->
<!-- #ifndef H5 -->
<view>非 H5 平台显示</view>
<!-- #endif -->

<!-- JS 中的条件编译 -->
<script setup>
// #ifdef APP-PLUS
const deviceInfo = uni.getSystemInfoSync()
// #endif

// #ifdef H5
console.log('H5 environment')
// #endif
</script>
```

### ❌ 错误用法

```javascript
// 错误：在跨端项目中使用平台专有 API
wx.request({ url })           // ❌ 只能用 uni.request
my.getSystemInfo({})          // ❌ 只能用 uni.getSystemInfo

// 错误：条件编译块未闭合
// #ifdef MP-WEIXIN
const a = 1
// 缺少 #endif

// 错误：无效的平台标识
// #ifdef WEIXIN      // ❌ 应为 MP-WEIXIN
// #ifdef MINI-APP    // ❌ 不存在此标识
```

### 合法平台标识符

| 标识符 | 说明 |
| ------ | ---- |
| `VUE3` / `VUE2` | Vue 版本 |
| `APP` / `APP-PLUS` / `APP-PLUS-NVUE` | App |
| `APP-HARMONY` | 鸿蒙 App |
| `H5` | H5 |
| `MP-WEIXIN` | 微信小程序 |
| `MP-ALIPAY` | 支付宝小程序 |
| `MP-BAIDU` | 百度小程序 |
| `MP-TOUTIAO` / `MP-DOUYIN` | 抖音小程序 |
| `MP-QQ` | QQ 小程序 |
| `MP-KUAISHOU` | 快手小程序 |
| `MP-JD` | 京东小程序 |
| `MP` | 所有小程序 |
| `QUICKAPP-WEBVIEW` | 快应用 |

## API 跨端规范

### 必须使用 uni 命名空间

```javascript
// ✅ 正确
uni.request({ url: '/api/user' })
uni.getSystemInfoSync()
uni.showToast({ title: 'Success' })
uni.navigateTo({ url: '/pages/detail' })

// ❌ 错误
wx.request({ url: '/api/user' })      // 微信小程序专有
my.httpRequest({ url: '/api/user' })  // 支付宝专有
swan.request({ url: '/api/user' })    // 百度专有
```

### API 兼容性检查

```javascript
// ✅ 正确：调用前做能力检测
if (uni.canIUse('getSystemInfoSync')) {
  const info = uni.getSystemInfoSync()
}

// ✅ 正确：使用 try-catch 处理不支持的 API
try {
  uni.startBluetoothDevicesDiscovery()
} catch (e) {
  uni.showModal({ title: '当前平台不支持蓝牙' })
}
```

### 同步 API 限制

```javascript
// ⚠️ 注意：部分同步 API 在小程序中可能报错
// 安全做法：
uni.getSystemInfo({
  success: (res) => {
    console.log(res.windowWidth)
  }
})

// 而非：
// const info = uni.getSystemInfoSync()  // 可能在某些环境报错
```

## 组件跨端规范

### 基础组件

```vue
<!-- ✅ 正确：使用 UniApp 内置组件 -->
<template>
  <view class="container">
    <text class="title">{{ title }}</text>
    <image class="avatar" :src="avatar" mode="aspectFill" />
    <scroll-view scroll-y class="list">
      <view v-for="item in list" :key="item.id">{{ item.name }}</view>
    </scroll-view>
  </view>
</template>

<!-- ❌ 错误：使用 DOM 标签 -->
<template>
  <div class="container">           <!-- ❌ 应用 view -->
    <span class="title">Title</span> <!-- ❌ 应用 text -->
    <img src="avatar.png" />         <!-- ❌ 应用 image -->
  </div>
</template>
```

### 组件事件

```vue
<script setup>
// ✅ 正确：使用 emits 声明事件
const emit = defineEmits(['click', 'submit'])

const handleClick = () => {
  emit('click', { id: 1 })
}
</script>
```

### ref 获取实例

```vue
<script setup>
import { ref, onMounted } from 'vue'

const myComponent = ref(null)

onMounted(() => {
  // ⚠️ 小程序中获取的是组件代理对象，非 DOM
  // 调用组件方法：
  myComponent.value?.someMethod?.()
})
</script>

<template>
  <my-component ref="myComponent" />
</template>
```

## 样式规范

### rpx 使用原则

```scss
/* ✅ 正确：需要适配宽度的场景用 rpx */
.container {
  width: 750rpx;        // 全屏宽度
  padding: 20rpx 30rpx; // 随屏幕缩放
  font-size: 28rpx;     // 文字大小随屏幕缩放
}

/* ✅ 正确：固定尺寸用 px */
.icon {
  width: 20px;          // 图标固定大小
  height: 20px;
  border-radius: 4px;   // 小圆角固定
}

/* ✅ 正确：1px 边框用 px */
.border {
  border: 1px solid #eee;
}
```

### page 选择器

```scss
/* ⚠️ 警告：page 选择器会影响所有页面 */
/* 应该限定在页面组件内 */
page {
  background-color: #f5f5f5;  // ✅ 全局背景色可以
}

/* ❌ 错误：在组件中使用 page 选择器 */
/* 组件 .vue 文件中： */
page {
  padding: 20rpx;  // ❌ 会污染所有页面
}
```

### CSS 变量兼容性

```scss
/* ⚠️ 注意：小程序 CSS 变量在基础库 2.7.0+ 支持 */
/* 建议提供 fallback */
.container {
  color: #333;
  color: var(--primary-color, #333);
}
```

## 页面与路由

### pages.json 规范

```json
{
  "pages": [
    {
      "path": "pages/index/index",
      "style": {
        "navigationBarTitleText": "首页"
      }
    }
  ],
  "subPackages": [
    {
      "root": "subPackages/order",
      "pages": [
        { "path": "list/list", "style": { "navigationBarTitleText": "订单列表" } },
        { "path": "detail/detail", "style": { "navigationBarTitleText": "订单详情" } }
      ]
    }
  ],
  "preloadRule": {
    "pages/index/index": {
      "network": "all",
      "packages": ["subPackages/order"]
    }
  }
}
```

### 导航规范

```javascript
// ✅ 正确：使用 uni 导航 API
uni.navigateTo({ url: '/pages/detail/detail?id=123' })
uni.redirectTo({ url: '/pages/login/login' })
uni.switchTab({ url: '/pages/home/home' })
uni.navigateBack({ delta: 1 })

// ⚠️ 注意：页面栈限制
// - navigateTo: 最多 10 层（小程序）
// - 超过建议用 redirectTo 或 reLaunch
```

## 性能优化

### 图片优化

```vue
<template>
  <!-- ✅ 必须加 lazy-load -->
  <image
    v-for="item in list"
    :key="item.id"
    :src="item.image"
    mode="aspectFill"
    lazy-load
  />

  <!-- ✅ 使用 CDN 图片，控制大小 -->
  <image
    :src="`${imageUrl}?x-oss-process=image/resize,w_375`"
    mode="widthFix"
  />
</template>
```

### 列表优化

```vue
<template>
  <!-- ✅ v-for 必须加 key -->
  <view v-for="item in list" :key="item.id">
    {{ item.name }}
  </view>

  <!-- ✅ 长列表使用虚拟列表或分页 -->
  <!-- 列表 > 100 项建议： -->
  <uni-list>
    <uni-list-item v-for="item in displayList" :key="item.id" />
  </uni-list>
</template>
```

### setData 优化

```javascript
// ✅ 正确：合并多次 setData
// 错误做法：
this.title = 'A'
this.content = 'B'
this.list = [1, 2, 3]  // 触发 3 次更新

// 正确做法（Vue3 Composition API）：
const state = reactive({
  title: 'A',
  content: 'B',
  list: [1, 2, 3]
})  // 只触发 1 次更新
```

## App 专项（nvue）

### nvue 限制

```vue
<!-- nvue 页面 -->
<template>
  <!-- ✅ nvue 支持 flex 布局 -->
  <view class="container">
    <text class="title">Title</text>
  </view>
</template>

<style>
/* ✅ nvue 支持 */
.container {
  flex-direction: row;
  align-items: center;
}

/* ❌ nvue 不支持 */
.container {
  display: grid;           /* ❌ 不支持 */
  position: relative;      /* ❌ 不支持 */
  float: left;             /* ❌ 不支持 */
  box-shadow: 0 2px 4px;   /* ❌ 不支持 */
}
</style>
```

### 原生插件

```javascript
// ✅ 正确：检测平台后调用
// #ifdef APP-PLUS
const TestModule = uni.requireNativePlugin('TestModule')
TestModule.test({ name: 'uni-app' }, (res) => {
  console.log(res)
})
// #endif
```

## 鸿蒙 HarmonyOS 适配

### uni-app-x 鸿蒙编译

```javascript
// ⚠️ 以下 API / 特性在鸿蒙环境可能不支持：
// - wxs（微信小程序脚本）
// - 部分小程序自定义组件
// - 特定平台条件编译块（MP-WEIXIN 等）

// ✅ 使用 APP-HARMONY 条件编译
// #ifdef APP-HARMONY
// 鸿蒙专属逻辑
// #endif
```

## 国际化（i18n）

### UniApp i18n 配置

```javascript
// main.js
import { createI18n } from 'vue-i18n'
import zhHans from './locale/zh-Hans.json'
import en from './locale/en.json'

const i18n = createI18n({
  locale: uni.getLocale(),  // 获取系统语言
  messages: {
    'zh-Hans': zhHans,
    'en': en
  }
})

app.use(i18n)
```

### 模板中使用

```vue
<template>
  <view>{{ $t('common.confirm') }}</view>
  <button>{{ $t('common.cancel') }}</button>
</template>
```

### 小程序 tabBar 国际化

```json
// pages.json
{
  "tabBar": {
    "list": [
      {
        "pagePath": "pages/index/index",
        "text": "%index.home%"
      }
    ]
  }
}
```

## 常见错误清单

| 错误 | 说明 | 修复 |
| ---- | ---- | ---- |
| `wx is not defined` | 使用了微信小程序专有 API | 改为 `uni.xxx` |
| `getSystemInfoSync fail` | 同步 API 在部分环境报错 | 改用异步 `uni.getSystemInfo` |
| `Page is not constructed` | 页面文件路径错误 | 检查 `pages.json` 配置 |
| `分包大小超过限制` | 分包 > 2MB | 优化图片、代码拆分 |
| `模板编译错误` | 使用了小程序不支持语法 | 检查 `v-show` / `v-html` 等 |
| `CSS 不生效` | nvue 不支持部分 CSS | 检查 nvue CSS 限制 |

## 检查规则汇总

| 规则 ID | 规则名 | 严重级别 | 说明 |
| ------- | ------ | -------- | ---- |
| uniapp-001 | 平台专有 API 使用 | 🔴 Critical | 检测到 wx / my / swan 等专有 API |
| uniapp-002 | 条件编译未闭合 | 🔴 Critical | `#ifdef` 缺少 `#endif` |
| uniapp-003 | 无效平台标识 | 🟡 Warning | 使用了不存在的平台标识符 |
| uniapp-004 | DOM 标签使用 | 🟡 Warning | 使用了 div / span / img 等 DOM 标签 |
| uniapp-005 | 缺少 key | 🟡 Warning | `v-for` 缺少 `key` |
| uniapp-006 | 图片未懒加载 | 🟡 Warning | `image` 组件缺少 `lazy-load` |
| uniapp-007 | rpx 使用不当 | 💡 Suggestion | 固定尺寸建议用 px |
| uniapp-008 | page 选择器污染 | 🟡 Warning | 组件中使用 page 选择器 |
| uniapp-009 | 同步 API 风险 | 💡 Suggestion | 建议使用异步 API |
| uniapp-010 | 包体积超限 | 🔴 Critical | 主包 / 分包超过大小限制 |
| uniapp-011 | nvue CSS 不支持 | 🔴 Critical | nvue 中使用了不支持的 CSS |
| uniapp-012 | 原生插件未配置 | 🟡 Warning | `requireNativePlugin` 的插件未在 manifest 配置 |
| uniapp-013 | 页面栈溢出风险 | 🟡 Warning | 连续 navigateTo 超过 10 层 |
| uniapp-014 | base64 图片过大 | 🟡 Warning | base64 图片 > 10KB |
| uniapp-015 | 缺少条件编译 | 💡 Suggestion | 平台差异代码建议加条件编译 |
