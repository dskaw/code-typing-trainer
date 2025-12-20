# CodeTyping Trainer

<p align="center">
  <a href="./README.md"><strong>English</strong></a> |
  <a href="./README.zh-CN.md"><strong>简体中文</strong></a>
</p>

[![Release](https://img.shields.io/github/v/release/dskaw/code-typing-trainer?sort=semver)](https://github.com/dskaw/code-typing-trainer/releases)
[![License](https://img.shields.io/github/license/dskaw/code-typing-trainer)](LICENSE)
[![Build](https://github.com/dskaw/code-typing-trainer/actions/workflows/release.yml/badge.svg)](https://github.com/dskaw/code-typing-trainer/actions/workflows/release.yml)

Offline code typing trainer (typing.io-like) for touch-typing practice on local files — Electron + Vite + React + TypeScript + Monaco (Mantine UI).

Download: https://github.com/dskaw/code-typing-trainer/releases

Open any local file → split into segments → type with strict rules (slack/lock/backspace) → save attempts locally → view analytics.

- Architecture details: `docs/ARCHITECTURE.md`
- 中文文档 / Chinese docs:
  - `README.zh-CN.md`
  - `docs/ARCHITECTURE.zh-CN.md`
  - `CONTRIBUTING.zh-CN.md`

---

## Features

- Open local files via menu: `File → Open…` (`Ctrl+O`)
- Robust file decoding on Windows: UTF‑8 / UTF‑8 BOM / GBK / GB18030 (encoding shown in Typing header)
- Segmentation in a Web Worker (default: 200 lines/segment; `maxSegmentChars` cap to keep Monaco responsive)
- Typing engine (pure logic) with:
  - slackN (type a few chars after first mistake),
  - input lock after slack is exceeded (Backspace to fix),
  - Backspace counts toward stats,
  - Auto-skip blank lines (optional)
- “Skip comments” mode (comments are **shown but not part of typing target**) + comments dimming
- Skip leading indentation (optional), trim trailing whitespace (optional), pre-comment alignment spaces auto-skipped
- Monaco viewer only (read-only): constant-time range decorations (fast typing) and no validation/markers
- Theme toggle (dark/light), editor font size (no progress reset), text alignment (left/center/right)
- Summary per segment + local persistence (JSON in Electron `userData`) + Analytics page (list + WPM/Unproductive% trends)

---

## Screenshots

> TODO: add screenshots / GIFs.

---

## Quickstart (Dev)

Prerequisites:
- Node.js 22+
- npm 10+

```bash
npm install
npm run dev
```

Notes:
- `npm run dev` runs Vite and launches Electron via `vite-plugin-electron` (see `vite.config.ts`).
- The app is fully offline (no telemetry, no network calls).

---

## Test

```bash
npm run test
```

---

## Build / Package (electron-builder)

```bash
npm run build
```

Artifacts are emitted under:
- `release/CodeTyping-Trainer-<version>/`
  - Windows: installer `.exe` + `CodeTyping-Trainer-<version>-win-unpacked/`

---

## Release (GitHub)

This repo includes a GitHub Actions workflow: `.github/workflows/release.yml`.

- Push a semver tag `vX.Y.Z` (must match `package.json` version) to trigger a Windows build.
- The workflow uploads the installer (`.exe`) to GitHub Release assets.

---

## Usage

1) Open a file via `File → Open…` (`Ctrl+O`) or the Home button.
2) Typing happens in the Typing page (paste is blocked).
3) Finish a segment → Summary is shown and the attempt is saved.
4) Analytics page shows attempt history + trend charts.

### Keyboard shortcuts
- `Ctrl+O`: Open file
- `Ctrl+R`: Restart current segment
- `Ctrl+Left` / `Ctrl+Right`: Previous / next segment
- Theme toggle button: Dark/Light (stored in localStorage)
- `Ctrl+Shift+D`: Toggle debug perf overlay (optional, off by default)

---

## Settings (Typing)

All settings are stored in `localStorage` under `typing-trainer-typing-settings` (see `src/App.tsx`).

- **Lines per segment**: split by line count (default 200)
- **Slack N**: allowed extra chars after first mismatch before locking input (default 3)
- **Tab width**: `Tab` key maps to spaces in normalized text (default 4)
- **Max segment chars**: hard cap for Monaco responsiveness (default 20000)
- **Editor font size**: updates Monaco options without resetting progress
- **Text alignment**: left / center / right (visual alignment only)
- **Auto-skip blank lines**: pressing Enter on blank lines auto-skips consecutive `\\n`
- **Skip leading indentation**: don’t type leading spaces at line start
- **Trim trailing whitespace**: don’t type trailing spaces/tabs at line end
- **Comments**
  - *Type comments*: comments are part of typing target
  - *Skip comments (show but don’t type)*: comments are visible but auto-skipped by the engine (dimmed)
  - Default is chosen per file type (`.c/.cpp/.java/.ts/.py/...` default to Skip comments; `.txt/.md/.log/...` default to Type comments)
- **Show debug overlay**: perf counters for diagnosing input lag (optional)

---

## Metrics

- `WPM = (correctChars / 5) / minutes`
- `Unproductive% = (incorrect + collateral + backspaces) / typedKeystrokes * 100`

Notes:
- `correctChars` counts only **user-typed correct characters** (auto-skipped blank lines / comments / indentation do not inflate WPM).

---

## Privacy

- Fully offline: no network requests, no telemetry.
- Attempts are stored locally as JSON in Electron `app.getPath('userData')`.
- You are responsible for the copyright/licensing of any files you open in the app.

---

## Contributing

PRs and issues are welcome.

- Please read `docs/ARCHITECTURE.md` first (explains the typing engine, skip rules, Monaco integration, and performance constraints).
- Use GitHub Issues (bug/feature templates are provided under `.github/ISSUE_TEMPLATE/`).

---

## Roadmap (ideas)

- SQLite storage backend (optional) for large histories
- More precise language detection for Monaco language mode
- More analytics (per-language/ per-project breakdown)
- More typing modes (time trial, custom segment selection)

---

## License

MIT — chosen because it is permissive and widely used for small desktop utilities, making it easy to fork and contribute.
