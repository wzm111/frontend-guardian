# Element Plus 组件库使用规范

## 1. Table 组件

### 1.1 Table 必须设置 row-key
**严重程度**: 🔴 Critical
**说明**: `el-table` 必须设置 `row-key`，否则展开行、树形数据、选择状态会错乱。
**检测方式**: `grep -rA 5 'el-table' --include='*.vue' --include='*.tsx' | grep -v 'row-key'`
**修复建议**: `el-table :data="tableData" row-key="id">`。

### 1.2 Table 大数据使用虚拟滚动
**严重程度**: 🟡 Warning
**说明**: 数据量超过 100 条时，应使用 `el-table-v2`（虚拟表格）或开启 `height` + `virtual-scroll`。
**检测方式**: 检查 `el-table` 是否配置了 `height` 或是否使用 `el-table-v2`。
**修复建议**: `el-table :data="data" height="400"` 或改用 `el-table-v2`。

### 1.3 Table 分页配置
**严重程度**: 💡 Suggestion
**说明**: 配合 `el-pagination` 使用，避免前端全量渲染大数据。
**检测方式**: `grep -rA 20 'el-table' --include='*.vue' --include='*.tsx' | grep -v 'el-pagination'`
**修复建议**: 添加分页组件：`el-pagination v-model:current-page="page" :page-size="20" :total="total"`。

## 2. Form 组件

### 2.1 Form 必须设置 ref 和 rules
**严重程度**: 🔴 Critical
**说明**: `el-form` 必须设置 `ref` 和 `:rules`，否则无法手动校验和统一处理。
**检测方式**: `grep -rA 5 'el-form' --include='*.vue' --include='*.tsx' | grep -v 'ref=\|rules='`
**修复建议**: `el-form ref="formRef" :model="form" :rules="rules">`。

### 2.2 FormItem 必须设置 prop
**严重程度**: 🔴 Critical
**说明**: `el-form-item` 必须设置 `prop`，对应 `el-form` 的 `model` 字段名，否则校验不生效。
**检测方式**: `grep -rA 3 'el-form-item' --include='*.vue' --include='*.tsx' | grep -v 'prop='`
**修复建议**: `el-form-item label="用户名" prop="username"><el-input v-model="form.username" /></el-form-item>`。

### 2.3 表单校验触发时机
**严重程度**: 🟡 Warning
**说明**: 表单校验规则应设置 `trigger: 'blur'`（失焦校验）或 `trigger: 'change'`（变更校验），避免提交时才报错。
**检测方式**: 检查 `rules` 中是否缺少 `trigger` 配置。
**修复建议**: `rules: { username: [{ required: true, message: '请输入', trigger: 'blur' }] }`。

### 2.4 表单提交 loading
**严重程度**: 🟡 Warning
**说明**: 表单提交按钮应绑定 `:loading="submitting"`，防止重复提交。
**检测方式**: 检查提交按钮是否缺少 `loading` 属性。
**修复建议**: `el-button type="primary" @click="submit" :loading="submitting">提交</el-button>`。

## 3. Dialog / Drawer

### 3.1 Dialog 设置 close-on-click-modal
**严重程度**: 🟡 Warning
**说明**: 编辑类 Dialog 应设置 `:close-on-click-modal="false"`，避免误点击遮罩关闭导致数据丢失。
**检测方式**: `grep -rA 5 'el-dialog' --include='*.vue' --include='*.tsx' | grep -v 'close-on-click-modal'`
**修复建议**: `el-dialog v-model="visible" :close-on-click-modal="false">`。

### 3.2 Dialog 关闭前确认
**严重程度**: 💡 Suggestion
**说明**: 表单修改后的 Dialog 关闭前应提示保存确认。
**检测方式**: 检查 `el-dialog` 是否配置了 `before-close`。
**修复建议**: `:before-close="handleClose"` + `handleClose(done) { if (dirty) { ElMessageBox.confirm(...) } else done(); }`。

### 3.3 Drawer 层级控制
**严重程度**: 🟡 Warning
**说明**: 避免多层 Drawer 嵌套，用户体验差。
**检测建议**: 检查是否有多个 Drawer 同时打开的场景。
**修复建议**: 用 Dialog 替代或改用页面跳转。

## 4. Select / Cascader

### 4.1 Select 大数据优化
**严重程度**: 🟡 Warning
**说明**: 选项超过 100 个时，应启用 `filterable` + 远程搜索，或使用虚拟滚动。
**检测方式**: 检查 `el-select` 选项数量是否过大。
**修复建议**: `el-select v-model="value" filterable remote :remote-method="searchMethod">`。

### 4.2 Cascader 懒加载
**严重程度**: 🟡 Warning
**说明**: 级联选择器数据量大时，必须使用 `lazy` + `load` 懒加载。
**检测方式**: 检查 `el-cascader` 是否配置了 `lazy` 属性。
**修复建议**: `el-cascader v-model="value" :props="{ lazy: true, lazyLoad }"`。

## 5. DatePicker

### 5.1 DatePicker 格式化配置
**严重程度**: 🟡 Warning
**说明**: `el-date-picker` 应配置 `value-format` 确保提交格式一致。
**检测方式**: `grep -rA 5 'el-date-picker' --include='*.vue' --include='*.tsx' | grep -v 'value-format'`
**修复建议**: `el-date-picker v-model="date" value-format="YYYY-MM-DD">`。

### 5.2 RangePicker 默认值处理
**严重程度**: 🟡 Warning
**说明**: 日期范围选择器应处理空值和默认值，避免提交 `[null, null]`。
**检测方式**: 检查范围选择器绑定值是否做了空值处理。
**修复建议**: `const dateRange = ref([]); submit() { if (!dateRange.value || dateRange.value.length !== 2) return; }`。

## 6. Upload

### 6.1 Upload 文件校验
**严重程度**: 🔴 Critical
**说明**: `el-upload` 必须在 `before-upload` 中校验文件类型和大小。
**检测方式**: `grep -rA 10 'el-upload' --include='*.vue' --include='*.tsx' | grep -v 'before-upload'`
**修复建议**: `:before-upload="beforeUpload"` + `beforeUpload(file) { if (file.size > 5 * 1024 * 1024) { ElMessage.error('文件过大'); return false; } return true; }`。

### 6.2 Upload 限制数量
**严重程度**: 🟡 Warning
**说明**: 多文件上传应设置 `:limit`。
**检测方式**: `grep -rA 5 'el-upload' --include='*.vue' --include='*.tsx' | grep -v 'limit='`
**修复建议**: `el-upload :limit="5" :on-exceed="handleExceed">`。

## 7. 消息通知

### 7.1 ElMessage 统一封装
**严重程度**: 💡 Suggestion
**说明**: `ElMessage` 应统一封装，避免散落各处的消息文案不一致。
**检测方式**: `grep -r 'ElMessage' src/ --include='*.vue' --include='*.ts'`
**修复建议**: 封装 `message.ts`：`export const msgSuccess = (text) => ElMessage.success(text)`。

### 7.2 ElNotification 使用场景
**严重程度**: 💡 Suggestion
**说明**: 全局通知（如系统消息）用 `ElNotification`，操作反馈用 `ElMessage`。
**检测建议**: 检查是否滥用 `ElNotification` 做简单操作反馈。

## 8. 主题与国际化

### 8.1 ConfigProvider 全局配置
**严重程度**: 💡 Suggestion
**说明**: 使用 `el-config-provider` 统一配置语言、尺寸、z-index。
**检测方式**: 检查根组件是否包裹 `el-config-provider`。
**修复建议**: `el-config-provider :locale="zhCn" size="default" z-index="3000">`。

### 8.2 响应式布局
**严重程度**: 💡 Suggestion
**说明**: 使用 `el-row` + `el-col` 响应式栅格，避免固定像素。
**检测方式**: 检查是否滥用固定 `width` 做布局。
**修复建议**: `el-row :gutter="16"><el-col :xs="24" :sm="12" :md="8">...</el-col></el-row>`。

## 9. 性能优化

### 9.1 虚拟列表使用
**严重程度**: 🟡 Warning
**说明**: 大数据列表（Select、Table、Tree）应使用虚拟滚动。
**检测方式**: 检查大数据场景是否启用了虚拟滚动。
**修复建议**: Table 用 `el-table-v2`，Select 用远程搜索，Tree 用懒加载。

### 9.2 Memo 优化
**严重程度**: 💡 Suggestion
**说明**: 复杂 Table columns 和 Form 项使用 `computed` 或 `shallowRef` 优化。
**检测建议**: 使用 Vue DevTools 检查不必要的重渲染。

## 10. Vue 3 兼容

### 10.1 响应式数据使用 ref/reactive
**严重程度**: 🟡 Warning
**说明**: Element Plus 基于 Vue 3，表单数据应使用 `ref` 或 `reactive`，避免直接修改 props。
**检测方式**: 检查是否有直接修改 `props` 或 `data` 的代码。
**修复建议**: 使用 `const form = reactive({ name: '' })` + `v-model="form.name"`。

### 10.2 事件命名使用 camelCase
**严重程度**: 🟡 Warning
**说明**: Vue 3 模板中事件监听使用 `@close` 而非 `@on-close`，Element Plus 的事件名是 camelCase。
**检测方式**: `grep -rE '@on-[a-z]+' --include='*.vue' src/`
**修复建议**: `@close`、`@change`、`@input` 等。
