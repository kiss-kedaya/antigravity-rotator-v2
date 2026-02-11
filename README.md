# Antigravity Rotator V2

[English](#english) | [简体中文](#简体中文)

---

## English

**Antigravity Rotator V2** is a professional-grade account management and intelligent rotation dashboard designed for the OpenClaw Gateway. It enables seamless high-availability for AI model access through sophisticated monitoring and automated switching.

### 🚀 Key Features

- **High-Performance Concurrent Monitoring**: Utilizes Go goroutines to fetch quotas for multiple accounts simultaneously, reducing detection time from minutes to seconds.
- **Zero-Downtime Rotation**: Implements hot-swapping for accounts and models using OpenClaw RPC (`config.patch`). No gateway restart required.
- **Real-Time Visual Dashboard**: A modern React-based UI with live event-driven updates (Wails Events) showing the health and availability of your entire account cluster.
- **Intelligent Auto-Rotation**: A robust background engine that automatically switches to healthy accounts when the current one hits a custom quota threshold.
- **Cross-Workspace Synchronization**: Automatically detects and syncs authentication credentials across all your OpenClaw agent workspaces.
- **Native Network Performance**: Replaced external dependencies with native Go HTTP clients, optimized for proxy environments (e.g., Clashing 7890).

### 🛠️ Installation & Setup

#### Prerequisites
- **Go** (1.21 or higher)
- **Node.js** (18 or higher)
- **Wails CLI** (Install via `go install github.com/wailsapp/wails/v2/cmd/wails@latest`)
- **OpenClaw Gateway** (The core engine this tool manages)

#### Building from Source
```bash
# Clone the repository
git clone https://github.com/kiss-kedaya/antigravity-rotator-v2.git
cd antigravity-rotator-v2

# Build the production binary
wails build -clean
```
The binary will be located in the `build/bin/` directory.

#### Development & Debugging
```bash
# Start frontend dev server
cd frontend && npm install && npm run dev

# Run Wails in development mode (with hot reload)
wails dev
```

### 💡 Troubleshooting

1. **Quota showing --%**: Ensure your OpenClaw Gateway is running and your `auth-profiles.json` contains valid refresh tokens. Check your network proxy settings if Google APIs are unreachable.
2. **"invalid character 'p'" Error**: This was fixed in V2.4.0. If you encounter it, ensure you are running the latest version which filters CLI log noise from JSON outputs.
3. **RPC Connection Failed**: Verify that the OpenClaw Gateway RPC port (default 18789) is accessible and not blocked by a firewall.

---

## 简体中文

**Antigravity Rotator V2** 是一款专为 OpenClaw Gateway 设计的专业级账号管理与智能轮换看板。

### 🚀 核心功能

- **高性能并发监控**：利用 Go 协程并行获取多个账号的配额，探测速度提升 10 倍以上。
- **零停机秒级轮换**：基于 OpenClaw RPC (`config.patch`) 实现账号与模型的热切换，无需重启 Gateway。
- **实时数据可视化**：采用 React 构建的高级 UI，通过 Wails Events 实时推送配额变动，状态一目了然。
- **智能自动化引擎**：后台常驻轮换逻辑，当当前账号达到自定义低配额阈值时自动执行调度。
- **多工作区自动同步**：一键识别并同步所有 OpenClaw 智能体工作区的凭据文件。
- **原生网络优化**：弃用外部 curl 调用，改用原生 Go HTTP 客户端，深度优化了 7890 代理环境下的稳定性。

### 🛠️ 安装与运行

#### 环境要求
- **Go** (1.21+)
- **Node.js** (18+)
- **Wails CLI** (执行 `go install github.com/wailsapp/wails/v2/cmd/wails@latest` 安装)
- **OpenClaw Gateway** (被管理的支撑底座)

#### 编译步骤
```bash
# 克隆仓库
git clone https://github.com/kiss-kedaya/antigravity-rotator-v2.git
cd antigravity-rotator-v2

# 编译正式版二进制文件
wails build -clean
```
编译产物位于 `build/bin/` 文件夹下。

#### 调试指南
```bash
# 启动前端开发环境
cd frontend && npm install && npm run dev

# 启动 Wails 开发模式 (支持热重载)
wails dev
```

### 💡 常见问题排除

1. **配额显示 --%**：请检查 OpenClaw Gateway 是否正常运行，且 `auth-profiles.json` 中包含有效的 Refresh Token。若访问 Google API 受限，请检查代理设置。
2. **"invalid character 'p'" 报错**：此问题已在 V2.4.0 修复。请确保使用的是最新代码，它能自动过滤 CLI 的日志干扰。
3. **RPC 连接失败**：请确认 OpenClaw Gateway 的 RPC 端口（默认 18789）未被防火墙拦截。

## 开源协议
MIT License
