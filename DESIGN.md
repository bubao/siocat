# siocat - Socket.IO 命令行客户端工具设计文档

## 1. 项目概述

siocat 是一个类似于 [wscat](https://www.npmjs.com/package/wscat) 的命令行工具，专门用于与 Socket.IO 服务器进行交互。它提供了一个终端用户界面（TUI），支持多种 Socket.IO 协议版本，让用户可以轻松连接、测试和调试 Socket.IO 服务。

### 1.1 核心理念

与 wscat 针对标准 WebSocket 协议不同，siocat 专门为 Socket.IO 协议设计，考虑到 Socket.IO 协议的复杂性和版本差异，提供更加人性化的交互界面。

### 1.2 主要特性

- 支持多种 Socket.IO 协议版本（v2/v3/v4）
- 提供直观的终端用户界面（TUI）
- 支持命名空间连接
- 支持事件发送和监听
- 支持消息确认机制
- 类似 wscat 的命令行参数和使用体验

## 2. 技术架构

### 2.1 核心依赖

1. **Socket.IO Client** - 官方 Socket.IO 客户端库，用于与服务器通信
2. **TUI 库** - 用于构建终端用户界面（考虑使用 [blessed](https://github.com/chjj/blessed) 或类似的现代替代品）
3. **Commander.js** - 用于处理命令行参数
4. **Chalk** - 用于终端着色输出

### 2.2 支持的 Socket.IO 版本

根据调研结果，Socket.IO 协议有多个版本，不同版本之间可能存在不兼容：

| JavaScript 版本 | Socket.IO 协议版本 | Engine.IO 协议版本 | 对应关系 |
|---------------|------------------|------------------|---------|
| 0.9.x | 1, 2 | 1, 2 | 不支持 |
| 1.x 和 2.x | 3, 4 | 3 | 对应 Socket.IO v2 |
| 3.x 和 4.x | 5 | 4 | 对应 Socket.IO v3/v4 |

### 2.3 TUI 界面设计

TUI 界面将分为几个区域：

1. **连接状态栏** - 显示当前连接状态和服务器信息
2. **消息历史区** - 显示收发的所有消息
3. **输入区** - 用户输入命令和消息的地方
4. **帮助提示区** - 显示快捷键和命令帮助

## 3. 功能规格

### 3.1 基础连接功能

- [ ] 通过 URL 连接到 Socket.IO 服务器
- [ ] 支持指定命名空间连接
- [ ] 支持认证和自定义 HTTP 头
- [ ] 显示连接状态变化

### 3.2 消息交互功能

- [ ] 发送自定义事件消息
- [ ] 监听并显示收到的事件
- [ ] 支持 ACK 回调机制
- [ ] 支持二进制数据传输

### 3.3 TUI 交互功能

- [ ] 分屏显示消息历史和输入区域
- [ ] 快捷键支持（如 Ctrl+C 退出）
- [ ] 命令历史记录
- [ ] 消息着色区分（发送/接收/系统消息）

### 3.4 命令行参数

```
用法：siocat [选项] <url>

选项：
  -V, --version                输出版本号
  -n, --namespace <namespace>  连接的命名空间 （默认："/")
  -p, --protocol <version>     指定 Socket.IO 协议版本
  -H, --header <header:value>  设置 HTTP 头
  -o, --origin <origin>        设置 Origin 头
  --help                       显示帮助信息
```

## 4. 项目结构

```
siocat/
├── bin/
│   └── siocat.js              # CLI 入口
├── lib/
│   ├── client.js              # Socket.IO 客户端封装
│   ├── tui.js                 # TUI 界面管理
│   └── utils.js               # 工具函数
├── package.json               # 项目配置
└── README.md                  # 项目说明
```

## 5. 核心模块设计

### 5.1 Socket.IO 客户端模块

负责与 Socket.IO 服务器的通信，需要处理不同版本的协议兼容性。

```javascript
// client.js
class SioCatClient {
  constructor(options) {
    this.url = options.url;
    this.namespace = options.namespace || '/';
    this.protocolVersion = options.protocolVersion;
    this.headers = options.headers || {};
    this.socket = null;
  }
  
  connect() { /* 建立连接 */ }
  disconnect() { /* 断开连接 */ }
  sendEvent(event, data, ackCallback) { /* 发送事件 */ }
  onEvent(event, handler) { /* 监听事件 */ }
}
```

### 5.2 TUI 界面模块

提供用户交互界面，展示消息历史和接收用户输入。

```javascript
// tui.js
class SioCatTUI {
  constructor(client) {
    this.client = client;
    this.screen = null;  // blessed screen
    this.messageBox = null;
    this.inputBox = null;
  }
  
  init() { /* 初始化 TUI 界面 */ }
  addMessage(message) { /* 添加消息到显示区域 */ }
  getUserInput() { /* 获取用户输入 */ }
  destroy() { /* 清理界面 */ }
}
```

### 5.3 主程序模块

处理命令行参数并协调其他模块工作。

```javascript
// siocat.js
// 解析命令行参数
// 初始化客户端和 TUI
// 启动应用主循环
```

## 6. 使用示例

### 6.1 基本连接

```bash
siocat http://localhost:3000
```

### 6.2 指定命名空间

```bash
siocat http://localhost:3000 -n /chat
```

### 6.3 发送事件

在 TUI 界面中：
```
> emit chatMessage "Hello World"
> emit joinRoom {"room":"general"}
```

### 6.4 监听事件

在 TUI 界面中所有接收到的事件都会自动显示在消息区域。

## 7. 开发计划

### 第一阶段：核心功能实现
1. 实现基本的 Socket.IO 客户端连接功能
2. 实现命令行参数解析
3. 实现基础的消息发送和接收

### 第二阶段：TUI 界面开发
1. 集成 TUI 库
2. 设计分屏界面布局
3. 实现消息显示和用户输入处理

### 第三阶段：高级功能完善
1. 多版本协议支持
2. ACK 回调机制
3. 命令历史记录
4. 消息着色和格式化

### 第四阶段：优化和发布
1. 性能优化和错误处理
2. 文档完善
3. 测试用例编写
4. 发布到 npm

## 8. 预期挑战

1. **协议版本兼容性** - 不同版本的 Socket.IO 协议存在差异，需要正确处理
2. **TUI 界面响应性** - 需要在大量消息情况下保持界面流畅
3. **错误处理** - 需要优雅地处理各种网络异常和协议错误
4. **跨平台兼容性** - 确保在不同操作系统和终端环境下正常运行

## 9. 项目优势

相比于现有的工具，siocat 的优势在于：

1. 专为 Socket.IO 设计，比通用 WebSocket 工具更适合
2. 直观的 TUI 界面，提供更好的用户体验
3. 支持多个 Socket.IO 协议版本
4. 类似 wscat 的使用习惯，降低学习成本

这个设计文档提供了一个完整的 siocat 项目蓝图，涵盖了从技术选型到功能实现的各个方面。接下来可以根据这个设计开始具体的编码实现。