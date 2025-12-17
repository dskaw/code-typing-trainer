/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  api: {
    openFile: () => Promise<import('../src/shared/types').OpenFileResult | null>
    onFileOpened: (callback: (payload: import('../src/shared/types').OpenFileResult) => void) => () => void
    saveAttempt: (attempt: import('../src/shared/types').Attempt) => Promise<void>
    listAttempts: () => Promise<import('../src/shared/types').Attempt[]>
  }
}
