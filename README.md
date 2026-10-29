# siocat ⚡

> A human-friendly TUI & CLI client for **Socket.IO**, similar to `wscat` but tailored for Socket.IO protocols (v2, v3, v4).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D12.0.0-green.svg)](https://nodejs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-v2%20%7C%20v3%20%7C%20v4-orange.svg)](https://socket.io/)

---

## 📖 简介 / Introduction

`wscat` 是调试标准 WebSocket 的绝佳工具，但在面对 Socket.IO 时往往无能为力——因为 Socket.IO 具有自己的封包格式、Engine.IO 心跳握手机制、命名空间体系，以及版本间的协议差异。

**siocat** 专为 Socket.IO 打造，既提供功能完善且颜值极高的 **终端用户界面（TUI Dashboard）**，也提供适合管道和脚本化的 **纯命令行模式（CLI Mode）**。

---

## ✨ 核心特性 / Features

- ⚡ **多版本协议兼容**：支持 Socket.IO **v2、v3、v4** 协议版本，参数一键切换。
- 🖥️ **现代双栏 TUI 界面**：
  - **实时消息流（Live Event Feed）**：全量捕获上下行事件，带精确毫秒时间戳与状态徽标，支持长文本自动换行（Line Wrap）与鼠标滚轮平滑滚动。
  - **可视交互命令选择框（Command Menu）**：内置 `[1-7]` 可视化命令菜单，一键唤起 **Emit 表单**、**ACK 应答表单**、**实时过滤器**与**统计详情**，告别死记硬背命令。
  - **自由光标行编辑器与语法高亮（LineEditor）**：支持在输入框内使用 `←` / `→`、`Home` / `End`、鼠标点击自由定位光标，实时显示命令名、事件名、参数与 JSON5 载荷语法高亮。
  - **已捕获事件快捷复用**：右侧事件列表中列出服务端发来的所有事件，按下 `Enter` 或鼠标点击即可快速唤起预填好事件名的发送表单。
  - **会话检查器（Session Inspector）**：实时展示连接状态、传输协议（WebSocket / Polling）、Socket ID 及运行耗时。
  - **极简提示与单步焦点切换**：输入框清爽无杂音，说明文档集中在 `Help` 浮窗（F1/?）；`Tab` 键在命令菜单、输入框、消息视窗与事件列表间精准循环切换。
- 🎯 **全自动通配监听（Wildcard Catch-All）**：自动截获服务端推送的任意自定义事件，无需预先手动注册监听。
- 🚀 **宽松 JSON5 输入**：支持人类友好的语法，键名免加引号、支持单引号，同时也支持纯字符串与基本类型。
- 🔄 **ACK 确认机制与超时控制**：支持带回调应答的消息发送与延迟测算（`ack <event> [data]`）。
- 🔍 **实时事件过滤**：支持通过正则表达式或关键字快速过滤嘈杂的推送流（`filter <pattern>`）。
- 💻 **双模式运行**：默认启动 TUI 仪表盘；指定 `--no-tui` 即可切换至彩色交互式 Readline 终端模式。
- 🔐 **认证与自定义配置**：支持 Socket.IO v4 握手认证对象（`--auth`）、自定义 HTTP 请求头（`-H`）、查询参数（`-q`）与路径（`--path`）。

---

## 🚀 快速上手 / Quick Start

### 1. 本地安装与运行 (Local Setup)

本项目作为本地开发与调试工具使用（**未发布至 npm 仓库**），请直接通过源码运行或通过 `npm link` 本地注册为全局命令：

```bash
# 克隆仓库并安装依赖
git clone https://github.com/bubao/siocat.git
cd siocat
npm install

# 方式一：直接运行
node bin/siocat.js http://localhost:3000

# 方式二：在本地注册为系统全局命令 siocat
npm link
siocat http://localhost:3000
```

### 2. 常用连接示例

```bash
# 基本连接（默认 Socket.IO v4，根命名空间 /）
siocat http://localhost:3000

# 连接特定命名空间
siocat http://localhost:3000 -n /chat

# 连接旧版 Socket.IO v2 服务器
siocat http://localhost:3000 -p 2

# 携带握手认证信息（支持 JSON5 语法）
siocat http://localhost:3000 --auth '{ token: "my-jwt-token", env: "dev" }'

# 设置自定义 HTTP 请求头与查询参数
siocat http://localhost:3000 -H "Authorization: Bearer xyz" -q "userId=1001"

# 强制仅使用 WebSocket 传输
siocat http://localhost:3000 --transports websocket

# 纯控制台 CLI 模式（适合 CI、测试或简易终端）
siocat http://localhost:3000 --no-tui
```

---

## ⌨️ 交互命令 / Interactive Commands

无论在 TUI 输入框还是 CLI 模式中，都可以直接使用以下命令：

| 命令 | 说明 | 示例 |
|------|------|------|
| `emit` / `send <event> [payload]` | 向服务器发送事件（支持 JSON5 或字符串） | `emit chatMessage { room: "dev", text: "hello" }` |
| `ack <event> [payload]` | 发送事件并等待服务端 ACK 回调 | `ack queryStatus { id: 123 }` |
| `filter [pattern]` | 过滤消息流，支持正则或关键字（留空清除） | `filter chat` 或 `filter /^order:/` |
| `stats` / `info` | 查看当前连接详情与事件统计表 | `stats` |
| `clear` / `cls` | 清空屏幕消息记录 | `clear` |
| `help` / `?` | 打开帮助窗口或打印帮助信息 | `help` |
| `exit` / `quit` / `:q` | 断开连接并退出程序 | `exit` |

> **提示**：发送载荷支持便捷的 JSON5 语法，例如 `emit userLogin { name: 'alice', age: 20 }`，无需繁琐地给每个属性加双引号！

---

## 🎮 TUI 交互与快捷键 / Keyboard Shortcuts

### 1. 焦点导航与命令选择
| 快捷键 | 功能说明 |
|--------|----------|
| `Tab` | 循环切换焦点：`[命令选择菜单]` ➜ `[命令输入框]` ➜ `[消息视窗]` ➜ `[已发现事件列表]` |
| `1` ~ `7` | 在未聚焦输入框时，按数字键直接触发菜单操作（如按 `1` 打开 Emit 表单，按 `2` 打开 ACK 表单） |
| `Enter` (在事件列表中) | 在右侧事件列表中选中某项后按回车，快速唤起以该事件名预填的 Emit 发送表单 |
| `F1` 或 `?` | 弹出 / 关闭 **帮助浮窗**（Help Modal） |
| `F2` | 弹出 **实时过滤器设置框**（Filter Modal） |
| `Ctrl+L` | 快速清空消息视窗 |
| `Ctrl+C` 或 `:q` | 退出程序 |

### 2. 行编辑器（LineEditor）光标操作
| 快捷键 | 功能说明 |
|--------|----------|
| `←` / `→` | 光标向左 / 向右平移单个字符（亦可直接鼠标点击定位） |
| `Home` / `Ctrl+A` | 光标快速跳至行首 |
| `End` / `Ctrl+E` | 光标快速跳至行尾 |
| `Backspace` | 删除光标左侧的一个字符 |
| `Delete` / `Ctrl+D` | 删除光标当前位置的一个字符 |
| `Ctrl+U` | 清除光标前至行首的全部内容 |
| `Ctrl+K` | 清除光标后至行尾的全部内容 |
| `Ctrl+W` | 删除光标左侧的一个单词 |
| `↑` / `↓` | 翻阅历史执行过的命令 |

---

## 🛠️ 命令行参数 / CLI Options

```text
用法: siocat [选项] <url>

参数:
  <url>                           Socket.IO 服务器地址 (例如: http://localhost:3000)

选项:
  -V, --version                   输出版本号
  -n, --namespace <namespace>     指定连接命名空间 (默认: "/")
  -p, --protocol <version>        Socket.IO 协议大版本 (2, 3, 或 4，默认: 4)
  -H, --header <header:value>     设置自定义 HTTP 请求头 (可多次传入)
  -o, --origin <origin>           设置 Origin 请求头
  -a, --auth <json>               Socket.IO v4 握手认证参数 (JSON/JSON5 格式)
  -q, --query <key=value>         连接查询参数 (可多次传入)
  --path <path>                   Socket.IO 路由路径 (默认: "/socket.io")
  --transports <transports>       传输方式列表，逗号分隔 (例如: "websocket,polling")
  --ack-timeout <ms>              ACK 回调等待超时时间 (默认: 5000 毫秒)
  --filter <pattern>              启动时应用的事件过滤规则 (正则或关键字)
  --no-tui                        禁用 TUI 界面，使用纯交互式控制台终端模式
  -h, --help                      显示帮助信息
```

---

## 📊 Socket.IO 协议兼容对照表

| 客户端版本 (`-p`) | Engine.IO 协议 | Socket.IO 协议 | 对应服务端版本 |
|------------------|----------------|----------------|---------------|
| `-p 2` | v3 | v4 | Socket.IO 1.x & 2.x |
| `-p 3` | v4 | v5 | Socket.IO 3.x |
| `-p 4` (默认) | v4 | v5 | Socket.IO 4.x |

---

## 🧪 本地开发与测试 / Development & Testing

项目自带测试服务端与完整的自动化测试用例（基于 Jest）：

```bash
# 1. 运行自动化测试套件
npm test

# 2. 启动内置 Socket.IO 测试服务端（端口 3000）
npm run test-server

# 3. 另开终端体验 siocat TUI
node bin/siocat.js http://localhost:3000

# 4. 或者体验 CLI 模式
node bin/siocat.js http://localhost:3000 --no-tui
```

---

## 📄 开源许可证 / License

本项目基于 [MIT 许可证](LICENSE) 开源。
