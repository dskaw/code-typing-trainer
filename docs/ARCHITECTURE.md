# CodeTyping Trainer — Architecture

CodeTyping Trainer is a local/offline desktop typing practice app for arbitrary text and source code files.

Core flow:
1. Open any local file (`.txt/.md/.c/.cpp/.java/.py/...`) from the app menu (`File → Open…`) or the Home page.
2. Decode + normalize the content (newline + tab expansion), then segment it (default: 200 lines per segment) in a Web Worker.
3. Practice one segment at a time with a strict typing state machine (error slack + lock + backspace-to-fix).
4. Persist each completed attempt locally (JSON file under Electron `userData`) and visualize trends (WPM / Unproductive%).

This document explains how the project is structured, how the processes cooperate, and how the typing engine & Monaco rendering stay fast.

---

## 1) Tech stack & process model

### Renderer process (UI)
- **Vite + React + TypeScript**: UI, routing (simple in-app state router), charts, settings, and typing interaction.
- **Mantine**: UI components + theming.
- **Monaco Editor**: used strictly as a *viewer/layout/decoration* layer (read-only). Validation/markers/diagnostics are disabled.

Entry points:
- `src/main.tsx`: mounts `MantineProvider`, `Notifications`, error handling, and the app.
- `src/App.tsx`: in-renderer “router” + settings persistence + segmentation orchestration.

### Main process (Electron)
Responsibilities:
- Create window, secure webPreferences (`contextIsolation: true`, `nodeIntegration: false`).
- OS menu integration (`File → Open…`).
- Local file reading and **encoding detection** (UTF‑8/BOM + GBK/GB18030 on Windows).
- Attempts persistence (writes JSON under `app.getPath('userData')`).

Key file:
- `electron/main.ts`

### Preload (IPC bridge)
Responsibilities:
- Expose a small, safe API surface to the renderer via `contextBridge`.
- Renderer never touches `fs` directly.

Key file:
- `electron/preload.ts`

---

## 2) Repository layout (important folders)

### `electron/`
- `electron/main.ts`: window/menu, file open dialog, file decoding, IPC handlers, attempt repo wiring.
- `electron/preload.ts`: `window.api.*` bridge.
- `electron/electron-env.d.ts`: TypeScript typings for preload-exposed APIs and build-time env.

### `src/pages/`
- `src/pages/Home.tsx`: “Open File” entry and navigation.
- `src/pages/Loading.tsx`: shows while segmentation runs in a worker (prevents UI freeze on large files).
- `src/pages/Typing.tsx`: the core typing experience:
  - hidden `<textarea>` for input (IME-friendly),
  - typing engine state machine (in refs),
  - Monaco viewer + decorations (constant per-frame),
  - settings drawer & keyboard shortcuts.
- `src/pages/Summary.tsx`: saves the attempt via IPC and shows per-segment results.
- `src/pages/Analytics.tsx`: loads attempts via IPC and renders list + trend charts.

### `src/core/` (pure logic)
- `src/core/segmenter.ts`: `normalizeText()` + line-based segmentation with `maxSegmentChars` hard cap.
- `src/core/commentRanges.ts`: parses comment ranges (C-like `//` & `/* */`, Python `#` + triple quotes).
- `src/core/skipRanges.ts`: computes “skippable” ranges (indentation/trailing whitespace/pre-comment padding/empty lines).
- `src/core/typingEngine.ts`: strict typing state machine (slack/lock/backspace), skip-ranges, `typedEnd` accounting.
- `src/core/metrics.ts`: WPM and Unproductive% helpers.

### `src/workers/`
- `src/workers/segmenter.worker.ts`: runs normalization + global comment parsing + segmentation off the UI thread, and slices comment ranges into segment-local ranges.

### `src/storage/`
- `src/storage/attemptRepo.ts`: repository interface (`add/list`).
- `src/storage/jsonAttemptRepo.ts`: default JSON persistence (atomic-ish write) used by the main process.

### `build/`
- `build/afterAllArtifactBuild.cjs`: post-build hook to rename `win-unpacked` to a stable `CodeTyping-Trainer-<version>-win-unpacked` folder name.

---

## 3) Security model (offline, no fs in renderer)

Renderer uses only `window.api` defined in preload:
- `window.api.openFile(): Promise<OpenFileResult | null>`
- `window.api.onFileOpened(cb): () => void` (menu-driven open file event)
- `window.api.saveAttempt(attempt): Promise<void>`
- `window.api.listAttempts(): Promise<Attempt[]>`

The renderer is sandboxed by Electron settings in `electron/main.ts`:
- `contextIsolation: true`
- `nodeIntegration: false`

---

## 4) Core data flow (end-to-end)

### 4.1 Open file → segmentation → Typing session

Mermaid overview:

```mermaid
flowchart LR
  Menu[Electron Menu: File→Open] --> MainOpen[electron/main.ts: openFileFromDialog]
  Home[Home.tsx: Open File button] --> PreloadOpen[window.api.openFile]
  PreloadOpen --> MainOpen
  MainOpen -->|"OpenFileResult (filePath, fileName, content, encoding)"| Renderer[Renderer: App.tsx]
  Renderer --> Worker[segmenter.worker.ts]
  Worker -->|segments[] (with commentRanges)| Renderer
  Renderer --> Typing[Typing.tsx]
```

Concrete steps:
1. **Main process** reads the file as a `Buffer` (`fs.readFile`) and decodes it in `electron/main.ts`:
   - UTF‑8 BOM handled explicitly
   - encoding detection via `chardet.detect`
   - if detected as GBK/GB2312/CP936, decode with `iconv-lite` as `gb18030`
   - returns `{ filePath, fileName, content, encoding }`
2. **Renderer** receives the payload:
   - from the Home button (`src/pages/Home.tsx`), or
   - from the menu event (`app:file-opened` broadcast to renderer, subscribed in `src/App.tsx`).
3. **Segmentation runs in a worker** (`src/workers/segmenter.worker.ts`):
   - `normalizeText(content, tabWidth)`
   - if comments are skipped, parse global comment ranges once (`parseCommentRangesForFile`)
   - split into segments with offsets (`splitByLinesWithOffsets`)
   - slice the global comment ranges into per-segment `commentRanges` (relative offsets)
4. **App enters Typing** with `{ file, segments, settings, segmentIndex }`.

### 4.2 Settings persistence

Typing settings are persisted in `localStorage`:
- key: `typing-trainer-typing-settings` (see `src/App.tsx`)
- normalized via `normalizeTypingSettings()` in `src/shared/typingSettings.ts`

Theme is persisted by Mantine:
- key: `typing-trainer-color-scheme` (see `src/main.tsx`)

Some settings require *re-segmentation* (worker needs to rebuild segments):
- `linesPerSegment`, `tabWidth`, `maxSegmentChars`, `includeComments`

Other settings are runtime-only (no resegment, no session reset):
- `editorFontSize`, `textAlign`, `autoSkipBlankLines`, `skipLeadingIndentation`, `trimTrailingWhitespace`, `showDebugOverlay`

---

## 5) Typing engine (state machine + accounting)

The “truth” of typing is in `src/core/typingEngine.ts`. The renderer treats it as a pure state machine and keeps it in a `useRef` to avoid heavy React rerenders.

### 5.1 State fields

Key state:
- `cursor`: logical current position in `text` (may jump forward over skippable ranges)
- `typedEnd`: user-typed progress end; **does not include auto-skips**
- `errorActive`, `firstErrorIndex`, `locked`
- `marks[]`: `UNTOUCHED | CORRECT | INCORRECT | COLLATERAL` for visualization

Counters (attempt fields):
- `typedKeystrokes`: counts every key the user presses (including Backspace; and key presses while locked)
- `incorrect`: increments when entering error state for the first mismatch
- `collateral`: extra characters typed while errorActive within slack
- `backspaces`
- `correctChars`: counts only **user-typed correct chars** (not auto-skipped chars)

### 5.2 Skip ranges & “don’t type” semantics

The engine supports `skipRanges: TextRange[]`:
- In Skip Comments mode, comment text is *visible* but not typeable.
- Pre-comment alignment spaces, leading indentation, and trailing whitespace can also be skippable depending on settings.

The engine uses `skipForwardIfNeeded()` to ensure `cursor` never lands inside a skip range.
Crucially: skipping does not affect `typedKeystrokes` or `correctChars`.

### 5.3 Auto-skip blank lines (Enter behavior)

When `autoSkipBlankLines` is enabled and the user presses Enter on a newline:
- the engine consumes the first `\n` as a normal correct keypress (counts as 1 keystroke, 1 correct char),
- then it auto-advances over consecutive `\n` without counting keystrokes/correct chars.

Implementation detail:
- auto-skipped positions are marked `CORRECT` for a consistent “completed prefix” view,
- but `correctChars` is guarded by a per-index `countedCorrect[]` flag so auto-skipped newlines don’t inflate WPM.

### 5.4 Error slack, lock, and unlock

Rules implemented by `handleKey()` / `handleBackspace()`:
- First mismatch triggers `errorActive=true`, sets `firstErrorIndex`, increments `incorrect`.
- While `errorActive`, typing within slack marks `COLLATERAL` and increments `collateral`.
- Exceeding slack sets `locked=true`; subsequent typing is ignored (but still increments `typedKeystrokes`).
- **Backspace always unlocks**, and once you backspace to/before `firstErrorIndex`, `errorActive` clears.

---

## 6) Monaco integration (viewer + constant-time decorations)

Monaco is used as a read-only viewer. All typing behavior happens outside Monaco.

### 6.1 Why Monaco is read-only
- Prevents accidental editing and keeps the typing engine as the single source of truth.
- Avoids relying on Monaco “validation/markers” that would be misleading for segmented/incomplete code.

### 6.2 Input & IME support

Typing uses a hidden `<textarea>` (see `src/pages/Typing.tsx`) so IME works:
- `onKeyDown`: handles control keys only (Backspace/Enter/Tab/shortcuts).
- `onInput` and `onCompositionEnd`: process committed text (e.g. Chinese characters) and feed it into the engine.

### 6.3 Decorations strategy (performance-critical)

There are two decoration paths:

1) **Dynamic decorations** (updated per frame, constant count)
- updated via `requestAnimationFrame` batching (`scheduleCommit()` → `applyDecorations()`)
- typically <= 4 decorations:
  - correct prefix range (0 → `typedEnd` or `firstErrorIndex`)
  - incorrect single-char range
  - collateral range
  - cursor indicator (range or after-content cursor)

2) **Static decorations** (recomputed on segment load / settings change)
- comment dimming (`tt-skip-comment`) and skippable whitespace dimming (`tt-skip-space`)
- computed once in `applyStaticDecorations()` and set via a separate decorations collection
- never updated per keystroke

This is how the Typing page stays responsive under fast typing.

### 6.4 “Enter keycap hint” (expected `\n`)

When the next expected character is `\n`, Typing shows a small green keycap (“↵”) near the caret:
- implemented as a Monaco **content widget** (IContentWidget) created in `Typing.tsx` `onMount()`
- positioned by the current cursor position and re-laid out only when the target position actually changes
- scrollTop/scrollLeft are preserved around `layoutContentWidget()` to avoid jitter

### 6.5 Disabling Monaco “red braces” & other editor noise

Typing must not show Monaco validation/diagnostic visuals for incomplete segments:
- Editor options disable validation/markers (`renderValidationDecorations: 'off'`, `matchBrackets: 'never'`, etc.)
- TS/JS diagnostics are disabled via `monaco.languages.typescript.*Defaults.setDiagnosticsOptions(...)`
- markers are cleared on model changes via `monaco.editor.setModelMarkers(model, ...)`

There was a special case where `{` could still appear red due to Monaco’s **unexpected bracket highlighting color**:
- fixed by defining custom themes (`tt-vs`, `tt-vs-dark`) overriding `editorBracketHighlight.unexpectedBracket.foreground` to a neutral color.
- theme is registered in `beforeMount` and applied via the Editor `theme` prop.

### 6.6 Text alignment & font size (no session reset)

Text alignment:
- implemented outside Monaco internals: wrapper uses flex `justify-content` (see `src/pages/Typing.css`).
- avoids fragile hacks like mutating `.view-lines` padding that can trigger ResizeObserver loops.

Font size:
- `editor.updateOptions({ fontSize, lineHeight })` + a debounced `editor.layout()`
- the editor component is not keyed by font size, so it doesn’t remount and progress stays intact.

---

## 7) Attempts persistence & analytics

Persistence:
- default is JSON (no native deps): `attempts.json` under Electron `userData`
- stored/written by main process (`createJsonAttemptRepo()` in `src/storage/jsonAttemptRepo.ts`)

IPC:
- renderer calls `window.api.saveAttempt(attempt)` from `src/pages/Summary.tsx`
- analytics calls `window.api.listAttempts()` from `src/pages/Analytics.tsx`

Charts:
- analytics uses `recharts` line charts for WPM and Unproductive% over time.

---

## 8) Performance & debugging

### 8.1 Performance design rules
- Large file segmentation is off-thread (worker).
- Typing engine state is stored in refs; React state holds only small UI snapshots.
- UI updates are batched via `requestAnimationFrame`.
- Monaco dynamic decorations are constant-time (range-based, <= ~4 per frame).
- Static decorations (comment/skip dimming) are applied only on segment load or settings changes.

### 8.2 Debug overlay (optional)

Typing includes an optional “Debug: perf overlay” (Settings → “Show debug overlay”, or `Ctrl+Shift+D`):
- `lastKeyHandlingMs`: time spent processing the last key into the engine
- `lastDecorationUpdateMs`: time spent applying Monaco decorations
- `reactRenderCount`: render counter to spot accidental re-render loops
- `decorationCount`: number of dynamic decorations applied (should stay constant)
- `key→renderMs`: approximate latency from key processing to the next render

This overlay is meant for diagnosing input lag; it is **off by default**.

---

## 9) How to run (5-minute contributor quickstart)

Prerequisites:
- Node.js 22+
- npm 10+
- Windows 11 recommended (works on macOS/Linux too, but CI/release workflow is Windows-first)

Commands:
```bash
npm install
npm run dev
```

Tests:
```bash
npm run test
```

Build & package:
```bash
npm run build
```

Artifacts (Windows):
- `release/CodeTyping-Trainer-<version>/...`
- `win-unpacked` is renamed to `CodeTyping-Trainer-<version>-win-unpacked` by `build/afterAllArtifactBuild.cjs`.

---

## 10) Common issues

- **Windows path contains spaces**: this repo works with `C:\\...\\typing-trainer react-ts`; always quote paths in PowerShell.
- **Encoding issues (GBK/ANSI files)**: main process decodes via chardet + iconv; the detected encoding is shown in Typing header as `Enc <encoding>`.
- **Large file load**: segmentation is in a worker; if you still see delay, reduce `linesPerSegment` or `maxSegmentChars`.
- **Input method (IME)**: normal characters are consumed via `onInput`/composition events; avoid adding logic that only reads `keydown.key` for text input.
