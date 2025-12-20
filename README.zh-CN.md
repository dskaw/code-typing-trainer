# CodeTyping Trainer

<p align="center">
  <a href="./README.md"><strong>English</strong></a> |
  <a href="./README.zh-CN.md"><strong>简体中文</strong></a>
</p>

[![Release](https://img.shields.io/github/v/release/dskaw/code-typing-trainer?sort=semver)](https://github.com/dskaw/code-typing-trainer/releases)
[![License](https://img.shields.io/github/license/dskaw/code-typing-trainer)](LICENSE)
[![Build](https://github.com/dskaw/code-typing-trainer/actions/workflows/release.yml/badge.svg)](https://github.com/dskaw/code-typing-trainer/actions/workflows/release.yml)

一个完全离线的“typing.io-like”代码打字训练桌面应用：从本地打开文件练习（无遥测、无网络请求）—— Electron + Vite + React + TypeScript + Monaco（Mantine UI）。

下载（Windows 安装包）：https://github.com/dskaw/code-typing-trainer/releases

打开本地文件 → 分段 → 按严格规则逐字符练习（slack/lock/backspace）→ 本地保存 attempts → Analytics 查看趋势。

- 架构说明（中文）：`docs/ARCHITECTURE.zh-CN.md`
- 架构说明（英文）：`docs/ARCHITECTURE.md`
- 贡献指南（中文）：`CONTRIBUTING.zh-CN.md`

---

## 功能特性

- 菜单打开本地文件：`File → Open…`（`Ctrl+O`）
- Windows 下更稳的文件解码：UTF‑8 / UTF‑8 BOM / GBK / GB18030（Typing 页会显示检测到的编码）
- 分段在 Web Worker 中完成（默认 200 行/段；`maxSegmentChars` 限制确保 Monaco 不会卡）
- 纯逻辑打字引擎：
  - slackN（首次错误后允许继续输入少量字符）
  - 超过 slack 后锁定输入（仅 Backspace 可解除并修正）
  - Backspace 计入统计
  - 自动跳过空行（可选）
- 跳过注释模式：注释仍显示，但不参与打字目标（并在 Skip 模式下灰显/淡化）
- 跳过行首缩进（可选）、忽略行尾空白（可选）、注释前对齐空格自动跳过
- Monaco 仅作为只读 viewer（不启用 validation/markers），动态装饰为常数级 range decorations（输入更顺滑）
- 深/浅色主题切换、编辑器字体大小（不丢进度）、文本对齐（左/中/右）
- 每段 Summary + attempts 本地持久化（Electron `userData` 下 JSON）+ Analytics（列表 + WPM/Unproductive% 趋势图）

---

## 截图

> TODO：后续可补充截图 / GIF（建议：Home、Typing、Summary、Analytics、Settings、Skip comments 效果）。

---

## 开发运行（Dev）

环境要求：
- Node.js 22+
- npm 10+

```bash
npm install
npm run dev
```

说明：
- `npm run dev` 使用 `vite-plugin-electron` 同时启动 renderer（Vite）与 Electron（见 `vite.config.ts`）。
- 应用完全离线（无遥测、无网络请求）。

---

## 测试

```bash
npm run test
```

---

## 构建 / 打包（electron-builder）

```bash
npm run build
```

产物输出目录：
- `release/CodeTyping-Trainer-<version>/`
  - Windows：安装包 `.exe` + `CodeTyping-Trainer-<version>-win-unpacked/`

---

## 发布（GitHub Release）

仓库包含 GitHub Actions workflow：`.github/workflows/release.yml`。

- 推送 semver tag `vX.Y.Z`（必须与 `package.json` 里的 version 完全一致）即可触发 Windows 构建。
- workflow 会把安装包（`.exe`）上传到对应的 GitHub Release assets。

---

## 使用方式

1) 通过菜单 `File → Open…`（`Ctrl+O`）或 Home 页按钮打开文件。
2) 在 Typing 页练习（已禁用粘贴）。
3) 完成一段后进入 Summary，并保存一次 attempt。
4) Analytics 页可查看历史 attempts 与趋势图。

### 快捷键
- `Ctrl+O`：打开文件
- `Ctrl+R`：重置当前段（Restart）
- `Ctrl+Left` / `Ctrl+Right`：上一段 / 下一段
- 主题切换按钮：Dark/Light（存储在 localStorage）
- `Ctrl+Shift+D`：切换 Debug 性能叠层（可选，默认关闭）

---

## 设置（Typing）

所有设置会保存在 `localStorage`（key：`typing-trainer-typing-settings`，见 `src/App.tsx`）。

- **Lines per segment**：按行数分段（默认 200）
- **Slack N**：首次错误后允许继续输入的字符数（默认 3）
- **Tab width**：Tab 映射为空格（默认 4）
- **Max segment chars**：每段字符上限（默认 20000，用于性能保护）
- **Editor font size**：只更新 Monaco options，不会重置进度
- **Text alignment**：左/中/右（仅视觉对齐）
- **Auto-skip blank lines**：当期望为换行且遇到连续空行时，一次 Enter 自动跨过
- **Skip leading indentation**：行首缩进空格不需要打
- **Trim trailing whitespace**：行尾空格/Tab 不需要打
- **Comments**
  - *Type comments*：注释也要打
  - *Skip comments (show but don’t type)*：注释仍显示，但引擎会自动跳过（并灰显）
  - 默认值按文件类型智能选择（`.c/.cpp/.java/.ts/.py/...` 默认 Skip；`.txt/.md/.log/...` 默认 Type）
- **Show debug overlay**：用于排查输入卡顿的性能计数器（可选）

---

## 指标口径

- `WPM = (correctChars / 5) / minutes`
- `Unproductive% = (incorrect + collateral + backspaces) / typedKeystrokes * 100`

说明：
- `correctChars` 只统计“用户真实输入且正确的字符”；自动跳过的空行/注释/缩进不会白嫖 WPM。

---

## 隐私

- 完全离线：不发任何网络请求、无遥测。
- attempts 仅存本地：Electron `app.getPath('userData')` 下 JSON 文件。
- 你需要自行确保练习文件的版权/许可合规（尤其是公开分享练习样本时）。

