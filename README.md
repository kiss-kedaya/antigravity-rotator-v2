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
- **Native Network Performance**: Optimized native Go HTTP clients for proxy environments (e.g., Clashing 7890).

### 🛠️ Installation & Setup

#### Prerequisites
- **Go** (1.21 or higher)
- **Node.js** (18 or higher)
- **Wails CLI** (Install via `go install github.com/wailsapp/wails/v2/cmd/wails@latest`)
- **OpenClaw Gateway** (Ensure the gateway is running)

#### Building from Source
```bash
# Clone the repository
git clone https://github.com/kiss-kedaya/antigravity-rotator-v2.git
cd antigravity-rotator-v2

# Build the production binary
wails build -clean
```
The binary will be generated in the `build/bin/` directory.

### ⚙️ Usage Guide

1. **Launch**: Run the compiled `.exe` (on Windows) or the corresponding binary for your OS.
2. **Import Accounts**: Use the "Import JSON" button to load your Google Refresh Tokens. Format should be an array of `{email, refresh_token}`.
3. **Set Threshold**: Adjust the "Auto-Isolation Threshold" slider. If a model's quota drops below this percentage, the engine will trigger a rotation.
4. **Manual Rotation**: Click "Force Rotation" to immediately switch to the best available account and model based on your priority list.
5. **Model Priority**: Click on model names in the "Priority Queue" to promote them to Primary status.

### 🔧 Advanced Configuration

The application stores its configuration in `~/.openclaw/antigravity-rotator-v2.json`. 

- **`modelPriority`**: An array of model IDs (e.g., `google-antigravity/gemini-3-pro-high`) in order of preference.
- **`rotateInterval`**: The frequency (in minutes) at which the auto-rotation engine checks account health.
- **`openclawBin`**: (Optional) Path to your `openclaw` executable if it's not in your system PATH.

### 💡 Troubleshooting

- **Quota showing --%**: Verify your `auth-profiles.json` contains valid tokens and the OpenClaw Gateway is reachable.
- **RPC Errors**: Ensure the Gateway RPC port (default 18789) is not blocked.
- **Network Issues**: Ensure your proxy (default 127.0.0.1:7890) is active if you are in a restricted network region.

---

## 简体中文

**Antigravity Rotator V2** 是一款专为 OpenClaw Gateway 设计的专业级账号管理与智能轮换看板。

### 🚀 核心功能

- **高性能并发监控**：利用 Go 协程并行获取多个账号的配额，探测速度极快。
- **零停机秒级轮换**：基于 OpenClaw RPC (`config.patch`) 实现账号与模型的热切换。
- **实时数据可视化**：采用 React 构建的高级 UI，通过 Wails Events 实时推送配额变动。
- **智能自动化引擎**：后台常驻轮换逻辑，自动调度高配额账号。
- **多工作区自动同步**：一键识别并同步所有 OpenClaw 智能体工作区的凭据文件。

### 🛠️ 安装与运行

#### 环境要求
- **Go** (1.21+)
- **Node.js** (18+)
- **Wails CLI**
- **OpenClaw Gateway**

#### 编译步骤
```bash
git clone https://github.com/kiss-kedaya/antigravity-rotator-v2.git
cd antigravity-rotator-v2
wails build -clean
```

### 📖 使用说明

1. **导入凭据**：点击“导入 JSON”，格式为包含 `email` 和 `refresh_token` 的数组。
2. **阈值设定**：滑动调节“自动隔离阈值”。当配额低于此值时，系统将自动寻找替代账号。
3. **模型优先级**：在“执行优先级”列表中点击模型名称，可将其提升为首选（Primary）。

## 开源协议
MIT License
