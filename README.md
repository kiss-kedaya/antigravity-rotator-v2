# Antigravity Rotator V2

[English] | [简体中文](#简体中文)

A professional-grade account rotation and quota monitoring tool for OpenClaw Gateway. Built with Go (Wails) and React.

## Features

- **Concurrent Quota Fetching**: High-performance model quota detection using Go routines.
- **Zero-Downtime Rotation**: Hot-swapping accounts and models via OpenClaw RPC (`config.patch`).
- **Real-time Monitoring**: Live dashboard showing account health and model availability.
- **Auto-Rotation Engine**: Automated switching based on custom quota thresholds.
- **Multi-Agent Sync**: Automatically synchronizes credentials across all detected OpenClaw workspaces.

---

## 简体中文

Antigravity Rotator V2 是一款专为 OpenClaw Gateway 设计的专业级账号轮换与配额监控工具。

### 核心功能

- **并发配额拉取**：利用 Go 协程实现极速模型配额探测，响应时间大幅缩减。
- **零停机轮换**：通过 OpenClaw RPC (`config.patch`) 实现账号与模型的秒级热切换，无需重启服务。
- **实时看板**：基于 Wails Events 的实时数据推送，直观展现集群状态。
- **自动化引擎**：支持自定义阈值触发自动轮换，确保高优模型始终在线。
- **全自动同步**：一键将凭据同步至所有 OpenClaw 工作区，简化多智能体部署。

## 安装与运行

### 环境要求
- Go 1.21+
- Node.js 18+
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)
- [OpenClaw Gateway](https://github.com/openclaw/openclaw)

### 编译步骤
```bash
# 克隆仓库
git clone https://github.com/yourusername/antigravity-rotator-v2.git
cd antigravity-rotator-v2

# 编译二进制文件
wails build -clean
```

### 调试指南
```bash
# 启动前端开发环境 (Vite)
cd frontend && npm install && npm run dev

# 启动 Wails 开发模式
wails dev
```

## 注意事项

1. **凭据隐私**：请勿将包含敏感信息的 `antigravity-rotator-v2.json` 或 `auth-profiles.json` 提交至代码库。
2. **代理配置**：国内用户请在 `.env` 或应用设置中正确配置 `http://127.0.0.1:7890` 等代理地址以访问 Google API。
3. **RPC 权限**：确保 OpenClaw Gateway 已启动且 RPC 接口可访问。

## 开源协议
MIT License
