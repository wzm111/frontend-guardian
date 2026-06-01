import { useState, useEffect } from 'react';

// 🔴 自定义 Hook 未以 use 开头
export function counterHook() {
  const [count, setCount] = useState(0);

  // 🔴 useEffect 依赖不完整
  useEffect(() => {
    document.title = `Count: ${count}`;
  }, []);

  return { count, setCount };
}

// ✅ 正确的自定义 Hook
export function useCounter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    document.title = `Count: ${count}`;
  }, [count]);

  return { count, increment: () => setCount(c => c + 1) };
}
