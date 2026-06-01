# Taro 跨端开发规范

> 适用于 Taro 3.x + React / Vue 项目，覆盖微信小程序、支付宝小程序、抖音小程序、H5、App（iOS/Android）、鸿蒙。

## 目录规范

```
src/
├── components/          # 公共组件
├── pages/               # 页面
│   ├── index/
│   │   ├── index.tsx
│   │   └── index.scss
├── subPackages/         # 分包
│   ├── packageA/
│   │   └── pages/
├── static/              # 静态资源
├── config/              # 配置文件
│   ├── index.js         # 基础配置
│   ├── dev.js           # 开发配置
│   └── prod.js          # 生产配置
├── store/               # 状态管理
├── utils/               # 工具函数
├── api/                 # API 接口
├── app.config.ts        # 应用配置
├── app.tsx              # 应用入口
└── app.scss
```

## 编译配置规范

### config/index.js

```javascript
const config = {
  // ✅ 正确：明确指定编译器
  compiler: 'webpack5',  // 或 'vite'

  // ✅ 正确：定义所有目标平台
  targets: [
    'weapp',    // 微信小程序
    'alipay',   // 支付宝小程序
    'tt',       // 抖音小程序
    'h5',       // H5
    'rn',       // React Native
    'harmony',  // 鸿蒙
  ],

  // ✅ H5 路由配置
  h5: {
    router: {
      mode: 'hash',      // 或 'browser'（需要服务端支持）
      basename: '/app'
    },
    publicPath: '/',
    staticDirectory: 'static',
    esnextModules: ['taro-ui'],
  },

  // ✅ 小程序配置
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {
          selectorBlackList: [/body/],  // 不转换的样式选择器
        }
      }
    }
  }
}

module.exports = config
```

### 编译器一致性检查

```bash
# ✅ 依赖一致性检查
# 如果 config 中配置 compiler: 'webpack5'
# 必须安装 @tarojs/webpack5-runner
npm ls @tarojs/webpack5-runner

# 如果配置 compiler: 'vite'
# 必须安装 @tarojs/vite-runner
npm ls @tarojs/vite-runner
```

## 跨端组件规范

### 必须使用 Taro 组件

```tsx
import { View, Text, Image, ScrollView, Button } from '@tarojs/components'

// ✅ 正确：使用 Taro 跨端组件
function MyComponent() {
  return (
    <View className="container">
      <Text className="title">Hello Taro</Text>
      <Image
        className="avatar"
        src="https://example.com/avatar.png"
        mode="aspectFill"
        lazyLoad
      />
      <ScrollView scrollY className="list">
        <View>Item 1</View>
        <View>Item 2</View>
      </ScrollView>
    </View>
  )
}

// ❌ 错误：使用 DOM 标签
function BadComponent() {
  return (
    <div className="container">       {/* ❌ 应用 View */}
      <span>Title</span>               {/* ❌ 应用 Text */}
      <img src="avatar.png" />        {/* ❌ 应用 Image */}
    </div>
  )
}
```

### 事件绑定

```tsx
import { View } from '@tarojs/components'

// ✅ 正确：使用 onClick（Taro 已统一）
function EventDemo() {
  const handleClick = () => {
    console.log('clicked')
  }

  return (
    <View onClick={handleClick}>Click me</View>
  )
}

// ❌ 错误：使用平台专有事件名
// <View onTap={handleClick}>     {/* ❌ Taro 中统一为 onClick */}
// <View bindtap={handleClick}>   {/* ❌ 微信小程序语法，不可用于 Taro */}
```

### 表单组件

```tsx
import { Input, Form, Button } from '@tarojs/components'

// ✅ 正确：Taro 表单处理
function FormDemo() {
  const handleSubmit = (e) => {
    console.log(e.detail.value)  // 小程序中从 detail 获取值
  }

  return (
    <Form onSubmit={handleSubmit}>
      <Input name="username" placeholder="请输入用户名" />
      <Input name="password" type="password" placeholder="请输入密码" />
      <Button formType="submit">提交</Button>
    </Form>
  )
}
```

## Hooks 跨端规范

### 生命周期 Hooks

```tsx
import { useLoad, useReady, useDidShow, useDidHide, useUnload } from '@tarojs/taro'

// ✅ 正确：小程序生命周期
function MiniProgramPage() {
  useLoad((options) => {
    console.log('页面加载', options)
  })

  useDidShow(() => {
    console.log('页面显示')
  })

  useDidHide(() => {
    console.log('页面隐藏')
  })

  useUnload(() => {
    console.log('页面卸载')
  })
}

// ✅ 正确：H5 中 useReady 替代 useLoad
function H5Page() {
  useReady(() => {
    console.log('DOM 就绪')
  })
}
```

### ⚠️ 跨端生命周期差异

| Hook | 小程序 | H5 | App |
| ---- | ------ | ---- | --- |
| `useLoad` | ✅ | ❌ 用 `useReady` | ✅ |
| `useReady` | ✅ | ✅ | ✅ |
| `useDidShow` | ✅ | ⚠️ 刷新时触发 | ✅ |
| `useDidHide` | ✅ | ⚠️ 切换标签页触发 | ✅ |
| `usePullDownRefresh` | ✅ | ❌ | ❌ |
| `useReachBottom` | ✅ | ❌ | ❌ |
| `useShareAppMessage` | ✅ | ❌ | ❌ |

### 路由 Hooks

```tsx
import { useRouter, navigateTo, redirectTo, switchTab, navigateBack } from '@tarojs/taro'

// ✅ 正确：使用 Taro 路由 API
function PageA() {
  const router = useRouter()

  const goToDetail = () => {
    navigateTo({
      url: '/pages/detail/index?id=123&name=test'
    })
  }

  // 获取路由参数
  console.log(router.params.id)    // '123'
  console.log(router.params.name)  // 'test'
}
```

### API 调用封装

```tsx
// utils/request.ts
import Taro from '@tarojs/taro'

// ✅ 正确：封装请求，处理多平台差异
const request = (options) => {
  return new Promise((resolve, reject) => {
    Taro.request({
      ...options,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(res)
        }
      },
      fail: (err) => {
        reject(err)
      }
    })
  })
}

// 添加拦截器
const addInterceptor = () => {
  Taro.addInterceptor((chain) => {
    const requestParams = chain.requestParams

    // 添加 token
    requestParams.header = {
      ...requestParams.header,
      Authorization: `Bearer ${getToken()}`
    }

    return chain.proceed(requestParams).then((res) => {
      // 统一错误处理
      if (res.statusCode === 401) {
        Taro.redirectTo({ url: '/pages/login/index' })
      }
      return res
    })
  })
}

export { request, addInterceptor }
```

## 样式规范

### pxTransform 使用

```tsx
import Taro from '@tarojs/taro'

// ✅ 正确：使用 pxTransform 转换
const styles = {
  container: {
    width: Taro.pxTransform(750),    // 750px -> 750rpx
    padding: Taro.pxTransform(20),   // 20px -> 20rpx
  }
}

// ❌ 错误：手动计算或硬编码
const badStyles = {
  width: '750rpx',  // 不如用 pxTransform 语义清晰
}
```

### CSS / SCSS 写法

```scss
/* ✅ 正确：使用 rpx 单位 */
.container {
  width: 750rpx;
  padding: 20rpx 30rpx;
  font-size: 28rpx;
}

/* ✅ 正确：1px 边框 */
.border {
  border: 1px solid #eee;
}

/* ✅ 正确：固定尺寸用 px */
.icon {
  width: 20px;
  height: 20px;
}
```

### 行内样式单位

```tsx
// ❌ 错误：行内样式中的 px 未转换
<View style={{ width: '100px' }} />   // 小程序中不会自动转换

// ✅ 正确：使用 rpx 或 pxTransform
<View style={{ width: Taro.pxTransform(100) }} />
<View style={{ width: '100rpx' }} />
```

### CSS Modules

```tsx
// ✅ 正确：启用 CSS Modules
// config/index.js
mini: {
  postcss: {
    cssModules: {
      enable: true,
      config: {
        namingPattern: 'module',
        generateScopedName: '[name]__[local]___[hash:base64:5]'
      }
    }
  }
}

// 组件中使用
import styles from './index.module.scss'

function Component() {
  return <View className={styles.container}>Content</View>
}
```

## 分包与预加载

### app.config.ts

```typescript
export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/profile/index',
  ],
  subPackages: [
    {
      root: 'packageA',
      pages: [
        'pages/list/index',
        'pages/detail/index',
      ]
    },
    {
      root: 'packageB',
      pages: [
        'pages/cart/index',
        'pages/order/index',
      ]
    }
  ],
  // ✅ 预加载配置
  preloadRule: {
    'pages/index/index': {
      network: 'all',
      packages: ['packageA']
    }
  }
})
```

## 第三方 UI 库

### 版本兼容性检查

```bash
# ✅ Taro 与 UI 库版本对照
# Taro 3.6.x -> taro-ui 3.1.x
# Taro 3.6.x -> nutui-react 2.x
# Taro 3.6.x -> antd-mobile 5.x (H5)

# 检查版本兼容性
npm ls taro-ui
npm ls @nutui/nutui-react
```

### UI 库使用

```tsx
// ✅ 正确：使用适配 Taro 的 UI 库
import { Button, Toast } from '@nutui/nutui-react'

function App() {
  return (
    <Button type="primary" onClick={() => Toast.show('Hello')}>
      Click
    </Button>
  )
}

// ❌ 错误：使用未适配的 UI 库
import { Button } from 'antd'  // ❌ antd 未适配小程序
```

## H5 输出优化

### publicPath 配置

```javascript
// config/prod.js
module.exports = {
  h5: {
    publicPath: '/app/',  // 根据部署路径配置
    router: {
      mode: 'hash'        // 静态部署用 hash，服务端渲染用 browser
    }
  }
}
```

### 页面标题

```typescript
// app.config.ts
export default defineAppConfig({
  window: {
    navigationBarTitleText: '默认标题'
  }
})

// 页面级配置
// pages/index/index.config.ts
export default definePageConfig({
  navigationBarTitleText: '首页'  // H5 中映射为 document.title
})
```

## 小程序专有规范

### 条件编译（Taro 风格）

```tsx
import { View } from '@tarojs/components'
import Taro from '@tarojs/taro'

function PlatformDemo() {
  const handleClick = () => {
    // ✅ 正确：使用 Taro 环境判断
    if (process.env.TARO_ENV === 'weapp') {
      // 微信小程序逻辑
      Taro.request({ url: '/api/wechat' })
    } else if (process.env.TARO_ENV === 'alipay') {
      // 支付宝逻辑
    } else if (process.env.TARO_ENV === 'h5') {
      // H5 逻辑
    }
  }

  return (
    <View>
      {/* 平台特定渲染 */}
      {process.env.TARO_ENV === 'weapp' && (
        <View>微信小程序专属内容</View>
      )}
    </View>
  )
}
```

### process.env.TARO_ENV 值

| 值 | 平台 |
| -- | ---- |
| `weapp` | 微信小程序 |
| `alipay` | 支付宝小程序 |
| `tt` | 抖音小程序 |
| `h5` | H5 |
| `rn` | React Native |
| `harmony` | 鸿蒙 |

## 鸿蒙 HarmonyOS 适配

### 编译目标

```bash
# 编译鸿蒙版本
taro build --type harmony
```

### 限制

```tsx
// ⚠️ 以下特性在鸿蒙环境可能不支持：
// - 部分小程序自定义组件
// - WebView（使用 ArkWeb 替代）
// - 特定平台条件编译（weapp / alipay 等）

// ✅ 使用 harmony 条件判断
if (process.env.TARO_ENV === 'harmony') {
  // 鸿蒙专属逻辑
}
```

## 检查规则汇总

| 规则 ID | 规则名 | 严重级别 | 说明 |
| ------- | ------ | -------- | ---- |
| taro-001 | DOM 标签使用 | 🔴 Critical | 使用了 div / span / img 等 DOM 标签 |
| taro-002 | 平台原生组件 | 🔴 Critical | 使用了 `wx:xx` / `a:xx` 等平台原生组件语法 |
| taro-003 | 事件名错误 | 🟡 Warning | 使用了 `onTap` / `bindtap` 等非标准事件名 |
| taro-004 | 生命周期混用 | 🟡 Warning | H5 中使用了小程序专属生命周期 hook |
| taro-005 | 行内样式 px | 🟡 Warning | 行内样式中的 px 未转换 |
| taro-006 | 编译器不匹配 | 🔴 Critical | config 中 compiler 与安装依赖不匹配 |
| taro-007 | 缺少 targets | 🟡 Warning | config 中未定义目标平台 |
| taro-008 | UI 库不兼容 | 🔴 Critical | 使用了未适配 Taro 的 UI 库 |
| taro-009 | API 未拦截 | 💡 Suggestion | Taro.request 未配置拦截器 |
| taro-010 | 路由硬编码 | 🟡 Warning | 路由路径硬编码，建议用常量 |
| taro-011 | 缺少分包 | 💡 Suggestion | 页面数 > 10 建议配置分包 |
| taro-012 | 未配置预加载 | 💡 Suggestion | 建议为关键页面配置预加载 |
| taro-013 | H5 publicPath | 🟡 Warning | H5 部署未配置 publicPath |
| taro-014 | CSS Modules 未启用 | 💡 Suggestion | 建议启用 CSS Modules |
