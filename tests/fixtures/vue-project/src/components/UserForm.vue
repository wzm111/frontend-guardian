<template>
  <div>
    <!-- 🔴 硬编码中文 -->
    <h1>用户表单</h1>
    <el-form ref="formRef" :model="form">
      <!-- 🔴 缺少 prop -->
      <el-form-item label="用户名">
        <el-input v-model="form.username" />
      </el-form-item>
      <el-form-item label="邮箱" prop="email">
        <el-input v-model="form.email" />
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue';

const form = reactive({
  username: '',
  email: ''
});

// 🔴 watch 包含 immediate 但未处理异步初始化
watch(() => form.username, (val) => {
  console.log('username changed:', val);
}, { immediate: true });

// 🔴 reactive 解构丢失响应性
const { username } = form;
</script>
