/// <reference types="vite/client" />

interface Window {
  electron: any
  api: {
    startEngine: () => Promise<boolean>
    sendToEngine: (command: string) => Promise<void>
    onEngineInfo: (callback: (info: any) => void) => () => void
    onBestMove: (callback: (move: string) => void) => () => void
    onEngineStatus: (callback: (status: string) => void) => () => void
    getScreenSources: () => Promise<any[]>
  }
}
