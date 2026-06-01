# Ant Design 组件库使用规范

## 1. Table 组件

### 1.1 Table 必须设置 rowKey
**严重程度**: 🔴 Critical
**说明**: `Table` 组件必须设置 `rowKey`，否则使用数组索引作为 key，导致状态错乱和性能问题。
**检测方式**: `grep -rA 5 'Table' --include='*.tsx' --include='*.jsx' | grep -v 'rowKey='`
**修复建议**: `Table dataSource={data} rowKey="id" columns={columns} />`。

### 1.2 Table 大数据使用虚拟滚动
**严重程度**: 🟡 Warning
**说明**: 数据量超过 100 条时，应启用 `scroll={{ y: 400 }}` + `virtual` 或使用 `react-window` 集成。
**检测方式**: 检查 Table 组件是否配置了 `scroll` 属性。
**修复建议**: `Table scroll={{ y: 400 }} virtual`（Ant Design 5.11+）或自定义虚拟滚动。

### 1.3 Table 分页配置
**严重程度**: 💡 Suggestion
**说明**: 大数据列表应配置 `pagination`，避免一次性渲染全部数据。
**检测方式**: `grep -rA 10 'Table' --include='*.tsx' --include='*.jsx' | grep -v 'pagination'`
**修复建议**: `Table pagination={{ pageSize: 20, showSizeChanger: true }}`。

## 2. Form 组件

### 2.1 Form.Item 必须设置 name
**严重程度**: 🔴 Critical
**说明**: `Form.Item` 必须设置 `name` 属性，否则表单值无法收集和校验。
**检测方式**: `grep -rA 3 'Form\.Item' --include='*.tsx' --include='*.jsx' | grep -v 'name='`
**修复建议**: `Form.Item name="username" rules={[...]}><Input /></Form.Item>`。

### 2.2 Form 校验规则完整
**严重程度**: 🟡 Warning
**说明**: 关键字段（如手机号、邮箱、金额）必须配置 `rules` 校验，不能留空。
**检测方式**: `grep -rA 3 'Form\.Item' --include='*.tsx' --include='*.jsx' | grep -v 'rules='`
**修复建议**: 添加 `rules={[{ required: true, message: '请输入xxx' }]}`。

### 2.3 避免表单嵌套
**严重程度**: 🔴 Critical
**说明**: Ant Design 不支持表单嵌套（Form 内嵌 Form），会导致值收集错乱。
**检测方式**: `grep -rA 20 '<Form' --include='*.tsx' --include='*.jsx' | grep -B 5 '<Form'`
**修复建议**: 使用子表单组件或拆分为独立表单。

### 2.4 表单提交 loading 状态
**严重程度**: 🟡 Warning
**说明**: 表单提交按钮必须设置 `loading` 状态，防止重复提交。
**检测方式**: 检查表单提交按钮是否绑定 `loading`。
**修复建议**: `Button type="primary" htmlType="submit" loading={submitting}>`。

## 3. Modal / Drawer

### 3.1 Modal 设置 destroyOnClose
**严重程度**: 🟡 Warning
**说明**: `Modal` 应设置 `destroyOnClose`，关闭时销毁子组件，释放内存和重置状态。
**检测方式**: `grep -rA 5 'Modal' --include='*.tsx' --include='*.jsx' | grep -v 'destroyOnClose'`
**修复建议**: `Modal destroyOnClose open={visible}>`。

### 3.2 Modal 关闭前确认
**严重程度**: 💡 Suggestion
**说明**: 表单修改后的 Modal 关闭前应提示保存确认，避免误操作丢失数据。
**检测方式**: 检查 Modal 是否有 `onCancel` 拦截逻辑。
**修复建议**: `Modal onCancel={() => { if (dirty) confirmUnsaved(); else close(); }}>`。

### 3.3 Drawer 层级控制
**严重程度**: 🟡 Warning
**说明**: 避免多层 Drawer 嵌套（超过 2 层），用户体验差且难以导航。
**检测建议**: 检查是否有多层 Drawer 同时打开的场景。
**修复建议**: 用 Modal 替代第二层 Drawer，或改用页面跳转。

## 4. Select / TreeSelect

### 4.1 Select 大数据使用虚拟滚动
**严重程度**: 🟡 Warning
**说明**: 选项超过 100 个时，应启用 `virtual` 属性或使用 `showSearch` + `onSearch` 远程加载。
**检测方式**: 检查 Select 是否配置了 `virtual` 或远程搜索。
**修复建议**: `Select options={options} virtual` 或实现 `onSearch` 远程过滤。

### 4.2 Select 设置 optionFilterProp
**严重程度**: 💡 Suggestion
**说明**: 使用自定义 `optionLabelProp` 时，应同时设置 `optionFilterProp` 确保搜索正常。
**检测方式**: 检查 `optionLabelProp` 是否缺少 `optionFilterProp` 配合。
**修复建议**: `Select optionLabelProp="label" optionFilterProp="label">`。

## 5. DatePicker

### 5.1 DatePicker 时区处理
**严重程度**: 🟡 Warning
**说明**: 日期选择器返回的是 moment/dayjs 对象，提交到服务端前应统一为 UTC 或指定时区。
**检测方式**: 检查日期值是否直接提交，未做时区转换。
**修复建议**: `date.utc().format()` 或 `date.tz('Asia/Shanghai').format()`。

### 5.2 RangePicker 空值处理
**严重程度**: 🟡 Warning
**说明**: `RangePicker` 允许空值时，必须处理 `null` 场景，避免后续逻辑报错。
**检测方式**: `grep -rA 5 'RangePicker' --include='*.tsx' --include='*.jsx' | grep -v 'null\|undefined'`
**修复建议**: `onChange={(dates) => { if (dates) { const [start, end] = dates; ... } }}`。

## 6. Upload

### 6.1 Upload 文件类型和大小校验
**严重程度**: 🔴 Critical
**说明**: `Upload` 组件必须在 `beforeUpload` 中校验文件类型和大小，不能仅依赖服务端。
**检测方式**: `grep -rA 10 'Upload' --include='*.tsx' --include='*.jsx' | grep -v 'beforeUpload'`
**修复建议**: `beforeUpload={(file) => { if (file.size > 5 * 1024 * 1024) { message.error('文件过大'); return false; } return true; }}`。

### 6.2 Upload 限制上传数量
**严重程度**: 🟡 Warning
**说明**: 多文件上传应限制 `maxCount`，避免用户上传过多文件。
**检测方式**: `grep -rA 5 'Upload' --include='*.tsx' --include='*.jsx' | grep -v 'maxCount'`
**修复建议**: `Upload maxCount={5}>`。

## 7. 主题与配置

### 7.1 ConfigProvider 全局配置
**严重程度**: 💡 Suggestion
**说明**: 应使用 `ConfigProvider` 统一配置主题、国际化、组件尺寸，避免逐个组件设置。
**检测方式**: `grep -r 'ConfigProvider' --include='*.tsx' --include='*.jsx' src/`
**修复建议**: 在应用根组件包裹 `ConfigProvider`：`ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1890ff' } }}`。

### 7.2 响应式 Grid 使用
**严重程度**: 💡 Suggestion
**说明**: 布局应使用 `Row` + `Col` 响应式栅格，避免固定像素布局。
**检测方式**: 检查是否滥用固定 `width` 或 `margin` 做布局。
**修复建议**: `Row gutter={16}><Col xs={24} sm={12} md={8}>...</Col></Row>`。

## 8. 版本升级

### 8.1 Ant Design 4→5 迁移检查
**严重程度**: 🟡 Warning
**说明**: 从 v4 升级到 v5 时，moment 替换为 dayjs，`visible` 改为 `open`，`onVisibleChange` 改为 `onOpenChange`。
**检测方式**: `grep -rE 'visible|onVisibleChange|moment\(' --include='*.tsx' --include='*.jsx' src/`
**修复建议**: 批量替换废弃属性，使用 `dayjs` 替代 `moment`。

## 9. 性能

### 9.1 大数据表单优化
**严重程度**: 🟡 Warning
**说明**: 表单字段超过 50 个时，应使用 `Form.List` 或虚拟表单，避免全量渲染。
**检测方式**: 检查表单字段数量和渲染性能。
**修复建议**: 使用虚拟滚动或分页表单。

### 9.2 Memo 优化复杂子组件
**严重程度**: 💡 Suggestion
**说明**: Table 的 `columns` 和 Form 的表单项如果包含复杂渲染，应使用 `useMemo` 或 `React.memo` 优化。
**检测建议**: 使用 React DevTools Profiler 检查不必要的重渲染。
