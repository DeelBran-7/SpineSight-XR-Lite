# 团队上手指南

SpineSight XR Lite 是姿态观察教学原型：React 前端负责拍摄引导，Python 后端通过 MediaPipe 提取关键点并计算二维几何指标，DeepSeek 按需生成解释。它不能诊断脊柱侧弯或提供治疗建议。

## 1. 获取项目

仓库公开，任何人都可以克隆并在本地运行：

```sh
git clone https://github.com/DeelBran-7/SpineSight-XR-Lite.git
cd SpineSight-XR-Lite
```

也可以使用 GitHub Desktop。下载 ZIP 也能运行，但提交修改请使用 Git 克隆。没有仓库写入权限时，可以先 Fork 到自己的 GitHub 账号，再克隆自己的 Fork 并提交 Pull Request；直接向原仓库推送分支需要协作者写入权限。

仓库共享的是源码；GitHub 页面本身不会运行前后端。每位队友都需要在自己的电脑完成下面的安装，或使用演示者提供的临时手机访问链接。

## 2. 安装并启动

准备 Git、**Python 3.11**、**Node.js 22.12+** 和 npm。安装需要联网下载依赖及模型。以下命令均在项目根目录执行。

macOS / Linux：

```sh
python3.11 scripts/setup.py
python3.11 scripts/dev.py
```

Windows PowerShell：

```powershell
py -3.11 scripts/setup.py
py -3.11 scripts/dev.py
```

安装脚本会创建 `backend/.venv`、安装锁定依赖、准备前端 WASM 和模型文件，并从根目录 `.env.example` 创建缺失的 `backend/.env`，已有配置不会被覆盖。前端通过同源代理访问 API，无需 `.env`。虚拟环境、`node_modules` 和模型等生成文件不随 Git 分发，首次克隆必须安装。

打开 <http://localhost:5173>，保持终端运行；按 Ctrl+C 同时停止前后端。端口 5173、8000 被占用时，先关闭已有开发服务。macOS 完成安装后也可以双击根目录的 `Start SpineSight.command`。

## 3. 可选 AI 配置

**不配置 API key 也能拍照、上传图片和进行几何分析。** 需要 AI 报告或聊天时，每位队友自行在本地 `backend/.env` 设置 `DEEPSEEK_API_KEY`，然后重启服务。完整配置项见根目录 [`.env.example`](../.env.example)。

`backend/.env` 已被 Git 忽略；不要将真实 key 写入前端代码、示例文件、提交、Issue 或截图。AI 请求只在用户主动触发时发出，可能产生提供商费用；照片不会发送给 DeepSeek。

## 4. 手机体验

手机摄像头需要可信 HTTPS，直接打开电脑的局域网 HTTP 地址不适用。按照 [README 的手机步骤](../README.md#phone-camera-over-https) 构建前端、安装 cloudflared 并启动 `scripts/phone.py`。演示者提供临时 HTTPS 地址及终端打印的登录信息，结束演示后按 Ctrl+C 关闭隧道。前端改动后需重新构建，隧道重启后地址会变化。

## 5. 一起修改

- 页面、摄像头及姿态引导：`frontend/src/`。
- API、关键点检测、几何计算和 AI 调用：`backend/app/`。
- 安装、启动、手机演示脚本：`scripts/`。
- 产品边界、接口和验证记录：`docs/`。

每人使用自己的分支，完成后发 Pull Request 请求合并到原仓库 `main`。有写入权限的队友可以直接推送分支，其他人从自己的 Fork 提交。具体命令与检查清单见 [CONTRIBUTING.md](../CONTRIBUTING.md)。拉取包含依赖变更的更新后，重新运行安装脚本即可；它会保留本地 `.env`。

常见故障及全部验证命令见 [README](../README.md#troubleshooting)。真实手机体验仍需人工验收；已有验证范围见 [VERIFICATION.md](VERIFICATION.md)。
