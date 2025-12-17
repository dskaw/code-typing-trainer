import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import type { Attempt, OpenFileResult } from '../src/shared/types'
import { createJsonAttemptRepo } from '../src/storage/jsonAttemptRepo'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_TITLE = 'CodeTyping Trainer'

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let attemptRepo: ReturnType<typeof createJsonAttemptRepo> | null = null
let rendererHealthDialogOpen = false

async function promptReloadWindow(message: string, detail: string, buttons: string[]) {
  if (!win || rendererHealthDialogOpen) return
  rendererHealthDialogOpen = true
  try {
    const waitIndex = buttons.indexOf('Wait')
    const closeIndex = buttons.indexOf('Close')
    const cancelId = waitIndex >= 0 ? waitIndex : (closeIndex >= 0 ? closeIndex : buttons.length - 1)

    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Renderer Issue',
      message,
      detail,
      buttons,
      defaultId: 0,
      cancelId,
      noLink: true,
    })

    if (!win) return
    if (buttons[response] === 'Reload') {
      win.webContents.reload()
    } else if (buttons[response] === 'Close') {
      win.close()
    }
  } finally {
    rendererHealthDialogOpen = false
  }
}

function hasUtf8Bom(buffer: Uint8Array): boolean {
  return buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF
}

function normalizeDetectedEncoding(raw: string | null | undefined): string | null {
  if (!raw) return null
  const enc = raw.trim().toLowerCase()
  if (!enc) return null
  if (enc === 'utf-8' || enc === 'utf8') return 'utf8'
  if (enc === 'ascii') return 'utf8'
  if (enc === 'gbk' || enc === 'gb2312' || enc === 'gb18030' || enc === 'cp936' || enc === 'windows-936') return 'gb18030'
  if (enc === 'utf-16le' || enc === 'utf16le') return 'utf16-le'
  if (enc === 'utf-16be' || enc === 'utf16be') return 'utf16-be'
  return enc
}

function decodeTextFile(buffer: Uint8Array): { content: string; encoding: string } {
  if (hasUtf8Bom(buffer)) {
    const content = Buffer.from(buffer.subarray(3)).toString('utf8')
    return { content, encoding: 'utf8-bom' }
  }

  const detected = normalizeDetectedEncoding(chardet.detect(Buffer.from(buffer)))
  const encoding = detected && iconv.encodingExists(detected) ? detected : 'utf8'
  let content = iconv.decode(Buffer.from(buffer), encoding)
  if (content.length > 0 && content.charCodeAt(0) === 0xFEFF) content = content.slice(1)
  return { content, encoding }
}

async function openFileFromDialog(parentWindow?: BrowserWindow): Promise<OpenFileResult | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Open Text File',
    properties: ['openFile'],
    filters: [
      {
        name: 'Text / Code',
        extensions: [
          'txt',
          'md',
          'c',
          'cpp',
          'h',
          'hpp',
          'java',
          'py',
          'js',
          'ts',
          'tsx',
          'json',
          'html',
          'css',
          'rs',
          'go',
          'php',
          'rb',
          'sh',
          'bat',
          'ps1',
          'yaml',
          'yml',
          'toml',
          'ini',
          'log',
        ],
      },
      { name: 'All Files', extensions: ['*'] },
    ],
  }

  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]
  const fileName = path.basename(filePath)

  const buffer = await fs.readFile(filePath)
  const { content, encoding } = decodeTextFile(buffer)

  return { filePath, fileName, content, encoding }
}

function setAppMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const focused = BrowserWindow.getFocusedWindow() ?? win ?? undefined
            try {
              const opened = await openFileFromDialog(focused)
              if (opened && win) {
                win.webContents.send('app:file-opened', opened)
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              dialog.showErrorBox('Open File Failed', message)
            }
          },
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  win = new BrowserWindow({
    title: APP_TITLE,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setTitle(APP_TITLE)

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.setTitle(APP_TITLE)
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  win.webContents.on('unresponsive', () => {
    void promptReloadWindow(
      'The window is not responding.',
      'You can wait for it to recover, or reload the UI.',
      ['Wait', 'Reload'],
    )
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    void promptReloadWindow(
      'The renderer process exited unexpectedly.',
      `Reason: ${details.reason} (exitCode: ${details.exitCode})`,
      ['Reload', 'Close'],
    )
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  attemptRepo = createJsonAttemptRepo(path.join(app.getPath('userData'), 'attempts.json'))

  ipcMain.handle('app:openFile', async () => {
    const focused = BrowserWindow.getFocusedWindow() ?? win ?? undefined
    return await openFileFromDialog(focused)
  })

  ipcMain.handle('app:saveAttempt', async (_event, attempt: Attempt) => {
    await attemptRepo?.add(attempt)
  })

  ipcMain.handle('app:listAttempts', async () => {
    return await attemptRepo?.list() ?? []
  })

  setAppMenu()
  createWindow()
})
