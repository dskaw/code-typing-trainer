import { ipcRenderer, contextBridge } from 'electron'
import type { Attempt, OpenFileResult } from '../src/shared/types'

contextBridge.exposeInMainWorld('api', {
  openFile(): Promise<OpenFileResult | null> {
    return ipcRenderer.invoke('app:openFile')
  },
  onFileOpened(callback: (payload: OpenFileResult) => void) {
    const listener = (_event: Electron.IpcRendererEvent, payload: OpenFileResult) => callback(payload)
    ipcRenderer.on('app:file-opened', listener)
    return () => ipcRenderer.off('app:file-opened', listener)
  },
  saveAttempt(attempt: Attempt): Promise<void> {
    return ipcRenderer.invoke('app:saveAttempt', attempt)
  },
  listAttempts(): Promise<Attempt[]> {
    return ipcRenderer.invoke('app:listAttempts')
  },
})
