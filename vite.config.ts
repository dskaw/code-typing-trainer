import { defineConfig } from 'vite'
import path from 'node:path'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const require = createRequire(import.meta.url)
const electronPath: string = require('electron')

let electronProcess: ChildProcess | null = null

type ProcessWithElectronApp = NodeJS.Process & { electronApp?: ChildProcess }
const processWithElectronApp = process as ProcessWithElectronApp

function killProcessTree(pid: number) {
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' })
    } catch {
      // ignore (already exited, no permissions, etc.)
    }
    return
  }

  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // ignore
  }
}

function startElectron() {
  if (electronProcess?.pid) {
    electronProcess.removeAllListeners()
    killProcessTree(electronProcess.pid)
    electronProcess = null
  }

  const env = { ...process.env }
  // Some environments (including some tooling) set this for Node-mode Electron. We always want full Electron.
  delete env.ELECTRON_RUN_AS_NODE

  const child = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env,
  })

  electronProcess = child
  processWithElectronApp.electronApp = child

  child.once('exit', () => {
    if (processWithElectronApp.electronApp === child) {
      processWithElectronApp.electronApp = undefined
    }
    if (electronProcess === child) {
      electronProcess = null
    }
  })
}

process.once('exit', () => {
  if (electronProcess?.pid) {
    electronProcess.removeAllListeners()
    killProcessTree(electronProcess.pid)
  }
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['electron', 'electron/main', 'electron/renderer', 'electron/common'],
            },
          },
        },
        onstart() {
          startElectron()
        },
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            rollupOptions: {
              external: ['electron', 'electron/main', 'electron/renderer', 'electron/common'],
            },
          },
        },
        onstart({ reload }) {
          if (electronProcess) {
            reload()
          } else {
            startElectron()
          }
        },
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer: process.env.NODE_ENV === 'test'
        // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
        ? undefined
        : {},
    }),
  ],
})
