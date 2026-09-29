# Changelog

All notable changes to Aurora Wallpaper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-09-29

### Added
- **定时轮换**：支持按设定间隔自动更换桌面壁纸，可选 Bing 每日图片 / 历史记录 / 收藏三种来源，支持随机或顺序播放
- **收藏功能**：历史记录可标记收藏，收藏记录永不被自动清理；支持「仅看收藏」筛选
- **托盘常驻**：关闭窗口不退出，最小化到系统托盘，保证轮换持续运行；托盘菜单支持立即轮换、显示主窗口、退出
- **生成可取消**：生成过程中可随时取消，立即释放资源
- **日志系统**：运行日志自动落盘（单文件 ≤ 5MB 轮转），设置界面可一键打开日志目录
- **模型名可配置**：设置界面可自定义 AI 模型名
- **Windows CI**：新增 `.github/workflows/build-win.yml`，支持 Windows 平台自动构建与发布
- **macOS 图标**：新增 `build/icon.icns`，macOS 打包使用自定义图标
- **NSIS 卸载选项**：卸载时可选删除用户数据

### Fixed
- **高危修复接线**：7 项安全相关修复（详见 README）
- **sandbox**：启用 `sandbox: true`，preload 仅使用 contextBridge/ipcRenderer
- **dev 图片显示**：开发模式下图片正确显示

### Changed
- 版本号升至 0.3.0
- 分发产物：Windows 为 NSIS 安装包（`Aurora.Wallpaper.Setup.0.3.0.exe`），macOS 为 DMG（`Aurora.Wallpaper-0.3.0-arm64.dmg` / `Aurora.Wallpaper-0.3.0.dmg`）

### Known Limitations
- 暂未提供代码签名 / 公证（首次打开需绕过 SmartScreen / 无法验证开发者提示）
- 暂未提供自动更新功能（electron-updater），请手动从 GitHub Release 下载新版本

## [0.2.1] - 2026-09-29

See [Release v0.2.1](https://github.com/aoersen/AI-Wallpaper-Generator/releases/tag/v0.2.1).
