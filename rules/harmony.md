# 鸿蒙 HarmonyOS 开发规范

> 适用于 HarmonyOS NEXT / HarmonyOS 4.x ArkTS / ArkUI 项目。

## 目录规范

```
entry/src/main/
├── ets/
│   ├── entryability/        # EntryAbility
│   │   └── EntryAbility.ets
│   ├── pages/               # 页面
│   │   ├── Index.ets
│   │   └── Detail.ets
│   ├── components/          # 自定义组件
│   ├── viewmodels/          # 视图模型
│   ├── models/              # 数据模型
│   └── utils/               # 工具函数
├── resources/               # 资源文件
│   ├── base/
│   │   ├── element/         # 颜色、字符串等
│   │   ├── media/           # 图片
│   │   └── profile/         # 配置
│   └── rawfile/             # 原始文件
└── module.json5             # 模块配置
```

## ArkTS 语言规范

### 类型注解

```typescript
// ✅ 正确：严格类型注解（ArkTS 推荐启用严格模式）
interface User {
  id: string
  name: string
  age: number
  avatar?: string  // 可选属性
}

function getUserById(id: string): User | undefined {
  // ...
}

// ✅ 正确：函数参数和返回类型
function calculateTotal(price: number, quantity: number): number {
  return price * quantity
}

// ❌ 错误：缺少类型注解
function badFunction(data) {  // ❌ 参数无类型
  return data.value  // ❌ 返回无类型
}
```

### 状态管理装饰器

```typescript
// ✅ 正确：组件内状态使用 @State
@Component
struct Counter {
  @State count: number = 0  // ✅ 组件内部状态

  build() {
    Button(`Count: ${this.count}`)
      .onClick(() => {
        this.count++  // ✅ 直接修改
      })
  }
}

// ✅ 正确：父子组件通信使用 @Prop / @Link
@Component
struct Child {
  @Prop value: number        // ✅ 父传子（单向）
  @Link doubleValue: number  // ✅ 父子双向绑定

  build() {
    Text(`${this.value}`)
  }
}

// ✅ 正确：跨层级共享使用 @Provide / @Consume
@Component
struct Parent {
  @Provide('theme') theme: Theme = { primaryColor: '#1890ff' }

  build() {
    Child()
  }
}

@Component
struct DeepChild {
  @Consume('theme') theme: Theme  // ✅ 消费祖先提供的数据

  build() {
    Text('Hello')
      .fontColor(this.theme.primaryColor)
  }
}

// ✅ 正确：复杂对象状态使用 @ObjectLink + @Observed
@Observed
class Order {
  items: OrderItem[] = []
  total: number = 0
}

@Component
struct OrderView {
  @ObjectLink order: Order  // ✅ 观察对象内部变化

  build() {
    Column() {
      ForEach(this.order.items, (item: OrderItem) => {
        OrderItemView({ item })
      })
      Text(`Total: ${this.order.total}`)
    }
  }
}
```

## ArkUI 组件规范

### 自定义组件

```typescript
// ✅ 正确：使用 @Component 装饰器
@Component
struct UserCard {
  @Prop user: User
  @State isExpanded: boolean = false

  // ✅ 正确：组件构建函数
  build() {
    Column() {
      Image(this.user.avatar)
        .width(64)
        .height(64)
        .borderRadius(32)

      Text(this.user.name)
        .fontSize(16)
        .fontWeight(FontWeight.Bold)

      if (this.isExpanded) {
        Text(this.user.bio)
          .fontSize(14)
          .fontColor('#666')
      }
    }
    .padding(16)
    .backgroundColor('#fff')
    .borderRadius(8)
    .onClick(() => {
      this.isExpanded = !this.isExpanded
    })
  }
}

// ✅ 正确：页面组件使用 @Entry
@Entry
@Component
struct IndexPage {
  @State users: User[] = []

  aboutToAppear() {
    // ✅ 页面即将显示时加载数据
    this.loadUsers()
  }

  aboutToDisappear() {
    // ✅ 页面销毁时清理
    this.cleanup()
  }

  build() {
    Column() {
      List() {
        ForEach(this.users, (user: User) => {
          ListItem() {
            UserCard({ user: user })
          }
        }, (user: User) => user.id)
      }
      .layoutWeight(1)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#f5f5f5')
  }

  private async loadUsers() {
    this.users = await userApi.getUsers()
  }

  private cleanup() {
    // 清理资源
  }
}
```

### 资源引用

```typescript
// ✅ 正确：使用资源引用
Text($r('app.string.app_name'))
  .fontColor($r('app.color.primary'))
  .fontSize($r('app.float.title_font_size'))

Image($r('app.media.logo'))
  .width(100)
  .height(100)

// ✅ 正确：使用 rawfile
Web({ src: $rawfile('privacy_policy.html') })

// ❌ 错误：硬编码资源
Text('My App')           // ❌ 应使用 $r('app.string.app_name')
  .fontColor('#1890ff')  // ❌ 应使用 $r('app.color.primary')
```

## 性能优化

### 列表优化

```typescript
// ✅ 正确：使用 List + ListItem + 懒加载
@Entry
@Component
struct LongListPage {
  @State items: Item[] = Array.from({ length: 1000 }, (_, i) => ({
    id: `${i}`,
    title: `Item ${i}`,
  }))

  build() {
    List() {
      LazyForEach(this.items, (item: Item) => {
        ListItem() {
          ItemView({ item })
        }
      }, (item: Item) => item.id)
    }
    .cachedCount(5)  // ✅ 预缓存 5 个 item
    .edgeEffect(EdgeEffect.Spring)
  }
}

// ❌ 错误：不使用 LazyForEach 渲染长列表
// ForEach(this.items, ...)  // ❌ 会一次性创建所有 item
```

### 多线程处理

```typescript
// ✅ 正确：使用 TaskPool 处理耗时任务
import { taskpool } from '@kit.ArkTS'

@Concurrent
function heavyCalculation(data: number[]): number {
  return data.reduce((sum, val) => sum + val * val, 0)
}

async function processData(data: number[]): Promise<number> {
  const task = new taskpool.Task(heavyCalculation, data)
  return await taskpool.execute(task)
}

// ✅ 正确：使用 Worker 处理独立任务
// workers/MyWorker.ets
import { worker } from '@kit.ArkTS'

const workerPort = worker.workerPort

workerPort.onmessage = (e: MessageEvents) => {
  const result = processData(e.data)
  workerPort.postMessage(result)
}
```

## 检查规则汇总

| 规则 ID | 规则名 | 严重级别 | 说明 |
| ------- | ------ | -------- | ---- |
| harmony-001 | 缺少类型注解 | 🔴 Critical | ArkTS 函数参数/返回类型缺失 |
| harmony-002 | @Component 缺失 | 🔴 Critical | 自定义组件缺少装饰器 |
| harmony-003 | @Entry 缺失 | 🔴 Critical | 页面组件缺少 @Entry |
| harmony-004 | 状态管理错误 | 🔴 Critical | @State / @Prop / @Link 使用错误 |
| harmony-005 | 硬编码资源 | 🟡 Warning | 颜色/字符串/尺寸未使用 $r() |
| harmony-006 | 长列表未懒加载 | 🟡 Warning | 未使用 LazyForEach |
| harmony-007 | 缺少生命周期 | 🟡 Warning | 未实现 aboutToAppear / aboutToDisappear |
| harmony-008 | 主线程阻塞 | 🔴 Critical | 耗时操作未放入 TaskPool / Worker |
| harmony-009 | 资源未释放 | 🟡 Warning | 图片/连接等资源未释放 |
| harmony-010 | 未使用 @Observed | 🟡 Warning | 复杂对象状态未使用 @Observed + @ObjectLink |
