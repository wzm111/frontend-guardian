Page({
  data: {
    list: [],
    title: '首页'
  },

  onLoad() {
    // 🔴 未清理的定时器
    this.data.timer = setInterval(() => {
      this.pollData();
    }, 3000);

    // 🔴 直接调用 wx.request 未封装
    wx.request({
      url: 'http://example.com/api/data',
      success: (res) => {
        this.setData({ list: res.data });
      }
    });
  },

  // 🔴 onUnload 未清理资源
  onUnload() {
    // 应该清理 timer
  },

  pollData() {
    console.log('polling...');
  },

  onTapItem(e) {
    // 🔴 页面栈可能过深
    wx.navigateTo({
      url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id
    });
  }
});
