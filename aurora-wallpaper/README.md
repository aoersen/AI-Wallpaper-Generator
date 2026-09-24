# Aurora Wallpaper · AI 壁纸工坊

跨平台 AI 桌面壁纸应用（Electron + React + TypeScript）。输入文字描述，选择风格，一键生成 AI 壁纸并设置为桌面壁纸。

## 功能特性

- **AI 壁纸生成**：基于 OpenAI 兼容接口，输入描述 + 风格即可生成壁纸
- **多风格预设**：内置多种风格模板，一键套用
- **一键设壁纸**：生成后直接设置为系统桌面壁纸（Windows / macOS）
- **历史记录**：本地保存生成历史，随时回看与重新设置
- **跨平台**：Windows x64（NSIS 安装包）、macOS arm64/x64（DMG）

## 快速开始

### 环境要求

- Node.js ≥ 18（推荐 20）
- Go ≥ 1.24（仅构建时需要，用于编译内置 pq-client 网络助手）
- 一个 OpenAI 兼容 API 的 Key（形如 `c2a_xxx`）

> **pq-client 说明**：业务服务器只接受携带 X25519MLKEM768 后量子密钥交换 keyshare 的
> TLS 1.3 ClientHello（不带会直接 RST）。Electron 主进程的 TLS 栈不支持该算法，
> 因此应用将 HTTP 请求委托给独立编译的 Go 助手 `pq-client`（Go 1.24+ 的 crypto/tls
> 默认发送 X25519MLKEM768），随安装包分发，**目标机器无需安装任何运行时**。

### 安装与运行

```bash
npm install
npm run dev
```

### 配置 API Key

1. 启动应用后，点击右上角 **设置** 按钮
2. 填入 **API Key**（形如 `c2a_xxx`）
3. **Base URL** 默认 `https://www.likegpt.top/v1`，如使用其他服务请修改
4. 点击 **保存**

### 主界面流程

1. **输入描述**：在输入框中用文字描述想要的壁纸（如"极光下的雪山湖泊"）
2. **选择风格**：从风格列表中选择一个风格模板
3. **完善参数**（可选）：调整尺寸等参数
4. **生成**：点击生成按钮，等待 AI 出图（有进度提示）
5. **设壁纸**：生成完成后点击"设为壁纸"，图片将自动下载到本地并设置为桌面壁纸

## 构建

### Windows

```bash
npm run dist:win
```

构建会自动执行 `build:pq-client`（需要 Go ≥ 1.24）编译内置网络助手并打进安装包。产物位于 `release/` 目录：`Aurora Wallpaper Setup 0.1.0.exe`（NSIS 安装包，支持自定义安装路径与桌面快捷方式）。

### macOS

**方式一：本地构建**（需要 macOS 机器）

```bash
npm run dist:mac
```

产物位于 `release/` 目录：`Aurora Wallpaper-0.1.0-arm64.dmg` 与 `Aurora Wallpaper-0.1.0-x64.dmg`。

**方式二：GitHub Actions 自动构建**

将代码推送到 `main` / `master` 分支（或在 Actions 页面手动触发 `build-macos` 工作流），工作流会自动构建 DMG 并作为 artifact 上传：

- 工作流文件：`.github/workflows/build-mac.yml`
- 产物名称：`aurora-wallpaper-macos`（包含 `release/*.dmg`）

### 图标

```bash
npm run icons   # 生成 build/icon.png（512x512）与 build/icon.ico（内嵌 256x256 PNG）
```

> **macOS 图标**：electron-builder 在 macOS 上需要 `build/icon.icns`。本机脚本无法生成 icns，如需自定义 macOS 图标，请将 icns 文件放到 `build/icon.icns`（可用 `iconutil` 从 iconset 转换）；不配置时 electron-builder 会使用默认图标。

## 架构

### 目录结构

```
aurora-wallpaper/
├── src/
│   ├── main/            # Electron 主进程（编译产物 → dist/main/）
│   ├── preload/         # preload 安全 IPC 桥（编译产物 → dist/preload/）
│   ├── renderer/        # 前端 React 应用（Vite 入口，含 index.html）
│   │   └── src/         # 渲染进程源码（main.tsx、App.tsx、styles.css）
│   └── shared/          # 主进程/渲染进程共享类型与 IPC 通道常量
├── tests/               # 测试用例（vitest）
├── build/               # 应用图标（icon.png / icon.ico）
├── scripts/             # 构建辅助脚本（make-icons.mjs、build-pq-client.mjs）
├── tools/pq-client/     # Go 编写的 HTTP 助手源码与产物（bin/<平台>-<架构>/）
├── dist/                # 主进程 + preload 编译产物（tsc）
├── dist-renderer/       # 前端构建产物（vite build）
├── release/             # electron-builder 打包产物
├── package.json
├── electron-builder.yml # 打包配置（win nsis x64 + mac dmg arm64/x64）
├── tsconfig.json        # 类型检查配置（覆盖 src + tests）
├── tsconfig.main.json   # 主进程编译配置
├── tsconfig.preload.json# preload 编译配置
├── vite.config.ts       # Vite 构建配置（root: src/renderer）
└── vitest.config.ts     # Vitest 配置
```

### IPC 通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `settings:get` | renderer → main | 读取已保存的 API Key / Base URL 等设置 |
| `settings:save` | renderer → main | 保存设置（持久化到本地） |
| `generate:image` | renderer → main | 发起 AI 图片生成请求 |
| `generate:progress` | main → renderer | 生成进度事件推送 |
| `wallpaper:download` | renderer → main | 下载图片到本地 |
| `wallpaper:set` | renderer → main | 将本地图片设置为系统壁纸 |
| `history:list` | renderer → main | 查询生成历史列表 |
| `history:delete` | renderer → main | 删除历史记录 |
| `env:platform` | renderer → main | 获取当前运行平台（win32 / darwin） |
| `env:screen` | renderer → main | 获取屏幕尺寸信息 |

### 壁纸设置原理

- **Windows**：调用 `powershell.exe` 执行内联脚本，通过 P/Invoke 调用 `user32.dll::SystemParametersInfo`（`SPI_SETDESKWALLPAPER`）
- **macOS**：调用 `osascript` 执行 AppleScript，通过 `System Events` 设置所有桌面的壁纸

## 测试

```bash
npm test
```

运行 vitest 测试套件（54 用例），覆盖主进程逻辑、IPC 桥接与工具函数；`tests/qwenHttp.test.ts` 为 pq-client 集成测试（二进制缺失时自动跳过）。

## 常见问题

### 提示"请先配置 API Key"

应用未配置 API Key 时，生成功能不可用。请点击右上角 **设置**，填入 API Key（形如 `c2a_xxx`）与 Base URL（默认 `https://www.likegpt.top/v1`），保存后重试。

### 壁纸设置失败

1. 确认图片已成功下载到本地（查看历史记录中的本地路径）
2. Windows：确认 PowerShell 可正常执行（部分安全软件会拦截 `SystemParametersInfo` 调用）
3. macOS：确认应用有"系统设置 → 隐私与安全性 → 辅助功能"或"屏幕录制"相关权限
4. 查看错误提示中的平台标识、退出码与 stderr 输出，按提示排查

### 生成图片的 URL 有时效性

AI 服务返回的图片 URL 通常有时效性。应用会在生成后自动将图片下载到本地并转存到历史记录中，建议及时使用"设为壁纸"功能，避免依赖过期 URL。
