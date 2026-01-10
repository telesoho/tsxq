
export interface IElectronAPI {
  loadPreferences: () => Promise<void>,
}

declare global {
  interface Window {
    electron: any
    api: {
      startEngine: () => Promise<boolean>
      sendToEngine: (command: string) => Promise<void>
      onEngineInfo: (callback: (info: any) => void) => () => void
      onBestMove: (callback: (move: string) => void) => () => void
      onEngineStatus: (callback: (status: string) => void) => () => void
      getScreenSources: () => Promise<any[]>
      predictBoard: (imageBase64: string) => Promise<{ fen: string, layout: string }>
    }
  }
}
