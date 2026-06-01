# Vue 开发规范

> 适用于 Vue 3（Composition API）+ TypeScript 项目，覆盖 PC Web、H5。

## 目录规范

```
src/
├── components/          # 公共组件
│   ├── BaseButton/
│   │   ├── BaseButton.vue
│   │   └── index.ts     # 导出
├── views/               # 页面
├── composables/         # 组合式函数
│   ├── useAuth.ts
│   └── useFetch.ts
├── stores/              # Pinia 状态管理
├── router/              # 路由配置
├── utils/               # 工具函数
├── api/                 # API 接口
├── types/               # 类型定义
├── directives/          # 自定义指令
└── App.vue
```

## Composition API 规范

### reactive vs ref

```vue
<script setup lang="ts">
// ✅ 正确：对象/数组使用 reactive
const form = reactive({
  name: '',
  email: '',
  age: 0,
})

// ✅ 正确：单个值使用 ref
const count = ref(0)
const message = ref('Hello')
const isLoading = ref(false)

// ✅ 正确：DOM 引用使用 ref
const inputRef = ref<HTMLInputElement | null>(null)

// ❌ 错误： reactive 解构会丢失响应式
const { name, email } = reactive({ name: '', email: '' })
// name 和 email 不再是响应式的！

// ✅ 正确：使用 toRefs 解构
const state = reactive({ name: '', email: '' })
const { name, email } = toRefs(state)  // name 和 email 仍是 ref

// 或者使用 storeToRefs (Pinia)
const store = useUserStore()
const { user, isLoggedIn } = storeToRefs(store)
</script>
```

### computed 规范

```vue
<script setup lang="ts">
// ✅ 正确：纯计算，无副作用
const fullName = computed(() => `${firstName.value} ${lastName.value}`)

// ✅ 正确：带 getter/setter
const count = computed({
  get: () => store.count,
  set: (val) => store.setCount(val),
})

// ❌ 错误：computed 中修改其他响应式数据
const badComputed = computed(() => {
  const result = items.value.filter(i => i.active)
  count.value = result.length  // ❌ 副作用！
  return result
})
</script>
```

### watch 规范

```vue
<script setup lang="ts">
const userId = ref('')
const user = ref<User | null>(null)

// ✅ 正确：监听单个 ref
watch(userId, (newId, oldId) => {
  fetchUser(newId).then(data => user.value = data)
})

// ✅ 正确：监听 reactive 对象的属性
watch(() => form.name, (newName) => {
  console.log('Name changed:', newName)
})

// ✅ 正确：深度监听
watch(
  () => form,
  (newForm) => {
    console.log('Form changed:', newForm)
  },
  { deep: true }
)

// ⚠️ 注意：immediate: true 时的异步处理
watch(
  userId,
  async (newId) => {
    if (!newId) return
    try {
      user.value = await fetchUser(newId)
    } catch (e) {
      console.error('Failed to fetch user:', e)
    }
  },
  { immediate: true }
)
</script>
```

### 生命周期钩子

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, onUpdated } from 'vue'

// ✅ 正确：DOM 操作放在 onMounted
onMounted(() => {
  // 可以安全访问 DOM
  console.log(inputRef.value?.value)
})

// ✅ 正确：清理副作用
let timer: number
onMounted(() => {
  timer = window.setInterval(() => {
    console.log('tick')
  }, 1000)
})

onUnmounted(() => {
  clearInterval(timer)  // ✅ 清理
})

// ✅ 正确：事件监听清理
onMounted(() => {
  const handler = () => console.log('resize')
  window.addEventListener('resize', handler)

  onUnmounted(() => {
    window.removeEventListener('resize', handler)  // ✅ 清理
  })
})
</script>
```

### provide / inject

```vue
<script setup lang="ts">
// 父组件提供
const user = ref<User>({ id: '1', name: 'John' })
provide('user', user)

// ✅ 正确：提供响应式数据
provide('theme', readonly(theme))  // 推荐用 readonly 防止子组件修改

// 子组件注入
// ✅ 正确：提供默认值
const user = inject('user', ref({ id: '', name: '' }))

// ✅ 正确：使用 Symbol 避免命名冲突
const UserKey = Symbol('user')
provide(UserKey, user)
const injectedUser = inject(UserKey)

// ❌ 错误：不提供默认值
const badUser = inject('user')  // 可能为 undefined
</script>
```

## Pinia 状态管理

```ts
// stores/user.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// ✅ 正确：使用 Setup Store（推荐）
export const useUserStore = defineStore('user', () => {
  // State
  const user = ref<User | null>(null)
  const loading = ref(false)

  // Getters
  const isLoggedIn = computed(() => !!user.value)
  const userName = computed(() => user.value?.name ?? 'Guest')

  // Actions
  async function login(credentials: Credentials) {
    loading.value = true
    try {
      user.value = await api.login(credentials)
    } finally {
      loading.value = false
    }
  }

  function logout() {
    user.value = null
  }

  return { user, loading, isLoggedIn, userName, login, logout }
})

// ❌ 错误：在组件外调用 useStore
// const store = useUserStore()  // ❌ 必须在 setup 中调用

// ✅ 正确：在 setup 中使用
function UserProfile() {
  const store = useUserStore()
  const { user, isLoggedIn } = storeToRefs(store)  // ✅ 解构保持响应式

  return { user, isLoggedIn }
}
```

## 组件规范

### Props 定义

```vue
<script setup lang="ts">
// ✅ 正确：使用接口定义 props
interface Props {
  title: string
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  items: Item[]
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  disabled: false,
})

// ✅ 正确：emits 定义
defineEmits<{
  click: [id: string]
  update: [value: string]
}>()
</script>
```

### v-for 规范

```vue
<template>
  <!-- ✅ 正确：始终提供 key -->
  <div v-for="item in items" :key="item.id">
    {{ item.name }}
  </div>

  <!-- ❌ 错误：使用 index 作为 key（除非列表不变化） -->
  <div v-for="(item, index) in items" :key="index">
    {{ item.name }}
  </div>

  <!-- ✅ 正确：配合 template 使用 -->
  <template v-for="item in items" :key="item.id">
    <div>{{ item.name }}</div>
    <div>{{ item.description }}</div>
  </template>
</template>
```

## 检查规则汇总

| 规则 ID | 规则名 | 严重级别 | 说明 |
| ------- | ------ | -------- | ---- |
| vue-001 | reactive 解构丢失响应式 | 🔴 Critical | `const { x } = reactive(...)` |
| vue-002 | toRefs 未使用 | 🟡 Warning | 解构 reactive 对象时未 toRefs |
| vue-003 | computed 副作用 | 🔴 Critical | computed 中修改其他响应式数据 |
| vue-004 | watch immediate 异步 | 🟡 Warning | immediate: true 但异步依赖未就绪 |
| vue-005 | onMounted 异步错误 | 🟡 Warning | onMounted 中 async 操作未处理错误 |
| vue-006 | inject 无默认值 | 🟡 Warning | inject 无默认值或类型断言 |
| vue-007 | store 组件外调用 | 🔴 Critical | useStore 在 setup 外调用 |
| vue-008 | v-for 缺少 key | 🟡 Warning | v-for 缺少 key |
| vue-009 | v-for 使用 index | 🟡 Warning | 动态列表使用 index 作为 key |
| vue-010 | 事件未声明 | 🟡 Warning | emits 未声明 |
