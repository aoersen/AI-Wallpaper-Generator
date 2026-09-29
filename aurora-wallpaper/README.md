# Aurora Wallpaper · AI 壁纸工坊

跨平台 AI 桌面壁纸应用（Electron + React + TypeScript）。输入文字描述，选择风格，一键生成 AI 壁纸并设置为桌面壁纸；内置每日图片（Bing 每日壁纸 + AI 每日主题），发现好图即刻上桌；支持定时轮换、收藏管理与托盘常驻后台。

## 功能特性

- **AI 壁纸生成**：基于 OpenAI 兼容接口，输入描述 + 风格即可生成壁纸，支持自定义模型名
- **多风格预设**：内置多种风格模板，一键套用
- **一键设壁纸**：生成后直接设置为系统桌面壁纸（Windows / macOS）
- **生成可取消**：生成过程中可随时取消，立即释放资源
- **历史记录**：本地保存生成历史，随时回看与重新设置
- **收藏**：历史记录可标记收藏，收藏记录永不被自动清理
- **定时轮换**：按设定间隔自动更换桌面壁纸（Bing / 历史 / 收藏三种来源），支持随机/顺序播放
- **每日图片**：Bing 每日壁纸（近 8 天浏览 + 一键设壁纸）+ AI 每日主题（本地主题池按日轮换，每日 6 主题，一键生成）
- **托盘常驻**：关闭窗口不退出，保证轮换持续运行；托盘菜单支持立即轮换/显示主窗口/退出
- **日志系统**：运行日志自动落盘（单文件 ≤ 5MB 轮转），设置界面可一键打开日志目录
- **跨平台**：Windows x64（NSIS 安装包）、macOS arm64/x64（DMG）

## 下载安装

从 GitHub Release 下载对应平台的安装包：

**<https://github.com/aoersen/AI-Wallpaper-Generator/releases/tag/v0.3.0>**

- **Windows**：下载 `Aurora.Wallpaper.Setup.0.3.0.exe`（NSIS 安装包，支持自定义安装路径与桌面快捷方式，卸载时可选删除用户数据）
  - ⚠️ **未签名**：首次打开 Windows 会显示 SmartScreen 警告，请点击「更多信息」→「仍要运行」。我们正在评估代码签名证书（约 $200-400/年），暂未购买。
- **macOS**：下载对应架构的 DMG：
  - Apple Silicon（M1/M2/M3/M4）：`Aurora.Wallpaper-0.3.0-arm64.dmg`
  - Intel 芯片：`Aurora.Wallpaper-0.3.0.dmg`（无后缀的 .dmg 即 Intel x64 版）
  - ⚠️ **未公证**：首次打开 macOS 会提示「无法验证开发者」，请右键点击 DMG 中的 App → 「打开」→ 「打开」。我们正在评估 Apple 开发者账号（$99/年），暂未购买。

> 网络助手 pq-client 已随安装包分发，目标机器无需安装任何额外运行时。

> **自动更新**：v0.3.0 尚未提供自动更新功能，请手动从 GitHub Release 下载新版本。

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

打开应用默认进入 **每日图片** 页（三 Tab：每日图片 / 创作 / 历史）：

1. **每日图片**：浏览 Bing 每日壁纸（今日大图 + 近 8 天横向卡片），一键设为桌面壁纸；下方 AI 每日主题按日轮换 6 个主题，点击即可一键生成
2. **创作**：在输入框用文字描述想要的壁纸（如"极光下的雪山湖泊"），选择风格模板，可选调整尺寸等参数；点击生成，等待 AI 出图（有进度提示）；生成完成后点击"设为壁纸"，图片将自动下载到本地并设置为桌面壁纸
3. **历史**：回看全部本地生成历史，随时重新设置壁纸或删除记录

## 构建

### Windows

```bash
npm run dist:win
```

构建会自动执行 `build:pq-client`（需要 Go ≥ 1.24）编译内置网络助手并打进安装包。产物位于 `release/` 目录：`Aurora Wallpaper Setup 0.3.0.exe`（NSIS 安装包，支持自定义安装路径与桌面快捷方式，卸载时可选删除用户数据）。

### macOS

**方式一：本地构建**（需要 macOS 机器）

```bash
npm run dist:mac
```

产物位于 `release/` 目录：`Aurora Wallpaper-0.3.0-arm64.dmg` 与 `Aurora Wallpaper-0.3.0.dmg`（Intel x64 版无架构后缀）。

**方式二：GitHub Actions 自动构建**

将代码推送到 `main` / `master` 分支（或在 Actions 页面手动触发工作流），工作流会自动构建对应平台的安装包并上传 artifact；若推送 `v*` tag，还会自动发布到 GitHub Release：

- macOS 工作流：`.github/workflows/build-mac.yml`（产物：`aurora-wallpaper-macos`，包含 `release/*.dmg`）
- Windows 工作流：`.github/workflows/build-win.yml`（产物：`aurora-wallpaper-win`，包含 `release/*.exe` 与 `*.exe.blockmap`）

### 图标

```bash
npm run icons   # 生成 build/icon.png（512x512）/ build/icon.ico（256x256 PNG）/ build/icon.icns（macOS 多分辨率 ICNS）
```

> 现在脚本会纯 Node 生成所有平台的图标，包括 macOS 所需的 `build/icon.icns`，无需额外依赖。

## 架构

### 目录结构

```
aurora-wallpaper/
├── src/
│   ├── main/            # Electron 主进程（编译产物 → dist/main/）
│   │   ├── services/    # 主进程业务服务（qwenClient / wallpaperStore / dailyService 等）
│   │   └── ipc/         # IPC handler 注册（按域拆分：settings / generate / wallpaper / daily / history / env）
│   ├── preload/         # preload 安全 IPC 桥（esbuild 打包为单文件 → dist/preload/）
│   ├── renderer/        # 前端 React 应用（Vite 入口，含 index.html）
│   │   └── src/         # 渲染进程源码（main.tsx、App.tsx、components/、styles.css）
│   └── shared/          # 主进程/渲染进程共享类型与 IPC 通道常量
├── tests/               # 测试用例（vitest）
├── build/               # 应用图标（icon.png / icon.ico）
├── scripts/             # 构建辅助脚本（make-icons.mjs、build-pq-client.mjs、build-preload.mjs）
├── tools/pq-client/     # Go 编写的 HTTP 助手源码与产物（bin/<平台>-<架构>/）
├── dist/                # 主进程编译产物（tsc）+ preload 单文件 bundle（esbuild）
├── dist-renderer/       # 前端构建产物（vite build）
├── release/             # electron-builder 打包产物
├── package.json
├── electron-builder.yml # 打包配置（win nsis x64 + mac dmg arm64/x64）
├── tsconfig.json        # 类型检查配置（覆盖 src + tests）
├── tsconfig.main.json   # 主进程编译配置
├── tsconfig.preload.json# preload 类型检查配置
├── vite.config.ts       # Vite 构建配置（root: src/renderer）
└── vitest.config.ts     # Vitest 配置
```

### IPC 通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `settings:get` / `settings:save` | renderer → main | 读取/保存 API Key、Base URL、模型名等 settings |
| `generate:image` | renderer → main | 发起 AI 图片生成请求 |
| `generate:progress` | main → renderer | 生成进度事件推送 |
| `generate:cancel` | renderer → main | 取消当前进行中的生成请求 |
| `wallpaper:download` | renderer → main | 下载图片到本地 |
| `wallpaper:set` | renderer → main | 将本地图片设置为系统壁纸 |
| `wallpaper:read-data-url` | renderer → main | 读取本地图片为 base64 data URL（dev 模式预览） |
| `daily:list` | renderer → main | 获取每日图片数据（Bing 每日壁纸 + 本地每日主题） |
| `daily:set-wallpaper` | renderer → main | 下载 Bing 每日壁纸并设置壁纸（URL 白名单校验） |
| `history:list` | renderer → main | 查询生成历史列表 |
| `history:delete` | renderer → main | 删除历史记录 |
| `history:toggle-favorite` | renderer → main | 切换收藏状态 |
| `rotation:get` / `rotation:save` | renderer → main | 读取/保存定时轮换配置 |
| `rotation:rotate-now` | renderer → main | 立即轮换一张（使用当前配置） |
| `env:platform` | renderer → main | 获取当前运行平台（win32 / darwin） |
| `env:screen` | renderer → main | 获取屏幕尺寸信息 |
| `env:open-log-dir` | renderer → main | 打开日志目录（userData/logs） |

### 壁纸设置原理

- **Windows**：调用 `powershell.exe` 执行内联脚本，通过 P/Invoke 调用 `user32.dll::SystemParametersInfo`（`SPI_SETDESKWALLPAPER`）
- **macOS**：调用 `osascript` 执行 AppleScript，通过 `System Events` 设置所有桌面的壁纸

## 测试

```bash
npm test
```

运行 vitest 测试套件（vitest run），覆盖主进程逻辑、IPC 桥接、服务层与工具函数；`tests/qwenHttp.test.ts` 为 pq-client 集成测试（二进制缺失时自动跳过），`tests/dailyService.test.ts` 覆盖每日图片服务，`tests/schedulerService.test.ts` 覆盖定时轮换调度。

## 常见问题

### 提示"请先配置 API Key"

应用未配置 API Key 时，生成功能不可用。请点击右上角 **设置**，填入 API Key（形如 `c2a_xxx`）与 Base URL（默认 `https://www.likegpt.top/v1`），保存后重试。

### Windows SmartScreen / macOS 公证提示

Aurora Wallpaper 目前**未进行代码签名 / 公证**（需付费证书，暂未购买）：
- **Windows**：首次安装会显示 SmartScreen，点击「更多信息」→「仍要运行」即可
- **macOS**：首次打开 DMG 中的 App 会提示无法验证开发者，右键 →「打开」→「打开」即可
- 我们正在评估证书购买（约 $200-400/年），短期内请按上述步骤绕过

### 壁纸设置失败

1. 确认图片已成功下载到本地（查看历史记录中的本地路径）
2. Windows：确认 PowerShell 可正常执行（部分安全软件会拦截 `SystemParametersInfo` 调用）
3. macOS：确认应用有「系统设置 → 隐私与安全性 → 辅助功能」或「屏幕录制」相关权限
4. 查看错误提示中的平台标识、退出码与 stderr 输出，按提示排查

### 定时轮换不工作

1. 确认已保存轮换配置（开关已打开、间隔 ≥ 15 分钟）
2. 应用关闭窗口后会最小化到系统托盘，轮换在后台持续运行
3. 在托盘图标右键菜单可手动「立即换一张」验证轮换逻辑

### 生成图片的 URL 有时效性

AI 服务返回的图片 URL 通常有时效性。应用会在生成后自动将图片下载到本地并转存到历史记录中，建议及时使用「设为壁纸」功能，避免依赖过期 URL。
