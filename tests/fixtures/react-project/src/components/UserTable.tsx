import React, { useState, useEffect } from 'react';
import { Table, Form, Input, Button, Modal } from 'antd';

// 硬编码中文文案 - 应被 scan-i18n 检测
const title = '用户管理';

export default function UserTable() {
  const [users, setUsers] = useState([]);
  const [visible, setVisible] = useState(false);
  const [timer, setTimer] = useState(null);

  // 🔴 useEffect 缺少依赖数组
  useEffect(() => {
    fetchUsers();
  });

  // 🔴 setInterval 未清理 - 闭包陷阱
  useEffect(() => {
    const id = setInterval(() => {
      console.log('polling');
    }, 5000);
  }, []);

  // 🔴 Table 缺少 rowKey
  const columns = [
    { title: '姓名', dataIndex: 'name' },
    { title: '邮箱', dataIndex: 'email' },
  ];

  return (
    <div>
      {/* 🔴 硬编码中文 */}
      <h1>用户列表</h1>

      {/* 🔴 Form.Item 缺少 name */}
      <Form>
        <Form.Item label="用户名">
          <Input placeholder="请输入用户名" />
        </Form.Item>
        <Form.Item label="邮箱" name="email" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Button type="primary">提交</Button>
      </Form>

      {/* 🔴 Table 缺少 rowKey */}
      <Table dataSource={users} columns={columns} />

      {/* 🔴 Modal 缺少 destroyOnClose */}
      <Modal open={visible} onCancel={() => setVisible(false)}>
        <p>确认删除吗？</p>
      </Modal>

      {/* 🔴 图片缺少 alt */}
      <img src="/logo.png" />

      {/* 🔴 Icon 按钮缺少 aria-label */}
      <button onClick={() => setVisible(true)}>
        <span>×</span>
      </button>
    </div>
  );
}
