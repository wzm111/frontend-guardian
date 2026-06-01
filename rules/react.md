# React 开发规范

> 适用于 React 16.8+ / React 18 项目，覆盖 PC Web、H5。

## 目录规范

```
src/
├── components/          # 公共组件（纯展示组件）
│   ├── Button/
│   │   ├── index.tsx
│   │   ├── index.scss
│   │   └── __tests__/
├── pages/               # 页面组件
├── hooks/               # 自定义 Hooks
│   ├── useAuth.ts
│   └── useFetch.ts
├── contexts/            # Context 定义
├── stores/              # 状态管理（Zustand/Redux）
├── utils/               # 工具函数
├── api/                 # API 接口
├── types/               # 全局类型定义
├── constants/           # 常量
└── App.tsx
```

## Hooks 最佳实践

### useEffect 依赖规则

```tsx
// ✅ 正确：所有响应式依赖都在 deps 数组中
function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    fetchUser(userId).then(setUser)
  }, [userId])  // ✅ userId 是唯一的依赖

  return <div>{user?.name}</div>
}

// ❌ 错误：缺少依赖
function BadExample({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    fetchUser(userId).then(setUser)  // ❌ userId 不在 deps 中
  }, [])  // eslint-disable-next-line react-hooks/exhaustive-deps

  return <div>{user?.name}</div>
}

// ❌ 错误：过多依赖（应拆分）
function TooManyDeps() {
  const [a, setA] = useState(0)
  const [b, setB] = useState(0)
  const [c, setC] = useState(0)
  const [d, setD] = useState(0)
  const [e, setE] = useState(0)
  const [f, setF] = useState(0)

  useEffect(() => {
    // 复杂逻辑使用多个状态
    console.log(a, b, c, d, e, f)
  }, [a, b, c, d, e, f])  // ⚠️ 6 个依赖，建议拆分
}
```

### useEffect Cleanup

```tsx
// ✅ 正确：清理副作用
function Timer() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCount(c => c + 1)
    }, 1000)

    return () => {  // ✅ cleanup
      clearInterval(interval)
    }
  }, [])

  return <div>{count}</div>
}

// ✅ 正确：事件监听清理
function EventListener() {
  useEffect(() => {
    const handleResize = () => {
      console.log(window.innerWidth)
    }
    window.addEventListener('resize', handleResize)

    return () => {  // ✅ cleanup
      window.removeEventListener('resize', handleResize)
    }
  }, [])
}

// ❌ 错误：未清理副作用
function BadTimer() {
  useEffect(() => {
    setInterval(() => {
      console.log('tick')
    }, 1000)
    // ❌ 缺少 cleanup，组件卸载后定时器仍在运行
  }, [])
}
```

### 闭包陷阱

```tsx
// ❌ 错误：闭包陷阱 - count 永远是 0
function ClosureTrap() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      console.log(count)  // ❌ 永远是 0
      setCount(count + 1) // ❌ 永远是 1
    }, 1000)
    return () => clearInterval(timer)
  }, [])  // count 不在 deps 中

  return <div>{count}</div>
}

// ✅ 正确：使用函数式更新
function FixedClosure() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCount(c => c + 1)  // ✅ 使用函数式更新
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return <div>{count}</div>
}

// ✅ 正确：使用 ref 保存最新值
function RefSolution() {
  const [count, setCount] = useState(0)
  const countRef = useRef(count)
  countRef.current = count

  useEffect(() => {
    const timer = setInterval(() => {
      console.log(countRef.current)  // ✅ 始终是最新值
    }, 1000)
    return () => clearInterval(timer)
  }, [])
}
```

### 自定义 Hook 规范

```tsx
// ✅ 正确：命名以 use 开头
function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    checkAuth().then(setUser).finally(() => setLoading(false))
  }, [])

  // 返回对象（推荐，特别是超过 2 个返回值时）
  return { user, loading, isLoggedIn: !!user }
}

// ❌ 错误：命名不以 use 开头
function authHook() {  // ❌ 应该叫 useAuth
  // ...
}

// ⚠️ 警告：返回数组元素过多
function useForm() {
  // 超过 3 个返回值建议使用对象
  return [value, setValue, error, validate, reset, isDirty]  // ⚠️ 6 个元素
}

// ✅ 正确：使用对象返回
function useFormBetter() {
  return {
    value,
    setValue,
    error,
    validate,
    reset,
    isDirty,
  }
}
```

## 状态管理

### useState vs useReducer

```tsx
// ✅ useState：简单状态
const [count, setCount] = useState(0)

// ✅ useReducer：复杂状态逻辑
interface State {
  loading: boolean
  data: User[]
  error: Error | null
  page: number
}

type Action =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: User[] }
  | { type: 'FETCH_ERROR'; payload: Error }
  | { type: 'SET_PAGE'; payload: number }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null }
    case 'FETCH_SUCCESS':
      return { ...state, loading: false, data: action.payload }
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.payload }
    case 'SET_PAGE':
      return { ...state, page: action.payload }
    default:
      return state
  }
}

function UserList() {
  const [state, dispatch] = useReducer(reducer, {
    loading: false,
    data: [],
    error: null,
    page: 1,
  })
}
```

### Context 使用规范

```tsx
// ✅ 正确：将频繁变化的值拆分到独立 Context
// 避免不必要的重渲染

// 主题 Context（变化频率低）
const ThemeContext = createContext<Theme>(defaultTheme)

// 用户 Context（变化频率中等）
const UserContext = createContext<UserContextType | null>(null)

// 实时数据 Context（变化频率高）
const LiveDataContext = createContext<LiveData | null>(null)

// ❌ 错误：把所有状态放在一个大 Context 中
const AppContext = createContext({
  theme: defaultTheme,    // 很少变化
  user: null,             // 偶尔变化
  notifications: [],      // 频繁变化
  liveData: null,         // 非常频繁变化
})
```

## 性能优化

### useMemo / useCallback 使用原则

```tsx
// ✅ 正确：计算昂贵的值
function ExpensiveChart({ data }: { data: DataPoint[] }) {
  const processedData = useMemo(() => {
    return data.map(d => ({
      ...d,
      normalized: (d.value - d.min) / (d.max - d.min),
    }))
  }, [data])

  return <Chart data={processedData} />
}

// ✅ 正确：传递给子组件的回调
function Parent() {
  const [count, setCount] = useState(0)

  const handleClick = useCallback(() => {
    setCount(c => c + 1)
  }, [])

  return <Child onClick={handleClick} />
}

// ❌ 错误：简单值不需要 useMemo
function BadUseMemo() {
  const value = useMemo(() => a + b, [a, b])  // ❌ 计算不复杂

  const handleClick = useCallback(() => {
    console.log('click')
  }, [])  // ❌ 没有依赖，也没有传递给 memo 子组件
}
```

### React.memo 使用

```tsx
// ✅ 正确：纯展示组件使用 React.memo
const UserCard = React.memo(function UserCard({ user, onSelect }: Props) {
  return (
    <div onClick={() => onSelect(user.id)}>
      <img src={user.avatar} alt={user.name} />
      <span>{user.name}</span>
    </div>
  )
})

// ❌ 错误：不必要地包裹所有组件
const SimpleDiv = React.memo(function SimpleDiv({ children }: { children: ReactNode }) {
  return <div>{children}</div>  // ❌ 太简单，memo 开销 > 收益
})
```

## 类型安全

```tsx
// ✅ 正确：为组件 props 定义接口
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
}

function Button({ variant = 'primary', size = 'md', disabled, onClick, children }: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// ✅ 正确：使用 React.FC（可选，但推荐显式类型）
const Card: React.FC<CardProps> = ({ title, children }) => {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  )
}
```

## 检查规则汇总

| 规则 ID | 规则名 | 严重级别 | 说明 |
| ------- | ------ | -------- | ---- |
| react-001 | useEffect 缺失依赖 | 🔴 Critical | deps 数组缺少响应式变量 |
| react-002 | useEffect 过多依赖 | 🟡 Warning | deps > 5 个，建议拆分 |
| react-003 | useEffect 空依赖陷阱 | 🔴 Critical | 空 deps 但使用了 state |
| react-004 | 副作用未清理 | 🔴 Critical | setInterval/setTimeout/EventListener 未 cleanup |
| react-005 | 闭包陷阱 | 🔴 Critical | 异步回调中引用了过期的 state |
| react-006 | 自定义 Hook 命名 | 🟡 Warning | 不以 use 开头 |
| react-007 | 自定义 Hook 返回 | 🟡 Warning | 返回数组元素 > 3 |
| react-008 | useCallback 滥用 | 💡 Suggestion | 简单函数包裹 useCallback |
| react-009 | useMemo 滥用 | 💡 Suggestion | 计算不复杂但包裹 useMemo |
| react-010 | Context 粒度过大 | 🟡 Warning | 频繁更新的值放在大 Context 中 |
| react-011 | React.memo 滥用 | 💡 Suggestion | 简单组件包裹 memo |
| react-012 | key 使用索引 | 🟡 Warning | map 中使用 index 作为 key |
| react-013 | 内联对象/数组 | 💡 Suggestion | JSX 中直接定义对象/数组导致重渲染 |
